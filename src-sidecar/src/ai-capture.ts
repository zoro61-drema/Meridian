/**
 * AI traffic capture — opt-in developer tooling.
 *
 * When the frontend toggles the "Log AI traffic" debug switch, every
 * `workflow.start` / `workflow.resume` / `workflow.rewind` message
 * arrives with `debug: true`. The registry wraps each run inside an
 * AsyncLocalStorage scope holding the workflow id, emit channel, and
 * the live "captureEnabled" flag.
 *
 * `buildModel` wraps the constructed `ChatModel` with `wrapWithAiCapture`,
 * which proxies the model's `stream()` method: it records the request
 * messages, accumulates the response text + usage, and emits an
 * `ai_traffic` outbound event the Rust backend forwards to the
 * frontend's debug panel.
 *
 * Capture is scope-local — a single workflow run starts and ends the
 * scope. If `debug` is false on a given run, the scope is still
 * established but `captureEnabled` is false and `wrapWithAiCapture`
 * returns the inner model unchanged, keeping the steady-state hot
 * path zero-cost.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type {
  ChatMessage,
  ChatModel,
  ChatModelStreamOptions,
  ChatStreamChunk,
} from "./models/types.js";
import type { OutboundEvent } from "./protocol.js";

export interface AiCaptureCtx {
  workflowId: string;
  workflowName: string;
  emit: (e: OutboundEvent) => void;
  /** True when the inbound message asked for capture. False on
   *  ordinary runs — the scope still exists so callsites can read
   *  workflowName etc. but capture is a no-op. */
  captureEnabled: boolean;
}

const storage = new AsyncLocalStorage<AiCaptureCtx>();

export function getAiCaptureCtx(): AiCaptureCtx | undefined {
  return storage.getStore();
}

export function withAiCaptureCtx<T>(
  ctx: AiCaptureCtx,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(ctx, fn);
}

/** Wrap a ChatModel so each `stream()` call emits an `ai_traffic` event
 *  with the request messages, accumulated response, and usage totals.
 *  When no capture context is active or capture is disabled, returns
 *  the inner model unchanged. */
export function wrapWithAiCapture(
  inner: ChatModel,
  provider: string,
  model: string,
): ChatModel {
  const ctx = getAiCaptureCtx();
  if (!ctx?.captureEnabled) return inner;
  return new AiCaptureModel(inner, ctx, provider, model);
}

class AiCaptureModel implements ChatModel {
  constructor(
    private inner: ChatModel,
    private ctx: AiCaptureCtx,
    private provider: string,
    private model: string,
  ) {}

  async *stream(
    messages: ChatMessage[],
    options?: ChatModelStreamOptions,
  ): AsyncIterable<ChatStreamChunk> {
    const startedAt = Date.now();
    const requestMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let responseText = "";
    let usage = { inputTokens: 0, outputTokens: 0 };
    let errorMessage: string | undefined;

    try {
      for await (const chunk of this.inner.stream(messages, options)) {
        if (chunk.text) responseText += chunk.text;
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.inputTokens,
            outputTokens: chunk.usage.outputTokens,
          };
        }
        yield chunk;
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      this.ctx.emit({
        id: this.ctx.workflowId,
        type: "ai_traffic",
        startedAt,
        latencyMs: Date.now() - startedAt,
        provider: this.provider,
        model: this.model,
        workflow: this.ctx.workflowName,
        messages: requestMessages,
        response: responseText,
        usage,
        ...(errorMessage ? { error: errorMessage } : {}),
      });
    }
  }
}
