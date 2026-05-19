import { invoke } from "@tauri-apps/api/core";

// ── Validation commands ───────────────────────────────────────────────────────

export async function validateAnthropic(apiKey: string): Promise<string> {
  return invoke<string>("validate_anthropic", { apiKey });
}

export async function validateJira(
  baseUrl: string,
  email: string,
  apiToken: string,
): Promise<string> {
  return invoke<string>("validate_jira", { baseUrl, email, apiToken });
}

export async function validateBitbucket(
  workspace: string,
  email: string,
  accessToken: string,
): Promise<string> {
  return invoke<string>("validate_bitbucket", {
    workspace,
    email,
    accessToken,
  });
}


export async function validateGithub(
  pat: string,
  username: string,
  baseUrl: string,
): Promise<string> {
  return invoke<string>("validate_github", {
    pat,
    username,
    baseUrl: baseUrl || null,
  });
}

/** Test the stored Anthropic key without passing it through the frontend. */
export async function testAnthropicStored(): Promise<string> {
  return invoke<string>("test_anthropic_stored");
}

/** Send a real "hello" message to Claude and verify a response comes back. */
export async function pingAnthropic(): Promise<string> {
  return invoke<string>("ping_anthropic");
}

/** Send a real "hello" message to Gemini and verify a response comes back. */
export async function pingGemini(): Promise<string> {
  return invoke<string>("ping_gemini");
}

/**
 * Detect the locally-installed Claude Code CLI. Returns the absolute path
 * to the `claude` binary on success; throws with an install hint when the
 * CLI isn't on PATH. Used by the Anthropic Settings card to show a green
 * "detected at /…" badge before the user switches to delegation mode.
 */
export async function detectClaudeCodeCli(): Promise<string> {
  return invoke<string>("detect_claude_code_cli");
}

/**
 * Switch the active Anthropic auth mode to Claude Code CLI delegation.
 * Verifies the CLI is on PATH and writes the auth-method preference. The
 * sidecar's workflow dispatcher reads that preference and routes to the
 * `ClaudeCodeChatModel` adapter, which shells out per call. No credentials
 * are stored — the CLI owns its own auth.
 */
export async function enableClaudeCodeDelegation(): Promise<string> {
  return invoke<string>("enable_claude_code_delegation");
}

/**
 * Open a terminal window (using the user's configured terminal app) and run
 * a guided install + sign-in script for the chosen provider's CLI. The
 * script checks if the CLI is already installed, asks to install via npm
 * if not, then runs the CLI's own sign-in command (`claude /login`,
 * `gemini`, or `copilot login`).
 */
export async function setupAiCli(
  provider: "anthropic" | "google" | "copilot" | "codex",
): Promise<void> {
  return invoke<void>("setup_ai_cli", { provider });
}

/**
 * Return the live Claude model catalogue (or a hardcoded fallback list when
 * the live fetch fails). `fetchError` is `null` on success and a human-readable
 * reason on failure — UI should surface it so users know they're seeing
 * potentially-stale models.
 */
export interface ClaudeModelsResult {
  models: [string, string][];
  fetchError: string | null;
}

export async function getClaudeModels(): Promise<ClaudeModelsResult> {
  return invoke<ClaudeModelsResult>("get_claude_models");
}

/**
 * Detect the locally-installed `@google/gemini-cli`. Returns the absolute
 * path to the `gemini` binary on success; throws with an install hint when
 * the CLI isn't on PATH. Used by the Gemini Settings card to show a green
 * "detected at /…" badge before the user switches to delegation mode.
 */
export async function detectGeminiCli(): Promise<string> {
  return invoke<string>("detect_gemini_cli");
}

/**
 * Switch the active Gemini auth mode to CLI delegation. Verifies the CLI
 * is on PATH and writes the auth-method preference. The sidecar's
 * workflow dispatcher reads that preference and routes to the
 * `GeminiCliChatModel` adapter, which shells out per call. No credentials
 * are stored — the CLI owns its own auth.
 */
export async function enableGeminiCliDelegation(): Promise<string> {
  return invoke<string>("enable_gemini_cli_delegation");
}

/**
 * Return the Gemini model catalogue plus an optional fetchError. `models`
 * is the live `/v1beta/models` result when an API key is configured, or
 * the cached/hardcoded fallback for delegation users. `fetchError` is
 * non-null only when the live call was attempted and failed, so the UI
 * can warn the user they're looking at a potentially-stale list.
 *
 * Shape parallels `ClaudeModelsResult` from `getClaudeModels`.
 */
export interface GeminiModelsResult {
  models: [string, string][];
  fetchError: string | null;
}

export async function getGeminiModels(): Promise<GeminiModelsResult> {
  return invoke<GeminiModelsResult>("get_gemini_models");
}

/** Return just the user-added custom Gemini model IDs. */
export async function getCustomGeminiModels(): Promise<string[]> {
  return invoke<string[]>("get_custom_gemini_models");
}

/** Persist a new custom Gemini model ID. Returns the updated custom list. */
export async function addCustomGeminiModel(modelId: string): Promise<string[]> {
  return invoke<string[]>("add_custom_gemini_model", { modelId });
}

/** Remove a user-added custom Gemini model. Returns the updated custom list. */
export async function removeCustomGeminiModel(
  modelId: string,
): Promise<string[]> {
  return invoke<string[]>("remove_custom_gemini_model", { modelId });
}

/**
 * Validate a Gemini API key by making a lightweight models-list request.
 * Saves the key on success; throws on failure.
 */
export async function validateGemini(apiKey: string): Promise<string> {
  return invoke<string>("validate_gemini", { apiKey });
}

/** Test the already-stored Gemini API key without re-saving it. */
export async function testGeminiStored(): Promise<string> {
  return invoke<string>("test_gemini_stored");
}

// ── Copilot CLI ───────────────────────────────────────────────────────────────

/**
 * Detect the locally-installed GitHub Copilot CLI. Returns the absolute
 * path to the `copilot` binary on success; throws with an install hint
 * when the CLI isn't on PATH.
 */
export async function detectCopilotCli(): Promise<string> {
  return invoke<string>("detect_copilot_cli");
}

/**
 * Switch the active Copilot auth mode to CLI delegation. Verifies the
 * CLI is on PATH, then writes the auth-method preference. The sidecar's
 * dispatcher reads that preference and routes to the
 * `CopilotCliChatModel` adapter, which shells out per call. No
 * credentials are stored — the CLI owns its own auth (`copilot login`
 * or COPILOT_GITHUB_TOKEN).
 */
export async function enableCopilotCliDelegation(): Promise<string> {
  return invoke<string>("enable_copilot_cli_delegation");
}

/** Test the already-stored Copilot configuration — re-detects the CLI. */
export async function testCopilotStored(): Promise<string> {
  return invoke<string>("test_copilot_stored");
}

/** Send a real "hello" message to Copilot via the CLI and verify a response. */
export async function pingCopilot(): Promise<string> {
  return invoke<string>("ping_copilot");
}

/** Same shape as ClaudeModelsResult / GeminiModelsResult, minus the
 *  `fetchError` field — Copilot has no live-fetch path (GitHub's
 *  models endpoint validates IDE-identity headers that we don't
 *  impersonate). */
export interface CopilotModelsResult {
  models: [string, string][];
}

export async function getCopilotModels(): Promise<CopilotModelsResult> {
  return invoke<CopilotModelsResult>("get_copilot_models");
}

export async function getCustomCopilotModels(): Promise<string[]> {
  return invoke<string[]>("get_custom_copilot_models");
}

export async function addCustomCopilotModel(
  modelId: string,
): Promise<string[]> {
  return invoke<string[]>("add_custom_copilot_model", { modelId });
}

export async function removeCustomCopilotModel(
  modelId: string,
): Promise<string[]> {
  return invoke<string[]>("remove_custom_copilot_model", { modelId });
}

/**
 * Return the model list from the configured local LLM server.
 * Returns an empty array if no server URL is configured or the server is unreachable.
 */
export async function getLocalModels(): Promise<[string, string][]> {
  return invoke<[string, string][]>("get_local_models");
}

/**
 * Validate a local LLM server URL (and optional API key) by connecting to it.
 * Normalises the URL to end with /v1, saves on success; throws on failure.
 */
export async function validateLocalLlm(
  url: string,
  apiKey: string,
): Promise<string> {
  return invoke<string>("validate_local_llm", { url, apiKey });
}

/** Test the already-stored local LLM server connection without re-saving it. */
export async function testLocalLlmStored(): Promise<string> {
  return invoke<string>("test_local_llm_stored");
}


/** Send a real "Say hello." message via the configured local LLM and
 *  return the reply. Tests the full inference path, not just connectivity. */
export async function pingLocalLlm(): Promise<string> {
  return invoke<string>("ping_local_llm");
}

/** Test the stored JIRA credentials without passing secrets through the frontend. */
export async function testJiraStored(): Promise<string> {
  return invoke<string>("test_jira_stored");
}

/** Test the stored Bitbucket credentials without passing secrets through the frontend. */
export async function testBitbucketStored(): Promise<string> {
  return invoke<string>("test_bitbucket_stored");
}


export async function testGithubStored(): Promise<string> {
  return invoke<string>("test_github_stored");
}

/** Run a full diagnostic sweep of every JIRA endpoint, returning a plain-text report. */
export async function debugJiraEndpoints(): Promise<string> {
  return invoke<string>("debug_jira_endpoints");
}


// ── Codex CLI (OpenAI / ChatGPT) ─────────────────────────────────────────────

/** Detect the locally-installed OpenAI Codex CLI. Returns the absolute
 *  path on success; throws with an install hint when the CLI isn't on
 *  PATH. Codex is CLI-delegation-only — the user signs in once via
 *  `codex login` against their ChatGPT account. */
export async function detectCodexCli(): Promise<string> {
  return invoke<string>("detect_codex_cli");
}

/** Switch the active Codex auth mode to CLI delegation. Verifies the
 *  CLI is on PATH and writes `codex_auth_method=codex_cli`. */
export async function enableCodexCliDelegation(): Promise<string> {
  return invoke<string>("enable_codex_cli_delegation");
}

/** Re-detect the stored Codex CLI or re-test the stored API key,
 *  depending on the active `codex_auth_method`. */
export async function testCodexStored(): Promise<string> {
  return invoke<string>("test_codex_stored");
}

/** Validate an OpenAI API key (must start with `sk-`). Saves it,
 *  switches `codex_auth_method=api_key`, and probes /v1/models. */
export async function validateOpenAiApiKey(apiKey: string): Promise<string> {
  return invoke<string>("validate_openai_api_key", { apiKey });
}

/** Send a real "Say hello." message via the active Codex auth path
 *  (API key or CLI) and return the model's reply. */
export async function pingCodex(): Promise<string> {
  return invoke<string>("ping_codex");
}
