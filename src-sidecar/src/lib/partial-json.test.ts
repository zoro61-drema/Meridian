import { describe, expect, it } from "vitest";
import { parsePartialJson } from "./partial-json.js";

describe("parsePartialJson — recovers parseable JSON from a streaming prefix", () => {
  it("returns the value when the input is already complete JSON", () => {
    expect(parsePartialJson('{"a":1,"b":[2,3]}')).toEqual({ a: 1, b: [2, 3] });
  });

  it("closes a partially-streamed object", () => {
    expect(parsePartialJson('{"a":1,"b":')).toEqual({ a: 1 });
  });

  it("closes a partially-streamed array of objects, dropping the trailing incomplete element", () => {
    expect(parsePartialJson('[{"id":1},{"id":2},{"id":')).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
  });

  it("closes a partially-streamed string by appending the missing quote and container terminators", () => {
    expect(parsePartialJson('{"summary":"the model is still typi')).toEqual({
      summary: "the model is still typi",
    });
  });

  it("returns null when nothing parseable has streamed yet", () => {
    expect(parsePartialJson("")).toBeNull();
    expect(parsePartialJson("   ")).toBeNull();
  });

  it("returns null for input that can't be repaired even by closing", () => {
    expect(parsePartialJson("nonsense")).toBeNull();
  });

  it("handles escaped quotes inside strings so they don't close the string prematurely", () => {
    expect(parsePartialJson('{"q":"she said \\"hi\\"","tail":')).toEqual({
      q: 'she said "hi"',
    });
  });

  it("drops a pending object key whose value never landed", () => {
    expect(parsePartialJson('{"done":true,"summary":')).toEqual({ done: true });
  });

  it("recovers a nested partial — outer object with a partial inner array", () => {
    expect(
      parsePartialJson('{"lenses":{"security":{"findings":[{"title":"X"'),
    ).toEqual({
      lenses: {
        security: {
          findings: [{ title: "X" }],
        },
      },
    });
  });
});
