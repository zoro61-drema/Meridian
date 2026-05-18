// Crash reporting.
//
// One "live" marker file per session lives at
// `<app_data_dir>/crashes/session.lock`. We write it at startup
// and delete it on `RunEvent::Exit`. If the marker is already
// present when we start, the previous session didn't exit cleanly
// — that's our crash signal. The marker pattern catches all crash
// causes uniformly: Rust panics, WebView crashes, OOM kills, force
// quits, power loss. None of them reach our exit handler.
//
// Two writers of crash reports:
//   1. The Rust panic hook — installed before `tauri::Builder` so
//      it catches panics anywhere in the process. Writes a
//      timestamped `crash-<ts>-rust_panic.txt`.
//   2. The frontend `report_js_crash` command — frontends call
//      this from `window.onerror` / `unhandledrejection`.
//
// Reports are plain text so the user can open them in any editor.
// Last 20 are kept; older ones get pruned on startup.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager};

static CRASH_DIR: OnceLock<PathBuf> = OnceLock::new();
/// Set during `init()` if the previous session crashed. Cleared
/// when the frontend reads it via `get_pending_crash_report`.
static PENDING_REPORT: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

const LIVE_MARKER: &str = "session.lock";
const REPORT_PREFIX: &str = "crash-";
const REPORT_EXT: &str = "txt";
const MAX_REPORTS: usize = 20;

#[derive(Serialize, Clone)]
pub struct CrashReport {
    /// Unix seconds — when the crash report was written.
    pub timestamp: u64,
    /// "rust_panic" | "js_unhandled" | "unexpected_exit".
    pub kind: String,
    /// One-line summary pulled from the report's `Message:` block.
    pub summary: String,
    /// Absolute path so the frontend can open it in Finder.
    pub file_path: String,
}

fn pending_slot() -> &'static Mutex<Option<PathBuf>> {
    PENDING_REPORT.get_or_init(|| Mutex::new(None))
}

fn crash_dir() -> Option<&'static Path> {
    CRASH_DIR.get().map(|p| p.as_path())
}

fn live_marker_path() -> Option<PathBuf> {
    crash_dir().map(|d| d.join(LIVE_MARKER))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Install the panic hook. Must run before `tauri::Builder` so it
/// catches panics emitted during setup. Safe to call before
/// `init()` — writes fall back to stderr-only if the crash dir
/// isn't ready yet.
pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("{info}");
        let bt = std::backtrace::Backtrace::force_capture();
        eprintln!("[MERIDIAN PANIC] {msg}");
        eprintln!("[MERIDIAN PANIC] backtrace:\n{:?}", bt);
        if let Some(dir) = crash_dir() {
            let _ = write_report_into(dir, "rust_panic", &msg, Some(&format!("{:?}", bt)));
        }
    }));
}

/// Resolve the crash dir, prune old reports, then check whether
/// the previous session left the live marker behind. If so, surface
/// the most recent crash report (or a placeholder) for the frontend
/// to toast at next mount. Finally, mark THIS session as live.
pub fn init(app: &AppHandle) {
    let base = match app.path().app_data_dir() {
        Ok(p) => p,
        Err(err) => {
            eprintln!("[crash] app_data_dir unavailable: {err}");
            return;
        }
    };
    let dir = base.join("crashes");
    if let Err(err) = fs::create_dir_all(&dir) {
        eprintln!("[crash] mkdir failed: {err}");
        return;
    }
    let _ = CRASH_DIR.set(dir.clone());

    let marker = dir.join(LIVE_MARKER);
    if marker.exists() {
        // Previous session crashed. If the panic hook had time to
        // run, there's a recent report — use that. Otherwise drop
        // a placeholder so the toast still has something to link to.
        let path = match latest_report(&dir) {
            Some(p) => p,
            None => write_report_into(
                &dir,
                "unexpected_exit",
                "Previous Meridian session did not exit cleanly. No Rust panic was captured — the process likely crashed at a lower level (WebView, OOM, force kill, or power loss).",
                None,
            )
            .unwrap_or_else(|_| dir.join("unknown.txt")),
        };
        *pending_slot().lock().unwrap() = Some(path);
    }

    let _ = fs::write(
        &marker,
        format!("pid={} ts={}\n", std::process::id(), now_secs()),
    );
    prune_old_reports(&dir);
}

/// Delete the live marker. Call from `RunEvent::Exit`.
pub fn mark_clean_exit() {
    if let Some(path) = live_marker_path() {
        let _ = fs::remove_file(path);
    }
}

fn write_report_into(
    dir: &Path,
    kind: &str,
    message: &str,
    details: Option<&str>,
) -> std::io::Result<PathBuf> {
    let ts = now_secs();
    let filename = format!("{REPORT_PREFIX}{ts}-{kind}.{REPORT_EXT}");
    let path = dir.join(&filename);
    let mut f = fs::File::create(&path)?;
    writeln!(f, "Meridian crash report")?;
    writeln!(f, "Timestamp: {ts} (unix seconds)")?;
    writeln!(f, "Kind: {kind}")?;
    writeln!(f, "App version: {}", env!("CARGO_PKG_VERSION"))?;
    writeln!(f, "OS: {}", std::env::consts::OS)?;
    writeln!(f)?;
    writeln!(f, "Message:")?;
    writeln!(f, "{message}")?;
    if let Some(d) = details {
        writeln!(f)?;
        writeln!(f, "Details:")?;
        writeln!(f, "{d}")?;
    }
    Ok(path)
}

fn latest_report(dir: &Path) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    let mut best: Option<(u64, PathBuf)> = None;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if !name.starts_with(REPORT_PREFIX) {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        match &best {
            Some((best_mtime, _)) if *best_mtime >= modified => {}
            _ => best = Some((modified, path)),
        }
    }
    best.map(|(_, p)| p)
}

fn prune_old_reports(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut reports: Vec<(u64, PathBuf)> = entries
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            let name = path.file_name()?.to_str()?.to_string();
            if !name.starts_with(REPORT_PREFIX) {
                return None;
            }
            let mtime = e
                .metadata()
                .ok()?
                .modified()
                .ok()?
                .duration_since(UNIX_EPOCH)
                .ok()?
                .as_secs();
            Some((mtime, path))
        })
        .collect();
    if reports.len() <= MAX_REPORTS {
        return;
    }
    reports.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in reports.into_iter().skip(MAX_REPORTS) {
        let _ = fs::remove_file(path);
    }
}

/// Parse `crash-<ts>-<kind>.txt` into (timestamp, kind). Falls
/// back to (0, "unknown") for unrecognisable names.
fn parse_report_filename(path: &Path) -> (u64, String) {
    let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
        return (0, "unknown".to_string());
    };
    let rest = stem.strip_prefix(REPORT_PREFIX).unwrap_or(stem);
    // Expected: "<ts>-<kind>".
    let mut parts = rest.splitn(2, '-');
    let ts = parts.next().and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
    let kind = parts.next().unwrap_or("unknown").to_string();
    (ts, kind)
}

fn summary_from_report(content: &str) -> String {
    let mut in_message = false;
    for line in content.lines() {
        if !in_message {
            if line.starts_with("Message:") {
                in_message = true;
            }
            continue;
        }
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    "(no message captured)".to_string()
}

// ── Tauri commands ───────────────────────────────────────────────

/// Returns the pending crash report (if the previous session crashed)
/// and clears the slot so subsequent calls return None. Idempotent
/// from the frontend's perspective: call on mount, toast if Some.
#[tauri::command]
pub fn get_pending_crash_report() -> Option<CrashReport> {
    let path = pending_slot().lock().unwrap().take()?;
    let content = fs::read_to_string(&path).unwrap_or_default();
    let (timestamp, kind) = parse_report_filename(&path);
    Some(CrashReport {
        timestamp,
        kind,
        summary: summary_from_report(&content),
        file_path: path.to_string_lossy().into_owned(),
    })
}

/// Frontend-facing: write a crash report for an unhandled JS error
/// caught by `window.onerror` / `unhandledrejection`. Returns the
/// absolute path of the written file.
#[tauri::command]
pub fn report_js_crash(message: String, stack: Option<String>) -> Result<String, String> {
    let dir = crash_dir().ok_or_else(|| "crash dir not initialised".to_string())?;
    let path = write_report_into(dir, "js_unhandled", &message, stack.as_deref())
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
