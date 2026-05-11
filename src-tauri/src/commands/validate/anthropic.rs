use reqwest::StatusCode;

use super::_shared::make_client;
use crate::storage::credentials::{get_credential, store_credential};

/// Validate an Anthropic API key. Saves the key immediately, then tests
/// connectivity. If api.anthropic.com is blocked by a corporate firewall,
/// returns a warning (not an error) so the user can still proceed.
#[tauri::command]
pub async fn validate_anthropic(api_key: String) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("API key cannot be empty.".to_string());
    }
    if !api_key.trim().starts_with("sk-ant-api") {
        return Err(
            "Expected an Anthropic API key starting with sk-ant-api. \
             For Claude.ai Pro/Max subscription auth, use the Claude Code CLI delegation option instead."
                .to_string(),
        );
    }
    store_credential("anthropic_api_key", api_key.trim())?;
    store_credential("claude_auth_method", "api_key")?;
    test_anthropic_connectivity(api_key.trim(), true).await
}

/// Send a real "hello" message and verify a response comes back. Two paths:
/// `api_key` mode hits /v1/messages directly; `claude_code` mode spawns the
/// CLI (`claude -p "Say hello." --output-format json --model <id>`) and
/// surfaces the parsed response. Either way this tests the full inference
/// path — auth, model access, network — not just connectivity.
#[tauri::command]
pub async fn ping_anthropic() -> Result<String, String> {
    use crate::http::make_corporate_client;
    use std::time::Duration;

    let auth_method = get_credential("claude_auth_method").unwrap_or_else(|| "api_key".to_string());

    if auth_method == "claude_code" {
        return ping_via_claude_code_cli().await;
    }

    let api_key = get_credential("anthropic_api_key")
        .ok_or("No Anthropic API key found. Add one in Settings → Anthropic.")?;
    if api_key.trim().is_empty() {
        return Err("No Anthropic API key found. Add one in Settings → Anthropic.".to_string());
    }

    let client = make_corporate_client(Duration::from_secs(30), false)?;
    let model = crate::storage::preferences::get_pref("claude_model")
        .or_else(|| get_credential("claude_model"))
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| "claude-sonnet-4-6".to_string());

    let body = serde_json::json!({
        "model": model,
        "max_tokens": 32,
        "system": "",
        "messages": [{ "role": "user", "content": "Say hello." }],
    });

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .header("x-api-key", &api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() || e.is_timeout() {
                "Could not reach api.anthropic.com. Check your internet connection.".to_string()
            } else {
                format!("Request failed: {e}")
            }
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("Claude API error {status}: {body_text}"));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {e}"))?;

    let reply = json["content"][0]["text"]
        .as_str()
        .unwrap_or("(no text in response)");

    Ok(format!(
        "Message sent successfully. Claude replied: \"{reply}\""
    ))
}

/// Spawn `claude -p "Say hello." --output-format json --model <id>` and
/// parse the JSON envelope to confirm the CLI is installed, authenticated,
/// and can reach the model. Mirrors what the sidecar's
/// ClaudeCodeChatModel does on a workflow call, just with a fixed prompt.
async fn ping_via_claude_code_cli() -> Result<String, String> {
    // Ensure the binary is on PATH first so we can give the user a useful
    // error before we burn time waiting on the subprocess.
    detect_claude_code_cli().await?;

    let model = crate::storage::preferences::get_pref("claude_model")
        .or_else(|| get_credential("claude_model"))
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| "claude-sonnet-4-6".to_string());

    let output = tokio::process::Command::new("claude")
        .args([
            "-p",
            "Say hello.",
            "--output-format",
            "json",
            "--model",
            &model,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to spawn `claude`: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!(
            "Claude CLI exited with status {}: {}",
            output.status,
            if stderr.is_empty() { "(no stderr)" } else { &stderr }
        ));
    }

    // The `json` output format returns `{ result: "...", session_id: "...",
    // total_cost_usd?: …, usage?: { input_tokens, output_tokens, … } }`
    // (per code.claude.com/docs/en/headless). We surface `result` to the
    // user as the reply; if parsing fails we fall back to raw stdout so a
    // CLI version that emits a different shape doesn't break the test.
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let reply = serde_json::from_str::<serde_json::Value>(&stdout)
        .ok()
        .and_then(|v| v.get("result").and_then(|r| r.as_str()).map(str::to_string))
        .unwrap_or_else(|| stdout.clone());

    if reply.trim().is_empty() {
        return Err(
            "Claude CLI returned an empty response. Check that the CLI is signed in and the model is accessible."
                .to_string(),
        );
    }

    Ok(format!(
        "Message sent successfully. Claude replied: \"{reply}\""
    ))
}

/// Test the already-stored Anthropic key without accepting it from the
/// frontend. Routes by `claude_auth_method`: API-key mode does a real
/// connectivity check against api.anthropic.com; Claude Code mode probes
/// for the CLI on PATH.
#[tauri::command]
pub async fn test_anthropic_stored() -> Result<String, String> {
    let auth_method = get_credential("claude_auth_method").unwrap_or_else(|| "api_key".to_string());

    if auth_method == "claude_code" {
        let path = detect_claude_code_cli().await?;
        return Ok(format!("Claude Code CLI detected at {path}."));
    }

    let key = get_credential("anthropic_api_key")
        .ok_or("No Anthropic API key found. Add one in Settings → Anthropic.")?;
    if key.trim().is_empty() {
        return Err("No Anthropic API key found. Add one in Settings → Anthropic.".to_string());
    }
    test_anthropic_connectivity(&key, false).await
}

/// Switch the active Anthropic auth mode to Claude Code CLI delegation.
/// Wipes any stored API key + writes `claude_auth_method=claude_code`,
/// then verifies the CLI is on PATH so the user gets a single round-trip
/// answer on whether delegation will actually work.
#[tauri::command]
pub async fn enable_claude_code_delegation() -> Result<String, String> {
    let path = detect_claude_code_cli().await?;
    store_credential("claude_auth_method", "claude_code")?;
    // Don't wipe `anthropic_api_key` — the user might switch back. The
    // sidecar dispatcher reads `claude_auth_method` to decide which path
    // to take, so a leftover key is inert as long as the method says
    // claude_code.
    Ok(format!("Using Claude Code CLI at {path} for Anthropic workflows."))
}

/// Look up `claude` on PATH and return its absolute path. Used by the
/// Settings UI to surface "detected at /opt/homebrew/bin/claude" or a
/// clear install hint when it's missing. Runs `which claude` because
/// Rust's own PATH lookup ignores user shell rc files; the spawned
/// process inherits the user's PATH thanks to the macOS LaunchServices
/// shim Tauri installs.
#[tauri::command]
pub async fn detect_claude_code_cli() -> Result<String, String> {
    let output = std::process::Command::new("which")
        .arg("claude")
        .output()
        .map_err(|e| format!("Failed to run `which claude`: {e}"))?;
    if !output.status.success() {
        return Err(
            "Claude Code CLI not found on PATH. Install with: npm install -g @anthropic-ai/claude-code"
                .to_string(),
        );
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return Err(
            "Claude Code CLI not found on PATH. Install with: npm install -g @anthropic-ai/claude-code"
                .to_string(),
        );
    }
    Ok(path)
}

/// `tolerant`: if true, network failures return Ok with a warning (used on save).
///             if false, network failures return Err (used by Test Connection button).
async fn test_anthropic_connectivity(api_key: &str, tolerant: bool) -> Result<String, String> {
    let client = make_client()?;
    let resp = match client
        .get("https://api.anthropic.com/v1/models")
        .header("anthropic-version", "2023-06-01")
        .header("x-api-key", api_key)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) if e.is_connect() || e.is_timeout() => {
            return if tolerant {
                Ok("API key saved. Note: api.anthropic.com could not be reached from this network — Claude workflows will be attempted at runtime.".to_string())
            } else {
                Err("Could not reach api.anthropic.com. Check your internet connection — your corporate network may be blocking this endpoint.".to_string())
            };
        }
        Err(e) => return Err(format!("Request failed: {e}")),
    };

    match resp.status() {
        StatusCode::OK => Ok("Connected to Anthropic API successfully.".to_string()),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(
            "Anthropic rejected the API key as invalid. Check the key at platform.claude.com → API Keys.".to_string(),
        ),
        s => Err(format!("Unexpected response from Anthropic (HTTP {s}).")),
    }
}
