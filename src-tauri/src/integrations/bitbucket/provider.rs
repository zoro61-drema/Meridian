//! `VcsProvider` impl for Bitbucket. Pure delegation to the existing
//! `BitbucketClient` methods — the trait exists so PR Review, Sprint
//! Dashboard, and Commander roles can target multiple hosts uniformly.

use async_trait::async_trait;

use super::client::BitbucketClient;
use crate::integrations::vcs::{
    Comment, NewComment, NewPr, Pr, Task, VcsIdentity, VcsKind, VcsProvider,
};

#[async_trait]
impl VcsProvider for BitbucketClient {
    fn kind(&self) -> VcsKind {
        VcsKind::Bitbucket
    }

    async fn list_open_prs(&self) -> Result<Vec<Pr>, String> {
        BitbucketClient::get_open_prs(self).await
    }

    async fn list_merged_prs(&self, since_iso: Option<&str>) -> Result<Vec<Pr>, String> {
        BitbucketClient::get_merged_prs(self, since_iso).await
    }

    async fn list_my_open_prs(&self, identity: &VcsIdentity) -> Result<Vec<Pr>, String> {
        // The existing helper accepts either nickname or account_id; the
        // identity carries whichever the caller resolved.
        BitbucketClient::get_my_open_prs_by_username(self, &identity.id).await
    }

    async fn list_prs_for_review(&self, identity: &VcsIdentity) -> Result<Vec<Pr>, String> {
        BitbucketClient::get_prs_for_review(self, &identity.id).await
    }

    async fn get_pr(&self, pr_id: i64) -> Result<Pr, String> {
        BitbucketClient::get_pr(self, pr_id).await
    }

    async fn get_pr_diff(&self, pr_id: i64) -> Result<String, String> {
        BitbucketClient::get_pr_diff(self, pr_id).await
    }

    async fn get_pr_file_content(&self, pr_id: i64, path: &str) -> Result<String, String> {
        BitbucketClient::get_pr_file_content(self, pr_id, path).await
    }

    async fn list_pr_comments(&self, pr_id: i64) -> Result<Vec<Comment>, String> {
        BitbucketClient::get_pr_comments(self, pr_id).await
    }

    async fn post_pr_comment(&self, pr_id: i64, body: NewComment<'_>) -> Result<Comment, String> {
        BitbucketClient::post_pr_comment(
            self,
            pr_id,
            body.body,
            body.inline_path,
            body.inline_to_line,
            body.parent_id,
        )
        .await
    }

    async fn update_pr_comment(
        &self,
        pr_id: i64,
        comment_id: i64,
        body: &str,
    ) -> Result<Comment, String> {
        BitbucketClient::update_pr_comment(self, pr_id, comment_id, body).await
    }

    async fn delete_pr_comment(&self, pr_id: i64, comment_id: i64) -> Result<(), String> {
        BitbucketClient::delete_pr_comment(self, pr_id, comment_id).await
    }

    async fn list_pr_tasks(&self, pr_id: i64) -> Result<Vec<Task>, String> {
        BitbucketClient::get_pr_tasks(self, pr_id).await
    }

    async fn create_pr_task(
        &self,
        pr_id: i64,
        comment_id: i64,
        content: &str,
    ) -> Result<Task, String> {
        BitbucketClient::create_pr_task(self, pr_id, comment_id, content).await
    }

    async fn update_pr_task(
        &self,
        pr_id: i64,
        task_id: i64,
        content: &str,
    ) -> Result<Task, String> {
        BitbucketClient::update_pr_task(self, pr_id, task_id, content).await
    }

    async fn resolve_pr_task(
        &self,
        pr_id: i64,
        task_id: i64,
        resolved: bool,
    ) -> Result<Task, String> {
        BitbucketClient::resolve_pr_task(self, pr_id, task_id, resolved).await
    }

    async fn create_pr(&self, draft: NewPr<'_>) -> Result<Pr, String> {
        BitbucketClient::create_pull_request(
            self,
            draft.title,
            draft.description,
            draft.source_branch,
            draft.destination_branch,
        )
        .await
    }

    async fn approve_pr(&self, pr_id: i64) -> Result<(), String> {
        BitbucketClient::approve_pr(self, pr_id).await
    }

    async fn unapprove_pr(&self, pr_id: i64) -> Result<(), String> {
        BitbucketClient::unapprove_pr(self, pr_id).await
    }

    async fn request_changes_pr(&self, pr_id: i64) -> Result<(), String> {
        BitbucketClient::request_changes_pr(self, pr_id).await
    }

    async fn unrequest_changes_pr(&self, pr_id: i64) -> Result<(), String> {
        BitbucketClient::unrequest_changes_pr(self, pr_id).await
    }

    async fn upload_pr_attachment(
        &self,
        pr_id: i64,
        filename: &str,
        bytes: Vec<u8>,
        content_type: Option<&str>,
    ) -> Result<String, String> {
        BitbucketClient::upload_pr_attachment(self, pr_id, filename, bytes, content_type).await
    }

    fn allows_image_host(&self, url: &str) -> bool {
        url.starts_with("https://bitbucket.org/") || url.starts_with("https://api.bitbucket.org/")
    }

    async fn fetch_authed_bytes(
        &self,
        url: &str,
    ) -> Result<(Vec<u8>, Option<String>), String> {
        BitbucketClient::fetch_authed_bytes(self, url).await
    }
}
