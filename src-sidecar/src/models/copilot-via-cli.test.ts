import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./types.js";
import { _formatMessages } from "./copilot-via-cli.js";

const sys = (content: string): ChatMessage => ({ role: "system", content });
const user = (content: string): ChatMessage => ({ role: "user", content });
const ai = (content: string): ChatMessage => ({ role: "assistant", content });
const tool = (content: string): ChatMessage => ({ role: "tool", content });

describe("formatMessages → copilot -p argument", () => {
  it("inlines a single system message under a heading because copilot-cli has no --system-prompt flag", () => {
    const out = _formatMessages([sys("Be terse."), user("List three primes.")]);
    expect(out).toBe("System instructions:\nBe terse.\n\n---\n\nList three primes.");
  });

  it("joins multiple system messages with a blank line before the divider", () => {
    const out = _formatMessages([sys("Be terse."), sys("Reply in JSON."), user("Go.")]);
    expect(out).toBe("System instructions:\nBe terse.\n\nReply in JSON.\n\n---\n\nGo.");
  });

  it("omits the system heading entirely when no system messages are present", () => {
    const out = _formatMessages([user("just ask")]);
    expect(out).toBe("just ask");
  });

  it("formats multi-turn chat history with role labels except for the very first turn", () => {
    const out = _formatMessages([user("First."), ai("OK."), user("Second.")]);
    expect(out).toBe("First.\n\nAssistant:\nOK.\n\nUser:\nSecond.");
  });

  it("renders tool-message results so chat-with-tools workflows can reuse the adapter", () => {
    const out = _formatMessages([user("Read the file."), ai("Calling tool."), tool("file contents")]);
    expect(out).toBe(
      "Read the file.\n\nAssistant:\nCalling tool.\n\nTool result:\nfile contents",
    );
  });

  it("skips empty messages so a blank assistant chunk doesn't leave a stray Assistant label", () => {
    const out = _formatMessages([user("hi"), ai(""), user("again")]);
    expect(out).toBe("hi\n\nUser:\nagain");
  });
});
