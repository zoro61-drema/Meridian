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

pub const COMMAND_GROOMING_EVENT_NAME: &str = "command:grooming:proposal";
pub const COMMAND_BUG_EVENT_NAME: &str = "command:bug:report";
pub const COMMAND_PR_COMMENT_EVENT_NAME: &str = "command:pr:comment-addressed";
pub const COMMAND_PR_FINDING_EVENT_NAME: &str = "command:pr:review-finding";
pub const COMMAND_PR_REVIEW_COMPLETE_EVENT_NAME: &str =
    "command:pr:review-complete";

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroomingProposalEvent {
    pub id: String,
    pub session_id: String,
    pub ticket_key: String,
    pub ticket_summary: String,
    pub ticket_type: String,
    pub suggested_edits: Vec<serde_json::Value>,
    pub clarifying_questions: Vec<String>,
    pub grooming_notes: String,
    pub created_at_ms: u64,
}

/// PR reference embedded in both PR-related events. Mirrored 1:1
/// in the TypeScript `PrRef` type.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrRefPayload {
    pub pr_id: String,
    pub title: String,
    pub url: String,
    pub branch: String,
    pub jira_key: Option<String>,
}

/// Emitted by the Address PR Tasks role each time the agent
/// addresses one review comment / task on a PR. Lands in the My
/// PRs tab grouped by `pr_id`.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrCommentAddressedEvent {
    pub id: String,
    pub session_id: String,
    pub pr: PrRefPayload,
    pub worktree_path: Option<String>,
    pub comment_author: String,
    pub original_text: String,
    pub change_summary: String,
    pub diff: String,
    pub file_path: String,
    pub start_line: Option<u32>,
    pub created_at_ms: u64,
}

/// Emitted by the PR Auto-Review role per finding. Lands in the
/// Reviewed PRs tab grouped by `pr_id`.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrReviewFindingEvent {
    pub id: String,
    pub session_id: String,
    pub pr: PrRefPayload,
    pub worktree_path: Option<String>,
    pub lens: String,
    pub description: String,
    /// `blocking` | `non_blocking` | `nitpick`.
    pub severity: String,
    pub file_path: String,
    pub line_range: String,
    pub snippet: String,
    pub created_at_ms: u64,
}

/// Emitted by the PR Auto-Review role when it finalises its review
/// of one PR. Updates the existing reviewed-PR card with the
/// agent's overall recommendation + executive summary.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrReviewCompleteEvent {
    pub session_id: String,
    pub pr_id: String,
    /// `approve` | `needs_review`.
    pub recommendation: String,
    pub summary: String,
}

/// Bug report emitted by the Bug Hunter role's `submit_bug_report`
/// MCP tool. Each call queues one report on the unit; the user
/// reviews them in the Bugs tab and decides which to push to JIRA.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BugReportEvent {
    pub id: String,
    pub session_id: String,
    pub summary: String,
    pub description: String,
    pub observed_behavior: String,
    pub expected_behavior: String,
    /// Optional — empty when the bug isn't user-reachable.
    pub steps_to_reproduce: String,
    /// `severity` ∈ {critical, high, medium, low}. Not enum-typed
    /// here to keep deserialisation forgiving of LLM creativity;
    /// the TS listener validates + clamps to the union.
    pub severity: String,
    /// Best-guess explanation for why the bug exists. Optional.
    pub suspected_root_cause: String,
    /// File-and-line pointers the agent flagged. Each entry is
    /// `{ path: string, lineRange: string }`; loose JSON for the
    /// same forgiveness reason as `severity`.
    pub affected_files: Vec<serde_json::Value>,
    pub created_at_ms: u64,
}

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
