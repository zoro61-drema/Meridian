// OpenAI Codex / ChatGPT — two auth paths since 2026-05-19:
//
//   1. **CLI delegation** (`codex_auth_method = codex_cli`): the user
//      runs `codex login` once against their ChatGPT account; Meridian
//      spawns the `codex` binary per call and never sees credentials.
//      Used by the Commander panel's `codexAcp` backend and by the
//      sidecar `CodexCliChatModel` adapter.
//
//   2. **API key** (`codex_auth_method = api_key`): the user pastes an
//      OpenAI API key (sk-…) into Settings; Meridian stores it in the
//      keychain and the sidecar `OpenAIDirectChatModel` adapter hits
//      api.openai.com directly. Commander's ACP wrapper picks the key
//      up via the `OPENAI_API_KEY` env var the launcher injects.
//
// This module owns:
//   - CLI detection / delegation-enable (forever)
//   - API-key validation + connectivity test (added 2026-05-19)
//
// Per-call `ping_codex` and `test_codex_stored` route by auth_method
// from commands/validate/codex.rs and read the credentials this module
// stores via `store_credential`.

use reqwest::StatusCode;
use std::time::Duration;

use crate::http::make_corporate_client;
use crate::storage::credentials::{get_credential, store_credential};

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
/// CLI is on PATH, then writes `codex_auth_method=codex_cli`. Doesn't
/// wipe any previously-stored API key — the sidecar dispatcher reads
/// `codex_auth_method` to decide which path to take, so a leftover
/// key is inert as long as the method says codex_cli.
#[tauri::command]
pub async fn enable_codex_cli_delegation() -> Result<String, String> {
    let path = detect_codex_cli().await?;
    store_credential("codex_auth_method", "codex_cli")?;
    Ok(format!(
        "Using Codex CLI at {path} for Commander Codex agents and sidecar workflows."
    ))
}

/// Validate an OpenAI API key. Saves the key, sets `codex_auth_method=api_key`,
/// then probes /v1/models to confirm connectivity + key validity.
/// Tolerant on network failure (saves the key with a warning) so users on
/// flaky / firewalled networks can still proceed.
#[tauri::command]
pub async fn validate_openai_api_key(api_key: String) -> Result<String, String> {
    let key = api_key.trim();
    if key.is_empty() {
        return Err("API key cannot be empty.".to_string());
    }
    if !key.starts_with("sk-") {
        return Err(
            "Expected an OpenAI API key starting with `sk-`. \
             For ChatGPT subscription auth, use the Codex CLI delegation option instead."
                .to_string(),
        );
    }
    store_credential("openai_api_key", key)?;
    store_credential("codex_auth_method", "api_key")?;
    test_openai_connectivity(key, true).await
}

/// Test the already-stored OpenAI API key (no frontend round-trip).
/// Routes by `codex_auth_method`: api_key mode probes /v1/models;
/// codex_cli mode just re-detects the binary on PATH.
#[tauri::command]
pub async fn test_codex_stored() -> Result<String, String> {
    let method =
        get_credential("codex_auth_method").unwrap_or_else(|| "api_key".to_string());
    if method == "codex_cli" {
        let path = detect_codex_cli().await?;
        return Ok(format!("Codex CLI detected at {path}."));
    }
    let key = get_credential("openai_api_key")
        .ok_or("No OpenAI API key found. Add one in Settings → Codex.")?;
    if key.trim().is_empty() {
        return Err(
            "No OpenAI API key found. Add one in Settings → Codex.".to_string(),
        );
    }
    test_openai_connectivity(&key, false).await
}

/// Send a real "Say hello." message and confirm a response comes back.
/// API-key mode hits /v1/chat/completions directly; CLI mode shells
/// out to `codex exec` (which respects `codex login` or `CODEX_API_KEY`).
#[tauri::command]
pub async fn ping_codex() -> Result<String, String> {
    let method =
        get_credential("codex_auth_method").unwrap_or_else(|| "api_key".to_string());
    if method == "codex_cli" {
        // Re-detect first so the user gets a clean error before we
        // burn time on the subprocess.
        detect_codex_cli().await?;
        let output = tokio::process::Command::new("codex")
            .args(["exec", "--yolo", "Say hello."])
            .output()
            .await
            .map_err(|e| format!("Failed to spawn `codex`: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(format!(
                "Codex CLI exited with status {}: {}",
                output.status,
                if stderr.is_empty() { "(no stderr)" } else { &stderr }
            ));
        }
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            return Err(
                "Codex CLI returned an empty response. Check `codex login` or `CODEX_API_KEY` env var."
                    .to_string(),
            );
        }
        return Ok(format!(
            "Message sent successfully. Codex replied: \"{stdout}\""
        ));
    }

    let api_key = get_credential("openai_api_key")
        .ok_or("No OpenAI API key found. Add one in Settings → Codex.")?;
    if api_key.trim().is_empty() {
        return Err(
            "No OpenAI API key found. Add one in Settings → Codex.".to_string(),
        );
    }

    let model = crate::storage::preferences::get_pref("codex_model")
        .or_else(|| get_credential("codex_model"))
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| "gpt-5".to_string());

    let client = make_corporate_client(Duration::from_secs(30), false)?;
    let body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": "Say hello." }],
        "max_tokens": 32,
    });

    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("authorization", format!("Bearer {api_key}"))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() || e.is_timeout() {
                "Could not reach api.openai.com. Check your internet connection."
                    .to_string()
            } else {
                format!("Request failed: {e}")
            }
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("OpenAI API error {status}: {body_text}"));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {e}"))?;
    let reply = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("(no text in response)");
    Ok(format!(
        "Message sent successfully. OpenAI replied: \"{reply}\""
    ))
}

/// `tolerant`: if true, network failures return Ok with a warning
/// (used on save). If false, network failures return Err (used by
/// the Test Connection button).
async fn test_openai_connectivity(api_key: &str, tolerant: bool) -> Result<String, String> {
    let client = make_corporate_client(Duration::from_secs(15), false)?;
    let resp: reqwest::Response = match client
        .get("https://api.openai.com/v1/models")
        .header("authorization", format!("Bearer {api_key}"))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) if e.is_connect() || e.is_timeout() => {
            return if tolerant {
                Ok("API key saved. Note: api.openai.com could not be reached from this network — Codex workflows will be attempted at runtime."
                    .to_string())
            } else {
                Err("Could not reach api.openai.com. Check your internet connection — your corporate network may be blocking this endpoint."
                    .to_string())
            };
        }
        Err(e) => return Err(format!("Request failed: {e}")),
    };

    match resp.status() {
        StatusCode::OK => Ok("Connected to OpenAI API successfully.".to_string()),
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(
            "OpenAI rejected the API key as invalid. Check the key at platform.openai.com → API keys."
                .to_string(),
        ),
        s => Err(format!("Unexpected response from OpenAI (HTTP {s}).")),
    }
}
