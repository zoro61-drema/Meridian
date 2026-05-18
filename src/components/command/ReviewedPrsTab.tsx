// ReviewedPrsTab — the PR-Auto-Review role's review surface.
//
// Findings filed via `submit_pr_review_finding` group by PR. The
// agent finalises each PR with `submit_pr_review_complete`, which
// sets a recommendation + executive summary. The user reads each
// finding, jumps to the line in their IDE, then approves the PR or
// marks it "needs review".

import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileCode2,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { openFileInIde } from "@/lib/ideLauncher";
import { getJiraBaseUrlCache, openUrl } from "@/lib/tauri/core";
import { useCommandStore, type CommandUnit } from "@/stores/command/store";
import type {
  PrReviewFinding,
  PrReviewRecommendation,
  PrReviewSeverity,
  ReviewedPr,
} from "@/lib/commandPrWork";

const SEVERITY_STYLES: Record<PrReviewSeverity, string> = {
  blocking: "border-red-500/70 bg-red-950/40 text-red-200",
  non_blocking: "border-amber-500/50 bg-amber-950/30 text-amber-200",
  nitpick: "border-zinc-500/40 bg-zinc-900/40 text-zinc-300",
};

const SEVERITY_ORDER: Record<PrReviewSeverity, number> = {
  blocking: 0,
  non_blocking: 1,
  nitpick: 2,
};

const VERDICT_LABEL: Record<PrReviewRecommendation, string> = {
  approve: "Approve",
  needs_review: "Needs review",
  pending: "Pending",
};

export function ReviewedPrsTab({ unit }: { unit: CommandUnit }) {
  const preferredIdeId = useCommandStore((s) => s.preferredIdeId);
  const setPrUserVerdict = useCommandStore((s) => s.setPrUserVerdict);

  const prs = useMemo(
    () =>
      [...unit.reviewedPrs].sort(
        (a, b) => b.lastUpdatedMs - a.lastUpdatedMs,
      ),
    [unit.reviewedPrs],
  );
  const [selectedPrId, setSelectedPrId] = useState<string | null>(
    prs[0]?.pr.prId ?? null,
  );
  const selected =
    prs.find((p) => p.pr.prId === selectedPrId) ?? prs[0] ?? null;

  if (prs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
        <div>
          <Sparkles className="mx-auto mb-2 h-6 w-6 opacity-50" />
          <p>No PRs reviewed yet.</p>
          <p className="mt-1 text-[10px] opacity-75">
            Ask this unit to scan your assigned PRs — findings will land
            here grouped by PR.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Left rail — PR list */}
      <div className="w-56 shrink-0 border-r border-white/10 overflow-y-auto">
        <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {prs.length} PR{prs.length === 1 ? "" : "s"} reviewed
        </div>
        {prs.map((p) => (
          <button
            key={p.pr.prId}
            type="button"
            onClick={() => setSelectedPrId(p.pr.prId)}
            className={`flex w-full flex-col items-start gap-0.5 border-l-2 px-2 py-1.5 text-left text-xs transition-colors ${
              selected?.pr.prId === p.pr.prId
                ? "border-amber-400 bg-white/5"
                : "border-transparent hover:bg-white/[0.03]"
            }`}
          >
            <span className="font-mono text-[10px] text-white/50">
              #{p.pr.prId}
              {p.pr.jiraKey ? ` · ${p.pr.jiraKey}` : ""}
            </span>
            <span className="line-clamp-2 text-[11px] text-white/90">
              {p.pr.title || "(untitled)"}
            </span>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span>{p.findings.length} findings</span>
              {p.userVerdict && (
                <VerdictPill verdict={p.userVerdict} />
              )}
            </div>
          </button>
        ))}
      </div>
      {/* Right — selected PR's findings */}
      <div className="flex-1 min-w-0 overflow-y-auto p-3">
        {selected && (
          <PrReviewDetail
            pr={selected}
            preferredIdeId={preferredIdeId}
            onSetVerdict={(v) =>
              setPrUserVerdict(unit.id, selected.pr.prId, v)
            }
          />
        )}
      </div>
    </div>
  );
}

function PrReviewDetail({
  pr,
  preferredIdeId,
  onSetVerdict,
}: {
  pr: ReviewedPr;
  preferredIdeId: string;
  onSetVerdict: (v: PrReviewRecommendation) => void;
}) {
  const jiraBaseUrl = getJiraBaseUrlCache();

  const sortedFindings = [...pr.findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.lens.localeCompare(b.lens),
  );

  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-white/50">
            #{pr.pr.prId}
            {pr.pr.jiraKey ? ` · ${pr.pr.jiraKey}` : ""}
          </span>
          {pr.pr.url && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-1.5 text-[10px]"
              onClick={() => openUrl(pr.pr.url)}
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              Bitbucket
            </Button>
          )}
          {pr.pr.jiraKey && jiraBaseUrl && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-1.5 text-[10px]"
              onClick={() =>
                openUrl(
                  `${jiraBaseUrl.replace(/\/$/, "")}/browse/${pr.pr.jiraKey}`,
                )
              }
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              JIRA
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm font-medium text-white/90">
          {pr.pr.title}
        </p>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          branch: {pr.pr.branch}
        </p>
      </div>

      <div className="rounded-md border border-amber-700/30 bg-amber-950/20 p-2">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-300/80">
          <Sparkles className="h-3 w-3" />
          Agent recommendation
          {pr.recommendation !== "pending" && (
            <VerdictPill verdict={pr.recommendation} />
          )}
        </div>
        {pr.summary ? (
          <p className="whitespace-pre-wrap leading-relaxed text-white/85">
            {pr.summary}
          </p>
        ) : (
          <p className="text-muted-foreground italic">
            Agent has not finalised its summary yet.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant={pr.userVerdict === "approve" ? "default" : "outline"}
          className="h-7 px-2 text-[10px]"
          onClick={() => onSetVerdict("approve")}
        >
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Approve
        </Button>
        <Button
          size="sm"
          variant={
            pr.userVerdict === "needs_review" ? "default" : "outline"
          }
          className="h-7 px-2 text-[10px]"
          onClick={() => onSetVerdict("needs_review")}
        >
          <AlertTriangle className="mr-1 h-3 w-3" />
          Needs review
        </Button>
      </div>

      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {sortedFindings.length} finding
          {sortedFindings.length === 1 ? "" : "s"}
        </div>
        {sortedFindings.map((f) => (
          <FindingRow
            key={f.id}
            finding={f}
            preferredIdeId={preferredIdeId}
            worktreeRoot={pr.worktreePath}
          />
        ))}
      </div>
    </div>
  );
}

function FindingRow({
  finding,
  preferredIdeId,
  worktreeRoot,
}: {
  finding: PrReviewFinding;
  preferredIdeId: string;
  worktreeRoot: string | null;
}) {
  const firstLine = (() => {
    const m = finding.lineRange.match(/^(\d+)/);
    return m ? Number.parseInt(m[1], 10) : undefined;
  })();

  return (
    <div className="rounded-md border border-white/10 bg-black/30 p-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge severity={finding.severity} />
        <span className="rounded border border-white/15 bg-black/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white/70">
          {finding.lens}
        </span>
        <span className="font-mono text-[10px] text-white/60">
          {finding.filePath}
          {finding.lineRange ? `:${finding.lineRange}` : ""}
        </span>
      </div>
      <p className="whitespace-pre-wrap leading-relaxed text-white/85">
        {finding.description}
      </p>
      {finding.snippet && (
        <pre className="max-h-48 overflow-auto rounded bg-black/60 p-2 font-mono text-[10px] leading-relaxed text-white/75">
          {finding.snippet}
        </pre>
      )}
      <div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[10px]"
          onClick={() =>
            openFileInIde({
              ideId: preferredIdeId,
              path: finding.filePath,
              line: firstLine,
              worktreeRoot,
            })
          }
        >
          <FileCode2 className="mr-1 h-3 w-3" />
          Open in IDE
        </Button>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: PrReviewSeverity }) {
  const cls = SEVERITY_STYLES[severity];
  const label =
    severity === "non_blocking" ? "non-blocking" : severity;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${cls}`}
    >
      <AlertOctagon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function VerdictPill({ verdict }: { verdict: PrReviewRecommendation }) {
  const styles =
    verdict === "approve"
      ? "border-emerald-600/60 bg-emerald-900/40 text-emerald-200"
      : verdict === "needs_review"
        ? "border-amber-600/60 bg-amber-900/40 text-amber-200"
        : "border-white/15 bg-black/40 text-white/60";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${styles}`}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}
