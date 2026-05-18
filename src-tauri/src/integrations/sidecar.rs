// IPC bridge to the TypeScript sidecar.
//
// The sidecar runs the LLM workflows. Rust sends `workflow.start` requests
// over the sidecar's stdin and receives a stream of newline-delimited JSON
// events back over stdout. This module manages the sidecar process lifecycle,
// correlates concurrent workflow runs by id, and exposes a high-level
// `run_workflow` that drives a single run to its terminal `result`/`error`
// event while emitting intermediate progress to the Tauri frontend.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};
use tokio::process::{Child, ChildStdin, ChildStdout};
use tokio::sync::{mpsc, Mutex};

use crate::storage::preferences::{ai_debug_enabled, append_ai_debug_log_line};

const DEV_BUNDLE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../src-sidecar/dist/bundle.cjs"
);

// ── Script & node resolution ──────────────────────────────────────────────────

fn sidecar_node_modules_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    // Production: Tauri ships the sidecar's node_modules alongside bundle.cjs
    // in the app's resource dir.
    if let Ok(resource_dir) = app.path().resource_dir() {
        let prod = resource_dir.join("node_modules");
        if prod.exists() {
            return Some(prod);
        }
    }
    // Development: the sidecar's node_modules sits next to its source.
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src-sidecar/node_modules");
    if dev.exists() {
        return Some(dev);
    }
    None
}

fn find_sidecar_script(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;

    if let Ok(resource_dir) = app.path().resource_dir() {
        let prod = resource_dir.join("bundle.cjs");
        if prod.exists() {
            return Ok(prod);
        }
    }

    let dev = PathBuf::from(DEV_BUNDLE);
    if dev.exists() {
        return Ok(dev);
    }

    Err(format!(
        "Sidecar bundle not found. Run `pnpm bundle` inside src-sidecar/. \
         (checked resource dir and {DEV_BUNDLE})"
    ))
}

fn find_node_binary() -> Result<String, String> {
    let via_which = std::process::Command::new("which")
        .arg("node")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        });
    if let Some(path) = via_which {
        return Ok(path);
    }

    let candidates = [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
        "/usr/local/opt/node/bin/node",
    ];
    for c in &candidates {
        if std::path::Path::new(c).exists() {
            return Ok((*c).to_string());
        }
    }

    if let Some(home) = dirs::home_dir() {
        let nvm_base = home.join(".nvm/versions/node");
        if let Ok(entries) = std::fs::read_dir(&nvm_base) {
            let mut versions: Vec<_> = entries.flatten().filter(|e| e.path().is_dir()).collect();
            versions.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
            for entry in versions {
                let node = entry.path().join("bin/node");
                if node.exists() {
                    return Ok(node.to_string_lossy().into_owned());
                }
            }
        }
    }

    Err("Cannot find a Node.js binary. \
         Install Node.js via Homebrew (`brew install node`) or nvm."
        .to_string())
}

// ── Protocol types (mirror src-sidecar/src/protocol.ts) ───────────────────────

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "provider")]
#[serde(rename_all = "lowercase")]
pub enum ProviderCredentials {
    Anthropic(AnthropicCreds),
    Google(GoogleCreds),
    Ollama(OllamaCreds),
    Copilot(CopilotCreds),
    Codex(CodexCreds),
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "mode")]
pub enum AnthropicCreds {
    #[serde(rename = "api_key")]
    ApiKey {
        #[serde(rename = "apiKey")]
        api_key: String,
    },
    /// Delegation to the user's locally-installed Claude Code CLI.
    /// No credential payload — the CLI handles auth internally.
    #[serde(rename = "claude_code")]
    ClaudeCode,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "mode")]
pub enum GoogleCreds {
    #[serde(rename = "api_key")]
    ApiKey {
        #[serde(rename = "apiKey")]
        api_key: String,
    },
    /// Delegation to the user's locally-installed `@google/gemini-cli`.
    /// No credential payload — the CLI handles auth internally.
    #[serde(rename = "gemini_cli")]
    GeminiCli,
}

#[derive(Serialize, Clone, Debug)]
pub struct OllamaCreds {
    #[serde(rename = "baseUrl")]
    pub base_url: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "mode")]
pub enum CopilotCreds {
    /// Delegation to the user's locally-installed GitHub Copilot CLI.
    /// No credential payload — the CLI handles auth internally (the user
    /// signs in once via `copilot login` or sets COPILOT_GITHUB_TOKEN).
    #[serde(rename = "copilot_cli")]
    CopilotCli,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "mode")]
pub enum CodexCreds {
    /// Delegation to the user's locally-installed OpenAI Codex CLI.
    /// No credential payload — the CLI handles auth internally (the user
    /// signs in once via `codex login` against their ChatGPT account).
    #[serde(rename = "codex_cli")]
    CodexCli,
}

#[derive(Serialize, Clone, Debug)]
pub struct ModelSelection {
    pub provider: String,
    pub model: String,
    pub credentials: ProviderCredentials,
    /// Per-provider response-token ceiling. Resolved from the user's
    /// preferences (Settings → Models → "Max output tokens"). Skipped
    /// from JSON serialisation when None so the sidecar's adapter
    /// defaults stay in charge for unset values.
    #[serde(rename = "maxTokens", skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
}

#[derive(Serialize)]
struct WorkflowStartRequest<'a> {
    id: &'a str,
    #[serde(rename = "type")]
    msg_type: &'static str,
    workflow: &'a str,
    input: serde_json::Value,
    model: &'a ModelSelection,
    #[serde(rename = "worktreePath", skip_serializing_if = "Option::is_none")]
    worktree_path: Option<String>,
    /// Asks the sidecar to attach its AI-traffic capture handler so each
    /// model round-trip emits an `ai_traffic` event back to the frontend's
    /// debug panel. Skipped on the wire when false to keep ordinary runs
    /// uncluttered.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    debug: bool,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SidecarOutboundEvent {
    Progress {
        id: String,
        node: String,
        status: String,
        #[serde(default)]
        data: Option<serde_json::Value>,
    },
    Stream {
        id: String,
        node: String,
        delta: String,
    },
    Interrupt {
        id: String,
        #[serde(rename = "threadId")]
        thread_id: String,
        reason: String,
        #[serde(default)]
        payload: serde_json::Value,
    },
    Result {
        id: String,
        output: serde_json::Value,
        usage: SidecarUsage,
    },
    Error {
        id: String,
        message: String,
        #[serde(default)]
        cause: Option<serde_json::Value>,
    },
    AiTraffic {
        id: String,
        #[serde(flatten)]
        payload: serde_json::Value,
    },
}

#[derive(Deserialize, Debug, Clone, Serialize, Default)]
pub struct SidecarUsage {
    #[serde(rename = "inputTokens")]
    pub input_tokens: u64,
    #[serde(rename = "outputTokens")]
    pub output_tokens: u64,
    /// Anthropic prompt-cache breakdown (subset of `input_tokens`).
    /// Tokens billed at 1.25x because they wrote the cache. Optional —
    /// present only on workflows that opt into prompt caching; zero
    /// for the rest and for non-Anthropic providers.
    #[serde(
        rename = "cacheCreationInputTokens",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub cache_creation_input_tokens: Option<u64>,
    /// Anthropic prompt-cache breakdown (subset of `input_tokens`).
    /// Tokens billed at 0.1x because they came from a cache hit.
    #[serde(
        rename = "cacheReadInputTokens",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub cache_read_input_tokens: Option<u64>,
}

impl SidecarOutboundEvent {
    fn id(&self) -> &str {
        match self {
            Self::Progress { id, .. }
            | Self::Stream { id, .. }
            | Self::Interrupt { id, .. }
            | Self::Result { id, .. }
            | Self::Error { id, .. }
            | Self::AiTraffic { id, .. } => id,
        }
    }

    fn is_terminal(&self) -> bool {
        matches!(self, Self::Result { .. } | Self::Error { .. })
    }
}

// ── Process lifecycle ─────────────────────────────────────────────────────────

type PendingMap = Arc<Mutex<HashMap<String, mpsc::UnboundedSender<SidecarOutboundEvent>>>>;

struct SidecarProcess {
    stdin: Arc<Mutex<BufWriter<ChildStdin>>>,
    pending: PendingMap,
}

pub struct SidecarState(Arc<Mutex<Option<SidecarProcess>>>);

impl SidecarState {
    pub fn new() -> Self {
        SidecarState(Arc::new(Mutex::new(None)))
    }
}

fn new_request_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros() as u64;
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    format!("{ts:016x}{seq:016x}")
}

async fn ensure_sidecar(
    app: &tauri::AppHandle,
    state: &SidecarState,
) -> Result<(Arc<Mutex<BufWriter<ChildStdin>>>, PendingMap), String> {
    let mut guard = state.0.lock().await;
    if let Some(proc) = guard.as_ref() {
        return Ok((proc.stdin.clone(), proc.pending.clone()));
    }

    let node = find_node_binary()?;
    let script = find_sidecar_script(app)?;

    // The sidecar bundle externalises native modules so they aren't bundled
    // into the .cjs blob. Node must be able to resolve them from the
    // sidecar's node_modules, which lives alongside the bundle source in
    // dev (src-sidecar/) but is mirrored into the Tauri resource dir in
    // production. Set NODE_PATH so the runtime require() succeeds
    // regardless of where the script actually lives.
    let node_path = sidecar_node_modules_path(app);

    eprintln!(
        "[sidecar] spawning: {node} {} (NODE_PATH: {})",
        script.display(),
        node_path.as_ref().map(|p| p.display().to_string()).unwrap_or_else(|| "<unset>".to_string()),
    );

    let mut command = tokio::process::Command::new(&node);
    command
        .arg(&script)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit());
    if let Some(p) = &node_path {
        command.env("NODE_PATH", p);
    }
    let mut child: Child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar ({node}): {e}"))?;

    let stdin: ChildStdin = child.stdin.take().ok_or("No stdin on sidecar process")?;
    let stdout: ChildStdout = child.stdout.take().ok_or("No stdout on sidecar process")?;

    let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));
    let pending_reader = pending.clone();
    let pending_cleanup = pending.clone();
    let stdin_arc = Arc::new(Mutex::new(BufWriter::new(stdin)));

    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        loop {
            match lines.next_line().await {
                Ok(Some(line)) if !line.is_empty() => {
                    match serde_json::from_str::<SidecarOutboundEvent>(&line) {
                        Ok(event) => {
                            let id = event.id().to_owned();
                            let is_terminal = event.is_terminal();
                            {
                                let map = pending_reader.lock().await;
                                if let Some(tx) = map.get(&id) {
                                    let _ = tx.send(event);
                                }
                            }
                            if is_terminal {
                                pending_reader.lock().await.remove(&id);
                            }
                        }
                        Err(e) => {
                            eprintln!("[sidecar] parse error: {e} — {line}");
                        }
                    }
                }
                Ok(Some(_)) => {}
                Ok(None) | Err(_) => break,
            }
        }
        eprintln!("[sidecar] stdout EOF — notifying pending requests");
        let mut map = pending_cleanup.lock().await;
        for (id, tx) in map.drain() {
            let _ = tx.send(SidecarOutboundEvent::Error {
                id,
                message: "Sidecar process exited unexpectedly".to_string(),
                cause: None,
            });
        }
    });

    let state_arc = state.0.clone();
    tokio::spawn(async move {
        let _ = child.wait().await;
        eprintln!("[sidecar] child process exited");
        *state_arc.lock().await = None;
    });

    let proc = SidecarProcess {
        stdin: stdin_arc.clone(),
        pending: pending.clone(),
    };
    *guard = Some(proc);

    Ok((stdin_arc, pending))
}

// ── Public API ────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct WorkflowInterrupt {
    #[serde(rename = "threadId")]
    pub thread_id: String,
    pub reason: String,
    pub payload: serde_json::Value,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct WorkflowResult {
    /// Final output when the workflow completed. None when paused at an
    /// interrupt (workflows without interrupts always populate this).
    pub output: Option<serde_json::Value>,
    /// Set when the workflow paused at a human checkpoint. The frontend
    /// uses `thread_id` + the resume command to continue the run.
    pub interrupt: Option<WorkflowInterrupt>,
    pub usage: SidecarUsage,
}

impl WorkflowResult {
    fn from_output(output: serde_json::Value, usage: SidecarUsage) -> Self {
        Self {
            output: Some(output),
            interrupt: None,
            usage,
        }
    }

    fn from_interrupt(interrupt: WorkflowInterrupt, usage: SidecarUsage) -> Self {
        Self {
            output: None,
            interrupt: Some(interrupt),
            usage,
        }
    }
}

#[derive(Serialize)]
struct WorkflowCancelRequest<'a> {
    id: &'a str,
    #[serde(rename = "type")]
    msg_type: &'static str,
}

/// Cancel an in-flight workflow run. Aborts the AbortController in the
/// sidecar's `activeRuns` registry and removes the pending channel on the
/// Rust side so any further events from the (potentially still-running)
/// model call are discarded. The model call itself isn't guaranteed to
/// halt — LangChain providers don't all honour AbortSignal — but the
/// sidecar stops emitting events for the run once aborted, so the
/// frontend won't see any more output from this `run_id`. No-op if the
/// run already finished.
pub async fn cancel_workflow(
    state: &SidecarState,
    run_id: String,
) -> Result<(), String> {
    let stdin_arc = {
        let guard = state.0.lock().await;
        match guard.as_ref() {
            Some(p) => p.stdin.clone(),
            // Sidecar isn't running — nothing to cancel.
            None => return Ok(()),
        }
    };

    let req = WorkflowCancelRequest {
        id: &run_id,
        msg_type: "workflow.cancel",
    };
    let mut line = serde_json::to_string(&req).map_err(|e| format!("Serialize error: {e}"))?;
    line.push('\n');

    let mut w = stdin_arc.lock().await;
    w.write_all(line.as_bytes())
        .await
        .map_err(|e| format!("Stdin write error: {e}"))?;
    w.flush()
        .await
        .map_err(|e| format!("Stdin flush error: {e}"))?;
    Ok(())
}

/// Run a workflow to completion. Streams progress / stream-delta events to
/// `event_name` on the Tauri frontend; returns the final `result` payload or
/// the first `error`. Tool callback requests from the sidecar are dispatched
/// to the existing repo commands and answered over stdin.
pub async fn run_workflow(
    app: &tauri::AppHandle,
    state: &SidecarState,
    event_name: &str,
    workflow: &str,
    input: serde_json::Value,
    model: ModelSelection,
    worktree_path: Option<String>,
    run_id: Option<String>,
) -> Result<WorkflowResult, String> {
    let (stdin, pending) = ensure_sidecar(app, state).await?;

    // Caller-supplied runId lets the frontend track which run a stream of
    // Tauri events came from, so it can drop stale events from a prior
    // run that the user cancelled / rewound past.
    let id = run_id.unwrap_or_else(new_request_id);
    let (tx, mut rx) = mpsc::unbounded_channel::<SidecarOutboundEvent>();
    pending.lock().await.insert(id.clone(), tx);

    let req = WorkflowStartRequest {
        id: &id,
        msg_type: "workflow.start",
        workflow,
        input,
        model: &model,
        worktree_path,
        debug: ai_debug_enabled(),
    };
    let mut line = serde_json::to_string(&req).map_err(|e| format!("Serialize error: {e}"))?;
    line.push('\n');

    {
        let mut w = stdin.lock().await;
        w.write_all(line.as_bytes())
            .await
            .map_err(|e| format!("Stdin write error: {e}"))?;
        w.flush()
            .await
            .map_err(|e| format!("Stdin flush error: {e}"))?;
    }

    drive_workflow_loop(app, &pending, &id, event_name, &mut rx).await
}

async fn drive_workflow_loop(
    app: &tauri::AppHandle,
    pending: &PendingMap,
    id: &str,
    event_name: &str,
    rx: &mut mpsc::UnboundedReceiver<SidecarOutboundEvent>,
) -> Result<WorkflowResult, String> {
    while let Some(event) = rx.recv().await {
        match event {
            SidecarOutboundEvent::Progress {
                node,
                status,
                data,
                ..
            } => {
                // Rate-limit snapshots ride on the workflow's progress
                // channel (sidecar emits them as a side-effect of any
                // Anthropic OAuth response), but the consumer is a
                // global UI element (HeaderModelPicker bars). Mirror
                // them onto a dedicated channel so a single boot-time
                // listener catches updates regardless of which workflow
                // is in flight — without this, only stores that listen
                // on the originating workflow's channel see them.
                if let Some(rate_limits) =
                    data.as_ref().and_then(|d| d.get("rateLimits"))
                {
                    let _ = app.emit("ai-rate-limit-event", rate_limits.clone());
                }
                let _ = app.emit(
                    event_name,
                    serde_json::json!({
                        "kind": "progress",
                        "runId": id,
                        "node": node,
                        "status": status,
                        "data": data,
                    }),
                );
            }
            SidecarOutboundEvent::Stream { node, delta, .. } => {
                let _ = app.emit(
                    event_name,
                    serde_json::json!({
                        "kind": "stream",
                        "runId": id,
                        "node": node,
                        "delta": delta,
                    }),
                );
            }
            SidecarOutboundEvent::Interrupt {
                thread_id,
                reason,
                payload,
                ..
            } => {
                let _ = app.emit(
                    event_name,
                    serde_json::json!({
                        "kind": "interrupt",
                        "runId": id,
                        "threadId": thread_id,
                        "reason": reason,
                        "payload": payload,
                    }),
                );
                pending.lock().await.remove(id);
                return Ok(WorkflowResult::from_interrupt(
                    WorkflowInterrupt {
                        thread_id,
                        reason,
                        payload,
                    },
                    SidecarUsage::default(),
                ));
            }
            SidecarOutboundEvent::Result { output, usage, .. } => {
                return Ok(WorkflowResult::from_output(output, usage));
            }
            SidecarOutboundEvent::Error { message, .. } => {
                pending.lock().await.remove(id);
                return Err(message);
            }
            SidecarOutboundEvent::AiTraffic { payload, .. } => {
                // Broadcast on a single shared event channel rather than the
                // per-workflow one — the debug panel listens once and sees
                // every workflow's traffic without subscribing to each
                // event_name separately. The runId is already inside the
                // payload so the panel can attribute each row to its run.
                let mut envelope = payload;
                if let Some(obj) = envelope.as_object_mut() {
                    obj.insert(
                        "runId".to_string(),
                        serde_json::Value::String(id.to_string()),
                    );
                }
                // Mirror to the on-disk JSONL log when capture is on, so
                // Claude Code (or any external tailer / grep) can read it
                // out-of-band. The renderer's debug panel still works the
                // same; the file is purely a passive sink.
                if let Ok(line) = serde_json::to_string(&envelope) {
                    append_ai_debug_log_line(&line);
                }
                let _ = app.emit("ai-traffic-event", envelope);
            }
        }
    }

    Err("Sidecar channel closed without a terminal event".to_string())
}
