import { describe, expect, it } from "vitest";
import { extractNotesTaskItems } from "@/lib/tiptapTasks";

function doc(taskText: object) {
  return JSON.stringify({
    type: "doc",
    content: [
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: false },
            content: [
              { type: "paragraph", content: [taskText].flat() as object[] },
            ],
          },
        ],
      },
    ],
  });
}

describe("extractNotesTaskItems", () => {
  it("returns an empty list for null/empty input", () => {
    expect(extractNotesTaskItems(null)).toEqual([]);
    expect(extractNotesTaskItems("")).toEqual([]);
  });

  it("returns an empty list for non-doc JSON", () => {
    expect(extractNotesTaskItems(JSON.stringify({ foo: "bar" }))).toEqual([]);
  });

  it("extracts plain task text", () => {
    const json = doc({ type: "text", text: "Ship the release" });
    expect(extractNotesTaskItems(json)).toEqual([
      { path: [0, 0], checked: false, text: "Ship the release" },
    ]);
  });

  it("renders a mention as @<label>", () => {
    const json = doc([
      { type: "mention", attrs: { id: "alice", label: "Alice" } },
      { type: "text", text: " can you review?" },
    ]);
    expect(extractNotesTaskItems(json)[0].text).toBe("@Alice can you review?");
  });

  it("handles a task that is just a mention", () => {
    const json = doc({ type: "mention", attrs: { id: "bob", label: "Bob" } });
    expect(extractNotesTaskItems(json)[0].text).toBe("@Bob");
  });

  it("renders multiple mentions in one task", () => {
    const json = doc([
      { type: "text", text: "Sync between " },
      { type: "mention", attrs: { id: "a", label: "Alice" } },
      { type: "text", text: " and " },
      { type: "mention", attrs: { id: "b", label: "Bob" } },
    ]);
    expect(extractNotesTaskItems(json)[0].text).toBe(
      "Sync between @Alice and @Bob",
    );
  });

  it("falls back to empty string when a mention has no label", () => {
    const json = doc([
      { type: "text", text: "Ask " },
      { type: "mention", attrs: { id: "x" } },
      { type: "text", text: " for help" },
    ]);
    expect(extractNotesTaskItems(json)[0].text).toBe("Ask  for help");
  });
});
