// Validate-credentials Tauri commands, grouped by provider.
//
// The parent `commands/mod.rs` does `pub use validate::{ … }`, so each
// command must be re-exported at this module's root.

mod _shared;
mod anthropic;
mod bitbucket;
mod cli_setup;
mod copilot;
mod gemini;
mod github;
mod jira;

pub use anthropic::{
    detect_claude_code_cli, enable_claude_code_delegation, ping_anthropic, test_anthropic_stored,
    validate_anthropic,
};
pub use bitbucket::{test_bitbucket_stored, validate_bitbucket};
pub use cli_setup::setup_ai_cli;
pub use copilot::ping_copilot;
pub use gemini::ping_gemini;
pub use github::{test_github_stored, validate_github};
pub use jira::{debug_jira_endpoints, test_jira_stored, validate_jira};
