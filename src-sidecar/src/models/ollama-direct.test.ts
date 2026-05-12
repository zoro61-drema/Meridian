import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./types.js";
import { _formatMessages, readNdjson } from "./ollama-direct.js";

const sys = (content: string): ChatMessage => ({ role: "system", content });
const user = (content: string): ChatMessage => ({ role: "user", content });
const ai = (content: string): ChatMessage => ({ role: "assistant", content });
const tool = (content: string): ChatMessage => ({ role: "tool", content });

describe("formatMessages → Ollama /api/chat messages", () => {
  it("emits role-preserving {role, content} records in order", () => {
    const out = _formatMessages([sys("Be terse."), user("hi"), ai("hello"), user("again")]);
    expect(out).toEqual([
      { role: "system", content: "Be terse." },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "again" },
    ]);
  });

  it("preserves multiple system messages as separate entries so the server sees each one", () => {
    const out = _formatMessages([sys("A"), sys("B"), user("go")]);
    expect(out).toEqual([
      { role: "system", content: "A" },
      { role: "system", content: "B" },
      { role: "user", content: "go" },
    ]);
  });

  it("maps tool role straight through — Ollama accepts a tool role natively", () => {
    const out = _formatMessages([user("read"), ai("calling tool"), tool("file data")]);
    expect(out[2]).toEqual({ role: "tool", content: "file data" });
  });

  it("skips empty content so blank turns don't reach the server", () => {
    const out = _formatMessages([user("hi"), ai(""), user("again")]);
    expect(out).toEqual([
      { role: "user", content: "hi" },
      { role: "user", content: "again" },
    ]);
  });
});

describe("readNdjson — NDJSON streaming parser", () => {
  function makeStream(parts: string[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        for (const p of parts) {
          controller.enqueue(new TextEncoder().encode(p));
        }
        controller.close();
      },
    });
  }

  it("parses complete lines split arbitrarily across chunks", async () => {
    const stream = makeStream([
      '{"message":{"content":"hel',
      'lo"},"done":false}\n{"messa',
      'ge":{"content":" world"},"done":true,"prompt_eval_count":4,"eval_count":2}\n',
    ]);
    const events = [];
    for await (const ev of readNdjson(stream)) {
      events.push(ev);
    }
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ message: { content: "hello" }, done: false });
    expect(events[1]).toEqual({
      message: { content: " world" },
      done: true,
      prompt_eval_count: 4,
      eval_count: 2,
    });
  });

  it("flushes trailing data without a terminating newline", async () => {
    const stream = makeStream(['{"message":{"content":"x"},"done":true}']);
    const events = [];
    for await (const ev of readNdjson(stream)) {
      events.push(ev);
    }
    expect(events).toEqual([{ message: { content: "x" }, done: true }]);
  });

  it("skips malformed lines so a partial frame mid-stream doesn't poison subsequent parses", async () => {
    const stream = makeStream(["not-json\n", '{"message":{"content":"ok"},"done":true}\n']);
    const events = [];
    for await (const ev of readNdjson(stream)) {
      events.push(ev);
    }
    expect(events).toEqual([{ message: { content: "ok" }, done: true }]);
  });
});
