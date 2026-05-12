// LangChain BaseChatModel that delegates to the locally-installed GitHub
// Copilot CLI (`copilot -p`) instead of authenticating against GitHub
// directly.
//
// Background: GitHub shipped a Copilot CLI in late 2025 with a
// programmatic `-p`/`--prompt` invocation pattern that mirrors what
// `claude -p` and `gemini -p` already do — the user signs in once with
// `copilot login` (or sets GITHUB_TOKEN / COPILOT_GITHUB_TOKEN) and the
// CLI handles auth locally. Meridian never sees credentials; we just
// spawn the binary per call. This is the sanctioned headless-mode
// recipe documented by GitHub, parallel to the other two CLI adapters.
//
// Programmatic reference:
//   https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference
//
// Per-call lifecycle:
//   1. Convert LangChain messages → single prompt text. Copilot CLI has
//      no separate --system-prompt flag, so system messages are inlined
//      at the head of the prompt under an explicit heading (same shape
//      Gemini adapter uses).
//   2. Spawn `copilot -p "<prompt>" --model <id> -s --no-ask-user
//      --allow-all-tools`. The `-s/--silent` flag suppresses stats and
//      decoration so stdout is the pure agent reply — simplest stable
//      contract across CLI versions. `--no-ask-user` and
//      `--allow-all-tools` keep the run fully headless (no interactive
//      approval prompts mid-stream).
//   3. Read stdout to completion; return it as the assistant text.
//      Token usage isn't surfaced via `-s` — return zero counts. GitHub
//      Copilot is flat-rate subscription billing on the user's side,
//      so the missing per-call counters don't affect anything except
//      Meridian's debug panel, which already tolerates zero usage.
//
// CLI volatility note: GitHub removed `--headless --stdio` (the older
// programmatic interface used by `@github/copilot-sdk`) without
// deprecation in Feb 2026. The `-p`-based path used here is the
// currently sanctioned replacement, but the CLI's programmatic surface
// has demonstrably moved without notice — bump and chase if the flag
// names change again.
//
// Tool calling: not supported from the embedder side, same constraint
// as Claude/Gemini delegation. Meridian's surviving workflows either
// don't bind tools or route them through Ollama when the user picks
// that provider.

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

export interface CopilotCliChatModelInput extends BaseChatModelParams {
  /** Model id passed to `copilot --model`. Accepts vendor names the CLI
   *  recognises (`auto`, `gpt-5.2`, `claude-sonnet-4.6`, …) — Meridian
   *  doesn't validate; whatever the user picks in Settings is forwarded
   *  verbatim. */
  model: string;
  /** Unused — `copilot -p` doesn't expose a max-tokens flag. Kept on
   *  the interface so the factory can pass the user's preference
   *  through without conditionals. */
  maxTokens?: number;
  /** Path to the `copilot` binary. If absent, looks up "copilot" on
   *  PATH — fine in `tauri dev` because Rust spawns the sidecar with
   *  the user's full PATH inherited via tauri-plugin-shell. */
  copilotBinary?: string;
}

export class CopilotCliChatModel extends BaseChatModel {
  private model: string;
  private copilotBinary: string;

  constructor(input: CopilotCliChatModelInput) {
    super(input);
    this.model = input.model;
    this.copilotBinary = input.copilotBinary ?? "copilot";
  }

  _llmType(): string {
    return "copilot-cli";
  }

  async _generate(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const text = await this.runCli(messages);
    if (text) await runManager?.handleLLMNewToken(text);
    const usage = emptyUsage();
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
    const text = await this.runCli(messages);
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
        usage_metadata: emptyUsage(),
      }),
    });
  }

  private async runCli(messages: BaseMessage[]): Promise<string> {
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

function emptyUsage() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    input_token_details: { cache_creation: 0, cache_read: 0 },
  };
}

/** Build a single prompt string from a LangChain message list. Copilot
 *  CLI has no separate --system-prompt flag (same as gemini-cli), so
 *  system messages prefix the prompt under an explicit heading;
 *  subsequent user/assistant/tool turns are joined with role labels
 *  (first non-system human turn unlabelled for a clean single-turn
 *  prompt). */
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
