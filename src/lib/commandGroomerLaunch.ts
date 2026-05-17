// Helpers for launching a Commander ticket-groomer unit.
//
// The agent receives its work queue as part of the role prompt: a
// markdown "Tickets to groom" block listing every ticket the user
// wants reviewed, with the fields the agent is allowed to suggest
// changes for embedded inline. This keeps the agent on rails (it
// can't groom a ticket that wasn't included) and avoids round-trip
// MCP fetches for ticket metadata.

import type { JiraIssue, JiraSprint } from "@/lib/tauri/jira";

/** Build the "Tickets to groom" block prepended to the ticket-
 *  groomer role prompt at launch. Accepts the sprint (optional —
 *  manual ticket lists have no sprint) and the issues to include. */
export function formatGroomingBatch(
  sprint: JiraSprint | null,
  issues: JiraIssue[],
): string {
  const header = sprint
    ? `# Tickets to groom — Sprint: ${sprint.name} (id ${sprint.id})${
        sprint.goal ? `\n# Sprint goal: ${sprint.goal}` : ""
      }`
    : "# Tickets to groom — manual selection";
  const count = `\n# Count: ${issues.length} ticket${issues.length === 1 ? "" : "s"}`;
  const blocks = issues.map(formatIssueBlock).join("\n\n---\n\n");
  return `${header}${count}\n\n${blocks}`;
}

/** Build the per-ticket markdown block delivered to the agent
 *  one at a time via the `get_next_ticket` MCP tool. Pulled out
 *  so the same shape can be used for both the (legacy) bulk
 *  embedded prompt and the on-demand queue. */
export function formatIssueBlock(issue: JiraIssue): string {
  const lines: string[] = [];
  lines.push(`## ${issue.key} — ${issue.summary}`);
  lines.push(`Type: ${issue.issueType} · Status: ${issue.status}`);
  if (issue.labels && issue.labels.length > 0) {
    lines.push(`Labels: ${issue.labels.join(", ")}`);
  }
  if (issue.epicKey) {
    lines.push(`Epic: ${issue.epicKey}${issue.epicSummary ? ` (${issue.epicSummary})` : ""}`);
  }
  if (issue.storyPoints != null) {
    lines.push(`Story points: ${issue.storyPoints}`);
  }
  lines.push("");
  // The agent is only allowed to suggest edits on these six fields
  // per `commandGrooming.ts`. Mirror that in the embedded block so
  // it sees explicit current values for each one.
  pushField(lines, "Summary", issue.summary);
  pushField(lines, "Description", issue.description);
  pushField(lines, "Acceptance Criteria", issue.acceptanceCriteria);
  pushField(lines, "Steps to Reproduce", issue.stepsToReproduce);
  pushField(lines, "Observed Behavior", issue.observedBehavior);
  pushField(lines, "Expected Behavior", issue.expectedBehavior);
  return lines.join("\n");
}

function pushField(out: string[], label: string, value: string | null) {
  out.push(`### ${label}`);
  if (!value || value.trim().length === 0) {
    out.push("(empty)");
  } else {
    out.push(value);
  }
  out.push("");
}

/** Parse a freeform user input of ticket keys into a clean list.
 *  Accepts whitespace / comma / newline separators. Validates each
 *  looks like JIRA's standard `PROJECT-1234` shape and uppercases
 *  the project prefix so casing-doesn't-match issues are caught
 *  at parse time, not at JIRA-fetch time. */
const KEY_PATTERN = /^[A-Z][A-Z0-9]+-[0-9]+$/;
export function parseTicketKeyList(input: string): {
  keys: string[];
  invalid: string[];
} {
  const tokens = input
    .split(/[\s,]+/)
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0);
  const keys: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    if (!KEY_PATTERN.test(t)) {
      invalid.push(t);
      continue;
    }
    if (seen.has(t)) continue;
    seen.add(t);
    keys.push(t);
  }
  return { keys, invalid };
}
