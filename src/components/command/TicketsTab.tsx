// TicketsTab — focused-panel tab for ticket-groomer units.
//
// Two states:
//   - List: every proposal the agent has emitted via the
//     `submit_grooming_recommendations` MCP tool. Rows show
//     status (pending / in-review / submitted / skipped), ticket
//     key + summary, # of changes, age. Click → detail.
//   - Detail: per-field approve / edit / decline / skip UI. Build
//     out in Task #77; this tab ships the list + a stub.
//
// Gated by role at the call site (the tab only renders for the
// `ticket-groomer` role).

import { Check, ChevronLeft, Loader2, SkipForward, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  approvedCount,
  GROOMING_FIELD_LABELS,
  isProposalFullyReviewed,
  proposalStatus,
  type GroomingProposal,
  type ProposalStatus,
} from "@/lib/commandGrooming";
import {
  getIssue,
  updateJiraFields,
  updateJiraIssue,
} from "@/lib/tauri/jira";
import type { CommandUnit } from "@/stores/command/store";
import { useCommandStore } from "@/stores/command/store";

interface TicketsTabProps {
  unit: CommandUnit;
}

const STATUS_BADGE: Record<ProposalStatus, string> = {
  pending: "border-amber-700/50 bg-amber-900/30 text-amber-200",
  in_review: "border-blue-700/50 bg-blue-900/30 text-blue-200",
  submitted: "border-emerald-700/50 bg-emerald-900/30 text-emerald-200",
  skipped: "border-zinc-700 bg-zinc-900/40 text-zinc-400",
};

const STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: "Pending",
  in_review: "In review",
  submitted: "Submitted",
  skipped: "Skipped",
};

export function TicketsTab({ unit }: TicketsTabProps) {
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(
    null,
  );
  const proposals = unit.groomingQueue;
  const selected = selectedProposalId
    ? proposals.find((p) => p.id === selectedProposalId) ?? null
    : null;

  if (selected) {
    return (
      <TicketDetail
        unitId={unit.id}
        proposal={selected}
        onBack={() => setSelectedProposalId(null)}
      />
    );
  }

  if (proposals.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="max-w-sm text-xs italic text-white/40">
          No grooming proposals yet. Once the agent calls{" "}
          <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[10px]">
            submit_grooming_recommendations
          </code>{" "}
          for a ticket, it'll show up here for per-field review.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ul className="flex-1 min-h-0 divide-y divide-white/5 overflow-y-auto">
        {proposals.map((p) => {
          const status = proposalStatus(p);
          const decided = p.changes.filter((c) => c.decision != null).length;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelectedProposalId(p.id)}
                className="flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors hover:bg-white/5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold text-white/90">
                    {p.ticketKey}
                  </span>
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${STATUS_BADGE[status]}`}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                </div>
                <div className="truncate text-[11px] text-white/80">
                  {p.ticketSummary || "(no summary)"}
                </div>
                <div className="flex items-baseline justify-between text-[10px] text-muted-foreground">
                  <span>
                    {p.changes.length} change
                    {p.changes.length === 1 ? "" : "s"}
                    {p.changes.length > 0 && status === "in_review" && (
                      <span className="ml-1 text-white/60">
                        · {decided}/{p.changes.length} decided
                      </span>
                    )}
                    {status === "submitted" && (
                      <span className="ml-1 text-emerald-300/80">
                        · {approvedCount(p)} approved
                      </span>
                    )}
                  </span>
                  <span>{relativeAge(p.createdAtMs)}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Per-ticket detail view. Phase 1 stub — full per-field
 *  approve / edit / decline + JIRA submit lands in Task #77. */
function TicketDetail({
  unitId,
  proposal,
  onBack,
}: {
  unitId: string;
  proposal: GroomingProposal;
  onBack: () => void;
}) {
  const setGroomingFieldDecision = useCommandStore(
    (s) => s.setGroomingFieldDecision,
  );
  const skipGroomingProposal = useCommandStore(
    (s) => s.skipGroomingProposal,
  );
  const markGroomingProposalSubmitted = useCommandStore(
    (s) => s.markGroomingProposalSubmitted,
  );
  const status = proposalStatus(proposal);
  const fullyReviewed = isProposalFullyReviewed(proposal);
  const isSubmitted = status === "submitted";
  const isSkipped = status === "skipped";
  const [submitting, setSubmitting] = useState(false);

  // Per-row drafts. The user edits the "Suggested" textarea
  // freely; on Approve the current draft value lands in
  // store-side approvedValue. On Decline we clear the draft.
  // Initial value: any previously-approved value, otherwise the
  // agent's suggestion.
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const c of proposal.changes) {
      seed[c.id] = c.approvedValue ?? c.suggested;
    }
    return seed;
  });

  const onApprove = (changeId: string) => {
    const value = drafts[changeId] ?? "";
    setGroomingFieldDecision(unitId, proposal.id, changeId, "approved", value);
  };
  const onDecline = (changeId: string) => {
    setGroomingFieldDecision(unitId, proposal.id, changeId, "declined", null);
  };

  /** Single edit path for the suggested-text textarea. Behavior:
   *  - Always updates the local draft (so the UI is responsive).
   *  - If the change is currently approved, ALSO updates the
   *    store's `approvedValue` so Submit to JIRA pushes the edit
   *    rather than the original-suggestion-time value. Without
   *    this, edits after Approve were silently dropped on submit.
   *  - If declined / undecided, just stages the draft; clicking
   *    Approve later will commit it.
   */
  const onDraftChange = (changeId: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [changeId]: value }));
    const change = proposal.changes.find((c) => c.id === changeId);
    if (change?.decision === "approved") {
      setGroomingFieldDecision(
        unitId,
        proposal.id,
        changeId,
        "approved",
        value,
      );
    }
  };

  const onSubmit = async () => {
    if (submitting) return;
    const approved = proposal.changes.filter((c) => c.decision === "approved");
    if (approved.length === 0) {
      toast.error("No approved changes to submit.");
      return;
    }
    setSubmitting(true);
    try {
      // Re-fetch the issue so we have fresh discoveredFieldIds in
      // case JIRA's custom-field schema drifted since launch.
      const issue = await getIssue(proposal.ticketKey);
      const summaryChange = approved.find((c) => c.field === "summary");
      const descriptionChange = approved.find((c) => c.field === "description");
      // updateJiraIssue is summary+description in a single call —
      // call it even if only one of them changed (the other stays
      // at its current value).
      if (summaryChange || descriptionChange) {
        await updateJiraIssue(
          proposal.ticketKey,
          summaryChange ? (summaryChange.approvedValue ?? "") : null,
          descriptionChange
            ? (descriptionChange.approvedValue ?? "")
            : (issue.description ?? ""),
        );
      }
      // Remaining fields go through updateJiraFields keyed by the
      // JIRA custom-field id resolved at fetch time.
      const customFields: Record<string, string> = {};
      const missingFieldIds: string[] = [];
      for (const c of approved) {
        if (c.field === "summary" || c.field === "description") continue;
        const fid = issue.discoveredFieldIds?.[c.field];
        if (!fid) {
          missingFieldIds.push(c.field);
          continue;
        }
        customFields[fid] = c.approvedValue ?? "";
      }
      if (missingFieldIds.length > 0) {
        toast.warning(
          `Skipped fields (not discovered on this issue): ${missingFieldIds.join(", ")}`,
        );
      }
      if (Object.keys(customFields).length > 0) {
        await updateJiraFields(proposal.ticketKey, JSON.stringify(customFields));
      }
      markGroomingProposalSubmitted(unitId, proposal.id);
      toast.success(
        `Pushed ${approved.length} change${approved.length === 1 ? "" : "s"} to ${proposal.ticketKey}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`JIRA submit failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-2 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="h-6 px-2 text-[11px]"
          aria-label="Back to ticket list"
        >
          <ChevronLeft className="mr-1 h-3 w-3" />
          Back
        </Button>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] font-semibold text-white/90">
            {proposal.ticketKey}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            {proposal.ticketSummary || "(no summary)"}
          </div>
        </div>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${STATUS_BADGE[status]}`}
        >
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto p-2">
        {proposal.groomingNotes && (
          <div className="rounded-md border border-white/10 bg-black/30 p-2 text-[11px] text-white/80">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">
              Notes
            </div>
            <div className="whitespace-pre-wrap">{proposal.groomingNotes}</div>
          </div>
        )}

        {proposal.clarifyingQuestions.length > 0 && (
          <div className="rounded-md border border-amber-700/40 bg-amber-900/15 p-2 text-[11px] text-amber-100/90">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-amber-200/70">
              Clarifying questions
            </div>
            <ul className="ml-3 list-disc space-y-0.5">
              {proposal.clarifyingQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}

        {proposal.changes.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/15 bg-black/20 p-4 text-center text-xs italic text-white/40">
            No field changes proposed — the agent only surfaced notes /
            questions for this ticket.
          </div>
        ) : (
          proposal.changes.map((c) => {
            const isApproved = c.decision === "approved";
            const isDeclined = c.decision === "declined";
            const editable = !isSubmitted && !isSkipped;
            return (
              <div
                key={c.id}
                className={`rounded-md border p-2 ${
                  isApproved
                    ? "border-emerald-700/50 bg-emerald-900/15"
                    : isDeclined
                      ? "border-zinc-700/50 bg-zinc-900/30 opacity-70"
                      : "border-white/10 bg-black/30"
                }`}
              >
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-wider text-white/55">
                    {GROOMING_FIELD_LABELS[c.field]}
                    {c.section && (
                      <span className="ml-2 text-white/40">· {c.section}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onApprove(c.id)}
                      disabled={!editable}
                      className={`h-6 px-2 text-[10px] ${
                        isApproved ? "bg-emerald-500/20 text-emerald-200" : ""
                      }`}
                      aria-label="Approve change"
                    >
                      <Check className="mr-1 h-3 w-3" />
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onDecline(c.id)}
                      disabled={!editable}
                      className={`h-6 px-2 text-[10px] ${
                        isDeclined ? "bg-red-500/20 text-red-200" : ""
                      }`}
                      aria-label="Decline change"
                    >
                      <X className="mr-1 h-3 w-3" />
                      Decline
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div className="mb-0.5 text-[9px] uppercase tracking-wider text-white/40">
                      Current
                    </div>
                    <div className="whitespace-pre-wrap rounded border border-white/5 bg-black/30 p-1.5 font-mono text-white/70">
                      {c.current ?? <em className="text-white/30">(empty)</em>}
                    </div>
                  </div>
                  <div>
                    <div className="mb-0.5 flex items-baseline justify-between text-[9px] uppercase tracking-wider text-white/40">
                      <span>
                        Suggested{" "}
                        {editable && (
                          <span className="text-white/30">
                            {isApproved
                              ? "(edits auto-save)"
                              : isDeclined
                                ? "(editable — Approve to use)"
                                : "(editable)"}
                          </span>
                        )}
                      </span>
                    </div>
                    {/* Restore full opacity on the textarea so a
                        declined row's input doesn't read as
                        disabled even though it isn't. The row's
                        opacity-70 wrapper still dims the
                        surrounding metadata. */}
                    <div className="opacity-100">
                      <Textarea
                        value={drafts[c.id] ?? ""}
                        onChange={(e) => onDraftChange(c.id, e.target.value)}
                        disabled={!editable}
                        rows={Math.max(
                          2,
                          Math.min(8, (drafts[c.id] ?? "").split("\n").length),
                        )}
                        className="min-h-[36px] resize-y border-emerald-700/40 bg-emerald-900/10 font-mono text-[11px] text-emerald-100/90"
                      />
                    </div>
                  </div>
                </div>
                {c.reasoning && (
                  <div className="mt-1 text-[10px] italic text-muted-foreground">
                    {c.reasoning}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/10 px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            skipGroomingProposal(unitId, proposal.id);
            onBack();
          }}
          disabled={isSubmitted || isSkipped}
          className="h-7 px-2 text-[11px] text-white/60 hover:bg-white/5"
        >
          <SkipForward className="mr-1 h-3 w-3" />
          Skip ticket
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={
            !fullyReviewed ||
            isSubmitted ||
            approvedCount(proposal) === 0 ||
            submitting
          }
          onClick={() => void onSubmit()}
          className="h-7 px-2 text-[11px]"
          title={
            isSubmitted
              ? "Already submitted"
              : !fullyReviewed
                ? "Decide every field before submitting"
                : approvedCount(proposal) === 0
                  ? "No approved changes to submit"
                  : "Submit approved changes to JIRA"
          }
        >
          {submitting ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : null}
          {isSubmitted ? "Submitted" : `Submit ${approvedCount(proposal)} to JIRA`}
        </Button>
      </div>
    </div>
  );
}

function relativeAge(ms: number): string {
  const delta = Date.now() - ms;
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
