// GitHub Copilot integration.
//
// Two auth surfaces:
//
//   1. CLI delegation (default, primary): spawn `copilot -p` per call.
//      The user signs in once via `copilot login`; Meridian never sees
//      credentials and runs the binary like a black box. This is the
//      path that actually runs workflows.
//
//   2. PAT-based model fetcher (optional, opt-in): a fine-grained
//      GitHub PAT with the "Copilot Requests" permission, pasted by
//      the user into Settings. Used ONLY to fetch the plan-specific
//      model catalogue — workflows still go through the CLI. The PAT
//      is exchanged for a short-lived Copilot session token at
//      `api.github.com/copilot_internal/v2/token`, which is then used
//      to call `api.githubcopilot.com/models`. The response is filtered
//      to chat-capable model_picker_enabled entries and cached on
//      disk so the Settings dropdown stays populated when offline.
//
// The PAT path lives in the same TOS-gray zone every third-party
// Copilot client occupies (Zed, Cursor, copilot-api, ericc-ch/copilot-api
// etc.). It's deliberately opt-in — the default state is "CLI only,
// hardcoded list" so we don't dip into the gray zone for users who
// haven't asked for it. Headers identify Meridian honestly; we don't
// impersonate VS Code's Editor-Version / Copilot-Integration-Id values.
//
// History: an earlier (deleted 2026-05-10) Copilot OAuth flow was
// removed for impersonating VS Code's first-party OAuth client. This
// PAT path is materially different — the user generates a GitHub-
// issued PAT with a permission scope GitHub created specifically for
// third-party Copilot access, and Meridian uses it directly. No
// client-string spoofing, no OAuth app impersonation.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::http::make_corporate_client;
use crate::storage::credentials::{get_credential, store_credential};

/// Curated built-in model list. Used as the fallback list when the user
/// hasn't configured a PAT for live fetching. Mirrors the actual model
/// picker shown by `copilot /model`, including premium-request
/// multipliers in the label so users can see relative cost at a glance.
///
/// IDs are hyphenated (not dot-separated) — the CLI rejects
/// `claude-sonnet-4.6` with `Model "…" from --model flag is not
/// available.` because the literal id is malformed.
///
/// Order matches `copilot /model`: Auto first, then Premium models
/// (alphabetical), then Standard models (zero-cost / included).
pub const COPILOT_BUILTIN_MODELS: &[(&str, &str)] = &[
    ("auto", "Auto (Copilot picks)"),
    // Premium models — count against your monthly request allowance
    // at the listed multiplier.
    ("claude-haiku-4-5", "Claude Haiku 4.5 — 0.33x"),
    ("claude-opus-4-5", "Claude Opus 4.5 — 3x"),
    ("claude-opus-4-6", "Claude Opus 4.6 — 3x"),
    ("claude-opus-4-7", "Claude Opus 4.7 — 15x"),
    ("claude-sonnet-4-5", "Claude Sonnet 4.5 — 1x"),
    ("claude-sonnet-4-6", "Claude Sonnet 4.6 — 1x"),
    ("gpt-5-2", "GPT-5.2 — 1x"),
    ("gpt-5-2-codex", "GPT-5.2 Codex — 1x"),
    ("gpt-5-3-codex", "GPT-5.3 Codex — 1x"),
    ("gpt-5-4", "GPT-5.4 — 1x"),
    ("gpt-5-4-mini", "GPT-5.4 Mini — 0.33x"),
    ("gpt-5-5", "GPT-5.5 — 7.5x"),
    ("gemini-2-5-pro", "Gemini 2.5 Pro — 1x"),
    ("grok-code-fast-1", "Grok Code Fast 1 — 0.25x"),
    // Standard models — included with the subscription, no
    // premium-request cost.
    ("gpt-4-1", "GPT-4.1 — included"),
    ("gpt-4o", "GPT-4o — included"),
    ("gpt-5-mini", "GPT-5 Mini — included"),
];

pub const DEFAULT_MODEL: &str = "auto";

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotModelsResult {
    pub models: Vec<(String, String)>,
    /// Non-null when a live fetch was attempted (PAT was configured) but
    /// failed — Settings surfaces it so the user knows they're looking
    /// at a fallback list rather than their actual plan-specific one.
    pub fetch_error: Option<String>,
}

const COPILOT_CUSTOM_MODELS_PREF: &str = "copilot_custom_models";
const COPILOT_MODELS_CACHE_KEY: &str = "copilot_models_cache";

// ── PAT-based live fetch ──────────────────────────────────────────────────────
//
// Two-step dance: the PAT (long-lived, user-issued) is exchanged for a
// short-lived Copilot session token at copilot_internal/v2/token, which
// is then used to call the actual models endpoint. The endpoint URL
// comes back in the exchange response so we don't hardcode the
// `api.githubcopilot.com` host — GitHub may route different users to
// different shards.

#[derive(Deserialize)]
struct CopilotSessionTokenResponse {
    token: String,
    endpoints: CopilotEndpoints,
}

#[derive(Deserialize)]
struct CopilotEndpoints {
    api: String,
}

#[derive(Deserialize)]
struct CopilotModelsResponse {
    data: Vec<CopilotModelEntry>,
}

#[derive(Deserialize)]
struct CopilotModelEntry {
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    model_picker_enabled: bool,
    #[serde(default)]
    capabilities: Option<CopilotModelCapabilities>,
    #[serde(default)]
    billing: Option<CopilotModelBilling>,
}

#[derive(Deserialize)]
struct CopilotModelCapabilities {
    #[serde(rename = "type", default)]
    kind: String,
}

#[derive(Deserialize)]
struct CopilotModelBilling {
    #[serde(default)]
    multiplier: Option<f64>,
    #[serde(default)]
    is_premium: Option<bool>,
}

/// Identifies Meridian honestly to the Copilot API — no VS-Code
/// impersonation. The exact values aren't validated server-side, but
/// they appear in GitHub's request logs, so we want them clearly
/// attributable to this project.
fn add_copilot_headers(req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    req.header("User-Agent", "Meridian/0.1.0")
        .header("Editor-Version", "Meridian/0.1.0")
        .header("Editor-Plugin-Version", "meridian-copilot/0.1.0")
        .header("Accept", "application/json")
}

async fn mint_session_token(
    client: &Client,
    pat: &str,
) -> Result<CopilotSessionTokenResponse, String> {
    let resp = add_copilot_headers(
        client
            .get("https://api.github.com/copilot_internal/v2/token")
            .header("Authorization", format!("Bearer {pat}")),
    )
    .send()
    .await
    .map_err(|e| {
        if e.is_connect() || e.is_timeout() {
            "Could not reach api.github.com. Check your internet connection.".to_string()
        } else {
            format!("Token exchange request failed: {e}")
        }
    })?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        let hint = match status.as_u16() {
            401 | 403 => " — the PAT may be missing the 'Copilot Requests' permission or your account doesn't have an active Copilot subscription.",
            404 => " — the copilot_internal endpoint is unreachable; this account may not be eligible.",
            _ => "",
        };
        return Err(format!("GitHub returned HTTP {status} on token exchange{hint}: {body}"));
    }

    resp.json::<CopilotSessionTokenResponse>()
        .await
        .map_err(|e| format!("Failed to parse session-token response: {e}"))
}

async fn fetch_models_via_pat(pat: &str) -> Result<Vec<(String, String)>, String> {
    let client = make_corporate_client(Duration::from_secs(15), false)
        .map_err(|e| format!("HTTP client init failed: {e}"))?;
    let session = mint_session_token(&client, pat).await?;

    let url = format!(
        "{}/models",
        session.endpoints.api.trim_end_matches('/')
    );
    let resp = add_copilot_headers(
        client
            .get(&url)
            .header("Authorization", format!("Bearer {}", session.token)),
    )
    .send()
    .await
    .map_err(|e| format!("Models request failed: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Copilot API returned HTTP {status}: {body}"));
    }

    let payload: CopilotModelsResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse models response: {e}"))?;

    // Filter to chat-capable, picker-visible entries. The endpoint
    // returns embeddings models and internal variants too; the CLI's
    // own picker only shows the chat ones, so we match that.
    let mut entries: Vec<(String, String, f64, bool)> = payload
        .data
        .into_iter()
        .filter(|m| m.model_picker_enabled)
        .filter(|m| {
            m.capabilities
                .as_ref()
                .map(|c| c.kind == "chat")
                .unwrap_or(true)
        })
        .map(|m| {
            let multiplier = m.billing.as_ref().and_then(|b| b.multiplier).unwrap_or(0.0);
            let is_premium = m.billing.as_ref().and_then(|b| b.is_premium).unwrap_or(multiplier > 0.0);
            let display = format_live_label(
                m.name.as_deref().unwrap_or(&m.id),
                multiplier,
                is_premium,
            );
            (m.id, display, multiplier, is_premium)
        })
        .collect();

    // Sort: standard (zero-cost) models first, then premium models
    // ascending by multiplier (cheapest premium first). Within a tier,
    // alphabetical by id for stability across runs.
    entries.sort_by(|a, b| {
        a.3.cmp(&b.3)
            .then(a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal))
            .then(a.0.cmp(&b.0))
    });

    let mut out = vec![("auto".to_string(), "Auto (Copilot picks)".to_string())];
    out.extend(entries.into_iter().map(|(id, name, _, _)| (id, name)));
    Ok(out)
}

fn format_live_label(name: &str, multiplier: f64, is_premium: bool) -> String {
    if !is_premium {
        return format!("{name} — included");
    }
    // Trim trailing zeros so 1.00 → "1", 0.33 → "0.33".
    let mult = if (multiplier - multiplier.round()).abs() < f64::EPSILON {
        format!("{}", multiplier as i64)
    } else {
        // Two decimal places, then strip trailing zeros and possibly the dot.
        let s = format!("{:.2}", multiplier);
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    };
    format!("{name} — {mult}x")
}

// ── Cache ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CopilotModelsCache {
    fetched_at_ms: u64,
    models: Vec<(String, String)>,
}

fn copilot_now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn read_cached_copilot_models() -> Option<CopilotModelsCache> {
    let raw = crate::storage::preferences::get_pref(COPILOT_MODELS_CACHE_KEY)?;
    serde_json::from_str(&raw).ok()
}

fn write_cached_copilot_models_if_changed(models: &[(String, String)]) {
    let new_ids: Vec<&str> = models.iter().map(|(id, _)| id.as_str()).collect();
    if let Some(existing) = read_cached_copilot_models() {
        let existing_ids: Vec<&str> =
            existing.models.iter().map(|(id, _)| id.as_str()).collect();
        if existing_ids == new_ids {
            return;
        }
    }
    let payload = CopilotModelsCache {
        fetched_at_ms: copilot_now_ms(),
        models: models.to_vec(),
    };
    let Ok(json) = serde_json::to_string(&payload) else {
        return;
    };
    let mut map = crate::storage::preferences::load_map();
    map.insert(COPILOT_MODELS_CACHE_KEY.to_string(), json);
    let _ = crate::storage::preferences::save_map(&map);
}


fn load_custom_copilot_models() -> Vec<String> {
    let Some(raw) = crate::storage::preferences::load_map()
        .get(COPILOT_CUSTOM_MODELS_PREF)
        .cloned()
    else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default()
}

fn save_custom_copilot_models(models: &[String]) -> Result<(), String> {
    let mut map = crate::storage::preferences::load_map();
    if models.is_empty() {
        map.remove(COPILOT_CUSTOM_MODELS_PREF);
    } else {
        let json = serde_json::to_string(models)
            .map_err(|e| format!("Failed to serialise custom models: {e}"))?;
        map.insert(COPILOT_CUSTOM_MODELS_PREF.to_string(), json);
    }
    crate::storage::preferences::save_map(&map)
}

/// Return the Copilot model catalogue for the Settings dropdown. Three
/// paths, in order of preference:
///   1. PAT configured + live fetch succeeds → user's actual plan models.
///   2. PAT configured + fetch fails → last cached live result, with a
///      fetchError set so Settings surfaces the warning.
///   3. No PAT → hardcoded built-in list (no live fetch attempted).
/// User-added custom models append to whichever list is in play.
#[tauri::command]
pub async fn get_copilot_models() -> Result<CopilotModelsResult, String> {
    let pat = get_credential("copilot_github_pat").filter(|p| !p.trim().is_empty());

    let (mut models, fetch_error): (Vec<(String, String)>, Option<String>) = match pat {
        Some(pat) => match fetch_models_via_pat(&pat).await {
            Ok(live) => {
                write_cached_copilot_models_if_changed(&live);
                (live, None)
            }
            Err(e) => {
                // Live fetch failed — surface the cached list if any, else
                // the hardcoded fallback, but always with the error attached
                // so the Settings UI can warn the user.
                let fallback = read_cached_copilot_models()
                    .map(|c| {
                        let age_secs = copilot_now_ms().saturating_sub(c.fetched_at_ms) / 1000;
                        (c.models, format!("{e} Using cached list ({age_secs}s old)."))
                    })
                    .unwrap_or_else(|| {
                        (
                            COPILOT_BUILTIN_MODELS
                                .iter()
                                .map(|(id, label)| (id.to_string(), label.to_string()))
                                .collect(),
                            e,
                        )
                    });
                (fallback.0, Some(fallback.1))
            }
        },
        None => (
            COPILOT_BUILTIN_MODELS
                .iter()
                .map(|(id, label)| (id.to_string(), label.to_string()))
                .collect(),
            None,
        ),
    };

    for id in load_custom_copilot_models() {
        if models.iter().any(|(existing, _)| existing == &id) {
            continue;
        }
        let display = format!("{id} (custom)");
        models.push((id, display));
    }
    Ok(CopilotModelsResult { models, fetch_error })
}

/// Validate a GitHub PAT by doing the full token-exchange + models-fetch
/// round-trip. On success, stores the PAT in the keychain and refreshes
/// the model-list cache. On failure, returns a clear error and stores
/// nothing — callers can branch on the result to decide whether to
/// switch the UI to "PAT configured" state.
#[tauri::command]
pub async fn validate_copilot_pat(pat: String) -> Result<String, String> {
    let trimmed = pat.trim();
    if trimmed.is_empty() {
        return Err("PAT cannot be empty.".to_string());
    }
    // Fine-grained PATs are `github_pat_…`; classic PATs are `ghp_…`.
    // The CLI's own help text says PATs need the "Copilot Requests"
    // permission, which is a fine-grained-only scope — classic PATs
    // can't grant it. But validate the format only loosely so a future
    // PAT format change (or an OAuth-app installation token, which
    // starts `gho_`) doesn't reject pre-emptively. The endpoint will
    // tell us authoritatively.
    if !trimmed.starts_with("github_pat_")
        && !trimmed.starts_with("ghp_")
        && !trimmed.starts_with("gho_")
    {
        return Err(
            "Expected a GitHub token (fine-grained `github_pat_…`, classic `ghp_…`, or OAuth `gho_…`)."
                .to_string(),
        );
    }
    let models = fetch_models_via_pat(trimmed).await?;
    store_credential("copilot_github_pat", trimmed)?;
    write_cached_copilot_models_if_changed(&models);
    let count = models.len().saturating_sub(1); // minus the "auto" entry
    Ok(format!(
        "Connected. Found {count} model{} on your Copilot plan.",
        if count == 1 { "" } else { "s" }
    ))
}

/// Test the already-stored Copilot PAT without re-saving. Used by the
/// "Test connection" button after the user has saved a PAT.
#[tauri::command]
pub async fn test_copilot_pat_stored() -> Result<String, String> {
    let pat = get_credential("copilot_github_pat")
        .filter(|p| !p.trim().is_empty())
        .ok_or("No Copilot PAT configured.")?;
    let models = fetch_models_via_pat(&pat).await?;
    write_cached_copilot_models_if_changed(&models);
    let count = models.len().saturating_sub(1);
    Ok(format!(
        "Connected. {count} model{} available on your Copilot plan.",
        if count == 1 { "" } else { "s" }
    ))
}

#[tauri::command]
pub fn get_custom_copilot_models() -> Result<Vec<String>, String> {
    Ok(load_custom_copilot_models())
}

#[tauri::command]
pub fn add_custom_copilot_model(model_id: String) -> Result<Vec<String>, String> {
    let id = model_id.trim().to_string();
    if id.is_empty() {
        return Err("Model ID cannot be empty.".to_string());
    }
    if COPILOT_BUILTIN_MODELS.iter().any(|(m, _)| *m == id) {
        return Err(format!("\"{id}\" is already a built-in model."));
    }
    let mut list = load_custom_copilot_models();
    if !list.contains(&id) {
        list.push(id);
    }
    save_custom_copilot_models(&list)?;
    Ok(list)
}

#[tauri::command]
pub fn remove_custom_copilot_model(model_id: String) -> Result<Vec<String>, String> {
    let id = model_id.trim();
    let mut list = load_custom_copilot_models();
    list.retain(|m| m != id);
    save_custom_copilot_models(&list)?;
    Ok(list)
}

/// Look up `copilot` on PATH and return its absolute path. Used by the
/// Settings UI to surface "detected at /…" or a clear install hint.
#[tauri::command]
pub async fn detect_copilot_cli() -> Result<String, String> {
    let output = std::process::Command::new("which")
        .arg("copilot")
        .output()
        .map_err(|e| format!("Failed to run `which copilot`: {e}"))?;
    if !output.status.success() {
        return Err(
            "Copilot CLI not found on PATH. Install with: npm install -g @github/copilot"
                .to_string(),
        );
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return Err(
            "Copilot CLI not found on PATH. Install with: npm install -g @github/copilot"
                .to_string(),
        );
    }
    Ok(path)
}

/// Switch the active Copilot auth mode to CLI delegation. Verifies the
/// CLI is on PATH, then writes `copilot_auth_method=copilot_cli`. The
/// sidecar dispatcher reads that key to decide which adapter to build.
#[tauri::command]
pub async fn enable_copilot_cli_delegation() -> Result<String, String> {
    let path = detect_copilot_cli().await?;
    store_credential("copilot_auth_method", "copilot_cli")?;
    Ok(format!(
        "Using Copilot CLI at {path} for GitHub Copilot workflows."
    ))
}

/// Test the already-stored Copilot configuration. For the CLI delegation
/// path that's a re-detect — there's no remote endpoint we can hit
/// without going through the CLI itself.
#[tauri::command]
pub async fn test_copilot_stored() -> Result<String, String> {
    let path = detect_copilot_cli().await?;
    Ok(format!("Copilot CLI detected at {path}."))
}

pub fn get_active_model() -> String {
    crate::storage::preferences::get_pref("copilot_model")
        .or_else(|| get_credential("copilot_model"))
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string())
}
