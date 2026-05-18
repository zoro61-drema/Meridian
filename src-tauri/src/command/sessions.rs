//! In-memory registry of active Command sessions.
//!
//! Phase 1 scope: flat map, no persistence, no parent/child tree.
//! SQLite tables (spec §12) layer on in Phase 6; the subagent tree
//! (spec §5.2) layers on in Phase 8.
//!
//! Each `SessionEntry` owns an `Arc<AcpClient>` plus a forwarder
//! task that pulls notifications from the client and re-emits them
//! as `command:session:update` Tauri events. When a session is
//! removed (or the app exits), the client's shutdown call kills
//! the child process and the forwarder task exits on channel
//! close.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use super::acp_client::{AcpClient, IncomingRx};
use super::acp_spawn::{launch_config, BackendKind};
use super::events::{
    A2AMessageEvent, CommandEvent, COMMAND_A2A_EVENT_NAME, COMMAND_EVENT_NAME,
};

/// Meridian-side session id. Distinct from the agent's
/// `AcpSessionId` (an opaque string the agent generates) so that
/// the frontend doesn't depend on per-backend id shapes.
pub type SessionId = String;

fn new_session_id() -> SessionId {
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros() as u64;
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    format!("cmd-{ts:016x}-{seq:04x}")
}

struct SessionEntry {
    backend: BackendKind,
    name: String,
    client: Arc<AcpClient>,
    acp_session_id: String,
    spawned_at_ms: u64,
    /// A2A messages addressed to this session that the recipient
    /// agent hasn't yet seen. Read-and-drained by the frontend
    /// before each user prompt (prepended as system context); the
    /// frontend's inbox card surfaces them in the meantime.
    inbox: Vec<A2AMessageEvent>,
    /// Ticket-groomer queue. Each entry is a pre-formatted markdown
    /// block (key + summary + the six editable fields) that the
    /// agent receives one at a time via the `get_next_ticket` MCP
    /// tool. Populated at launch when role=ticket-groomer; empty
    /// for all other roles. Stored at the SessionEntry level (not
    /// SQLite) because the queue is ephemeral — once tickets are
    /// dispensed they live on in `groomingQueue` on the frontend
    /// proposal, and a fresh launch is a fresh batch.
    pending_grooming_tickets: Vec<String>,
    /// How many tickets the queue started with — used to format
    /// "Ticket N of M" in the get_next_ticket response so the
    /// agent has progress context.
    grooming_total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub session_id: SessionId,
    pub backend: BackendKind,
    pub name: String,
    pub spawned_at_ms: u64,
}

/// Agent identifier exposed via the MCP server's `list_agents`
/// tool. Agents use the id (or name) on `send_message`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRef {
    pub session_id: SessionId,
    pub name: String,
    pub backend: BackendKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchedSession {
    pub session_id: SessionId,
    pub acp_session_id: String,
}

pub struct CommandState {
    sessions: Mutex<HashMap<SessionId, SessionEntry>>,
}

impl CommandState {
    pub fn new() -> Self {
        CommandState {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    /// Spawn a backend, run the ACP handshake, create a session,
    /// and register a forwarder task. Returns Meridian's session id
    /// plus the agent-side ACP session id (used as the resume key).
    /// `display_name` is what other agents see in `list_agents` and
    /// in A2A message arc events; the frontend computes it before
    /// the launch call (e.g. "Claude 1").
    ///
    /// `extra_mcp_servers` is the user-configured MCP server list
    /// (already filtered for this backend by the frontend) — each
    /// entry is forwarded as-is in the `mcpServers` array sent to
    /// `session/new`, alongside the auto-attached Meridian A2A server.
    pub async fn launch(
        &self,
        app: AppHandle,
        backend: BackendKind,
        project_dir: PathBuf,
        display_name: String,
        extra_mcp_servers: Vec<serde_json::Value>,
        grooming_tickets: Vec<String>,
        model_override: Option<String>,
    ) -> Result<LaunchedSession, String> {
        // Generate the Meridian session id upfront so we can build
        // the MCP server URL with it before calling session/new —
        // the wrapper auto-connects to that URL during init and the
        // server uses the path segment to identify the sender.
        let session_id = new_session_id();
        let mcp_url = super::mcp_server::session_url(&session_id);
        let mut mcp_servers: Vec<serde_json::Value> = mcp_url
            .map(|url| {
                // The Zed/agentclientprotocol wrapper's Zod schema
                // requires `headers` to be present (as an empty
                // array is fine). Omitting it errors with
                // `-32602 Invalid params` even when the rest of
                // the entry is valid.
                vec![serde_json::json!({
                    "name": "meridian-a2a",
                    "url": url,
                    "type": "http",
                    "headers": [],
                })]
            })
            .unwrap_or_default();
        // User-configured servers (filtered for this backend on the
        // frontend) get appended after the A2A server so the wrapper
        // sees a single combined list.
        mcp_servers.extend(extra_mcp_servers);

        let config = launch_config(backend, project_dir.clone(), model_override.as_deref())?;
        let (client, notif_rx) = AcpClient::spawn(config).await?;
        let client = Arc::new(client);

        client.initialize().await?;
        let acp_session_id = match client.session_new(&project_dir, mcp_servers).await {
            Ok(id) => id,
            Err(e) if backend == BackendKind::CodexAcp && e.contains("Authentication required") => {
                let _ = client.shutdown().await;
                return Err(
                    "Codex requires authentication. Run `codex login` in a terminal \
                     (or set CODEX_API_KEY / OPENAI_API_KEY), then try again."
                        .to_string(),
                );
            }
            Err(e) => {
                let _ = client.shutdown().await;
                return Err(e);
            }
        };

        // Lock the session to "default" permission mode so file
        // edits, shell commands, and other dangerous tools trigger
        // a `session/request_permission` round-trip the user can
        // explicitly approve. The Claude wrapper otherwise defaults
        // to a permissive mode (auto / acceptEdits) which silently
        // approves edits. Non-fatal — if the agent doesn't support
        // the method we still proceed.
        if let Err(e) = client.session_set_mode(&acp_session_id, "default").await {
            eprintln!("[acp] session_set_mode default failed (continuing): {e}");
        }

        let spawned_at_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        // Forwarder task: drain notifications, emit Tauri events.
        let app_for_task = app.clone();
        let session_id_for_task = session_id.clone();
        tokio::spawn(forward_notifications(
            app_for_task,
            session_id_for_task,
            notif_rx,
        ));

        let _ = app.emit(
            COMMAND_EVENT_NAME,
            CommandEvent::SessionCreated {
                session_id: session_id.clone(),
                backend,
            },
        );

        let grooming_total = grooming_tickets.len();
        self.sessions.lock().await.insert(
            session_id.clone(),
            SessionEntry {
                backend,
                name: display_name,
                client,
                acp_session_id: acp_session_id.clone(),
                spawned_at_ms,
                inbox: Vec::new(),
                pending_grooming_tickets: grooming_tickets,
                grooming_total,
            },
        );

        Ok(LaunchedSession {
            session_id,
            acp_session_id,
        })
    }

    pub async fn prompt(&self, session_id: &str, text: String) -> Result<(), String> {
        let (client, acp_id) = {
            let guard = self.sessions.lock().await;
            let entry = guard
                .get(session_id)
                .ok_or_else(|| format!("unknown session: {session_id}"))?;
            (entry.client.clone(), entry.acp_session_id.clone())
        };
        // Fire and don't wait — the final result lands as a regular
        // response and is logged at the client layer; intermediate
        // session/update notifications stream to the frontend via
        // the forwarder task.
        client.session_prompt(&acp_id, text).await?;
        Ok(())
    }

    /// Re-attach a previously-stored session. Looks up the
    /// persisted record, spawns the wrapper, calls `session/load`
    /// against the stored ACP session id, and registers the new
    /// SessionEntry under the SAME Meridian session id so the
    /// frontend's existing unit becomes live.
    ///
    /// Idempotent: if the session is already registered (e.g. the
    /// webview reloaded but the Rust process kept running, leaving
    /// the in-memory sessions map intact), we return Ok so the
    /// frontend can re-sync its `isLive` flag without an
    /// alarm-style error.
    pub async fn resume(
        &self,
        app: AppHandle,
        meridian_session_id: &str,
    ) -> Result<(), String> {
        if self.sessions.lock().await.contains_key(meridian_session_id) {
            eprintln!(
                "[acp] resume no-op: {meridian_session_id} already live in Rust state \
                 (probably a webview reload); frontend will resync."
            );
            return Ok(());
        }
        let stored = super::storage::list_active_sessions()?
            .into_iter()
            .find(|s| s.id == meridian_session_id)
            .ok_or_else(|| format!("no persisted session: {meridian_session_id}"))?;

        let project_dir = PathBuf::from(&stored.project_id);
        // Resume reuses the wrapper's default model — there's no
        // user-typed override to thread in. If we ever want to
        // remember a per-unit model across restarts it has to come
        // from SQLite, not None.
        let config = super::acp_spawn::launch_config(
            stored.backend,
            project_dir.clone(),
            None,
        )?;
        let (client, notif_rx) = AcpClient::spawn(config).await?;
        let client = Arc::new(client);

        client.initialize().await?;

        // Try to restore the original ACP session. If the wrapper
        // no longer has it (the user killed Meridian before any
        // prompt landed, the wrapper's session cache evicted, etc.)
        // we get -32002 "Resource not found" — fall back to a fresh
        // session/new so the user can keep using the unit. The
        // Meridian-side transcript is preserved either way; only
        // the agent's internal context is lost on fallback.
        let mcp_url = super::mcp_server::session_url(meridian_session_id);
        let mcp_servers = mcp_url
            .map(|url| {
                vec![serde_json::json!({
                    "name": "meridian-a2a",
                    "url": url,
                    "type": "http",
                    "headers": [],
                })]
            })
            .unwrap_or_default();

        let acp_session_id = match client
            .session_load(&stored.acp_session_id, &project_dir)
            .await
        {
            Ok(()) => stored.acp_session_id.clone(),
            Err(e) => {
                // Any session/load failure — missing session
                // (-32002), wrapper internal error (-32603), schema
                // mismatch, corrupted on-disk state, etc. — falls
                // back to a fresh session/new. We've already
                // committed the spawn cost; refusing the resume
                // strands the user with a transcript they can read
                // but no agent to talk to. Falling back loses
                // turn-by-turn agent context; the Meridian-side
                // transcript stays intact.
                eprintln!(
                    "[acp] resume: session/load failed for {meridian_session_id} ({e}); \
                     falling back to fresh session/new"
                );
                let fresh = match client.session_new(&project_dir, mcp_servers).await {
                    Ok(id) => id,
                    Err(new_err) => {
                        let _ = client.shutdown().await;
                        return Err(format!(
                            "session/load failed ({e}) and fallback session/new failed: {new_err}"
                        ));
                    }
                };
                let mut updated = stored.clone();
                updated.acp_session_id = fresh.clone();
                if let Err(persist_err) = super::storage::save_session(&updated) {
                    eprintln!("[acp] resume: could not update stored acp_session_id: {persist_err}");
                }
                fresh
            }
        };
        let _ = client.session_set_mode(&acp_session_id, "default").await;

        tokio::spawn(forward_notifications(
            app.clone(),
            meridian_session_id.to_string(),
            notif_rx,
        ));

        let spawned_at_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        self.sessions.lock().await.insert(
            meridian_session_id.to_string(),
            SessionEntry {
                backend: stored.backend,
                name: stored.name,
                client,
                acp_session_id,
                spawned_at_ms,
                inbox: Vec::new(),
                pending_grooming_tickets: Vec::new(),
                grooming_total: 0,
            },
        );
        Ok(())
    }

    /// Switch a unit to a different backend wrapper. Kills the
    /// current client, spawns a fresh one for the new backend,
    /// runs the standard init + session/new flow, persists the new
    /// ACP session id + backend in SQLite, and re-registers the
    /// SessionEntry under the same Meridian session id.
    ///
    /// The transcript / files / commands tabs on the frontend
    /// persist (they're store state, not wrapper state); only the
    /// agent's internal turn-by-turn context is lost — analogous
    /// to the resume fallback path.
    ///
    /// `extra_mcp_servers` carries the user's globally-configured
    /// MCP servers, filtered for `new_backend` by the frontend.
    pub async fn switch_backend(
        &self,
        app: AppHandle,
        meridian_session_id: &str,
        new_backend: BackendKind,
        extra_mcp_servers: Vec<serde_json::Value>,
        model_override: Option<String>,
    ) -> Result<String, String> {
        // 1. Shutdown the existing wrapper if it's live.
        let prev = {
            let mut guard = self.sessions.lock().await;
            guard.remove(meridian_session_id)
        };
        if let Some(prev) = prev {
            let _ = prev.client.shutdown().await;
        }

        // 2. Load the persisted metadata (project_dir, display name).
        let stored = super::storage::list_active_sessions()?
            .into_iter()
            .find(|s| s.id == meridian_session_id)
            .ok_or_else(|| format!("no persisted session: {meridian_session_id}"))?;

        // 3. Spawn the new wrapper.
        let project_dir = PathBuf::from(&stored.project_id);
        let config = super::acp_spawn::launch_config(
            new_backend,
            project_dir.clone(),
            model_override.as_deref(),
        )?;
        let (client, notif_rx) = AcpClient::spawn(config).await?;
        let client = Arc::new(client);
        client.initialize().await?;

        let mcp_url = super::mcp_server::session_url(meridian_session_id);
        let mut mcp_servers: Vec<serde_json::Value> = mcp_url
            .map(|url| {
                vec![serde_json::json!({
                    "name": "meridian-a2a",
                    "url": url,
                    "type": "http",
                    "headers": [],
                })]
            })
            .unwrap_or_default();
        mcp_servers.extend(extra_mcp_servers);

        let acp_session_id = match client.session_new(&project_dir, mcp_servers).await {
            Ok(id) => id,
            Err(e) if new_backend == BackendKind::CodexAcp
                && e.contains("Authentication required") =>
            {
                let _ = client.shutdown().await;
                return Err(
                    "Codex requires authentication. Run `codex login` in a terminal \
                     (or set CODEX_API_KEY / OPENAI_API_KEY), then try again."
                        .to_string(),
                );
            }
            Err(e) => {
                let _ = client.shutdown().await;
                return Err(e);
            }
        };
        let _ = client.session_set_mode(&acp_session_id, "default").await;

        // 4. Persist new backend + acp id.
        let mut updated = stored.clone();
        updated.backend = new_backend;
        updated.acp_session_id = acp_session_id.clone();
        if let Err(persist_err) = super::storage::save_session(&updated) {
            eprintln!(
                "[acp] switch_backend: could not persist new backend/acp id: {persist_err}"
            );
        }

        // 5. Register the new entry + forwarder.
        let spawned_at_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        tokio::spawn(forward_notifications(
            app.clone(),
            meridian_session_id.to_string(),
            notif_rx,
        ));
        self.sessions.lock().await.insert(
            meridian_session_id.to_string(),
            SessionEntry {
                backend: new_backend,
                name: stored.name,
                client,
                acp_session_id: acp_session_id.clone(),
                spawned_at_ms,
                inbox: Vec::new(),
                pending_grooming_tickets: Vec::new(),
                grooming_total: 0,
            },
        );
        Ok(acp_session_id)
    }

    /// Look up another unit's session id by id or human name (case-
    /// insensitive). Used by the MCP server's send_message tool.
    pub async fn resolve_recipient(&self, to: &str) -> Option<(SessionId, String)> {
        let guard = self.sessions.lock().await;
        if let Some(entry) = guard.get(to) {
            return Some((to.to_string(), entry.name.clone()));
        }
        let lower = to.to_ascii_lowercase();
        for (id, entry) in guard.iter() {
            if entry.name.to_ascii_lowercase() == lower {
                return Some((id.clone(), entry.name.clone()));
            }
        }
        None
    }

    /// Route an A2A message from one unit to another. Stores it in
    /// the recipient's inbox, emits `command:a2a:message`, and
    /// returns the constructed event for the caller to log on the
    /// sender's side.
    pub async fn send_message(
        &self,
        app: &AppHandle,
        from_session_id: &str,
        to_session_id: &str,
        subject: Option<String>,
        body: String,
    ) -> Result<A2AMessageEvent, String> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        let mut guard = self.sessions.lock().await;
        let from_name = guard
            .get(from_session_id)
            .map(|e| e.name.clone())
            .ok_or_else(|| format!("unknown sender: {from_session_id}"))?;
        let to_name = guard
            .get(to_session_id)
            .map(|e| e.name.clone())
            .ok_or_else(|| format!("unknown recipient: {to_session_id}"))?;
        let event = A2AMessageEvent {
            message_id: format!("a2a-{now:x}-{:04x}", rand_suffix()),
            from_session_id: from_session_id.to_string(),
            from_name,
            to_session_id: to_session_id.to_string(),
            to_name,
            subject,
            body,
            created_at_ms: now,
        };
        if let Some(entry) = guard.get_mut(to_session_id) {
            entry.inbox.push(event.clone());
        }
        drop(guard);
        let _ = app.emit(COMMAND_A2A_EVENT_NAME, event.clone());
        Ok(event)
    }

    /// Read and drain the inbox for a session. Called by the
    /// frontend right before sending a user prompt — the drained
    /// messages get prepended as system context so the agent
    /// actually sees them on its next turn.
    pub async fn drain_inbox(&self, session_id: &str) -> Vec<A2AMessageEvent> {
        let mut guard = self.sessions.lock().await;
        match guard.get_mut(session_id) {
            Some(entry) => std::mem::take(&mut entry.inbox),
            None => Vec::new(),
        }
    }

    /// List all live units — used by the MCP server's list_agents
    /// tool so an agent can discover who else is on the field.
    pub async fn list_agents(&self) -> Vec<AgentRef> {
        self.sessions
            .lock()
            .await
            .iter()
            .map(|(id, e)| AgentRef {
                session_id: id.clone(),
                name: e.name.clone(),
                backend: e.backend,
            })
            .collect()
    }


    /// Pop the next pending grooming ticket for a session. Returns
    /// (current_index, total, content_block) — index is 1-based for
    /// human-friendly "Ticket N of M" framing, total is the
    /// queue size at launch. Returns None when the queue is empty.
    pub async fn pop_next_grooming_ticket(
        &self,
        session_id: &str,
    ) -> Option<(usize, usize, String)> {
        let mut guard = self.sessions.lock().await;
        let entry = guard.get_mut(session_id)?;
        if entry.pending_grooming_tickets.is_empty() {
            return None;
        }
        let total = entry.grooming_total.max(1);
        // 1-based: tickets already dispensed = total - remaining;
        // the one we're about to hand out is dispensed + 1.
        let current = total - entry.pending_grooming_tickets.len() + 1;
        let block = entry.pending_grooming_tickets.remove(0);
        Some((current, total, block))
    }

    pub async fn respond_permission(
        &self,
        session_id: &str,
        request_id: serde_json::Value,
        option_id: String,
    ) -> Result<(), String> {
        let client = {
            let guard = self.sessions.lock().await;
            let entry = guard
                .get(session_id)
                .ok_or_else(|| format!("unknown session: {session_id}"))?;
            entry.client.clone()
        };
        let result = serde_json::json!({
            "outcome": {
                "outcome": "selected",
                "optionId": option_id,
            }
        });
        client.respond_to_request(request_id, result).await
    }

    pub async fn cancel(&self, session_id: &str) -> Result<(), String> {
        let (client, acp_id) = {
            let guard = self.sessions.lock().await;
            let entry = guard
                .get(session_id)
                .ok_or_else(|| format!("unknown session: {session_id}"))?;
            (entry.client.clone(), entry.acp_session_id.clone())
        };
        client.session_cancel(&acp_id).await
    }

    pub async fn kill(&self, app: AppHandle, session_id: &str) -> Result<(), String> {
        // Shutdown the live client if present; either way emit the
        // SessionTerminated event so the frontend can prune the
        // unit. Disconnected units (hydrated from SQLite after a
        // restart and not yet resumed) have no Rust-side entry —
        // without the unconditional emit, Kill would silently
        // no-op on them.
        let entry = self.sessions.lock().await.remove(session_id);
        let exit_code = match entry {
            Some(e) => e.client.shutdown().await.unwrap_or(None),
            None => None,
        };
        let _ = app.emit(
            COMMAND_EVENT_NAME,
            CommandEvent::SessionTerminated {
                session_id: session_id.to_string(),
                exit_code,
            },
        );
        Ok(())
    }

    pub async fn list(&self) -> Vec<SessionSummary> {
        self.sessions
            .lock()
            .await
            .iter()
            .map(|(id, entry)| SessionSummary {
                session_id: id.clone(),
                backend: entry.backend,
                name: entry.name.clone(),
                spawned_at_ms: entry.spawned_at_ms,
            })
            .collect()
    }
}

fn rand_suffix() -> u32 {
    use std::sync::atomic::{AtomicU32, Ordering};
    static C: AtomicU32 = AtomicU32::new(0);
    C.fetch_add(1, Ordering::Relaxed) & 0xFFFF
}

impl Default for CommandState {
    fn default() -> Self {
        Self::new()
    }
}

async fn forward_notifications(app: AppHandle, session_id: SessionId, mut rx: IncomingRx) {
    while let Some(notif) = rx.recv().await {
        let raw = serde_json::json!({
            "method": notif.method,
            "params": notif.params,
            "id": notif.id,
        });
        if let Err(e) = app.emit(
            COMMAND_EVENT_NAME,
            CommandEvent::SessionUpdate {
                session_id: session_id.clone(),
                raw,
            },
        ) {
            eprintln!("[acp] emit failed: {e}");
        }
    }
    eprintln!("[acp] notification channel closed for session {session_id}");
}
