use std::time::Duration;

use crate::storage::credentials::get_credential;

/// End-to-end ping for Gemini. Two paths since the 2026-05-10 pivot:
///   - `api_key`: send a real generateContent against
///     generativelanguage.googleapis.com to verify auth + model access.
///   - `gemini_cli`: spawn `gemini -p "Say hello."` and parse the json
///     envelope — same pattern as ping_anthropic's CLI path.
#[tauri::command]
pub async fn ping_gemini() -> Result<String, String> {
    use crate::http::make_corporate_client;

    let auth_method =
        get_credential("gemini_auth_method").unwrap_or_else(|| "api_key".to_string());

    if auth_method == "gemini_cli" {
        return ping_via_gemini_cli().await;
    }

    let key = get_credential("gemini_api_key")
        .filter(|k| !k.trim().is_empty())
        .ok_or("No Gemini API key found. Add one in Settings → Gemini.")?;

    let model = crate::storage::preferences::get_pref("gemini_model")
        .or_else(|| get_credential("gemini_model"))
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| "gemini-2.5-flash".to_string());

    let client = make_corporate_client(Duration::from_secs(30), false)?;

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    );
    let body = serde_json::json!({
        "system_instruction": { "parts": [{ "text": "" }] },
        "contents": [{ "role": "user", "parts": [{ "text": "Say hello." }] }],
        "generationConfig": { "maxOutputTokens": 32 }
    });

    let resp = client
        .post(&url)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() || e.is_timeout() {
                "Could not reach generativelanguage.googleapis.com.".to_string()
            } else {
                format!("Gemini request failed: {e}")
            }
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Gemini API error {status}: {body}"));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Gemini response: {e}"))?;

    let reply = json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("(no text in response)");

    Ok(format!(
        "Message sent successfully. Gemini replied: \"{reply}\""
    ))
}

/// Spawn `gemini -p "Say hello." --output-format json --model <id>` and
/// parse the `{ response, stats, error? }` envelope. Mirrors what the
/// sidecar's GeminiCliChatModel does on a workflow call, with a fixed
/// prompt so this is a real end-to-end test of CLI install + auth + model
/// access.
async fn ping_via_gemini_cli() -> Result<String, String> {
    // Surface "not installed" cleanly before we burn time on the subprocess.
    crate::llms::gemini::detect_gemini_cli().await?;

    let model = crate::storage::preferences::get_pref("gemini_model")
        .or_else(|| get_credential("gemini_model"))
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| "gemini-2.5-flash".to_string());

    let output = tokio::process::Command::new("gemini")
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
        .map_err(|e| format!("Failed to spawn `gemini`: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!(
            "Gemini CLI exited with status {}: {}",
            output.status,
            if stderr.is_empty() { "(no stderr)" } else { &stderr }
        ));
    }

    // The json envelope is `{ response: "...", stats?: {...}, error?: ... }`
    // (loosely documented — see the sidecar's parseGeminiOutput for the
    // same defensive parsing). Surface `response`; fall back to raw stdout
    // if the shape diverges on this CLI version.
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parsed: Option<serde_json::Value> = serde_json::from_str(&stdout).ok();
    if let Some(v) = &parsed {
        if let Some(err) = v.get("error") {
            let msg = err
                .as_str()
                .map(str::to_string)
                .or_else(|| {
                    err.get("message")
                        .and_then(|m| m.as_str())
                        .map(str::to_string)
                })
                .unwrap_or_else(|| err.to_string());
            return Err(format!("Gemini CLI returned an error: {msg}"));
        }
    }
    let reply = parsed
        .as_ref()
        .and_then(|v| v.get("response").and_then(|r| r.as_str()).map(str::to_string))
        .unwrap_or_else(|| stdout.clone());

    if reply.trim().is_empty() {
        return Err(
            "Gemini CLI returned an empty response. Check that the CLI is signed in and the model is accessible."
                .to_string(),
        );
    }

    Ok(format!(
        "Message sent successfully. Gemini replied: \"{reply}\""
    ))
}
