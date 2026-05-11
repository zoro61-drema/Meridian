// Tool-callback bridge.
//
// LangGraph tools defined in the sidecar do not touch the filesystem
// directly — every invocation dispatches a `tool.callback.request` event
// to the Rust backend, which executes the operation (sandboxed to the
// configured worktree path) and returns a `tool.callback.response`. This
// module manages the pending-callback registry that resolves outstanding
// requests when their responses arrive.
//
// The dispatch path is swappable via `setToolBridge`. The default is the
// Rust IPC bridge above. The eval harness installs a local-fs bridge so
// tool calls hit the eval-managed worktree directly without an IPC round-
// trip — see `evals/src/sidecar-driver.ts`.

import { randomUUID } from "node:crypto";
import type { OutboundEvent, ToolCallbackResponse } from "../protocol.js";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

const pending = new Map<string, Pending>();

export type CallbackEmitter = (event: OutboundEvent) => void;

export interface ToolBridgeArgs {
  workflowId: string;
  tool: string;
  input: unknown;
  emit: CallbackEmitter;
  timeoutMs?: number;
}

/** A bridge implementation dispatches a tool call to whoever is responsible
 *  for executing it (Rust backend in production, local fs in evals). */
export type ToolBridge = (args: ToolBridgeArgs) => Promise<unknown>;

const ipcBridge: ToolBridge = (args) => {
  const callbackId = randomUUID();
  const { workflowId, tool, input, emit, timeoutMs = 60_000 } = args;

  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(callbackId);
      reject(new Error(`Tool callback timed out: ${tool} (${timeoutMs}ms)`));
    }, timeoutMs);

    pending.set(callbackId, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });

    emit({
      id: workflowId,
      type: "tool.callback.request",
      callbackId,
      tool,
      input,
    });
  });
};

let activeBridge: ToolBridge = ipcBridge;

/** Install a custom bridge implementation. Used by the eval harness to
 *  route tool calls through a local-fs handler instead of the Rust IPC
 *  channel. Returns the previous bridge so callers can restore it. */
export function setToolBridge(bridge: ToolBridge): ToolBridge {
  const prev = activeBridge;
  activeBridge = bridge;
  return prev;
}

/** Restore the default IPC bridge. */
export function resetToolBridge(): void {
  activeBridge = ipcBridge;
}

export function requestToolCallback(args: ToolBridgeArgs): Promise<unknown> {
  return activeBridge(args);
}

export function resolveToolCallback(msg: ToolCallbackResponse): void {
  const entry = pending.get(msg.callbackId);
  if (!entry) {
    console.error(`No pending callback for id ${msg.callbackId}`);
    return;
  }
  pending.delete(msg.callbackId);
  if (msg.error) {
    entry.reject(new Error(msg.error));
  } else {
    entry.resolve(msg.result);
  }
}
