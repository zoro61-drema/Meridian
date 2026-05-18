// Data models for the two PR-focused Command roles:
//   - Address PR Tasks → addresses review comments locally
//   - PR Auto-Review → autonomously reviews assigned PRs
//
// Both produce in-memory queues on the launching unit: `addressedPrs`
// (Address PR Tasks) and `reviewedPrs` (PR Auto-Review). The unit
// chat panel surfaces each as a dedicated tab.

export type PrReviewSeverity = "blocking" | "non_blocking" | "nitpick";

export type PrReviewRecommendation = "approve" | "needs_review" | "pending";

/** Identifies a Bitbucket PR. Stored on every addressed-comment /
 *  review-finding so the UI can collapse multiple entries per PR. */
export interface PrRef {
  /** PR id within the workspace, e.g. "1234". */
  prId: string;
  /** PR title at the time the agent looked at it. */
  title: string;
  /** Bitbucket URL the user clicks to jump to the PR. */
  url: string;
  /** Branch name being reviewed / addressed. */
  branch: string;
  /** JIRA ticket key extracted from the branch / PR title, if any.
   *  Powers the "Jump to JIRA" button on the Reviewed PRs tab. */
  jiraKey: string | null;
}

// ── Address PR Tasks ──────────────────────────────────────────────

/** A single comment / task the agent addressed on a PR. */
export interface AddressedComment {
  /** Stable id; one per `submit_pr_comment_addressed` call. */
  id: string;
  /** Who wrote the original review comment. */
  commentAuthor: string;
  /** Original comment / task text from the PR. */
  originalText: string;
  /** Short summary of what the agent changed. */
  changeSummary: string;
  /** Unified diff snippet of the change (the agent's commit). */
  diff: string;
  /** File the change landed in. */
  filePath: string;
  /** 1-based start line of the change for "Open in IDE". */
  startLine: number | null;
  createdAtMs: number;
}

/** A PR the agent has worked on, grouping all addressed comments. */
export interface AddressedPr {
  pr: PrRef;
  /** Absolute path to the worktree the agent created for this PR. */
  worktreePath: string | null;
  comments: AddressedComment[];
  /** Last time the agent submitted an addressing for this PR. */
  lastUpdatedMs: number;
}

// ── PR Auto-Review ────────────────────────────────────────────────

/** A single review finding the agent produced. */
export interface PrReviewFinding {
  id: string;
  /** Lens this finding falls under (acceptance / security / logic / testing / quality). */
  lens: string;
  /** Free-text description of the issue. */
  description: string;
  severity: PrReviewSeverity;
  filePath: string;
  /** 1-based; may be a range like "42-58" or a single line. */
  lineRange: string;
  /** Code snippet showing the surrounding context (5-10 lines). */
  snippet: string;
  createdAtMs: number;
}

/** A PR the agent has reviewed, grouping all findings + overall verdict. */
export interface ReviewedPr {
  pr: PrRef;
  worktreePath: string | null;
  findings: PrReviewFinding[];
  /** Recommendation the agent landed on (or pending while review is
   *  still in flight). */
  recommendation: PrReviewRecommendation;
  /** Executive summary the agent submits with the final call. */
  summary: string;
  /** User's verdict, set when they click Approve / Needs review in
   *  the tab. Null until they decide. */
  userVerdict: PrReviewRecommendation | null;
  lastUpdatedMs: number;
}

// ── Parsing helpers (for the event listener) ──────────────────────

const VALID_SEVERITIES: ReadonlySet<PrReviewSeverity> = new Set([
  "blocking",
  "non_blocking",
  "nitpick",
]);

export function parseReviewSeverity(raw: string): PrReviewSeverity {
  const lower = raw.toLowerCase().replace(/-/g, "_");
  return VALID_SEVERITIES.has(lower as PrReviewSeverity)
    ? (lower as PrReviewSeverity)
    : "non_blocking";
}

const VALID_RECOMMENDATIONS: ReadonlySet<PrReviewRecommendation> = new Set([
  "approve",
  "needs_review",
  "pending",
]);

export function parseReviewRecommendation(
  raw: string,
): PrReviewRecommendation {
  const lower = raw.toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_");
  return VALID_RECOMMENDATIONS.has(lower as PrReviewRecommendation)
    ? (lower as PrReviewRecommendation)
    : "pending";
}

/** Extract a JIRA key like "PROJ-1234" from a branch name or PR title.
 *  Returns the first match or null. Case-insensitive; uppercases the
 *  key so the link builder hits a canonical form. */
export function extractJiraKey(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/[A-Z][A-Z0-9]+-\d+/i);
  return m ? m[0].toUpperCase() : null;
}
