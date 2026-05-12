import { describe, expect, it } from "vitest";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { _formatMessages } from "./copilot-via-cli.js";

describe("formatMessages → copilot -p argument", () => {
  it("inlines a single system message under a heading because copilot-cli has no --system-prompt flag", () => {
    const out = _formatMessages([
      new SystemMessage("Be terse."),
      new HumanMessage("List three primes."),
    ]);
    expect(out).toBe(
      "System instructions:\nBe terse.\n\n---\n\nList three primes.",
    );
  });

  it("joins multiple system messages with a blank line before the divider", () => {
    const out = _formatMessages([
      new SystemMessage("Be terse."),
      new SystemMessage("Reply in JSON."),
      new HumanMessage("Go."),
    ]);
    expect(out).toBe(
      "System instructions:\nBe terse.\n\nReply in JSON.\n\n---\n\nGo.",
    );
  });

  it("omits the system heading entirely when no system messages are present", () => {
    const out = _formatMessages([new HumanMessage("just ask")]);
    expect(out).toBe("just ask");
  });

  it("formats multi-turn chat history with role labels except for the very first turn", () => {
    const out = _formatMessages([
      new HumanMessage("First."),
      new AIMessage("OK."),
      new HumanMessage("Second."),
    ]);
    expect(out).toBe("First.\n\nAssistant:\nOK.\n\nUser:\nSecond.");
  });

  it("renders tool-message results so chat-with-tools workflows can reuse the adapter", () => {
    const out = _formatMessages([
      new HumanMessage("Read the file."),
      new AIMessage("Calling tool."),
      new ToolMessage({ tool_call_id: "1", content: "file contents" }),
    ]);
    expect(out).toBe(
      "Read the file.\n\nAssistant:\nCalling tool.\n\nTool result:\nfile contents",
    );
  });

  it("skips empty messages so a blank assistant chunk in history doesn't leave a stray `Assistant:` label", () => {
    const out = _formatMessages([
      new HumanMessage("hi"),
      new AIMessage(""),
      new HumanMessage("again"),
    ]);
    expect(out).toBe("hi\n\nUser:\nagain");
  });
});
