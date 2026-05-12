import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./types.js";
import { _formatMessages, parseGeminiOutput } from "./gemini-via-cli.js";

const sys = (content: string): ChatMessage => ({ role: "system", content });
const user = (content: string): ChatMessage => ({ role: "user", content });
const ai = (content: string): ChatMessage => ({ role: "assistant", content });
const tool = (content: string): ChatMessage => ({ role: "tool", content });

describe("formatMessages → gemini -p argument", () => {
  it("inlines a single system message under a heading because gemini-cli has no --system-prompt flag", () => {
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

  it("renders tool-message results so future chat-with-tools workflows can reuse the adapter", () => {
    const out = _formatMessages([user("Read the file."), ai("Calling tool."), tool("file contents")]);
    expect(out).toBe(
      "Read the file.\n\nAssistant:\nCalling tool.\n\nTool result:\nfile contents",
    );
  });
});

describe("parseGeminiOutput → response + usage extraction", () => {
  it("pulls response text and OpenAI-style token counts off a well-formed envelope", () => {
    const out = parseGeminiOutput(
      JSON.stringify({
        response: "hello world",
        stats: { tokens: { input: 12, output: 4, total: 16 } },
      }),
    );
    expect(out.text).toBe("hello world");
    expect(out.usage.inputTokens).toBe(12);
    expect(out.usage.outputTokens).toBe(4);
  });

  it("falls back to GenAI-style token fields (promptTokenCount / candidatesTokenCount) when the OpenAI-style fields are absent — covers a CLI version that swaps which dialect it emits", () => {
    const out = parseGeminiOutput(
      JSON.stringify({
        response: "hi",
        stats: {
          tokens: {
            promptTokenCount: 7,
            candidatesTokenCount: 2,
            totalTokenCount: 9,
          },
        },
      }),
    );
    expect(out.usage.inputTokens).toBe(7);
    expect(out.usage.outputTokens).toBe(2);
  });

  it("returns an empty result for empty stdout so workflows handling streaming-style no-output cases don't crash on JSON.parse", () => {
    const out = parseGeminiOutput("");
    expect(out.text).toBe("");
    expect(out.usage.inputTokens).toBe(0);
  });

  it("falls back to raw stdout as the response text when stdout isn't valid JSON — survives a CLI version that ignores --output-format json", () => {
    const out = parseGeminiOutput("plain text from the CLI");
    expect(out.text).toBe("plain text from the CLI");
    expect(out.usage.inputTokens).toBe(0);
  });

  it("throws when the envelope carries an error message so workflows surface failures rather than silently returning empty text", () => {
    expect(() =>
      parseGeminiOutput(
        JSON.stringify({
          error: { message: "quota exceeded for free tier" },
        }),
      ),
    ).toThrow(/quota exceeded/);
  });

  it("handles string-shaped error payloads too — some CLI versions ship error as a flat string", () => {
    expect(() =>
      parseGeminiOutput(JSON.stringify({ error: "API key invalid" })),
    ).toThrow(/API key invalid/);
  });
});
