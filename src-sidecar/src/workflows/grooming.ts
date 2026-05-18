import { z } from "zod";
import { buildModel } from "../models/factory.js";
import type { ModelSelection, OutboundEvent } from "../protocol.js";
import { streamLLMJson } from "./streaming.js";
import {
  BUG_RULES as SHARED_BUG_RULES,
  CONTENT_PRESERVATION_RULE,
  IMPORTANT_RULES,
  PER_EDIT_GUIDANCE,
  STYLE_CLOSING,
  TITLE_CASE_RULE,
  buildFormatTemplatesBlock,
} from "../../../src/lib/groomingPromptBlocks.js";

// ── Input / output schemas ────────────────────────────────────────────────────

export const GroomingInputSchema = z.object({
  ticketText: z.string(),
  fileContents: z.string().optional().default(""),
  templates: z
    .object({
      // Rust serializes unset templates as JSON null (Option::None), so accept
      // both null and missing/undefined for either field.
      acceptance_criteria: z.string().nullish(),
      steps_to_reproduce: z.string().nullish(),
    })
    .nullish(),
  /** JIRA issue type, lower-cased ("bug", "story", "task", …). When the
   *  caller knows it, the system prompt gates the bug-specific rules
   *  block (~1k tokens) so non-bug runs don't carry them. Optional and
   *  defaulting to including the rules — keeps behaviour correct when
   *  an older caller forgets to pass it; a wasted-token bug is the
   *  worst-case rather than a missing-rules bug. */
  ticketType: z.string().nullish(),
});

export type GroomingInput = z.infer<typeof GroomingInputSchema>;

export const SuggestedEditSchema = z.object({
  id: z.string(),
  field: z.enum([
    "description",
    "acceptance_criteria",
    "steps_to_reproduce",
    "observed_behavior",
    "expected_behavior",
    "summary",
  ]),
  section: z.string(),
  current: z.string().nullable(),
  // Models occasionally return an array of strings here (one per bullet) even
  // when the prompt asks for a single string — coerce to a newline-joined
  // string. They also sometimes return null/undefined when they couldn't
  // propose anything; coerce to empty string rather than failing the whole
  // grooming response (an edit with empty suggested text is harmless and the
  // user will simply ignore it in the diff UI).
  suggested: z
    .union([z.string(), z.array(z.string()), z.null(), z.undefined()])
    .transform((v) => {
      if (v == null) return "";
      if (Array.isArray(v)) return v.join("\n");
      return v;
    }),
  reasoning: z.string(),
});

export const RelevantAreaSchema = z.object({
  area: z.string(),
  reason: z.string(),
  files_to_check: z.array(z.string()),
});

export const GroomingOutputSchema = z.object({
  ticket_summary: z.string(),
  // Mirrors Jira's standard work item types plus a couple of agile aliases
  // some teams use. "feature" and "chore" aren't Jira types but kept for
  // tickets imported from other trackers; "story" and "task" are the most
  // common Jira types and the only ones the grooming agent treats as
  // requiring acceptance criteria.
  ticket_type: z.enum([
    "story",
    "task",
    "bug",
    "spike",
    "epic",
    "subtask",
    "feature",
    "chore",
  ]),
  // Every list field below uses `.optional().default([])` so the freeform
  // Plan agent (which reuses this schema for its proposal envelope)
  // doesn't hard-fail when it forgets one. The standalone Grooming
  // workflow has a strict prompt that always emits all of them, so the
  // looser shape is invisible to it. Same argument for the strings:
  // missing → empty rather than throwing.
  acceptance_criteria: z.array(z.string()).optional().default([]),
  relevant_areas: z.array(RelevantAreaSchema).optional().default([]),
  dependencies: z.array(z.string()).optional().default([]),
  estimated_complexity: z.enum(["low", "medium", "high"]).optional().default("medium"),
  grooming_notes: z.string().optional().default(""),
  suggested_edits: z.array(SuggestedEditSchema).optional().default([]),
  // Open items the agent surfaces for the engineer to clarify in chat
  // before grooming finalises. Subsumes both "actual questions" and
  // "things in the ticket that read ambiguously" — they were previously
  // two separate fields that overlapped in practice. Older models that
  // still emit a top-level `ambiguities` array will have it silently
  // stripped by Zod's default unknown-key handling on z.object.
  clarifying_questions: z.array(z.string()).optional().default([]),
});

export type GroomingOutput = z.infer<typeof GroomingOutputSchema>;

// ── System prompt ─────────────────────────────────────────────────────────────

// Sidecar-specific scaffolding (role intro, JSON schema definition, file-block
// fallback). Quality rules and bug rules are imported from the shared module
// so the Command panel's Ticket Groomer role and the sidecar workflow stay in
// sync — edit `src/lib/groomingPromptBlocks.ts` to change behaviour in both.
const SIDECAR_PREAMBLE = `You are a grooming agent helping a senior engineer understand and refine a JIRA ticket. \
You have been given the ticket details and relevant source code from the codebase. \
Your job is twofold:
1. Analyse the ticket and produce a structured grooming summary
2. Identify any gaps, inaccuracies, or missing sections in the ticket and suggest concrete improvements`;

const JSON_SCHEMA_BLOCK = `Return ONLY valid JSON (no markdown fences) with this schema:
{
  "ticket_summary": "<2-3 sentence summary of what the ticket is asking for>",
  "ticket_type": "story|task|bug|spike|epic|subtask",
  "acceptance_criteria": ["<criterion>", ...],
  "relevant_areas": [
    {"area": "<module or layer>", "reason": "<why relevant>", "files_to_check": ["<path>"]}
  ],
  "dependencies": ["<other tickets or systems>", ...],
  "estimated_complexity": "low|medium|high",
  "grooming_notes": "<anything else worth flagging>",
  "suggested_edits": [
    {
      "id": "<short unique slug e.g. 'ac-1' or 'desc-clarity'>",
      "field": "<jira field: description|acceptance_criteria|steps_to_reproduce|observed_behavior|expected_behavior|summary>",
      "section": "<human label e.g. 'Acceptance Criteria' or 'Description'>",
      "current": "<exact existing text, or null if the section is missing entirely>",
      "suggested": "<your proposed replacement or addition>",
      "reasoning": "<1-2 sentences explaining why this change improves the ticket>"
    }
  ],
  "clarifying_questions": [
    "<question or unclear ticket detail the engineer needs to address before grooming finalises — phrased as a question>"
  ]
}`;

const CODE_GROUNDING_NOTE = `When you cannot determine a field's content from the ticket text alone, draft \
a plausible value from the relevant source code provided below — only fall \
back to a clarifying_question if even the code does not give enough context.`;

// Cache-stable core: all callers get the same string regardless of ticket
// type or template config, so the prompt-cache hit rate stays high across
// runs. Bug rules and format templates are appended below and treated as
// suffix-only deltas.
const BASE_SYSTEM_CORE = [
  SIDECAR_PREAMBLE,
  PER_EDIT_GUIDANCE,
  JSON_SCHEMA_BLOCK,
  IMPORTANT_RULES,
  TITLE_CASE_RULE,
  CONTENT_PRESERVATION_RULE,
  CODE_GROUNDING_NOTE,
].join("\n\n");

/** Decide whether to attach the bug-specific rules block. Returns true
 *  when the caller-supplied type identifies the ticket as a bug, OR
 *  when no type was provided (preserves correctness for callers that
 *  haven't been updated to pass `ticketType` yet — the worst case is a
 *  bit of wasted prompt rather than missing rules on a real bug). */
function shouldIncludeBugRules(ticketType: string | null | undefined): boolean {
  if (ticketType == null) return true;
  return ticketType.trim().toLowerCase() === "bug";
}

export function buildSystemPrompt(
  templates?: GroomingInput["templates"],
  ticketType?: string | null,
): string {
  const parts: string[] = [BASE_SYSTEM_CORE];
  if (shouldIncludeBugRules(ticketType)) parts.push(SHARED_BUG_RULES);
  parts.push(STYLE_CLOSING);
  const fmt = buildFormatTemplatesBlock(templates);
  if (fmt) parts.push(fmt);
  return parts.join("\n\n");
}

export function buildUserPrompt(input: GroomingInput): string {
  const fileBlock = input.fileContents
    ? `\n\n=== RELEVANT FILE CONTENTS (read from codebase) ===\n${input.fileContents}`
    : "";
  return `Groom this ticket:\n\n${input.ticketText}${fileBlock}`;
}

// ── Runner ────────────────────────────────────────────────────────────────────

export interface GroomingResult {
  rawResponse: string;
  parsedOutput?: GroomingOutput;
  parseError?: string;
  usage: { inputTokens: number; outputTokens: number };
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }
  return trimmed;
}

/**
 * Models occasionally emit bad JSON escape sequences — usually a bare `\`
 * inside a string field (code snippets, regex patterns). JSON.parse then
 * fails with "Bad escaped character". Try to recover by escaping any `\`
 * that isn't followed by a valid JSON escape character.
 */
function tryParseJsonLenient(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (firstErr) {
    const repaired = text.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    if (repaired !== text) {
      try {
        return JSON.parse(repaired);
      } catch {
        // fall through to throw the original error so the user sees the
        // actual position the model produced (more useful for debugging)
      }
    }
    throw firstErr;
  }
}

export async function runGroomingWorkflow(args: {
  input: GroomingInput;
  model: ModelSelection;
  emit?: (event: OutboundEvent) => void;
  workflowId?: string;
}): Promise<GroomingResult> {
  const { input, model: selection, emit, workflowId } = args;
  const llm = buildModel(selection);
  const system = buildSystemPrompt(input.templates, input.ticketType);
  const user = buildUserPrompt(input);

  const { raw, usage } = await streamLLMJson({
    llm,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    emit,
    workflowId,
    nodeName: "analyse",
    cleanText: stripJsonFences,
  });

  // Parse + validate. On failure we surface parseError so the caller can
  // decide how to handle it (retry, surface to user, etc.).
  const cleaned = stripJsonFences(raw);
  try {
    const parsed = tryParseJsonLenient(cleaned);
    const validated = GroomingOutputSchema.parse(parsed);
    return { rawResponse: raw, parsedOutput: validated, usage };
  } catch (err) {
    return {
      rawResponse: raw,
      parseError: err instanceof Error ? err.message : String(err),
      usage,
    };
  }
}
