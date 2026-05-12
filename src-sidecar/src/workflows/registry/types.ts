// Shared types for the workflow registry.

import type { ModelSelection, OutboundEvent } from "../../protocol.js";

export type Emitter = (event: OutboundEvent) => void;

export type WorkflowRunner = (args: {
  workflowId: string;
  input: unknown;
  model: ModelSelection;
  emit: Emitter;
  signal: AbortSignal;
  /** Absolute path to the user's worktree. CLI-delegation adapters
   *  (Claude Code / Gemini CLI / Copilot CLI) use this as the spawn
   *  cwd so the CLI's built-in filesystem tools find the user's repo.
   *  Undefined for workflows that don't need codebase access. */
  worktreePath?: string;
}) => Promise<void>;
