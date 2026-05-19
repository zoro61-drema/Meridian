// GitHub REST API client. Implements `VcsProvider` so PR Review, Sprint
// Dashboard, and Commander PR-reviewing roles work against GitHub repos
// the same way they work against Bitbucket.
//
// Auth model: a single PAT (fine-grained or classic) is stored under
// `github_pat`. The user's GitHub login is stored under `github_username`
// (used to filter "my PRs" / "PRs for review"). An optional
// `github_base_url` lets enterprise installs point at
// `https://<host>/api/v3` instead of `https://api.github.com`.
//
// Concept mapping notes:
//   - GitHub PR numbers are stable integers — we pass them through as
//     the trait's `pr_id`.
//   - GitHub has no first-class "tasks". `list_pr_tasks` returns an
//     empty list; the mutation methods return Err so the frontend can
//     hide task affordances for GitHub repos.
//   - PR comments live in two endpoints (issue conversation vs. inline
//     review threads); we merge both into the unified `Comment` shape
//     using `inline` to disambiguate.

mod client;
mod parsing;
mod provider;

pub use client::GitHubClient;
