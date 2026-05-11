import { ChatWindow } from "@/components/ChatWindow";
import {
    createGlobalCommands,
    type ChatTurn,
    type SlashCommand,
} from "@/lib/slashCommands";
import { currentModelKeyFor } from "@/lib/tauri/core";
import { chatSprintDashboard, generateWorkloadSuggestions } from "@/lib/tauri/workflows";
import { subscribeWorkflowStream } from "@/lib/workflowStream";
import { useChatHistoryStore } from "@/stores/chatHistoryStore";
import { useTokenUsageStore } from "@/stores/tokenUsageStore";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
    buildWorkloads,
    businessDaysAgo,
    daysRemaining,
    formatWorkloadForClaude,
    statusCategory,
    totalPoints,
    type DashboardData,
} from "./_shared";

// ── Chat panel ────────────────────────────────────────────────────────────────

/** Stable empty-turns ref so the SprintChatPanel selector returns the
 *  same array reference when no history exists yet (avoiding render
 *  loops). */
const EMPTY_TURNS: ChatTurn[] = [];

function buildSprintContext(data: DashboardData): string {
  const workloads = buildWorkloads(data.issues, data.openPrs);
  const unstarted = data.issues.filter((i) => statusCategory(i) === "todo");
  const days = daysRemaining(data.sprint?.endDate ?? null);

  const lines: string[] = [];
  lines.push(`Sprint: ${data.sprint?.name ?? "(combined view across active sprints)"}`);
  if (data.sprint?.startDate) lines.push(`Start: ${data.sprint.startDate}`);
  if (data.sprint?.endDate) {
    lines.push(`End: ${data.sprint.endDate} (${days ?? "?"} days remaining)`);
  }
  lines.push(
    `Totals: ${data.issues.length} tickets, ${totalPoints(data.issues)}pt across the sprint.`,
  );
  lines.push("");

  lines.push("ISSUES:");
  for (const i of data.issues) {
    const assignee = i.assignee?.displayName ?? "Unassigned";
    const pts = i.storyPoints != null ? `${i.storyPoints}pt` : "?pt";
    lines.push(
      `  ${i.key} [${i.status}] "${i.summary}" — ${assignee} — ${pts}`,
    );
  }
  lines.push("");

  lines.push("OPEN PRS:");
  if (data.openPrs.length === 0) {
    lines.push("  (none)");
  } else {
    for (const pr of data.openPrs) {
      const approvals = pr.reviewers.filter((r) => r.approved).length;
      const flags = [
        pr.draft ? "draft" : null,
        pr.changesRequested ? "changes-requested" : null,
      ]
        .filter(Boolean)
        .join(", ");
      const ageBd = Math.floor(businessDaysAgo(pr.createdOn));
      lines.push(
        `  #${pr.id} "${pr.title}" by ${pr.author.displayName} — ${approvals} approval${approvals === 1 ? "" : "s"}, ${ageBd}bd old${flags ? ` (${flags})` : ""}`,
      );
    }
  }
  lines.push("");

  lines.push(formatWorkloadForClaude(data.sprint, workloads, unstarted));
  return lines.join("\n");
}

export function SprintChatPanel({
  data,
  aiAvailable,
  sprintKey,
}: {
  data: DashboardData | null;
  aiAvailable: boolean;
  sprintKey: string;
}) {
  // Conversation lives in the chat-history store keyed by sprint, so
  // navigating away from the dashboard and back preserves the thread.
  const history = useChatHistoryStore(
    (s) => s.histories.sprint_dashboard?.[sprintKey] ?? EMPTY_TURNS,
  );
  const setStoredHistory = useChatHistoryStore((s) => s.setHistory);
  const setHistory = useCallback(
    (next: ChatTurn[] | ((prev: ChatTurn[]) => ChatTurn[])) => {
      const current =
        useChatHistoryStore.getState().histories.sprint_dashboard?.[sprintKey] ??
        [];
      const resolved = typeof next === "function" ? next(current) : next;
      setStoredHistory("sprint_dashboard", sprintKey, resolved);
    },
    [setStoredHistory, sprintKey],
  );
  const clearChatContext = useTokenUsageStore((s) => s.clearPanelChatLastInput);
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState("");

  // Keep a ref so callbacks see the latest snapshot without having to rebuild
  // on every sprint data tick.
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!aiAvailable) {
        toast.error("Configure an AI provider in Settings to use chat.");
        return;
      }
      if (!dataRef.current) {
        toast.error("Load sprint data before chatting.");
        return;
      }
      const userMsg: ChatTurn = { role: "user", content: text };
      const nextHistory: ChatTurn[] = [...history, userMsg];
      setHistory(nextHistory);
      setStreamText("");
      setBusy(true);
      const stream = await subscribeWorkflowStream(
        "sprint-dashboard-chat-workflow-event",
        (t) => setStreamText(t),
        {
          onUsage: (usage) =>
            useTokenUsageStore
              .getState()
              .setCurrentCallUsage(
                "sprint_dashboard",
                usage,
                currentModelKeyFor("sprint_dashboard"),
              ),
        },
      );
      try {
        const context = buildSprintContext(dataRef.current);
        const reply = await chatSprintDashboard(
          context,
          JSON.stringify(nextHistory),
        );
        setHistory([
          ...nextHistory,
          { role: "assistant", content: reply.trim() },
        ]);
      } catch (e) {
        toast.error("Chat failed", { description: String(e) });
      } finally {
        await stream.dispose();
        setStreamText("");
        setBusy(false);
      }
    },
    [history, aiAvailable],
  );

  const runRebalance = useCallback(async () => {
    if (!aiAvailable) {
      toast.error("Configure an AI provider in Settings to use /rebalance.");
      return;
    }
    if (!dataRef.current) {
      toast.error("Load sprint data before rebalancing.");
      return;
    }
    const { sprint, issues, openPrs } = dataRef.current;
    const workloads = buildWorkloads(issues, openPrs);
    const unstarted = issues.filter((i) => statusCategory(i) === "todo");
    const userMsg: ChatTurn = { role: "user", content: "/rebalance" };
    const nextHistory: ChatTurn[] = [...history, userMsg];
    setHistory(nextHistory);
    setStreamText("");
    setBusy(true);
    const stream = await subscribeWorkflowStream(
      "workload-suggestions-workflow-event",
      (t) => setStreamText(t),
      {
        onUsage: (usage) =>
          useTokenUsageStore
            .getState()
            .setCurrentCallUsage(
              "sprint_dashboard",
              usage,
              currentModelKeyFor("sprint_dashboard"),
            ),
      },
    );
    try {
      const text = formatWorkloadForClaude(sprint, workloads, unstarted);
      const result = await generateWorkloadSuggestions(text);
      setHistory([
        ...nextHistory,
        { role: "assistant", content: result.trim() },
      ]);
    } catch (e) {
      toast.error("Rebalance failed", { description: String(e) });
    } finally {
      await stream.dispose();
      setStreamText("");
      setBusy(false);
    }
  }, [history, aiAvailable]);

  const commands: SlashCommand[] = useMemo(
    () => [
      ...createGlobalCommands({
        history,
        clearHistory: () => {
          setHistory([]);
          clearChatContext("sprint_dashboard");
        },
        sendMessage,
        removeLastAssistantMessage: () =>
          setHistory((h) =>
            h[h.length - 1]?.role === "assistant" ? h.slice(0, -1) : h,
          ),
      }),
      {
        name: "rebalance",
        description:
          "Analyse workload distribution and suggest ticket reassignments",
        execute: async () => {
          await runRebalance();
        },
      },
      {
        name: "standup",
        description: "Generate a concise standup briefing for this sprint",
        execute: async () => {
          await sendMessage(
            "Write a concise standup briefing for this sprint. Three short sections: " +
              "**Shipped** (tickets done or PRs merged since yesterday), " +
              "**In flight** (what each developer is actively working on), " +
              "**Blocked / at risk** (blockers, stalled PRs, overloaded people). " +
              "Reference ticket keys and names. Keep it tight — this is read aloud in 2 minutes.",
          );
        },
      },
      {
        name: "risks",
        description: "Rank at-risk tickets with reasons",
        execute: async () => {
          await sendMessage(
            "List the tickets most at risk of not completing this sprint, ranked by severity. " +
              "For each, cite the ticket key and a one-line reason (e.g. stale PR, blocked status, " +
              "overloaded assignee, missing AC, no activity). Group them under **High**, **Medium**, **Low**.",
          );
        },
      },
      {
        name: "stale",
        description: "List PRs that have gone stale",
        execute: async () => {
          await sendMessage(
            "List the open PRs that have gone stale (≥5 business days old, or ≥3 business days since last update). " +
              "For each, give: PR number, title, author, age, and a suggested nudge (e.g. ping a reviewer, " +
              "rebase, split into smaller PRs). Skip drafts unless they've been drafts for over a week.",
          );
        },
      },
      {
        name: "ready",
        description: "List PRs that could move to QA / merge",
        execute: async () => {
          await sendMessage(
            "List the open PRs that are ready to move forward: 2+ approvals, no changes-requested, " +
              "and not drafts. For each, cite the PR number, title, author, and any remaining PR tasks " +
              "that still need to be resolved before merge.",
          );
        },
      },
      {
        name: "dev",
        description: "Focus the next question on a specific developer",
        args: "<name>",
        execute: ({ args, setInput }) => {
          const name = args.trim();
          if (!name) {
            setInput("/dev ");
            return;
          }
          setInput(`Focus on ${name} — `);
        },
      },
      {
        name: "ticket",
        description: "Focus the next question on a specific ticket",
        args: "<KEY>",
        execute: ({ args, setInput }) => {
          const key = args.trim();
          if (!key) {
            setInput("/ticket ");
            return;
          }
          setInput(`What's the status of ${key} — `);
        },
      },
    ],
    [history, sendMessage, runRebalance],
  );

  return (
    <ChatWindow
      bare
      headerLabel="Ask about this sprint"
      headerExtras={
        busy ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
          </span>
        ) : null
      }
      messages={history.map((m, i) => ({
        id: i,
        role: m.role === "user" ? "user" : "agent",
        text: m.content,
      }))}
      streamingText={busy ? streamText : null}
      onSend={sendMessage}
      busy={busy}
      placeholder="Ask about this sprint. Enter to send. / for commands."
      inputDisabled={!aiAvailable}
      commands={commands}
      emptyState={
        <p className="text-xs text-muted-foreground italic text-center pt-6">
          {aiAvailable ? (
            <>
              Ask anything about this sprint — velocity, blockers, at-risk
              tickets, or who's overloaded. Try{" "}
              <span className="font-mono">/rebalance</span> for workload
              suggestions. Type <span className="font-mono">/</span> to see
              all commands.
            </>
          ) : (
            "Configure an AI provider in Settings to chat about this sprint."
          )}
        </p>
      }
    />
  );
}
