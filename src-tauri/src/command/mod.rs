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
) -> Result<LaunchedSession, String> {
    let cwd = PathBuf::from(project_dir);
    state.launch(app, backend, cwd, name).await
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
) -> Result<String, String> {
    state.switch_backend(app, &session_id, backend).await
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
