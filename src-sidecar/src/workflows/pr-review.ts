// PR Review workflow — sequential, chunk-aware. Faithful port of the
// previous LangGraph StateGraph implementation as a plain async function.
//
// Two paths through the pipeline, chosen by chunk count:
//   - Single-pass (small PRs ≤ chunkChars): one synthesis call on the
//     line-annotated diff produces the final report directly.
//   - Multi-chunk (large PRs): for each chunk, one CHUNK_SYSTEM call collects
//     findings; a final SYNTHESIS_SYSTEM call deduplicates and calibrates.

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AIMessageChunk } from "@langchain/core/messages";
import { parsePartialJson } from "@langchain/core/output_parsers";
import { z } from "zod";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildModel } from "../models/factory.js";
import type { ModelSelection, OutboundEvent } from "../protocol.js";
import { CHUNK_SYSTEM, SYNTHESIS_SYSTEM } from "./pr-review-prompts.js";
import {
  buildSinglePassReviewText,
  capFindingsBySeverity,
  sanitiseBareLineRanges,
  splitReviewIntoChunks,
  stripJsonFences,
} from "./pr-review-helpers.js";

// How often (ms) the synthesis nodes flush a partial-report progress event
// while streaming. Tight enough to feel live, loose enough that even a 1000
// token/sec local model doesn't flood the IPC channel.
const PARTIAL_FLUSH_MS = 80;

// Thinking budget for every PR-review call. Code review is a reasoning-heavy
// workload — severity calibration, scope-of-impact reasoning, hunting for
// subtle logic errors — so bounded native reasoning materially improves
// finding quality on models that support it. The factory routes this to the
// correct per-provider knob (Anthropic extended thinking, Gemini
// thinkingConfig, Ollama `think: true`) and silently ignores it on models
// that don't have a thinking mode. 4096 tokens is generous enough for
// per-chunk and synthesis reasoning without dominating the response budget.
const PR_REVIEW_THINKING = { thinking: { budgetTokens: 4096 } } as const;

// ── Schemas ───────────────────────────────────────────────────────────────────

export const PrReviewInputSchema = z.object({
  // Pre-assembled review context: header (PR description, AC, ticket info,
  // comments) + "=== DIFF ===" section + optional "=== FULL FILE CONTENTS
  // FROM BRANCH ===" section. Assembly stays in Rust for this migration.
  reviewText: z.string(),
  // Per-chunk character budget (Rust picks 12k for local LLMs, 80k for cloud).
  chunkChars: z.number().int().positive().default(80_000),
  // Synthesis-input findings budget — when collected chunk findings exceed
  // this, lower-severity findings are dropped before being handed to synthesis.
  findingsBudget: z.number().int().positive().default(40_000),
  // Optional codebase-specific Agent Skills text appended to the synthesis
  // system prompt.
  skillsBlock: z.string().nullish(),
});

export type PrReviewInput = z.infer<typeof PrReviewInputSchema>;

export const FindingSchema = z.object({
  lens: z
    .enum(["acceptance_criteria", "security", "logic", "quality", "testing"])
    .optional(),
  severity: z.enum(["blocking", "non_blocking", "nitpick"]),
  title: z.string(),
  description: z.string(),
  file: z.string().nullable(),
  line_range: z.string().nullable(),
});

export type Finding = z.infer<typeof FindingSchema>;

const LensReportSchema = z.object({
  assessment: z.string(),
  findings: z.array(
    FindingSchema.omit({ lens: true }),
  ),
});

const BugTestStepsSchema = z
  .object({
    description: z.string(),
    happy_path: z.array(z.string()),
    sad_path: z.array(z.string()),
  })
  .nullable();

export const PrReviewReportSchema = z.object({
  overall: z.enum(["approve", "request_changes", "needs_discussion"]),
  summary: z.string(),
  bug_test_steps: BugTestStepsSchema,
  lenses: z.object({
    acceptance_criteria: LensReportSchema,
    security: LensReportSchema,
    logic: LensReportSchema,
    testing: LensReportSchema,
    quality: LensReportSchema,
  }),
});

export type PrReviewReport = z.infer<typeof PrReviewReportSchema>;

// ── Public result + progress shape ────────────────────────────────────────────

export type PrReviewMode = "single_pass" | "multi_chunk";

export interface PrReviewResult {
  rawReport: string;
  parsedReport?: PrReviewReport;
  parseError?: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface PrReviewProgress {
  /** Emitted by the runner once the mode is decided. The wrapper turns this
   *  into the appropriate `progress` IPC event for the frontend. */
  onMode?: (mode: PrReviewMode, totalChunks: number) => void;
  /** Called after each chunk completes in multi-chunk mode with the running
   *  done/total counter. */
  onChunkProgress?: (done: number, total: number) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === "string" ? b : (b as { text?: string }).text ?? ""))
      .join("");
  }
  return "";
}

function tokenUsage(
  metadata: { input_tokens?: number; output_tokens?: number } | undefined,
): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: metadata?.input_tokens ?? 0,
    outputTokens: metadata?.output_tokens ?? 0,
  };
}

function addUsage(
  a: { inputTokens: number; outputTokens: number },
  b: { inputTokens: number; outputTokens: number },
): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/**
 * Stream a synthesis-style model response while emitting partial-JSON
 * progress events. Returns the final raw text and accumulated usage so the
 * caller can run schema validation once streaming completes.
 */
async function streamSynthesis(args: {
  model: BaseChatModel;
  system: string;
  user: string;
  emit?: (event: OutboundEvent) => void;
  workflowId?: string;
  node: string;
  signal?: AbortSignal;
}): Promise<{
  raw: string;
  usage: { inputTokens: number; outputTokens: number };
}> {
  const { model, system, user, emit, workflowId, node, signal } = args;

  // Passing the AbortSignal here makes the underlying fetch abort when the
  // user presses Stop Review. For HTTP-based providers (Ollama, Anthropic
  // API, Gemini API) that closes the streaming connection, which the server
  // detects and uses to cancel in-flight generation rather than continuing
  // to spend GPU on output the client no longer wants.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = (await (model as any).stream(
    [new SystemMessage(system), new HumanMessage(user)],
    signal ? { signal } : undefined,
  )) as AsyncIterable<AIMessageChunk>;

  let raw = "";
  let accumulated: AIMessageChunk | undefined;
  let lastFlushAt = 0;
  let lastEmittedSize = -1;
  let lastUsageEmitAt = 0;
  let lastEmittedInput = -1;
  let lastEmittedOutput = -1;

  const tryFlush = (force: boolean) => {
    if (!emit || !workflowId) return;
    const now = Date.now();
    if (!force && now - lastFlushAt < PARTIAL_FLUSH_MS) return;

    const cleaned = sanitiseBareLineRanges(stripJsonFences(raw));
    if (cleaned.length === lastEmittedSize) return;

    const partial = parsePartialJson(cleaned);
    if (partial == null || typeof partial !== "object") return;

    lastFlushAt = now;
    lastEmittedSize = cleaned.length;
    emit({
      id: workflowId,
      type: "progress",
      node,
      status: "started",
      data: { partialReport: partial },
    });
  };

  const tryEmitUsage = () => {
    if (!emit || !workflowId) return;
    const meta = accumulated?.usage_metadata as
      | { input_tokens?: number; output_tokens?: number }
      | undefined;
    if (!meta) return;
    const inputTokens = meta.input_tokens ?? 0;
    const outputTokens = meta.output_tokens ?? 0;
    if (inputTokens === lastEmittedInput && outputTokens === lastEmittedOutput) {
      return;
    }
    const now = Date.now();
    if (now - lastUsageEmitAt < PARTIAL_FLUSH_MS) return;
    lastUsageEmitAt = now;
    lastEmittedInput = inputTokens;
    lastEmittedOutput = outputTokens;
    emit({
      id: workflowId,
      type: "progress",
      node,
      status: "started",
      data: { usagePartial: { inputTokens, outputTokens } },
    });
  };

  for await (const chunk of stream) {
    accumulated = accumulated ? accumulated.concat(chunk) : chunk;
    const deltaText = extractText(chunk.content);
    if (deltaText) {
      raw += deltaText;
      tryFlush(false);
    }
    tryEmitUsage();
  }
  tryFlush(true);

  const meta = accumulated?.usage_metadata as
    | { input_tokens?: number; output_tokens?: number }
    | undefined;

  return {
    raw,
    usage: tokenUsage(meta),
  };
}

function buildSynthesisSystem(skillsBlock?: string | null): string {
  if (!skillsBlock?.trim()) return SYNTHESIS_SYSTEM;
  return (
    SYNTHESIS_SYSTEM +
    "\n\n=== PROJECT-SPECIFIC REVIEW STANDARDS (Agent Skills) ===\n" +
    "The following conventions are specific to this codebase. Apply them when " +
    "evaluating findings — they take precedence over generic heuristics.\n" +
    skillsBlock
  );
}

function parseReport(raw: string): {
  parsedReport?: PrReviewReport;
  parseError?: string;
} {
  const cleaned = sanitiseBareLineRanges(stripJsonFences(raw));
  try {
    const parsed = JSON.parse(cleaned);
    return { parsedReport: PrReviewReportSchema.parse(parsed) };
  } catch (err) {
    return { parseError: err instanceof Error ? err.message : String(err) };
  }
}

async function runSinglePass(args: {
  input: PrReviewInput;
  model: BaseChatModel;
  emit?: (event: OutboundEvent) => void;
  workflowId?: string;
  signal?: AbortSignal;
}): Promise<PrReviewResult> {
  const { input, model, emit, workflowId, signal } = args;
  const annotated = buildSinglePassReviewText(input.reviewText);
  const system = buildSynthesisSystem(input.skillsBlock);
  const user =
    `Review this pull request across five lenses: acceptance_criteria, security, ` +
    `logic, quality, and testing. Apply the severity calibration rules from your ` +
    `system prompt carefully — do not inflate severity. Note what is done well in ` +
    `the summary. Produce the final review report JSON.\n\n${annotated}`;

  const { raw, usage } = await streamSynthesis({
    model,
    system,
    user,
    emit,
    workflowId,
    node: "single_pass",
    signal,
  });

  return { rawReport: raw, usage, ...parseReport(raw) };
}

async function runChunkReview(args: {
  chunk: string;
  model: BaseChatModel;
  signal?: AbortSignal;
}): Promise<{
  findings: Finding[];
  usage: { inputTokens: number; outputTokens: number };
}> {
  const { chunk, model, signal } = args;
  const user = `Find all review findings in this diff chunk:\n\n${chunk}`;

  // Stream chunk reviews so adapters that surface usage_metadata only via the
  // streaming path (notably the CLI-delegation adapters, which yield a single
  // terminal chunk carrying usage_metadata) feed the per-call token totals
  // back into the workflow's usage accumulator.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = (await (model as any).stream(
    [new SystemMessage(CHUNK_SYSTEM), new HumanMessage(user)],
    signal ? { signal } : undefined,
  )) as AsyncIterable<AIMessageChunk>;

  let accumulated: AIMessageChunk | undefined;
  for await (const part of stream) {
    accumulated = accumulated ? accumulated.concat(part) : part;
  }
  const raw = accumulated ? extractText(accumulated.content) : "";
  const cleaned = stripJsonFences(raw);

  const findings: Finding[] = [];
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      // Validate each finding individually; skip malformed entries rather
      // than failing the whole chunk.
      for (const item of parsed) {
        const result = FindingSchema.safeParse(item);
        if (result.success) findings.push(result.data);
      }
    }
  } catch (err) {
    console.error(
      `[pr-review] chunk returned unparsable findings:`,
      err instanceof Error ? err.message : String(err),
    );
  }

  return { findings, usage: tokenUsage(accumulated?.usage_metadata) };
}

async function runMultiChunkSynthesis(args: {
  input: PrReviewInput;
  findings: Finding[];
  model: BaseChatModel;
  emit?: (event: OutboundEvent) => void;
  workflowId?: string;
  signal?: AbortSignal;
}): Promise<PrReviewResult> {
  const { input, findings, model, emit, workflowId, signal } = args;
  const system = buildSynthesisSystem(input.skillsBlock);

  const { json: cappedFindings, dropped } = capFindingsBySeverity(
    findings,
    input.findingsBudget,
  );

  const dropNote = dropped > 0
    ? `\n\nNote: ${dropped} lower-severity finding(s) were omitted to fit the model context window. All blocking and non-blocking findings are included.`
    : "";

  const marker = "=== DIFF ===";
  const idx = input.reviewText.indexOf(marker);
  const header = idx !== -1
    ? input.reviewText.slice(0, idx + marker.length) +
      "\n[diff reviewed in chunks — findings collected above]"
    : input.reviewText;

  const user =
    `Pull request context:\n${header}\n\n` +
    `Findings collected from reviewing all diff chunks:${dropNote}\n${cappedFindings}\n\n` +
    `Produce the final review report JSON.`;

  const { raw, usage } = await streamSynthesis({
    model,
    system,
    user,
    emit,
    workflowId,
    node: "synthesis",
    signal,
  });

  return { rawReport: raw, usage, ...parseReport(raw) };
}

/**
 * Run the PR review workflow end-to-end. Replaces the previous
 * `buildPrReviewGraph(...).stream(...)` driver — the runner calls this
 * single function and awaits the result.
 */
export async function runPrReviewWorkflow(args: {
  input: PrReviewInput;
  model: ModelSelection;
  emit?: (event: OutboundEvent) => void;
  workflowId?: string;
  signal?: AbortSignal;
  progress?: PrReviewProgress;
}): Promise<PrReviewResult> {
  const { input, model: selection, emit, workflowId, signal, progress } = args;

  const chunks = splitReviewIntoChunks(input.reviewText, input.chunkChars);
  const mode: PrReviewMode = chunks.length > 1 ? "multi_chunk" : "single_pass";
  progress?.onMode?.(mode, chunks.length);

  if (mode === "single_pass") {
    const model = buildModel(selection, PR_REVIEW_THINKING);
    return runSinglePass({ input, model, emit, workflowId, signal });
  }

  // Multi-chunk path: review each chunk sequentially, then synthesise.
  // A fresh model is built per call so AI-traffic capture can label each
  // node distinctly via the metadata on its own callback handler.
  let allFindings: Finding[] = [];
  let usage = { inputTokens: 0, outputTokens: 0 };

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) break;
    const model = buildModel(selection, PR_REVIEW_THINKING);
    const { findings, usage: chunkUsage } = await runChunkReview({
      chunk: chunks[i]!,
      model,
      signal,
    });
    allFindings = allFindings.concat(findings);
    usage = addUsage(usage, chunkUsage);
    progress?.onChunkProgress?.(i + 1, chunks.length);
  }

  const synthModel = buildModel(selection, PR_REVIEW_THINKING);
  const result = await runMultiChunkSynthesis({
    input,
    findings: allFindings,
    model: synthModel,
    emit,
    workflowId,
    signal,
  });

  return { ...result, usage: addUsage(usage, result.usage) };
}
