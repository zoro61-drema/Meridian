import { describe, expect, it } from "vitest";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { _formatMessages } from "./anthropic-via-claude-code.js";

describe("formatMessages → claude -p arguments", () => {
  it("collapses system messages into --system-prompt and leaves the first user turn unlabelled", () => {
    const out = _formatMessages([
      new SystemMessage("Be terse."),
      new HumanMessage("List three primes."),
    ]);
    expect(out.systemPrompt).toBe("Be terse.");
    expect(out.userPrompt).toBe("List three primes.");
  });

  it("joins multiple system messages with a blank line so the CLI sees one coherent system prompt", () => {
    const out = _formatMessages([
      new SystemMessage("Be terse."),
      new SystemMessage("Reply in JSON."),
      new HumanMessage("Go."),
    ]);
    expect(out.systemPrompt).toBe("Be terse.\n\nReply in JSON.");
  });

  it("formats multi-turn chat history with role labels except for the very first turn", () => {
    const out = _formatMessages([
      new SystemMessage("Be terse."),
      new HumanMessage("First."),
      new AIMessage("OK."),
      new HumanMessage("Second."),
    ]);
    expect(out.userPrompt).toBe("First.\n\nAssistant:\nOK.\n\nUser:\nSecond.");
  });

  it("renders tool-message results so chat-with-tools workflows can reuse the adapter", () => {
    const out = _formatMessages([
      new HumanMessage("Read the file."),
      new AIMessage("Calling tool."),
      new ToolMessage({ tool_call_id: "1", content: "file contents" }),
    ]);
    expect(out.userPrompt).toBe(
      "Read the file.\n\nAssistant:\nCalling tool.\n\nTool result:\nfile contents",
    );
  });

  it("extracts text from structured message content arrays — Anthropic sometimes returns AIMessage.content as [{type:'text',text:'…'}]", () => {
    const ai = new AIMessage({
      content: [{ type: "text", text: "structured reply" }],
    });
    const out = _formatMessages([new HumanMessage("hi"), ai]);
    expect(out.userPrompt).toBe("hi\n\nAssistant:\nstructured reply");
  });

  it("skips empty messages so a blank assistant chunk in history doesn't leave a stray `Assistant:` label", () => {
    const out = _formatMessages([
      new HumanMessage("hi"),
      new AIMessage(""),
      new HumanMessage("again"),
    ]);
    expect(out.userPrompt).toBe("hi\n\nUser:\nagain");
  });
});
