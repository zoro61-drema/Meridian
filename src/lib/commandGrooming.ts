// Commander grooming queue — types + helpers shared between the
// MCP-server payload, the store, and the Tickets-tab UI.
//
// The shape mirrors the existing `GroomingOutput` Zod schema in
// `src-sidecar/src/workflows/grooming.ts` so the one-shot Groom
// Ticket screen and the Commander batch-grooming flow emit
// compatible payloads. Per-field user decisions (approve / edit
// / decline) live alongside the agent's proposed values so the
// queue tracks both "what the agent recommended" and "what the
// user decided to submit".

/** Fields the grooming agent is allowed to suggest changes to.
 *  Matches the upstream schema enum; priority is deliberately
 *  excluded — the user wants that one fully human-driven. */
export type GroomingFieldName =
  | "description"
  | "acceptance_criteria"
  | "steps_to_reproduce"
  | "observed_behavior"
  | "expected_behavior"
  | "summary";

export const GROOMING_FIELD_LABELS: Record<GroomingFieldName, string> = {
  description: "Description",
  acceptance_criteria: "Acceptance Criteria",
  steps_to_reproduce: "Steps to Reproduce",
  observed_behavior: "Observed Behavior",
  expected_behavior: "Expected Behavior",
  summary: "Summary",
};

export type FieldDecision = "approved" | "declined" | null;

export interface GroomingFieldChange {
  /** Stable id used to key the row in the detail UI; supplied by
   *  the agent so two changes on the same field can co-exist. */
  id: string;
  field: GroomingFieldName;
  /** Free-form section label the agent picked (e.g. "Acceptance
   *  Criterion 2" for an AC entry). Shown above the diff. */
  section: string;
  /** Current value in JIRA. Null when the field is empty today. */
  current: string | null;
  /** Agent's suggested replacement. */
  suggested: string;
  /** Why the agent thinks this change matters. */
  reasoning: string;
  /** User decision — null = not yet reviewed. */
  decision: FieldDecision;
  /** When approved, the value Meridian will submit to JIRA.
   *  Defaults to `suggested` but the user can edit before
   *  approving. Null until a decision is made. */
  approvedValue: string | null;
}

export interface GroomingProposal {
  /** Stable id; one per `submit_grooming_recommendations` call. */
  id: string;
  /** JIRA ticket key, e.g. "PROJ-1234". */
  ticketKey: string;
  /** Cached ticket summary at the time the agent proposed. */
  ticketSummary: string;
  /** Ticket type as known by the agent (story / task / bug / …). */
  ticketType: string;
  /** Per-field proposed changes. May be empty when the agent has
   *  only clarifying questions / notes to offer. */
  changes: GroomingFieldChange[];
  /** Open questions the agent surfaces for the engineer. */
  clarifyingQuestions: string[];
  /** Free-form notes from the agent. */
  groomingNotes: string;
  createdAtMs: number;
  /** When the user explicitly skipped the ticket without acting. */
  skippedAt: number | null;
  /** When the approved changes were pushed to JIRA. Null until
   *  submission. */
  submittedAt: number | null;
}

/** Status used by the Tickets-tab list view to badge each row. */
export type ProposalStatus = "pending" | "in_review" | "submitted" | "skipped";

export function proposalStatus(p: GroomingProposal): ProposalStatus {
  if (p.submittedAt != null) return "submitted";
  if (p.skippedAt != null) return "skipped";
  const reviewed = p.changes.filter((c) => c.decision != null).length;
  if (reviewed === 0) return "pending";
  return "in_review";
}

/** True when every change in the proposal has a user decision
 *  (so the "Submit to JIRA" button can light up). */
export function isProposalFullyReviewed(p: GroomingProposal): boolean {
  if (p.changes.length === 0) return true;
  return p.changes.every((c) => c.decision != null);
}

/** Count of changes the user approved — used as the submit
 *  button's number prefix. */
export function approvedCount(p: GroomingProposal): number {
  return p.changes.filter((c) => c.decision === "approved").length;
}
