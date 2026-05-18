// BugsTab — the Bug Hunter role's review surface.
//
// Each bug the agent files via the `submit_bug_report` MCP tool
// lands as a row here. The user reviews, picks the ones worth
// escalating, and submits to JIRA via the helpers below:
//
//   - "Copy as JIRA" copies a markdown block formatted to paste
//     directly into JIRA's create-issue dialog (summary as title,
//     observed/expected/repro/files in the description body).
//   - "Open JIRA" launches the JIRA create-issue page (pre-filled
//     with summary + description if your JIRA instance supports
//     query-string fill).
//
// Bugs are in-memory only — they live for the unit's lifetime and
// don't survive a reload. Submitting to JIRA stamps the report
// with the returned key (user-provided after pasting); dismiss
// removes the report from the queue entirely.

import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  getAppPreferences,
  type BugFilingBoard,
} from "@/lib/appPreferences";
import type { BugReport, BugSeverity } from "@/lib/commandBugs";
import { openFileInIde } from "@/lib/ideLauncher";
import { getJiraBaseUrlCache } from "@/lib/tauri/core";
import { useEffect } from "react";
import { useCommandStore, type CommandUnit } from "@/stores/command/store";

const SEVERITY_STYLES: Record<BugSeverity, string> = {
  critical: "border-red-500/70 bg-red-950/40 text-red-200",
  high: "border-orange-500/60 bg-orange-950/40 text-orange-200",
  medium: "border-amber-500/50 bg-amber-950/30 text-amber-200",
  low: "border-zinc-500/40 bg-zinc-900/40 text-zinc-300",
};

const SEVERITY_ORDER: Record<BugSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function formatBugAsMarkdown(report: BugReport): string {
  const lines: string[] = [];
  lines.push(`## Summary`);
  lines.push(report.summary);
  if (report.description.trim()) {
    lines.push("", `## Description`, report.description);
  }
  if (report.observedBehavior.trim()) {
    lines.push("", `## Observed behaviour`, report.observedBehavior);
  }
  if (report.expectedBehavior.trim()) {
    lines.push("", `## Expected behaviour`, report.expectedBehavior);
  }
  if (report.stepsToReproduce.trim()) {
    lines.push("", `## Steps to reproduce`, report.stepsToReproduce);
  }
  if (report.suspectedRootCause.trim()) {
    lines.push("", `## Suspected root cause`, report.suspectedRootCause);
  }
  if (report.affectedFiles.length > 0) {
    lines.push("", `## Affected files`);
    for (const f of report.affectedFiles) {
      lines.push(`- \`${f.path}\`${f.lineRange ? ` (lines ${f.lineRange})` : ""}`);
    }
  }
  lines.push("", `_Filed by Meridian Bug Hunter — severity: **${report.severity}**_`);
  return lines.join("\n");
}

function buildJiraCreateUrl(
  report: BugReport,
  board: BugFilingBoard | null,
): string | null {
  const baseUrl = getJiraBaseUrlCache();
  if (!baseUrl) return null;
  const params = new URLSearchParams({
    summary: report.summary,
    description: formatBugAsMarkdown(report),
    issuetype: "Bug",
  });
  if (board && board.projectKey.trim().length > 0) {
    params.set("pid", board.projectKey.trim());
  }
  return `${baseUrl.replace(/\/$/, "")}/secure/CreateIssue!default.jspa?${params.toString()}`;
}

export function BugsTab({ unit }: { unit: CommandUnit }) {
  const dismissBugReport = useCommandStore((s) => s.dismissBugReport);
  const markBugSubmitted = useCommandStore((s) => s.markBugSubmitted);
  const preferredIdeId = useCommandStore((s) => s.preferredIdeId);

  // Bug-filing boards live in user preferences; load once on mount.
  // The dropdown re-fetches if the user adds a board in Settings and
  // comes back, but doesn't auto-update mid-session — that's fine
  // for a once-configured value.
  const [boards, setBoards] = useState<BugFilingBoard[]>([]);
  const [selectedBoardIdx, setSelectedBoardIdx] = useState(0);
  useEffect(() => {
    let alive = true;
    void getAppPreferences().then((prefs) => {
      if (!alive) return;
      setBoards(prefs.commandBugFilingBoards);
    });
    return () => {
      alive = false;
    };
  }, []);
  const selectedBoard =
    boards.length > 0 ? boards[Math.min(selectedBoardIdx, boards.length - 1)] : null;

  const reports = useMemo(
    () =>
      [...unit.bugReports].sort((a, b) => {
        // Submitted reports drift to the bottom; remaining sort by
        // severity then recency.
        if ((a.submittedJiraKey == null) !== (b.submittedJiraKey == null)) {
          return a.submittedJiraKey == null ? -1 : 1;
        }
        const sevDiff =
          SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (sevDiff !== 0) return sevDiff;
        return b.createdAtMs - a.createdAtMs;
      }),
    [unit.bugReports],
  );

  if (reports.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
        <div>
          <Bug className="mx-auto mb-2 h-6 w-6 opacity-50" />
          <p>No bugs filed yet.</p>
          <p className="mt-1 text-[10px] opacity-75">
            Ask this unit to hunt a feature — it'll fill this tab as it goes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full space-y-2 overflow-y-auto p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {reports.length} bug{reports.length === 1 ? "" : "s"} filed
        </div>
        {boards.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Board
            </span>
            <select
              value={selectedBoardIdx}
              onChange={(e) => setSelectedBoardIdx(Number(e.target.value))}
              className="h-7 rounded border border-white/15 bg-black/40 px-1.5 text-xs text-white/90 focus:border-white/30 focus:outline-none"
            >
              {boards.map((b, i) => (
                <option key={`${b.name}-${i}`} value={i}>
                  {b.name} ({b.projectKey})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {reports.map((r) => (
        <BugRow
          key={r.id}
          report={r}
          board={selectedBoard}
          preferredIdeId={preferredIdeId}
          onDismiss={() => dismissBugReport(unit.id, r.id)}
          onMarkSubmitted={(jiraKey) =>
            markBugSubmitted(unit.id, r.id, jiraKey)
          }
        />
      ))}
    </div>
  );
}

function BugRow({
  report,
  board,
  preferredIdeId,
  onDismiss,
  onMarkSubmitted,
}: {
  report: BugReport;
  board: BugFilingBoard | null;
  preferredIdeId: string;
  onDismiss: () => void;
  onMarkSubmitted: (jiraKey: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const submitted = report.submittedJiraKey != null;

  const handleCopy = async () => {
    const md = formatBugAsMarkdown(report);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be unavailable in some Tauri webview
      // contexts; the textarea fallback handles those cases.
      const ta = document.createElement("textarea");
      ta.value = md;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  const handleOpenJira = () => {
    const url = buildJiraCreateUrl(report, board);
    if (!url) {
      // No JIRA base URL known — fall back to clipboard.
      void handleCopy();
      return;
    }
    if (typeof window !== "undefined") window.open(url, "_blank");
  };

  const handleMarkSubmitted = () => {
    const key = window.prompt(
      "JIRA key for the ticket you just created (e.g. PROJ-1234):",
    );
    if (key && key.trim().length > 0) onMarkSubmitted(key.trim());
  };

  return (
    <div
      className={`rounded-md border bg-black/30 p-2.5 transition-colors ${
        submitted
          ? "border-emerald-700/40 bg-emerald-950/20"
          : "border-white/10"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="mt-0.5 shrink-0 text-white/50 hover:text-white"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={report.severity} />
            {submitted && (
              <span className="inline-flex items-center gap-1 rounded border border-emerald-600/60 bg-emerald-900/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-emerald-200">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {report.submittedJiraKey}
              </span>
            )}
            <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/90">
              {report.summary}
            </p>
          </div>
          {report.affectedFiles.length > 0 && !expanded && (
            <p className="mt-1 truncate font-mono text-[10px] text-white/50">
              {report.affectedFiles[0].path}
              {report.affectedFiles[0].lineRange
                ? `:${report.affectedFiles[0].lineRange}`
                : ""}
              {report.affectedFiles.length > 1
                ? `  +${report.affectedFiles.length - 1} more`
                : ""}
            </p>
          )}
        </div>
      </div>

      {expanded && (
        <div className="ml-5 mt-2 space-y-2 text-[11px] text-white/80">
          {report.description && (
            <FieldBlock label="Description" value={report.description} />
          )}
          {report.observedBehavior && (
            <FieldBlock label="Observed" value={report.observedBehavior} />
          )}
          {report.expectedBehavior && (
            <FieldBlock label="Expected" value={report.expectedBehavior} />
          )}
          {report.stepsToReproduce && (
            <FieldBlock
              label="Steps to reproduce"
              value={report.stepsToReproduce}
            />
          )}
          {report.suspectedRootCause && (
            <FieldBlock
              label="Suspected root cause"
              value={report.suspectedRootCause}
            />
          )}
          {report.affectedFiles.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">
                Affected files
              </div>
              <ul className="space-y-0.5">
                {report.affectedFiles.map((f, i) => {
                  const firstLine = (() => {
                    if (!f.lineRange) return undefined;
                    const m = f.lineRange.match(/^(\d+)/);
                    return m ? Number.parseInt(m[1], 10) : undefined;
                  })();
                  return (
                    <li
                      key={`${f.path}-${i}`}
                      className="flex items-center justify-between gap-2 rounded bg-black/40 px-1.5 py-0.5"
                    >
                      <span className="truncate font-mono text-[10px]">
                        {f.path}
                        {f.lineRange ? `  ·  lines ${f.lineRange}` : ""}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-[10px] text-white/40 hover:text-white"
                        title="Open in IDE"
                        onClick={() =>
                          openFileInIde({
                            ideId: preferredIdeId,
                            path: f.path,
                            line: firstLine,
                            worktreeRoot: null,
                          })
                        }
                      >
                        Open ↗
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[10px]"
              onClick={handleCopy}
            >
              <Copy className="mr-1 h-3 w-3" />
              {copied ? "Copied!" : "Copy as JIRA"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[10px]"
              onClick={handleOpenJira}
              title="Opens your JIRA create-issue page with these fields pre-filled (if your instance supports URL fill)"
            >
              <ExternalLink className="mr-1 h-3 w-3" />
              Open JIRA
            </Button>
            {!submitted && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[10px]"
                onClick={handleMarkSubmitted}
                title="After creating the ticket in JIRA, paste the key here to mark this bug as submitted"
              >
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Mark submitted
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px] text-red-300/80 hover:bg-red-950/40 hover:text-red-200"
              onClick={onDismiss}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <p className="whitespace-pre-wrap leading-relaxed text-white/80">
        {value}
      </p>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: BugSeverity }) {
  const cls = SEVERITY_STYLES[severity];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${cls}`}
    >
      <AlertTriangle className="h-2.5 w-2.5" />
      {severity}
    </span>
  );
}
