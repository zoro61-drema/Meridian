use reqwest::{Client, StatusCode};
use std::time::Duration;

use crate::http::make_corporate_client;
use crate::storage::credentials::{get_credential, store_credential};

// ── Model catalogue ──────────────────────────────────────────────────────────
//
// Two paths feed the Settings dropdown, parallel to the Claude implementation:
//   1. API-key users: live `GET /v1beta/models?key=…` against
//      generativelanguage.googleapis.com. Filtered to Gemini text-generation
//      models, cached on disk so an offline launch still shows the most
//      recently-seen catalogue.
//   2. gemini-cli delegation users: no API key in the keychain (the CLI
//      handles its own auth). Fall back to GEMINI_BUILTIN_MODELS — the CLI
//      accepts the same model ids passed to `--model`, and users can add
//      newer ids via the Settings "Custom models" picker.

/// Curated fallback. Used when the live `/v1beta/models` fetch can't run
/// (delegation mode, no API key, network down) AND no live result has been
/// cached yet. Once the user has hit the live endpoint at least once, the
/// cached list supersedes this — so a delegation-mode user who briefly had
/// an API key configured retains the live catalogue across mode switches.
const GEMINI_BUILTIN_MODELS: &[(&str, &str)] = &[
    ("gemini-3.1-pro-preview", "Gemini 3.1 Pro (preview)"),
    ("gemini-3-flash-preview", "Gemini 3 Flash (preview)"),
    (
        "gemini-3.1-flash-lite-preview",
        "Gemini 3.1 Flash-Lite (preview)",
    ),
    ("gemini-2.5-pro", "Gemini 2.5 Pro"),
    ("gemini-2.5-flash", "Gemini 2.5 Flash"),
    ("gemini-2.5-flash-lite", "Gemini 2.5 Flash-Lite"),
];

/// Tier weight for sorting: pro > flash > flash-lite (descending capability).
/// Encoded so `tier_weight.cmp(&other)` puts pro first.
fn gemini_tier_weight(id: &str) -> u8 {
    let lower = id.to_lowercase();
    if lower.contains("flash-lite") {
        2
    } else if lower.contains("flash") {
        1
    } else if lower.contains("pro") {
        0
    } else {
        3
    }
}

/// Pretty label from an API model id. Falls back to the id if the shape
/// isn't recognised.
fn gemini_model_label(id: &str) -> String {
    let lower = id.to_lowercase();
    let tier = if lower.contains("flash-lite") {
        "Flash-Lite"
    } else if lower.contains("flash") {
        "Flash"
    } else if lower.contains("pro") {
        "Pro"
    } else {
        return id.to_string();
    };
    // Pull the version like "2.5" or "3.1" from the id.
    let version = id
        .split('-')
        .filter_map(|seg| seg.parse::<f32>().ok())
        .next()
        .map(|v| {
            if v.fract() == 0.0 {
                format!("{v:.0}")
            } else {
                format!("{v}")
            }
        });
    let preview = if lower.contains("preview") {
        " (preview)"
    } else {
        ""
    };
    match version {
        Some(v) => format!("Gemini {v} {tier}{preview}"),
        None => format!("Gemini {tier}{preview}"),
    }
}

/// Fetch the live model list from `GET /v1beta/models`, filter to current
/// Gemini text-generation models, sort by tier (Pro → Flash → Flash-Lite)
/// and newest-version-first. Returns Err on any network or parse failure
/// so callers can fall back gracefully.
async fn fetch_models_live(
    client: &Client,
    api_key: &str,
) -> Result<Vec<(String, String)>, String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models?key={api_key}&pageSize=200"
    );

    let resp = client
        .get(&url)
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

    let entries = json["models"]
        .as_array()
        .ok_or("Unexpected models API response shape")?;

    let mut models: Vec<(String, u8)> = entries
        .iter()
        .filter_map(|m| {
            // The API ships ids as `models/gemini-2.5-flash`; strip the prefix.
            let name = m["name"].as_str()?;
            let id = name.strip_prefix("models/").unwrap_or(name).to_string();

            // Gemini text-generation family only — drop embeddings, AQA,
            // image gen, and anything that doesn't list `generateContent`
            // among its supported methods.
            if !id.starts_with("gemini-") {
                return None;
            }
            if id.contains("embedding")
                || id.contains("aqa")
                || id.contains("imagen")
                || id.contains("image-generation")
                || id.contains("native-audio")
                || id.contains("tts")
                || id.contains("vision")
            {
                return None;
            }
            let supports_generate = m["supportedGenerationMethods"]
                .as_array()
                .map(|methods| {
                    methods
                        .iter()
                        .any(|s| s.as_str() == Some("generateContent"))
                })
                .unwrap_or(false);
            if !supports_generate {
                return None;
            }
            // Drop bare dated snapshots (gemini-2.5-flash-001) — the alias
            // (gemini-2.5-flash) is what users want by default. Heuristic:
            // last segment is 3 ASCII digits.
            if let Some(last) = id.rsplit('-').next() {
                if last.len() == 3 && last.chars().all(|c| c.is_ascii_digit()) {
                    return None;
                }
            }

            Some((id, gemini_tier_weight(name)))
        })
        .collect();

    if models.is_empty() {
        return Err("Models API returned no usable Gemini models".to_string());
    }

    // Sort by tier asc (Pro → Flash → Flash-Lite), then by id descending so
    // newer version numbers sort to the top within each tier (gemini-3.1
    // before gemini-2.5).
    models.sort_by(|a, b| a.1.cmp(&b.1).then(b.0.cmp(&a.0)));

    Ok(models
        .into_iter()
        .map(|(id, _)| {
            let label = gemini_model_label(&id);
            (id, label)
        })
        .collect())
}

// ── On-disk model-list cache ─────────────────────────────────────────────────
//
// Same pattern as the Anthropic catalogue cache: persist the most-recently-
// fetched live list under a single pref key so an offline launch still
// surfaces the right ids without snapping back to the hardcoded
// GEMINI_BUILTIN_MODELS list. Refreshed on every successful live fetch;
// only written when the id list actually changes.

const GEMINI_MODELS_CACHE_KEY: &str = "gemini_models_cache";

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiModelsCache {
    fetched_at_ms: u64,
    models: Vec<(String, String)>,
}

fn gemini_now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn read_cached_gemini_models() -> Option<GeminiModelsCache> {
    let raw = crate::storage::preferences::get_pref(GEMINI_MODELS_CACHE_KEY)?;
    serde_json::from_str::<GeminiModelsCache>(&raw).ok()
}

fn write_cached_gemini_models_if_changed(models: &[(String, String)]) {
    let new_ids: Vec<&str> = models.iter().map(|(id, _)| id.as_str()).collect();
    if let Some(existing) = read_cached_gemini_models() {
        let existing_ids: Vec<&str> = existing.models.iter().map(|(id, _)| id.as_str()).collect();
        if existing_ids == new_ids {
            return;
        }
    }
    let payload = GeminiModelsCache {
        fetched_at_ms: gemini_now_ms(),
        models: models.to_vec(),
    };
    let Ok(json) = serde_json::to_string(&payload) else {
        return;
    };
    let mut map = crate::storage::preferences::load_map();
    map.insert(GEMINI_MODELS_CACHE_KEY.to_string(), json);
    let _ = crate::storage::preferences::save_map(&map);
}

/// Result shape returned to the frontend — always carries a list (live,
/// cached, or hardcoded) plus an optional reason when the live fetch
/// couldn't run, so the Settings UI can surface a clear warning instead
/// of silently showing a stale catalogue.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiModelsResult {
    pub models: Vec<(String, String)>,
    pub fetch_error: Option<String>,
}

/// Cached-or-hardcoded fallback with `fetchError: None`. Used by the
/// no-live-fetch paths (CLI delegation, no API key configured).
fn gemini_cached_or_builtin() -> GeminiModelsResult {
    if let Some(cache) = read_cached_gemini_models() {
        return GeminiModelsResult {
            models: cache.models,
            fetch_error: None,
        };
    }
    GeminiModelsResult {
        models: GEMINI_BUILTIN_MODELS
            .iter()
            .map(|(id, label)| (id.to_string(), label.to_string()))
            .collect(),
        fetch_error: None,
    }
}

/// Cached or hardcoded fallback annotated with a fetch-error message —
/// used when the live fetch was attempted and failed, so the UI can warn
/// the user that they're looking at a potentially-stale list.
fn gemini_fallback_with_error(reason: String) -> GeminiModelsResult {
    if let Some(cache) = read_cached_gemini_models() {
        let age_secs = gemini_now_ms().saturating_sub(cache.fetched_at_ms) / 1000;
        return GeminiModelsResult {
            models: cache.models,
            fetch_error: Some(format!("{reason} Using cached list ({age_secs}s old).")),
        };
    }
    GeminiModelsResult {
        models: GEMINI_BUILTIN_MODELS
            .iter()
            .map(|(id, label)| (id.to_string(), label.to_string()))
            .collect(),
        fetch_error: Some(reason),
    }
}

const GEMINI_CUSTOM_MODELS_PREF: &str = "gemini_custom_models";

fn load_custom_gemini_models() -> Vec<String> {
    let Some(raw) = crate::storage::preferences::load_map()
        .get(GEMINI_CUSTOM_MODELS_PREF)
        .cloned()
    else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default()
}

fn save_custom_gemini_models(models: &[String]) -> Result<(), String> {
    let mut map = crate::storage::preferences::load_map();
    if models.is_empty() {
        map.remove(GEMINI_CUSTOM_MODELS_PREF);
    } else {
        let json = serde_json::to_string(models)
            .map_err(|e| format!("Failed to serialise custom models: {e}"))?;
        map.insert(GEMINI_CUSTOM_MODELS_PREF.to_string(), json);
    }
    crate::storage::preferences::save_map(&map)
}

/// Return the Gemini model catalogue for the Settings dropdown. Live-fetches
/// `/v1beta/models` when the user has an API key configured; for gemini-cli
/// delegation users (no key in the keychain — the CLI handles auth itself)
/// or for any auth-method state where we can't issue an authenticated call,
/// returns the cached or hardcoded fallback silently. User-added custom
/// model ids are appended on top.
#[tauri::command]
pub async fn get_gemini_models() -> Result<GeminiModelsResult, String> {
    let auth_method =
        get_credential("gemini_auth_method").unwrap_or_else(|| "api_key".to_string());

    let mut base: GeminiModelsResult = if auth_method == "gemini_cli" {
        // Delegation mode: no API key in our keychain. Cached/fallback
        // surfaces with no error since this is the expected state, not a
        // failure.
        gemini_cached_or_builtin()
    } else {
        let key = get_credential("gemini_api_key")
            .filter(|k| !k.trim().is_empty());
        match key {
            None => gemini_cached_or_builtin(),
            Some(api_key) => {
                let client = match make_corporate_client(Duration::from_secs(8), false) {
                    Ok(c) => c,
                    Err(e) => return Ok(gemini_fallback_with_error(format!(
                        "HTTP client init failed: {e}"
                    ))),
                };
                match fetch_models_live(&client, &api_key).await {
                    Ok(models) => {
                        write_cached_gemini_models_if_changed(&models);
                        GeminiModelsResult {
                            models,
                            fetch_error: None,
                        }
                    }
                    Err(e) => gemini_fallback_with_error(format!("Live model fetch failed: {e}")),
                }
            }
        }
    };

    // Append user-added custom models so the dropdown surfaces them whether
    // the live fetch succeeded or not. De-dupes against ids that already
    // appeared in the live/cached list.
    for id in load_custom_gemini_models() {
        if base.models.iter().any(|(existing, _)| existing == &id) {
            continue;
        }
        let display = format!("{id} (custom)");
        base.models.push((id, display));
    }

    Ok(base)
}

#[tauri::command]
pub fn get_custom_gemini_models() -> Result<Vec<String>, String> {
    Ok(load_custom_gemini_models())
}

#[tauri::command]
pub fn add_custom_gemini_model(model_id: String) -> Result<Vec<String>, String> {
    let id = model_id.trim().to_string();
    if id.is_empty() {
        return Err("Model ID cannot be empty.".to_string());
    }
    if GEMINI_BUILTIN_MODELS.iter().any(|(m, _)| *m == id) {
        return Err(format!("\"{id}\" is already a built-in model."));
    }
    let mut list = load_custom_gemini_models();
    if !list.contains(&id) {
        list.push(id);
    }
    save_custom_gemini_models(&list)?;
    Ok(list)
}

#[tauri::command]
pub fn remove_custom_gemini_model(model_id: String) -> Result<Vec<String>, String> {
    let id = model_id.trim();
    let mut list = load_custom_gemini_models();
    list.retain(|m| m != id);
    save_custom_gemini_models(&list)?;
    Ok(list)
}

#[tauri::command]
pub async fn validate_gemini(api_key: String) -> Result<String, String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Err("API key cannot be empty.".to_string());
    }

    let client = make_corporate_client(Duration::from_secs(10), false)
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let url =
        format!("https://generativelanguage.googleapis.com/v1beta/models?key={key}&pageSize=1");

    let resp = client.get(&url).send().await.map_err(|e| {
        if e.is_connect() || e.is_timeout() {
            "Could not reach generativelanguage.googleapis.com. \
                 Check your internet connection."
                .to_string()
        } else {
            format!("Request failed: {e}")
        }
    })?;

    match resp.status() {
        s if s.is_success() => {
            store_credential("gemini_api_key", key)?;
            store_credential("gemini_auth_method", "api_key")?;
            Ok("Connected to Gemini API successfully.".to_string())
        }
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err("Gemini rejected the API key. \
                 Check the key at console.cloud.google.com → APIs & Services → Credentials."
            .to_string()),
        s => Err(format!("Unexpected response from Gemini API (HTTP {s}).")),
    }
}

#[tauri::command]
pub async fn test_gemini_stored() -> Result<String, String> {
    let auth_method =
        get_credential("gemini_auth_method").unwrap_or_else(|| "api_key".to_string());

    if auth_method == "gemini_cli" {
        // CLI delegation — no HTTP endpoint to test; rerun the binary
        // detection probe so the Settings "Test connection" button
        // gives a useful answer here too.
        return detect_gemini_cli().await.map(|path| {
            format!("Gemini CLI detected at {path}.")
        });
    }

    let key = get_credential("gemini_api_key")
        .filter(|k| !k.trim().is_empty())
        .ok_or("Gemini API key not configured.")?;

    let client = make_corporate_client(Duration::from_secs(10), false)
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let url =
        format!("https://generativelanguage.googleapis.com/v1beta/models?key={key}&pageSize=1");
    let resp = client.get(&url).send().await.map_err(|e| {
        if e.is_connect() || e.is_timeout() {
            "Could not reach Google APIs. Check your internet connection.".to_string()
        } else {
            format!("Request failed: {e}")
        }
    })?;

    let status = resp.status();
    let body_text = resp.text().await.unwrap_or_default();
    match status {
        s if s.is_success() => Ok("Connected to Gemini API successfully.".to_string()),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
            Err(format!("Gemini rejected the stored API key (HTTP {status}). {body_text}"))
        }
        s => Err(format!(
            "Unexpected response from Gemini API (HTTP {s}). {body_text}"
        )),
    }
}

/// Look up `gemini` on PATH and return its absolute path. Used by the
/// Settings UI to surface a detected-at badge or a clear install hint
/// when the CLI is missing.
#[tauri::command]
pub async fn detect_gemini_cli() -> Result<String, String> {
    let output = std::process::Command::new("which")
        .arg("gemini")
        .output()
        .map_err(|e| format!("Failed to run `which gemini`: {e}"))?;
    if !output.status.success() {
        return Err(
            "Gemini CLI not found on PATH. Install with: npm install -g @google/gemini-cli"
                .to_string(),
        );
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return Err(
            "Gemini CLI not found on PATH. Install with: npm install -g @google/gemini-cli"
                .to_string(),
        );
    }
    Ok(path)
}

/// Switch the active Gemini auth mode to CLI delegation. Verifies the
/// CLI is on PATH, then writes `gemini_auth_method=gemini_cli`. Leaves
/// any pre-existing API key in the keychain inert; the sidecar reads
/// auth_method to decide which path to take.
#[tauri::command]
pub async fn enable_gemini_cli_delegation() -> Result<String, String> {
    let path = detect_gemini_cli().await?;
    store_credential("gemini_auth_method", "gemini_cli")?;
    Ok(format!("Using Gemini CLI at {path} for Google workflows."))
}
