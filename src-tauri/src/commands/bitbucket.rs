//! PR-related Tauri commands. These names still say "bitbucket" for now
//! because the frontend has not yet learned about multi-repo routing —
//! every call resolves through `vcs::active_vcs_provider()`, which today
//! returns the configured Bitbucket repo. Step 2 (multi-repo settings)
//! will add a `repoId` parameter and these can be renamed at that point.

use crate::integrations::bitbucket::{BitbucketComment, BitbucketPr, BitbucketTask};
use crate::integrations::vcs::{active_vcs_provider, NewComment, NewPr, VcsIdentity, VcsProvider};
use crate::storage::credentials::get_credential;

fn active_provider() -> Result<Box<dyn VcsProvider>, String> {
    active_vcs_provider()
}

/// Build the identity used to filter "my PRs" / "PRs for review" against
/// the active provider. Bitbucket matches on the shared Atlassian
/// account_id (stored during JIRA validation); other providers will pull
/// from their own credential keys.
fn require_identity() -> Result<VcsIdentity, String> {
    let id = get_credential("jira_account_id").ok_or(
        "Could not determine your account. Validate your JIRA credentials in Settings first — \
         this stores the shared Atlassian account ID used to match your Bitbucket PRs.",
    )?;
    Ok(VcsIdentity { id })
}

/// All open PRs in the configured repository.
#[tauri::command]
pub async fn get_open_prs() -> Result<Vec<BitbucketPr>, String> {
    active_provider()?.list_open_prs().await
}

/// Open PRs where the configured user is listed as a reviewer.
#[tauri::command]
pub async fn get_prs_for_review() -> Result<Vec<BitbucketPr>, String> {
    let provider = active_provider()?;
    match get_credential("jira_account_id") {
        // Same fallback as before: with no identity stored yet, surface all
        // open PRs rather than blocking the screen.
        Some(account_id) => {
            provider
                .list_prs_for_review(&VcsIdentity { id: account_id })
                .await
        }
        None => provider.list_open_prs().await,
    }
}

/// Open PRs authored by the configured user.
#[tauri::command]
pub async fn get_my_open_prs() -> Result<Vec<BitbucketPr>, String> {
    let provider = active_provider()?;
    let identity = require_identity()?;
    provider.list_my_open_prs(&identity).await
}

/// Full detail for a single PR.
#[tauri::command]
pub async fn get_pr(pr_id: i64) -> Result<BitbucketPr, String> {
    active_provider()?.get_pr(pr_id).await
}

/// Raw unified diff for a PR (used by the PR Review Assistant).
#[tauri::command]
pub async fn get_pr_diff(pr_id: i64) -> Result<String, String> {
    active_provider()?.get_pr_diff(pr_id).await
}

/// Full contents of a file at the PR's source commit — used by the diff
/// viewer to lazy-load surrounding context around the changed hunks.
#[tauri::command]
pub async fn get_pr_file_content(pr_id: i64, path: String) -> Result<String, String> {
    active_provider()?.get_pr_file_content(pr_id, &path).await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxiedImage {
    /// MIME type as reported by the host. Defaults to
    /// `application/octet-stream` when missing — the frontend uses this to
    /// build a `data:` URI, so a missing type still produces a valid URI.
    pub content_type: String,
    /// Base64-encoded image bytes.
    pub data_base64: String,
}

/// Fetch a host-authenticated image and return its bytes base64-encoded.
/// The Tauri webview can't supply per-request auth for `<img src>`, so this
/// command stands in: the frontend turns the result into a `data:` URI and
/// renders it directly. The provider decides which URLs it's willing to
/// proxy via `allows_image_host`.
#[tauri::command]
pub async fn fetch_bitbucket_image(url: String) -> Result<ProxiedImage, String> {
    use base64::Engine;
    let provider = active_provider()?;
    if !provider.allows_image_host(&url) {
        return Err(
            "Refusing to proxy a URL the active VCS provider does not recognise.".to_string(),
        );
    }
    let (bytes, content_type) = provider.fetch_authed_bytes(&url).await?;
    Ok(ProxiedImage {
        content_type: content_type
            .unwrap_or_else(|| "application/octet-stream".to_string()),
        data_base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
    })
}

/// Upload an image as a PR attachment. The frontend hands us the bytes
/// base64-encoded (so the JS bridge stays string-typed); we decode here
/// and forward to the provider. Returns the attachment URL which the
/// frontend embeds as `![filename](url)` in the comment markdown.
#[tauri::command]
pub async fn upload_pr_attachment(
    pr_id: i64,
    filename: String,
    data_base64: String,
    content_type: Option<String>,
) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data_base64)
        .map_err(|e| format!("Invalid base64 in upload payload: {e}"))?;
    active_provider()?
        .upload_pr_attachment(pr_id, &filename, bytes, content_type.as_deref())
        .await
}

/// Merged PRs, optionally filtered to those updated on or after `since_iso`.
#[tauri::command]
pub async fn get_merged_prs(since_iso: Option<String>) -> Result<Vec<BitbucketPr>, String> {
    active_provider()?
        .list_merged_prs(since_iso.as_deref())
        .await
}

/// All comments on a PR.
#[tauri::command]
pub async fn get_pr_comments(pr_id: i64) -> Result<Vec<BitbucketComment>, String> {
    active_provider()?.list_pr_comments(pr_id).await
}

/// All tasks on a PR (used to determine Ready for QA eligibility).
#[tauri::command]
pub async fn get_pr_tasks(pr_id: i64) -> Result<Vec<BitbucketTask>, String> {
    active_provider()?.list_pr_tasks(pr_id).await
}

/// Create a new pull request on the active provider. Bitbucket Cloud has
/// no real draft state, so for Bitbucket this mimics it by creating the
/// PR with no reviewers — nobody is notified. Add reviewers from the host
/// UI when ready.
#[tauri::command]
pub async fn create_pull_request(
    title: String,
    description: String,
    source_branch: String,
    destination_branch: String,
) -> Result<BitbucketPr, String> {
    active_provider()?
        .create_pr(NewPr {
            title: &title,
            description: &description,
            source_branch: &source_branch,
            destination_branch: &destination_branch,
        })
        .await
}

/// Approve a PR as the authenticated user.
#[tauri::command]
pub async fn approve_pr(pr_id: i64) -> Result<(), String> {
    active_provider()?.approve_pr(pr_id).await
}

/// Remove approval from a PR (unapprove).
#[tauri::command]
pub async fn unapprove_pr(pr_id: i64) -> Result<(), String> {
    active_provider()?.unapprove_pr(pr_id).await
}

/// Mark a PR as 'Needs work' (request changes).
#[tauri::command]
pub async fn request_changes_pr(pr_id: i64) -> Result<(), String> {
    active_provider()?.request_changes_pr(pr_id).await
}

/// Remove 'Needs work' status from a PR.
#[tauri::command]
pub async fn unrequest_changes_pr(pr_id: i64) -> Result<(), String> {
    active_provider()?.unrequest_changes_pr(pr_id).await
}

/// Post a general or inline comment on a PR.
/// Set `inline_path` + `inline_to_line` for an inline comment.
/// Set `parent_id` to reply to an existing comment thread.
#[tauri::command]
pub async fn post_pr_comment(
    pr_id: i64,
    content: String,
    inline_path: Option<String>,
    inline_to_line: Option<i64>,
    parent_id: Option<i64>,
) -> Result<BitbucketComment, String> {
    active_provider()?
        .post_pr_comment(
            pr_id,
            NewComment {
                body: &content,
                inline_path: inline_path.as_deref(),
                inline_to_line,
                parent_id,
            },
        )
        .await
}

/// Create a task linked to a specific comment on a PR.
#[tauri::command]
pub async fn create_pr_task(
    pr_id: i64,
    comment_id: i64,
    content: String,
) -> Result<BitbucketTask, String> {
    active_provider()?
        .create_pr_task(pr_id, comment_id, &content)
        .await
}

/// Update a task's text content on a PR.
#[tauri::command]
pub async fn update_pr_task(
    pr_id: i64,
    task_id: i64,
    content: String,
) -> Result<BitbucketTask, String> {
    active_provider()?
        .update_pr_task(pr_id, task_id, &content)
        .await
}

/// Resolve or re-open a task on a PR.
#[tauri::command]
pub async fn resolve_pr_task(
    pr_id: i64,
    task_id: i64,
    resolved: bool,
) -> Result<BitbucketTask, String> {
    active_provider()?
        .resolve_pr_task(pr_id, task_id, resolved)
        .await
}

/// Delete a comment from a PR (only succeeds if the authed user is the author).
#[tauri::command]
pub async fn delete_pr_comment(pr_id: i64, comment_id: i64) -> Result<(), String> {
    active_provider()?
        .delete_pr_comment(pr_id, comment_id)
        .await
}

/// Update the content of a PR comment (only succeeds if the authed user is the author).
#[tauri::command]
pub async fn update_pr_comment(
    pr_id: i64,
    comment_id: i64,
    new_content: String,
) -> Result<BitbucketComment, String> {
    active_provider()?
        .update_pr_comment(pr_id, comment_id, &new_content)
        .await
}
