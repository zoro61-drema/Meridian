// Tauri command handlers — grouped by domain
// Credentials are always read from the OS keychain in the backend and never returned to the frontend.

pub mod bitbucket;
pub mod credentials;
pub mod fetch_url;
pub mod grooming_templates;
pub mod jira;
pub mod meetings;
pub mod meetings_search;
pub mod preferences;
pub mod pr_template;
pub mod repo;
pub mod skills;
pub mod sprint_reports;
pub mod store_cache;
pub mod tasks;
pub mod time_tracking;
pub mod trend_analyses;
pub mod validate;
pub mod vcs_repos;
pub mod workflows;

use crate::agents;
use crate::llms;

pub use agents::dispatch::llm_client;
pub use agents::trends::generate_multi_sprint_trends;
pub use bitbucket::{
    approve_pr, create_pr_task, create_pull_request, delete_pr_comment, fetch_bitbucket_image,
    get_merged_prs, get_my_open_prs, get_open_prs, get_pr, get_pr_comments, get_pr_diff,
    get_pr_file_content, get_pr_tasks, get_prs_for_review, post_pr_comment, request_changes_pr,
    resolve_pr_task, unapprove_pr, unrequest_changes_pr, update_pr_comment, update_pr_task,
    upload_pr_attachment,
};
pub use credentials::{
    credential_status, delete_credential, get_non_secret_config, save_credential,
};
pub use fetch_url::fetch_url_content;
pub use jira::{
    fetch_jira_image,
    get_active_sprint,
    get_active_sprint_issues,
    get_all_active_sprint_issues,
    get_all_active_sprints,
    get_completed_sprints,
    get_future_sprints,
    get_issue,
    get_jira_fields,
    get_my_sprint_issues,
    // Diagnostic / discovery commands
    get_raw_issue_fields,
    get_sprint_issues,
    get_sprint_issues_by_id,
    search_jira_issues,
    update_jira_fields,
    update_jira_issue,
};
pub use tasks::{create_task, delete_task, list_tasks, update_task};
pub use time_tracking::{
    get_system_activity_state, load_time_tracking_state, save_time_tracking_state,
    start_time_tracking_poller,
};
pub use meetings::{
    active_meeting_id, clear_meetings_embeddings, create_notes_meeting, delete_meeting,
    diarize_meeting, download_whisper_model, get_meetings_dir, list_meetings, list_microphones,
    list_whisper_models, load_meeting, meetings_index_status, pause_meeting_recording,
    recommend_whisper_model, reindex_all_meetings, rename_meeting_speaker, resume_meeting_recording,
    save_meeting,
    start_meeting_recording, stop_meeting_recording, update_meeting_notes,
};
pub use llms::embeddings::probe_ollama_cmd;
pub use meetings_search::{get_meeting_segment, search_meetings};
pub use llms::claude::{cancel_review, get_claude_models};
pub use llms::codex::{
    detect_codex_cli, enable_codex_cli_delegation, ping_codex, test_codex_stored,
    validate_openai_api_key,
};
pub use llms::copilot::{
    add_custom_copilot_model, detect_copilot_cli, enable_copilot_cli_delegation,
    get_copilot_models, get_custom_copilot_models, remove_custom_copilot_model,
    test_copilot_stored,
};
pub use llms::gemini::{
    add_custom_gemini_model, detect_gemini_cli, enable_gemini_cli_delegation,
    get_custom_gemini_models, get_gemini_models, remove_custom_gemini_model, test_gemini_stored,
    validate_gemini,
};
pub use llms::local_llm::{
    get_local_models, ping_local_llm, test_local_llm_stored, validate_local_llm,
};
pub use preferences::{delete_preference, get_preferences, set_preference};
pub use crate::storage::preferences::{
    clear_ai_debug_log_cmd, data_directory_has_content, get_ai_debug_log_path_cmd, get_data_dir,
    move_data_directory, read_ai_debug_log_cmd, relaunch_app,
};
pub use grooming_templates::{
    get_grooming_template_path, load_grooming_template, reveal_grooming_templates_dir,
    save_grooming_template,
};
pub use pr_template::{
    get_pr_template_path, load_pr_template, reveal_pr_template_dir, save_pr_template,
};
pub use repo::{
    checkout_pr_review_branch, checkout_worktree_branch, exec_in_worktree, get_file_at_base,
    get_file_history, get_repo_diff, get_repo_log, glob_grooming_files, glob_repo_files,
    grep_grooming_files, grep_repo_files, read_grooming_file, read_repo_file, run_in_terminal,
    sync_grooming_worktree, sync_worktree, validate_base_branch, validate_grooming_worktree,
    validate_pr_review_worktree, validate_source_repo, validate_worktree, write_repo_file,
};
pub use skills::{delete_agent_skill, load_agent_skills, save_agent_skill};
pub use sprint_reports::{
    get_sprint_reports_dir, list_cached_sprint_ids, load_sprint_report, save_sprint_report,
};
pub use trend_analyses::{
    delete_trend_analysis, list_trend_analyses, load_trend_analysis, save_trend_analysis,
};
pub use store_cache::{
    clear_all_store_caches, delete_store_cache, get_store_cache_info, load_store_cache,
    save_store_cache,
};
pub use workflows::{
    run_cross_meetings_chat_workflow, run_grooming_chat_workflow,
    run_grooming_file_probe_workflow, run_grooming_workflow, run_meeting_chat_workflow,
    run_meeting_summary_workflow, run_meeting_title_workflow, run_pr_review_chat_workflow,
    run_pr_review_workflow, run_sprint_dashboard_chat_workflow,
    run_sprint_retrospective_workflow, run_workload_suggestions_workflow,
};
pub use validate::{
    debug_jira_endpoints, detect_claude_code_cli, enable_claude_code_delegation, ping_anthropic,
    ping_copilot, ping_gemini, setup_ai_cli, test_anthropic_stored, test_bitbucket_stored,
    test_github_stored, test_jira_stored, validate_anthropic, validate_bitbucket, validate_github,
    validate_jira,
};
pub use vcs_repos::{delete_vcs_repo, list_vcs_repos, replace_vcs_repos, upsert_vcs_repo};
