//! Command — multi-agent ACP workflow.
//!
//! See `docs/SPEC-COMMAND.md` for the v1 scope. Phase 1 (this
//! module) ships:
//!
//! - `acp_client` — generic ACP JSON-RPC client over stdio
//! - `acp_spawn` — per-backend launch configs (claude via Zed's
//!   wrapper, gemini --acp native, codex deferred)
//! - `sessions` — in-memory `CommandState` registry
//! - `events` — Tauri event payload definitions
//!
//! Two Tauri commands are exposed for the dev smoke test. They're
//! gated behind `debug_assertions`/`command-smoke` so release
//! builds don't carry them. Phase 4 replaces them with real
//! commands (`command_launch_unit`, `command_send_prompt`, …)
//! once the Command screen scaffolding lands.

pub mod acp_client;
pub mod acp_spawn;
pub mod events;
pub mod mcp_server;
pub mod sessions;
pub mod storage;

use std::path::PathBuf;

use tauri::AppHandle;

use self::acp_spawn::BackendKind;
use self::sessions::{CommandState, LaunchedSession, SessionId, SessionSummary};
use self::storage::{ArchiveSearchHit, StoredMessage, StoredSession};

#[tauri::command]
pub async fn command_smoke_launch(
    app: AppHandle,
    state: tauri::State<'_, CommandState>,
    backend: BackendKind,
    project_dir: String,
    name: String,
    extra_mcp_servers: Option<Vec<serde_json::Value>>,
    grooming_tickets: Option<Vec<String>>,
    model_override: Option<String>,
) -> Result<LaunchedSession, String> {
    let cwd = PathBuf::from(project_dir);
    state
        .launch(
            app,
            backend,
            cwd,
            name,
            extra_mcp_servers.unwrap_or_default(),
            grooming_tickets.unwrap_or_default(),
            model_override,
        )
        .await
}

#[tauri::command]
pub async fn command_drain_inbox(
    state: tauri::State<'_, CommandState>,
    session_id: SessionId,
) -> Result<Vec<events::A2AMessageEvent>, String> {
    Ok(state.drain_inbox(&session_id).await)
}

/// Manual whisper — frontend-driven A2A. Lets the user relay a
/// message from one of their units to another without the agent
/// invoking the send_message MCP tool. Useful for testing the
/// signal arc / inbox UI without depending on the agent doing it.
#[tauri::command]
pub async fn command_send_message(
    app: AppHandle,
    state: tauri::State<'_, CommandState>,
    from_session_id: SessionId,
    to_session_id: SessionId,
    subject: Option<String>,
    body: String,
) -> Result<events::A2AMessageEvent, String> {
    state
        .send_message(&app, &from_session_id, &to_session_id, subject, body)
        .await
}

#[tauri::command]
pub async fn command_smoke_prompt(
    state: tauri::State<'_, CommandState>,
    session_id: SessionId,
    prompt: String,
) -> Result<(), String> {
    state.prompt(&session_id, prompt).await
}

#[tauri::command]
pub async fn command_smoke_cancel(
    state: tauri::State<'_, CommandState>,
    session_id: SessionId,
) -> Result<(), String> {
    state.cancel(&session_id).await
}

#[tauri::command]
pub async fn command_smoke_kill(
    app: AppHandle,
    state: tauri::State<'_, CommandState>,
    session_id: SessionId,
) -> Result<(), String> {
    state.kill(app, &session_id).await
}


/// Launch the user's native CLI for `backend` in a new tab/window
/// of the user's preferred terminal (read from the
/// `pr_review_terminal` preference — same setting PR Review uses).
/// Defaults to iTerm2. macOS-only — `osascript` drives the
/// terminal app's AppleScript dictionary.
///
/// `args` lets callers append flags like `--resume <id>` so the
/// native CLI picks up the same session the user was running
/// inside Meridian. Args are shell-quoted so an arbitrary session
/// id can't break out of the cd-then-binary chain.
#[tauri::command]
pub fn command_open_in_native_app(
    binary: String,
    cwd: String,
    args: Option<Vec<String>>,
) -> Result<(), String> {
    let bin = binary.trim();
    if bin.is_empty() {
        return Err("binary name is required".into());
    }
    // Reject anything that looks shell-injectable. The mapping
    // from BackendKind to binary name happens on the frontend;
    // only the four known CLIs should ever land here.
    if !bin
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!("invalid binary name: {bin}"));
    }
    let cwd_trim = cwd.trim();
    if cwd_trim.is_empty() {
        return Err("project directory is required".into());
    }

    #[cfg(target_os = "macos")]
    {
        // Single-quote everything user-supplied for sh inside the
        // terminal. `shell_single_quote` returns 'value' with any
        // embedded single quotes safely closed-then-re-opened.
        let cwd_q = shell_single_quote(cwd_trim);
        let args_q = args
            .unwrap_or_default()
            .iter()
            .map(|a| shell_single_quote(a))
            .collect::<Vec<_>>()
            .join(" ");
        let cmd_line = if args_q.is_empty() {
            format!("cd {cwd_q} && {bin}")
        } else {
            format!("cd {cwd_q} && {bin} {args_q}")
        };

        // Resolve the terminal app (defaults to iTerm2) and
        // escape the resulting cmd_line for embedding in a
        // double-quoted AppleScript string.
        let terminal = crate::storage::preferences::get_pref("pr_review_terminal")
            .unwrap_or_else(|| "iTerm2".to_string());
        let terminal = terminal.trim().to_string();
        let cmd_line_as = applescript_escape_double_quoted(&cmd_line);

        let script = if terminal.eq_ignore_ascii_case("iterm2") {
            format!(
                r#"tell application "iTerm2"
    activate
    if (count of windows) > 0 then
        tell current window
            set newTab to (create tab with default profile)
            tell current session of newTab
                write text "{cmd_line_as}"
            end tell
        end tell
    else
        set newWindow to (create window with default profile)
        tell current session of newWindow
            write text "{cmd_line_as}"
        end tell
    end if
end tell"#
            )
        } else {
            // Terminal.app (and other apps using the same scripting
            // dictionary) — `do script` runs the command in a new
            // tab in the front window, or opens one if none exists.
            format!(
                r#"tell application "{terminal}"
    activate
    if (count of windows) > 0 then
        do script "{cmd_line_as}" in front window
    else
        do script "{cmd_line_as}"
    end if
end tell"#
            )
        };

        let out = std::process::Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .map_err(|e| format!("failed to launch {terminal}: {e}"))?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            return Err(format!("{terminal} launch failed: {stderr}"));
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (cwd_trim, bin, args);
        Err("Open in native app is currently macOS-only".into())
    }
}


#[tauri::command]
pub async fn command_fetch_context7_prompt(
    library_id: String,
    topic: String,
    anchor_start: String,
    anchor_end: String,
) -> Result<String, String> {
    let lib = library_id.trim();
    if lib.is_empty() || !lib.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '/') {
        return Err(format!("invalid library id: {lib}"));
    }
    let base = format!("https://context7.com/api/v1/{lib}");
    let url = reqwest::Url::parse_with_params(
        &base,
        &[("topic", topic.as_str()), ("tokens", "2000")],
    )
    .map_err(|e| format!("invalid context7 url: {e}"))?;

    let resp = reqwest::Client::new()
        .get(url)
        .header("User-Agent", "Meridian/Command")
        .send()
        .await
        .map_err(|e| format!("context7 fetch failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("context7 returned {}", resp.status()));
    }
    let body = resp
        .text()
        .await
        .map_err(|e| format!("context7 body read failed: {e}"))?;

    extract_between(&body, &anchor_start, &anchor_end)
        .ok_or_else(|| "could not locate the prompt in context7 response".into())
}

/// Find the slice spanning `start` through the end of the line
/// containing `end`. Used to lift a known prompt out of context7's
/// markdown payload without depending on the surrounding code-fence
/// shape (which differs across snippets).
fn extract_between(body: &str, start: &str, end: &str) -> Option<String> {
    let from = body.find(start)?;
    let after = &body[from..];
    let end_at = after.find(end)?;
    // Run to the end of the line containing `end`, so the full
    // sentence is captured rather than truncating at the anchor.
    let trailing = &after[end_at..];
    let line_end = trailing.find('\n').unwrap_or(trailing.len());
    Some(after[..end_at + line_end].trim().to_string())
}


/// Filesystem-safe skill id: lowercase letters, digits, dashes;
/// no leading/trailing dashes, no path separators, capped at 64
/// chars. The CommanderSettings UI validates the same shape on
/// the frontend, but we enforce here as the security boundary
/// (the id becomes the filename).
fn is_valid_skill_id(id: &str) -> bool {
    if id.is_empty() || id.len() > 64 {
        return false;
    }
    if id.starts_with('-') || id.ends_with('-') {
        return false;
    }
    id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn skills_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "could not resolve $HOME".to_string())?;
    let dir = home.join(".meridian").join("command").join("skills");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("could not create {}: {e}", dir.display()))?;
    Ok(dir)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandSkill {
    pub id: String,
    pub body: String,
    pub updated_at_ms: u64,
}

/// List every saved skill in `~/.meridian/command/skills/`. Each
/// `<id>.md` becomes one entry; non-md files are ignored. Sorted
/// alphabetically so the CommanderSettings list stays stable.
#[tauri::command]
pub async fn command_list_skills() -> Result<Vec<CommandSkill>, String> {
    let dir = skills_dir()?;
    let mut skills: Vec<CommandSkill> = Vec::new();
    let entries = std::fs::read_dir(&dir)
        .map_err(|e| format!("read skills dir: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if !is_valid_skill_id(stem) {
            continue;
        }
        let body = std::fs::read_to_string(&path).unwrap_or_default();
        let updated_at_ms = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        skills.push(CommandSkill {
            id: stem.to_string(),
            body,
            updated_at_ms,
        });
    }
    skills.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(skills)
}

/// Create or update a skill file. The id is validated against
/// `is_valid_skill_id`; the body is written verbatim.
#[tauri::command]
pub async fn command_save_skill(id: String, body: String) -> Result<(), String> {
    if !is_valid_skill_id(&id) {
        return Err(format!(
            "invalid skill id `{id}` — use lowercase letters, digits, and dashes (≤64 chars)"
        ));
    }
    let dir = skills_dir()?;
    let path = dir.join(format!("{id}.md"));
    std::fs::write(&path, body)
        .map_err(|e| format!("write {}: {e}", path.display()))?;
    Ok(())
}

/// Remove a skill from disk. Idempotent — missing files are not
/// an error so the frontend can call this without a pre-check.
#[tauri::command]
pub async fn command_delete_skill(id: String) -> Result<(), String> {
    if !is_valid_skill_id(&id) {
        return Err(format!("invalid skill id `{id}`"));
    }
    let dir = skills_dir()?;
    let path = dir.join(format!("{id}.md"));
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("remove {}: {e}", path.display()))?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn shell_single_quote(input: &str) -> String {
    // POSIX single-quote escape: 'foo' stays as 'foo'; any embedded
    // single quote is closed, escaped, and re-opened — `it's` →
    // `'it'\''s'`. No interpretation, no shell injection vector.
    let mut out = String::with_capacity(input.len() + 2);
    out.push('\'');
    for ch in input.chars() {
        if ch == '\'' {
            out.push_str("'\\''");
        } else {
            out.push(ch);
        }
    }
    out.push('\'');
    out
}

#[cfg(target_os = "macos")]
fn applescript_escape_double_quoted(input: &str) -> String {
    // Escape backslashes + double quotes for a double-quoted
    // AppleScript string literal. Single quotes don't need escaping
    // here since they're not the delimiter.
    input.replace('\\', "\\\\").replace('"', "\\\"")
}

#[tauri::command]
pub async fn command_smoke_list(
    state: tauri::State<'_, CommandState>,
) -> Result<Vec<SessionSummary>, String> {
    Ok(state.list().await)
}

#[tauri::command]
pub async fn command_grant_permission(
    state: tauri::State<'_, CommandState>,
    session_id: SessionId,
    request_id: serde_json::Value,
    option_id: String,
) -> Result<(), String> {
    state
        .respond_permission(&session_id, request_id, option_id)
        .await
}

#[tauri::command]
pub fn command_save_session(session: StoredSession) -> Result<(), String> {
    storage::save_session(&session)
}

#[tauri::command]
pub fn command_save_message(message: StoredMessage) -> Result<(), String> {
    storage::save_message(&message)
}


#[tauri::command]
pub fn command_save_grooming_proposal(
    session_id: String,
    proposal_id: String,
    ticket_key: String,
    payload_json: String,
    created_at_ms: i64,
) -> Result<(), String> {
    storage::save_grooming_proposal(
        &session_id,
        &proposal_id,
        &ticket_key,
        &payload_json,
        created_at_ms,
    )
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredGroomingProposal {
    pub session_id: String,
    pub payload_json: String,
}

#[tauri::command]
pub fn command_list_grooming_proposals() -> Result<Vec<StoredGroomingProposal>, String> {
    let rows = storage::list_grooming_proposals()?;
    Ok(rows
        .into_iter()
        .map(|(session_id, payload_json)| StoredGroomingProposal {
            session_id,
            payload_json,
        })
        .collect())
}

#[tauri::command]
pub fn command_delete_grooming_proposal(proposal_id: String) -> Result<(), String> {
    storage::delete_grooming_proposal(&proposal_id)
}

#[tauri::command]
pub fn command_list_sessions() -> Result<Vec<StoredSession>, String> {
    storage::list_active_sessions()
}

#[tauri::command]
pub fn command_list_messages(session_id: String) -> Result<Vec<StoredMessage>, String> {
    storage::list_messages_for(&session_id)
}

#[tauri::command]
pub fn command_archive_session(session_id: String) -> Result<(), String> {
    storage::archive_session(&session_id)
}

#[tauri::command]
pub fn command_delete_session(session_id: String) -> Result<(), String> {
    storage::delete_session(&session_id)
}

#[tauri::command]
pub async fn command_resume_session(
    app: AppHandle,
    state: tauri::State<'_, CommandState>,
    session_id: SessionId,
) -> Result<(), String> {
    state.resume(app, &session_id).await
}

#[tauri::command]
pub async fn command_switch_backend(
    app: AppHandle,
    state: tauri::State<'_, CommandState>,
    session_id: SessionId,
    backend: BackendKind,
    extra_mcp_servers: Option<Vec<serde_json::Value>>,
    model_override: Option<String>,
) -> Result<String, String> {
    state
        .switch_backend(
            app,
            &session_id,
            backend,
            extra_mcp_servers.unwrap_or_default(),
            model_override,
        )
        .await
}

#[tauri::command]
pub fn command_list_archived_sessions() -> Result<Vec<StoredSession>, String> {
    storage::list_archived_sessions()
}

#[tauri::command]
pub fn command_search_archive(
    query: String,
    limit: Option<i64>,
) -> Result<Vec<ArchiveSearchHit>, String> {
    storage::search_archive(&query, limit.unwrap_or(40))
}

#[tauri::command]
pub fn command_unarchive_session(session_id: String) -> Result<(), String> {
    storage::unarchive_session(&session_id)
}
