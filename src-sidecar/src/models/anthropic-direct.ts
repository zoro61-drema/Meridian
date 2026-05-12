// Adapter that talks to the Anthropic API directly via the official
// `@anthropic-ai/sdk` client. Plain class (no LangChain inheritance);
// exposes the shared `ChatModel` interface from `./types.ts`.
//
// Per-call lifecycle:
//   1. Convert `ChatMessage[]` → Anthropic `MessageParam[]`. System
//      messages collapse into the top-level `system` field; user/
//      assistant/tool turns become MessageParam records.
//   2. Call `client.messages.stream(...)` and iterate the
//      `RawMessageStreamEvent` AsyncIterable.
//   3. Forward `text_delta` events as `{text}` chunks. Track usage
//      incrementally — `message_start.message.usage.input_tokens`
//      (plus cache_creation/read) up front, then accumulate
//      `message_delta.usage.output_tokens` until the stream ends.
//   4. Emit a final empty-text chunk carrying `usage` so consumers
//      pick up the totals off the terminal frame.

import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatMessage,
  ChatModel,
  ChatModelStreamOptions,
  ChatStreamChunk,
  ChatUsage,
} from "./types.js";

export interface AnthropicDirectChatModelInput {
  apiKey: string;
  model: string;
  maxTokens?: number;
  thinking?: { type: "enabled"; budget_tokens: number };
  /** Extended-thinking forces `temperature: 1` server-side; non-thinking
   *  calls just leave it unset and the API uses its default. */
  temperature?: number;
}

interface MessageStartEventUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export class AnthropicDirectChatModel implements ChatModel {
  private apiKey: string;
  private model: string;
  private maxTokens?: number;
  private thinking?: { type: "enabled"; budget_tokens: number };
  private temperature?: number;
  private client: Anthropic;

  constructor(input: AnthropicDirectChatModelInput) {
    this.apiKey = input.apiKey;
    this.model = input.model;
    this.maxTokens = input.maxTokens;
    this.thinking = input.thinking;
    this.temperature = input.temperature;
    this.client = new Anthropic({ apiKey: this.apiKey });
  }

  async *stream(
    messages: ChatMessage[],
    _options?: ChatModelStreamOptions,
  ): AsyncIterable<ChatStreamChunk> {
    const { system, body } = formatMessages(messages);
    if (body.length === 0) {
      throw new Error(
        "AnthropicDirectChatModel: empty message body — at least one non-system message is required.",
      );
    }

    // `max_tokens` is required by the API. The original LangChain adapter
    // let the SDK pick its default by omitting the field — preserve that
    // by passing a generous floor (8192) only when the caller didn't.
    const params = {
      model: this.model,
      max_tokens: this.maxTokens ?? 8192,
      messages: body,
      ...(system ? { system } : {}),
      ...(this.thinking ? { thinking: this.thinking } : {}),
      ...(this.temperature != null ? { temperature: this.temperature } : {}),
    } as Anthropic.MessageStreamParams;

    const stream = this.client.messages.stream(params);

    let inputTokens = 0;
    let outputTokens = 0;
    let cacheCreation = 0;
    let cacheRead = 0;

    for await (const event of stream) {
      if (event.type === "message_start") {
        // `usage` on the start event carries the prompt-side totals
        // (including cache_*). Older SDK type defs don't list the cache
        // fields on Usage, but the wire payload includes them — read
        // them defensively.
        const u = event.message.usage as MessageStartEventUsage | undefined;
        inputTokens = u?.input_tokens ?? 0;
        outputTokens = u?.output_tokens ?? 0;
        cacheCreation = u?.cache_creation_input_tokens ?? 0;
        cacheRead = u?.cache_read_input_tokens ?? 0;
      } else if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta.type === "text_delta") {
          yield { text: delta.text };
        }
      } else if (event.type === "message_delta") {
        outputTokens = event.usage.output_tokens ?? outputTokens;
      }
    }

    const usage: ChatUsage = {
      inputTokens: inputTokens + cacheCreation + cacheRead,
      outputTokens,
      cacheCreation,
      cacheRead,
    };
    yield { usage };
  }
}

/** Convert a `ChatMessage[]` into Anthropic's `{system, messages}` shape.
 *  System messages collapse into the top-level `system` string; tool
 *  messages render as user-role text (Anthropic's API has no 'tool' role
 *  for replayed history). */
export function formatMessages(messages: ChatMessage[]): {
  system: string;
  body: Anthropic.MessageParam[];
} {
  const systemParts: string[] = [];
  const body: Anthropic.MessageParam[] = [];
  for (const msg of messages) {
    const text = msg.content;
    if (msg.role === "system") {
      if (text) systemParts.push(text);
      continue;
    }
    if (msg.role === "user") {
      body.push({ role: "user", content: text });
    } else if (msg.role === "assistant") {
      body.push({ role: "assistant", content: text });
    } else if (msg.role === "tool") {
      body.push({ role: "user", content: `Tool result:\n${text}` });
    }
  }
  return { system: systemParts.join("\n\n"), body };
}

// Exported for tests.
export { formatMessages as _formatMessages };
