// MyPrsTab — the Address-PR-Tasks role's review surface.
//
// Each `submit_pr_comment_addressed` MCP call lands as an entry
// grouped by PR. The user picks a PR from the left list, sees each
// addressed comment with the original text, the agent's change
// summary, the unified diff, and a button to open the changed file
// in their preferred IDE.
//
// The agent commits locally but never pushes — the user reviews
// these changes in their checkout and pushes themselves once happy.

import { ExternalLink, FileCode2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { openFileInIde } from "@/lib/ideLauncher";
import { openUrl } from "@/lib/tauri/core";
import { useCommandStore, type CommandUnit } from "@/stores/command/store";
import type { AddressedComment, AddressedPr } from "@/lib/commandPrWork";

export function MyPrsTab({ unit }: { unit: CommandUnit }) {
  const preferredIdeId = useCommandStore((s) => s.preferredIdeId);
  const prs = useMemo(
    () =>
      [...unit.addressedPrs].sort(
        (a, b) => b.lastUpdatedMs - a.lastUpdatedMs,
      ),
    [unit.addressedPrs],
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
          <FileCode2 className="mx-auto mb-2 h-6 w-6 opacity-50" />
          <p>No PR comments addressed yet.</p>
          <p className="mt-1 text-[10px] opacity-75">
            Ask this unit to address comments on your open PRs — they'll
            land here once it commits locally.
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
          {prs.length} PR{prs.length === 1 ? "" : "s"}
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
            <span className="text-[10px] text-muted-foreground">
              {p.comments.length} addressed
            </span>
          </button>
        ))}
      </div>
      {/* Right — selected PR's addressed comments */}
      <div className="flex-1 min-w-0 overflow-y-auto p-3">
        {selected && (
          <PrDetail
            pr={selected}
            preferredIdeId={preferredIdeId}
            worktreeRoot={selected.worktreePath}
          />
        )}
      </div>
    </div>
  );
}

function PrDetail({
  pr,
  preferredIdeId,
  worktreeRoot,
}: {
  pr: AddressedPr;
  preferredIdeId: string;
  worktreeRoot: string | null;
}) {
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
        </div>
        <p className="mt-1 text-sm font-medium text-white/90">
          {pr.pr.title}
        </p>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          branch: {pr.pr.branch}
          {worktreeRoot ? `  ·  worktree: ${worktreeRoot}` : ""}
        </p>
      </div>

      <div className="space-y-2">
        {pr.comments.map((c) => (
          <AddressedCommentRow
            key={c.id}
            comment={c}
            preferredIdeId={preferredIdeId}
            worktreeRoot={worktreeRoot}
          />
        ))}
      </div>
    </div>
  );
}

function AddressedCommentRow({
  comment,
  preferredIdeId,
  worktreeRoot,
}: {
  comment: AddressedComment;
  preferredIdeId: string;
  worktreeRoot: string | null;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-black/30 p-2.5 space-y-2">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-white/40">
          Original comment · {comment.commentAuthor || "unknown"}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap leading-relaxed text-white/80">
          {comment.originalText}
        </p>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-amber-300/80">
          Change summary
        </div>
        <p className="mt-0.5 text-white/90">{comment.changeSummary}</p>
      </div>
      {comment.diff && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/40">
            Diff
          </div>
          <pre className="mt-0.5 max-h-64 overflow-auto rounded bg-black/60 p-2 font-mono text-[10px] leading-relaxed">
            {comment.diff.split("\n").map((line, i) => {
              const cls = line.startsWith("+")
                ? "text-emerald-300"
                : line.startsWith("-")
                  ? "text-rose-300"
                  : line.startsWith("@@")
                    ? "text-cyan-300"
                    : "text-white/70";
              return (
                <div key={i} className={cls}>
                  {line || " "}
                </div>
              );
            })}
          </pre>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] text-white/50">
          {comment.filePath}
          {comment.startLine ? `:${comment.startLine}` : ""}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[10px]"
          onClick={() =>
            openFileInIde({
              ideId: preferredIdeId,
              path: comment.filePath,
              line: comment.startLine ?? undefined,
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
