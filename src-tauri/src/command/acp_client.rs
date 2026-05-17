//! Generic ACP (Agent Client Protocol) client over stdio.
//!
//! Spawns a child process speaking ACP JSON-RPC 2.0 on its stdin/
//! stdout, correlates outgoing requests with their responses by id,
//! and forwards unsolicited notifications (`session/update`,
//! `session/request_permission`) up an mpsc channel so the session
//! registry can fan them out as Tauri events.
//!
//! Wire format mirrors `integrations::sidecar` — newline-delimited
//! JSON over `BufReader`/`BufWriter`. No length prefix.
//!
//! Phase 1 scope: handshake, single session per client, prompt
//! send, cancel, clean shutdown. Streaming permission round-trips
//! (server-originated requests with ids) are forwarded up to the
//! registry but not yet answered — that's Phase 4 work.

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};
use tokio::process::{Child, ChildStdin, ChildStdout};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::{timeout, Duration};

use super::acp_spawn::AcpLaunchConfig;

/// JSON-RPC error body as it appears on the wire.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

/// A notification or server-originated request that the upper layer
/// (session registry) should forward to the Tauri frontend. Phase 1
/// treats both as opaque — the frontend doesn't yet distinguish.
#[derive(Debug, Clone)]
pub struct IncomingNotification {
    pub method: String,
    pub params: serde_json::Value,
    /// Present when the message was a server-originated REQUEST
    /// (e.g. `session/request_permission`) rather than a fire-and-
    /// forget notification. Phase 4 will hold this id and route a
    /// response back through `respond_to_request`.
    pub id: Option<serde_json::Value>,
}

pub type IncomingRx = mpsc::UnboundedReceiver<IncomingNotification>;

type PendingMap = Arc<Mutex<HashMap<u64, oneshot::Sender<Result<serde_json::Value, JsonRpcError>>>>>;

/// Default RPC timeout — applies to handshake / session lifecycle
/// methods (`initialize`, `session/new`, `session/load`, …) that
/// should return in well under a second on a warm wrapper.
const REQUEST_TIMEOUT_SECS: u64 = 30;
/// `session/prompt` is open-ended — the response doesn't land until
/// the agent finishes the entire turn, which for subagent
/// dispatch / deep tool chains can run many minutes. Use a much
/// larger ceiling; cancellation goes through `session/cancel`
/// which the chat panel exposes as the **Cancel turn** button.
const PROMPT_TIMEOUT_SECS: u64 = 30 * 60;

pub struct AcpClient {
    stdin: Arc<Mutex<BufWriter<ChildStdin>>>,
    pending: PendingMap,
    next_id: AtomicU64,
    child: Mutex<Option<Child>>,
}

impl AcpClient {
    /// Spawn the configured backend and start the reader task.
    ///
    /// Returns the client plus an unbounded receiver for incoming
    /// notifications. The receiver is held by the caller (session
    /// registry) — when it's dropped the reader continues but
    /// notifications are silently discarded.
    pub async fn spawn(config: AcpLaunchConfig) -> Result<(Self, IncomingRx), String> {
        let mut cmd = tokio::process::Command::new(&config.binary);
        cmd.args(&config.args)
            .current_dir(&config.cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        for (k, v) in &config.env {
            cmd.env(k, v);
        }

        eprintln!(
            "[acp] spawning: {} {} (cwd: {})",
            config.binary,
            config.args.join(" "),
            config.cwd.display(),
        );

        let mut child: Child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn {}: {e}", config.binary))?;

        let stdin: ChildStdin = child.stdin.take().ok_or("No stdin on ACP child")?;
        let stdout: ChildStdout = child.stdout.take().ok_or("No stdout on ACP child")?;

        let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));
        let (notif_tx, notif_rx) = mpsc::unbounded_channel();

        // Reader task: line-buffered stdout, parse JSON-RPC, route
        // by id (response) or method (notification / server request).
        let pending_reader = pending.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            loop {
                match lines.next_line().await {
                    Ok(Some(line)) if !line.is_empty() => {
                        dispatch_incoming(&line, &pending_reader, &notif_tx).await;
                    }
                    Ok(Some(_)) => {} // empty line — ignore
                    Ok(None) | Err(_) => {
                        eprintln!("[acp] stdout EOF — notifying pending requests");
                        let mut map = pending_reader.lock().await;
                        for (_id, tx) in map.drain() {
                            let _ = tx.send(Err(JsonRpcError {
                                code: -32099,
                                message: "ACP child exited before responding".to_string(),
                                data: None,
                            }));
                        }
                        break;
                    }
                }
            }
        });

        Ok((
            AcpClient {
                stdin: Arc::new(Mutex::new(BufWriter::new(stdin))),
                pending,
                next_id: AtomicU64::new(1),
                child: Mutex::new(Some(child)),
            },
            notif_rx,
        ))
    }

    async fn request(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        self.request_with_timeout(method, params, REQUEST_TIMEOUT_SECS)
            .await
    }

    async fn request_with_timeout(
        &self,
        method: &str,
        params: serde_json::Value,
        timeout_secs: u64,
    ) -> Result<serde_json::Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (resp_tx, resp_rx) = oneshot::channel();
        self.pending.lock().await.insert(id, resp_tx);

        let body = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });
        let mut line = serde_json::to_string(&body)
            .map_err(|e| format!("serialize {method}: {e}"))?;
        line.push('\n');

        {
            let mut w = self.stdin.lock().await;
            w.write_all(line.as_bytes())
                .await
                .map_err(|e| format!("stdin write {method}: {e}"))?;
            w.flush()
                .await
                .map_err(|e| format!("stdin flush {method}: {e}"))?;
        }

        match timeout(Duration::from_secs(timeout_secs), resp_rx).await {
            Ok(Ok(Ok(value))) => Ok(value),
            Ok(Ok(Err(rpc_err))) => Err(format!(
                "ACP {method} error [{}]: {}",
                rpc_err.code, rpc_err.message
            )),
            Ok(Err(_recv_err)) => {
                self.pending.lock().await.remove(&id);
                Err(format!("ACP {method} sender dropped"))
            }
            Err(_elapsed) => {
                self.pending.lock().await.remove(&id);
                Err(format!(
                    "ACP {method} timed out after {timeout_secs}s"
                ))
            }
        }
    }

    pub async fn initialize(&self) -> Result<serde_json::Value, String> {
        self.request(
            "initialize",
            json!({
                "protocolVersion": 1,
                "clientCapabilities": {},
            }),
        )
        .await
    }

    /// Reload a previously-created session by id. The wrapper
    /// looks up its own internal session store and replays the
    /// state via `session/update` notifications.
    pub async fn session_load(
        &self,
        session_id: &str,
        cwd: &std::path::Path,
    ) -> Result<(), String> {
        self.request(
            "session/load",
            json!({
                "sessionId": session_id,
                "cwd": cwd.to_string_lossy(),
                "mcpServers": [],
            }),
        )
        .await?;
        Ok(())
    }

    /// Create a new ACP session in the given working directory.
    /// `mcp_servers` is passed straight through to ACP's session/new
    /// — Meridian uses this to auto-register its A2A messaging MCP
    /// server. Empty list = no MCP servers.
    /// Returns the agent's session id (opaque string).
    pub async fn session_new(
        &self,
        cwd: &std::path::Path,
        mcp_servers: Vec<serde_json::Value>,
    ) -> Result<String, String> {
        let result = self
            .request(
                "session/new",
                json!({
                    "cwd": cwd.to_string_lossy(),
                    "mcpServers": mcp_servers,
                }),
            )
            .await?;
        result
            .get("sessionId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| format!("session/new missing sessionId in {result}"))
    }

    /// Set the session's permission mode. The Claude Code wrapper
    /// defaults to a permissive mode (auto / acceptEdits) that
    /// silently approves file edits; calling this with `"default"`
    /// makes the agent prompt for dangerous operations via the
    /// `session/request_permission` round-trip.
    pub async fn session_set_mode(
        &self,
        session_id: &str,
        mode_id: &str,
    ) -> Result<(), String> {
        self.request(
            "session/set_mode",
            json!({
                "sessionId": session_id,
                "modeId": mode_id,
            }),
        )
        .await?;
        Ok(())
    }

    pub async fn session_prompt(
        &self,
        session_id: &str,
        text: String,
    ) -> Result<serde_json::Value, String> {
        self.request_with_timeout(
            "session/prompt",
            json!({
                "sessionId": session_id,
                "prompt": [
                    { "type": "text", "text": text },
                ],
            }),
            PROMPT_TIMEOUT_SECS,
        )
        .await
    }

    /// Send a JSON-RPC response back to the agent. Used for server-
    /// originated requests like `session/request_permission` where
    /// the agent waits for our verdict before continuing.
    pub async fn respond_to_request(
        &self,
        request_id: serde_json::Value,
        result: serde_json::Value,
    ) -> Result<(), String> {
        let body = json!({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": result,
        });
        let mut line = serde_json::to_string(&body)
            .map_err(|e| format!("serialize response: {e}"))?;
        line.push('\n');
        let mut w = self.stdin.lock().await;
        w.write_all(line.as_bytes())
            .await
            .map_err(|e| format!("stdin write response: {e}"))?;
        w.flush()
            .await
            .map_err(|e| format!("stdin flush response: {e}"))?;
        Ok(())
    }

    pub async fn session_cancel(&self, session_id: &str) -> Result<(), String> {
        // session/cancel is a notification in ACP (fire-and-forget,
        // no id, no result expected).
        let body = json!({
            "jsonrpc": "2.0",
            "method": "session/cancel",
            "params": { "sessionId": session_id },
        });
        let mut line =
            serde_json::to_string(&body).map_err(|e| format!("serialize cancel: {e}"))?;
        line.push('\n');
        let mut w = self.stdin.lock().await;
        w.write_all(line.as_bytes())
            .await
            .map_err(|e| format!("stdin write cancel: {e}"))?;
        w.flush()
            .await
            .map_err(|e| format!("stdin flush cancel: {e}"))?;
        Ok(())
    }

    /// Best-effort terminate the child process. Used on session
    /// removal or app exit. Idempotent — calling twice returns Ok.
    pub async fn shutdown(&self) -> Result<Option<i32>, String> {
        let mut guard = self.child.lock().await;
        let Some(mut child) = guard.take() else {
            return Ok(None);
        };
        let _ = child.kill().await;
        match child.wait().await {
            Ok(status) => Ok(status.code()),
            Err(e) => Err(format!("waitpid: {e}")),
        }
    }
}

async fn dispatch_incoming(
    line: &str,
    pending: &PendingMap,
    notif_tx: &mpsc::UnboundedSender<IncomingNotification>,
) {
    let value: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[acp] parse error: {e} — {line}");
            return;
        }
    };

    let has_method = value.get("method").is_some();
    let has_result_or_error = value.get("result").is_some() || value.get("error").is_some();

    if has_method {
        // Notification or server-originated request. Push to channel.
        let id = value.get("id").cloned();
        let method = value
            .get("method")
            .and_then(|m| m.as_str())
            .unwrap_or("")
            .to_string();
        let params = value
            .get("params")
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        let _ = notif_tx.send(IncomingNotification { method, params, id });
        return;
    }

    if has_result_or_error {
        let id = match value.get("id").and_then(|v| v.as_u64()) {
            Some(id) => id,
            None => {
                eprintln!("[acp] response without numeric id: {line}");
                return;
            }
        };
        let resp = if let Some(err) = value.get("error") {
            match serde_json::from_value::<JsonRpcError>(err.clone()) {
                Ok(e) => Err(e),
                Err(_) => Err(JsonRpcError {
                    code: -32000,
                    message: format!("malformed error: {err}"),
                    data: None,
                }),
            }
        } else {
            Ok(value
                .get("result")
                .cloned()
                .unwrap_or(serde_json::Value::Null))
        };
        if let Some(tx) = pending.lock().await.remove(&id) {
            let _ = tx.send(resp);
        } else {
            eprintln!("[acp] response for unknown id {id}: {line}");
        }
        return;
    }

    eprintln!("[acp] malformed JSON-RPC (no method, no result, no error): {line}");
}

// Integration tests live at `src-tauri/tests/acp_client.rs` because
// `CARGO_BIN_EXE_mock_acp` (the path to the fixture binary) is only
// set by Cargo in integration-test builds, not unit-test builds.
