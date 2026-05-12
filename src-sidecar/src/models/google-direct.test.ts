import { describe, expect, it } from "vitest";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { _formatMessages } from "./google-direct.js";

describe("formatMessages → Gemini API contents + systemInstruction", () => {
  it("collapses system messages into systemInstruction", () => {
    const out = _formatMessages([
      new SystemMessage("Be terse."),
      new HumanMessage("List three primes."),
    ]);
    expect(out.systemInstruction).toBe("Be terse.");
    expect(out.contents).toEqual([
      { role: "user", parts: [{ text: "List three primes." }] },
    ]);
  });

  it("joins multiple system messages with a blank line", () => {
    const out = _formatMessages([
      new SystemMessage("Be terse."),
      new SystemMessage("Reply in JSON."),
      new HumanMessage("Go."),
    ]);
    expect(out.systemInstruction).toBe("Be terse.\n\nReply in JSON.");
  });

  it("uses 'model' role for AIMessages — Gemini doesn't have an 'assistant' role", () => {
    const out = _formatMessages([
      new HumanMessage("First."),
      new AIMessage("OK."),
      new HumanMessage("Second."),
    ]);
    expect(out.contents).toEqual([
      { role: "user", parts: [{ text: "First." }] },
      { role: "model", parts: [{ text: "OK." }] },
      { role: "user", parts: [{ text: "Second." }] },
    ]);
  });

  it("renders tool-message results as user-role turns since Gemini has no separate tool role for replayed history", () => {
    const out = _formatMessages([
      new HumanMessage("Read."),
      new AIMessage("Calling."),
      new ToolMessage({ tool_call_id: "1", content: "data" }),
    ]);
    expect(out.contents[2]).toEqual({
      role: "user",
      parts: [{ text: "Tool result:\ndata" }],
    });
  });

  it("skips empty messages so a blank assistant chunk doesn't leave a stray empty 'model' turn", () => {
    const out = _formatMessages([
      new HumanMessage("hi"),
      new AIMessage(""),
      new HumanMessage("again"),
    ]);
    expect(out.contents).toEqual([
      { role: "user", parts: [{ text: "hi" }] },
      { role: "user", parts: [{ text: "again" }] },
    ]);
  });

  it("extracts text from structured AIMessage.content arrays", () => {
    const ai = new AIMessage({
      content: [{ type: "text", text: "structured reply" }],
    });
    const out = _formatMessages([new HumanMessage("hi"), ai]);
    expect(out.contents[1]).toEqual({
      role: "model",
      parts: [{ text: "structured reply" }],
    });
  });
});
