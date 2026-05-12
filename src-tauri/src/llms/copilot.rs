// GitHub Copilot CLI integration.
//
// CLI delegation only. The user signs in once via `copilot login`;
// Meridian never sees credentials and runs the binary like a black
// box. There is no live-fetch path for the model catalogue — GitHub's
// programmatic endpoints (`copilot_internal/v2/token`,
// `api.githubcopilot.com/*`) validate client-identity headers and
// reject anything that doesn't impersonate VS Code, which is the
// TOS-violating posture the 2026-05-10 cleanup removed. So Meridian
// ships a curated built-in list (mirroring `copilot /model`) and a
// custom-models picker for ids GitHub adds between releases.
//
// History note: a PAT-based live fetcher landed briefly in commit
// d49a176 and was reverted because GitHub's identity-header validation
// makes honest, non-impersonating client requests return 403. Open
// feature requests on github/copilot-cli (#700, #1356) ask for a
// programmatic model-list command — until that lands, the static
// list is the cleanest path.

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
    ("gemini-2.5-pro", "Gemini 2.5 Pro — 1x"),
    ("grok-code-fast-1", "Grok Code Fast 1 — 0.25x"),
    // Standard models — included with the subscription, no
    // premium-request cost.
    ("gpt-4.1", "GPT-4.1 — included"),
    ("gpt-4o", "GPT-4o — included"),
    ("gpt-5-mini", "GPT-5 Mini — included"),
];

pub const DEFAULT_MODEL: &str = "auto";

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotModelsResult {
    pub models: Vec<(String, String)>,
}

const COPILOT_CUSTOM_MODELS_PREF: &str = "copilot_custom_models";


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

/// Return the Copilot model catalogue for the Settings dropdown.
/// Built-in list (mirrors `copilot /model`) plus any user-added custom
/// ids. No live fetch — GitHub's models endpoint validates IDE-identity
/// headers that we won't impersonate.
#[tauri::command]
pub async fn get_copilot_models() -> Result<CopilotModelsResult, String> {
    let mut models: Vec<(String, String)> = COPILOT_BUILTIN_MODELS
        .iter()
        .map(|(id, label)| (id.to_string(), label.to_string()))
        .collect();
    for id in load_custom_copilot_models() {
        if models.iter().any(|(existing, _)| existing == &id) {
            continue;
        }
        let display = format!("{id} (custom)");
        models.push((id, display));
    }
    Ok(CopilotModelsResult { models })
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
