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
