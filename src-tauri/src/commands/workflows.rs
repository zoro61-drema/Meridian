// Tauri commands that dispatch LangGraph workflows to the TypeScript sidecar.
//
// Each command resolves the active provider+model for the given panel/stage
// context (using the existing per-panel/per-stage override resolver), reads
// credentials from the keychain (API-key path) or signals CLI delegation
// (Claude Code / gemini-cli path — no credential payload), builds a
// ModelSelection, invokes `integrations::sidecar::run_workflow`, and returns
// the final structured output to the frontend.

use crate::agents::dispatch::{self, AiContext};
use crate::commands::grooming_templates::read_grooming_template;
use crate::integrations::sidecar::{
    AnthropicCreds, GoogleCreds, ModelSelection, OllamaCreds, ProviderCredentials, SidecarState,
    WorkflowResult,
};
use crate::storage::credentials::get_credential;

/// Map Meridian's internal provider names ("claude", "gemini", "local")
/// to the sidecar's normalised names ("anthropic", "google", "ollama").
pub fn to_sidecar_provider(internal: &str) -> Result<&'static str, String> {
    match internal {
        "claude" => Ok("anthropic"),
        "gemini" => Ok("google"),
        "local" => Ok("ollama"),
        other => Err(format!("Unknown internal provider: {other}")),
    }
}

pub async fn resolve_credentials(provider: &str) -> Result<ProviderCredentials, String> {
    match provider {
        "anthropic" => {
            // Two paths: stored API key for direct Anthropic API access, or
            // delegation to the user's locally-installed Claude Code CLI
            // (auth lives in the CLI itself, not in the keychain — the
            // sidecar just spawns `claude -p`). The `claude_auth_method`
            // preference is the source of truth; if unset, we infer from
            // whichever credential is present so a half-configured app
            // still produces a usable answer.
            let method =
                get_credential("claude_auth_method").unwrap_or_else(|| "api_key".to_string());
            if method == "claude_code" {
                return Ok(ProviderCredentials::Anthropic(AnthropicCreds::ClaudeCode));
            }
            let api_key = get_credential("anthropic_api_key")
                .ok_or_else(|| "Anthropic credential not configured".to_string())?;
            if !api_key.starts_with("sk-ant-api") {
                return Err(
                    "Stored Anthropic credential isn't an API key (expected `sk-ant-api…`). \
                     Re-enter your API key in Settings → Anthropic, or switch to Claude Code CLI \
                     delegation."
                        .to_string(),
                );
            }
            Ok(ProviderCredentials::Anthropic(AnthropicCreds::ApiKey {
                api_key,
            }))
        }
        "google" => {
            // Two paths, parallel to the Anthropic split: stored API key
            // (used directly against generativelanguage.googleapis.com via
            // @langchain/google-genai), or delegation to the user's
            // locally-installed `@google/gemini-cli`. The CLI handles auth
            // (personal Google OAuth → free Gemini Code Assist tier, or
            // its own API key) so the sidecar never sees credentials.
            let method =
                get_credential("gemini_auth_method").unwrap_or_else(|| "api_key".to_string());
            if method == "gemini_cli" {
                return Ok(ProviderCredentials::Google(GoogleCreds::GeminiCli));
            }
            let api_key = get_credential("gemini_api_key")
                .ok_or_else(|| "Gemini API key not configured".to_string())?;
            Ok(ProviderCredentials::Google(GoogleCreds::ApiKey { api_key }))
        }
        "ollama" => {
            let base_url = get_credential("local_llm_url")
                .filter(|u: &String| !u.trim().is_empty())
                .unwrap_or_else(|| "http://localhost:11434".to_string());
            Ok(ProviderCredentials::Ollama(OllamaCreds { base_url }))
        }
        other => Err(format!("Unsupported provider for sidecar workflows: {other}")),
    }
}

/// Resolve the active provider+model for a given panel/stage context, using
/// the same logic as the rest of the app, then build a `ModelSelection`
/// payload for the sidecar.
pub async fn resolve_model_for_context(ctx: &AiContext) -> Result<ModelSelection, String> {
    let resolved = dispatch::resolve(ctx);
    if resolved.provider.trim().is_empty() {
        return Err(
            "No default AI model is configured. Set one in Settings → Models or finish onboarding."
                .to_string(),
        );
    }
    let sidecar_provider = to_sidecar_provider(&resolved.provider)?;
    if resolved.model.trim().is_empty() {
        return Err(format!(
            "No model configured for provider {}. Set one in Settings.",
            resolved.provider,
        ));
    }
    let credentials = resolve_credentials(sidecar_provider).await?;
    let max_tokens = resolve_max_output_tokens(sidecar_provider);
    Ok(ModelSelection {
        provider: sidecar_provider.to_string(),
        model: resolved.model,
        credentials,
        max_tokens,
    })
}

/// Per-provider response-token ceiling, read live on every workflow
/// dispatch so the user's Settings choice takes effect on the very
/// next call. Returns None for Ollama (the local server enforces the
/// loaded model's context window — overriding it produces confusing
/// mid-response truncation when models with different limits get
/// loaded).
fn resolve_max_output_tokens(provider: &'static str) -> Option<u32> {
    let key = match provider {
        "anthropic" => "anthropic_max_output_tokens",
        "google" => "gemini_max_output_tokens",
        _ => return None,
    };
    crate::storage::preferences::get_pref(key)
        .and_then(|raw| raw.parse::<u32>().ok())
        .filter(|&n| n > 0)
}

#[tauri::command]
pub async fn run_grooming_workflow(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarState>,
    ticket_text: String,
    file_contents: String,
    ticket_type: Option<String>,
) -> Result<WorkflowResult, String> {
    // The standalone Ticket Quality screen shows its own
    // HeaderModelPicker keyed on the `ticket_quality` panel — using
    // that panel's AI context here means the user's selection in the
    // dropdown actually drives this call, and the per-model token
    // bucket the badge displays matches the model the call ran on.
    // Resolves against the Ticket Quality panel's own AiContext so a
    // panel-level model override actually drives this call (and the
    // per-model token bucket in the badge matches the model that ran).
    let ctx = AiContext::panel("ticket_quality");
    let model = resolve_model_for_context(&ctx).await?;

    let templates = serde_json::json!({
        "acceptance_criteria": read_grooming_template(&app, "acceptance_criteria"),
        "steps_to_reproduce": read_grooming_template(&app, "steps_to_reproduce"),
    });

    let input = serde_json::json!({
        "ticketText": ticket_text,
        "fileContents": file_contents,
        "templates": templates,
        "ticketType": ticket_type,
    });

    crate::integrations::sidecar::run_workflow(
        &app,
        &state,
        "grooming-workflow-event",
        "grooming",
        input,
        model,
        None,
        None,
    )
    .await
}

#[tauri::command]
pub async fn run_pr_review_workflow(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarState>,
    review_text: String,
) -> Result<WorkflowResult, String> {
    let ctx = AiContext::panel("pr_review");
    let model = resolve_model_for_context(&ctx).await?;

    // Chunk size is provider-agnostic now — modern local models (Qwen3-Coder,
    // DeepSeek-Coder, recent Llama variants) ship with 128k+ native context
    // windows, so the old "pin Ollama at 12k" rule was leaving capability on
    // the table. The user pref drives the default for both cloud and local;
    // anyone running a tiny local model can lower it via Settings → PR Review.
    // Hard bounds (4k–200k chars) sanity-check absurd values without
    // constraining the realistic range.
    let user_chunk = crate::storage::preferences::get_pref("pr_review_default_chunk_chars")
        .and_then(|v| v.parse::<u32>().ok())
        .filter(|&v| v >= 4_000 && v <= 200_000)
        .unwrap_or(80_000);
    // Findings budget scales linearly with chunk size — the 80k/40k ratio
    // (0.5x) keeps the synthesis prompt within the same proportion of the
    // chunk budget at any setting.
    let findings_budget = (user_chunk / 2).max(4_000);
    let chunk_chars = user_chunk;

    // Project-specific Agent Skills are appended to the synthesis system
    // prompt in the sidecar. Pass them through the input so the sidecar stays
    // stateless w.r.t. the user's local skill set.
    let review_skill = crate::commands::skills::get_skill(&app, "review");
    let impl_skill = crate::commands::skills::get_skill(&app, "implementation");
    let mut skills_block = String::new();
    if let Some(s) = review_skill {
        skills_block.push_str("\n--- Review Standards ---\n");
        skills_block.push_str(&s);
    }
    if let Some(s) = impl_skill {
        skills_block.push_str("\n--- Implementation Standards ---\n");
        skills_block.push_str(&s);
    }

    let input = serde_json::json!({
        "reviewText": review_text,
        "chunkChars": chunk_chars,
        "findingsBudget": findings_budget,
        "skillsBlock": if skills_block.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(skills_block) },
    });

    crate::integrations::sidecar::run_workflow(
        &app,
        &state,
        "pr-review-workflow-event",
        "pr_review",
        input,
        model,
        None,
        None,
    )
    .await
}

#[tauri::command]
pub async fn run_sprint_retrospective_workflow(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarState>,
    sprint_text: String,
) -> Result<WorkflowResult, String> {
    let ctx = AiContext::panel("retrospectives");
    let model = resolve_model_for_context(&ctx).await?;

    let input = serde_json::json!({
        "sprintText": sprint_text,
    });

    crate::integrations::sidecar::run_workflow(
        &app,
        &state,
        "sprint-retrospective-workflow-event",
        "sprint_retrospective",
        input,
        model,
        None,
        None,
    )
    .await
}

#[tauri::command]
pub async fn run_workload_suggestions_workflow(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarState>,
    workload_text: String,
) -> Result<WorkflowResult, String> {
    let ctx = AiContext::panel("sprint_dashboard");
    let model = resolve_model_for_context(&ctx).await?;

    let input = serde_json::json!({
        "workloadText": workload_text,
    });

    crate::integrations::sidecar::run_workflow(
        &app,
        &state,
        "workload-suggestions-workflow-event",
        "workload_suggestions",
        input,
        model,
        None,
        None,
    )
    .await
}

#[tauri::command]
pub async fn run_meeting_summary_workflow(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarState>,
    transcript_text: String,
    current_title: String,
    current_tags_json: String,
) -> Result<WorkflowResult, String> {
    let ctx = AiContext::panel("meetings");
    let model = resolve_model_for_context(&ctx).await?;

    let input = serde_json::json!({
        "transcriptText": transcript_text,
        "currentTitle": current_title,
        "currentTagsJson": current_tags_json,
    });

    crate::integrations::sidecar::run_workflow(
        &app,
        &state,
        "meeting-summary-workflow-event",
        "meeting_summary",
        input,
        model,
        None,
        None,
    )
    .await
}

#[tauri::command]
pub async fn run_meeting_title_workflow(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarState>,
    content_text: String,
    current_tags_json: String,
) -> Result<WorkflowResult, String> {
    let ctx = AiContext::panel("meetings");
    let model = resolve_model_for_context(&ctx).await?;

    let input = serde_json::json!({
        "contentText": content_text,
        "currentTagsJson": current_tags_json,
    });

    crate::integrations::sidecar::run_workflow(
        &app,
        &state,
        "meeting-title-workflow-event",
        "meeting_title",
        input,
        model,
        None,
        None,
    )
    .await
}

#[tauri::command]
pub async fn run_sprint_dashboard_chat_workflow(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarState>,
    context_text: String,
    history_json: String,
) -> Result<WorkflowResult, String> {
    let ctx = AiContext::panel("sprint_dashboard");
    let model = resolve_model_for_context(&ctx).await?;

    let input = serde_json::json!({
        "contextText": context_text,
        "historyJson": history_json,
    });

    crate::integrations::sidecar::run_workflow(
        &app,
        &state,
        "sprint-dashboard-chat-workflow-event",
        "sprint_dashboard_chat",
        input,
        model,
        None,
        None,
    )
    .await
}

#[tauri::command]
pub async fn run_meeting_chat_workflow(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarState>,
    context_text: String,
    history_json: String,
) -> Result<WorkflowResult, String> {
    let ctx = AiContext::panel("meetings");
    let model = resolve_model_for_context(&ctx).await?;

    let input = serde_json::json!({
        "contextText": context_text,
        "historyJson": history_json,
    });

    crate::integrations::sidecar::run_workflow(
        &app,
        &state,
        "meeting-chat-workflow-event",
        "meeting_chat",
        input,
        model,
        None,
        None,
    )
    .await
}

#[tauri::command]
pub async fn run_cross_meetings_chat_workflow(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarState>,
    context_hits: serde_json::Value,
    history_json: String,
    semantic_available: bool,
) -> Result<WorkflowResult, String> {
    // Reuse the meetings panel's AI context — same provider/model
    // selection, same token bucket. The cross-meetings flow is just
    // a different system prompt over the same panel scope.
    let ctx = AiContext::panel("meetings");
    let model = resolve_model_for_context(&ctx).await?;

    let input = serde_json::json!({
        "contextHits": context_hits,
        "historyJson": history_json,
        "semanticAvailable": semantic_available,
    });

    crate::integrations::sidecar::run_workflow(
        &app,
        &state,
        "cross-meetings-chat-workflow-event",
        "cross_meetings_chat",
        input,
        model,
        None,
        None,
    )
    .await
}

#[tauri::command]
pub async fn run_pr_review_chat_workflow(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarState>,
    context_text: String,
    history_json: String,
) -> Result<WorkflowResult, String> {
    let ctx = AiContext::panel("pr_review");
    let model = resolve_model_for_context(&ctx).await?;

    // Project-specific Agent Skills are appended to the chat system prompt
    // in the sidecar — pass them through the input rather than reading them
    // there, so the sidecar stays stateless w.r.t. the user's local skill set.
    let review_skill = crate::commands::skills::get_skill(&app, "review");
    let impl_skill = crate::commands::skills::get_skill(&app, "implementation");
    let mut skills_block = String::new();
    if review_skill.is_some() || impl_skill.is_some() {
        skills_block.push_str(
            "=== PROJECT-SPECIFIC CONVENTIONS (Agent Skills) ===\n\
             These codebase-specific standards must inform any code you write or suggest:\n",
        );
        if let Some(s) = review_skill {
            skills_block.push_str("\n--- Review Standards ---\n");
            skills_block.push_str(&s);
        }
        if let Some(s) = impl_skill {
            skills_block.push_str("\n--- Implementation Standards ---\n");
            skills_block.push_str(&s);
        }
    }

    let input = serde_json::json!({
        "contextText": context_text,
        "historyJson": history_json,
        "skillsBlock": if skills_block.is_empty() {
            serde_json::Value::Null
        } else {
            serde_json::Value::String(skills_block)
        },
    });

    crate::integrations::sidecar::run_workflow(
        &app,
        &state,
        "pr-review-chat-workflow-event",
        "pr_review_chat",
        input,
        model,
        None,
        None,
    )
    .await
}

#[tauri::command]
pub async fn run_grooming_chat_workflow(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarState>,
    context_text: String,
    history_json: String,
) -> Result<WorkflowResult, String> {
    // Resolve under the same Ticket Quality panel context as the
    // standalone grooming run — the screen's HeaderModelPicker writes
    // panel overrides keyed on `ticket_quality`.
    let ctx = AiContext::panel("ticket_quality");
    let model = resolve_model_for_context(&ctx).await?;

    // Pull the user's grooming format templates from the store and pass them
    // into the sidecar input. The sidecar appends them to the system prompt
    // so the agent's `suggested` text matches the user's expected structure.
    let templates = serde_json::json!({
        "acceptance_criteria": crate::commands::grooming_templates::read_grooming_template(
            &app,
            "acceptance_criteria",
        ),
        "steps_to_reproduce": crate::commands::grooming_templates::read_grooming_template(
            &app,
            "steps_to_reproduce",
        ),
    });

    let input = serde_json::json!({
        "contextText": context_text,
        "historyJson": history_json,
        "templates": templates,
    });

    crate::integrations::sidecar::run_workflow(
        &app,
        &state,
        "grooming-chat-workflow-event",
        "grooming_chat",
        input,
        model,
        None,
        None,
    )
    .await
}

#[tauri::command]
pub async fn run_grooming_file_probe_workflow(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarState>,
    ticket_text: String,
) -> Result<WorkflowResult, String> {
    use tauri::Emitter;
    // Preserve the legacy "grooming-progress" toast the UI surfaces while the
    // probe is running.
    let _ = app.emit(
        "grooming-progress",
        serde_json::json!({
            "phase": "probe",
            "message": "Identifying relevant files in the codebase…"
        }),
    );

    let ctx = AiContext::panel("ticket_quality");
    let model = resolve_model_for_context(&ctx).await?;

    let input = serde_json::json!({
        "ticketText": ticket_text,
    });

    crate::integrations::sidecar::run_workflow(
        &app,
        &state,
        "grooming-file-probe-workflow-event",
        "grooming_file_probe",
        input,
        model,
        None,
        None,
    )
    .await
}
