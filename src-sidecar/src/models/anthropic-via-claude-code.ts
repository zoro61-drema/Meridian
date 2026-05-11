// LangChain BaseChatModel that delegates to the locally-installed Claude
// Code CLI (`claude -p`) instead of authenticating against Anthropic
// directly.
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
//   1. Convert LangChain messages → (system prompt, conversation text).
//      System messages collapse into `--system-prompt`; the remaining
//      turns are formatted with role labels and passed as the `-p`
//      argument. This is robust across one-shot and multi-turn workflows
//      because Meridian's chat workflows already send full history as a
//      message array each call (no session resumption needed).
//   2. Spawn `claude -p "<prompt>" --output-format stream-json --verbose
//      --include-partial-messages --model <id> [--system-prompt <s>]`.
//   3. Parse NDJSON from stdout line-by-line. Text deltas come from
//      `stream_event` events with a `content_block_delta` payload; the
//      final `result` event carries usage totals.
//   4. Wait for process exit; non-zero exit code with stderr → throw.
//
// Tool calling: not supported by `claude -p` from the embedder side —
// the CLI exposes its built-in tools (Read/Glob/Grep/Bash/Write) but
// won't accept ad-hoc tool definitions. Meridian's surviving workflows
// either don't bind tools (pr_review, grooming, sprint_*, meetings) or
// rely on the CLI's native tools via cwd sandboxing. The two chat
// workflows that DO bind tools (pr_review_chat, grooming_chat) route
// through Ollama when the user picks that provider — those paths still
// have the LangGraph tool loop wired.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
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

export interface ClaudeCodeChatModelInput extends BaseChatModelParams {
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
}

/** Sub-set of the events `claude -p --output-format stream-json` emits.
 *  See https://code.claude.com/docs/en/headless#stream-json-output. */
interface StreamEvent {
  type: string;
  subtype?: string;
  // `stream_event` carries content-block deltas
  event?: {
    type?: string;
    delta?: { type?: string; text?: string };
  };
  // `result` carries final usage
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  // `result` also carries the final assistant text for non-streaming consumers
  result?: string;
  is_error?: boolean;
}

export class ClaudeCodeChatModel extends BaseChatModel {
  private model: string;
  private claudeBinary: string;

  constructor(input: ClaudeCodeChatModelInput) {
    super(input);
    this.model = input.model;
    // input.maxTokens is intentionally ignored — `claude -p` doesn't
    // expose a max-output-tokens flag. Kept on the interface so the
    // factory can pass the user's preference through without conditionals.
    this.claudeBinary = input.claudeBinary ?? "claude";
  }

  _llmType(): string {
    return "claude-code-cli";
  }

  async _generate(
    messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    let text = "";
    let usage = emptyUsage();
    for await (const chunk of this.runCli(messages)) {
      if (chunk.kind === "delta") {
        text += chunk.text;
        await runManager?.handleLLMNewToken(chunk.text);
      } else {
        usage = chunk.usage;
      }
    }
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
    let usage = emptyUsage();
    for await (const chunk of this.runCli(messages)) {
      if (chunk.kind === "delta") {
        await runManager?.handleLLMNewToken(chunk.text);
        yield new ChatGenerationChunk({
          text: chunk.text,
          message: new AIMessageChunk({ content: chunk.text }),
        });
      } else {
        usage = chunk.usage;
      }
    }
    // Emit a final empty chunk carrying usage so the workflow's usage
    // accumulator picks it up — the LangChain streaming protocol routes
    // usage through `usage_metadata` on a terminal chunk, not via
    // llmOutput on a non-streaming response.
    yield new ChatGenerationChunk({
      text: "",
      message: new AIMessageChunk({
        content: "",
        usage_metadata: usage,
      }),
    });
  }

  /** Spawn the CLI and yield text deltas + a final usage record. */
  private async *runCli(
    messages: BaseMessage[],
  ): AsyncGenerator<
    | { kind: "delta"; text: string }
    | { kind: "usage"; usage: ReturnType<typeof emptyUsage> }
  > {
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
    });

    const stderrChunks: Buffer[] = [];
    proc.stderr.on("data", (c: Buffer) => stderrChunks.push(c));

    let spawnError: Error | null = null;
    proc.once("error", (err: Error) => {
      // ENOENT etc. — caller surfaces it.
      spawnError = err;
    });

    const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
    let lastUsage = emptyUsage();

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

        // Partial text deltas during streaming
        if (ev.type === "stream_event" && ev.event?.type === "content_block_delta") {
          const delta = ev.event.delta;
          if (delta?.type === "text_delta" && typeof delta.text === "string") {
            yield { kind: "delta", text: delta.text };
          }
        }

        // Final result event with usage totals
        if (ev.type === "result") {
          if (ev.is_error) {
            const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
            throw new Error(
              `Claude Code CLI reported an error result${stderr ? `: ${stderr}` : ""}`,
            );
          }
          if (ev.usage) {
            lastUsage = {
              input_tokens:
                (ev.usage.input_tokens ?? 0) +
                (ev.usage.cache_creation_input_tokens ?? 0) +
                (ev.usage.cache_read_input_tokens ?? 0),
              output_tokens: ev.usage.output_tokens ?? 0,
              total_tokens:
                (ev.usage.input_tokens ?? 0) +
                (ev.usage.cache_creation_input_tokens ?? 0) +
                (ev.usage.cache_read_input_tokens ?? 0) +
                (ev.usage.output_tokens ?? 0),
              input_token_details: {
                cache_creation: ev.usage.cache_creation_input_tokens ?? 0,
                cache_read: ev.usage.cache_read_input_tokens ?? 0,
              },
            };
          }
        }
      }
    } finally {
      // Wait for the process to finish so we can surface a non-zero exit
      // code as an error rather than swallow it.
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

    yield { kind: "usage", usage: lastUsage };
  }
}

function emptyUsage() {
  return {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    input_token_details: {
      cache_creation: 0,
      cache_read: 0,
    },
  };
}

/** Convert a LangChain message list into a system-prompt string + a single
 *  prompt-text string suitable for `claude -p`. System messages collapse
 *  into `--system-prompt`; user/assistant/tool turns become role-labelled
 *  paragraphs in the main prompt, in chronological order, ending with
 *  the latest message. */
function formatMessages(messages: BaseMessage[]): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemParts: string[] = [];
  const turns: string[] = [];
  let turnIndex = 0;
  for (const msg of messages) {
    const text = messageText(msg);
    if (!text) continue;
    if (msg instanceof SystemMessage) {
      systemParts.push(text);
    } else if (msg instanceof HumanMessage) {
      // First non-system human message stands alone (no `User:` prefix)
      // so single-turn workflows produce a clean prompt without a leading
      // role label. Subsequent turns (multi-turn chat) get labelled.
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
  return {
    systemPrompt: systemParts.join("\n\n"),
    userPrompt: turns.join("\n\n"),
  };
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
