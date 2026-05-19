//! Version-control hosting abstraction. `VcsProvider` is the seam that lets
//! PR Review, the Sprint Dashboard, and Commander-driven PR roles target
//! Bitbucket or GitHub uniformly. Provider-specific HTTP code lives under
//! `integrations/<provider>/`; this module only owns the trait, the neutral
//! data shapes, and the factory that resolves a provider for a request.

mod factory;
mod provider;
mod repos;
pub mod types;

pub use factory::{active_vcs_provider, vcs_provider_for_repo};
pub use provider::{NewComment, NewPr, VcsIdentity, VcsKind, VcsProvider};
pub use repos::{find_repo, load_repos, save_repos, VcsRepo};
pub use types::{Comment, InlineContext, Pr, Reviewer, Task, User};
