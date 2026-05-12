// LangChain BaseChatModel that delegates to the locally-installed
// `@google/gemini-cli` (`gemini -p`) instead of authenticating against
// Google directly.
//
// Replaces the previous CodeAssist OAuth adapter — that one impersonated
// the official Cloud Code / Android Studio Gemini integration against
// `cloudcode-pa.googleapis.com/v1internal:generateContent`, which is
// explicitly forbidden by Gemini CLI's own TOS (the "OpenClaw" example
// quoted in their license-and-privacy doc). The shell-out pattern is
// the sanctioned headless-mode recipe; auth lives in the user's gemini-
// cli install (personal Google OAuth via "Sign in with Google" → free
// Gemini Code Assist tier, or GEMINI_API_KEY for AI Studio, or Vertex
// service-account / ADC) and Meridian never sees credentials.
//
// Headless mode reference: https://geminicli.com/docs/cli/headless/
//
// Per-call lifecycle:
//   1. Convert LangChain messages → single prompt text. Gemini CLI's
//      `-p` doesn't have a dedicated --system-prompt flag, so system
//      messages are inlined at the head of the prompt under a heading.
//   2. Spawn `gemini -p "<prompt>" --output-format json --model <id>`.
//      The `json` envelope returns `{ response, stats, error? }` in a
//      single JSON object once the model is done — simpler and more
//      stable than stream-json (which has known regression reports in
//      issue #9009 and an open feature gap on schema constraint #8022).
//   3. Parse the response, extract usage stats, emit text + usage.
//      For streaming workflows we still call _stream and yield the
//      entire response in a single chunk at the end — that satisfies
//      LangChain's streaming protocol but the UI sees the text arrive
//      in one burst rather than token-by-token.
//
// Tool calling: not supported from the embedder. gemini-cli loads tools
// from MCP servers configured in ~/.gemini/settings.json — there's no
// command-line surface for ad-hoc tool definitions. Same architectural
// choice as Claude Code delegation: Meridian's surviving workflows
// either don't bind tools or route them through Ollama.
//
// Structured output: gemini-cli has no --json-schema flag (issue #8022
// is the open feature request). Callers that want JSON output prompt
// for it and validate with Zod after parsing — which is what Meridian's
// workflows already do, so no change required.

import { spawn } from "node:child_process";
import {
  AIMessage,
  AIMessageChunk,
  type BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import {
  BaseChatModel,
  type BaseChatModelParams,
} from "@langchain/core/language_models/chat_models";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import { ChatGenerationChunk, type ChatResult } from "@langchain/core/outputs";

export interface GeminiCliChatModelInput extends BaseChatModelParams {
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

export class GeminiCliChatModel extends BaseChatModel {
  private model: string;
  private geminiBinary: string;
  private cwd?: string;

  constructor(input: GeminiCliChatModelInput) {
    super(input);
    this.model = input.model;
    this.geminiBinary = input.geminiBinary ?? "gemini";
    this.cwd = input.cwd;
  }

  _llmType(): string {
    return "gemini-cli";
  }

  async _generate(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const { text, usage } = await this.runCli(messages);
    await runManager?.handleLLMNewToken(text);
    return {
      generations: [
        {
          text,
          message: new AIMessage({
            content: text,
            usage_metadata: usage,
          }),
        },
      ],
      llmOutput: { tokenUsage: usage },
    };
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const { text, usage } = await this.runCli(messages);
    if (text) {
      await runManager?.handleLLMNewToken(text);
      yield new ChatGenerationChunk({
        text,
        message: new AIMessageChunk({ content: text }),
      });
    }
    // Final empty chunk carrying usage so the workflow's accumulator
    // picks it up via the usage_metadata path on the terminal chunk.
    yield new ChatGenerationChunk({
      text: "",
      message: new AIMessageChunk({
        content: "",
        usage_metadata: usage,
      }),
    });
  }

  private async runCli(messages: BaseMessage[]): Promise<{
    text: string;
    usage: ReturnType<typeof emptyUsage>;
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
  usage: ReturnType<typeof emptyUsage>;
} {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { text: "", usage: emptyUsage() };
  }
  let envelope: GeminiJsonEnvelope;
  try {
    envelope = JSON.parse(trimmed) as GeminiJsonEnvelope;
  } catch {
    // If the CLI emitted something other than a single JSON object
    // (e.g. plain text output because the --output-format flag was
    // ignored in a CLI version we haven't pinned against), fall back
    // to surfacing the raw stdout as the response so the workflow
    // can still do something useful with it.
    return { text: trimmed, usage: emptyUsage() };
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
  const inputTokens =
    tokens?.input ?? tokens?.promptTokenCount ?? 0;
  const outputTokens =
    tokens?.output ?? tokens?.candidatesTokenCount ?? 0;
  const totalTokens =
    tokens?.total ?? tokens?.totalTokenCount ?? inputTokens + outputTokens;

  return {
    text,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      input_token_details: { cache_creation: 0, cache_read: 0 },
    },
  };
}

function emptyUsage() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    input_token_details: { cache_creation: 0, cache_read: 0 },
  };
}

/** Build a single prompt string from a LangChain message list. Gemini CLI
 *  has no separate --system-prompt flag, so system messages prefix the
 *  prompt under an explicit heading; subsequent user/assistant/tool turns
 *  are joined with role labels (first non-system human turn unlabelled
 *  for clean single-turn prompts). */
export function formatMessages(messages: BaseMessage[]): string {
  const systemParts: string[] = [];
  const turns: string[] = [];
  let turnIndex = 0;
  for (const msg of messages) {
    const text = messageText(msg);
    if (!text) continue;
    if (msg instanceof SystemMessage) {
      systemParts.push(text);
    } else if (msg instanceof HumanMessage) {
      turns.push(turnIndex === 0 ? text : `User:\n${text}`);
      turnIndex++;
    } else if (msg instanceof AIMessage) {
      turns.push(`Assistant:\n${text}`);
      turnIndex++;
    } else if (msg instanceof ToolMessage) {
      turns.push(`Tool result:\n${text}`);
      turnIndex++;
    }
  }
  const body = turns.join("\n\n");
  if (systemParts.length === 0) return body;
  const system = systemParts.join("\n\n");
  return `System instructions:\n${system}\n\n---\n\n${body}`;
}

function messageText(msg: BaseMessage): string {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((c) => {
        if (typeof c === "string") return c;
        if (typeof c === "object" && c !== null) {
          const co = c as { type?: string; text?: string };
          if (co.type === "text" && typeof co.text === "string") return co.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

// Exported for tests.
export { formatMessages as _formatMessages };
