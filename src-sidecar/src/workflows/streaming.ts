// Shared streaming helpers for one-shot text-returning workflows.
//
// Wraps `model.stream()` so workflows that previously called
// `model.invoke()` can produce the same final string while emitting
// each delta as a `StreamEvent` on the way through.

import type { ChatMessage, ChatModel } from "../models/types.js";
import { parsePartialJson } from "../lib/partial-json.js";
import type { OutboundEvent } from "../protocol.js";

const PARTIAL_FLUSH_MS = 80;

export interface StreamLLMTextResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Stream a chat-model response, forwarding each text delta as a
 * `StreamEvent` while accumulating the full reply for the caller. When
 * `emit` / `workflowId` / `nodeName` are absent the helper still streams
 * (so we get the final usage off the terminal frame) but does not
 * forward deltas — useful for tests.
 */
export async function streamLLMText(args: {
  llm: ChatModel;
  messages: ChatMessage[];
  emit?: (event: OutboundEvent) => void;
  workflowId?: string;
  nodeName?: string;
  signal?: AbortSignal;
}): Promise<StreamLLMTextResult> {
  const { llm, messages, emit, workflowId, nodeName, signal } = args;

  let text = "";
  let usage = { inputTokens: 0, outputTokens: 0 };
  let lastUsageEmitAt = 0;
  let lastEmittedInput = -1;
  let lastEmittedOutput = -1;

  const maybeEmitUsage = () => {
    if (!emit || !workflowId || !nodeName) return;
    if (
      usage.inputTokens === lastEmittedInput &&
      usage.outputTokens === lastEmittedOutput
    ) {
      return;
    }
    const now = Date.now();
    if (now - lastUsageEmitAt < PARTIAL_FLUSH_MS) return;
    lastUsageEmitAt = now;
    lastEmittedInput = usage.inputTokens;
    lastEmittedOutput = usage.outputTokens;
    emit({
      id: workflowId,
      type: "progress",
      node: nodeName,
      status: "started",
      data: { usagePartial: { ...usage } },
    });
  };

  for await (const chunk of llm.stream(messages, signal ? { signal } : undefined)) {
    if (chunk.text) {
      text += chunk.text;
      if (emit && workflowId && nodeName) {
        emit({ id: workflowId, type: "stream", node: nodeName, delta: chunk.text });
      }
    }
    if (chunk.usage) {
      usage = {
        inputTokens: chunk.usage.inputTokens,
        outputTokens: chunk.usage.outputTokens,
      };
      maybeEmitUsage();
    }
  }

  return { text, usage };
}

export interface StreamLLMJsonResult {
  /** Final concatenated raw text — caller is responsible for validating
   *  it against a schema (Zod) once streaming completes. */
  raw: string;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Stream a chat-model response that produces a JSON document, emitting
 * incremental partial-parsed objects as `progress` events while the
 * tokens arrive. The deepest valid partial parse is sent on each flush.
 *
 * `cleanText` is run on the accumulated raw text before parsePartialJson —
 * use it to strip code fences or sanitise common model glitches.
 */
export async function streamLLMJson(args: {
  llm: ChatModel;
  messages: ChatMessage[];
  emit?: (event: OutboundEvent) => void;
  workflowId?: string;
  nodeName?: string;
  cleanText?: (raw: string) => string;
  signal?: AbortSignal;
}): Promise<StreamLLMJsonResult> {
  const { llm, messages, emit, workflowId, nodeName, cleanText, signal } = args;

  let raw = "";
  let usage = { inputTokens: 0, outputTokens: 0 };
  let lastFlushAt = 0;
  let lastEmittedSize = -1;
  let lastUsageEmitAt = 0;
  let lastEmittedInput = -1;
  let lastEmittedOutput = -1;

  const tryFlush = (force: boolean) => {
    if (!emit || !workflowId || !nodeName) return;
    const now = Date.now();
    if (!force && now - lastFlushAt < PARTIAL_FLUSH_MS) return;

    const cleaned = cleanText ? cleanText(raw) : raw;
    if (cleaned.length === lastEmittedSize) return;

    const partial = parsePartialJson(cleaned);
    if (partial == null) return;

    lastFlushAt = now;
    lastEmittedSize = cleaned.length;
    emit({
      id: workflowId,
      type: "progress",
      node: nodeName,
      status: "started",
      data: { partial },
    });
  };

  const maybeEmitUsage = () => {
    if (!emit || !workflowId || !nodeName) return;
    if (
      usage.inputTokens === lastEmittedInput &&
      usage.outputTokens === lastEmittedOutput
    ) {
      return;
    }
    const now = Date.now();
    if (now - lastUsageEmitAt < PARTIAL_FLUSH_MS) return;
    lastUsageEmitAt = now;
    lastEmittedInput = usage.inputTokens;
    lastEmittedOutput = usage.outputTokens;
    emit({
      id: workflowId,
      type: "progress",
      node: nodeName,
      status: "started",
      data: { usagePartial: { ...usage } },
    });
  };

  for await (const chunk of llm.stream(messages, signal ? { signal } : undefined)) {
    if (chunk.text) {
      raw += chunk.text;
      tryFlush(false);
    }
    if (chunk.usage) {
      usage = {
        inputTokens: chunk.usage.inputTokens,
        outputTokens: chunk.usage.outputTokens,
      };
      maybeEmitUsage();
    }
  }
  tryFlush(true);

  return { raw, usage };
}
