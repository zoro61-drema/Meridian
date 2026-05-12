// Grooming File Probe workflow.
//
// Pre-grooming step: given a JIRA ticket, ask the model which files in
// the codebase are most relevant. The response is JSON-as-text — the
// frontend parses it and uses the file/grep list to build the codebase
// context for the main grooming workflow.
//
// CLI-delegation providers (Claude Code, Gemini CLI, Copilot CLI)
// receive the workflow's worktreePath so the CLI binary spawns with
// cwd=worktree — that lets the CLI's own built-in file tools (read,
// glob, grep) operate against the user's repo when it picks them under
// `--allow-all-tools`. API-key providers ignore worktreePath since
// they have no local execution surface; for them this stays a blind
// one-shot prediction from the ticket text.

import { z } from "zod";
import { buildModel } from "../models/factory.js";
import type { ModelSelection, OutboundEvent } from "../protocol.js";
import { streamLLMText } from "./streaming.js";

export const GroomingFileProbeInputSchema = z.object({
  ticketText: z.string(),
});

export type GroomingFileProbeInput = z.infer<
  typeof GroomingFileProbeInputSchema
>;

const SYSTEM_PROMPT = `You are a codebase navigation agent. Given a JIRA ticket, identify the source files most relevant to understanding and implementing it.

If you have access to filesystem tools (glob, grep, read), USE THEM to explore the worktree and confirm your hypotheses before returning your answer. Run 2-4 grep calls against likely symbols, optionally read 1-2 of the most promising files, then return your final JSON. Don't read more than 3 files — you're scouting, not synthesising.

Return ONLY valid JSON (no markdown fences, no explanation) with exactly this schema:
{
  "files": ["<relative path from repo root>", ...],
  "grep_patterns": ["<regex to search for relevant symbols/functions>", ...]
}
Rules:
- List at most 12 files and 6 grep patterns
- Paths should be relative (e.g. "src/reports/ReportEditor.tsx"), not absolute
- Grep patterns should target specific function names, class names, or identifiers mentioned in the ticket
- Do not include test files, lock files, or generated files
- Return empty arrays if the ticket is too vague to identify specific files`;

export interface GroomingFileProbeResult {
  markdown: string;
  usage: { inputTokens: number; outputTokens: number };
}

export async function runGroomingFileProbe(args: {
  input: GroomingFileProbeInput;
  model: ModelSelection;
  emit?: (event: OutboundEvent) => void;
  workflowId?: string;
  nodeName?: string;
  worktreePath?: string;
}): Promise<GroomingFileProbeResult> {
  // Pass worktreePath so CLI-delegation adapters spawn the binary with
  // cwd=worktree. The CLI's own built-in tools (Read/Glob/Grep on
  // Claude Code, equivalents on Gemini CLI / Copilot CLI) then operate
  // against the user's repo — which is what lets the model actually
  // look at files when picking out relevant paths. API-key adapters
  // silently ignore worktreePath.
  const llm = buildModel(args.model, { worktreePath: args.worktreePath });
  const { text, usage } = await streamLLMText({
    llm,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Identify relevant files for this ticket:\n\n${args.input.ticketText}`,
      },
    ],
  });
  return { markdown: text, usage };
}
