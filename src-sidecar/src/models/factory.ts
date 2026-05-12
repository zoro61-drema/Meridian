import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { ModelSelection } from "../protocol.js";
import { ClaudeCodeChatModel } from "./anthropic-via-claude-code.js";
import { GeminiCliChatModel } from "./gemini-via-cli.js";
import { CopilotCliChatModel } from "./copilot-via-cli.js";
import { AiTrafficHandler, getAiCaptureCtx } from "../ai-capture.js";

/** Optional, per-call passthroughs that don't belong on ModelSelection
 *  (which is a Rust-owned credential envelope). Workflow nodes use this
 *  to opt into provider-specific features like Anthropic extended
 *  thinking — the factory routes it to the providers that support it
 *  and silently ignores it for the rest. */
export interface BuildModelOptions {
  /** Enable Anthropic extended thinking (or its closest equivalent on
   *  other providers). `budgetTokens` caps the model's deliberation
   *  per turn; smaller values mean less output overhead per iteration
   *  in tool loops. The Build phase uses this to replace unbounded
   *  per-turn reasoning prose with bounded thinking blocks. */
  thinking?: { budgetTokens: number };
}

export function buildModel(
  selection: ModelSelection,
  options: BuildModelOptions = {},
): BaseChatModel {
  const { model, credentials } = selection;
  const built = buildModelInner(selection, options);

  // Attach the AI-traffic capture handler when the active workflow run
  // requested debug capture. AsyncLocalStorage propagates the scope
  // across all the async machinery between here and the model call,
  // so this single hook covers every workflow without each runner
  // having to wire it manually.
  const ctx = getAiCaptureCtx();
  if (ctx?.captureEnabled) {
    const existing = built.callbacks ?? [];
    const handlers = Array.isArray(existing) ? existing : [];
    built.callbacks = [...handlers, new AiTrafficHandler(ctx, credentials.provider, model)];
  }

  return built;
}

function buildModelInner(
  selection: ModelSelection,
  options: BuildModelOptions,
): BaseChatModel {
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

  // When thinking is enabled, Anthropic's API requires `temperature: 1`
  // and rejects any other value (including the LangChain default). Pin
  // it explicitly so callers don't see a 400 the moment they opt into
  // thinking. No effect on non-thinking calls; when omitted, the SDK
  // applies its own default.
  const anthropicThinkingExtras = anthropicThinking
    ? { temperature: 1 }
    : {};

  switch (credentials.provider) {
    case "anthropic": {
      if (credentials.mode === "claude_code") {
        // Delegate to the user's locally-installed Claude Code CLI.
        // The CLI owns its own auth (Pro/Max OAuth or API key) so the
        // sidecar never sees credentials. Extended thinking + maxTokens
        // are not exposed by `claude -p`, so they pass through silently —
        // the CLI uses its own defaults.
        return new ClaudeCodeChatModel({
          model,
          maxTokens,
        });
      }
      // ChatAnthropic's own default is conservative (~4K) and caused
      // truncation on long synthesis stages. When the user hasn't set
      // an explicit preference yet, pass nothing and let the SDK pick
      // its default; once they have, use their number.
      return new ChatAnthropic({
        apiKey: credentials.apiKey,
        model,
        ...(maxTokens != null ? { maxTokens } : {}),
        ...(anthropicThinking != null ? { thinking: anthropicThinking } : {}),
        ...anthropicThinkingExtras,
      });
    }
    case "google": {
      if (credentials.mode === "gemini_cli") {
        // Delegate to the user's locally-installed `@google/gemini-cli`.
        // The CLI owns its own auth (personal Google OAuth → free
        // Gemini Code Assist tier, or GEMINI_API_KEY, or Vertex
        // service-account) so the sidecar never sees credentials.
        // Thinking + maxTokens pass through silently — the CLI uses
        // its own defaults and has no flag for either.
        return new GeminiCliChatModel({
          model,
          maxTokens,
        });
      }
      // Best-effort Gemini API-key path: 2.5 Flash/Pro accept a
      // thinking config via the SDK's `thinkingConfig`. Older models
      // ignore it. Passed as `modelKwargs` so an SDK that doesn't
      // recognise the key just drops it.
      const geminiThinkingConfig = options.thinking
        ? {
            thinkingConfig: {
              thinkingBudget: options.thinking.budgetTokens,
              includeThoughts: true,
            },
          }
        : undefined;
      return new ChatGoogleGenerativeAI({
        apiKey: credentials.apiKey,
        model,
        ...(maxTokens != null ? { maxOutputTokens: maxTokens } : {}),
        ...(geminiThinkingConfig != null
          ? { modelKwargs: geminiThinkingConfig }
          : {}),
      });
    }
    case "copilot": {
      // Delegate to the user's locally-installed GitHub Copilot CLI.
      // The CLI owns its own auth (`copilot login` → device flow against
      // the user's GitHub account, or COPILOT_GITHUB_TOKEN) so the
      // sidecar never sees credentials. Thinking + maxTokens pass
      // through silently — the CLI has no flag for either and uses
      // its own defaults.
      return new CopilotCliChatModel({
        model,
        maxTokens,
      });
    }
    case "ollama": {
      // Ollama caps at the loaded model's native context window. We
      // intentionally don't forward maxTokens here — the local server
      // is the source of truth, and overriding it produces confusing
      // mid-response truncation when a user picks a model with less
      // headroom than the global pref.
      //
      // Thinking support: Ollama's recent versions accept `think: true`
      // for models that have a thinking mode (Qwen3, DeepSeek-R1, etc.)
      // The flag is silently ignored by models that don't support it,
      // so it's safe to pass through whenever the caller requested
      // thinking. Returned thinking lands in a `thinking` field on the
      // response that @langchain/ollama maps to an AIMessage content
      // block on recent versions (older versions emit `<think>` tags
      // inside the text content; we treat both shapes in the loop's
      // extractor).
      // The stored `local_llm_url` is normalised to end with `/v1` for the
      // OpenAI-compatible model-list and embeddings endpoints. ChatOllama
      // talks to Ollama's native `/api/chat` and appends that path itself,
      // so we strip a trailing `/v1` here — otherwise requests land at
      // `…/v1/api/chat` and 404.
      const ollamaBaseUrl = credentials.baseUrl.replace(/\/v1\/?$/, "");
      return new ChatOllama({
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
