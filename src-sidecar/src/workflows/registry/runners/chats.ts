// Streaming-chat-with-tools runners (PR review chat, grooming chat). Both
// follow the same shape: validate input + history, drive
// runStreamingChatWithTools with the workflow-specific system prompt,
// emit progress + result events.

import type { ModelSelection } from "../../../protocol.js";
import { runStreamingChat } from "../../chat-with-tools.js";
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
import type { Emitter } from "../types.js";

// ── PR Review Chat runner ────────────────────────────────────────────────────

export async function runPrReviewChatWorkflow(args: {
  workflowId: string;
  input: unknown;
  model: ModelSelection;
  emit: Emitter;
  signal: AbortSignal;
  worktreePath?: string;
}): Promise<void> {
  const { workflowId, input, model, emit, worktreePath } = args;

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

  // No tools bound. CLI-delegation providers (Claude Code, Gemini CLI,
  // Copilot CLI) read/glob/grep via their own built-in tools when spawned
  // with cwd=worktreePath; API-key providers get a tool-less chat.
  let result: { reply: string; usage: { inputTokens: number; outputTokens: number } };
  try {
    result = await runStreamingChat({
      workflowId,
      model,
      systemPrompt: buildPrReviewChatSystemPrompt(parsed.data),
      history: historyParsed.data,
      emit,
      nodeName: "reply",
      worktreePath,
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
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    },
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
  const { workflowId, input, model, emit, worktreePath } = args;

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

  // Grooming chat doesn't bind repo tools — its job is pure
  // conversational refinement of an existing JSON edits payload using
  // the engineer's answers. The repo context arrives in the system
  // prompt from the earlier file-probe stage. Skipping tool binding
  // means the workflow works with any provider, including CLI
  // delegation paths (Claude Code, Gemini CLI, Copilot CLI).
  let result: { reply: string; usage: { inputTokens: number; outputTokens: number } };
  try {
    result = await runStreamingChat({
      workflowId,
      model,
      systemPrompt: buildGroomingChatSystemPrompt(parsed.data),
      history: historyParsed.data,
      emit,
      nodeName: "reply",
      worktreePath,
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
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    },
  });
}

