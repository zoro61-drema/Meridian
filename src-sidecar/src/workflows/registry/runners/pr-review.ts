// PR Review runner — drives the chunk-aware workflow and surfaces per-chunk
// progress so the UI can show "reviewing chunk N/M" or "synthesising" while
// it runs.

import type { ModelSelection } from "../../../protocol.js";
import {
  PrReviewInputSchema,
  runPrReviewWorkflow,
} from "../../pr-review.js";
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

  const result = await runPrReviewWorkflow({
    input: parsed.data,
    model,
    emit,
    workflowId,
    signal,
    progress: {
      onMode: (mode, total) => {
        if (mode === "single_pass") {
          emit({
            id: workflowId,
            type: "progress",
            node: "single_pass",
            status: "started",
          });
        } else {
          emit({
            id: workflowId,
            type: "progress",
            node: "chunk_review",
            status: "started",
            data: { done: 0, total },
          });
        }
      },
      onChunkProgress: (done, total) => {
        emit({
          id: workflowId,
          type: "progress",
          node: "chunk_review",
          status: done >= total ? "completed" : "started",
          data: { done, total },
        });
      },
    },
  });

  emit({
    id: workflowId,
    type: "progress",
    node: "synthesis",
    status: "completed",
  });

  if (result.parseError) {
    emit({
      id: workflowId,
      type: "error",
      message: `PR review synthesis failed schema validation: ${result.parseError}`,
      cause: result.rawReport,
    });
    return;
  }

  emit({
    id: workflowId,
    type: "result",
    output: result.parsedReport,
    usage: result.usage,
  });
}
