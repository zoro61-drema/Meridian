import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./types.js";
import { _formatMessages } from "./google-direct.js";

const sys = (content: string): ChatMessage => ({ role: "system", content });
const user = (content: string): ChatMessage => ({ role: "user", content });
const ai = (content: string): ChatMessage => ({ role: "assistant", content });
const tool = (content: string): ChatMessage => ({ role: "tool", content });

describe("formatMessages → Gemini API contents + systemInstruction", () => {
  it("collapses system messages into systemInstruction", () => {
    const out = _formatMessages([sys("Be terse."), user("List three primes.")]);
    expect(out.systemInstruction).toBe("Be terse.");
    expect(out.contents).toEqual([
      { role: "user", parts: [{ text: "List three primes." }] },
    ]);
  });

  it("joins multiple system messages with a blank line", () => {
    const out = _formatMessages([sys("Be terse."), sys("Reply in JSON."), user("Go.")]);
    expect(out.systemInstruction).toBe("Be terse.\n\nReply in JSON.");
  });

  it("uses 'model' role for assistant messages — Gemini doesn't have an 'assistant' role", () => {
    const out = _formatMessages([user("First."), ai("OK."), user("Second.")]);
    expect(out.contents).toEqual([
      { role: "user", parts: [{ text: "First." }] },
      { role: "model", parts: [{ text: "OK." }] },
      { role: "user", parts: [{ text: "Second." }] },
    ]);
  });

  it("renders tool-message results as user-role turns since Gemini has no separate tool role for replayed history", () => {
    const out = _formatMessages([user("Read."), ai("Calling."), tool("data")]);
    expect(out.contents[2]).toEqual({
      role: "user",
      parts: [{ text: "Tool result:\ndata" }],
    });
  });

  it("skips empty messages so a blank assistant chunk doesn't leave a stray empty 'model' turn", () => {
    const out = _formatMessages([user("hi"), ai(""), user("again")]);
    expect(out.contents).toEqual([
      { role: "user", parts: [{ text: "hi" }] },
      { role: "user", parts: [{ text: "again" }] },
    ]);
  });
});
