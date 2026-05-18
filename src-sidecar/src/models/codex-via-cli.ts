// Adapter that delegates to the locally-installed OpenAI Codex CLI
// (`codex exec`) instead of authenticating against the OpenAI API
// directly.
//
// Background: OpenAI's `codex` CLI ships with a non-interactive
// `codex exec` subcommand that drives a single agent turn from a
// prompt and exits — same role as `claude -p` for Claude or
// `gemini -p` for Gemini. Auth is handled by `codex login` against
// the user's ChatGPT account (Plus/Pro/Team plan). Meridian never
// sees credentials; we just spawn the binary per call.
//
// Programmatic reference:
//   https://developers.openai.com/codex/noninteractive
//   https://developers.openai.com/codex/cli/reference
//
// Per-call lifecycle:
//   1. Convert `ChatMessage[]` → single prompt text. The codex CLI
//      has no separate --system-prompt flag, so system messages are
//      inlined at the head of the prompt under an explicit heading
//      (same shape Copilot and Gemini adapters use).
//   2. Spawn `codex exec --json --yolo --model <id> [--cd <cwd>] <prompt>`.
//      `--json` makes stdout newline-delimited JSON events. `--yolo`
//      bypasses approval prompts so the sidecar call never blocks
//      waiting for human input (which it can't provide).
//   3. Stream JSONL events from stdout:
//        - `item.completed` with `item.item_type === "agent_message"`
//          → yield its text content as a chunk.
//        - `turn.completed` → capture `usage` for the final yield.
//        - `error` → throw with the error message.
//   4. Yield a final `{ usage }` chunk so token-tracking callers see
//      the real input/output counts.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type {
  ChatMessage,
  ChatModel,
  ChatModelStreamOptions,
  ChatStreamChunk,
  ChatUsage,
} from "./types.js";

export interface CodexCliChatModelInput {
  /** Model id passed to `codex exec --model`. Accepts whichever ids
   *  OpenAI exposes via the CLI (`gpt-5`, `gpt-5-codex`, `o3`, …) —
   *  Meridian doesn't validate, the user's Settings → Codex picker
   *  forwards what they chose. */
  model: string;
  /** Currently unused — `codex exec` doesn't expose a max-tokens
   *  flag. Kept on the interface so the factory can forward the
   *  user's preference without conditionals. */
  maxTokens?: number;
  /** Path to the `codex` binary. If absent, looks up "codex" on PATH. */
  codexBinary?: string;
  /** Working directory to spawn the CLI in. Passed to `--cd`. When
   *  set, codex's own tool calls (file edits, shell commands) operate
   *  against this directory — typically the user's worktree. */
  cwd?: string;
}

/** Subset of the events `codex exec --json` emits. We only care
 *  about the ones that carry text or final usage; everything else
 *  (thread.started, turn.started, intermediate item.started, etc.)
 *  is ignored. */
interface CodexEvent {
  type?: string;
  item?: {
    item_type?: string;
    text?: string;
    content?: string;
  };
  usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
    reasoning_output_tokens?: number;
  };
  message?: string;
  error?: string | { message?: string };
}

export class CodexCliChatModel implements ChatModel {
  private model: string;
  private codexBinary: string;
  private cwd?: string;

  constructor(input: CodexCliChatModelInput) {
    this.model = input.model;
    this.codexBinary = input.codexBinary ?? "codex";
    this.cwd = input.cwd;
  }

  async *stream(
    messages: ChatMessage[],
    _options?: ChatModelStreamOptions,
  ): AsyncIterable<ChatStreamChunk> {
    const prompt = formatMessages(messages);
    if (!prompt) {
      throw new Error(
        "CodexCliChatModel: empty prompt after formatting messages — at least one non-system message is required.",
      );
    }

    const args = ["exec", "--json", "--yolo", "--model", this.model];
    if (this.cwd) {
      args.push("--cd", this.cwd);
    }
    args.push(prompt);

    const proc = spawn(this.codexBinary, args, {
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
    let agentError: string | null = null;

    try {
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let ev: CodexEvent;
        try {
          ev = JSON.parse(trimmed) as CodexEvent;
        } catch {
          continue;
        }

        if (ev.type === "item.completed" && ev.item?.item_type === "agent_message") {
          const text = ev.item.text ?? ev.item.content ?? "";
          if (text) yield { text };
        }

        if (ev.type === "turn.completed" && ev.usage) {
          const base = ev.usage.input_tokens ?? 0;
          const cached = ev.usage.cached_input_tokens ?? 0;
          usage = {
            inputTokens: base + cached,
            outputTokens: ev.usage.output_tokens ?? 0,
            cacheRead: cached,
          };
        }

        if (ev.type === "error") {
          const msg =
            typeof ev.error === "string"
              ? ev.error
              : (ev.error?.message ?? ev.message ?? "unknown error");
          agentError = msg;
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
        `Failed to launch Codex CLI (\`${this.codexBinary}\`): ${err.message}. ` +
          `Install with: npm install -g @openai/codex`,
      );
    }
    if (agentError) {
      throw new Error(`Codex CLI reported an error: ${agentError}`);
    }
    if (proc.exitCode !== 0) {
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      throw new Error(
        `Codex CLI exited with code ${proc.exitCode}${stderr ? `: ${stderr}` : ""}`,
      );
    }

    yield { usage };
  }
}

/** Convert a `ChatMessage[]` into a single prompt string for
 *  `codex exec`. System messages collapse into a "System
 *  instructions:" header (codex CLI has no --system-prompt flag);
 *  user/assistant/tool turns become role-labelled paragraphs in
 *  chronological order. Mirrors the formatter used in
 *  copilot-via-cli.ts so behaviour is consistent across CLI
 *  adapters. */
export function formatMessages(messages: ChatMessage[]): string {
  const systemParts: string[] = [];
  const turns: string[] = [];
  let turnIndex = 0;
  for (const msg of messages) {
    const text = msg.content;
    if (!text) continue;
    if (msg.role === "system") {
      systemParts.push(text);
    } else if (msg.role === "user") {
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
  const body = turns.join("\n\n");
  if (systemParts.length === 0) return body;
  const system = systemParts.join("\n\n");
  return `System instructions:\n${system}\n\n---\n\n${body}`;
}
