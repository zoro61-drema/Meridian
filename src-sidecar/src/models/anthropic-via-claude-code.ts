// Adapter that delegates to the locally-installed Claude Code CLI
// (`claude -p`) instead of authenticating against Anthropic directly.
//
// Background: Meridian previously had a custom Anthropic OAuth adapter
// (`anthropic-oauth.ts`) that wrapped subscription tokens and rewrote
// request bodies to look like Claude Code, which was contractually
// hazy. The Zed pattern — shell out to the user's own Claude Code
// install — sidesteps the impersonation problem entirely: Meridian
// never sees credentials, the CLI does its own auth (Pro / Max OAuth
// or API key) locally. Replaced 2026-05-10 as part of the auth pivot.
//
// Headless-mode flags reference: https://code.claude.com/docs/en/headless
//
// Per-call lifecycle:
//   1. Convert `ChatMessage[]` → (system prompt, conversation text).
//      System messages collapse into `--system-prompt`; the remaining
//      turns are formatted with role labels and passed as the `-p`
//      argument.
//   2. Spawn `claude -p "<prompt>" --output-format stream-json --verbose
//      --include-partial-messages --model <id> [--system-prompt <s>]`.
//   3. Parse NDJSON from stdout line-by-line. Text deltas come from
//      `stream_event` events with a `content_block_delta` payload; the
//      final `result` event carries usage totals.
//   4. Wait for process exit; non-zero exit code with stderr → throw.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  ChatMessage,
  ChatModel,
  ChatModelStreamOptions,
  ChatStreamChunk,
  ChatUsage,
} from "./types.js";

export interface ClaudeCodeChatModelInput {
  /** Model id passed to `claude --model`. The CLI accepts aliases
   *  (`haiku`, `sonnet`, `opus`) and full ids (`claude-opus-4-7`). */
  model: string;
  /** Currently unused — `claude -p` doesn't expose a max-tokens flag.
   *  Kept on the interface so the factory can pass the user's preference
   *  through without conditionals. */
  maxTokens?: number;
  /** Path to the `claude` binary. If absent, looks up "claude" on PATH —
   *  which is fine in `tauri dev` because Rust spawns the sidecar with
   *  the user's full PATH inherited via `tauri-plugin-shell`. */
  claudeBinary?: string;
  /** Working directory for the spawn. When set, Claude Code's built-in
   *  Read/Glob/Grep/Bash/Write tools operate against this directory —
   *  typically the user's worktree, so Claude can find files when the
   *  workflow prompt asks it to. */
  cwd?: string;
}

/** Sub-set of the events `claude -p --output-format stream-json` emits.
 *  See https://code.claude.com/docs/en/headless#stream-json-output. */
interface StreamEvent {
  type: string;
  subtype?: string;
  event?: {
    type?: string;
    delta?: { type?: string; text?: string };
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  result?: string;
  is_error?: boolean;
}

export class ClaudeCodeChatModel implements ChatModel {
  private model: string;
  private claudeBinary: string;
  private cwd?: string;

  constructor(input: ClaudeCodeChatModelInput) {
    this.model = input.model;
    // input.maxTokens is intentionally ignored — `claude -p` doesn't
    // expose a max-output-tokens flag. Kept on the interface so the
    // factory can pass the user's preference through without conditionals.
    this.claudeBinary = input.claudeBinary ?? "claude";
    this.cwd = input.cwd;
  }

  async *stream(
    messages: ChatMessage[],
    _options?: ChatModelStreamOptions,
  ): AsyncIterable<ChatStreamChunk> {
    const { systemPrompt, userPrompt } = formatMessages(messages);
    if (!userPrompt) {
      throw new Error(
        "ClaudeCodeChatModel: empty prompt after formatting messages — at least one non-system message is required.",
      );
    }
    const args = [
      "-p",
      userPrompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--model",
      this.model,
    ];
    if (systemPrompt) {
      args.push("--system-prompt", systemPrompt);
    }

    const proc = spawn(this.claudeBinary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...(this.cwd ? { cwd: this.cwd } : {}),
    });

    const stderrChunks: Buffer[] = [];
    proc.stderr.on("data", (c: Buffer) => stderrChunks.push(c));

    let spawnError: Error | null = null;
    proc.once("error", (err: Error) => {
      spawnError = err;
    });

    const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
    let usage: ChatUsage = { inputTokens: 0, outputTokens: 0 };

    try {
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let ev: StreamEvent;
        try {
          ev = JSON.parse(trimmed) as StreamEvent;
        } catch {
          continue;
        }

        if (ev.type === "stream_event" && ev.event?.type === "content_block_delta") {
          const delta = ev.event.delta;
          if (delta?.type === "text_delta" && typeof delta.text === "string") {
            yield { text: delta.text };
          }
        }

        if (ev.type === "result") {
          if (ev.is_error) {
            const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
            throw new Error(
              `Claude Code CLI reported an error result${stderr ? `: ${stderr}` : ""}`,
            );
          }
          if (ev.usage) {
            const cacheCreation = ev.usage.cache_creation_input_tokens ?? 0;
            const cacheRead = ev.usage.cache_read_input_tokens ?? 0;
            const baseInput = ev.usage.input_tokens ?? 0;
            usage = {
              inputTokens: baseInput + cacheCreation + cacheRead,
              outputTokens: ev.usage.output_tokens ?? 0,
              cacheCreation,
              cacheRead,
            };
          }
        }
      }
    } finally {
      await new Promise<void>((resolve) => {
        if (proc.exitCode !== null || proc.signalCode !== null) {
          resolve();
        } else {
          proc.once("close", () => resolve());
        }
      });
    }

    if (spawnError !== null) {
      const err: Error = spawnError;
      throw new Error(
        `Failed to launch Claude Code CLI (\`${this.claudeBinary}\`): ${err.message}. ` +
          `Install with: npm install -g @anthropic-ai/claude-code`,
      );
    }
    if (proc.exitCode !== 0) {
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      throw new Error(
        `Claude Code CLI exited with code ${proc.exitCode}${stderr ? `: ${stderr}` : ""}`,
      );
    }

    yield { usage };
  }
}

/** Convert a `ChatMessage[]` into a system-prompt string + a single
 *  prompt-text string suitable for `claude -p`. System messages collapse
 *  into `--system-prompt`; user/assistant/tool turns become role-labelled
 *  paragraphs in the main prompt, in chronological order, ending with
 *  the latest message. */
export function formatMessages(messages: ChatMessage[]): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemParts: string[] = [];
  const turns: string[] = [];
  let turnIndex = 0;
  for (const msg of messages) {
    const text = msg.content;
    if (!text) continue;
    if (msg.role === "system") {
      systemParts.push(text);
    } else if (msg.role === "user") {
      // First non-system human message stands alone (no `User:` prefix)
      // so single-turn workflows produce a clean prompt without a leading
      // role label. Subsequent turns (multi-turn chat) get labelled.
      turns.push(turnIndex === 0 ? text : `User:\n${text}`);
      turnIndex++;
    } else if (msg.role === "assistant") {
      turns.push(`Assistant:\n${text}`);
      turnIndex++;
    } else if (msg.role === "tool") {
      turns.push(`Tool result:\n${text}`);
      turnIndex++;
    }
  }
  return {
    systemPrompt: systemParts.join("\n\n"),
    userPrompt: turns.join("\n\n"),
  };
}

// Exported for tests.
export { formatMessages as _formatMessages };
