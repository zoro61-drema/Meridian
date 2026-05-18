// IPC protocol between the Rust backend and the TypeScript sidecar.
//
// All messages are newline-delimited JSON over the sidecar process's
// stdin/stdout. Each inbound message has a string `id` that the sidecar
// echoes back on every related outbound event so Rust can correlate
// concurrent workflow runs.

// ── Provider identity (passed per-request; sidecar never caches) ──────────────

export type Provider = "anthropic" | "google" | "ollama" | "copilot";

export type ProviderCredentials =
  | { provider: "anthropic"; mode: "api_key"; apiKey: string }
  | { provider: "anthropic"; mode: "claude_code" }
  | { provider: "google"; mode: "api_key"; apiKey: string }
  | { provider: "google"; mode: "gemini_cli" }
  | { provider: "ollama"; baseUrl: string }
  | { provider: "copilot"; mode: "copilot_cli" }
  | { provider: "codex"; mode: "codex_cli" };

export type ModelSelection = {
  provider: Provider;
  model: string;
  credentials: ProviderCredentials;
  /** Per-provider response-token ceiling. The Rust backend reads the
   *  active value from preferences (Settings → Models → "Max output
   *  tokens"). When undefined, model adapters fall back to their own
   *  built-in defaults. */
  maxTokens?: number;
};

// ── Inbound messages (Rust → sidecar) ─────────────────────────────────────────

export type WorkflowStart = {
  id: string;
  type: "workflow.start";
  workflow: string; // e.g. "grooming", "pr_review", "sprint_retrospective"
  input: unknown;   // workflow-specific payload, validated by the workflow's Zod schema
  model: ModelSelection;
  worktreePath?: string;
  /** When true, the sidecar attaches an AI-traffic callback to every
   *  model built during this run and emits an `ai_traffic` event for
   *  each round-trip. Off by default — capture is opt-in via a
   *  developer toggle in Settings so prompt JSON doesn't ride the IPC
   *  channel for runs nobody is debugging. */
  debug?: boolean;
};

export type WorkflowCancel = {
  id: string;
  type: "workflow.cancel";
};

export type InboundMessage = WorkflowStart | WorkflowCancel;

// ── Outbound events (sidecar → Rust) ──────────────────────────────────────────

export type ProgressEvent = {
  id: string;
  type: "progress";
  node: string;
  status: "started" | "completed";
  data?: unknown;
};

export type StreamEvent = {
  id: string;
  type: "stream";
  node: string;
  delta: string;
};

export type ResultEvent = {
  id: string;
  type: "result";
  output: unknown;
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Anthropic prompt-caching breakdown (subset of `inputTokens`).
     *  Tokens billed at 1.25x because the request wrote them into the
     *  prompt cache. Optional — workflows that don't opt into caching
     *  leave this undefined. Other providers ignore the cache_control
     *  marker, so it stays 0/undefined for them. */
    cacheCreationInputTokens?: number;
    /** Anthropic prompt-caching breakdown (subset of `inputTokens`).
     *  Tokens billed at 0.1x because they came from a cache hit on the
     *  request's stable prefix. */
    cacheReadInputTokens?: number;
  };
};

export type ErrorEvent = {
  id: string;
  type: "error";
  message: string;
  cause?: string;
};

/** Snapshot of a single LLM round-trip — request prompt, response text,
 *  per-call usage, latency. Emitted only when AI debug capture is on
 *  (a developer toggle in Settings) so production runs don't pay the
 *  cost of serialising prompts they'll never look at. Forwarded to the
 *  frontend's debug panel for inspection. */
export type AiTrafficEvent = {
  id: string;
  type: "ai_traffic";
  /** Wall-clock milliseconds when the request started. */
  startedAt: number;
  /** Total round-trip latency in ms. */
  latencyMs: number;
  /** Provider + model the request actually hit. Carries the same
   *  shape the workflow received so a debug viewer can show which
   *  model produced each turn. Credentials are scrubbed before this
   *  event leaves the sidecar. */
  provider: string;
  model: string;
  /** Workflow / node identifier — surface in the panel so the user
   *  can see which agent issued the call. */
  workflow: string;
  node?: string;
  /** Serialised messages array sent to the model. Each entry is
   *  `{ role, content }` where content may be string or array of
   *  content blocks. The handler stringifies content blocks so the
   *  frontend doesn't need provider-specific knowledge to render. */
  messages: Array<{ role: string; content: string }>;
  /** Final reply text. May be empty for tool-only turns. */
  response: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  /** Optional error message if the call failed. */
  error?: string;
};

export type OutboundEvent =
  | ProgressEvent
  | StreamEvent
  | ResultEvent
  | ErrorEvent
  | AiTrafficEvent;
