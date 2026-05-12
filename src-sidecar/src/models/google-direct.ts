// LangChain BaseChatModel that talks to the Google Generative AI API
// directly via the official `@google/generative-ai` SDK. Replaces
// `@langchain/google-genai` (Phase 1 of the LangChain removal) — the
// adapter shape mirrors the CLI-delegation adapters so workflow callers
// don't change.
//
// Per-call lifecycle:
//   1. Convert LangChain messages → Google's `Content[]`. System
//      messages collapse into the `systemInstruction` field; user/
//      assistant/tool turns become Content records with `role: 'user' |
//      'model'`. (Google's API doesn't have a 'tool' role — tool
//      results inline as user-role text, same compromise the CLI
//      adapter uses.)
//   2. Call `model.generateContentStream(...)` and iterate the chunk
//      AsyncGenerator. Each chunk carries `candidates[].content.parts[].text`
//      and an optional `usageMetadata` (populated on the final chunk).
//   3. Forward each text chunk as a ChatGenerationChunk; emit a final
//      empty chunk carrying `usage_metadata` for streaming consumers.

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
import {
  GoogleGenerativeAI,
  type Content,
  type GenerationConfig,
  type GenerativeModel,
} from "@google/generative-ai";

export interface GoogleDirectChatModelInput extends BaseChatModelParams {
  apiKey: string;
  model: string;
  maxTokens?: number;
  /** Per-call thinking budget. Maps to Gemini's `thinkingConfig.thinkingBudget`.
   *  2.5 Flash/Pro accept this; older models ignore it. The SDK at
   *  v0.24 doesn't type the field, so it's passed through as part of
   *  generationConfig via a type assertion. */
  thinking?: { budgetTokens: number };
}

interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_token_details: { cache_creation: number; cache_read: number };
}

export class GoogleDirectChatModel extends BaseChatModel {
  private model: string;
  private maxTokens?: number;
  private thinking?: { budgetTokens: number };
  private generativeModel: GenerativeModel;

  constructor(input: GoogleDirectChatModelInput) {
    super(input);
    this.model = input.model;
    this.maxTokens = input.maxTokens;
    this.thinking = input.thinking;
    const client = new GoogleGenerativeAI(input.apiKey);
    this.generativeModel = client.getGenerativeModel({ model: this.model });
  }

  _llmType(): string {
    return "google-direct";
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
    const { systemInstruction, contents } = formatMessages(messages);
    if (contents.length === 0) {
      throw new Error(
        "GoogleDirectChatModel: empty message body — at least one non-system message is required.",
      );
    }

    // Gemini's `thinkingConfig` is a top-level key under `generationConfig`.
    // The SDK at v0.24 doesn't type it, so we widen the config object
    // and let the wire schema handle the rest.
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

    let lastUsage = emptyUsage();
    for await (const chunk of result.stream) {
      // Use the candidates path rather than chunk.text() — text()
      // throws if the candidate was blocked. We accumulate per-part
      // text and forward each non-empty delta.
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (typeof part.text === "string" && part.text.length > 0) {
          yield { kind: "delta", text: part.text };
        }
      }
      if (chunk.usageMetadata) {
        const m = chunk.usageMetadata;
        lastUsage = {
          input_tokens: m.promptTokenCount ?? 0,
          output_tokens: m.candidatesTokenCount ?? 0,
          total_tokens:
            m.totalTokenCount ??
            (m.promptTokenCount ?? 0) + (m.candidatesTokenCount ?? 0),
          input_token_details: {
            cache_creation: 0,
            cache_read: m.cachedContentTokenCount ?? 0,
          },
        };
      }
    }

    yield { kind: "usage", usage: lastUsage };
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

/** Convert a LangChain message list into Google's
 *  `{systemInstruction, contents}` shape. System messages collapse into
 *  `systemInstruction`; user/assistant/tool turns become Content records.
 *  Google's API uses `model` (not `assistant`) for AI-role turns. */
export function formatMessages(messages: BaseMessage[]): {
  systemInstruction: string;
  contents: Content[];
} {
  const systemParts: string[] = [];
  const contents: Content[] = [];
  for (const msg of messages) {
    const text = messageText(msg);
    if (msg instanceof SystemMessage) {
      if (text) systemParts.push(text);
      continue;
    }
    if (!text) continue;
    if (msg instanceof HumanMessage) {
      contents.push({ role: "user", parts: [{ text }] });
    } else if (msg instanceof AIMessage) {
      contents.push({ role: "model", parts: [{ text }] });
    } else if (msg instanceof ToolMessage) {
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
