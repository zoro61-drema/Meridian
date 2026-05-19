// Adapter that talks to the OpenAI API directly via the official
// `openai` Node SDK. Used by sidecar workflows when the user picks
// Codex (ChatGPT) and has configured the API-key auth path in
// Settings → Codex. CLI delegation users go through
// `CodexCliChatModel` (codex-via-cli.ts) instead.
//
// Per-call lifecycle:
//   1. Convert `ChatMessage[]` → OpenAI `ChatCompletionMessageParam[]`.
//      System messages stay as system role; user/assistant/tool turns
//      map directly; the SDK accepts a 'tool' role for replayed
//      history.
//   2. Call `client.chat.completions.create({ stream: true })` and
//      iterate the AsyncIterable<ChatCompletionChunk>.
//   3. Forward `choices[0].delta.content` events as `{text}` chunks.
//   4. Read `usage` from the final chunk (OpenAI emits it on the
//      terminal frame when `stream_options.include_usage: true`).
//      Emit a trailing `{ usage }` chunk so consumers pick up totals.

import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";

import type {
  ChatMessage,
  ChatModel,
  ChatModelStreamOptions,
  ChatStreamChunk,
  ChatUsage,
} from "./types.js";

export interface OpenAIDirectChatModelInput {
  apiKey: string;
  model: string;
  /** Per-call response-token cap. Forwarded to `max_tokens`. OpenAI
   *  also exposes `max_completion_tokens` for reasoning models, but
   *  `max_tokens` is universally accepted. */
  maxTokens?: number;
}

export class OpenAIDirectChatModel implements ChatModel {
  private model: string;
  private maxTokens?: number;
  private client: OpenAI;

  constructor(input: OpenAIDirectChatModelInput) {
    this.model = input.model;
    this.maxTokens = input.maxTokens;
    this.client = new OpenAI({ apiKey: input.apiKey });
  }

  async *stream(
    messages: ChatMessage[],
    _options?: ChatModelStreamOptions,
  ): AsyncIterable<ChatStreamChunk> {
    const body = formatMessages(messages);
    if (body.length === 0) {
      throw new Error(
        "OpenAIDirectChatModel: empty message body — at least one message is required.",
      );
    }

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: body,
      stream: true,
      // Force OpenAI to emit a final usage chunk so we don't have to
      // round-trip a separate count request after the stream ends.
      stream_options: { include_usage: true },
      ...(this.maxTokens ? { max_tokens: this.maxTokens } : {}),
    });

    let inputTokens = 0;
    let outputTokens = 0;
    let cachedInput = 0;

    for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        yield { text: delta.content };
      }
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
        outputTokens = chunk.usage.completion_tokens ?? outputTokens;
        // Reasoning models surface a cache hit separately. Older SDK
        // type defs may not list it; read defensively.
        const promptDetails = chunk.usage.prompt_tokens_details as
          | { cached_tokens?: number }
          | undefined;
        cachedInput = promptDetails?.cached_tokens ?? cachedInput;
      }
    }

    const usage: ChatUsage = {
      inputTokens,
      outputTokens,
      cacheRead: cachedInput,
    };
    yield { usage };
  }
}

/** Convert a `ChatMessage[]` into OpenAI's `ChatCompletionMessageParam[]`.
 *  System messages map 1:1 to `role: "system"`. Tool messages render as
 *  a `role: "tool"` entry — the SDK requires a `tool_call_id`, but since
 *  we're replaying history (not the response to a real tool call we
 *  made this turn) we synthesise a stable placeholder so the API
 *  doesn't reject the payload. */
export function formatMessages(
  messages: ChatMessage[],
): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  let toolReplayIdx = 0;
  for (const msg of messages) {
    const text = msg.content;
    if (msg.role === "system") {
      if (text) out.push({ role: "system", content: text });
    } else if (msg.role === "user") {
      out.push({ role: "user", content: text });
    } else if (msg.role === "assistant") {
      out.push({ role: "assistant", content: text });
    } else if (msg.role === "tool") {
      // OpenAI requires a `tool_call_id`. For replayed tool results
      // we synthesise one — the API doesn't try to match it against
      // a real prior tool call in the same turn.
      out.push({
        role: "tool",
        content: text,
        tool_call_id: `replay_${toolReplayIdx++}`,
      });
    }
  }
  return out;
}

// Exported for tests.
export { formatMessages as _formatMessages };
