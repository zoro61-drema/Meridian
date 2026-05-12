// Adapter that talks to the Google Generative AI API directly via the
// official `@google/generative-ai` SDK. Plain class (no LangChain
// inheritance); exposes the shared `ChatModel` interface from
// `./types.ts`.

import {
  GoogleGenerativeAI,
  type Content,
  type GenerationConfig,
  type GenerativeModel,
} from "@google/generative-ai";
import type {
  ChatMessage,
  ChatModel,
  ChatModelStreamOptions,
  ChatStreamChunk,
  ChatUsage,
} from "./types.js";

export interface GoogleDirectChatModelInput {
  apiKey: string;
  model: string;
  maxTokens?: number;
  /** Per-call thinking budget. Maps to Gemini's
   *  `thinkingConfig.thinkingBudget`. 2.5 Flash/Pro accept this; older
   *  models ignore it. The SDK at v0.24 doesn't type the field, so it's
   *  passed through inline via a widened GenerationConfig. */
  thinking?: { budgetTokens: number };
}

export class GoogleDirectChatModel implements ChatModel {
  private model: string;
  private maxTokens?: number;
  private thinking?: { budgetTokens: number };
  private generativeModel: GenerativeModel;

  constructor(input: GoogleDirectChatModelInput) {
    this.model = input.model;
    this.maxTokens = input.maxTokens;
    this.thinking = input.thinking;
    const client = new GoogleGenerativeAI(input.apiKey);
    this.generativeModel = client.getGenerativeModel({ model: this.model });
  }

  async *stream(
    messages: ChatMessage[],
    _options?: ChatModelStreamOptions,
  ): AsyncIterable<ChatStreamChunk> {
    const { systemInstruction, contents } = formatMessages(messages);
    if (contents.length === 0) {
      throw new Error(
        "GoogleDirectChatModel: empty message body — at least one non-system message is required.",
      );
    }

    // Gemini's `thinkingConfig` is a top-level key under `generationConfig`.
    // The SDK at v0.24 doesn't type it; widen the config object inline and
    // let the wire schema handle the rest.
    const generationConfig: GenerationConfig & {
      thinkingConfig?: { thinkingBudget: number; includeThoughts?: boolean };
    } = {};
    if (this.maxTokens != null) {
      generationConfig.maxOutputTokens = this.maxTokens;
    }
    if (this.thinking) {
      generationConfig.thinkingConfig = {
        thinkingBudget: this.thinking.budgetTokens,
        includeThoughts: true,
      };
    }

    const result = await this.generativeModel.generateContentStream({
      contents,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(Object.keys(generationConfig).length > 0
        ? { generationConfig }
        : {}),
    });

    let usage: ChatUsage = { inputTokens: 0, outputTokens: 0 };
    for await (const chunk of result.stream) {
      // Use the candidates path rather than chunk.text() — text() throws
      // if the candidate was blocked. Yield each non-empty text part.
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (typeof part.text === "string" && part.text.length > 0) {
          yield { text: part.text };
        }
      }
      if (chunk.usageMetadata) {
        const m = chunk.usageMetadata;
        usage = {
          inputTokens: m.promptTokenCount ?? 0,
          outputTokens: m.candidatesTokenCount ?? 0,
          cacheRead: m.cachedContentTokenCount ?? 0,
        };
      }
    }

    yield { usage };
  }
}

/** Convert a `ChatMessage[]` into Google's `{systemInstruction, contents}`
 *  shape. System messages collapse into `systemInstruction`; Google's API
 *  uses `model` (not `assistant`) for AI-role turns. Tool messages render
 *  as user-role text (Gemini has no separate tool role for replayed
 *  history). */
export function formatMessages(messages: ChatMessage[]): {
  systemInstruction: string;
  contents: Content[];
} {
  const systemParts: string[] = [];
  const contents: Content[] = [];
  for (const msg of messages) {
    const text = msg.content;
    if (msg.role === "system") {
      if (text) systemParts.push(text);
      continue;
    }
    if (!text) continue;
    if (msg.role === "user") {
      contents.push({ role: "user", parts: [{ text }] });
    } else if (msg.role === "assistant") {
      contents.push({ role: "model", parts: [{ text }] });
    } else if (msg.role === "tool") {
      contents.push({
        role: "user",
        parts: [{ text: `Tool result:\n${text}` }],
      });
    }
  }
  return {
    systemInstruction: systemParts.join("\n\n"),
    contents,
  };
}

// Exported for tests.
export { formatMessages as _formatMessages };
