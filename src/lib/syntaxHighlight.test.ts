import { afterEach, describe, expect, it, vi } from "vitest";
import Prism from "prismjs";
import {
  _highlightCacheSizeForTesting,
  _resetHighlightCacheForTesting,
  getPrismLanguageForPath,
  highlightDiffLine,
} from "./syntaxHighlight";

afterEach(() => {
  _resetHighlightCacheForTesting();
  vi.restoreAllMocks();
});

describe("getPrismLanguageForPath", () => {
  it.each([
    ["src/foo.ts", "typescript"],
    ["src/foo.tsx", "tsx"],
    ["src/foo.js", "javascript"],
    ["src/foo.rs", "rust"],
    ["src/foo.py", "python"],
    ["src/foo.go", "go"],
    ["build.sh", "bash"],
    ["src/Foo.JS", "javascript"],
  ])("maps %s to %s", (path, lang) => {
    expect(getPrismLanguageForPath(path)).toBe(lang);
  });

  it("returns null for unknown extensions", () => {
    expect(getPrismLanguageForPath("foo.xyz")).toBeNull();
    expect(getPrismLanguageForPath("Dockerfile")).toBeNull();
  });
});

describe("highlightDiffLine — rendering", () => {
  it("returns null when no language is given", () => {
    expect(highlightDiffLine("+const x = 1;", null)).toBeNull();
  });

  it("returns null for hunk headers and file metadata lines", () => {
    expect(highlightDiffLine("@@ -1,3 +1,4 @@", "typescript")).toBeNull();
    expect(highlightDiffLine("diff --git a/x b/y", "typescript")).toBeNull();
    expect(highlightDiffLine("index abc..def 100644", "typescript")).toBeNull();
    expect(highlightDiffLine("--- a/x", "typescript")).toBeNull();
    expect(highlightDiffLine("+++ b/y", "typescript")).toBeNull();
  });

  it("returns null for an unknown grammar", () => {
    expect(highlightDiffLine("+something", "klingon")).toBeNull();
  });

  it("wraps the leading + in diff-prefix-add and highlights the body", () => {
    const html = highlightDiffLine("+const x = 1;", "typescript");
    expect(html).not.toBeNull();
    expect(html).toContain('<span class="diff-prefix-add">+</span>');
    expect(html).toContain('class="token');
  });

  it("wraps the leading - in diff-prefix-del and highlights the body", () => {
    const html = highlightDiffLine("-const x = 1;", "typescript");
    expect(html).not.toBeNull();
    expect(html).toContain('<span class="diff-prefix-del">-</span>');
  });

  it("preserves a context line (leading space) and still highlights", () => {
    const html = highlightDiffLine(" const x = 1;", "typescript");
    expect(html).not.toBeNull();
    // The leading space comes through escapeHtml unchanged.
    expect(html!.startsWith(" ")).toBe(true);
    expect(html).toContain('class="token');
  });

  it("returns escaped prefix-only output for an empty-body diff line", () => {
    const html = highlightDiffLine("+", "typescript");
    expect(html).toBe('<span class="diff-prefix-add">+</span>');
  });

  it("does not double-escape HTML coming back from Prism", () => {
    // Prism emits its own pre-escaped HTML; we should not re-escape it on top.
    // Two layers of escaping would convert `&lt;` to `&amp;lt;` — guard against that.
    const html = highlightDiffLine("+const x = '<div>';", "typescript");
    expect(html).not.toBeNull();
    expect(html).toContain("&lt;");
    expect(html).not.toContain("&amp;lt;");
    // The raw `<div>` tag must not survive unescaped — that would be an XSS
    // vector when rendered via dangerouslySetInnerHTML.
    expect(html).not.toMatch(/(?<!&lt;)<div>/);
  });
});

describe("highlightDiffLine — caching", () => {
  it("returns identical output across repeated calls with the same inputs", () => {
    const a = highlightDiffLine("+const x = 1;", "typescript");
    const b = highlightDiffLine("+const x = 1;", "typescript");
    expect(a).toBe(b); // identity, not just deep equality — cached value reused
  });

  it("does not call Prism.highlight on a cache hit", () => {
    const spy = vi.spyOn(Prism, "highlight");
    highlightDiffLine("+const y = 2;", "typescript");
    expect(spy).toHaveBeenCalledTimes(1);
    highlightDiffLine("+const y = 2;", "typescript");
    expect(spy).toHaveBeenCalledTimes(1); // no extra call on the second pass
  });

  it("caches null results too — non-code lines short-circuit on repeat", () => {
    // Hunk headers return null; the second call should hit the cache and not
    // re-evaluate the startsWith guards.
    expect(highlightDiffLine("@@ -1 +1 @@", "typescript")).toBeNull();
    expect(_highlightCacheSizeForTesting()).toBe(1);
    expect(highlightDiffLine("@@ -1 +1 @@", "typescript")).toBeNull();
    expect(_highlightCacheSizeForTesting()).toBe(1);
  });

  it("treats identical text under different languages as separate cache keys", () => {
    highlightDiffLine("+x = 1", "python");
    highlightDiffLine("+x = 1", "ruby");
    expect(_highlightCacheSizeForTesting()).toBe(2);
  });

  it("disambiguates language vs raw boundary so collisions can't happen", () => {
    // `tsx` + `a` and `ts` + `xa` would collide if we naively concatenated;
    // the NUL separator prevents that. Exercise both, expect two distinct
    // entries with different highlighted output.
    const a = highlightDiffLine(" a", "tsx");
    const b = highlightDiffLine(" xa", "typescript");
    expect(_highlightCacheSizeForTesting()).toBe(2);
    expect(a).not.toBe(b);
  });

  it("populates the cache on miss", () => {
    expect(_highlightCacheSizeForTesting()).toBe(0);
    highlightDiffLine("+a", "typescript");
    expect(_highlightCacheSizeForTesting()).toBe(1);
    highlightDiffLine("+a", "typescript");
    expect(_highlightCacheSizeForTesting()).toBe(1);
    highlightDiffLine("+b", "typescript");
    expect(_highlightCacheSizeForTesting()).toBe(2);
  });

  it("does not cache a Prism throw — failure can be retried after a grammar fix", () => {
    const spy = vi.spyOn(Prism, "highlight").mockImplementation(() => {
      throw new Error("simulated grammar load failure");
    });
    expect(highlightDiffLine("+x", "typescript")).toBeNull();
    // Restore Prism and verify the second call retries instead of returning
    // the cached null.
    spy.mockRestore();
    expect(highlightDiffLine("+x", "typescript")).not.toBeNull();
  });
});
