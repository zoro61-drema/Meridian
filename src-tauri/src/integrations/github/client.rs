use reqwest::{header, Client, RequestBuilder, StatusCode};
use serde_json::Value;
use std::time::Duration;

const DEFAULT_BASE_URL: &str = "https://api.github.com";
const ACCEPT_JSON: &str = "application/vnd.github+json";
const API_VERSION: &str = "2022-11-28";

pub struct GitHubClient {
    pub(super) client: Client,
    pub(super) base_url: String,
    pub(super) owner: String,
    pub(super) repo: String,
    pub(super) pat: String,
}

impl GitHubClient {
    pub fn new(
        owner: String,
        repo: String,
        pat: String,
        base_url: Option<String>,
    ) -> Result<Self, String> {
        let disable_ssl_verify = crate::storage::preferences::get_pref("github_disable_ssl_verify")
            .map(|v| v == "true")
            .unwrap_or(false);
        let client =
            crate::http::make_corporate_client(Duration::from_secs(15), disable_ssl_verify)?;
        let base_url = base_url
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(DEFAULT_BASE_URL)
            .trim_end_matches('/')
            .to_string();
        Ok(Self {
            client,
            base_url,
            owner,
            repo,
            pat,
        })
    }

    pub(super) fn repo_url(&self, path: &str) -> String {
        format!("{}/repos/{}/{}{path}", self.base_url, self.owner, self.repo)
    }

    fn auth(&self, rb: RequestBuilder) -> RequestBuilder {
        rb.header(header::AUTHORIZATION, format!("Bearer {}", self.pat))
            .header(header::ACCEPT, ACCEPT_JSON)
            .header("X-GitHub-Api-Version", API_VERSION)
            .header(header::USER_AGENT, "meridian-app")
    }

    pub(super) async fn get_json(&self, url: &str) -> Result<Value, String> {
        let resp = self
            .auth(self.client.get(url))
            .send()
            .await
            .map_err(|e| network_err("GitHub", e))?;
        self.unwrap_json(url, resp).await
    }

    pub(super) async fn get_text_with_accept(
        &self,
        url: &str,
        accept: &str,
    ) -> Result<String, String> {
        let resp = self
            .auth(self.client.get(url))
            .header(header::ACCEPT, accept)
            .send()
            .await
            .map_err(|e| network_err("GitHub", e))?;
        let status = resp.status();
        if status.is_success() {
            return resp
                .text()
                .await
                .map_err(|e| format!("Failed to read GitHub response: {e}"));
        }
        let body = resp.text().await.unwrap_or_default();
        Err(github_status_err(url, status, &body))
    }

    pub(super) async fn post_json(&self, url: &str, body: Value) -> Result<Value, String> {
        let resp = self
            .auth(self.client.post(url))
            .header(header::CONTENT_TYPE, "application/json")
            .body(body.to_string())
            .send()
            .await
            .map_err(|e| network_err("GitHub", e))?;
        self.unwrap_json(url, resp).await
    }

    pub(super) async fn patch_json(&self, url: &str, body: Value) -> Result<Value, String> {
        let resp = self
            .auth(self.client.patch(url))
            .header(header::CONTENT_TYPE, "application/json")
            .body(body.to_string())
            .send()
            .await
            .map_err(|e| network_err("GitHub", e))?;
        self.unwrap_json(url, resp).await
    }

    pub(super) async fn delete_req(&self, url: &str) -> Result<(), String> {
        let resp = self
            .auth(self.client.delete(url))
            .send()
            .await
            .map_err(|e| network_err("GitHub", e))?;
        let status = resp.status();
        if status.is_success() || status == StatusCode::NO_CONTENT {
            return Ok(());
        }
        let body = resp.text().await.unwrap_or_default();
        Err(github_status_err(url, status, &body))
    }

    async fn unwrap_json(&self, url: &str, resp: reqwest::Response) -> Result<Value, String> {
        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| format!("Failed to read GitHub response: {e}"))?;
        if status.is_success() {
            return serde_json::from_str::<Value>(&text)
                .map_err(|e| format!("Failed to parse GitHub response: {e}"));
        }
        Err(github_status_err(url, status, &text))
    }

    /// Pull the head SHA for a PR. Needed when posting inline review
    /// comments, which GitHub requires to be anchored to a specific commit.
    pub(super) async fn pr_head_sha(&self, number: i64) -> Result<String, String> {
        let url = self.repo_url(&format!("/pulls/{number}"));
        let pr = self.get_json(&url).await?;
        pr["head"]["sha"]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| "GitHub PR is missing head.sha".to_string())
    }

    pub async fn fetch_authed_bytes(
        &self,
        url: &str,
    ) -> Result<(Vec<u8>, Option<String>), String> {
        let resp = self
            .auth(self.client.get(url))
            .send()
            .await
            .map_err(|e| network_err("GitHub", e))?;
        let status = resp.status();
        if !status.is_success() {
            return Err(format!("GitHub returned {status} fetching {url}"));
        }
        let content_type = resp
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("Failed to read image bytes: {e}"))?;
        Ok((bytes.to_vec(), content_type))
    }
}

fn network_err(host: &str, e: reqwest::Error) -> String {
    if e.is_connect() || e.is_timeout() {
        format!("Could not reach {host}. Check your internet connection.")
    } else {
        format!("Request failed: {e}")
    }
}

fn github_status_err(url: &str, status: StatusCode, body: &str) -> String {
    let detail = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v["message"].as_str().map(str::to_string))
        .unwrap_or_default();
    let hint = match status {
        StatusCode::UNAUTHORIZED => {
            " — check your GitHub PAT in Settings. The token may be expired or revoked."
        }
        StatusCode::FORBIDDEN => {
            " — your PAT may lack the required scopes (repo, read:user) or you're rate-limited."
        }
        StatusCode::NOT_FOUND => {
            " — repository or pull request not found. Check the owner/slug in Settings."
        }
        _ => "",
    };
    if detail.is_empty() {
        format!("GitHub returned {status} for {url}.{hint}")
    } else {
        format!("GitHub returned {status} for {url}: {detail}{hint}")
    }
}
