// Bitbucket REST API client. Split into submodules:
//   - `client`    — `BitbucketClient` struct + shared HTTP plumbing
//   - `parsing`   — JSON → typed-struct helpers
//   - `endpoints` — additional `impl BitbucketClient` blocks per resource
//   - `provider`  — `impl VcsProvider for BitbucketClient`
//
// PR/comment/task/user types now live in `integrations/vcs/types.rs` so
// they can be shared with the GitHub impl. The `Bitbucket*`-prefixed names
// below are kept as transitional aliases — call sites still spell them the
// old way until the multi-repo migration replaces those imports.

mod client;
mod endpoints;
mod parsing;
mod provider;

pub use client::BitbucketClient;
pub use crate::integrations::vcs::types::{
    Comment as BitbucketComment, InlineContext as BitbucketInlineContext, Pr as BitbucketPr,
    Reviewer as BitbucketReviewer, Task as BitbucketTask, User as BitbucketUser,
};
