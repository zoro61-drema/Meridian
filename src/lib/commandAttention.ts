// "Needs attention" predicates for Commander units.
//
// Each Commander unit can accumulate structured outputs that the user
// is expected to review/act on:
//   - groomingQueue items pending (neither submitted nor skipped)
//   - bugReports not yet pushed to JIRA
//   - addressedPrs (every entry is unreviewed by definition — there's
//     no per-PR verdict shape today)
//   - reviewedPrs with no userVerdict yet
//
// Two consumers:
//   1. UnitChatPanel — per-tab yellow indicator next to the tab name.
//   2. LandingScreen — aggregate count badge on the Commander card so
//      the user knows attention is needed without opening the panel.

import type { CommandUnit } from "@/stores/command/store";

export interface UnitAttention {
  /** Grooming proposals pending the user's review. */
  tickets: number;
  /** Bug reports not yet pushed to JIRA. */
  bugs: number;
  /** PRs with addressing comments awaiting the user. */
  myPrs: number;
  /** PR reviews awaiting an approve / needs-review verdict. */
  reviewedPrs: number;
}

export function unitAttention(unit: CommandUnit): UnitAttention {
  const tickets = unit.groomingQueue.filter(
    (p) => p.submittedAt == null && p.skippedAt == null,
  ).length;
  const bugs = unit.bugReports.filter((b) => b.submittedJiraKey == null).length;
  const myPrs = unit.addressedPrs.length;
  const reviewedPrs = unit.reviewedPrs.filter((r) => r.userVerdict == null)
    .length;
  return { tickets, bugs, myPrs, reviewedPrs };
}

export function unitAttentionTotal(unit: CommandUnit): number {
  const a = unitAttention(unit);
  return a.tickets + a.bugs + a.myPrs + a.reviewedPrs;
}

export function aggregateAttention(
  units: Record<string, CommandUnit>,
): { total: number; perUnit: Record<string, UnitAttention> } {
  const perUnit: Record<string, UnitAttention> = {};
  let total = 0;
  for (const [id, u] of Object.entries(units)) {
    if (!u) continue;
    const a = unitAttention(u);
    perUnit[id] = a;
    total += a.tickets + a.bugs + a.myPrs + a.reviewedPrs;
  }
  return { total, perUnit };
}
