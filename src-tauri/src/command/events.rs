//! Tauri event payloads emitted to the Command frontend.
//!
//! Phase 1 forwards ACP `session/update` notifications as opaque
//! JSON. Phase 3 will normalise into typed content blocks (text
//! deltas, tool calls, permission requests).

use serde::Serialize;

use super::acp_spawn::BackendKind;
use super::sessions::SessionId;

pub const COMMAND_EVENT_NAME: &str = "command:session:update";
pub const COMMAND_A2A_EVENT_NAME: &str = "command:a2a:message";

#[derive(Serialize, Debug, Clone)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub enum CommandEvent {
    SessionCreated {
        session_id: SessionId,
        backend: BackendKind,
    },
    SessionUpdate {
        session_id: SessionId,
        raw: serde_json::Value,
    },
    SessionTerminated {
        session_id: SessionId,
        exit_code: Option<i32>,
    },
}

/// Agent-to-agent message — fired by the MCP server's send_message
/// tool (or the manual whisper UI) when one unit messages another.
/// Carries enough for the field to draw the signal arc and the
/// recipient's chat panel to surface the inbox card.
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct A2AMessageEvent {
    pub message_id: String,
    pub from_session_id: SessionId,
    pub from_name: String,
    pub to_session_id: SessionId,
    pub to_name: String,
    pub subject: Option<String>,
    pub body: String,
    pub created_at_ms: u64,
}
