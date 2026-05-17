//! SQLite persistence for the Command workflow.
//!
//! Phase 6 scope: persist enough state to restore a unit on the
//! tactical field after app restart — session metadata + the
//! durable subset of the transcript (user prompts, agent text,
//! permission events, errors). Volatile entries (tool_call /
//! tool_result that the ACP wrapper will re-emit on session/load)
//! are skipped to keep the table small.
//!
//! Storage layout: one file at `<app_data_dir>/command-sessions.sqlite`.
//! Mirrors the meetings-index pattern (`storage/meeting_index.rs`):
//! `OnceLock<Arc<Mutex<Connection>>>` so the rest of the module can
//! borrow the connection without threading an AppHandle through
//! every call.
//!
//! Phase 7 adds an FTS5 virtual table for archive search; Phase 8
//! adds a `parent_id` foreign key for subagent trees. Both layer on
//! the existing schema via `ALTER TABLE` migrations.

use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::Manager;

use super::acp_spawn::BackendKind;

static DB_PATH: OnceLock<PathBuf> = OnceLock::new();
static CONN: OnceLock<Arc<Mutex<Connection>>> = OnceLock::new();

pub fn init(app: &tauri::AppHandle) {
    let dir = app
        .path()
        .app_data_dir()
        .expect("cannot resolve app data dir");
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("command-sessions.sqlite");
    let _ = DB_PATH.set(path.clone());

    if let Err(e) = open_and_migrate(&path) {
        eprintln!("[command-storage] init failed: {e}");
    }
}

fn open_and_migrate(path: &PathBuf) -> rusqlite::Result<()> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS command_sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            sprite_id TEXT NOT NULL,
            role TEXT NOT NULL,
            project_id TEXT NOT NULL,
            backend TEXT NOT NULL,
            model_id TEXT NOT NULL,
            accent TEXT NOT NULL,
            state TEXT NOT NULL,
            acp_session_id TEXT NOT NULL,
            role_prompt TEXT,
            position_x REAL NOT NULL,
            position_y REAL NOT NULL,
            facing TEXT NOT NULL DEFAULT 'right',
            created_at INTEGER NOT NULL,
            last_active_at INTEGER NOT NULL,
            archived INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_command_sessions_archived
            ON command_sessions(archived, last_active_at);

        CREATE TABLE IF NOT EXISTS command_messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES command_sessions(id) ON DELETE CASCADE,
            seq INTEGER NOT NULL,
            kind TEXT NOT NULL,
            text TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_command_messages_session
            ON command_messages(session_id, seq);

        -- Phase 7: FTS5 over message text for archive search.
        -- External-content table mirrors command_messages; triggers
        -- keep them in sync. Porter stemmer + unicode61 tokenizer
        -- matches the meetings index pattern.
        CREATE VIRTUAL TABLE IF NOT EXISTS command_messages_fts USING fts5(
            text,
            content='command_messages',
            content_rowid='rowid',
            tokenize='porter unicode61'
        );
        CREATE TRIGGER IF NOT EXISTS command_messages_fts_ai AFTER INSERT ON command_messages BEGIN
          INSERT INTO command_messages_fts(rowid, text) VALUES (new.rowid, new.text);
        END;
        CREATE TRIGGER IF NOT EXISTS command_messages_fts_ad AFTER DELETE ON command_messages BEGIN
          INSERT INTO command_messages_fts(command_messages_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
        END;
        CREATE TRIGGER IF NOT EXISTS command_messages_fts_au AFTER UPDATE ON command_messages BEGIN
          INSERT INTO command_messages_fts(command_messages_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
          INSERT INTO command_messages_fts(rowid, text) VALUES (new.rowid, new.text);
        END;
        "#,
    )?;
    let _ = CONN.set(Arc::new(Mutex::new(conn)));
    Ok(())
}

fn with_conn<R>(f: impl FnOnce(&Connection) -> rusqlite::Result<R>) -> Result<R, String> {
    let conn_arc = CONN
        .get()
        .ok_or_else(|| "command storage not initialised".to_string())?;
    let conn = conn_arc.lock().map_err(|e| format!("storage mutex: {e}"))?;
    f(&conn).map_err(|e| format!("sqlite: {e}"))
}

// ── Records ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSession {
    pub id: String,
    pub name: String,
    pub sprite_id: String,
    pub role: String,
    pub project_id: String,
    pub backend: BackendKind,
    pub model_id: String,
    pub accent: String,
    pub state: String,
    pub acp_session_id: String,
    pub role_prompt: Option<String>,
    pub position_x: f32,
    pub position_y: f32,
    pub facing: String,
    pub created_at: i64,
    pub last_active_at: i64,
    pub archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredMessage {
    pub id: String,
    pub session_id: String,
    pub seq: i64,
    pub kind: String,
    pub text: String,
    pub created_at: i64,
}

// ── Public API ──────────────────────────────────────────────────────────

pub fn save_session(record: &StoredSession) -> Result<(), String> {
    let backend_str = record.backend.as_str().to_string();
    with_conn(|conn| {
        conn.execute(
            r#"
            INSERT INTO command_sessions(
                id, name, sprite_id, role, project_id, backend, model_id, accent,
                state, acp_session_id, role_prompt, position_x, position_y, facing,
                created_at, last_active_at, archived
            ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)
            ON CONFLICT(id) DO UPDATE SET
              name=excluded.name,
              sprite_id=excluded.sprite_id,
              role=excluded.role,
              project_id=excluded.project_id,
              backend=excluded.backend,
              model_id=excluded.model_id,
              accent=excluded.accent,
              state=excluded.state,
              acp_session_id=excluded.acp_session_id,
              role_prompt=excluded.role_prompt,
              position_x=excluded.position_x,
              position_y=excluded.position_y,
              facing=excluded.facing,
              last_active_at=excluded.last_active_at,
              archived=excluded.archived
            "#,
            params![
                record.id,
                record.name,
                record.sprite_id,
                record.role,
                record.project_id,
                backend_str,
                record.model_id,
                record.accent,
                record.state,
                record.acp_session_id,
                record.role_prompt,
                record.position_x as f64,
                record.position_y as f64,
                record.facing,
                record.created_at,
                record.last_active_at,
                if record.archived { 1 } else { 0 },
            ],
        )?;
        Ok(())
    })
}

/// Upsert by entry id. The frontend reuses the same id when
/// extending a streamed `agent_text` entry (each new chunk widens
/// the existing entry's text), so this folds all chunks of one
/// turn into a single row.
pub fn save_message(record: &StoredMessage) -> Result<(), String> {
    with_conn(|conn| {
        conn.execute(
            r#"
            INSERT INTO command_messages(id, session_id, seq, kind, text, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(id) DO UPDATE SET
              text = excluded.text,
              created_at = excluded.created_at
            "#,
            params![
                record.id,
                record.session_id,
                record.seq,
                record.kind,
                record.text,
                record.created_at,
            ],
        )?;
        Ok(())
    })
}

pub fn list_active_sessions() -> Result<Vec<StoredSession>, String> {
    with_conn(|conn| {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, sprite_id, role, project_id, backend, model_id, accent,
                   state, acp_session_id, role_prompt, position_x, position_y, facing,
                   created_at, last_active_at, archived
            FROM command_sessions
            WHERE archived = 0
            ORDER BY created_at ASC
            "#,
        )?;
        let rows = stmt.query_map([], |row| {
            let backend_str: String = row.get(5)?;
            let backend = match backend_str.as_str() {
                "claude-acp" => BackendKind::ClaudeAcp,
                "gemini-acp" => BackendKind::GeminiAcp,
                "codex-acp" => BackendKind::CodexAcp,
                "qwen-acp" => BackendKind::QwenAcp,
                other => {
                    eprintln!("[command-storage] unknown backend in DB: {other}");
                    BackendKind::ClaudeAcp
                }
            };
            Ok(StoredSession {
                id: row.get(0)?,
                name: row.get(1)?,
                sprite_id: row.get(2)?,
                role: row.get(3)?,
                project_id: row.get(4)?,
                backend,
                model_id: row.get(6)?,
                accent: row.get(7)?,
                state: row.get(8)?,
                acp_session_id: row.get(9)?,
                role_prompt: row.get(10)?,
                position_x: row.get::<_, f64>(11)? as f32,
                position_y: row.get::<_, f64>(12)? as f32,
                facing: row.get(13)?,
                created_at: row.get(14)?,
                last_active_at: row.get(15)?,
                archived: row.get::<_, i64>(16)? != 0,
            })
        })?;
        let out = rows.filter_map(|r| r.ok()).collect();
        Ok(out)
    })
}

pub fn list_messages_for(session_id: &str) -> Result<Vec<StoredMessage>, String> {
    with_conn(|conn| {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, session_id, seq, kind, text, created_at
            FROM command_messages
            WHERE session_id = ?1
            ORDER BY seq ASC
            "#,
        )?;
        let rows = stmt.query_map(params![session_id], |row| {
            Ok(StoredMessage {
                id: row.get(0)?,
                session_id: row.get(1)?,
                seq: row.get(2)?,
                kind: row.get(3)?,
                text: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    })
}

pub fn list_archived_sessions() -> Result<Vec<StoredSession>, String> {
    with_conn(|conn| {
        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, sprite_id, role, project_id, backend, model_id, accent,
                   state, acp_session_id, role_prompt, position_x, position_y, facing,
                   created_at, last_active_at, archived
            FROM command_sessions
            WHERE archived = 1
            ORDER BY last_active_at DESC
            "#,
        )?;
        let rows = stmt.query_map([], |row| {
            let backend_str: String = row.get(5)?;
            let backend = match backend_str.as_str() {
                "claude-acp" => BackendKind::ClaudeAcp,
                "gemini-acp" => BackendKind::GeminiAcp,
                "codex-acp" => BackendKind::CodexAcp,
                "qwen-acp" => BackendKind::QwenAcp,
                _ => BackendKind::ClaudeAcp,
            };
            Ok(StoredSession {
                id: row.get(0)?,
                name: row.get(1)?,
                sprite_id: row.get(2)?,
                role: row.get(3)?,
                project_id: row.get(4)?,
                backend,
                model_id: row.get(6)?,
                accent: row.get(7)?,
                state: row.get(8)?,
                acp_session_id: row.get(9)?,
                role_prompt: row.get(10)?,
                position_x: row.get::<_, f64>(11)? as f32,
                position_y: row.get::<_, f64>(12)? as f32,
                facing: row.get(13)?,
                created_at: row.get(14)?,
                last_active_at: row.get(15)?,
                archived: row.get::<_, i64>(16)? != 0,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveSearchHit {
    pub session_id: String,
    pub session_name: String,
    pub message_kind: String,
    /// First 240 chars of the matched message — enough to render a
    /// preview line in the drawer without paging the full message
    /// back across the IPC boundary.
    pub snippet: String,
    pub created_at: i64,
}

pub fn search_archive(query: &str, limit: i64) -> Result<Vec<ArchiveSearchHit>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    // Escape FTS5 special characters by quoting each whitespace-
    // separated term — keeps the user's input from accidentally
    // becoming an FTS expression.
    let escaped: String = query
        .split_whitespace()
        .map(|term| {
            let cleaned = term.replace('"', "");
            format!("\"{cleaned}\"")
        })
        .collect::<Vec<_>>()
        .join(" ");

    with_conn(|conn| {
        let mut stmt = conn.prepare(
            r#"
            SELECT
              m.session_id,
              s.name,
              m.kind,
              substr(m.text, 1, 240) AS snippet,
              m.created_at
            FROM command_messages_fts fts
            JOIN command_messages m ON m.rowid = fts.rowid
            JOIN command_sessions s ON s.id = m.session_id
            WHERE command_messages_fts MATCH ?1
            ORDER BY m.created_at DESC
            LIMIT ?2
            "#,
        )?;
        let rows = stmt.query_map(params![escaped, limit], |row| {
            Ok(ArchiveSearchHit {
                session_id: row.get(0)?,
                session_name: row.get(1)?,
                message_kind: row.get(2)?,
                snippet: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    })
}

pub fn unarchive_session(session_id: &str) -> Result<(), String> {
    with_conn(|conn| {
        conn.execute(
            r#"UPDATE command_sessions SET archived = 0 WHERE id = ?1"#,
            params![session_id],
        )?;
        Ok(())
    })
}

pub fn archive_session(session_id: &str) -> Result<(), String> {
    with_conn(|conn| {
        conn.execute(
            r#"UPDATE command_sessions SET archived = 1 WHERE id = ?1"#,
            params![session_id],
        )?;
        Ok(())
    })
}

pub fn delete_session(session_id: &str) -> Result<(), String> {
    with_conn(|conn| {
        // Messages cascade via FK; the explicit delete is defensive in
        // case the FK enforcement pragma isn't active.
        conn.execute(
            r#"DELETE FROM command_messages WHERE session_id = ?1"#,
            params![session_id],
        )?;
        conn.execute(
            r#"DELETE FROM command_sessions WHERE id = ?1"#,
            params![session_id],
        )?;
        Ok(())
    })
}
