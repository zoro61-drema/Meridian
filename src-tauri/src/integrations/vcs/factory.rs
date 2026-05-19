//! Resolves a `VcsProvider` for a Tauri command call.
//!
//! Two entry points exist during the multi-repo rollout:
//!
//! - `vcs_provider_for_repo(&VcsRepo)` — the future contract. Callers pass
//!   the repo they want to act on; we build a provider from per-provider
//!   credentials + the per-repo workspace/slug/base_branch.
//!
//! - `active_vcs_provider()` — the legacy fallback for commands that have
//!   not yet learned about `repoId`. It picks the first stored repo (after
//!   migration) and otherwise reads the old single-slug credentials. Once
//!   the frontend migrations are complete this can go away.

use crate::integrations::bitbucket::BitbucketClient;
use crate::integrations::github::GitHubClient;
use crate::storage::credentials::get_credential;
use crate::storage::preferences::get_pref;

use super::provider::{VcsKind, VcsProvider};
use super::repos::{load_repos, VcsRepo};

/// Preference key the PR Review screen writes when the header dropdown
/// changes. Must stay in sync with the constant of the same name in
/// `src/lib/tauri/vcs.ts`.
const PR_REVIEW_ACTIVE_REPO_PREF: &str = "pr_review_active_repo_id";

fn get_config(key: &str) -> Option<String> {
    get_pref(key).or_else(|| get_credential(key))
}

fn build_bitbucket(workspace: &str, slug: &str) -> Result<BitbucketClient, String> {
    let username = get_credential("bitbucket_email")
        .ok_or("Bitbucket username (email) not configured. Check Settings.")?;
    let access_token = get_credential("bitbucket_access_token")
        .ok_or("Bitbucket access token not configured. Check Settings.")?;
    BitbucketClient::new(
        workspace.to_string(),
        slug.to_string(),
        username,
        access_token,
    )
}

fn build_github(owner: &str, repo: &str) -> Result<GitHubClient, String> {
    let pat = get_credential("github_pat")
        .ok_or("GitHub PAT not configured. Check Settings.")?;
    let base_url = get_config("github_base_url");
    GitHubClient::new(owner.to_string(), repo.to_string(), pat, base_url)
}

/// Build a provider that points at the given repo. Credentials are pulled
/// from the per-provider credential keys (one set per host); the repo's
/// `workspace` + `slug` decide which repository inside that host to hit.
pub fn vcs_provider_for_repo(repo: &VcsRepo) -> Result<Box<dyn VcsProvider>, String> {
    match repo.kind {
        VcsKind::Bitbucket => Ok(Box::new(build_bitbucket(&repo.workspace, &repo.slug)?)),
        VcsKind::Github => Ok(Box::new(build_github(&repo.workspace, &repo.slug)?)),
    }
}

pub fn active_vcs_provider() -> Result<Box<dyn VcsProvider>, String> {
    let repos = load_repos();

    // Honour the PR Review screen's selection first — when the user picks
    // a repo from the header dropdown, every PR-related Tauri command
    // routes there. Falls through to the first stored repo, then to the
    // pre-multi-repo single-slug credentials.
    if let Some(pinned) = get_pref(PR_REVIEW_ACTIVE_REPO_PREF) {
        if let Some(repo) = repos.iter().find(|r| r.id == pinned) {
            return vcs_provider_for_repo(repo);
        }
    }

    if let Some(repo) = repos.first() {
        return vcs_provider_for_repo(repo);
    }

    let workspace = get_credential("bitbucket_workspace")
        .ok_or("Bitbucket workspace not configured. Check Settings.")?;
    let slug = get_config("bitbucket_repo_slug")
        .ok_or("Bitbucket repository not configured. Check Settings → Configuration.")?;
    Ok(Box::new(build_bitbucket(&workspace, &slug)?))
}
