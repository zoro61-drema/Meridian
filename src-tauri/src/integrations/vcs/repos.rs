//! Persistence for the user's configured repositories.
//!
//! The single legacy `bitbucket_repo_slug` preference is being replaced
//! with a JSON-encoded list under `vcs_repos`. Each entry pins:
//!   - which host (`kind`),
//!   - the workspace/owner namespace,
//!   - the repo slug,
//!   - the default branch (used for diffs),
//!   - a human-readable display name,
//!   - and optionally a per-repo worktree path that overrides the legacy
//!     global `repo_worktree_path` pref.
//!
//! Credentials remain per-provider — one App Password authenticates across
//! every Bitbucket workspace the user can reach, and one PAT authenticates
//! across GitHub. The repo entries pick which workspace/slug to target.

use serde::{Deserialize, Serialize};

use crate::storage::credentials::get_credential;
use crate::storage::preferences::{get_pref, load_map, save_map};

use super::provider::VcsKind;

pub const VCS_REPOS_PREF: &str = "vcs_repos";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VcsRepo {
    pub id: String,
    pub kind: VcsKind,
    /// Bitbucket workspace slug or GitHub owner (org/user).
    pub workspace: String,
    /// Repository slug.
    pub slug: String,
    /// Default branch used when computing PR diffs and worktree base.
    pub base_branch: String,
    /// User-facing name (defaults to `workspace/slug` if empty).
    pub display_name: String,
    /// Optional per-repo worktree path. When `None`, callers fall back to
    /// the legacy global `repo_worktree_path` / `pr_review_worktree_path`
    /// preferences so existing setups keep working.
    #[serde(default)]
    pub worktree_path: Option<String>,
}

impl VcsRepo {
    pub fn display_or_default(&self) -> String {
        if self.display_name.trim().is_empty() {
            format!("{}/{}", self.workspace, self.slug)
        } else {
            self.display_name.clone()
        }
    }
}

/// Load the persisted repo list, applying the one-time legacy migration if
/// the preference is empty but old single-repo credentials still exist.
pub fn load_repos() -> Vec<VcsRepo> {
    let raw = get_pref(VCS_REPOS_PREF).unwrap_or_default();
    if !raw.trim().is_empty() {
        if let Ok(list) = serde_json::from_str::<Vec<VcsRepo>>(&raw) {
            return list;
        }
        // Corrupted value — fall through to migration so we don't strand the
        // user. The bad value will be overwritten on the next save.
    }
    migrate_legacy()
}

pub fn save_repos(repos: &[VcsRepo]) -> Result<(), String> {
    let json = serde_json::to_string(repos)
        .map_err(|e| format!("Cannot serialise vcs_repos: {e}"))?;
    let mut map = load_map();
    if repos.is_empty() {
        map.remove(VCS_REPOS_PREF);
    } else {
        map.insert(VCS_REPOS_PREF.to_string(), json);
    }
    save_map(&map)
}

pub fn find_repo(id: &str) -> Option<VcsRepo> {
    load_repos().into_iter().find(|r| r.id == id)
}

/// Seed `vcs_repos` from the legacy `bitbucket_*` single-repo config. The
/// migration only fires when the new pref is unset/empty AND the old creds
/// supply enough to build a meaningful entry — so users without Bitbucket
/// configured (e.g. fresh installs) start with an empty list.
fn migrate_legacy() -> Vec<VcsRepo> {
    let workspace = get_credential("bitbucket_workspace").unwrap_or_default();
    let slug = get_pref("bitbucket_repo_slug")
        .or_else(|| get_credential("bitbucket_repo_slug"))
        .unwrap_or_default();
    if workspace.trim().is_empty() || slug.trim().is_empty() {
        return Vec::new();
    }
    let base_branch = get_pref("repo_base_branch")
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "develop".to_string());
    let worktree_path = get_pref("repo_worktree_path").filter(|s| !s.trim().is_empty());

    let migrated = vec![VcsRepo {
        id: format!("legacy-bitbucket-{}", slug),
        kind: VcsKind::Bitbucket,
        workspace: workspace.clone(),
        slug: slug.clone(),
        base_branch,
        display_name: format!("{workspace}/{slug}"),
        worktree_path,
    }];
    // Persist the migrated list so this only runs once. Failures here are
    // non-fatal — the user can still operate, they'll just trigger another
    // migration attempt next time.
    let _ = save_repos(&migrated);
    migrated
}
