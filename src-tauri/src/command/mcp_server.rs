//! Loopback MCP HTTP server hosting the A2A messaging tools.
//!
//! Phase 9 (spec §6). Binds to `127.0.0.1:<auto-port>` and accepts
//! JSON-RPC 2.0 POSTs at `/mcp/<meridian_session_id>`. Each ACP
//! wrapper auto-registers this URL via the `mcpServers` parameter
//! on `session/new`; the path segment tells the server which
//! session is the caller.
//!
//! Exposes two MCP tools:
//!
//!   - `send_message(to, body, subject?)` — routes a message into
//!     the recipient session's inbox and fires the
//!     `command:a2a:message` Tauri event so the frontend can draw
//!     the signal arc and surface the inbox card.
//!   - `list_agents()` — returns every live unit's id / name /
//!     backend so the calling agent can pick a recipient.
//!
//! Implementation: bare `tokio::net::TcpListener` + minimal HTTP/1.1
//! parsing. Mirrors `control_server.rs` so the app doesn't pull in
//! axum/hyper for a two-route surface.

use std::sync::{Arc, OnceLock};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use super::sessions::CommandState;

/// Set once during setup; lets the launch flow build per-session
/// MCP URLs without threading the bound port through every caller.
static MCP_BASE_URL: OnceLock<String> = OnceLock::new();

/// Pinned port so the MCP URL the wrapper persists with the
/// session (via `session/new`'s `mcpServers` config) survives
/// across Meridian restarts. A random port (`:0`) would change
/// on every launch and break agents that the wrapper restored
/// via `session/load` — their old URL would point at a dead
/// socket. Picked from the dynamic / private range; documented
/// here so the user can change it if it conflicts with something
/// else they run on loopback.
const MCP_PORT: u16 = 47101;

/// Returns the `/mcp/<session_id>` URL to register in the spawned
/// wrapper's `mcpServers` config. Returns `None` when the MCP
/// server hasn't started yet (port-bind failure during boot);
/// callers proceed without A2A in that case.
pub fn session_url(session_id: &str) -> Option<String> {
    MCP_BASE_URL
        .get()
        .map(|base| format!("{base}/mcp/{session_id}"))
}

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let bind_addr = format!("127.0.0.1:{MCP_PORT}");
        let listener = match TcpListener::bind(&bind_addr).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!(
                    "[mcp-server] could not bind {bind_addr}: {e}. \
                     A2A messaging disabled; resolved sessions may \
                     report 'MCP server disconnected'. Free the port \
                     and relaunch, or change MCP_PORT in mcp_server.rs."
                );
                return;
            }
        };
        let base = format!("http://{bind_addr}");
        eprintln!("[mcp-server] A2A MCP listening on {base}");
        let _ = MCP_BASE_URL.set(base);
        let app = Arc::new(app);
        loop {
            match listener.accept().await {
                Ok((stream, _addr)) => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = handle_conn(stream, app).await {
                            eprintln!("[mcp-server] connection error: {e}");
                        }
                    });
                }
                Err(e) => {
                    eprintln!("[mcp-server] accept failed: {e}");
                    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                }
            }
        }
    });
}

async fn handle_conn(mut stream: TcpStream, app: Arc<AppHandle>) -> std::io::Result<()> {
    // Read up to 256 KiB — agent message bodies can be larger than
    // navigate payloads, especially when attachments are inlined.
    let mut buf = Vec::with_capacity(8 * 1024);
    let mut tmp = vec![0u8; 16 * 1024];
    loop {
        let n = stream.read(&mut tmp).await?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&tmp[..n]);
        // Heuristic: once we've seen "\r\n\r\n" and have at least
        // Content-Length bytes after it, we're done.
        if let Some(body_start) = find_double_crlf(&buf) {
            let head = &buf[..body_start];
            let content_length = parse_content_length(head).unwrap_or(0);
            if buf.len() >= body_start + 4 + content_length {
                break;
            }
        }
        if buf.len() > 256 * 1024 {
            break; // sanity cap
        }
    }

    let text = String::from_utf8_lossy(&buf);
    let (head, body) = match text.find("\r\n\r\n") {
        Some(idx) => (&text[..idx], &text[idx + 4..]),
        None => (&*text, ""),
    };
    let mut head_lines = head.lines();
    let request_line = head_lines.next().unwrap_or("");
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("");

    let (status, body_out, ctype) = if method == "POST" {
        if let Some(session_id) = path.strip_prefix("/mcp/") {
            let reply = dispatch_jsonrpc(&app, session_id, body).await;
            let body_out = serde_json::to_string(&reply)
                .unwrap_or_else(|_| "{}".to_string());
            ("200 OK", body_out, "application/json")
        } else {
            ("404 Not Found", "{}".to_string(), "application/json")
        }
    } else if method == "GET" && path == "/health" {
        ("200 OK", "{\"ok\":true}".to_string(), "application/json")
    } else {
        ("404 Not Found", "{}".to_string(), "application/json")
    };

    let response = format!(
        "HTTP/1.1 {status}\r\n\
         Content-Type: {ctype}\r\n\
         Content-Length: {len}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Connection: close\r\n\
         \r\n\
         {body_out}",
        len = body_out.len()
    );
    stream.write_all(response.as_bytes()).await?;
    stream.flush().await?;
    stream.shutdown().await.ok();
    Ok(())
}

fn find_double_crlf(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n")
}

fn parse_content_length(head: &[u8]) -> Option<usize> {
    let s = std::str::from_utf8(head).ok()?;
    for line in s.split("\r\n") {
        let mut it = line.splitn(2, ':');
        let key = it.next()?.trim();
        let val = it.next()?.trim();
        if key.eq_ignore_ascii_case("content-length") {
            return val.parse().ok();
        }
    }
    None
}

// ── JSON-RPC dispatch ──────────────────────────────────────────────────

#[derive(Deserialize, Debug)]
struct JsonRpcRequest {
    #[serde(default)]
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Serialize, Debug)]
struct JsonRpcResponse {
    jsonrpc: &'static str,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Serialize, Debug)]
struct JsonRpcError {
    code: i64,
    message: String,
}

fn ok(id: Value, result: Value) -> JsonRpcResponse {
    JsonRpcResponse { jsonrpc: "2.0", id, result: Some(result), error: None }
}

fn err(id: Value, code: i64, message: impl Into<String>) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0",
        id,
        result: None,
        error: Some(JsonRpcError { code, message: message.into() }),
    }
}

async fn dispatch_jsonrpc(
    app: &AppHandle,
    sender_session_id: &str,
    body: &str,
) -> JsonRpcResponse {
    let req: JsonRpcRequest = match serde_json::from_str(body) {
        Ok(r) => r,
        Err(e) => {
            return err(Value::Null, -32700, format!("parse error: {e}"));
        }
    };
    let id = req.id.clone().unwrap_or(Value::Null);
    match req.method.as_str() {
        "initialize" => ok(
            id,
            json!({
                "protocolVersion": "2025-06-18",
                "capabilities": {
                    "tools": { "listChanged": false }
                },
                "serverInfo": {
                    "name": "meridian-a2a",
                    "version": "0.1.0"
                }
            }),
        ),
        "tools/list" => ok(id, json!({ "tools": tool_specs() })),
        "tools/call" => handle_tool_call(app, sender_session_id, id, req.params).await,
        // Notifications (no id, no response expected). MCP supports
        // notifications/initialized, etc. — accept silently.
        m if m.starts_with("notifications/") => {
            JsonRpcResponse { jsonrpc: "2.0", id, result: Some(Value::Null), error: None }
        }
        other => err(id, -32601, format!("unknown method: {other}")),
    }
}

fn tool_specs() -> Value {
    json!([
        {
            "name": "send_message",
            "description": "Send a message to another agent currently on the Meridian Command field. The recipient will see it as inbox context on their next turn. Use `list_agents` first to discover available recipients and their ids.",
            "inputSchema": {
                "type": "object",
                "required": ["to", "body"],
                "properties": {
                    "to": {
                        "type": "string",
                        "description": "Recipient agent id (preferred) or display name."
                    },
                    "subject": {
                        "type": "string",
                        "description": "Optional short subject line."
                    },
                    "body": {
                        "type": "string",
                        "description": "Message body. Keep it concise; the recipient gets it as system-prefix context."
                    }
                }
            }
        },
        {
            "name": "list_agents",
            "description": "List all live agents currently on the Meridian Command field with their ids, display names, and backends. Use the returned id with send_message.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "get_next_ticket",
            "description": "Fetch the next pending ticket from your grooming queue. Returns the ticket key, current field values, and a 'Ticket N of M' progress marker. When the queue is empty, returns a 'no more tickets' signal — stop calling this tool and send a one-paragraph summary of the batch. Tickets arrive one at a time; call `submit_grooming_recommendations` for each, then call this tool again.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "list_my_assigned_prs",
            "description": "Fetch the open Bitbucket PRs where the user is listed as a reviewer (status: review pending). Returns an enumerated list the user can pick from by number. Use this on launch in the PR Reviewer role, and re-call it any time the user asks for a fresh list (e.g. types `/prs`). Use the returned `prs[].id`, `branch`, `url`, etc. when the user selects a number.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "list_my_sprint_tickets",
            "description": "Fetch the JIRA tickets assigned to the user in the currently active sprint (ordered by priority). Returns an enumerated list the user can pick from by number. Use this on launch in the Implementer role, and re-call it any time the user asks for a fresh list (e.g. types `/tickets`). Use the returned `tickets[].key` with `get_jira_ticket` to pull full detail (description, acceptance criteria, etc.) once the user picks a number.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "get_jira_ticket",
            "description": "Fetch the full detail for a single JIRA ticket by its key (e.g. \"PROJ-1234\"). Returns description, structured description sections, acceptance criteria, steps to reproduce, observed / expected behaviour, story points, status, and any extra custom fields configured in the user's JIRA workspace. Use this after `list_my_sprint_tickets` once the user picks a ticket — the list call returns slimmer summaries, this returns everything you need to plan an implementation.",
            "inputSchema": {
                "type": "object",
                "required": ["key"],
                "properties": {
                    "key": {
                        "type": "string",
                        "description": "JIRA ticket key, e.g. \"PROJ-1234\"."
                    }
                }
            }
        },
        {
            "name": "submit_bug_report",
            "description": "Submit one bug report for the user to review in the Bugs tab. Call this once per distinct bug you find while hunting through a feature. The user reviews each report and decides whether to push it to JIRA — you don't open tickets yourself. After calling this, keep hunting; don't block waiting for review.",
            "inputSchema": {
                "type": "object",
                "required": ["summary", "description", "severity"],
                "properties": {
                    "summary": {
                        "type": "string",
                        "description": "One-line problem statement, JIRA-ready title."
                    },
                    "description": {
                        "type": "string",
                        "description": "What the bug is, why it's a bug, the failure mode you observed."
                    },
                    "observed_behavior": {
                        "type": "string",
                        "description": "What the code currently does. Optional."
                    },
                    "expected_behavior": {
                        "type": "string",
                        "description": "What it should do. Optional."
                    },
                    "steps_to_reproduce": {
                        "type": "string",
                        "description": "User-facing steps to reproduce. Leave empty when the bug isn't user-reachable / is purely structural."
                    },
                    "suspected_root_cause": {
                        "type": "string",
                        "description": "Best-guess explanation for why the bug exists. Optional."
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["critical", "high", "medium", "low"],
                        "description": "Severity of the bug."
                    },
                    "affected_files": {
                        "type": "array",
                        "description": "Files implicated in the bug. Each entry is { path, lineRange }.",
                        "items": {
                            "type": "object",
                            "required": ["path"],
                            "properties": {
                                "path": { "type": "string" },
                                "lineRange": { "type": "string", "description": "e.g. \"42-58\" or \"42\"." }
                            }
                        }
                    }
                }
            }
        },
        {
            "name": "submit_pr_comment_addressed",
            "description": "Address PR Tasks role: submit one report per review comment / task you've addressed locally. The user reviews each in the My PRs tab and pushes themselves — you must never push to the remote. Call this after committing the change locally (in the PR's dedicated worktree).",
            "inputSchema": {
                "type": "object",
                "required": ["pr", "comment_author", "original_text", "change_summary", "diff", "file_path"],
                "properties": {
                    "pr": {
                        "type": "object",
                        "required": ["prId", "title", "url", "branch"],
                        "properties": {
                            "prId":   { "type": "string" },
                            "title":  { "type": "string" },
                            "url":    { "type": "string", "description": "Bitbucket URL the user clicks to open the PR." },
                            "branch": { "type": "string" },
                            "jiraKey": { "type": "string", "description": "Optional JIRA ticket key extracted from branch/title." }
                        }
                    },
                    "worktree_path":     { "type": "string", "description": "Absolute path to the worktree you created for this PR." },
                    "comment_author":    { "type": "string", "description": "Author of the original PR comment." },
                    "original_text":     { "type": "string", "description": "Original comment / task text you addressed." },
                    "change_summary":    { "type": "string", "description": "One-line summary of what you changed." },
                    "diff":              { "type": "string", "description": "Unified diff of the change (the local commit)." },
                    "file_path":         { "type": "string", "description": "File the change landed in." },
                    "start_line":        { "type": "integer", "description": "1-based start line for 'Open in IDE'." }
                }
            }
        },
        {
            "name": "submit_pr_review_finding",
            "description": "PR Auto-Review role: submit one review finding for an assigned PR. Findings land in the Reviewed PRs tab grouped by `pr.prId`. Call once per distinct finding, then call `submit_pr_review_complete` when done with the PR.",
            "inputSchema": {
                "type": "object",
                "required": ["pr", "lens", "description", "severity", "file_path", "line_range", "snippet"],
                "properties": {
                    "pr": {
                        "type": "object",
                        "required": ["prId", "title", "url", "branch"],
                        "properties": {
                            "prId":   { "type": "string" },
                            "title":  { "type": "string" },
                            "url":    { "type": "string" },
                            "branch": { "type": "string" },
                            "jiraKey": { "type": "string" }
                        }
                    },
                    "worktree_path": { "type": "string" },
                    "lens":          { "type": "string", "description": "One of: acceptance, security, logic, testing, quality." },
                    "description":   { "type": "string" },
                    "severity":      { "type": "string", "enum": ["blocking", "non_blocking", "nitpick"] },
                    "file_path":     { "type": "string" },
                    "line_range":    { "type": "string", "description": "1-based, e.g. '42' or '42-58'." },
                    "snippet":       { "type": "string", "description": "5-10 lines of surrounding code." }
                }
            }
        },
        {
            "name": "submit_pr_review_complete",
            "description": "PR Auto-Review role: finalise the review of one PR. Call this after you've submitted all findings via `submit_pr_review_finding`. Updates the PR card in the Reviewed PRs tab with your recommendation + summary.",
            "inputSchema": {
                "type": "object",
                "required": ["pr_id", "recommendation", "summary"],
                "properties": {
                    "pr_id":          { "type": "string" },
                    "recommendation": { "type": "string", "enum": ["approve", "needs_review"] },
                    "summary":        { "type": "string", "description": "One-paragraph executive summary." }
                }
            }
        },
        {
            "name": "submit_grooming_recommendations",
            "description": "Submit a per-ticket grooming proposal for the user to review. Use this once per ticket after you've gathered enough context. The user reviews each suggested edit and decides whether to approve, edit, or decline before anything is pushed to JIRA. After calling this, move on to the next ticket — do not block waiting for the user to review.",
            "inputSchema": {
                "type": "object",
                "required": ["ticket_key", "ticket_summary", "ticket_type"],
                "properties": {
                    "ticket_key": {
                        "type": "string",
                        "description": "JIRA ticket key, e.g. \"PROJ-1234\"."
                    },
                    "ticket_summary": {
                        "type": "string",
                        "description": "The ticket's current summary line."
                    },
                    "ticket_type": {
                        "type": "string",
                        "description": "One of story / task / bug / spike / epic / subtask / feature / chore."
                    },
                    "suggested_edits": {
                        "type": "array",
                        "description": "Per-field suggested changes. Empty when the agent has no concrete edits but still wants to surface clarifying questions or grooming notes.",
                        "items": {
                            "type": "object",
                            "required": ["id", "field", "section", "suggested", "reasoning"],
                            "properties": {
                                "id":        { "type": "string" },
                                "field":     { "type": "string", "description": "One of: description, acceptance_criteria, steps_to_reproduce, observed_behavior, expected_behavior, summary." },
                                "section":   { "type": "string" },
                                "current":   { "type": ["string", "null"] },
                                "suggested": { "type": "string" },
                                "reasoning": { "type": "string" }
                            }
                        }
                    },
                    "clarifying_questions": {
                        "type": "array",
                        "items": { "type": "string" }
                    },
                    "grooming_notes": { "type": "string" }
                }
            }
        }
    ])
}

async fn handle_tool_call(
    app: &AppHandle,
    sender_session_id: &str,
    id: Value,
    params: Value,
) -> JsonRpcResponse {
    let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let arguments = params.get("arguments").cloned().unwrap_or(Value::Null);
    let state = match app.try_state::<CommandState>() {
        Some(s) => s,
        None => return err(id, -32603, "command state not initialised"),
    };
    match name {
        "list_agents" => {
            // Filter out the caller — agents asking this tool want
            // to know who they can message, and they already know
            // who they are. Saves context and removes the
            // self-message footgun.
            let agents: Vec<_> = state
                .list_agents()
                .await
                .into_iter()
                .filter(|a| a.session_id != sender_session_id)
                .collect();
            let agents_json = serde_json::to_value(&agents).unwrap_or(Value::Null);
            let summary = if agents.is_empty() {
                "No other agents are on the field right now.".to_string()
            } else {
                format!(
                    "{} other agent(s) on the field:\n{}",
                    agents.len(),
                    agents
                        .iter()
                        .map(|a| format!(
                            "  • {} (id={}, backend={})",
                            a.name, a.session_id, a.backend.as_str()
                        ))
                        .collect::<Vec<_>>()
                        .join("\n"),
                )
            };
            ok(
                id,
                json!({
                    "content": [
                        { "type": "text", "text": summary },
                        { "type": "text", "text": serde_json::to_string_pretty(&agents_json).unwrap_or_default() }
                    ]
                }),
            )
        }
        "send_message" => {
            let to = arguments
                .get("to")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let body = arguments
                .get("body")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let subject = arguments
                .get("subject")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            if to.is_empty() || body.is_empty() {
                return err(id, -32602, "missing `to` or `body`");
            }
            let resolved = state.resolve_recipient(&to).await;
            let Some((to_id, to_name)) = resolved else {
                return ok(
                    id,
                    json!({
                        "isError": true,
                        "content": [{
                            "type": "text",
                            "text": format!("No agent matches '{to}'. Call list_agents first.")
                        }]
                    }),
                );
            };
            match state
                .send_message(app, sender_session_id, &to_id, subject, body)
                .await
            {
                Ok(event) => ok(
                    id,
                    json!({
                        "content": [{
                            "type": "text",
                            "text": format!(
                                "Delivered to {} ({}). They'll see it on their next turn.",
                                to_name, to_id
                            )
                        }],
                        "structuredContent": {
                            "messageId": event.message_id,
                            "to": event.to_session_id
                        }
                    }),
                ),
                Err(e) => err(id, -32000, format!("send_message failed: {e}")),
            }
        }
        "get_next_ticket" => {
            match state.pop_next_grooming_ticket(sender_session_id).await {
                Some((current, total, block)) => {
                    // ONE content block (some MCP clients drop later
                    // entries in a multi-block content array). The
                    // body is also mirrored into structuredContent
                    // so a client reading the structured channel
                    // never ends up with only the progress counter.
                    let combined =
                        format!("Ticket {current} of {total}.\n\n{block}");
                    ok(
                        id,
                        json!({
                            "content": [
                                { "type": "text", "text": combined }
                            ],
                            "structuredContent": {
                                "remaining": total - current,
                                "total": total,
                                "current": current,
                                "ticket": block
                            }
                        }),
                    )
                }
                None => ok(
                    id,
                    json!({
                        "content": [{
                            "type": "text",
                            "text": "No more tickets in the queue. Stop calling get_next_ticket and send a one-paragraph summary of the batch you just groomed."
                        }],
                        "structuredContent": { "remaining": 0, "done": true }
                    }),
                ),
            }
        }
        "list_my_assigned_prs" => {
            // Reuse the same Tauri command the React layer hits. It
            // returns Vec<BitbucketPr> from the configured workspace,
            // filtered to PRs where the user (matched by Atlassian
            // accountId) is a reviewer. If JIRA hasn't been validated
            // yet, the underlying call falls back to "all open PRs" —
            // not a fatal error here; we just label that fallback in
            // the user-facing text so the agent can flag it.
            match crate::commands::get_prs_for_review().await {
                Ok(prs) => {
                    if prs.is_empty() {
                        return ok(
                            id,
                            json!({
                                "content": [{
                                    "type": "text",
                                    "text": "You have no PRs assigned to you for review right now."
                                }],
                                "structuredContent": { "prs": [], "count": 0 }
                            }),
                        );
                    }
                    let mut lines = Vec::with_capacity(prs.len() + 1);
                    lines.push(format!(
                        "{} PR(s) assigned to you for review. Reply with the number you'd like reviewed.",
                        prs.len()
                    ));
                    lines.push(String::new());
                    for (idx, pr) in prs.iter().enumerate() {
                        let n = idx + 1;
                        let jira_tag = pr
                            .jira_issue_key
                            .as_deref()
                            .map(|k| format!("  ·  JIRA: {k}"))
                            .unwrap_or_default();
                        let draft_tag = if pr.draft { "  ·  DRAFT" } else { "" };
                        let changes_tag = if pr.changes_requested {
                            "  ·  changes requested"
                        } else {
                            ""
                        };
                        lines.push(format!(
                            "{n}. PR #{pr_id} — {title}{draft_tag}",
                            pr_id = pr.id,
                            title = pr.title,
                            draft_tag = draft_tag,
                        ));
                        lines.push(format!(
                            "   Branch: {src} → {dst}",
                            src = pr.source_branch,
                            dst = pr.destination_branch,
                        ));
                        lines.push(format!(
                            "   Author: {author}  ·  Comments: {c}, Tasks: {t}{changes}{jira}",
                            author = pr.author.display_name,
                            c = pr.comment_count,
                            t = pr.task_count,
                            changes = changes_tag,
                            jira = jira_tag,
                        ));
                        lines.push(format!("   URL: {}", pr.url));
                        lines.push(String::new());
                    }
                    let summary = lines.join("\n");
                    let prs_json = serde_json::to_value(&prs).unwrap_or(Value::Null);
                    ok(
                        id,
                        json!({
                            "content": [{ "type": "text", "text": summary }],
                            "structuredContent": {
                                "count": prs.len(),
                                "prs": prs_json
                            }
                        }),
                    )
                }
                Err(e) => ok(
                    id,
                    json!({
                        "isError": true,
                        "content": [{
                            "type": "text",
                            "text": format!("Failed to fetch assigned PRs: {e}. Check Bitbucket + JIRA credentials in Settings.")
                        }]
                    }),
                ),
            }
        }
        "list_my_sprint_tickets" => {
            // Issues assigned to the currently-authenticated user in
            // an open sprint, ordered by priority. Uses the same JIRA
            // command path the Sprint Dashboard hits. The slim payload
            // (no AC / steps_to_reproduce / extra custom fields) is
            // enough to enumerate; the agent calls `get_jira_ticket`
            // once the user picks a number to get the full body.
            match crate::commands::get_my_sprint_issues().await {
                Ok(issues) => {
                    if issues.is_empty() {
                        return ok(
                            id,
                            json!({
                                "content": [{
                                    "type": "text",
                                    "text": "You have no tickets assigned to you in the current sprint."
                                }],
                                "structuredContent": { "tickets": [], "count": 0 }
                            }),
                        );
                    }
                    let mut lines = Vec::with_capacity(issues.len() + 2);
                    lines.push(format!(
                        "{} ticket(s) assigned to you in the current sprint. Reply with the number you'd like to plan and implement.",
                        issues.len()
                    ));
                    lines.push(String::new());
                    for (idx, t) in issues.iter().enumerate() {
                        let n = idx + 1;
                        let points = t
                            .story_points
                            .map(|p| format!("  ·  {p} pts"))
                            .unwrap_or_default();
                        let epic = t
                            .epic_key
                            .as_deref()
                            .map(|k| format!("  ·  Epic: {k}"))
                            .unwrap_or_default();
                        lines.push(format!(
                            "{n}. [{type_}] {key} — {summary}",
                            type_ = t.issue_type,
                            key = t.key,
                            summary = t.summary,
                        ));
                        lines.push(format!(
                            "   Status: {status}{points}{epic}",
                            status = t.status,
                        ));
                        lines.push(format!("   URL: {}", t.url));
                        lines.push(String::new());
                    }
                    let summary = lines.join("\n");
                    let tickets_json = serde_json::to_value(&issues).unwrap_or(Value::Null);
                    ok(
                        id,
                        json!({
                            "content": [{ "type": "text", "text": summary }],
                            "structuredContent": {
                                "count": issues.len(),
                                "tickets": tickets_json
                            }
                        }),
                    )
                }
                Err(e) => ok(
                    id,
                    json!({
                        "isError": true,
                        "content": [{
                            "type": "text",
                            "text": format!("Failed to fetch sprint tickets: {e}. Check JIRA credentials and board configuration in Settings.")
                        }]
                    }),
                ),
            }
        }
        "get_jira_ticket" => {
            let key = arguments
                .get("key")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if key.is_empty() {
                return err(id, -32602, "missing `key`");
            }
            match crate::commands::get_issue(key.clone()).await {
                Ok(issue) => {
                    let issue_json = serde_json::to_value(&issue).unwrap_or(Value::Null);
                    let text = serde_json::to_string_pretty(&issue_json)
                        .unwrap_or_else(|_| "(failed to serialise ticket)".to_string());
                    ok(
                        id,
                        json!({
                            "content": [{
                                "type": "text",
                                "text": format!("Ticket {key} — full detail:\n\n{text}")
                            }],
                            "structuredContent": { "ticket": issue_json }
                        }),
                    )
                }
                Err(e) => ok(
                    id,
                    json!({
                        "isError": true,
                        "content": [{
                            "type": "text",
                            "text": format!("Failed to fetch ticket {key}: {e}")
                        }]
                    }),
                ),
            }
        }
        "submit_bug_report" => {
            use std::time::{SystemTime, UNIX_EPOCH};
            use tauri::Emitter;
            let summary = arguments
                .get("summary")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if summary.is_empty() {
                return err(id, -32602, "missing `summary`");
            }
            let description = arguments
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let observed = arguments
                .get("observed_behavior")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let expected = arguments
                .get("expected_behavior")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let steps = arguments
                .get("steps_to_reproduce")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let root_cause = arguments
                .get("suspected_root_cause")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            // Severity comes in lower-cased per the schema enum;
            // accept anything but default to "medium" if blank.
            let severity = arguments
                .get("severity")
                .and_then(|v| v.as_str())
                .map(|s| s.to_lowercase())
                .filter(|s| {
                    matches!(s.as_str(), "critical" | "high" | "medium" | "low")
                })
                .unwrap_or_else(|| "medium".to_string());
            let affected_files = arguments
                .get("affected_files")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();

            let now_us = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_micros())
                .unwrap_or(0);
            let report_id = format!("bug-{}-{}", sender_session_id, now_us);
            let created_at_ms = (now_us / 1_000) as u64;

            let event = super::events::BugReportEvent {
                id: report_id.clone(),
                session_id: sender_session_id.to_string(),
                summary: summary.clone(),
                description,
                observed_behavior: observed,
                expected_behavior: expected,
                steps_to_reproduce: steps,
                severity,
                suspected_root_cause: root_cause,
                affected_files,
                created_at_ms,
            };
            if let Err(e) = app.emit(
                super::events::COMMAND_BUG_EVENT_NAME,
                event,
            ) {
                eprintln!("[mcp] failed to emit bug report: {e}");
            }
            ok(
                id,
                json!({
                    "content": [{
                        "type": "text",
                        "text": format!(
                            "Bug report filed: \"{summary}\". The user will review in the Bugs tab. Keep hunting."
                        )
                    }],
                    "structuredContent": { "reportId": report_id }
                }),
            )
        }
        "submit_pr_comment_addressed" => {
            use std::time::{SystemTime, UNIX_EPOCH};
            use tauri::Emitter;
            let pr_obj = match arguments.get("pr").and_then(|v| v.as_object()) {
                Some(o) => o,
                None => return err(id, -32602, "missing or invalid `pr`"),
            };
            let pr = super::events::PrRefPayload {
                pr_id: pr_obj
                    .get("prId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                title: pr_obj
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                url: pr_obj
                    .get("url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                branch: pr_obj
                    .get("branch")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                jira_key: pr_obj
                    .get("jiraKey")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            };
            if pr.pr_id.is_empty() {
                return err(id, -32602, "missing `pr.prId`");
            }
            let now_us = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_micros())
                .unwrap_or(0);
            let comment_id =
                format!("addr-{}-{}-{}", sender_session_id, pr.pr_id, now_us);
            let created_at_ms = (now_us / 1_000) as u64;
            let event = super::events::PrCommentAddressedEvent {
                id: comment_id.clone(),
                session_id: sender_session_id.to_string(),
                pr,
                worktree_path: arguments
                    .get("worktree_path")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                comment_author: arguments
                    .get("comment_author")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                original_text: arguments
                    .get("original_text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                change_summary: arguments
                    .get("change_summary")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                diff: arguments
                    .get("diff")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                file_path: arguments
                    .get("file_path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                start_line: arguments
                    .get("start_line")
                    .and_then(|v| v.as_u64())
                    .map(|n| n as u32),
                created_at_ms,
            };
            if let Err(e) = app.emit(
                super::events::COMMAND_PR_COMMENT_EVENT_NAME,
                event,
            ) {
                eprintln!("[mcp] failed to emit pr comment: {e}");
            }
            ok(
                id,
                json!({
                    "content": [{ "type": "text", "text": "Comment addressing recorded. The user reviews in the My PRs tab and pushes locally — do NOT push." }],
                    "structuredContent": { "commentId": comment_id }
                }),
            )
        }
        "submit_pr_review_finding" => {
            use std::time::{SystemTime, UNIX_EPOCH};
            use tauri::Emitter;
            let pr_obj = match arguments.get("pr").and_then(|v| v.as_object()) {
                Some(o) => o,
                None => return err(id, -32602, "missing or invalid `pr`"),
            };
            let pr = super::events::PrRefPayload {
                pr_id: pr_obj
                    .get("prId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                title: pr_obj
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                url: pr_obj
                    .get("url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                branch: pr_obj
                    .get("branch")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                jira_key: pr_obj
                    .get("jiraKey")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
            };
            if pr.pr_id.is_empty() {
                return err(id, -32602, "missing `pr.prId`");
            }
            let severity = arguments
                .get("severity")
                .and_then(|v| v.as_str())
                .map(|s| s.to_lowercase().replace('-', "_"))
                .filter(|s| {
                    matches!(s.as_str(), "blocking" | "non_blocking" | "nitpick")
                })
                .unwrap_or_else(|| "non_blocking".to_string());
            let now_us = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_micros())
                .unwrap_or(0);
            let finding_id =
                format!("find-{}-{}-{}", sender_session_id, pr.pr_id, now_us);
            let created_at_ms = (now_us / 1_000) as u64;
            let event = super::events::PrReviewFindingEvent {
                id: finding_id.clone(),
                session_id: sender_session_id.to_string(),
                pr,
                worktree_path: arguments
                    .get("worktree_path")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                lens: arguments
                    .get("lens")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                description: arguments
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                severity,
                file_path: arguments
                    .get("file_path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                line_range: arguments
                    .get("line_range")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                snippet: arguments
                    .get("snippet")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                created_at_ms,
            };
            if let Err(e) = app.emit(
                super::events::COMMAND_PR_FINDING_EVENT_NAME,
                event,
            ) {
                eprintln!("[mcp] failed to emit pr finding: {e}");
            }
            ok(
                id,
                json!({
                    "content": [{ "type": "text", "text": "Finding recorded. Continue reviewing; call submit_pr_review_complete when done with this PR." }],
                    "structuredContent": { "findingId": finding_id }
                }),
            )
        }
        "submit_pr_review_complete" => {
            use tauri::Emitter;
            let pr_id = arguments
                .get("pr_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if pr_id.is_empty() {
                return err(id, -32602, "missing `pr_id`");
            }
            let recommendation = arguments
                .get("recommendation")
                .and_then(|v| v.as_str())
                .map(|s| s.to_lowercase().replace('-', "_").replace(' ', "_"))
                .filter(|s| matches!(s.as_str(), "approve" | "needs_review"))
                .unwrap_or_else(|| "needs_review".to_string());
            let summary = arguments
                .get("summary")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let event = super::events::PrReviewCompleteEvent {
                session_id: sender_session_id.to_string(),
                pr_id: pr_id.clone(),
                recommendation,
                summary,
            };
            if let Err(e) = app.emit(
                super::events::COMMAND_PR_REVIEW_COMPLETE_EVENT_NAME,
                event,
            ) {
                eprintln!("[mcp] failed to emit pr review complete: {e}");
            }
            ok(
                id,
                json!({
                    "content": [{ "type": "text", "text": format!("Review of PR {pr_id} finalised. User will see your recommendation in the Reviewed PRs tab.") }]
                }),
            )
        }
        "submit_grooming_recommendations" => {
            use std::time::{SystemTime, UNIX_EPOCH};
            use tauri::Emitter;
            let ticket_key = arguments
                .get("ticket_key")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let ticket_summary = arguments
                .get("ticket_summary")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let ticket_type = arguments
                .get("ticket_type")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            if ticket_key.is_empty() {
                return err(id, -32602, "missing `ticket_key`");
            }
            let suggested_edits = arguments
                .get("suggested_edits")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let clarifying_questions = arguments
                .get("clarifying_questions")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let grooming_notes = arguments
                .get("grooming_notes")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let now_us = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_micros())
                .unwrap_or(0);
            let proposal_id = format!(
                "groom-{}-{}",
                ticket_key.replace('/', "_"),
                now_us,
            );
            let created_at_ms = (now_us / 1_000) as u64;

            let event = super::events::GroomingProposalEvent {
                id: proposal_id.clone(),
                session_id: sender_session_id.to_string(),
                ticket_key: ticket_key.clone(),
                ticket_summary,
                ticket_type,
                suggested_edits,
                clarifying_questions,
                grooming_notes,
                created_at_ms,
            };
            if let Err(e) = app.emit(
                super::events::COMMAND_GROOMING_EVENT_NAME,
                event,
            ) {
                eprintln!("[mcp] failed to emit grooming proposal: {e}");
            }
            ok(
                id,
                json!({
                    "content": [{
                        "type": "text",
                        "text": format!(
                            "Recommendations queued for {ticket_key}. The user will review per-field. Move on to the next ticket."
                        )
                    }],
                    "structuredContent": { "proposalId": proposal_id }
                }),
            )
        }
        other => err(id, -32601, format!("unknown tool: {other}")),
    }
}
