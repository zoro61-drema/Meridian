// Statusline configuration — ccstatusline-inspired.
//
// The agent-card statusline is a configurable ordered list of
// segments. Each segment reads from the unit's live state and
// renders a single chip in the card's status row. The user
// picks which segments are enabled and what order they appear
// in via the CommanderSettings dialog.
//
// Defaults match the v1.1 hardcoded statusline (model · context
// bar · in/out tokens). Additional segments are toggled off by
// default so the layout stays compact unless the user opts in.

export type StatuslineSegmentId =
  | "model"
  | "context_bar"
  | "tokens_in_out"
  | "tokens_total"
  | "context_pct"
  | "files_touched"
  | "last_command"
  | "time"
  | "role"
  | "inbox";

export interface StatuslineSegmentEntry {
  id: StatuslineSegmentId;
  enabled: boolean;
}

/** Out-of-the-box segments + order. Matches the v1.1 layout the
 *  cards shipped with so existing users see no change until they
 *  open Settings and reorder. */
export const DEFAULT_STATUSLINE_SEGMENTS: StatuslineSegmentEntry[] = [
  { id: "model", enabled: true },
  { id: "context_bar", enabled: true },
  { id: "tokens_in_out", enabled: true },
  { id: "tokens_total", enabled: false },
  { id: "context_pct", enabled: false },
  { id: "files_touched", enabled: false },
  { id: "last_command", enabled: false },
  { id: "time", enabled: false },
  { id: "role", enabled: false },
  { id: "inbox", enabled: false },
];

export const STATUSLINE_SEGMENT_META: Record<
  StatuslineSegmentId,
  { label: string; description: string }
> = {
  model: {
    label: "Model",
    description: "Model id (e.g. claude-sonnet-4-5)",
  },
  context_bar: {
    label: "Context bar",
    description: "Visual progress bar of context window used",
  },
  tokens_in_out: {
    label: "Tokens in / out",
    description: "Input and output token counts when the wrapper reports the split",
  },
  tokens_total: {
    label: "Tokens (total)",
    description: "Cumulative tokens for the session",
  },
  context_pct: {
    label: "Context %",
    description: "Numeric percent of the context window used",
  },
  files_touched: {
    label: "Files touched",
    description: "How many files the agent has touched this session",
  },
  last_command: {
    label: "Last command",
    description: "Most recent shell command the agent executed",
  },
  time: {
    label: "Time",
    description: "Current wall-clock time",
  },
  role: {
    label: "Role",
    description: "Agent role (Implementer, PR Reviewer, etc.)",
  },
  inbox: {
    label: "Inbox",
    description: "Pending A2A messages for this agent",
  },
};

/** Reconcile a stored config against the current default — when
 *  new segments are added in a future release, they get appended
 *  (disabled) so the user's existing order isn't blown away.
 *  Unknown segment ids are dropped. */
export function normalizeStatuslineConfig(
  stored: unknown,
): StatuslineSegmentEntry[] {
  if (!Array.isArray(stored)) return DEFAULT_STATUSLINE_SEGMENTS;
  const known = new Set(
    DEFAULT_STATUSLINE_SEGMENTS.map((s) => s.id),
  ) as Set<string>;
  const seen = new Set<string>();
  const out: StatuslineSegmentEntry[] = [];
  for (const entry of stored) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id : null;
    if (!id || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id: id as StatuslineSegmentId,
      enabled: e.enabled !== false,
    });
  }
  // Append any default segments missing from the stored config,
  // disabled so they don't disrupt the user's layout.
  for (const def of DEFAULT_STATUSLINE_SEGMENTS) {
    if (!seen.has(def.id)) out.push({ id: def.id, enabled: false });
  }
  return out;
}

export function serializeStatuslineConfig(
  segments: StatuslineSegmentEntry[],
): string {
  return JSON.stringify(segments);
}
