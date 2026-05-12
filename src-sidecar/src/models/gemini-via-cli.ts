// Adapter that delegates to the locally-installed `@google/gemini-cli`
// (`gemini -p`) instead of authenticating against Google directly.
//
// Replaces the previous CodeAssist OAuth adapter — that one impersonated
// the official Cloud Code / Android Studio Gemini integration against
// `cloudcode-pa.googleapis.com/v1internal:generateContent`, which is
// explicitly forbidden by Gemini CLI's own TOS (the "OpenClaw" example
// quoted in their license-and-privacy doc). The shell-out pattern is
// the sanctioned headless-mode recipe; auth lives in the user's
// gemini-cli install (personal Google OAuth via "Sign in with Google" →
// free Gemini Code Assist tier, or GEMINI_API_KEY for AI Studio, or
// Vertex service-account / ADC) and Meridian never sees credentials.
//
// Headless mode reference: https://geminicli.com/docs/cli/headless/
//
// Per-call lifecycle:
//   1. Convert `ChatMessage[]` → single prompt text. Gemini CLI has no
//      separate --system-prompt flag, so system messages are inlined at
//      the head of the prompt under a heading.
//   2. Spawn `gemini -p "<prompt>" --output-format json --model <id>`.
//      The `json` envelope returns `{ response, stats, error? }` in a
//      single JSON object once the model is done — simpler and more
//      stable than stream-json (which has known regression reports in
//      issue #9009 and an open feature gap on schema constraint #8022).
//   3. Parse the response, extract usage stats, emit text + usage in
//      one go (the CLI doesn't expose intermediate text chunks via the
//      json envelope, so streaming consumers see the whole reply land
//      as a single chunk).

import { spawn } from "node:child_process";
import type {
  ChatMessage,
  ChatModel,
  ChatModelStreamOptions,
  ChatStreamChunk,
  ChatUsage,
} from "./types.js";

export interface GeminiCliChatModelInput {
  /** Model id passed to `gemini --model` (e.g. `gemini-2.5-flash`,
   *  `gemini-2.5-pro`). The CLI also accepts the `*-latest` aliases. */
  model: string;
  /** Currently unused — `gemini -p` doesn't expose a max-tokens flag. */
  maxTokens?: number;
  /** Path to the `gemini` binary. If absent, looks up "gemini" on PATH. */
  geminiBinary?: string;
  /** Working directory for the spawn. When set, Gemini CLI's built-in
   *  filesystem tools operate against this directory — typically the
   *  user's worktree. */
  cwd?: string;
}

/** Shape of `gemini -p --output-format json` stdout. */
interface GeminiJsonEnvelope {
  response?: string;
  // The CLI's `stats` payload is loosely documented; we handle both the
  // OpenAI-style `tokens: {input,output,total}` shape and the GenAI-style
  // `tokens: {promptTokenCount,candidatesTokenCount,totalTokenCount}`
  // shape so a CLI version bump that swaps one for the other doesn't
  // silently zero out usage tracking.
  stats?: {
    tokens?: {
      input?: number;
      output?: number;
      total?: number;
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  error?: { message?: string } | string;
}

export class GeminiCliChatModel implements ChatModel {
  private model: string;
  private geminiBinary: string;
  private cwd?: string;

  constructor(input: GeminiCliChatModelInput) {
    this.model = input.model;
    this.geminiBinary = input.geminiBinary ?? "gemini";
    this.cwd = input.cwd;
  }

  async *stream(
    messages: ChatMessage[],
    _options?: ChatModelStreamOptions,
  ): AsyncIterable<ChatStreamChunk> {
    const { text, usage } = await this.runCli(messages);
    if (text) yield { text };
    yield { usage };
  }

  private async runCli(messages: ChatMessage[]): Promise<{
    text: string;
    usage: ChatUsage;
  }> {
    const prompt = formatMessages(messages);
    if (!prompt) {
      throw new Error(
        "GeminiCliChatModel: empty prompt after formatting messages — at least one non-system message is required.",
      );
    }
    const args = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--model",
      this.model,
    ];

    const proc = spawn(this.geminiBinary, args, {
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
        `Failed to launch Gemini CLI (\`${this.geminiBinary}\`): ${err.message}. ` +
          `Install with: npm install -g @google/gemini-cli`,
      );
    }
    if (proc.exitCode !== 0) {
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      throw new Error(
        `Gemini CLI exited with code ${proc.exitCode}${stderr ? `: ${stderr}` : ""}`,
      );
    }

    const stdout = Buffer.concat(stdoutChunks).toString("utf8");
    return parseGeminiOutput(stdout);
  }
}

export function parseGeminiOutput(stdout: string): {
  text: string;
  usage: ChatUsage;
} {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { text: "", usage: { inputTokens: 0, outputTokens: 0 } };
  }
  let envelope: GeminiJsonEnvelope;
  try {
    envelope = JSON.parse(trimmed) as GeminiJsonEnvelope;
  } catch {
    // If the CLI emitted something other than a single JSON object
    // (e.g. plain text output because the --output-format flag was
    // ignored in a CLI version we haven't pinned against), fall back
    // to surfacing the raw stdout as the response.
    return { text: trimmed, usage: { inputTokens: 0, outputTokens: 0 } };
  }

  if (envelope.error) {
    const msg =
      typeof envelope.error === "string"
        ? envelope.error
        : envelope.error.message ?? JSON.stringify(envelope.error);
    throw new Error(`Gemini CLI returned an error: ${msg}`);
  }

  const text = envelope.response ?? "";
  const tokens = envelope.stats?.tokens;
  const inputTokens = tokens?.input ?? tokens?.promptTokenCount ?? 0;
  const outputTokens = tokens?.output ?? tokens?.candidatesTokenCount ?? 0;

  return {
    text,
    usage: { inputTokens, outputTokens },
  };
}

/** Build a single prompt string from a `ChatMessage[]`. Gemini CLI has
 *  no separate --system-prompt flag, so system messages prefix the
 *  prompt under an explicit heading; subsequent user/assistant/tool
 *  turns are joined with role labels (first non-system human turn
 *  unlabelled for clean single-turn prompts). */
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
