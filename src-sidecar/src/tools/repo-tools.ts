// LangChain tools that the implementation/test-gen agents use to read and
// write the worktree. Each tool's `execute` callback dispatches a
// `tool.callback.request` event to the Rust backend, which performs the
// actual filesystem operation (sandboxed to the configured worktree path)
// and replies with the result.
//
// Tools are constructed per workflow run because they capture the workflow
// id + emit closure used to dispatch and correlate the IPC callbacks.

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { OutboundEvent } from "../protocol.js";
import { requestToolCallback } from "./bridge.js";

type Emitter = (event: OutboundEvent) => void;

export interface RepoToolsContext {
  workflowId: string;
  emit: Emitter;
}

// Per-tool result-size caps. Tool results are appended verbatim to the
// agent's conversation history as ToolMessage.content, and the recent
// window of those messages stays uncompressed for the model to react
// to. Without a per-tool cap, a single `read_repo_file` on a 10K-line
// file or an `exec_in_worktree` with a long stack trace can dump
// 30K–80K input tokens into one message and blow Haiku's 200K context
// in 2–3 tool calls. These caps keep any one tool result bounded so
// the worst-case window-sized message budget is ~8 × 24KB ≈ 60K
// tokens, well clear of the limit on every supported model.
//
// When a result exceeds its cap, the agent receives the truncated
// payload + an inline marker telling it (a) it was truncated, (b) how
// big the full result was, and (c) what to do (re-call narrowed, or
// grep). The full result is NOT silently dropped at the wrapper level
// for non-Tool consumers — the build node's direct `requestToolCallback`
// calls (for capturing the final diff into BuildOutput) bypass these
// wrappers, so the Ship phase still sees the complete diff.
export const TOOL_RESULT_MAX_BYTES = {
  read_repo_file: 24_000,
  grep_repo_files: 12_000,
  glob_repo_files: 8_000,
  get_repo_diff: 24_000,
  exec_in_worktree: 16_000,
} as const;

export function clampToolResult(
  toolName: keyof typeof TOOL_RESULT_MAX_BYTES,
  result: string,
): string {
  const max = TOOL_RESULT_MAX_BYTES[toolName];
  if (result.length <= max) return result;
  const head = result.slice(0, max);
  const elided = result.length - max;
  // Marker is intentionally specific per tool so the model knows how to
  // recover. read/diff suggest narrower paths or grep; exec suggests a
  // narrower test invocation; grep/glob suggest a tighter pattern.
  const advice: Record<keyof typeof TOOL_RESULT_MAX_BYTES, string> = {
    read_repo_file:
      "Re-call with grep_repo_files to locate specific symbols, or note you've seen the first portion and proceed.",
    grep_repo_files:
      "Tighten the pattern or restrict with `path` to narrow the match set.",
    glob_repo_files:
      "Tighten the glob pattern (e.g. add a more specific subdir).",
    get_repo_diff:
      "The diff is large — work from the file list you already wrote rather than reading the full diff again.",
    exec_in_worktree:
      "Narrow the command (e.g. run a single test file instead of the full suite) to get focused output.",
  };
  return `${head}\n\n[TRUNCATED — showing first ${max} of ${result.length} bytes (${elided} elided). ${advice[toolName]}]`;
}

/** Default line window when the caller doesn't pass an explicit
 *  `limit`. Mirrors Claude Code's `Read` tool behaviour: narrow by
 *  default, the agent opts into more via offset/limit. Most source
 *  files are well under this threshold (typical .ts/.py file is
 *  50–400 lines), so reads return the whole file unchanged for the
 *  common case. Big files (1000+ line vendored bundles, lockfiles)
 *  get capped with a clear "use offset/limit to read more" hint.
 *
 *  500 chosen as the middle ground: catches typical source files in
 *  full but truncates the long tail before it bloats the prompt. */
const READ_DEFAULT_LINE_LIMIT = 500;

/** Slice a file's contents to the requested line range. Returns the
 *  slice prefixed with a `[Lines N–M of TOTAL]` header so the model
 *  knows exactly which region it got (helpful for narrowing follow-up
 *  reads — "I got lines 1–100, the function I want is at line 187,
 *  let me ask for offset=187 limit=50").
 *
 *  When both `offset` and `limit` are undefined:
 *    - File ≤ READ_DEFAULT_LINE_LIMIT lines → full contents, no header.
 *    - File > READ_DEFAULT_LINE_LIMIT lines → first READ_DEFAULT_LINE_LIMIT
 *      lines, header announces the cap + suggests offset/limit to see
 *      more. The agent opts into a wider read instead of paying the
 *      cost of the whole file by default. */
export function sliceFileContent(
  contents: string,
  offset: number | undefined,
  limit: number | undefined,
): string {
  const lines = contents.split("\n");
  // Common case: small file, no slice args — preserve historical
  // behaviour of returning raw contents with no header.
  if (
    offset === undefined &&
    limit === undefined &&
    lines.length <= READ_DEFAULT_LINE_LIMIT
  ) {
    return contents;
  }
  // Apply defaults when caller didn't specify. The "implicit default"
  // case (large file, no args) flags itself in the header so the
  // agent knows it got a slice rather than the whole file.
  const implicitDefault = offset === undefined && limit === undefined;
  const effectiveLimit = limit ?? READ_DEFAULT_LINE_LIMIT;
  const start = Math.max(0, (offset ?? 1) - 1);
  const end = Math.min(lines.length, start + effectiveLimit);
  // Out-of-range slice: be explicit so the model doesn't think the file
  // is empty when it actually asked past the end.
  if (start >= lines.length) {
    return `[File has ${lines.length} lines; requested offset ${offset} is past the end. File is shorter than expected — drop offset to re-read from the top, or use grep to locate the symbol you're after.]`;
  }
  const slice = lines.slice(start, end).join("\n");
  const header = implicitDefault
    ? `[First ${end} of ${lines.length} lines — file exceeds the default read window. Pass offset=${end + 1} (and optional limit) to read further, or grep for a specific symbol.]`
    : `[Lines ${start + 1}–${end} of ${lines.length}]`;
  return `${header}\n${slice}`;
}

// Claude-tuned tool descriptions: terse, action-led, with example commands
// inline. Claude responds best to tools that read like CLI man pages; the
// other supported providers (Gemini / Ollama) accept this style fine since
// LangChain's bindTools normalises the tool surface.

const READ_FILE_DESCRIPTION =
  "Read a file from the worktree. Returns the file's contents.\n" +
  "Use before editing or to chase a type/contract you'd otherwise be guessing at.\n" +
  "DEFAULTS NARROW: with no `offset`/`limit`, reads up to 500 lines. Files " +
  "under that come back in full with no header; larger files come back as " +
  "the first 500 lines with a header noting how many you skipped — pass " +
  "`offset` (1-indexed line) + optional `limit` to read further, or use " +
  "`grep_repo_files` first to locate the symbol you actually need. " +
  "Prefer narrow reads over whole-file reads when you can.";

const WRITE_FILE_DESCRIPTION =
  "Write a file in the worktree. content is the COMPLETE new file — partial content overwrites everything.\n" +
  "Creates the file and any missing parent directories.";

const GLOB_DESCRIPTION =
  "Find files matching a glob pattern. Examples: 'src/**/*.ts', '**/*.test.tsx', 'docs/**/*.md'.\n" +
  "Returns up to 500 paths relative to the worktree root.";

const GREP_DESCRIPTION =
  "Regex search via git grep. Optionally restrict to a subdirectory.\n" +
  "Returns up to 200 matches as 'path:line:content'.";

const DIFF_DESCRIPTION =
  "Unified diff of the worktree against its base branch.\n" +
  "Use to see what's already on disk (e.g. after a rewind, or to confirm a write landed).";

const EXEC_DESCRIPTION =
  "Run a shell command in the worktree. Use for typecheck, tests, build:\n" +
  "  pnpm tsc --noEmit\n" +
  "  pnpm vitest run path/to/file.test.ts\n" +
  "  pnpm build\n" +
  "  cargo check\n" +
  "  pytest path/to/test_foo.py\n" +
  "Returns {exitCode, output} (combined stdout+stderr). Default timeout 180s, max 300s.\n" +
  "Don't run dev servers, watchers, or anything that doesn't terminate.";

export function makeRepoTools(ctx: RepoToolsContext) {
  // Emit a `progress` event tagged with the tool's first interesting
  // argument so the frontend can render a live activity strip ("→
  // read_repo_file src/server.ts"). Without this the only signal the
  // user has during a long implementation pass is the cumulative token
  // counter — which moves but doesn't tell them WHICH file the agent
  // is currently touching.
  const summariseInput = (toolName: string, input: unknown): string => {
    if (!input || typeof input !== "object") return "";
    const obj = input as Record<string, unknown>;
    if (toolName === "grep_repo_files") {
      const pattern = typeof obj.pattern === "string" ? obj.pattern : "";
      const path = typeof obj.path === "string" ? obj.path : undefined;
      return path ? `${pattern} (in ${path})` : pattern;
    }
    if (toolName === "exec_in_worktree") {
      return typeof obj.command === "string" ? obj.command : "";
    }
    if (typeof obj.path === "string") return obj.path;
    if (typeof obj.pattern === "string") return obj.pattern;
    return "";
  };

  const callback = async (toolName: string, input: unknown) => {
    const arg = summariseInput(toolName, input);
    ctx.emit({
      id: ctx.workflowId,
      type: "progress",
      node: "tool",
      status: "started",
      data: { tool: { name: toolName, arg } },
    });
    try {
      const result = await requestToolCallback({
        workflowId: ctx.workflowId,
        tool: toolName,
        input,
        emit: ctx.emit,
      });
      ctx.emit({
        id: ctx.workflowId,
        type: "progress",
        node: "tool",
        status: "completed",
        data: { tool: { name: toolName, arg } },
      });
      return result;
    } catch (err) {
      ctx.emit({
        id: ctx.workflowId,
        type: "progress",
        node: "tool",
        status: "completed",
        data: {
          tool: {
            name: toolName,
            arg,
            error: err instanceof Error ? err.message : String(err),
          },
        },
      });
      throw err;
    }
  };

  const readRepoFile = tool(
    async ({
      path,
      offset,
      limit,
    }: {
      path: string;
      offset?: number;
      limit?: number;
    }) => {
      const result = (await callback("read_repo_file", { path })) as { contents: string };
      const sliced = sliceFileContent(result.contents, offset, limit);
      return clampToolResult("read_repo_file", sliced);
    },
    {
      name: "read_repo_file",
      description: READ_FILE_DESCRIPTION,
      schema: z.object({
        path: z.string().describe("Path relative to the worktree root, e.g. 'src/components/Button.tsx'"),
        offset: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("1-indexed line to start reading from. Omit to start at line 1."),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Maximum number of lines to read. Omit to read to end of file (subject to the 24KB result cap)."),
      }),
    },
  );

  const writeRepoFile = tool(
    async ({ path, content }: { path: string; content: string }) => {
      await callback("write_repo_file", { path, content });
      return `Wrote ${path}`;
    },
    {
      name: "write_repo_file",
      description: WRITE_FILE_DESCRIPTION,
      schema: z.object({
        path: z.string().describe("Path relative to the worktree root"),
        content: z.string().describe("The complete new file content"),
      }),
    },
  );

  const globRepoFiles = tool(
    async ({ pattern }: { pattern: string }) => {
      const result = (await callback("glob_repo_files", { pattern })) as { files: string[] };
      return clampToolResult("glob_repo_files", result.files.join("\n"));
    },
    {
      name: "glob_repo_files",
      description: GLOB_DESCRIPTION,
      schema: z.object({
        pattern: z.string().describe("Glob pattern, e.g. 'src/**/*.ts'"),
      }),
    },
  );

  const grepRepoFiles = tool(
    async ({ pattern, path }: { pattern: string; path?: string }) => {
      const result = (await callback("grep_repo_files", { pattern, path })) as {
        matches: string[];
      };
      return clampToolResult("grep_repo_files", result.matches.join("\n"));
    },
    {
      name: "grep_repo_files",
      description: GREP_DESCRIPTION,
      schema: z.object({
        pattern: z.string().describe("Regex pattern to search for"),
        path: z
          .string()
          .optional()
          .describe("Optional subdirectory to restrict the search"),
      }),
    },
  );

  const getRepoDiff = tool(
    async () => {
      const result = (await callback("get_repo_diff", {})) as { diff: string };
      return clampToolResult("get_repo_diff", result.diff);
    },
    {
      name: "get_repo_diff",
      description: DIFF_DESCRIPTION,
      schema: z.object({}),
    },
  );

  const execInWorktreeTool = tool(
    async ({ command, timeoutSecs }: { command: string; timeoutSecs?: number }) => {
      const result = (await callback("exec_in_worktree", {
        command,
        timeoutSecs: timeoutSecs ?? 180,
      })) as { exitCode: number; output: string };
      // Clamp the JSON-stringified result; output is the bulk of it
      // (test stack traces, build logs) and is the realistic blast
      // radius. exitCode + JSON scaffolding are negligible.
      return clampToolResult("exec_in_worktree", JSON.stringify(result));
    },
    {
      name: "exec_in_worktree",
      description: EXEC_DESCRIPTION,
      schema: z.object({
        command: z
          .string()
          .describe(
            "The shell command to run, executed via `sh -c` from the worktree root.",
          ),
        timeoutSecs: z
          .number()
          .int()
          .positive()
          .max(300)
          .optional()
          .describe(
            "Wall-clock timeout in seconds (default 180, max 300). Pick a value matching the command's expected runtime.",
          ),
      }),
    },
  );

  return [
    readRepoFile,
    writeRepoFile,
    globRepoFiles,
    grepRepoFiles,
    getRepoDiff,
    execInWorktreeTool,
  ];
}

/** Stat a worktree-relative path. Distinguishes missing from empty — used by
 *  the implementation node to verify what the agent actually did on disk
 *  after a per-file iteration. Not exposed as a LangChain tool because the
 *  agent itself doesn't need it; verification is the node's job. */
export async function statRepoFile(args: {
  workflowId: string;
  emit: Emitter;
  path: string;
}): Promise<{ exists: boolean; sizeBytes: number }> {
  const result = (await requestToolCallback({
    workflowId: args.workflowId,
    tool: "stat_repo_file",
    input: { path: args.path },
    emit: args.emit,
  })) as { exists: boolean; sizeBytes: number };
  return result;
}

/** Read a worktree-relative file via the IPC bridge. Mirrors the agent-facing
 *  read_repo_file tool but callable directly by node code (verification, etc.)
 *  without going through a LangChain tool invocation. */
export async function readRepoFileDirect(args: {
  workflowId: string;
  emit: Emitter;
  path: string;
}): Promise<string> {
  const result = (await requestToolCallback({
    workflowId: args.workflowId,
    tool: "read_repo_file",
    input: { path: args.path },
    emit: args.emit,
  })) as { contents: string };
  return result.contents;
}

export type RepoTools = ReturnType<typeof makeRepoTools>;
