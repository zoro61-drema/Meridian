// Grooming runner — invokes the grooming workflow and emits its parsed
// structured output.

import type { ModelSelection } from "../../../protocol.js";
import { GroomingInputSchema, runGroomingWorkflow } from "../../grooming.js";
import type { Emitter } from "../types.js";

export async function runGrooming(args: {
  workflowId: string;
  input: unknown;
  model: ModelSelection;
  emit: Emitter;
  signal: AbortSignal;
}): Promise<void> {
  const { workflowId, input, model, emit } = args;

  const parsed = GroomingInputSchema.safeParse(input);
  if (!parsed.success) {
    emit({
      id: workflowId,
      type: "error",
      message: `Invalid grooming input: ${parsed.error.message}`,
    });
    return;
  }

  emit({ id: workflowId, type: "progress", node: "analyse", status: "started" });

  const result = await runGroomingWorkflow({
    input: parsed.data,
    model,
    emit,
    workflowId,
  });

  emit({ id: workflowId, type: "progress", node: "analyse", status: "completed" });

  if (result.parseError) {
    emit({
      id: workflowId,
      type: "error",
      message: `Grooming response failed schema validation: ${result.parseError}`,
      cause: result.rawResponse,
    });
    return;
  }

  emit({
    id: workflowId,
    type: "result",
    output: result.parsedOutput,
    usage: result.usage,
  });
}
