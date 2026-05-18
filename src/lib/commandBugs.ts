// Bug Hunter role data model. Each `submit_bug_report` MCP call
// from the agent appends a BugReport to the launching unit's
// queue, surfaced in the Bugs tab on the unit chat panel.
//
// In-memory only for V1 — bugs live for the duration of the
// session and are discarded when the unit is removed or the app
// reloads. If the user wants to act on a report, they push it to
// JIRA from the Bugs tab; once submitted, the report is marked
// and stays visible for reference.

export type BugSeverity = "critical" | "high" | "medium" | "low";

export interface BugAffectedFile {
  path: string;
  /** Optional line pointer — e.g. "42-58" or "42". */
  lineRange?: string;
}

export interface BugReport {
  /** Stable id; one per `submit_bug_report` call. */
  id: string;
  summary: string;
  description: string;
  observedBehavior: string;
  expectedBehavior: string;
  /** May be empty when the bug isn't user-reachable. */
  stepsToReproduce: string;
  severity: BugSeverity;
  suspectedRootCause: string;
  affectedFiles: BugAffectedFile[];
  createdAtMs: number;
  /** Set once the user pushes the report to JIRA; null while the
   *  report is still queued. Keeps submitted reports visible in
   *  the tab as a record. */
  submittedJiraKey: string | null;
}

const VALID_SEVERITIES: ReadonlySet<BugSeverity> = new Set([
  "critical",
  "high",
  "medium",
  "low",
]);

export function parseBugSeverity(raw: string): BugSeverity {
  const lower = raw.toLowerCase();
  return VALID_SEVERITIES.has(lower as BugSeverity)
    ? (lower as BugSeverity)
    : "medium";
}

export function parseAffectedFiles(
  raw: Array<Record<string, unknown>>,
): BugAffectedFile[] {
  const out: BugAffectedFile[] = [];
  for (const entry of raw) {
    const path = typeof entry.path === "string" ? entry.path.trim() : "";
    if (!path) continue;
    const lineRangeRaw = entry.lineRange ?? entry.line_range;
    const lineRange =
      typeof lineRangeRaw === "string" && lineRangeRaw.trim().length > 0
        ? lineRangeRaw.trim()
        : undefined;
    const file: BugAffectedFile = { path };
    if (lineRange) file.lineRange = lineRange;
    out.push(file);
  }
  return out;
}
