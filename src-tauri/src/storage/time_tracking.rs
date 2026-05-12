//! Persistence for the auto work-hours tracker.
//!
//! Two write targets, by design:
//!
//!   1. **Live local copy** — `app_data_dir/time_tracking.json`. Every
//!      heartbeat tick (~every 5s in steady state) writes here. This is
//!      the canonical source of truth at runtime.
//!   2. **Cloud snapshot** — `<data_dir>/time_tracking.json`. Written at
//!      most once every `SNAPSHOT_INTERVAL` (default: 24h). When the
//!      user's configured data_dir is a cloud-synced folder (Dropbox /
//!      iCloud / OneDrive), this keeps the cloud uploader from getting
//!      hammered by every-5-second deltas, while still giving them a
//!      reasonably-current copy for multi-machine use and for the
//!      `move_data_directory` migration path.
//!
//! When `data_dir == app_data_dir` (user hasn't customised it), the
//! snapshot path collapses into the live path and we only write once.
//!
//! Load order:
//!   - Read the live local copy if present (the steady-state hot path
//!     after first run).
//!   - Otherwise read the cloud snapshot, write it to the local copy
//!     so subsequent loads hit the live path, and return it. This is
//!     what makes a fresh install on a new machine pick up the
//!     existing cloud data.
//!   - Otherwise check the legacy `store_cache/` location and migrate
//!     it across.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use tauri::Manager;

use crate::storage::preferences::resolve_data_dir;

const FILENAME: &str = "time_tracking.json";

/// How often to copy the live local file to the cloud-resident `data_dir`.
/// 24h matches the user's expectation: "update the cloud copy every 24
/// hours or so". Tighten this constant if recovery-after-crash becomes a
/// concern — but day-grained snapshots are fine because the live local
/// copy already covers crash recovery on the same machine.
const SNAPSHOT_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);

/// Cache the last successful snapshot time so we don't have to `stat` the
/// cloud file on every save. `None` means "not yet checked this session" —
/// the next `save` will seed from the file's mtime if it exists, or take
/// a snapshot if it doesn't.
static LAST_SNAPSHOT_AT: Mutex<Option<SystemTime>> = Mutex::new(None);

fn local_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;
    Ok(dir.join(FILENAME))
}

fn snapshot_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = resolve_data_dir(app)?;
    Ok(dir.join(FILENAME))
}

/// Path that store_cache used to use, so we can migrate one-time on first
/// load. Built directly here (rather than depending on `store_cache::cache_dir`)
/// to avoid resurrecting a cache directory that may have been cleared.
fn legacy_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?;
    Ok(base
        .join("store_cache")
        .join("meridian-time-tracking-store.json"))
}

/// Atomically write `json` to `path` via a sibling temp file + rename.
fn atomic_write(path: &PathBuf, json: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create dir: {e}"))?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json.as_bytes()).map_err(|e| format!("Cannot write tmp file: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("Cannot finalise write: {e}"))?;
    Ok(())
}

pub fn save(app: &tauri::AppHandle, json: String) -> Result<(), String> {
    let local = local_path(app)?;
    atomic_write(&local, &json)?;

    // Mirror to the user-configured data_dir, but only on a slow cadence
    // so a cloud-drive data_dir isn't getting hammered by every heartbeat
    // tick. When data_dir == app_data_dir (no custom override), the paths
    // are identical and we skip the redundant second write.
    let snapshot = snapshot_path(app)?;
    if snapshot == local {
        return Ok(());
    }

    if !should_snapshot_now(&snapshot) {
        return Ok(());
    }

    // Best-effort. The cloud copy lagging by a tick is fine; what we don't
    // want is a transient cloud-drive hiccup propagating back to the
    // frontend as a save failure.
    if atomic_write(&snapshot, &json).is_ok() {
        if let Ok(mut guard) = LAST_SNAPSHOT_AT.lock() {
            *guard = Some(SystemTime::now());
        }
    }
    Ok(())
}

/// Force a snapshot to the data_dir target on the next save, regardless
/// of the 24-hour timer. Called when something has changed that the user
/// would reasonably expect to land on disk soon — e.g. after moving
/// data_dir, the new location should receive a fresh snapshot on the next
/// save rather than waiting up to a day for the timer to elapse.
pub fn invalidate_snapshot_throttle() {
    if let Ok(mut guard) = LAST_SNAPSHOT_AT.lock() {
        *guard = Some(SystemTime::UNIX_EPOCH);
    }
}

fn should_snapshot_now(snapshot: &PathBuf) -> bool {
    let now = SystemTime::now();

    // Fast path: cached value from earlier in this session.
    if let Ok(guard) = LAST_SNAPSHOT_AT.lock() {
        if let Some(last) = *guard {
            return now
                .duration_since(last)
                .map(|d| d >= SNAPSHOT_INTERVAL)
                .unwrap_or(true);
        }
    }

    // Slow path: first save of the session. Seed from the cloud file's
    // mtime so app restarts don't trigger an immediate snapshot just
    // because the in-memory cache was cleared. If there's no cloud copy
    // yet, take one straight away.
    let seed = fs::metadata(snapshot)
        .and_then(|m| m.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH);

    if let Ok(mut guard) = LAST_SNAPSHOT_AT.lock() {
        *guard = Some(seed);
    }

    now.duration_since(seed)
        .map(|d| d >= SNAPSHOT_INTERVAL)
        .unwrap_or(true)
}

/// Load the persisted state, preferring the live local copy. Falls back
/// to the cloud-resident `<data_dir>/time_tracking.json` (and one-time
/// pulls it into the local copy so the next read hits the fast path),
/// then to the legacy `store_cache/` location.
pub fn load(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let local = local_path(app)?;
    if local.exists() {
        return fs::read_to_string(&local)
            .map(Some)
            .map_err(|e| format!("Cannot read time tracking (local): {e}"));
    }

    // Pull from the data_dir snapshot if present.
    let snapshot = snapshot_path(app)?;
    if snapshot.exists() && snapshot != local {
        let raw = fs::read_to_string(&snapshot)
            .map_err(|e| format!("Cannot read time tracking (snapshot): {e}"))?;
        // Seed the local copy so subsequent saves don't re-snapshot
        // immediately (we just consumed the cloud copy's mtime as the
        // baseline). Best-effort.
        let _ = atomic_write(&local, &raw);
        return Ok(Some(raw));
    }

    // Legacy store_cache fallback (first-run migration only).
    let legacy = legacy_path(app)?;
    if legacy.exists() {
        let raw = fs::read_to_string(&legacy)
            .map_err(|e| format!("Cannot read legacy time tracking: {e}"))?;
        let _ = atomic_write(&local, &raw);
        let _ = fs::remove_file(&legacy);
        return Ok(Some(raw));
    }
    Ok(None)
}
