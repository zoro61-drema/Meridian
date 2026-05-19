// Validate GitHub credentials by hitting the /user endpoint and confirming
// the PAT returns a 200 + matches the username the user entered. Mirrors
// the Bitbucket validator's shape so the onboarding wizard can present the
// two providers symmetrically.

use reqwest::StatusCode;

use super::_shared::make_client;
use crate::storage::credentials::get_credential;
use crate::storage::preferences::get_pref;

/// Test GitHub connectivity using the credentials supplied by the UI.
/// Credentials are saved separately via `save_credential` / `set_preference`.
#[tauri::command]
pub async fn validate_github(
    pat: String,
    username: String,
    base_url: Option<String>,
) -> Result<String, String> {
    if pat.trim().is_empty() || username.trim().is_empty() {
        return Err("Personal access token and username are required.".to_string());
    }
    test_github_connection(&pat, &username, base_url.as_deref().unwrap_or("")).await
}

/// Test the already-stored GitHub credentials without accepting secrets
/// from the frontend.
#[tauri::command]
pub async fn test_github_stored() -> Result<String, String> {
    let pat = get_credential("github_pat")
        .ok_or("No GitHub personal access token is stored. Save credentials first.")?;
    let username = get_credential("github_username")
        .ok_or("No GitHub username is stored. Save credentials first.")?;
    let base_url = get_pref("github_base_url").unwrap_or_default();
    test_github_connection(&pat, &username, &base_url).await
}

async fn test_github_connection(
    pat: &str,
    username: &str,
    base_url: &str,
) -> Result<String, String> {
    let username_trimmed = username.trim();
    let pat_trimmed = pat.trim();
    // Default to api.github.com when the enterprise override is blank.
    let api_root = match base_url.trim() {
        "" => "https://api.github.com".to_string(),
        explicit => explicit.trim_end_matches('/').to_string(),
    };

    let client = make_client()?;
    let url = format!("{api_root}/user");

    let resp = client
        .get(&url)
        .bearer_auth(pat_trimmed)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "meridian-app")
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() || e.is_timeout() {
                format!("Could not reach {api_root}. Check your internet connection.")
            } else {
                format!("Request failed: {e}")
            }
        })?;

    let status = resp.status();
    let body_text = resp.text().await.unwrap_or_default();

    match status {
        StatusCode::OK => {
            let login = serde_json::from_str::<serde_json::Value>(&body_text)
                .ok()
                .and_then(|v| v["login"].as_str().map(|s| s.to_string()));
            match login {
                Some(login) if login.eq_ignore_ascii_case(username_trimmed) => Ok(format!(
                    "Connected to GitHub as '{login}'."
                )),
                Some(login) => Err(format!(
                    "Token is valid but belongs to '{login}', not '{username_trimmed}'. Update the username field to match."
                )),
                None => Ok(format!(
                    "Connected to GitHub (token valid; could not parse login from response)."
                )),
            }
        }
        StatusCode::UNAUTHORIZED => Err(
            "GitHub rejected the token. Check the PAT value and that it has not been revoked.".to_string()
        ),
        StatusCode::FORBIDDEN => Err(
            "GitHub access denied — your token may be missing required scopes (repo, read:user).".to_string()
        ),
        s => Err(format!("Unexpected response from GitHub (HTTP {s}).")),
    }
}
