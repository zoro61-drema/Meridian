use reqwest::Client;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use crate::http::make_corporate_client;
use crate::storage::credentials::get_credential;

// ── Review cancellation flag ─────────────────────────────────────────────────
// Set to true by `cancel_review`; polled in the chunk loop so the review stops
// cleanly between chunks without interrupting an in-flight HTTP request.

static REVIEW_CANCELLED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn cancel_review() {
    REVIEW_CANCELLED.store(true, Ordering::Relaxed);
}

pub fn is_cancelled() -> bool {
    REVIEW_CANCELLED.load(Ordering::Relaxed)
}

pub fn reset_cancellation() {
    REVIEW_CANCELLED.store(false, Ordering::Relaxed);
}

// ── Model catalogue ──────────────────────────────────────────────────────────
//
// Two paths feed the Settings dropdown:
//   1. API-key users: live `GET /v1/models` against api.anthropic.com.
//      Filtered to Claude 4.x+ Haiku/Sonnet/Opus, sorted by tier and
//      release date, cached on disk so an offline launch still shows the
//      most recently-seen catalogue.
//   2. Claude Code CLI users (delegation mode): no API key exists in the
//      keychain, so the live fetch can't run. Fall back to AVAILABLE_MODELS
//      below — the CLI accepts both aliases (`haiku`, `sonnet`, `opus`)
//      and full model ids passed to `--model`, so this list is a safe
//      starting point and the user can add a custom id later by typing
//      it into their preferences if a newer model is missing.

/// Derive a human-readable label from a model ID.
/// "claude-sonnet-4-6"        → "Claude Sonnet 4.6"
/// "claude-haiku-4-5-20251001"→ "Claude Haiku 4.5"
fn model_label(id: &str) -> String {
    let tier = if id.contains("opus") {
        "Opus"
    } else if id.contains("sonnet") {
        "Sonnet"
    } else if id.contains("haiku") {
        "Haiku"
    } else {
        return id.to_string();
    };

    // Extract the version number — look for the first digit segment ≥ 3 followed
    // by another digit segment (e.g. "4" then "6" → "4.6").
    let parts: Vec<&str> = id.split('-').collect();
    let version = parts.windows(2).find_map(|w| {
        let major: u32 = w[0].parse().ok()?;
        let minor: u32 = w[1].parse().ok()?;
        if major >= 3 {
            Some(format!("{major}.{minor}"))
        } else {
            None
        }
    });

    match version {
        Some(v) => format!("Claude {tier} {v}"),
        None => format!("Claude {tier}"),
    }
}

/// Tier sort weight: Haiku < Sonnet < Opus (ascending capability).
fn tier_weight(id: &str) -> u8 {
    if id.contains("haiku") {
        0
    } else if id.contains("sonnet") {
        1
    } else if id.contains("opus") {
        2
    } else {
        3
    }
}

/// Fetch the live model list from `GET /v1/models`, filter to current Claude
/// 4.x+ models, and return them sorted Haiku → Sonnet → Opus (newest version
/// first within each tier). Returns `Err` on any network or parse failure so
/// callers can fall back gracefully.
async fn fetch_models_live(
    client: &Client,
    api_key: &str,
) -> Result<Vec<(String, String)>, String> {
    let resp = client
        .get("https://api.anthropic.com/v1/models")
        .header("anthropic-version", "2023-06-01")
        .header("x-api-key", api_key)
        .send()
        .await
        .map_err(|e| format!("Models API request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Models API returned HTTP {}", resp.status()));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse models response: {e}"))?;

    let data = json["data"]
        .as_array()
        .ok_or("Unexpected models API response shape")?;

    let mut models: Vec<(String, i64, u8)> = data
        .iter()
        .filter_map(|m| {
            let id = m["id"].as_str()?;
            if !id.starts_with("claude-") {
                return None;
            }
            if id.contains("claude-3") || id.contains("instant") {
                return None;
            }
            if id.ends_with("-latest") || id.contains("preview") {
                return None;
            }
            if !id.contains("opus") && !id.contains("sonnet") && !id.contains("haiku") {
                return None;
            }
            let created: i64 = m["created_at"]
                .as_i64()
                .or_else(|| {
                    m["created_at"]
                        .as_str()
                        .and_then(|s| s.split('-').next()?.parse::<i64>().ok())
                })
                .unwrap_or(0);
            Some((id.to_string(), created, tier_weight(id)))
        })
        .collect();

    if models.is_empty() {
        return Err("Models API returned no usable models".to_string());
    }

    models.sort_by(|a, b| a.2.cmp(&b.2).then(b.1.cmp(&a.1)));

    Ok(models
        .into_iter()
        .map(|(id, _, _)| {
            let label = model_label(&id);
            (id, label)
        })
        .collect())
}

pub const DEFAULT_MODEL: &str = "claude-sonnet-4-6";

/// Static fallback used when the live API catalogue can't be fetched (no API
/// key configured, network down, etc). Kept in lock-step with the most-common
/// models Anthropic currently ships — the live fetch + on-disk cache below
/// supersede this whenever they're available. Users on Claude Code CLI
/// delegation always see this list because their auth lives in the CLI, not
/// the keychain.
pub const AVAILABLE_MODELS: &[(&str, &str)] = &[
    ("claude-haiku-4-5", "Claude Haiku 4.5  — Fastest"),
    (
        "claude-sonnet-4-6",
        "Claude Sonnet 4.6 — Balanced (recommended)",
    ),
    ("claude-opus-4-7", "Claude Opus 4.7   — Most capable"),
];

// ── On-disk model-list cache ─────────────────────────────────────────────────
//
// Stored as a JSON envelope under the `claude_models_cache` pref so the
// Settings dropdown can fall back to the most-recently-fetched live list when
// the network is down or the user is offline — without that, the dropdown
// snaps back to the hardcoded AVAILABLE_MODELS const, which goes stale every
// time Anthropic releases a new model. Refreshed on every successful live
// fetch; only written when the model id list actually changes so the prefs
// file isn't rewritten on every Settings open.

const MODEL_CACHE_KEY: &str = "claude_models_cache";

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeModelsCache {
    /// Milliseconds since the Unix epoch — same convention used elsewhere
    /// in the app for timestamps written to disk (see ai_traffic.rs).
    fetched_at_ms: u64,
    /// (id, label) tuples in the same order returned by `fetch_models_live`.
    models: Vec<(String, String)>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn read_cached_models() -> Option<ClaudeModelsCache> {
    let raw = crate::storage::preferences::get_pref(MODEL_CACHE_KEY)?;
    serde_json::from_str::<ClaudeModelsCache>(&raw).ok()
}

/// Persist a freshly-fetched list to the prefs cache. No-op when the new list
/// is identical (by id) to what's already cached — comparison is by model id
/// rather than label so a labelling-only change doesn't churn the prefs file.
fn write_cached_models_if_changed(models: &[(String, String)]) {
    let new_ids: Vec<&str> = models.iter().map(|(id, _)| id.as_str()).collect();
    if let Some(existing) = read_cached_models() {
        let existing_ids: Vec<&str> = existing.models.iter().map(|(id, _)| id.as_str()).collect();
        if existing_ids == new_ids {
            return;
        }
    }
    let payload = ClaudeModelsCache {
        fetched_at_ms: now_ms(),
        models: models.to_vec(),
    };
    let Ok(json) = serde_json::to_string(&payload) else {
        return;
    };
    let mut map = crate::storage::preferences::load_map();
    map.insert(MODEL_CACHE_KEY.to_string(), json);
    let _ = crate::storage::preferences::save_map(&map);
}

/// Result returned to the frontend from `get_claude_models`. We always return
/// *some* list (live or fallback) so the dropdown is never empty; `fetchError`
/// signals when the live fetch failed and the fallback was used so the UI can
/// surface that to the user instead of silently showing a stale list.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeModelsResult {
    pub models: Vec<(String, String)>,
    pub fetch_error: Option<String>,
}

/// Build a fallback result when the live fetch can't run. Prefers the on-disk
/// cache (last-known-good live list) over the hardcoded AVAILABLE_MODELS const
/// — so a user who's hit the live endpoint at least once sees their newest
/// models in the dropdown even when offline.
fn fallback_models_with_error(reason: String) -> ClaudeModelsResult {
    if let Some(cache) = read_cached_models() {
        let age_secs = now_ms().saturating_sub(cache.fetched_at_ms) / 1000;
        return ClaudeModelsResult {
            models: cache.models,
            fetch_error: Some(format!("{reason} Using cached list ({age_secs}s old).")),
        };
    }
    let models = AVAILABLE_MODELS
        .iter()
        .map(|(id, label)| (id.to_string(), label.to_string()))
        .collect();
    ClaudeModelsResult {
        models,
        fetch_error: Some(reason),
    }
}

/// Return the model catalogue for the settings UI. Tries the live
/// `/v1/models` endpoint only when the user is on the API-key path AND the
/// stored credential actually looks like an API key (`sk-ant-api…`). For
/// Claude Code CLI users — and for the orphaned-token case where a pre-pivot
/// `sk-ant-oat01-…` is still sitting in the keychain — returns the cached
/// catalogue or hardcoded fallback silently, since neither has an API
/// surface we can call from the embedder.
#[tauri::command]
pub async fn get_claude_models() -> ClaudeModelsResult {
    let auth_method = get_credential("claude_auth_method").unwrap_or_else(|| "api_key".to_string());

    // CLI delegation mode never has an API key in our keychain — the CLI
    // handles auth itself. Return the cached/fallback list with no error so
    // the dropdown doesn't surface a misleading "couldn't fetch" warning.
    if auth_method == "claude_code" {
        return cached_or_builtin_models();
    }

    // API-key mode: only attempt the live fetch when the stored credential
    // actually looks like a Console API key. An `sk-ant-oat01-…` OAuth token
    // left over from before the 2026-05-10 auth pivot hits the live endpoint
    // with `x-api-key: sk-ant-oat01-…` and 401s, which is a confusing error
    // to surface for a user whose effective auth mode is now CLI delegation.
    let api_key = match get_credential("anthropic_api_key") {
        Some(k) if k.trim().starts_with("sk-ant-api") => k,
        _ => return cached_or_builtin_models(),
    };

    let client = match make_corporate_client(Duration::from_secs(8), false) {
        Ok(c) => c,
        Err(e) => return fallback_models_with_error(format!("HTTP client init failed: {e}")),
    };

    match fetch_models_live(&client, &api_key).await {
        Ok(models) => {
            // Refresh the on-disk cache so a future offline launch shows
            // whatever Anthropic exposed on this fetch — keeps the dropdown
            // current with new model releases without the user having to
            // wait for the next successful network call.
            write_cached_models_if_changed(&models);
            ClaudeModelsResult {
                models,
                fetch_error: None,
            }
        }
        Err(e) => fallback_models_with_error(format!("Live model fetch failed: {e}")),
    }
}

/// Return the cached live list if any, otherwise the hardcoded fallback,
/// always with `fetch_error: None`. Used by the no-live-fetch paths
/// (CLI delegation, no API key, orphaned OAuth token).
fn cached_or_builtin_models() -> ClaudeModelsResult {
    if let Some(cache) = read_cached_models() {
        return ClaudeModelsResult {
            models: cache.models,
            fetch_error: None,
        };
    }
    ClaudeModelsResult {
        models: AVAILABLE_MODELS
            .iter()
            .map(|(id, label)| (id.to_string(), label.to_string()))
            .collect(),
        fetch_error: None,
    }
}

pub fn get_active_model() -> String {
    get_credential("claude_model")
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string())
}
