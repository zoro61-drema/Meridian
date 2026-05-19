//! Per-backend launch configs for ACP-speaking child processes.
//!
//! Phase 0 verification (2026-05-15):
//!
//! - **Claude Code 2.1.114** — `claude --acp` errors "unknown
//!   option". We spawn `@agentclientprotocol/claude-agent-acp`
//!   (Apache-licensed Node adapter, renamed 2026-05 from
//!   `@zed-industries/claude-code-acp`) instead. Live handshake
//!   verified against version 0.34.0: returns `protocolVersion: 1`
//!   plus full agentCapabilities (prompt image/embeddedContext,
//!   MCP http+sse, session fork/list/resume).
//! - **Gemini CLI** — `--acp` confirmed in `gemini --help`.
//!   Native ACP server mode.
//! - **Codex CLI** — no native `--acp`. Phase 5 spawns
//!   `@zed-industries/codex-acp` (Apache-licensed Node adapter)
//!   instead, same pattern as Claude. The wrapper requires the
//!   user to be authenticated; supported methods are ChatGPT
//!   login (interactive via `codex login`), `CODEX_API_KEY`, or
//!   `OPENAI_API_KEY`. The wrapper surfaces "Authentication
//!   required" as a `-32000` error on `session/new` when none is
//!   present — the launch path translates that to a friendlier
//!   message.
//! - **Qwen Code CLI** (`@qwen-code/qwen-code`) — native `--acp`
//!   confirmed in `qwen --help`. Same shape as Gemini's native
//!   ACP. Requires the user to have run `qwen` once interactively
//!   to set up auth (qwen-oauth / openai / anthropic / gemini /
//!   vertex-ai per `--auth-type`).

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BackendKind {
    ClaudeAcp,
    GeminiAcp,
    CodexAcp,
    QwenAcp,
}

impl BackendKind {
    pub fn as_str(self) -> &'static str {
        match self {
            BackendKind::ClaudeAcp => "claude-acp",
            BackendKind::GeminiAcp => "gemini-acp",
            BackendKind::CodexAcp => "codex-acp",
            BackendKind::QwenAcp => "qwen-acp",
        }
    }
}

#[derive(Debug, Clone)]
pub struct AcpLaunchConfig {
    pub binary: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub cwd: PathBuf,
}

pub fn launch_config(
    kind: BackendKind,
    cwd: PathBuf,
    model_override: Option<&str>,
) -> Result<AcpLaunchConfig, String> {
    // Per-backend env-var convention. Each CLI honors a different
    // variable for its default model; the wrapper inherits the env
    // it was spawned with, so setting these here propagates through
    // to the actual model that handles the agent's prompts.
    let env = build_model_env(kind, model_override);
    match kind {
        BackendKind::ClaudeAcp => Ok(AcpLaunchConfig {
            binary: "npx".to_string(),
            args: vec![
                "--yes".to_string(),
                "@agentclientprotocol/claude-agent-acp".to_string(),
            ],
            env,
            cwd,
        }),
        BackendKind::GeminiAcp => Ok(AcpLaunchConfig {
            binary: "gemini".to_string(),
            args: vec!["--acp".to_string()],
            env,
            cwd,
        }),
        BackendKind::CodexAcp => Ok(AcpLaunchConfig {
            binary: "npx".to_string(),
            args: vec![
                "--yes".to_string(),
                "@zed-industries/codex-acp".to_string(),
            ],
            env,
            cwd,
        }),
        BackendKind::QwenAcp => Ok(AcpLaunchConfig {
            binary: "qwen".to_string(),
            args: vec!["--acp".to_string()],
            env,
            cwd,
        }),
    }
}

fn build_model_env(
    kind: BackendKind,
    model_override: Option<&str>,
) -> HashMap<String, String> {
    let mut env = HashMap::new();
    if let Some(model) = model_override.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let key = match kind {
            BackendKind::ClaudeAcp => "ANTHROPIC_MODEL",
            BackendKind::GeminiAcp => "GEMINI_MODEL",
            // Codex CLI reads OPENAI_MODEL for the default model;
            // CODEX_MODEL is an internal alias used in some forks.
            BackendKind::CodexAcp => "OPENAI_MODEL",
            BackendKind::QwenAcp => "QWEN_MODEL",
        };
        env.insert(key.to_string(), model.to_string());
    }
    // Codex CLI honours OPENAI_API_KEY (and CODEX_API_KEY) when set —
    // injecting it here lets the user pick the API-key auth path in
    // Settings → Codex and have the Commander ACP wrapper authenticate
    // without ever running `codex login`. CLI-delegation users have no
    // key stored, so the env var stays unset and the CLI falls back to
    // its own auth.
    if matches!(kind, BackendKind::CodexAcp) {
        if let Some(api_key) =
            crate::storage::credentials::get_credential("openai_api_key")
        {
            let trimmed = api_key.trim();
            if !trimmed.is_empty() {
                env.insert("OPENAI_API_KEY".to_string(), trimmed.to_string());
                env.insert("CODEX_API_KEY".to_string(), trimmed.to_string());
            }
        }
    }
    env
}
