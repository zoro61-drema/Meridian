use crate::storage::credentials::get_credential;

/// End-to-end ping for GitHub Copilot via the locally-installed CLI.
/// Spawns `copilot -p "Say hello." --model <id> -s --no-ask-user
/// --allow-all-tools` and surfaces stdout — same shape the sidecar's
/// CopilotCliChatModel uses, just with a fixed prompt so this is a real
/// end-to-end test of install + auth + model access.
///
/// There's no API-key path. Copilot CLI is the only programmatic surface
/// (GitHub's public Copilot API is reserved for editor integrations); if
/// the user hasn't enabled CLI delegation we tell them how to.
#[tauri::command]
pub async fn ping_copilot() -> Result<String, String> {
    let auth_method = get_credential("copilot_auth_method").unwrap_or_default();
    if auth_method != "copilot_cli" {
        return Err(
            "Copilot CLI delegation is not enabled. Switch to Copilot CLI in Settings → GitHub Copilot first."
                .to_string(),
        );
    }

    // Surface "not installed" cleanly before we burn time on the subprocess.
    crate::llms::copilot::detect_copilot_cli().await?;

    let model = crate::storage::preferences::get_pref("copilot_model")
        .or_else(|| get_credential("copilot_model"))
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| crate::llms::copilot::DEFAULT_MODEL.to_string());

    let output = tokio::process::Command::new("copilot")
        .args([
            "-p",
            "Say hello.",
            "--model",
            &model,
            "-s",
            "--no-ask-user",
            "--allow-all-tools",
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to spawn `copilot`: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!(
            "Copilot CLI exited with status {}: {}",
            output.status,
            if stderr.is_empty() { "(no stderr)" } else { &stderr }
        ));
    }

    let reply = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if reply.is_empty() {
        return Err(
            "Copilot CLI returned an empty response. Check that the CLI is signed in (`copilot login`) and the chosen model is accessible on your Copilot plan."
                .to_string(),
        );
    }

    Ok(format!(
        "Message sent successfully. Copilot replied: \"{reply}\""
    ))
}
