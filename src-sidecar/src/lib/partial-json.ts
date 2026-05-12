// Best-effort parser for incomplete JSON streams. Used by workflows that
// stream a JSON response and want to render partial results as they come
// in (PR Review's lens-by-lens fill-in, Grooming's progressive list of
// edits). Replaces `parsePartialJson` from `@langchain/core/output_parsers`
// with a small hand-rolled equivalent.
//
// Contract: returns the parsed JSON value if a sensible prefix of the
// input can be completed by appending closers (`"`, `]`, `}`); returns
// null when nothing parseable has streamed yet.
//
// Strategy: walk the input recording "checkpoints" — positions where the
// stream could be closed off into valid JSON (after a complete value, or
// after a closer). At end, try each checkpoint from most-recent to
// oldest until one parses. This naturally handles partial strings,
// dangling `"key":` pairs, half-typed primitives, and trailing commas:
// the checkpoint immediately *before* the dangling token always parses,
// so we fall through to it.

type Container = "{" | "[";

interface Checkpoint {
  /** Position in input — slice [0, pos) is the candidate body. */
  pos: number;
  /** Snapshot of the container stack at this position (deepest last). */
  stack: Container[];
}

function buildCandidates(input: string): string[] {
  const stack: Container[] = [];
  const checkpoints: Checkpoint[] = [{ pos: 0, stack: [] }];

  type Slot = "key" | "colon" | "value" | "comma_or_end" | "none";
  let inString = false;
  let escape = false;
  /** Inside an object: are we waiting for a key, a colon, a value, or
   *  is the next thing expected `,` / `}`? Outside an object this is
   *  irrelevant. We don't track per-array state because arrays accept
   *  any value sequence with commas. */
  let slot: Slot = "none";
  const slotStack: Slot[] = [];

  /** Position-after-a-string when that string is a value (not a key).
   *  Captured so we can checkpoint immediately on close — closing a
   *  value-string is a valid place to truncate. */
  const captureValueEnd = (pos: number) => {
    checkpoints.push({ pos, stack: [...stack] });
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        if (slot === "key") {
          // Key just closed; expect a colon next. Don't checkpoint here —
          // closing a key without a value isn't a valid truncation point.
          slot = "colon";
        } else if (slot === "value") {
          slot = "comma_or_end";
          captureValueEnd(i + 1);
        } else {
          // String in an array, or at the top level.
          captureValueEnd(i + 1);
        }
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      if (stack[stack.length - 1] === "{" && slot === "key") {
        // about to consume a key-string
      } else if (stack[stack.length - 1] === "{" && slot === "none") {
        // first key inside an object (slot was 'key' but reset to none?)
        // shouldn't happen in well-formed traversal; keep going.
      }
      continue;
    }

    if (ch === "{" || ch === "[") {
      stack.push(ch);
      slotStack.push(slot);
      slot = ch === "{" ? "key" : "none";
      continue;
    }

    if (ch === "}" || ch === "]") {
      stack.pop();
      slot = slotStack.pop() ?? "none";
      if (slot === "value") slot = "comma_or_end";
      checkpoints.push({ pos: i + 1, stack: [...stack] });
      continue;
    }

    if (ch === ":") {
      if (slot === "colon") slot = "value";
      continue;
    }

    if (ch === ",") {
      // `,` sits AFTER a complete value. Closer-based and string-close
      // checkpoints already cover most cases; literals (true/false/null/
      // numbers) don't trigger their own checkpoints, so we push one
      // explicitly at the position BEFORE the comma — that captures the
      // "literal value just finished" state for free.
      checkpoints.push({ pos: i, stack: [...stack] });
      if (stack[stack.length - 1] === "{") slot = "key";
      continue;
    }

    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
      continue;
    }

    // Bare literal char (number, true/false/null fragment). We don't
    // tokenise — JSON.parse will validate. We DO checkpoint after a
    // literal terminator (`,`, `}`, `]`, whitespace) — but the comma /
    // closer / whitespace branches already capture the position right
    // before them, so a literal followed by any terminator is already
    // covered by the checkpoint at the terminator's location.
  }

  // Build candidate strings: for each checkpoint, take slice(0, pos),
  // strip trailing whitespace/comma, and append closers for its stack.
  // De-duplicate to keep the JSON.parse attempts cheap.
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (let k = checkpoints.length - 1; k >= 0; k--) {
    const cp = checkpoints[k]!;
    const body = input.slice(0, cp.pos).replace(/[,\s]+$/, "");
    let closers = "";
    for (let j = cp.stack.length - 1; j >= 0; j--) {
      closers += cp.stack[j] === "{" ? "}" : "]";
    }
    const candidate = body + closers;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      candidates.push(candidate);
    }
  }

  return candidates;
}

export function parsePartialJson(input: string): unknown {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Fast path
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }

  // Also try: close the in-progress string at its current end (helpful
  // when the last token is a partially-streamed value-string and the
  // closer-based attempts haven't captured a checkpoint past the colon).
  const stringClosed = closeOpenString(trimmed);
  if (stringClosed !== null) {
    try {
      return JSON.parse(stringClosed);
    } catch {
      // fall through
    }
  }

  for (const candidate of buildCandidates(trimmed)) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next
    }
  }
  return null;
}

/** If the input ends inside a string, return a copy with that string
 *  closed and all open containers closed; otherwise null. Treats a
 *  string inside a "key" slot as un-closable (the `"key":` would need a
 *  value to follow) — those cases fall through to the checkpoint walker. */
function closeOpenString(input: string): string | null {
  type Slot = "key" | "colon" | "value" | "comma_or_end" | "none";
  const stack: Container[] = [];
  let inString = false;
  let escape = false;
  let slot: Slot = "none";
  const slotStack: Slot[] = [];
  let keyMode = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        keyMode = false;
        if (slot === "key") slot = "colon";
        else if (slot === "value") slot = "comma_or_end";
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      if (stack[stack.length - 1] === "{" && slot === "key") {
        keyMode = true;
      }
      continue;
    }

    if (ch === "{" || ch === "[") {
      stack.push(ch);
      slotStack.push(slot);
      slot = ch === "{" ? "key" : "none";
      continue;
    }

    if (ch === "}" || ch === "]") {
      stack.pop();
      slot = slotStack.pop() ?? "none";
      if (slot === "value") slot = "comma_or_end";
      continue;
    }

    if (ch === ":") {
      if (slot === "colon") slot = "value";
      continue;
    }

    if (ch === ",") {
      if (stack[stack.length - 1] === "{") slot = "key";
      continue;
    }
  }

  if (!inString) return null;
  if (keyMode) return null;

  let closers = '"';
  for (let j = stack.length - 1; j >= 0; j--) {
    closers += stack[j] === "{" ? "}" : "]";
  }
  return input + closers;
}
