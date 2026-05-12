// Adapter that talks to a local Ollama server directly over its native
// HTTP API. Plain class (no LangChain inheritance); exposes the shared
// `ChatModel` interface from `./types.ts`.
//
// Ollama's chat endpoint:
//   POST {baseUrl}/api/chat
//   Body: { model, messages: [{role, content}], stream: true, think? }
//   Response: newline-delimited JSON, one object per chunk. Each chunk has:
//     { message: { role, content }, done: boolean,
//       prompt_eval_count?, eval_count?, total_duration?, ... }
//   The final chunk (done=true) carries the prompt/output token counts.

import type {
  ChatMessage,
  ChatModel,
  ChatModelStreamOptions,
  ChatStreamChunk,
} from "./types.js";

export interface OllamaDirectChatModelInput {
  baseUrl: string;
  model: string;
  think?: boolean;
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

export class OllamaDirectChatModel implements ChatModel {
  private baseUrl: string;
  private model: string;
  private think?: boolean;

  constructor(input: OllamaDirectChatModelInput) {
    this.baseUrl = input.baseUrl.replace(/\/+$/, "");
    this.model = input.model;
    this.think = input.think;
  }

  async *stream(
    messages: ChatMessage[],
    options?: ChatModelStreamOptions,
  ): AsyncIterable<ChatStreamChunk> {
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
      ...(options?.signal ? { signal: options.signal } : {}),
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
        yield { text };
      }
      if (event.done) {
        inputTokens = event.prompt_eval_count ?? 0;
        outputTokens = event.eval_count ?? 0;
      }
    }

    yield { usage: { inputTokens, outputTokens } };
  }
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
            // Skip malformed lines.
          }
        }
        nl = buffer.indexOf("\n");
      }
    }
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

/** Convert a `ChatMessage[]` into Ollama's chat message format. Ollama
 *  accepts a 'tool' role natively. */
export function formatMessages(messages: ChatMessage[]): OllamaChatMessage[] {
  const out: OllamaChatMessage[] = [];
  for (const msg of messages) {
    if (!msg.content) continue;
    out.push({ role: msg.role, content: msg.content });
  }
  return out;
}

// Exported for tests.
export { formatMessages as _formatMessages };
