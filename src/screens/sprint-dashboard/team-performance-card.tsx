import { JiraTicketLink } from "@/components/JiraTicketLink";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type BitbucketPr } from "@/lib/tauri/bitbucket";
import { type JiraIssue } from "@/lib/tauri/jira";
import { cn } from "@/lib/utils";
import {
    ChevronDown,
    ChevronRight,
    Eye,
    EyeOff,
    GitPullRequest,
    Minus,
    TrendingDown,
    TrendingUp,
    User,
} from "lucide-react";
import { useState } from "react";
import {
    buildWorkloads,
    daysSince,
    statusCategory,
    totalPoints,
    type DevWorkload,
} from "./_shared";

// ── Load classification ───────────────────────────────────────────────────────
// "Underloaded" is a hard-threshold signal independent of the team-average
// classifier: a developer with at most one unstarted ticket (To Do / Needs
// Spec) is about to run out of work and needs more assigned. It supersedes
// the classifier's "underutilised" state because it's more actionable —
// you can act on "they have ≤1 thing in their queue" without first
// computing a team baseline.

type LoadBadge = "overloaded" | "balanced" | "underloaded";

const LOAD_STYLE: Record<
  LoadBadge,
  {
    badge: "destructive" | "success" | "secondary";
    /** Optional className to override the variant's colour — used for
     *  "underloaded" since the badge component doesn't ship a yellow
     *  variant and we want the row to draw attention. */
    badgeClassName?: string;
    icon: React.ElementType;
    label: string;
  }
> = {
  overloaded:  { badge: "destructive", icon: TrendingUp, label: "Overloaded" },
  balanced:    { badge: "success",     icon: Minus,      label: "Balanced" },
  underloaded: {
    badge: "secondary",
    badgeClassName:
      "border-yellow-500/50 bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
    icon: TrendingDown,
    label: "Underloaded",
  },
};

/** Tickets in "To Do" or "Needs Spec" status — i.e. work the developer
 *  has queued but hasn't picked up yet. The Underloaded threshold runs
 *  against this count. */
function countUnstartedTickets(issues: JiraIssue[]): number {
  return issues.filter((i) => {
    const s = i.status.trim().toLowerCase();
    return s === "to do" || s === "needs spec";
  }).length;
}

function loadBadgeFor(dev: { issues: JiraIssue[] }, workload: DevWorkload | undefined): LoadBadge {
  if (countUnstartedTickets(dev.issues) <= 1) return "underloaded";
  if (workload?.loadStatus === "overloaded") return "overloaded";
  // The classifier's "underutilised" collapses into "balanced" here — the
  // new Underloaded rule already covers the actionable case; mid-range
  // statistical "underutilised" without ≤1 unstarted tickets isn't
  // distinct enough to warrant its own colour in the combined view.
  return "balanced";
}

// ── Dev stats ─────────────────────────────────────────────────────────────────

export interface DevStats {
  name: string;
  issues: JiraIssue[];
  assignedPts: number;
  donePts: number;
  doneCount: number;
  inProgressPts: number;
  inProgressCount: number;
  inReviewPts: number;
  inReviewCount: number;
  totalCount: number;
  openPrs: BitbucketPr[];
  mergedPrs: BitbucketPr[];
}

export function buildDevStats(
  issues: JiraIssue[],
  openPrs: BitbucketPr[],
  mergedPrs: BitbucketPr[]
): DevStats[] {
  const map = new Map<string, JiraIssue[]>();

  for (const issue of issues) {
    const name = issue.assignee?.displayName ?? "Unassigned";
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(issue);
  }

  return Array.from(map.entries())
    .map(([name, devIssues]) => {
      const done       = devIssues.filter((i) => statusCategory(i) === "done");
      const inReview   = devIssues.filter((i) => statusCategory(i) === "inreview");
      const inProgress = devIssues.filter((i) => statusCategory(i) === "inprogress");
      return {
        name,
        issues: devIssues,
        assignedPts:     totalPoints(devIssues),
        donePts:         totalPoints(done),
        doneCount:       done.length,
        inProgressPts:   totalPoints(inProgress),
        inProgressCount: inProgress.length,
        inReviewPts:     totalPoints(inReview),
        inReviewCount:   inReview.length,
        totalCount:      devIssues.length,
        openPrs:   openPrs.filter((p) => p.author.displayName === name),
        mergedPrs: mergedPrs.filter((p) => p.author.displayName === name),
      };
    })
    .sort((a, b) => b.donePts - a.donePts);
}

function DevRow({
  dev,
  workload,
  ignored,
  onToggleIgnored,
}: {
  dev: DevStats;
  workload: DevWorkload | undefined;
  ignored: boolean;
  onToggleIgnored: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const badge = ignored ? null : loadBadgeFor(dev, workload);
  const style = badge ? LOAD_STYLE[badge] : null;
  const Icon = style?.icon;

  return (
    <div className={`border-b last:border-0 ${ignored ? "opacity-50" : ""}`}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 py-3 text-sm text-left hover:bg-muted/40 px-1 rounded transition-colors"
      >
        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium truncate">{dev.name}</span>
            {style && Icon && (
              <Badge
                variant={style.badge}
                className={cn(
                  "text-[10px] gap-0.5 shrink-0",
                  style.badgeClassName,
                )}
              >
                <Icon className="h-2.5 w-2.5" />
                {style.label}
              </Badge>
            )}
            {ignored && (
              <span className="text-[10px] text-muted-foreground shrink-0">Not tracked</span>
            )}
            <span className="text-xs text-muted-foreground shrink-0 ml-auto">
              {dev.doneCount + dev.inReviewCount + dev.inProgressCount}/{dev.totalCount} tickets
            </span>
          </div>
          {/* Segmented bar: done | in review | in progress (by ticket count) */}
          <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
            {dev.totalCount > 0 && dev.doneCount > 0 && (
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${(dev.doneCount / dev.totalCount) * 100}%` }}
                title={`Done: ${dev.doneCount} tickets`}
              />
            )}
            {dev.totalCount > 0 && dev.inReviewCount > 0 && (
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${(dev.inReviewCount / dev.totalCount) * 100}%` }}
                title={`In Review: ${dev.inReviewCount} tickets`}
              />
            )}
            {dev.totalCount > 0 && dev.inProgressCount > 0 && (
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${(dev.inProgressCount / dev.totalCount) * 100}%` }}
                title={`In Progress: ${dev.inProgressCount} tickets`}
              />
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
          <span title={`Done: ${dev.doneCount} · In Review: ${dev.inReviewCount} · In Progress: ${dev.inProgressCount}`}>
            <span className="text-emerald-600 font-medium">{dev.doneCount}</span>
            {dev.inReviewCount > 0 && <span className="text-blue-500 font-medium">+{dev.inReviewCount}</span>}
            {dev.inProgressCount > 0 && <span className="text-amber-500 font-medium">+{dev.inProgressCount}</span>}
            <span>/{dev.totalCount}</span>
          </span>
          {(dev.openPrs.length > 0 || dev.mergedPrs.length > 0) && (
            <span
              className="flex items-center gap-0.5"
              title={`${dev.openPrs.length} open PR(s), ${dev.mergedPrs.length} merged`}
            >
              <GitPullRequest className="h-3 w-3" />
              {dev.openPrs.length + dev.mergedPrs.length}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleIgnored();
            }}
            title={ignored ? "Start tracking" : "Stop tracking"}
            className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
          >
            {ignored ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="pb-3 px-1 space-y-1">
          {dev.issues.map((issue) => {
            const cat = statusCategory(issue);
            const dotColor =
              cat === "done"
                ? "bg-emerald-500"
                : cat === "inreview"
                ? "bg-blue-500"
                : cat === "inprogress"
                ? "bg-amber-500"
                : "bg-muted-foreground/30";
            return (
              <div key={issue.key} className="flex items-center gap-2 text-xs py-1 pl-10">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
                <JiraTicketLink ticketKey={issue.key} url={issue.url} />
                <span className="truncate text-muted-foreground">{issue.summary}</span>
                {issue.storyPoints != null && (
                  <span className="shrink-0 text-muted-foreground/60">
                    {issue.storyPoints}pt
                  </span>
                )}
                <span className="shrink-0 text-muted-foreground/60 ml-auto">{issue.status}</span>
              </div>
            );
          })}
          {dev.openPrs.length > 0 && (
            <div className="pl-10 pt-1 space-y-1">
              {dev.openPrs.map((pr) => (
                <div key={pr.id} className="flex items-center gap-2 text-xs py-0.5 text-blue-500">
                  <GitPullRequest className="h-3 w-3 shrink-0" />
                  <span className="truncate">#{pr.id} {pr.title}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {daysSince(pr.createdOn)}d old
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TeamPerformanceCard({
  devStats,
  issues,
  openPrs,
  ignoredDevs,
  onToggleIgnoredDev,
}: {
  devStats: DevStats[];
  issues: JiraIssue[];
  openPrs: BitbucketPr[];
  ignoredDevs: Set<string>;
  onToggleIgnoredDev: (name: string) => void;
}) {
  // Pull the classifier-derived load status so the existing
  // overloaded/balanced classification still feeds into the badge.
  const workloads = buildWorkloads(issues, openPrs);
  const workloadByName = new Map(workloads.map((w) => [w.name, w]));

  // Header summary — tallied across tracked (non-ignored) devs only so
  // hiding someone with `EyeOff` actually removes them from the chips.
  const tracked = devStats.filter((d) => !ignoredDevs.has(d.name));
  let overloadedCount = 0;
  let underloadedCount = 0;
  let totalRemaining = 0;
  for (const dev of tracked) {
    const badge = loadBadgeFor(dev, workloadByName.get(dev.name));
    if (badge === "overloaded") overloadedCount++;
    else if (badge === "underloaded") underloadedCount++;
    totalRemaining += dev.totalCount - dev.doneCount;
  }
  const avgRemaining = tracked.length > 0 ? Math.round(totalRemaining / tracked.length) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Team Performance</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Team avg <strong className="text-foreground tabular-nums">{avgRemaining}</strong> tickets remaining
            </span>
            {overloadedCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <TrendingUp className="h-2.5 w-2.5" />
                {overloadedCount} overloaded
              </Badge>
            )}
            {underloadedCount > 0 && (
              <Badge
                variant="secondary"
                className="gap-1 border-yellow-500/50 bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300"
              >
                <TrendingDown className="h-2.5 w-2.5" />
                {underloadedCount} underloaded
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3">
        {devStats.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No assigned issues found.
          </p>
        ) : (
          <>
            {[...devStats]
              .sort((a, b) => {
                // Sink ignored devs to the bottom, preserving donePts ordering
                // (already applied by buildDevStats) within each group.
                const aIg = ignoredDevs.has(a.name) ? 1 : 0;
                const bIg = ignoredDevs.has(b.name) ? 1 : 0;
                return aIg - bIg;
              })
              .map((dev) => (
                <DevRow
                  key={dev.name}
                  dev={dev}
                  workload={workloadByName.get(dev.name)}
                  ignored={ignoredDevs.has(dev.name)}
                  onToggleIgnored={() => onToggleIgnoredDev(dev.name)}
                />
              ))}
            <div className="flex items-center gap-4 pt-3 pb-1 px-1 border-t mt-1">
              <span className="text-[10px] text-muted-foreground">Legend:</span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-2 w-2 rounded-sm bg-emerald-500 inline-block" /> Done
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-2 w-2 rounded-sm bg-blue-500 inline-block" /> In Review
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-2 w-2 rounded-sm bg-amber-500 inline-block" /> In Progress
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
