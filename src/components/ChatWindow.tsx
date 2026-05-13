// Unified chat-window component every conversation panel in the app
// shares. Consolidates the layout, scroll behaviour, queue handling,
// streaming-bubble rendering, tool-call inlining, slash-command input,
// and "queued" bubble UI that used to be duplicated across:
//
//   - Sprint dashboard chat
//   - Groom Ticket chat
//   - Meetings chat
//   - PR Review chat
//   - Cross-Meetings chat
//
// Each panel passes its specific data (messages, commands, optional
// streaming state, optional tool log, optional pause/resume controls)
// and the component handles the rest. Customisation lives in props,
// not in forking the layout.

import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AgentBubble,
  QueuedBubble,
  ToolActivityBubble,
  UserBubble,
} from "@/components/ChatBubble";
import { SlashCommandInput } from "@/components/SlashCommandInput";
import { type SlashCommand } from "@/lib/slashCommands";
import { useChatQueue } from "@/lib/useChatQueue";
import type { BuildLogEntry } from "@/lib/tauri/workflows";
import { cn } from "@/lib/utils";

export interface ChatWindowMessage {
  /** Stable id for React keys. Index works for append-only lists. */
  id: string | number;
  role: "user" | "agent" | "subagent";
  /** Plain-text body. Markdown rendering is handled by AgentBubble.
   *  Unused for `role: "subagent"` — that variant draws from
   *  `subagentData` instead. */
  text: string;
  /** Optional tool-call entries to render inline at the bottom of this
   *  agent bubble. Use this when the parent has distributed tools
   *  chronologically across multiple agent turns (e.g. the Build
   *  phase's per-thought clustering). When any message provides this
   *  field, the global `toolLog` prop is ignored. */
  tools?: BuildLogEntry[];
  /** Pending/queued user message that hasn't been sent yet — only
   *  meaningful when role === "user". Renders with the dashed
   *  "queued" treatment so it's visually distinct from sent
   *  messages. */
  pending?: boolean;
  /** Payload for role === "subagent". The build panel emits these
   *  for each delegated subagent run so the chat stream renders a
   *  nested investigation card inline with the parent's turns. */
  subagentData?: {
    task: string;
    budget: number;
    steps: { step: number; tool: string; ok: boolean }[];
    done: boolean;
    stepsUsed?: number;
    confidence?: "low" | "medium" | "high";
    summary?: string;
    recommendedAction?: string;
    parseError?: boolean;
  };
}

export interface ChatWindowProps {
  // ── Data ──────────────────────────────────────────────────────────
  /** Append-only list of finalised messages — what's already in
   *  the conversation history. */
  messages: ChatWindowMessage[];

  /** Tool calls executed by the agent during the current run. When
   *  provided, each tool call is rendered inline at the bottom of the
   *  most recent agent bubble (matching the Build phase pattern), or
   *  as a standalone "Tool calls" bubble when there's no preceding
   *  agent message yet. Pass nothing to hide the tool list entirely. */
  toolLog?: BuildLogEntry[];

  /** Live streaming agent reply. When non-null/non-empty, renders as a
   *  spinner-decorated agent bubble after the last finalised message
   *  (cleared by the parent when the message commits to `messages`). */
  streamingText?: string | null;

  /** Live tool indicator — shown once per call (replaces, no
   *  accumulation). Independent of `toolLog` so the parent can show
   *  the in-flight tool while the log is busy persisting earlier
   *  calls. */
  activeTool?: { name: string; arg: string } | null;

  /** Slot above the messages list (e.g. a status banner). */
  beforeMessages?: ReactNode;
  /** Slot below the messages list, before the streaming bubble (e.g.
   *  the Plan phase's open-questions callout). */
  afterMessages?: ReactNode;

  /** Empty-state rendered when messages.length === 0 and
   *  streamingText is empty. Keeps the layout filled so a fresh chat
   *  doesn't read as broken. */
  emptyState?: ReactNode;

  // ── Send + queue ─────────────────────────────────────────────────
  /** The chat's send action. Called with one message at a time —
   *  queueing is handled internally so the parent never sees
   *  concurrency. */
  onSend: (text: string) => void | Promise<unknown>;
  /** Whether the agent is currently processing. Drives the queueing
   *  behaviour AND the placeholder/footnote text in the input. */
  busy?: boolean;

  // ── Input ────────────────────────────────────────────────────────
  /** Placeholder shown when the agent is idle. */
  placeholder?: string;
  /** Placeholder shown when busy=true. Defaults to a generic queue
   *  message. */
  busyPlaceholder?: string;
  /** Hide the input entirely (e.g. when AI isn't configured). */
  inputDisabled?: boolean;

  // ── Slash commands ───────────────────────────────────────────────
  commands?: SlashCommand[];

  // ── Header ───────────────────────────────────────────────────────
  /** Header text shown above the messages list. Defaults to
   *  "Conversation". Pass an empty string to hide the header strip. */
  headerLabel?: string;
  /** Custom icon for the header. Defaults to a Sparkles icon. */
  headerIcon?: ReactNode;
  /** Right-aligned content rendered next to the header label —
   *  typically a small badge or a pause/resume button. */
  headerExtras?: ReactNode;

  // ── Optional pause/resume controls ───────────────────────────────
  /** When provided alongside `onPause`/`onResume`, an Esc keypress
   *  toggles between pause and resume while busy=true. */
  paused?: boolean;
  onPause?: () => void;
  onResume?: () => void;

  // ── Optional input affordance ────────────────────────────────────
  /** Tag pool for the SlashCommandInput's #tag autocomplete. */
  tagPool?: string[];
  /** Name pool for the @name autocomplete. */
  namePool?: string[];

  // ── Layout overrides ─────────────────────────────────────────────
  /** Tailwind classes appended to the outermost wrapper. Use to
   *  override defaults like the rounded-md border + bg-card/40
   *  applied by default. */
  className?: string;
  /** Suppress the default outer border + bg-card/40 so the component
   *  can be embedded inline with a parent that already provides its
   *  own card chrome. */
  bare?: boolean;
}

export function ChatWindow({
  messages,
  toolLog,
  streamingText,
  activeTool,
  beforeMessages,
  afterMessages,
  emptyState,
  onSend,
  busy = false,
  placeholder,
  busyPlaceholder,
  inputDisabled,
  commands = [],
  headerLabel = "Conversation",
  headerIcon,
  headerExtras,
  paused,
  onPause,
  onResume,
  tagPool,
  namePool,
  className,
  bare,
}: ChatWindowProps) {
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);

  // Queue messages typed while the agent is busy. The hook drains the
  // first queued item the moment busy flips false.
  const { enqueueOrSend, queue: pending } = useChatQueue({
    send: onSend,
    busy,
  });

  // Sticky-bottom auto-scroll. Glues to the bottom while content
  // grows; yields when the user scrolls up; re-engages when they
  // scroll back into the bottom-32px tolerance band.
  const onScrollList = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 32;
  }, []);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stuck.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, streamingText, pending.length, toolLog?.length]);

  // Esc toggles pause/resume. Wired only when both callbacks are
  // provided — the parent can disable Esc-handling for a given chat
  // turn by passing undefined for `onPause`/`onResume`. Decoupled
  // from the `busy` flag so panels that own their own queueing
  // (e.g. Build phase) can wire pause without inheriting ChatWindow's
  // internal message-queue behaviour.
  useEffect(() => {
    if (!onPause || !onResume) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (paused) onResume();
      else onPause();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paused, onPause, onResume]);

  // Build the merged item list. Tool-log entries get attached to the
  // most recent agent bubble (matching the Build phase's "agent
  // reasoning + tools it ran" grouping) when both are present.
  type ChatItem =
    | {
        kind: "user";
        key: string | number;
        text: string;
        pending?: boolean;
      }
    | {
        kind: "agent";
        key: string | number;
        text: string;
        tools: BuildLogEntry[];
      }
    | { kind: "tool-only"; key: string; tools: BuildLogEntry[] }
    | {
        kind: "subagent";
        key: string | number;
        subagentData: NonNullable<ChatWindowMessage["subagentData"]>;
      };

  // When any message carries a `.tools` array the parent has already
  // distributed tools chronologically across turns; honour that
  // distribution and skip the global `toolLog` fallback so we don't
  // double-render entries.
  const hasPerMessageTools = messages.some(
    (m) => m.role === "agent" && m.tools && m.tools.length > 0,
  );

  const items: ChatItem[] = (() => {
    const out: ChatItem[] = [];
    let lastAgent: Extract<ChatItem, { kind: "agent" }> | null = null;
    for (const m of messages) {
      if (m.role === "user") {
        out.push({
          kind: "user",
          key: m.id,
          text: m.text,
          pending: m.pending,
        });
        lastAgent = null;
      } else if (m.role === "subagent" && m.subagentData) {
        out.push({
          kind: "subagent",
          key: m.id,
          subagentData: m.subagentData,
        });
        // Don't treat subagent cards as "the last agent" — tool-log
        // entries from the global toolLog (when used) should still
        // attach to the actual parent agent above this card, not the
        // subagent card itself.
      } else {
        const agent: Extract<ChatItem, { kind: "agent" }> = {
          kind: "agent",
          key: m.id,
          text: m.text,
          tools: m.tools ? [...m.tools] : [],
        };
        out.push(agent);
        lastAgent = agent;
      }
    }
    if (!hasPerMessageTools && toolLog && toolLog.length > 0) {
      // Distribute tool entries chronologically by tsMs. Entries that
      // arrived AFTER the latest agent message belong to it; any that
      // arrived before any agent message become a tool-only bubble at
      // the top.
      const sortedTools = [...toolLog].sort((a, b) => a.tsMs - b.tsMs);
      if (lastAgent) {
        lastAgent.tools = sortedTools;
      } else {
        out.unshift({
          kind: "tool-only",
          key: "tool-only",
          tools: sortedTools,
        });
      }
    }
    return out;
  })();

  // `flex-1 h-full` ensures the container always fills its parent:
  //   - flex-1 takes effect when the parent is a flex column (the
  //     common case — sidebar panels) so the messages area can grow
  //     and push the input to the bottom even when the chat starts
  //     with zero messages.
  //   - h-full handles non-flex parents that provide an explicit
  //     height. Both can sit alongside each other harmlessly.
  // Without one of these, an empty chat collapses to its intrinsic
  // content height and the input bunches up at the top.
  const containerClasses = bare
    ? cn("flex-1 h-full min-h-0 flex flex-col", className)
    : cn(
        "flex-1 h-full min-h-0 flex flex-col rounded-md border bg-card/40",
        className,
      );

  return (
    <div className={containerClasses}>
      {headerLabel && (
        <div className="px-3 py-2 border-b text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-2">
          {headerIcon ?? <Sparkles className="h-3 w-3" />}
          <span className="flex-1">{headerLabel}</span>
          {headerExtras}
        </div>
      )}

      <div
        ref={listRef}
        onScroll={onScrollList}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2"
      >
        {beforeMessages}

        {items.length === 0 && !streamingText && (emptyState ?? null)}

        {(() => {
          // Anchor the active-tool spinner inline at the bottom of the
          // most recent agent (or tool-only) bubble's tool list. That
          // way the user sees the in-flight tool exactly where its
          // completed entry will land — same row format, just with a
          // spinner instead of a step number — rather than as a
          // separate bubble below the conversation.
          let lastToolHostIdx = -1;
          for (let i = items.length - 1; i >= 0; i--) {
            const k = items[i].kind;
            if (k === "agent" || k === "tool-only") {
              lastToolHostIdx = i;
              break;
            }
          }
          return items.map((item, idx) => {
            const showActive = idx === lastToolHostIdx ? activeTool : null;
            if (item.kind === "user") {
              return item.pending ? (
                <QueuedBubble key={item.key} text={item.text} />
              ) : (
                <UserBubble key={item.key} text={item.text} />
              );
            }
            if (item.kind === "subagent") {
              return (
                <SubagentCard key={item.key} data={item.subagentData} />
              );
            }
            if (item.kind === "tool-only") {
              return (
                <AgentBubble key={item.key} label="Tool calls">
                  <ToolList entries={item.tools} active={showActive} />
                </AgentBubble>
              );
            }
            return (
              <AgentBubble key={item.key} text={item.text}>
                {(item.tools.length > 0 || showActive) && (
                  <div className="border-t pt-2">
                    <ToolList entries={item.tools} active={showActive} />
                  </div>
                )}
              </AgentBubble>
            );
          });
        })()}

        {streamingText && streamingText.trim().length > 0 && (
          <AgentBubble streaming text={streamingText} />
        )}

        {/* Fallback: when there's no agent/tool-only bubble yet (very
            first iteration), render the active tool as a standalone
            bubble so it still shows. Once any agent message lands, the
            spinner moves inline above. */}
        {activeTool &&
          !items.some((i) => i.kind === "agent" || i.kind === "tool-only") && (
            <ToolActivityBubble name={activeTool.name} arg={activeTool.arg} />
          )}

        {pending.map((text, i) => (
          <QueuedBubble key={`pending-${i}`} text={text} />
        ))}

        {afterMessages}
      </div>

      {!inputDisabled && (
        <div className="border-t px-3 py-2 shrink-0">
          <SlashCommandInput
            value={input}
            onChange={setInput}
            onSend={(text) => {
              setInput("");
              enqueueOrSend(text);
            }}
            commands={commands}
            placeholder={
              busy
                ? busyPlaceholder ??
                  "Agent is working — your message will be queued. Enter to send."
                : placeholder ?? "Type a message. Enter to send. / for commands."
            }
            sendKey="enter"
            rows={2}
            tagPool={tagPool}
            namePool={namePool}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Enter to send · Shift+Enter for newline · type <code>/</code> for commands
            {busy && " · queued until the agent finishes its turn"}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Tool-list helper ──────────────────────────────────────────────────────────

function ToolList({
  entries,
  active,
}: {
  entries: BuildLogEntry[];
  /** In-flight tool to render as the next row with a spinner instead
   *  of a step number. Suppress completed entries that match the
   *  active call so the row doesn't briefly duplicate when the entry
   *  lands a tick before the activeTool prop clears. */
  active?: { name: string; arg: string } | null;
}) {
  return (
    <ul className="space-y-0.5">
      {entries.map((entry, idx) => (
        <li
          // Compound key: `entry.step` is normally unique per run, but a
          // duplicate planStep / buildStep event (HMR-leftover listener,
          // or a streaming partial emitted twice) can produce two
          // entries with the same step. Compose with idx so React's
          // reconciler never sees a collision.
          key={`${entry.step}-${idx}`}
          className="flex items-center gap-2 text-[11px] font-mono"
        >
          <span className="text-muted-foreground/60 tabular-nums shrink-0">
            {entry.step}
          </span>
          <span className="font-medium shrink-0">{entry.toolName}</span>
          {entry.argSummary && (
            <span className="text-muted-foreground/80 truncate flex-1">
              {entry.argSummary}
            </span>
          )}
          {!entry.ok && (
            <span className="text-amber-500 shrink-0" aria-label="failed">
              ⚠
            </span>
          )}
        </li>
      ))}
      {active && (
        <li
          className="flex items-center gap-2 text-[11px] font-mono"
          aria-label={`${active.name} running`}
        >
          <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
          <span className="font-medium shrink-0">{active.name}</span>
          {active.arg && (
            <span className="text-muted-foreground/80 truncate flex-1">
              {active.arg}
            </span>
          )}
        </li>
      )}
    </ul>
  );
}

// ── Subagent card ────────────────────────────────────────────────────────────

/** Nested card that renders one delegated subagent run inline with the
 *  chat stream. Indented + tinted differently from regular agent
 *  bubbles so the user can see at a glance "this is the agent's
 *  delegated investigation, not its main thread".
 *
 *  Three visual states drive off `data.done`:
 *    - Running: spinner in the header, live step list grows.
 *    - Done (clean): green checkmark, summary + confidence chip.
 *    - Done (parseError): amber dot, summary still shows. */
function SubagentCard({
  data,
}: {
  data: NonNullable<ChatWindowMessage["subagentData"]>;
}) {
  const running = !data.done;
  const confidenceColor =
    data.confidence === "high"
      ? "text-green-700 dark:text-green-300"
      : data.confidence === "low"
        ? "text-amber-700 dark:text-amber-300"
        : "text-muted-foreground";
  return (
    <div className="flex w-full justify-start pl-6">
      <div className="max-w-[88%] rounded-md border-l-2 border-l-primary/60 border bg-primary/[0.04] px-3 py-2 space-y-2">
        <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide">
          {running ? (
            <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
          ) : (
            <Sparkles className="h-3 w-3 text-primary shrink-0" />
          )}
          <span className="text-primary">Subagent</span>
          <span className="text-muted-foreground/70 normal-case tracking-normal">
            {running
              ? `${data.steps.length} / ${data.budget} steps`
              : `${data.stepsUsed ?? data.steps.length} steps · ${data.confidence ?? "—"}`}
          </span>
        </div>
        <p className="text-xs text-foreground/80 italic">
          {data.task}
          {data.task.length === 200 && "…"}
        </p>
        {data.steps.length > 0 && (
          <ul className="space-y-0.5 border-t pt-1.5">
            {data.steps.map((s, idx) => (
              <li
                key={`${s.step}-${idx}`}
                className="flex items-center gap-2 text-[11px] font-mono"
              >
                <span className="text-muted-foreground/60 tabular-nums shrink-0">
                  {s.step}
                </span>
                <span className="font-medium shrink-0">{s.tool}</span>
                {!s.ok && (
                  <span
                    className="text-amber-500 shrink-0"
                    aria-label="failed"
                  >
                    ⚠
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {data.done && data.summary && (
          <div className="border-t pt-1.5 space-y-1">
            <p className="text-xs leading-snug">{data.summary}</p>
            {data.recommendedAction && (
              <p
                className={cn(
                  "text-[11px] italic leading-snug",
                  confidenceColor,
                )}
              >
                → {data.recommendedAction}
              </p>
            )}
            {data.parseError && (
              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                (subagent didn't emit a clean JSON envelope — summary synthesised from tool history)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
