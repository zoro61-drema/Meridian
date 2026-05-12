import { describe, expect, it } from "vitest";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { _formatMessages } from "./anthropic-direct.js";

describe("formatMessages → Anthropic Messages API params", () => {
  it("collapses system messages into the top-level system field", () => {
    const out = _formatMessages([
      new SystemMessage("Be terse."),
      new HumanMessage("List three primes."),
    ]);
    expect(out.system).toBe("Be terse.");
    expect(out.body).toEqual([{ role: "user", content: "List three primes." }]);
  });

  it("joins multiple system messages with a blank line so the API sees one coherent system prompt", () => {
    const out = _formatMessages([
      new SystemMessage("Be terse."),
      new SystemMessage("Reply in JSON."),
      new HumanMessage("Go."),
    ]);
    expect(out.system).toBe("Be terse.\n\nReply in JSON.");
  });

  it("maps user/assistant turns to Anthropic message-param roles in order", () => {
    const out = _formatMessages([
      new HumanMessage("First."),
      new AIMessage("OK."),
      new HumanMessage("Second."),
    ]);
    expect(out.body).toEqual([
      { role: "user", content: "First." },
      { role: "assistant", content: "OK." },
      { role: "user", content: "Second." },
    ]);
  });

  it("renders tool-message results as user-role turns prefixed with a 'Tool result:' label — Anthropic's API has no 'tool' role for replayed history", () => {
    const out = _formatMessages([
      new HumanMessage("Read the file."),
      new AIMessage("Calling tool."),
      new ToolMessage({ tool_call_id: "1", content: "file contents" }),
    ]);
    expect(out.body).toEqual([
      { role: "user", content: "Read the file." },
      { role: "assistant", content: "Calling tool." },
      { role: "user", content: "Tool result:\nfile contents" },
    ]);
  });

  it("extracts text from structured AIMessage.content arrays — Anthropic sometimes returns [{type:'text',text:'…'}]", () => {
    const ai = new AIMessage({
      content: [{ type: "text", text: "structured reply" }],
    });
    const out = _formatMessages([new HumanMessage("hi"), ai]);
    expect(out.body[1]).toEqual({ role: "assistant", content: "structured reply" });
  });
});
