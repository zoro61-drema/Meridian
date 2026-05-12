// LangChain BaseChatModel that talks to the Anthropic API directly via
// the official `@anthropic-ai/sdk` client. Replaces `@langchain/anthropic`
// (Phase 1 of the LangChain removal) — the adapter shape mirrors the
// CLI-delegation adapters so workflow callers don't change.
//
// Per-call lifecycle:
//   1. Convert LangChain messages → Anthropic `MessageParam[]`. System
//      messages collapse into the top-level `system` field; user/
//      assistant/tool turns become `MessageParam` records.
//   2. Call `client.messages.stream({ model, max_tokens, system,
//      messages, thinking? })` and iterate the `RawMessageStreamEvent`
//      AsyncIterable.
//   3. Forward `text_delta` content as ChatGenerationChunks. Track
//      usage incrementally — `message_start.message.usage.input_tokens`
//      plus cache_creation/read fields up front, then accumulate
//      `message_delta.usage.output_tokens` until the stream ends.
//   4. Emit a final empty chunk carrying `usage_metadata` so streaming
//      consumers (streamLLMText / streamLLMJson) pick it up off the
//      terminal chunk.

import {
  AIMessage,
  AIMessageChunk,
  type BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  BaseChatModel,
  type BaseChatModelParams,
} from "@langchain/core/language_models/chat_models";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { ChatGenerationChunk, type ChatResult } from "@langchain/core/outputs";
import Anthropic from "@anthropic-ai/sdk";

export interface AnthropicDirectChatModelInput extends BaseChatModelParams {
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

interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_token_details: { cache_creation: number; cache_read: number };
}

export class AnthropicDirectChatModel extends BaseChatModel {
  private apiKey: string;
  private model: string;
  private maxTokens?: number;
  private thinking?: { type: "enabled"; budget_tokens: number };
  private temperature?: number;
  private client: Anthropic;

  constructor(input: AnthropicDirectChatModelInput) {
    super(input);
    this.apiKey = input.apiKey;
    this.model = input.model;
    this.maxTokens = input.maxTokens;
    this.thinking = input.thinking;
    this.temperature = input.temperature;
    this.client = new Anthropic({ apiKey: this.apiKey });
  }

  _llmType(): string {
    return "anthropic-direct";
  }

  async _generate(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    let text = "";
    let usage = emptyUsage();
    for await (const chunk of this.runStream(messages)) {
      if (chunk.kind === "delta") {
        text += chunk.text;
        await runManager?.handleLLMNewToken(chunk.text);
      } else {
        usage = chunk.usage;
      }
    }
    return {
      generations: [
        {
          text,
          message: new AIMessage({
            content: text,
            usage_metadata: usage,
          }),
        },
      ],
      llmOutput: { tokenUsage: usage },
    };
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    let usage = emptyUsage();
    for await (const chunk of this.runStream(messages)) {
      if (chunk.kind === "delta") {
        await runManager?.handleLLMNewToken(chunk.text);
        yield new ChatGenerationChunk({
          text: chunk.text,
          message: new AIMessageChunk({ content: chunk.text }),
        });
      } else {
        usage = chunk.usage;
      }
    }
    yield new ChatGenerationChunk({
      text: "",
      message: new AIMessageChunk({
        content: "",
        usage_metadata: usage,
      }),
    });
  }

  private async *runStream(
    messages: BaseMessage[],
  ): AsyncGenerator<
    { kind: "delta"; text: string } | { kind: "usage"; usage: UsageTotals }
  > {
    const { system, body } = formatMessages(messages);
    if (body.length === 0) {
      throw new Error(
        "AnthropicDirectChatModel: empty message body — at least one non-system message is required.",
      );
    }

    // `max_tokens` is required by the API; the original adapter let the
    // SDK pick its default by omitting the field. Replicate that by
    // passing a generous floor (8192) only when the caller didn't.
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
        // `usage` on the start event carries the prompt-side totals (including
        // cache_*). Older SDK type defs don't list the cache fields on
        // Usage, but the wire payload includes them — read them defensively.
        const u = event.message.usage as MessageStartEventUsage | undefined;
        inputTokens = u?.input_tokens ?? 0;
        outputTokens = u?.output_tokens ?? 0;
        cacheCreation = u?.cache_creation_input_tokens ?? 0;
        cacheRead = u?.cache_read_input_tokens ?? 0;
      } else if (event.type === "content_block_delta") {
        const delta = event.delta;
        if (delta.type === "text_delta") {
          yield { kind: "delta", text: delta.text };
        }
      } else if (event.type === "message_delta") {
        outputTokens = event.usage.output_tokens ?? outputTokens;
      }
    }

    const totalInput = inputTokens + cacheCreation + cacheRead;
    yield {
      kind: "usage",
      usage: {
        input_tokens: totalInput,
        output_tokens: outputTokens,
        total_tokens: totalInput + outputTokens,
        input_token_details: {
          cache_creation: cacheCreation,
          cache_read: cacheRead,
        },
      },
    };
  }
}

function emptyUsage(): UsageTotals {
  return {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    input_token_details: { cache_creation: 0, cache_read: 0 },
  };
}

/** Convert a LangChain message list into Anthropic's
 *  `{system, messages: MessageParam[]}` shape. System messages collapse
 *  into the top-level `system` string; tool messages map to
 *  `tool_result` content blocks attached to a user-role turn. */
export function formatMessages(messages: BaseMessage[]): {
  system: string;
  body: Anthropic.MessageParam[];
} {
  const systemParts: string[] = [];
  const body: Anthropic.MessageParam[] = [];
  for (const msg of messages) {
    const text = messageText(msg);
    if (msg instanceof SystemMessage) {
      if (text) systemParts.push(text);
      continue;
    }
    if (msg instanceof HumanMessage) {
      body.push({ role: "user", content: text });
    } else if (msg instanceof AIMessage) {
      body.push({ role: "assistant", content: text });
    } else if (msg instanceof ToolMessage) {
      // No tool-calling roundtrips happen via this adapter (chat
      // workflows that need tools route through Ollama), but if a
      // history dump replays a ToolMessage, render it as a user turn
      // so the API doesn't reject the role.
      body.push({
        role: "user",
        content: `Tool result:\n${text}`,
      });
    }
  }
  return {
    system: systemParts.join("\n\n"),
    body,
  };
}

function messageText(msg: BaseMessage): string {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((c) => {
        if (typeof c === "string") return c;
        if (typeof c === "object" && c !== null) {
          const co = c as { type?: string; text?: string };
          if (co.type === "text" && typeof co.text === "string") return co.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

// Exported for tests.
export { formatMessages as _formatMessages };
