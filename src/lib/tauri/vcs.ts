// VCS (version-control hosting) types and command wrappers.
//
// The Rust backend abstracts Bitbucket and GitHub behind a single
// `VcsProvider` trait; this file mirrors that surface for the frontend.
// Each `VcsRepo` pins one repository on one provider — the PR Review
// header dropdown and the Commander launch modal both choose from this
// list independently.

import { invoke } from "@tauri-apps/api/core";
import { isMockMode } from "./core";

export type VcsKind = "bitbucket" | "github";

export interface VcsRepo {
  id: string;
  kind: VcsKind;
  /** Bitbucket workspace slug or GitHub owner (org/user). */
  workspace: string;
  /** Repository slug. */
  slug: string;
  /** Default branch used for PR diffs and worktree base. */
  baseBranch: string;
  /** Human-readable name; falls back to `workspace/slug` if empty. */
  displayName: string;
  /** Optional per-repo override for the local git worktree path. */
  worktreePath: string | null;
}

export function vcsRepoLabel(repo: VcsRepo): string {
  return repo.displayName.trim() || `${repo.workspace}/${repo.slug}`;
}

/** Preference keys for per-surface selections (independent defaults). */
export const PR_REVIEW_ACTIVE_REPO_PREF = "pr_review_active_repo_id";
export const COMMANDER_DEFAULT_REPO_PREF = "commander_default_repo_id";

export async function listVcsRepos(): Promise<VcsRepo[]> {
  if (isMockMode()) return [];
  return invoke<VcsRepo[]>("list_vcs_repos");
}

export async function upsertVcsRepo(repo: VcsRepo): Promise<VcsRepo[]> {
  if (isMockMode()) return [];
  return invoke<VcsRepo[]>("upsert_vcs_repo", { repo });
}

export async function deleteVcsRepo(repoId: string): Promise<VcsRepo[]> {
  if (isMockMode()) return [];
  return invoke<VcsRepo[]>("delete_vcs_repo", { repoId });
}

export async function replaceVcsRepos(repos: VcsRepo[]): Promise<VcsRepo[]> {
  if (isMockMode()) return [];
  return invoke<VcsRepo[]>("replace_vcs_repos", { repos });
}
