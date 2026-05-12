// Shared scaffold for chat workflows that stream tokens AND can call tools.
//
// Used by `pr_review_chat` and `grooming_chat` — these are interactive chat
// sessions where the model can call repo-inspection tools (glob / grep /
// read / get_repo_diff) between turns. Token output is streamed back to the
// frontend live (one `stream` event per chunk) so the user sees the reply
// being typed in real time.
//
// This is the non-graph equivalent of `runToolLoop` in `pipeline.ts` — same
// tool-call protocol, but uses `model.stream()` so deltas can be emitted as
// they arrive rather than waiting for the whole response.

import {
  AIMessage,
  type AIMessageChunk,
  type BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { z } from "zod";
import { buildModel } from "../models/factory.js";
import type { ModelSelection, OutboundEvent } from "../protocol.js";
import type { RepoTools } from "../tools/repo-tools.js";

export const ChatHistoryItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type ChatHistoryItem = z.infer<typeof ChatHistoryItemSchema>;

const MAX_ITERATIONS = 12;

type Emitter = (event: OutboundEvent) => void;

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) =>
        typeof b === "string" ? b : (b as { text?: string }).text ?? "",
      )
      .join("");
  }
  return "";
}

/**
 * Streaming chat without tool calling. Used by chat panels whose work is
 * pure conversational refinement against an already-injected context
 * (e.g. grooming_chat refines a JSON edits payload using the engineer's
 * answers — the repo context arrives in the system prompt from the
 * earlier file-probe stage, so no mid-conversation tool calls are
 * needed). Works with every provider — CLI delegation paths (Claude
 * Code, Gemini CLI, Copilot CLI) included — because there's no
 * bindTools requirement.
 */
export async function runStreamingChat(args: {
  workflowId: string;
  model: ModelSelection;
  systemPrompt: string;
  history: ChatHistoryItem[];
  emit: Emitter;
  nodeName: string;
}): Promise<{
  reply: string;
  usage: { inputTokens: number; outputTokens: number };
}> {
  const { workflowId, model, systemPrompt, history, emit, nodeName } = args;

  const llm = buildModel(model);
  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...history.map((m) =>
      m.role === "user"
        ? new HumanMessage(m.content)
        : new AIMessage(m.content),
    ),
  ];

  let accumulated: AIMessageChunk | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = (await (llm as any).stream(messages)) as AsyncIterable<
    AIMessageChunk
  >;
  for await (const chunk of stream) {
    const deltaText = extractText(chunk.content);
    if (deltaText) {
      emit({ id: workflowId, type: "stream", node: nodeName, delta: deltaText });
    }
    accumulated = accumulated ? accumulated.concat(chunk) : chunk;
  }
  if (!accumulated) {
    throw new Error("Chat received an empty stream from the model");
  }

  const u = accumulated.usage_metadata as
    | { input_tokens?: number; output_tokens?: number }
    | undefined;
  return {
    reply: extractText(accumulated.content),
    usage: {
      inputTokens: u?.input_tokens ?? 0,
      outputTokens: u?.output_tokens ?? 0,
    },
  };
}

export async function runStreamingChatWithTools(args: {
  workflowId: string;
  model: ModelSelection;
  tools: RepoTools;
  systemPrompt: string;
  history: ChatHistoryItem[];
  emit: Emitter;
  nodeName: string;
}): Promise<{
  reply: string;
  usage: { inputTokens: number; outputTokens: number };
}> {
  const { workflowId, model, tools, systemPrompt, history, emit, nodeName } =
    args;

  const llm = buildModel(model);
  if (typeof llm.bindTools !== "function") {
    const llmType = llm._llmType();
    // The three CLI-delegation adapters (claude-code-cli, gemini-cli,
    // copilot-cli) all shell out to the user's installed binary, which
    // exposes the CLI's own built-in tools but doesn't accept ad-hoc
    // tool definitions from the embedder. Chat panels that bind repo-
    // inspection tools need a provider with native bindTools support —
    // surface a concrete "switch the model picker to X" message so the
    // user doesn't have to interpret a generic LangChain error.
    const cliNames: Record<string, string> = {
      "claude-code-cli": "Claude Code CLI",
      "gemini-cli": "Gemini CLI",
      "copilot-cli": "GitHub Copilot CLI",
    };
    if (cliNames[llmType]) {
      throw new Error(
        `${cliNames[llmType]} doesn't support tool calls — its programmatic interface doesn't accept ad-hoc tool definitions from Meridian. ` +
          `This chat panel needs a provider that does. Open the model picker (top right of this panel) and switch to your Anthropic API key, your Gemini API key, or a local Ollama instance.`,
      );
    }
    throw new Error(
      `Model ${llmType} does not support tool calls. The chat workflow requires a provider with native bindTools support — switch the model picker to Anthropic (API key), Gemini (API key), or Ollama.`,
    );
  }
  const llmWithTools = llm.bindTools(tools);

  const messages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...history.map((m) =>
      m.role === "user"
        ? new HumanMessage(m.content)
        : new AIMessage(m.content),
    ),
  ];

  let reply = "";
  const usage = { inputTokens: 0, outputTokens: 0 };

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let accumulated: AIMessageChunk | undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = (await (llmWithTools as any).stream(
      messages,
    )) as AsyncIterable<AIMessageChunk>;
    for await (const chunk of stream) {
      const deltaText = extractText(chunk.content);
      if (deltaText) {
        emit({ id: workflowId, type: "stream", node: nodeName, delta: deltaText });
      }
      accumulated = accumulated ? accumulated.concat(chunk) : chunk;
    }
    if (!accumulated) {
      throw new Error("Chat tool loop received an empty stream from the model");
    }

    const u = accumulated.usage_metadata as
      | { input_tokens?: number; output_tokens?: number }
      | undefined;
    usage.inputTokens += u?.input_tokens ?? 0;
    usage.outputTokens += u?.output_tokens ?? 0;

    const turnText = extractText(accumulated.content);
    if (turnText) reply += turnText;

    const aiMessage = new AIMessage({
      content: accumulated.content,
      tool_calls: accumulated.tool_calls,
      additional_kwargs: accumulated.additional_kwargs,
    });
    messages.push(aiMessage);

    const calls = accumulated.tool_calls;
    if (!calls || calls.length === 0) {
      return { reply, usage };
    }

    for (const call of calls) {
      const found = tools.find((t) => t.name === call.name) as
        | { invoke: (input: unknown) => Promise<unknown> }
        | undefined;
      if (!found) {
        messages.push(
          new ToolMessage({
            tool_call_id: call.id ?? "",
            content: `Error: unknown tool '${call.name}'`,
          }),
        );
        continue;
      }
      try {
        const result = await found.invoke(call.args);
        messages.push(
          new ToolMessage({
            tool_call_id: call.id ?? "",
            name: call.name,
            content:
              typeof result === "string" ? result : JSON.stringify(result),
          }),
        );
      } catch (err) {
        messages.push(
          new ToolMessage({
            tool_call_id: call.id ?? "",
            name: call.name,
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          }),
        );
      }
    }
  }

  throw new Error(
    `Chat tool loop exceeded ${MAX_ITERATIONS} iterations without a final reply`,
  );
}
