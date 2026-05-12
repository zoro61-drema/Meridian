import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./types.js";
import { _formatMessages } from "./anthropic-via-claude-code.js";

const sys = (content: string): ChatMessage => ({ role: "system", content });
const user = (content: string): ChatMessage => ({ role: "user", content });
const ai = (content: string): ChatMessage => ({ role: "assistant", content });
const tool = (content: string): ChatMessage => ({ role: "tool", content });

describe("formatMessages → claude -p arguments", () => {
  it("collapses system messages into --system-prompt and leaves the first user turn unlabelled", () => {
    const out = _formatMessages([sys("Be terse."), user("List three primes.")]);
    expect(out.systemPrompt).toBe("Be terse.");
    expect(out.userPrompt).toBe("List three primes.");
  });

  it("joins multiple system messages with a blank line so the CLI sees one coherent system prompt", () => {
    const out = _formatMessages([sys("Be terse."), sys("Reply in JSON."), user("Go.")]);
    expect(out.systemPrompt).toBe("Be terse.\n\nReply in JSON.");
  });

  it("formats multi-turn chat history with role labels except for the very first turn", () => {
    const out = _formatMessages([sys("Be terse."), user("First."), ai("OK."), user("Second.")]);
    expect(out.userPrompt).toBe("First.\n\nAssistant:\nOK.\n\nUser:\nSecond.");
  });

  it("renders tool-message results so future chat-with-tools workflows can reuse the adapter", () => {
    const out = _formatMessages([
      user("Read the file."),
      ai("Calling tool."),
      tool("file contents"),
    ]);
    expect(out.userPrompt).toBe(
      "Read the file.\n\nAssistant:\nCalling tool.\n\nTool result:\nfile contents",
    );
  });

  it("skips empty messages so a blank assistant chunk in history doesn't leave a stray `Assistant:` label", () => {
    const out = _formatMessages([user("hi"), ai(""), user("again")]);
    expect(out.userPrompt).toBe("hi\n\nUser:\nagain");
  });
});
