# VCS multi-repo migration — post-migration cleanup

Run this checklist **after** the legacy `bitbucket_workspace` + `bitbucket_repo_slug` config has been migrated into `vcs_repos` on every machine you use Meridian on. Open Settings → Integrations → Repositories and confirm the expected entries are present before deleting anything below.

The migration is one-shot: it fires the first time `load_repos()` is called against an empty `vcs_repos` pref, seeds an entry from the legacy creds, and persists. Once `vcs_repos` is populated, the migration helper never runs again. The code below is dead weight from that point on.

## Rust

### 1. Drop the migration helper

**File**: `src-tauri/src/integrations/vcs/repos.rs`

Remove `fn migrate_legacy() -> Vec<VcsRepo>` (around line 90) and replace its single call site at line 67 with `Vec::new()`:

```rust
pub fn load_repos() -> Vec<VcsRepo> {
    let raw = get_pref(VCS_REPOS_PREF).unwrap_or_default();
    if raw.trim().is_empty() {
        return Vec::new();
    }
    serde_json::from_str::<Vec<VcsRepo>>(&raw).unwrap_or_default()
}
```

After this change the `get_credential` / `get_pref` imports at the top of the file can be pruned to just `get_pref` (used in `VCS_REPOS_PREF` reads). Drop the multi-line doc comment in the module header that explains "the single legacy `bitbucket_repo_slug` preference is being replaced".

### 2. Drop the legacy fallback in the factory

**File**: `src-tauri/src/integrations/vcs/factory.rs`

`active_vcs_provider()` currently falls through to `bitbucket_workspace` + `bitbucket_repo_slug` credentials when `vcs_repos` is empty. After migration this path is unreachable. Trim the tail of the function so the "no repos configured" case returns a clear error:

```rust
pub fn active_vcs_provider() -> Result<Box<dyn VcsProvider>, String> {
    let repos = load_repos();

    if let Some(pinned) = get_pref(PR_REVIEW_ACTIVE_REPO_PREF) {
        if let Some(repo) = repos.iter().find(|r| r.id == pinned) {
            return vcs_provider_for_repo(repo);
        }
    }
    if let Some(repo) = repos.first() {
        return vcs_provider_for_repo(repo);
    }
    Err("No VCS repositories configured. Add one in Settings → Integrations → Repositories.".to_string())
}
```

Drop the `get_credential` import and the `get_config` helper from this file once they're no longer used.

### 3. Retire the legacy credential / pref keys

Once both fallbacks are gone, `bitbucket_workspace` and `bitbucket_repo_slug` are no longer read anywhere — they linger as dead entries in the keychain / `preferences.json`. Three changes:

- **File**: `src-tauri/src/commands/credentials.rs`
  - Remove `"bitbucket_workspace"` from `ALLOWED_KEYS` and `NON_SECRET_KEYS`.
  - Remove `"bitbucket_repo_slug"` from `NON_SECRET_KEYS`.
  - Remove the `bitbucket_workspace` and `bitbucket_repo_slug` fields from `CredentialStatus` + `credential_status()`.

- **File**: `src/lib/tauri/credentials.ts`
  - Remove `bitbucketWorkspace` and `bitbucketRepoSlug` from the `CredentialStatus` interface, the `EMPTY_STATUS` constant, and the `bitbucketComplete` / `credentialStatusComplete` checks.

- **File**: `src/screens/settings/bitbucket.tsx`
  - The `Workspace slug` input collected a value that fed the legacy single-repo path. Drop it from the credentials form (Bitbucket credentials are now PAT + email only; the workspace lives per-repo in `Repositories`).
  - Wire the `reset` handler to stop trying to delete `bitbucket_workspace`.

### 4. Retire the legacy ConfigSection slug input

**File**: `src/screens/settings/config.tsx` and its callsite in `src/screens/SettingsScreen.tsx` (`<ConfigSection bitbucketRepoSlug={…} />`)

The card's Bitbucket repo-slug field is now replaced by the Repositories CRUD card. Either:

- Delete the Bitbucket slug field from `ConfigSection` (keep the JIRA board id field), or
- If JIRA board id is the only thing left, delete `ConfigSection` entirely and inline the JIRA field next to `JiraSection`.

Drop the `bitbucketRepoSlug` prop wiring once the field is gone.

### 5. Drop the transitional `Bitbucket*` type aliases

**File**: `src-tauri/src/integrations/bitbucket/mod.rs`

The `pub use crate::integrations::vcs::types::{Comment as BitbucketComment, …}` block was a transitional shim so existing call sites kept compiling after types moved to `vcs/`. Once you're comfortable doing a one-shot rename pass, replace every `BitbucketPr` / `BitbucketComment` / `BitbucketTask` / `BitbucketUser` / `BitbucketReviewer` / `BitbucketInlineContext` reference in `commands/bitbucket.rs` and the bitbucket internal files with the neutral names, then delete the alias block.

**TypeScript side**: the same names live in `src/lib/tauri/bitbucket.ts` as the wire-shape contract for the frontend. Renaming those is a bigger sweep across PR Review components — defer unless you also want to rename the file to `vcs.ts` and consolidate.

## Optional — once you fully trust the new path

- Rename `fetch_bitbucket_image` Tauri command + its frontend wrapper to `fetch_vcs_image`. The current name lies — it proxies whatever the active provider's `allows_image_host` accepts.
- Rename `commands/bitbucket.rs` → `commands/vcs.rs`. Move `upload_pr_attachment` semantics behind a clearer name (the GitHub impl returns Err — frontend already falls back to data URIs).

## Verification

After steps 1–4, run:

```
cd src-tauri && cargo check --tests
npx tsc --noEmit
```

Then exercise Settings → Integrations → Repositories, PR Review's header dropdown, and one Commander PR-role launch to make sure the dead-code removal didn't accidentally cut a live wire.
