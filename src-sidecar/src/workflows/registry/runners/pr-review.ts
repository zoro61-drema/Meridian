// PR Review runner — drives the chunk-aware StateGraph and surfaces per-chunk
// progress so the UI can show "reviewing chunk N/M" or "synthesising" while
// the graph runs.

import type { ModelSelection } from "../../../protocol.js";
import { buildPrReviewGraph, PrReviewInputSchema } from "../../pr-review.js";
import type { Emitter } from "../types.js";

export async function runPrReview(args: {
  workflowId: string;
  input: unknown;
  model: ModelSelection;
  emit: Emitter;
  signal: AbortSignal;
}): Promise<void> {
  const { workflowId, input, model, emit, signal } = args;

  const parsed = PrReviewInputSchema.safeParse(input);
  if (!parsed.success) {
    emit({
      id: workflowId,
      type: "error",
      message: `Invalid pr_review input: ${parsed.error.message}`,
    });
    return;
  }

  emit({
    id: workflowId,
    type: "progress",
    node: "review",
    status: "started",
  });

  const graph = buildPrReviewGraph({ emit, workflowId, signal });
  let finalState: Awaited<ReturnType<typeof graph.invoke>> | undefined;
  for await (const update of await graph.stream(
    { input: parsed.data, model },
    { streamMode: "values", signal },
  )) {
    finalState = update;
    if (update.mode === "multi_chunk" && update.chunks?.length) {
      const total = update.chunks.length;
      const done = Math.min(update.currentChunk ?? 0, total);
      emit({
        id: workflowId,
        type: "progress",
        node: "chunk_review",
        status: done >= total ? "completed" : "started",
        data: { done, total },
      });
    } else if (update.mode === "single_pass") {
      emit({
        id: workflowId,
        type: "progress",
        node: "single_pass",
        status: "started",
      });
    }
  }

  if (!finalState) {
    emit({
      id: workflowId,
      type: "error",
      message: "PR review workflow ended without producing a state",
    });
    return;
  }

  emit({
    id: workflowId,
    type: "progress",
    node: "synthesis",
    status: "completed",
  });

  if (finalState.parseError) {
    emit({
      id: workflowId,
      type: "error",
      message: `PR review synthesis failed schema validation: ${finalState.parseError}`,
      cause: finalState.rawReport,
    });
    return;
  }

  emit({
    id: workflowId,
    type: "result",
    output: finalState.parsedReport,
    usage: {
      inputTokens: finalState.usage?.inputTokens ?? 0,
      outputTokens: finalState.usage?.outputTokens ?? 0,
    },
  });
}
