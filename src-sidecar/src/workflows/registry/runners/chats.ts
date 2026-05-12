// Streaming-chat runners (PR Review chat, Grooming chat). Both follow
// the same shape: validate input + history, drive a streaming chat with
// the workflow-specific system prompt, emit progress + result events.
//
// Neither chat binds tools. CLI-delegation providers (Claude Code,
// Gemini CLI, Copilot CLI) read/glob/grep via their own built-in tools
// when spawned with cwd=worktreePath; API-key providers get a tool-less
// chat. The pivot to this no-bindTools shape landed 2026-05-12.

import { buildModel } from "../../../models/factory.js";
import type { ChatMessage } from "../../../models/types.js";
import type { ModelSelection } from "../../../protocol.js";
import {
  PrReviewChatInputSchema,
  PrReviewChatHistorySchema,
  buildPrReviewChatSystemPrompt,
} from "../../pr-review-chat.js";
import {
  GroomingChatInputSchema,
  GroomingChatHistorySchema,
  buildGroomingChatSystemPrompt,
} from "../../grooming-chat.js";
import { streamLLMText } from "../../streaming.js";
import type { Emitter } from "../types.js";

async function runChatStreaming(args: {
  workflowId: string;
  model: ModelSelection;
  systemPrompt: string;
  history: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
  emit: Emitter;
  worktreePath?: string;
  signal: AbortSignal;
}): Promise<{ reply: string; usage: { inputTokens: number; outputTokens: number } }> {
  const { workflowId, model, systemPrompt, history, emit, worktreePath, signal } = args;
  const llm = buildModel(model, { worktreePath });
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map(
      (m): ChatMessage => ({ role: m.role, content: m.content }),
    ),
  ];
  const { text, usage } = await streamLLMText({
    llm,
    messages,
    emit,
    workflowId,
    nodeName: "reply",
    signal,
  });
  return { reply: text, usage };
}

// ── PR Review Chat runner ────────────────────────────────────────────────────

export async function runPrReviewChatWorkflow(args: {
  workflowId: string;
  input: unknown;
  model: ModelSelection;
  emit: Emitter;
  signal: AbortSignal;
  worktreePath?: string;
}): Promise<void> {
  const { workflowId, input, model, emit, signal, worktreePath } = args;

  const parsed = PrReviewChatInputSchema.safeParse(input);
  if (!parsed.success) {
    emit({
      id: workflowId,
      type: "error",
      message: `Invalid pr_review_chat input: ${parsed.error.message}`,
    });
    return;
  }
  const historyParsed = PrReviewChatHistorySchema.safeParse(
    JSON.parse(parsed.data.historyJson || "[]"),
  );
  if (!historyParsed.success) {
    emit({
      id: workflowId,
      type: "error",
      message: `Invalid pr_review_chat history: ${historyParsed.error.message}`,
    });
    return;
  }

  emit({ id: workflowId, type: "progress", node: "reply", status: "started" });

  let result: { reply: string; usage: { inputTokens: number; outputTokens: number } };
  try {
    result = await runChatStreaming({
      workflowId,
      model,
      systemPrompt: buildPrReviewChatSystemPrompt(parsed.data),
      history: historyParsed.data,
      emit,
      worktreePath,
      signal,
    });
  } catch (err) {
    emit({
      id: workflowId,
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  emit({ id: workflowId, type: "progress", node: "reply", status: "completed" });

  emit({
    id: workflowId,
    type: "result",
    output: { reply: result.reply },
    usage: result.usage,
  });
}

// ── Grooming Chat runner ─────────────────────────────────────────────────────

export async function runGroomingChatWorkflow(args: {
  workflowId: string;
  input: unknown;
  model: ModelSelection;
  emit: Emitter;
  signal: AbortSignal;
  worktreePath?: string;
}): Promise<void> {
  const { workflowId, input, model, emit, signal, worktreePath } = args;

  const parsed = GroomingChatInputSchema.safeParse(input);
  if (!parsed.success) {
    emit({
      id: workflowId,
      type: "error",
      message: `Invalid grooming_chat input: ${parsed.error.message}`,
    });
    return;
  }
  const historyParsed = GroomingChatHistorySchema.safeParse(
    JSON.parse(parsed.data.historyJson || "[]"),
  );
  if (!historyParsed.success) {
    emit({
      id: workflowId,
      type: "error",
      message: `Invalid grooming_chat history: ${historyParsed.error.message}`,
    });
    return;
  }

  emit({ id: workflowId, type: "progress", node: "reply", status: "started" });

  let result: { reply: string; usage: { inputTokens: number; outputTokens: number } };
  try {
    result = await runChatStreaming({
      workflowId,
      model,
      systemPrompt: buildGroomingChatSystemPrompt(parsed.data),
      history: historyParsed.data,
      emit,
      worktreePath,
      signal,
    });
  } catch (err) {
    emit({
      id: workflowId,
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  emit({ id: workflowId, type: "progress", node: "reply", status: "completed" });

  emit({
    id: workflowId,
    type: "result",
    output: { reply: result.reply },
    usage: result.usage,
  });
}
