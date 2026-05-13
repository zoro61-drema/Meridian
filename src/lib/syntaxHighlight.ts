/**
 * Prism-based syntax highlighting for diff lines in the PR Review screen.
 *
 * Why a tiny custom helper instead of `react-syntax-highlighter`?
 *   - We highlight ONE LINE at a time (the rest of a unified diff carries
 *     +/- prefix + comment overlays + line numbers + search highlights),
 *     so a per-line component would multiply React tree depth needlessly.
 *   - Returning an HTML string lets DiffLineRow keep its existing flex
 *     layout intact and just inject coloured tokens via dangerouslySetInnerHTML.
 *   - Bundle size: only the languages we explicitly import below ship.
 *
 * Used by the unified diff in PR Review. Other surfaces that need a
 * full editor view (e.g. agent skill previews) reach for Monaco directly.
 */

import Prism from "prismjs";
// Languages bundled at build time. Order matters when a language extends
// another (tsx → typescript → javascript) — Prism resolves the dependency
// chain via these imports. Add more languages here as the team's repos
// expand; missing ones gracefully fall back to no-highlight.
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-python";
import "prismjs/components/prism-go";
import "prismjs/components/prism-java";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-css";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-sql";

const EXT_TO_PRISM_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  rs: "rust",
  py: "python",
  go: "go",
  java: "java",
  rb: "ruby",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  css: "css",
  scss: "css",
  sass: "css",
  md: "markdown",
  markdown: "markdown",
  sql: "sql",
};

/** File extension → Prism language id. Returns null for unknown extensions
 *  so callers can fall back to plain rendering. */
export function getPrismLanguageForPath(path: string): string | null {
  const ext = path.split("/").pop()?.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_PRISM_LANG[ext] ?? null;
}

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ENTITIES[c] ?? c);
}

// Module-level cache for highlighted diff lines. Prism.highlight() is the
// dominant per-render cost in PR Review (large PRs render thousands of lines,
// and React re-renders triggered by search/selection state would otherwise
// re-tokenize every line on every render). The cache is keyed on
// (language, raw) so cross-file repeats (boilerplate, common imports) hit too.
//
// Bounded with a simple "halve when full" eviction — Map iteration order is
// insertion order in V8, so the first half is the oldest. 50k entries × ~500B
// HTML/entry ≈ 25MB ceiling, comfortable for a desktop session that may scan
// several PRs without a full reload.
const HIGHLIGHT_CACHE = new Map<string, string | null>();
const HIGHLIGHT_CACHE_MAX = 50_000;

function rememberHighlight(key: string, value: string | null): string | null {
  if (HIGHLIGHT_CACHE.size >= HIGHLIGHT_CACHE_MAX) {
    const evictCount = Math.floor(HIGHLIGHT_CACHE_MAX / 2);
    const iter = HIGHLIGHT_CACHE.keys();
    for (let i = 0; i < evictCount; i++) {
      const next = iter.next();
      if (next.done) break;
      HIGHLIGHT_CACHE.delete(next.value);
    }
  }
  HIGHLIGHT_CACHE.set(key, value);
  return value;
}

/** Test-only — reset the highlight cache between tests. */
export function _resetHighlightCacheForTesting(): void {
  HIGHLIGHT_CACHE.clear();
}

/** Test-only — observe cache size for assertion in tests. */
export function _highlightCacheSizeForTesting(): number {
  return HIGHLIGHT_CACHE.size;
}

/**
 * Highlight a single diff line. The leading +/-/space prefix is preserved
 * verbatim (it's structural, not code) and the rest of the line is fed to
 * Prism. Returns an HTML string suitable for dangerouslySetInnerHTML, or
 * `null` when no highlighting should apply (unknown language, hunk header,
 * file metadata line, or no language passed).
 */
export function highlightDiffLine(
  raw: string,
  language: string | null,
): string | null {
  if (!language) return null;

  // \u0000 is a safe separator — neither language ids nor diff-line text
  // contain NULs, so collisions between e.g. `tsx`+`a` and `ts`+`xa` can't happen.
  const cacheKey = `${language}\u0000${raw}`;
  const cached = HIGHLIGHT_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;

  // Skip non-code lines — these carry no source code to colour.
  if (
    raw.startsWith("@@") ||
    raw.startsWith("diff ") ||
    raw.startsWith("index ") ||
    raw.startsWith("--- ") ||
    raw.startsWith("+++ ")
  ) {
    return rememberHighlight(cacheKey, null);
  }
  const grammar = Prism.languages[language];
  if (!grammar) return rememberHighlight(cacheKey, null);

  // Only +, -, or space (context) reach this branch, given the guards above.
  const first = raw.charAt(0);
  const hasPrefix = first === "+" || first === "-" || first === " ";
  const prefix = hasPrefix ? first : "";
  const code = hasPrefix ? raw.slice(1) : raw;

  if (code.length === 0) {
    return rememberHighlight(
      cacheKey,
      renderPrefix(prefix) + escapeHtml(raw.slice(prefix.length)),
    );
  }

  try {
    const highlighted = Prism.highlight(code, grammar, language);
    return rememberHighlight(cacheKey, renderPrefix(prefix) + highlighted);
  } catch {
    // Defensive — Prism shouldn't throw on valid grammars, but if it does
    // (malformed grammar in dev, etc.), fall through to no-highlight. Don't
    // cache the failure: a future grammar reload could fix it without a clear.
    return null;
  }
}

/**
 * Wrap the leading `+`/`-` of a diff line in a coloured span so the glyph
 * stays visually green/red while the rest of the line uses normal syntax
 * highlight colours. Context-line and missing prefixes pass through escaped.
 */
function renderPrefix(prefix: string): string {
  if (prefix === "+") return `<span class="diff-prefix-add">+</span>`;
  if (prefix === "-") return `<span class="diff-prefix-del">-</span>`;
  return escapeHtml(prefix);
}
