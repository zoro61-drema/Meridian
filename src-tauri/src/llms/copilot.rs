// GitHub Copilot CLI integration.
//
// Unlike Anthropic and Gemini, Copilot has no public "list models" REST
// endpoint we can hit from the embedder, and the CLI is the only
// programmatic surface. So this module is intentionally smaller than
// claude.rs / gemini.rs: a curated built-in model list, plus a custom-
// model picker mirroring the Gemini "Custom models" UX for when GitHub
// rolls out a new model id before our list catches up.
//
// Auth posture: CLI delegation only. The user signs in once via
// `copilot login` (or sets COPILOT_GITHUB_TOKEN / GH_TOKEN / GITHUB_TOKEN);
// Meridian never sees credentials and spawns the binary per call.

use crate::storage::credentials::{get_credential, store_credential};

/// Curated built-in model list. The Copilot CLI accepts model ids passed
/// verbatim via `--model=…`; what's "valid" depends on the user's plan
/// and which models are wired into the CLI on a given version. There is
/// currently no programmatic way to list the user's plan-specific models
/// (open feature requests: github/copilot-cli#700, #1356), so this list
/// mirrors the GA model ids from GitHub's "Supported AI models" docs
/// page. Users can add new ids via the Custom models field in Settings.
///
/// IDs are hyphenated (not dot-separated) — the CLI rejects
/// `claude-sonnet-4.6` with `Model "…" from --model flag is not
/// available.` because the literal id is malformed. The display labels
/// keep version numbers user-friendly (4.6 instead of 4-6).
pub const COPILOT_BUILTIN_MODELS: &[(&str, &str)] = &[
    ("auto", "Auto (Copilot picks)"),
    ("claude-sonnet-4-6", "Claude Sonnet 4.6"),
    ("claude-haiku-4-5", "Claude Haiku 4.5"),
    ("gpt-5-4", "GPT-5.4"),
    ("gpt-5-4-mini", "GPT-5.4 Mini"),
    ("gpt-5-3-codex", "GPT-5.3 Codex"),
    ("gpt-5-mini", "GPT-5 Mini"),
    ("grok-code-fast-1", "Grok Code Fast 1"),
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

/// Return the Copilot model catalogue for the Settings dropdown. Built-in
/// list plus any user-added custom ids. No live fetch — GitHub doesn't
/// expose a public model-list endpoint that works without first-party
/// auth, so we stay with a hand-curated list.
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
