import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./types.js";
import { _formatMessages } from "./anthropic-direct.js";

const sys = (content: string): ChatMessage => ({ role: "system", content });
const user = (content: string): ChatMessage => ({ role: "user", content });
const ai = (content: string): ChatMessage => ({ role: "assistant", content });
const tool = (content: string): ChatMessage => ({ role: "tool", content });

describe("formatMessages → Anthropic Messages API params", () => {
  it("collapses system messages into the top-level system field", () => {
    const out = _formatMessages([sys("Be terse."), user("List three primes.")]);
    expect(out.system).toBe("Be terse.");
    expect(out.body).toEqual([{ role: "user", content: "List three primes." }]);
  });

  it("joins multiple system messages with a blank line so the API sees one coherent system prompt", () => {
    const out = _formatMessages([
      sys("Be terse."),
      sys("Reply in JSON."),
      user("Go."),
    ]);
    expect(out.system).toBe("Be terse.\n\nReply in JSON.");
  });

  it("maps user/assistant turns to Anthropic message-param roles in order", () => {
    const out = _formatMessages([user("First."), ai("OK."), user("Second.")]);
    expect(out.body).toEqual([
      { role: "user", content: "First." },
      { role: "assistant", content: "OK." },
      { role: "user", content: "Second." },
    ]);
  });

  it("renders tool-message results as user-role turns prefixed with a 'Tool result:' label — Anthropic's API has no 'tool' role for replayed history", () => {
    const out = _formatMessages([
      user("Read the file."),
      ai("Calling tool."),
      tool("file contents"),
    ]);
    expect(out.body).toEqual([
      { role: "user", content: "Read the file." },
      { role: "assistant", content: "Calling tool." },
      { role: "user", content: "Tool result:\nfile contents" },
    ]);
  });
});
