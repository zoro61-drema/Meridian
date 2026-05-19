use async_trait::async_trait;
use serde_json::{json, Value};

use crate::integrations::vcs::{
    Comment, NewComment, NewPr, Pr, Task, VcsIdentity, VcsKind, VcsProvider,
};

use super::client::GitHubClient;
use super::parsing::{changes_requested_from_reviews, parse_comment, parse_pr};

const TASK_UNSUPPORTED: &str =
    "GitHub repositories do not support PR tasks. Use review threads instead.";

impl GitHubClient {
    async fn fetch_pr_list(&self, state: &str) -> Result<Vec<Pr>, String> {
        let url = self.repo_url(&format!(
            "/pulls?state={state}&per_page=50&sort=updated&direction=desc"
        ));
        let body = self.get_json(&url).await?;
        let arr = body.as_array().cloned().unwrap_or_default();
        Ok(arr.iter().map(parse_pr).collect())
    }
}

#[async_trait]
impl VcsProvider for GitHubClient {
    fn kind(&self) -> VcsKind {
        VcsKind::Github
    }

    async fn list_open_prs(&self) -> Result<Vec<Pr>, String> {
        self.fetch_pr_list("open").await
    }

    async fn list_merged_prs(&self, since_iso: Option<&str>) -> Result<Vec<Pr>, String> {
        // GitHub's PR list takes `state=closed` and we filter merged client-side
        // (closed-without-merge PRs have `merged_at: null`). The since filter
        // matches `updated_on` to mirror the Bitbucket behaviour.
        let url = self.repo_url(
            "/pulls?state=closed&per_page=50&sort=updated&direction=desc",
        );
        let body = self.get_json(&url).await?;
        let arr = body.as_array().cloned().unwrap_or_default();
        let merged: Vec<Pr> = arr
            .iter()
            .filter(|p| p["merged_at"].is_string())
            .map(parse_pr)
            .collect();
        match since_iso {
            Some(since) => Ok(merged
                .into_iter()
                .filter(|pr| pr.updated_on.as_str() >= since)
                .collect()),
            None => Ok(merged),
        }
    }

    async fn list_my_open_prs(&self, identity: &VcsIdentity) -> Result<Vec<Pr>, String> {
        let want = identity.id.to_lowercase();
        let all = self.list_open_prs().await?;
        Ok(all
            .into_iter()
            .filter(|pr| {
                pr.author
                    .account_id
                    .as_deref()
                    .map(|id| id.to_lowercase() == want)
                    .unwrap_or(false)
            })
            .collect())
    }

    async fn list_prs_for_review(&self, identity: &VcsIdentity) -> Result<Vec<Pr>, String> {
        let want = identity.id.to_lowercase();
        let all = self.list_open_prs().await?;
        Ok(all
            .into_iter()
            .filter(|pr| {
                pr.reviewers.iter().any(|r| {
                    r.user
                        .account_id
                        .as_deref()
                        .map(|id| id.to_lowercase() == want)
                        .unwrap_or(false)
                })
            })
            .collect())
    }

    async fn get_pr(&self, pr_id: i64) -> Result<Pr, String> {
        let url = self.repo_url(&format!("/pulls/{pr_id}"));
        let body = self.get_json(&url).await?;
        let mut pr = parse_pr(&body);

        // One extra round trip to resolve the "needs work" affordance.
        // Skipped on the listing path — only the detail view needs this.
        let reviews_url = self.repo_url(&format!("/pulls/{pr_id}/reviews?per_page=100"));
        if let Ok(reviews_json) = self.get_json(&reviews_url).await {
            if let Some(reviews) = reviews_json.as_array() {
                pr.changes_requested = changes_requested_from_reviews(reviews);
            }
        }
        Ok(pr)
    }

    async fn get_pr_diff(&self, pr_id: i64) -> Result<String, String> {
        let url = self.repo_url(&format!("/pulls/{pr_id}"));
        self.get_text_with_accept(&url, "application/vnd.github.v3.diff")
            .await
    }

    async fn get_pr_file_content(&self, pr_id: i64, path: &str) -> Result<String, String> {
        // Resolve to the PR's head commit so the file we return matches the
        // version under review (not whatever main happens to be on now).
        let sha = self.pr_head_sha(pr_id).await?;
        let url = self.repo_url(&format!("/contents/{path}?ref={sha}"));
        self.get_text_with_accept(&url, "application/vnd.github.raw")
            .await
    }

    async fn list_pr_comments(&self, pr_id: i64) -> Result<Vec<Comment>, String> {
        // Merge issue-conversation comments and inline review comments
        // into the unified `Comment` shape. Inline comments carry the
        // `inline` context; issue comments leave it None.
        let issue_url = self.repo_url(&format!(
            "/issues/{pr_id}/comments?per_page=100"
        ));
        let review_url = self.repo_url(&format!(
            "/pulls/{pr_id}/comments?per_page=100"
        ));
        let issue_body = self.get_json(&issue_url).await?;
        let review_body = self.get_json(&review_url).await?;

        let mut out: Vec<Comment> = issue_body
            .as_array()
            .cloned()
            .unwrap_or_default()
            .iter()
            .map(parse_comment)
            .collect();
        out.extend(
            review_body
                .as_array()
                .cloned()
                .unwrap_or_default()
                .iter()
                .map(parse_comment),
        );
        Ok(out)
    }

    async fn post_pr_comment(
        &self,
        pr_id: i64,
        body: NewComment<'_>,
    ) -> Result<Comment, String> {
        // GitHub splits new comments across two endpoints. The trait
        // collapses them: presence of `inline_path` picks the review-comment
        // path; otherwise it's an issue conversation comment.
        if let Some(path) = body.inline_path {
            let head_sha = self.pr_head_sha(pr_id).await?;
            let mut payload = json!({
                "body": body.body,
                "commit_id": head_sha,
                "path": path,
                // GitHub will treat side as RIGHT (the new file) by default,
                // matching how the rest of the app talks about line numbers.
                "side": "RIGHT",
            });
            if let Some(line) = body.inline_to_line {
                payload["line"] = json!(line);
            }
            if let Some(parent) = body.parent_id {
                let url = self.repo_url(&format!(
                    "/pulls/{pr_id}/comments/{parent}/replies"
                ));
                let reply = json!({ "body": body.body });
                let v = self.post_json(&url, reply).await?;
                return Ok(parse_comment(&v));
            }
            let url = self.repo_url(&format!("/pulls/{pr_id}/comments"));
            let v = self.post_json(&url, payload).await?;
            Ok(parse_comment(&v))
        } else {
            if body.parent_id.is_some() {
                return Err(
                    "GitHub issue comments are not threaded — replies can only \
                     be posted on inline review comments."
                        .to_string(),
                );
            }
            let url = self.repo_url(&format!("/issues/{pr_id}/comments"));
            let v = self.post_json(&url, json!({ "body": body.body })).await?;
            Ok(parse_comment(&v))
        }
    }

    async fn update_pr_comment(
        &self,
        pr_id: i64,
        comment_id: i64,
        body: &str,
    ) -> Result<Comment, String> {
        // Both endpoints accept PATCH with `{ "body": "..." }` and return
        // the updated comment. We don't know up front which endpoint the
        // id belongs to, so try the issue endpoint first; 404 falls back
        // to the review-comment endpoint.
        let issue_url = self.repo_url(&format!("/issues/comments/{comment_id}"));
        let payload = json!({ "body": body });
        match self.patch_json(&issue_url, payload.clone()).await {
            Ok(v) => Ok(parse_comment(&v)),
            Err(_) => {
                let review_url =
                    self.repo_url(&format!("/pulls/comments/{comment_id}"));
                let v = self.patch_json(&review_url, payload).await?;
                // Suppress the pr_id-unused warning — review-comment
                // edits target the comment id alone.
                let _ = pr_id;
                Ok(parse_comment(&v))
            }
        }
    }

    async fn delete_pr_comment(
        &self,
        _pr_id: i64,
        comment_id: i64,
    ) -> Result<(), String> {
        // Same dance as update — try issue endpoint, fall back to review.
        let issue_url = self.repo_url(&format!("/issues/comments/{comment_id}"));
        match self.delete_req(&issue_url).await {
            Ok(()) => Ok(()),
            Err(_) => {
                let review_url =
                    self.repo_url(&format!("/pulls/comments/{comment_id}"));
                self.delete_req(&review_url).await
            }
        }
    }

    async fn list_pr_tasks(&self, _pr_id: i64) -> Result<Vec<Task>, String> {
        Ok(Vec::new())
    }

    async fn create_pr_task(
        &self,
        _pr_id: i64,
        _comment_id: i64,
        _content: &str,
    ) -> Result<Task, String> {
        Err(TASK_UNSUPPORTED.to_string())
    }

    async fn update_pr_task(
        &self,
        _pr_id: i64,
        _task_id: i64,
        _content: &str,
    ) -> Result<Task, String> {
        Err(TASK_UNSUPPORTED.to_string())
    }

    async fn resolve_pr_task(
        &self,
        _pr_id: i64,
        _task_id: i64,
        _resolved: bool,
    ) -> Result<Task, String> {
        Err(TASK_UNSUPPORTED.to_string())
    }

    async fn create_pr(&self, draft: NewPr<'_>) -> Result<Pr, String> {
        let url = self.repo_url("/pulls");
        let payload = json!({
            "title": draft.title,
            "body": draft.description,
            "head": draft.source_branch,
            "base": draft.destination_branch,
        });
        let v = self.post_json(&url, payload).await?;
        Ok(parse_pr(&v))
    }

    async fn approve_pr(&self, pr_id: i64) -> Result<(), String> {
        let url = self.repo_url(&format!("/pulls/{pr_id}/reviews"));
        let payload = json!({ "event": "APPROVE" });
        self.post_json(&url, payload).await.map(|_| ())
    }

    async fn unapprove_pr(&self, pr_id: i64) -> Result<(), String> {
        // GitHub doesn't have an unapprove; the closest is dismissing the
        // most recent APPROVE review we authored. Look it up, then DELETE
        // the dismissal endpoint.
        let reviews_url = self.repo_url(&format!("/pulls/{pr_id}/reviews?per_page=100"));
        let reviews = self.get_json(&reviews_url).await?;
        let reviews_arr = reviews.as_array().cloned().unwrap_or_default();
        let mine = identify_latest_review(&reviews_arr, "APPROVED")
            .ok_or("No approval to remove — you haven't approved this PR.")?;
        let dismiss_url = self.repo_url(&format!(
            "/pulls/{pr_id}/reviews/{mine}/dismissals"
        ));
        let payload = json!({ "message": "Approval withdrawn from Meridian." });
        // GitHub uses PUT for dismissal.
        let resp = self
            .client
            .put(&dismiss_url)
            .bearer_auth(&self.pat)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", "meridian-app")
            .header("Content-Type", "application/json")
            .body(payload.to_string())
            .send()
            .await
            .map_err(|e| format!("Request failed: {e}"))?;
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("GitHub dismiss-review failed: {body}"));
        }
        Ok(())
    }

    async fn request_changes_pr(&self, pr_id: i64) -> Result<(), String> {
        let url = self.repo_url(&format!("/pulls/{pr_id}/reviews"));
        // GitHub requires a body when submitting CHANGES_REQUESTED.
        let payload = json!({
            "event": "REQUEST_CHANGES",
            "body": "Changes requested via Meridian.",
        });
        self.post_json(&url, payload).await.map(|_| ())
    }

    async fn unrequest_changes_pr(&self, pr_id: i64) -> Result<(), String> {
        let reviews_url = self.repo_url(&format!("/pulls/{pr_id}/reviews?per_page=100"));
        let reviews = self.get_json(&reviews_url).await?;
        let reviews_arr = reviews.as_array().cloned().unwrap_or_default();
        let mine = identify_latest_review(&reviews_arr, "CHANGES_REQUESTED").ok_or(
            "No 'needs work' review to remove — you haven't requested changes on this PR.",
        )?;
        let dismiss_url = self.repo_url(&format!(
            "/pulls/{pr_id}/reviews/{mine}/dismissals"
        ));
        let payload = json!({ "message": "Changes-requested review withdrawn from Meridian." });
        let resp = self
            .client
            .put(&dismiss_url)
            .bearer_auth(&self.pat)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", "meridian-app")
            .header("Content-Type", "application/json")
            .body(payload.to_string())
            .send()
            .await
            .map_err(|e| format!("Request failed: {e}"))?;
        if !resp.status().is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("GitHub dismiss-review failed: {body}"));
        }
        Ok(())
    }

    async fn upload_pr_attachment(
        &self,
        _pr_id: i64,
        _filename: &str,
        _bytes: Vec<u8>,
        _content_type: Option<&str>,
    ) -> Result<String, String> {
        // GitHub has no public API for PR attachment upload. The frontend
        // already falls back to embedding the image as a data URI when
        // this returns Err.
        Err(
            "GitHub doesn't expose an attachment upload API. The image will be \
             embedded inline as a data URI instead."
                .to_string(),
        )
    }

    fn allows_image_host(&self, url: &str) -> bool {
        // GitHub-hosted user content sits behind a few domains. The list
        // covers the common cases: github.com (gists, raw), api.github.com
        // (attachments via authed API), and the *.githubusercontent.com
        // family (avatars, user-uploaded images, raw file content).
        url.starts_with("https://github.com/")
            || url.starts_with("https://api.github.com/")
            || url.starts_with("https://raw.githubusercontent.com/")
            || url.starts_with("https://avatars.githubusercontent.com/")
            || url.starts_with("https://user-images.githubusercontent.com/")
            || url.starts_with("https://media.githubusercontent.com/")
    }

    async fn fetch_authed_bytes(
        &self,
        url: &str,
    ) -> Result<(Vec<u8>, Option<String>), String> {
        GitHubClient::fetch_authed_bytes(self, url).await
    }
}

fn identify_latest_review(reviews: &[Value], state: &str) -> Option<i64> {
    // Walk in reverse so we pick the *most recent* review of the requested
    // state. The caller has already filtered to the authed user's reviews
    // by virtue of the PAT being theirs — GitHub only returns reviews the
    // token can see, and dismissing requires the token to own them anyway.
    reviews
        .iter()
        .rev()
        .find(|r| r["state"].as_str() == Some(state))
        .and_then(|r| r["id"].as_i64())
}
