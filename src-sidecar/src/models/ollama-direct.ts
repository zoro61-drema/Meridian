// LangChain BaseChatModel that talks to a local Ollama server directly
// over its native HTTP API. Replaces `@langchain/ollama` (Phase 1 of the
// LangChain removal) — the adapter shape mirrors the CLI-delegation
// adapters so workflow callers don't change.
//
// Ollama's chat endpoint:
//   POST {baseUrl}/api/chat
//   Body: { model, messages: [{role, content}], stream: true, think? }
//   Response: newline-delimited JSON, one object per chunk. Each chunk has:
//     { message: { role, content }, done: boolean,
//       prompt_eval_count?, eval_count?, total_duration?, ... }
//   The final chunk (done=true) carries the prompt/output token counts.
//
// `think: true` is forwarded for models that have a thinking mode
// (Qwen3, DeepSeek-R1, …). Older Ollama versions and non-thinking
// models ignore the flag. When thinking is on, recent Ollama versions
// return reasoning under a separate `message.thinking` field; we don't
// surface it as text — only the final answer's `content` is streamed.

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

export interface OllamaDirectChatModelInput extends BaseChatModelParams {
  baseUrl: string;
  model: string;
  think?: boolean;
}

interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_token_details: { cache_creation: number; cache_read: number };
}

interface OllamaChunk {
  message?: { role?: string; content?: string; thinking?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

interface OllamaChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export class OllamaDirectChatModel extends BaseChatModel {
  private baseUrl: string;
  private model: string;
  private think?: boolean;

  constructor(input: OllamaDirectChatModelInput) {
    super(input);
    // Normalise: strip trailing slash so we can join `/api/chat` cleanly.
    this.baseUrl = input.baseUrl.replace(/\/+$/, "");
    this.model = input.model;
    this.think = input.think;
  }

  _llmType(): string {
    return "ollama-direct";
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
    const body = {
      model: this.model,
      messages: formatMessages(messages),
      stream: true,
      ...(this.think ? { think: true } : {}),
    };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Ollama /api/chat returned ${response.status}${text ? `: ${text}` : ""}`,
      );
    }

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of readNdjson(response.body)) {
      if (event.error) {
        throw new Error(`Ollama returned an error: ${event.error}`);
      }
      const text = event.message?.content;
      if (typeof text === "string" && text.length > 0) {
        yield { kind: "delta", text };
      }
      if (event.done) {
        inputTokens = event.prompt_eval_count ?? 0;
        outputTokens = event.eval_count ?? 0;
      }
    }

    yield {
      kind: "usage",
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        input_token_details: { cache_creation: 0, cache_read: 0 },
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

/** Parse a fetch response body's ReadableStream as newline-delimited JSON. */
export async function* readNdjson(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<OllamaChunk> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) {
          try {
            yield JSON.parse(line) as OllamaChunk;
          } catch {
            // Skip malformed lines (e.g. partial frames on early
            // disconnects); the next valid frame will still parse.
          }
        }
        nl = buffer.indexOf("\n");
      }
    }
    // Flush any trailing data without a terminating newline.
    const tail = buffer.trim();
    if (tail) {
      try {
        yield JSON.parse(tail) as OllamaChunk;
      } catch {
        // Drop unrecoverable trailing fragment.
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Convert a LangChain message list into Ollama's chat message format.
 *  Roles map 1:1 except ToolMessage → 'tool'. Ollama accepts a 'tool'
 *  role; older models without tool support will just see it as a system-
 *  ish hint, which is fine for the no-tools chat path. */
export function formatMessages(messages: BaseMessage[]): OllamaChatMessage[] {
  const out: OllamaChatMessage[] = [];
  for (const msg of messages) {
    const text = messageText(msg);
    if (!text) continue;
    if (msg instanceof SystemMessage) {
      out.push({ role: "system", content: text });
    } else if (msg instanceof HumanMessage) {
      out.push({ role: "user", content: text });
    } else if (msg instanceof AIMessage) {
      out.push({ role: "assistant", content: text });
    } else if (msg instanceof ToolMessage) {
      out.push({ role: "tool", content: text });
    }
  }
  return out;
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
