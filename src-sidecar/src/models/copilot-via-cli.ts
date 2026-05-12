// Adapter that delegates to the locally-installed GitHub Copilot CLI
// (`copilot -p`) instead of authenticating against GitHub directly.
//
// Background: GitHub shipped a Copilot CLI in late 2025 with a
// programmatic `-p`/`--prompt` invocation pattern that mirrors what
// `claude -p` and `gemini -p` already do — the user signs in once with
// `copilot login` (or sets GITHUB_TOKEN / COPILOT_GITHUB_TOKEN) and the
// CLI handles auth locally. Meridian never sees credentials; we just
// spawn the binary per call.
//
// Programmatic reference:
//   https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference
//
// Per-call lifecycle:
//   1. Convert `ChatMessage[]` → single prompt text. Copilot CLI has no
//      separate --system-prompt flag, so system messages are inlined at
//      the head of the prompt under an explicit heading (same shape
//      Gemini adapter uses).
//   2. Spawn `copilot -p "<prompt>" --model <id> -s --no-ask-user
//      --allow-all-tools`.
//   3. Read stdout to completion; return it as the assistant text.
//      Token usage isn't surfaced via `-s` — return zero counts.

import { spawn } from "node:child_process";
import type {
  ChatMessage,
  ChatModel,
  ChatModelStreamOptions,
  ChatStreamChunk,
} from "./types.js";

export interface CopilotCliChatModelInput {
  /** Model id passed to `copilot --model`. Accepts vendor names the CLI
   *  recognises (`auto`, `gpt-5.2`, `claude-sonnet-4.6`, …) — Meridian
   *  doesn't validate; whatever the user picks in Settings is forwarded
   *  verbatim. */
  model: string;
  /** Unused — `copilot -p` doesn't expose a max-tokens flag. */
  maxTokens?: number;
  /** Path to the `copilot` binary. If absent, looks up "copilot" on
   *  PATH. */
  copilotBinary?: string;
  /** Working directory to spawn the CLI in. When set, Copilot's
   *  built-in filesystem tools (enabled by `--allow-all-tools`)
   *  operate against this directory — typically the user's worktree. */
  cwd?: string;
}

export class CopilotCliChatModel implements ChatModel {
  private model: string;
  private copilotBinary: string;
  private cwd?: string;

  constructor(input: CopilotCliChatModelInput) {
    this.model = input.model;
    this.copilotBinary = input.copilotBinary ?? "copilot";
    this.cwd = input.cwd;
  }

  async *stream(
    messages: ChatMessage[],
    _options?: ChatModelStreamOptions,
  ): AsyncIterable<ChatStreamChunk> {
    const text = await this.runCli(messages);
    if (text) yield { text };
    yield { usage: { inputTokens: 0, outputTokens: 0 } };
  }

  private async runCli(messages: ChatMessage[]): Promise<string> {
    const prompt = formatMessages(messages);
    if (!prompt) {
      throw new Error(
        "CopilotCliChatModel: empty prompt after formatting messages — at least one non-system message is required.",
      );
    }
    const args = [
      "-p",
      prompt,
      "--model",
      this.model,
      "-s",
      "--no-ask-user",
      "--allow-all-tools",
    ];

    const proc = spawn(this.copilotBinary, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...(this.cwd ? { cwd: this.cwd } : {}),
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
    proc.stderr.on("data", (c: Buffer) => stderrChunks.push(c));

    let spawnError: Error | null = null;
    proc.once("error", (err: Error) => {
      spawnError = err;
    });

    await new Promise<void>((resolve) => {
      if (proc.exitCode !== null || proc.signalCode !== null) {
        resolve();
      } else {
        proc.once("close", () => resolve());
      }
    });

    if (spawnError !== null) {
      const err: Error = spawnError;
      throw new Error(
        `Failed to launch Copilot CLI (\`${this.copilotBinary}\`): ${err.message}. ` +
          `Install with: npm install -g @github/copilot`,
      );
    }
    if (proc.exitCode !== 0) {
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      throw new Error(
        `Copilot CLI exited with code ${proc.exitCode}${stderr ? `: ${stderr}` : ""}`,
      );
    }

    return Buffer.concat(stdoutChunks).toString("utf8").trim();
  }
}

/** Build a single prompt string from a `ChatMessage[]`. Copilot CLI has
 *  no separate --system-prompt flag (same as gemini-cli), so system
 *  messages prefix the prompt under an explicit heading; subsequent
 *  user/assistant/tool turns are joined with role labels (first
 *  non-system human turn unlabelled for a clean single-turn prompt). */
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

// Exported for tests.
export { formatMessages as _formatMessages };
