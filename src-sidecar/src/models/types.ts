// Shared chat-model types — the small interface every adapter implements
// after the LangChain removal. Plain TypeScript records replace LangChain's
// BaseMessage / AIMessageChunk / BaseChatModel surface.

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Token-usage totals for a single model call. `cacheCreation` and
 *  `cacheRead` are Anthropic prompt-cache fields; non-Anthropic providers
 *  report zero. */
export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreation?: number;
  cacheRead?: number;
}

/** One frame of a streaming chat response. `text` carries the per-chunk
 *  delta the UI types into view; `usage` lands on the terminal chunk only
 *  (so consumers can accumulate without polling). Adapters always emit a
 *  final empty-text chunk with `usage` populated, even when usage is zero. */
export interface ChatStreamChunk {
  text?: string;
  usage?: ChatUsage;
}

export interface ChatModelStreamOptions {
  signal?: AbortSignal;
}

/** The single method every model adapter implements after the LangChain
 *  removal. `stream` is the only entrypoint — non-streaming callers
 *  accumulate frames themselves. */
export interface ChatModel {
  stream(
    messages: ChatMessage[],
    options?: ChatModelStreamOptions,
  ): AsyncIterable<ChatStreamChunk>;
}
