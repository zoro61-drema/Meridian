// Workflow lifecycle entrypoints — runWorkflow and cancelWorkflow. These are
// the two functions `src-sidecar/src/index.ts` calls in response to inbound
// IPC messages. (resumeWorkflow and rewindWorkflow were specific to the
// implementation pipeline, which has been removed.)

import { withAiCaptureCtx } from "../../ai-capture.js";
import type { WorkflowStart } from "../../protocol.js";
import { workflows } from "./runners/index.js";
import { activeRuns } from "./state.js";
import type { Emitter } from "./types.js";

export async function runWorkflow(msg: WorkflowStart, emit: Emitter): Promise<void> {
  const runner = workflows[msg.workflow];
  if (!runner) {
    emit({
      id: msg.id,
      type: "error",
      message: `Unknown workflow: ${msg.workflow}`,
    });
    return;
  }

  const controller = new AbortController();
  activeRuns.set(msg.id, controller);

  try {
    await withAiCaptureCtx(
      {
        workflowId: msg.id,
        workflowName: msg.workflow,
        emit,
        captureEnabled: !!msg.debug,
      },
      () =>
        runner({
          workflowId: msg.id,
          input: msg.input,
          model: msg.model,
          emit,
          signal: controller.signal,
        }),
    );
  } catch (err) {
    emit({
      id: msg.id,
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    activeRuns.delete(msg.id);
  }
}

export function cancelWorkflow(id: string): void {
  const controller = activeRuns.get(id);
  if (controller) {
    controller.abort();
    activeRuns.delete(id);
  }
}
