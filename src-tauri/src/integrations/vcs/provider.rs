use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::types::{Comment, Pr, Task};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VcsKind {
    Bitbucket,
    Github,
}

/// Identity the provider uses to answer "PRs I authored" / "PRs assigned to
/// me". Bitbucket matches on the Atlassian `account_id` (shared with JIRA);
/// GitHub matches on the GitHub username.
#[derive(Debug, Clone)]
pub struct VcsIdentity {
    pub id: String,
}

#[derive(Debug, Clone)]
pub struct NewComment<'a> {
    pub body: &'a str,
    pub inline_path: Option<&'a str>,
    pub inline_to_line: Option<i64>,
    pub parent_id: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct NewPr<'a> {
    pub title: &'a str,
    pub description: &'a str,
    pub source_branch: &'a str,
    pub destination_branch: &'a str,
}

/// Uniform surface across PR hosts. Providers that don't model a concept
/// natively (e.g. GitHub has no first-class "tasks") should return an empty
/// list or a clear error rather than synthesising fake state.
#[async_trait]
pub trait VcsProvider: Send + Sync {
    fn kind(&self) -> VcsKind;

    async fn list_open_prs(&self) -> Result<Vec<Pr>, String>;
    async fn list_merged_prs(&self, since_iso: Option<&str>) -> Result<Vec<Pr>, String>;
    async fn list_my_open_prs(&self, identity: &VcsIdentity) -> Result<Vec<Pr>, String>;
    async fn list_prs_for_review(&self, identity: &VcsIdentity) -> Result<Vec<Pr>, String>;

    async fn get_pr(&self, pr_id: i64) -> Result<Pr, String>;
    async fn get_pr_diff(&self, pr_id: i64) -> Result<String, String>;
    async fn get_pr_file_content(&self, pr_id: i64, path: &str) -> Result<String, String>;

    async fn list_pr_comments(&self, pr_id: i64) -> Result<Vec<Comment>, String>;
    async fn post_pr_comment(&self, pr_id: i64, body: NewComment<'_>) -> Result<Comment, String>;
    async fn update_pr_comment(
        &self,
        pr_id: i64,
        comment_id: i64,
        body: &str,
    ) -> Result<Comment, String>;
    async fn delete_pr_comment(&self, pr_id: i64, comment_id: i64) -> Result<(), String>;

    async fn list_pr_tasks(&self, pr_id: i64) -> Result<Vec<Task>, String>;
    async fn create_pr_task(
        &self,
        pr_id: i64,
        comment_id: i64,
        content: &str,
    ) -> Result<Task, String>;
    async fn update_pr_task(
        &self,
        pr_id: i64,
        task_id: i64,
        content: &str,
    ) -> Result<Task, String>;
    async fn resolve_pr_task(
        &self,
        pr_id: i64,
        task_id: i64,
        resolved: bool,
    ) -> Result<Task, String>;

    async fn create_pr(&self, draft: NewPr<'_>) -> Result<Pr, String>;
    async fn approve_pr(&self, pr_id: i64) -> Result<(), String>;
    async fn unapprove_pr(&self, pr_id: i64) -> Result<(), String>;
    async fn request_changes_pr(&self, pr_id: i64) -> Result<(), String>;
    async fn unrequest_changes_pr(&self, pr_id: i64) -> Result<(), String>;

    /// Upload a file as a PR attachment. Providers without a direct upload
    /// surface (e.g. GitHub) should return Err; the frontend already falls
    /// back to embedding the image as a data URI when this fails.
    async fn upload_pr_attachment(
        &self,
        pr_id: i64,
        filename: &str,
        bytes: Vec<u8>,
        content_type: Option<&str>,
    ) -> Result<String, String>;

    /// Per-provider allow-list for the image proxy. The trait stays
    /// agnostic — each impl decides which hosts its credentials are valid
    /// for, so we don't end up proxying arbitrary URLs.
    fn allows_image_host(&self, url: &str) -> bool;
    async fn fetch_authed_bytes(
        &self,
        url: &str,
    ) -> Result<(Vec<u8>, Option<String>), String>;
}
