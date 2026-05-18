import type { ChatModel } from "./types.js";
import type { ModelSelection } from "../protocol.js";
import { AnthropicDirectChatModel } from "./anthropic-direct.js";
import { GoogleDirectChatModel } from "./google-direct.js";
import { OllamaDirectChatModel } from "./ollama-direct.js";
import { ClaudeCodeChatModel } from "./anthropic-via-claude-code.js";
import { GeminiCliChatModel } from "./gemini-via-cli.js";
import { CopilotCliChatModel } from "./copilot-via-cli.js";
import { CodexCliChatModel } from "./codex-via-cli.js";
import { wrapWithAiCapture } from "../ai-capture.js";

/** Optional, per-call passthroughs that don't belong on ModelSelection
 *  (which is a Rust-owned credential envelope). Workflow nodes use this
 *  to opt into provider-specific features like Anthropic extended
 *  thinking — the factory routes it to the providers that support it
 *  and silently ignores it for the rest. */
export interface BuildModelOptions {
  /** Enable Anthropic extended thinking (or its closest equivalent on
   *  other providers). `budgetTokens` caps the model's deliberation
   *  per turn; smaller values mean less output overhead per iteration
   *  in tool loops. */
  thinking?: { budgetTokens: number };
  /** Working directory for CLI-delegation adapters (Claude Code,
   *  Gemini CLI, Copilot CLI). When set, the CLI binary spawns with
   *  cwd=worktreePath so its built-in filesystem tools operate against
   *  the user's repo. API-key adapters (AnthropicDirect, GoogleDirect,
   *  OllamaDirect) silently ignore it — they have no local execution
   *  surface. */
  worktreePath?: string;
}

export function buildModel(
  selection: ModelSelection,
  options: BuildModelOptions = {},
): ChatModel {
  const inner = buildModelInner(selection, options);
  // Wrap with AI-traffic capture when the active workflow run requested
  // debug capture. Without capture this is a no-op pass-through.
  return wrapWithAiCapture(inner, selection.credentials.provider, selection.model);
}

function buildModelInner(
  selection: ModelSelection,
  options: BuildModelOptions,
): ChatModel {
  const { model, credentials, maxTokens } = selection;

  // Anthropic extended thinking config — only meaningful when the caller
  // opted in. The constant 1024 is Anthropic's minimum acceptable budget
  // (anything lower is rejected at the API), so a too-small caller value
  // gets floored rather than producing a 400.
  const anthropicThinking = options.thinking
    ? {
        type: "enabled" as const,
        budget_tokens: Math.max(1024, options.thinking.budgetTokens),
      }
    : undefined;

  switch (credentials.provider) {
    case "anthropic": {
      if (credentials.mode === "claude_code") {
        return new ClaudeCodeChatModel({
          model,
          maxTokens,
          cwd: options.worktreePath,
        });
      }
      return new AnthropicDirectChatModel({
        apiKey: credentials.apiKey,
        model,
        maxTokens,
        thinking: anthropicThinking,
        ...(anthropicThinking ? { temperature: 1 } : {}),
      });
    }
    case "google": {
      if (credentials.mode === "gemini_cli") {
        return new GeminiCliChatModel({
          model,
          maxTokens,
          cwd: options.worktreePath,
        });
      }
      return new GoogleDirectChatModel({
        apiKey: credentials.apiKey,
        model,
        maxTokens,
        thinking: options.thinking,
      });
    }
    case "copilot": {
      return new CopilotCliChatModel({
        model,
        maxTokens,
        cwd: options.worktreePath,
      });
    }
    case "codex": {
      return new CodexCliChatModel({
        model,
        maxTokens,
        cwd: options.worktreePath,
      });
    }
    case "ollama": {
      // The stored `local_llm_url` is normalised to end with `/v1` for the
      // OpenAI-compatible model-list and embeddings endpoints. The native
      // chat endpoint lives at `/api/chat` on the bare base URL, so we
      // strip a trailing `/v1` here — otherwise requests land at
      // `…/v1/api/chat` and 404.
      const ollamaBaseUrl = credentials.baseUrl.replace(/\/v1\/?$/, "");
      return new OllamaDirectChatModel({
        baseUrl: ollamaBaseUrl,
        model,
        ...(options.thinking != null ? { think: true } : {}),
      });
    }
    default: {
      const _exhaustive: never = credentials;
      throw new Error(`Unknown provider: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
