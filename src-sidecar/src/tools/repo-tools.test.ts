// Tests for per-tool result clamping. The build-loop's verbatim window
// keeps the last 8 ToolMessages uncompressed for the model to react to,
// so a single oversized tool result (e.g. read_repo_file on a 10K-line
// file, or exec_in_worktree with a long stack trace) can dominate that
// window and blow the model's context limit. clampToolResult is the
// per-call cap that keeps any single result bounded.

import { describe, expect, it } from "vitest";
import {
  clampToolResult,
  sliceFileContent,
  TOOL_RESULT_MAX_BYTES,
} from "./repo-tools.js";

describe("clampToolResult", () => {
  it("returns the input unchanged when it fits within the cap", () => {
    const small = "small payload";
    expect(clampToolResult("read_repo_file", small)).toBe(small);
  });

  it("truncates oversized read_repo_file results with a clear marker", () => {
    const oversized = "x".repeat(TOOL_RESULT_MAX_BYTES.read_repo_file * 2);
    const clamped = clampToolResult("read_repo_file", oversized);
    expect(clamped.length).toBeLessThan(oversized.length);
    expect(clamped).toContain("[TRUNCATED");
    expect(clamped).toContain(`${TOOL_RESULT_MAX_BYTES.read_repo_file} of`);
    expect(clamped).toContain("grep_repo_files");
  });

  it("truncates oversized exec_in_worktree output", () => {
    const stackTrace = "ERROR: ".repeat(TOOL_RESULT_MAX_BYTES.exec_in_worktree);
    const clamped = clampToolResult("exec_in_worktree", stackTrace);
    expect(clamped).toContain("[TRUNCATED");
    expect(clamped).toContain("single test file");
  });

  it("truncates oversized grep results", () => {
    const matches = "src/a.ts:1:match\n".repeat(2000);
    const clamped = clampToolResult("grep_repo_files", matches);
    expect(clamped).toContain("[TRUNCATED");
    expect(clamped).toContain("Tighten the pattern");
  });

  it("truncates oversized glob results", () => {
    const files = "src/file-with-a-fairly-long-name.ts\n".repeat(500);
    const clamped = clampToolResult("glob_repo_files", files);
    expect(clamped).toContain("[TRUNCATED");
    expect(clamped).toContain("glob pattern");
  });

  it("truncates oversized get_repo_diff output", () => {
    const diff = "diff --git a/foo b/foo\n".repeat(2000);
    const clamped = clampToolResult("get_repo_diff", diff);
    expect(clamped).toContain("[TRUNCATED");
  });

  it("preserves the head of the result so the agent sees the beginning", () => {
    const head = "MEANINGFUL FIRST BYTES";
    const oversized = head + "x".repeat(TOOL_RESULT_MAX_BYTES.read_repo_file);
    const clamped = clampToolResult("read_repo_file", oversized);
    expect(clamped.startsWith(head)).toBe(true);
  });

  it("reports the actual byte counts in the truncation marker", () => {
    const cap = TOOL_RESULT_MAX_BYTES.exec_in_worktree;
    const oversized = "x".repeat(cap + 5_000);
    const clamped = clampToolResult("exec_in_worktree", oversized);
    expect(clamped).toContain(`first ${cap} of ${cap + 5_000} bytes`);
    expect(clamped).toContain(`5000 elided`);
  });
});

describe("sliceFileContent", () => {
  const file = ["one", "two", "three", "four", "five", "six"].join("\n");

  it("returns the full contents when no offset or limit is given", () => {
    expect(sliceFileContent(file, undefined, undefined)).toBe(file);
  });

  it("returns a slice with a [Lines N–M of TOTAL] header when limited", () => {
    const out = sliceFileContent(file, 2, 3);
    expect(out).toContain("[Lines 2–4 of 6]");
    expect(out).toContain("two");
    expect(out).toContain("three");
    expect(out).toContain("four");
    expect(out).not.toContain("five");
    expect(out).not.toContain("one");
  });

  it("starts at offset when limit is omitted", () => {
    const out = sliceFileContent(file, 4, undefined);
    expect(out).toContain("[Lines 4–6 of 6]");
    expect(out).toContain("four");
    expect(out).toContain("six");
    expect(out).not.toContain("one");
  });

  it("limits from the start when offset is omitted", () => {
    const out = sliceFileContent(file, undefined, 2);
    expect(out).toContain("[Lines 1–2 of 6]");
    expect(out).toContain("one");
    expect(out).toContain("two");
    expect(out).not.toContain("three");
  });

  it("signals when offset is past the end of the file", () => {
    const out = sliceFileContent(file, 100, 10);
    expect(out).toContain("File has 6 lines");
    expect(out).toContain("requested offset 100 is past the end");
  });

  it("clamps end of range to file length when limit exceeds remaining lines", () => {
    const out = sliceFileContent(file, 5, 100);
    expect(out).toContain("[Lines 5–6 of 6]");
    expect(out).toContain("five");
    expect(out).toContain("six");
  });
});
