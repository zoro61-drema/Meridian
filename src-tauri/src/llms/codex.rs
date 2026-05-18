// OpenAI Codex (`codex` CLI) — CLI-delegation only.
//
// Codex authenticates against a ChatGPT account via `codex login`;
// Meridian never sees credentials. Used by the Commander panel's
// `codexAcp` backend (which spawns `@zed-industries/codex-acp`, an
// ACP wrapper that talks to the same `codex` CLI). Sidecar workflows
// don't dispatch to Codex today, so this module only covers the
// detection / delegation enable / re-detect surface that Settings
// and the onboarding wizard need.

use crate::storage::credentials::store_credential;

/// Look up `codex` on PATH and return its absolute path.
#[tauri::command]
pub async fn detect_codex_cli() -> Result<String, String> {
    let output = std::process::Command::new("which")
        .arg("codex")
        .output()
        .map_err(|e| format!("Failed to run `which codex`: {e}"))?;
    if !output.status.success() {
        return Err(
            "Codex CLI not found on PATH. Install with: npm install -g @openai/codex"
                .to_string(),
        );
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return Err(
            "Codex CLI not found on PATH. Install with: npm install -g @openai/codex"
                .to_string(),
        );
    }
    Ok(path)
}

/// Switch the active Codex auth mode to CLI delegation. Verifies the
/// CLI is on PATH, then writes `codex_auth_method=codex_cli`.
#[tauri::command]
pub async fn enable_codex_cli_delegation() -> Result<String, String> {
    let path = detect_codex_cli().await?;
    store_credential("codex_auth_method", "codex_cli")?;
    Ok(format!(
        "Using Codex CLI at {path} for Commander Codex agents."
    ))
}

/// Re-detect the stored Codex configuration. No remote endpoint to
/// hit — the CLI owns its own auth — so this just confirms the
/// binary is still on PATH.
#[tauri::command]
pub async fn test_codex_stored() -> Result<String, String> {
    let path = detect_codex_cli().await?;
    Ok(format!("Codex CLI detected at {path}."))
}
