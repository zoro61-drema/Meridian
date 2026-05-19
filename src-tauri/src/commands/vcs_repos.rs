//! Tauri commands for managing the user's configured VCS repositories.
//!
//! Each entry pins (provider, workspace, slug, base branch, display name,
//! optional worktree path). The frontend uses these to populate the PR
//! Review header dropdown and the Commander launch-modal repo picker, and
//! the Rust factory uses them to build the right `VcsProvider` for a
//! given action.

use crate::integrations::vcs::{load_repos, save_repos, VcsRepo};

/// All configured repos, in stored order. The first entry is treated as
/// the legacy "primary" by callers that have not yet migrated to taking a
/// `repoId` parameter.
#[tauri::command]
pub fn list_vcs_repos() -> Result<Vec<VcsRepo>, String> {
    Ok(load_repos())
}

/// Insert a new repo, or replace one with the same id. Returns the full
/// updated list so the frontend doesn't need a follow-up fetch.
#[tauri::command]
pub fn upsert_vcs_repo(repo: VcsRepo) -> Result<Vec<VcsRepo>, String> {
    let mut repos = load_repos();
    if let Some(existing) = repos.iter_mut().find(|r| r.id == repo.id) {
        *existing = repo;
    } else {
        repos.push(repo);
    }
    save_repos(&repos)?;
    Ok(repos)
}

#[tauri::command]
pub fn delete_vcs_repo(repo_id: String) -> Result<Vec<VcsRepo>, String> {
    let mut repos = load_repos();
    repos.retain(|r| r.id != repo_id);
    save_repos(&repos)?;
    Ok(repos)
}

/// Replace the entire list. Useful for the Settings screen when the user
/// reorders entries — the first repo is treated as the default by legacy
/// callers, so order matters.
#[tauri::command]
pub fn replace_vcs_repos(repos: Vec<VcsRepo>) -> Result<Vec<VcsRepo>, String> {
    save_repos(&repos)?;
    Ok(repos)
}
