// UnitChatPanel — right-pane chat for the selected unit.
//
// Phase 3: renders the live transcript accumulated from ACP
// session/update events and exposes a functional input that
// calls the Phase 1 smoke prompt command. State chips reflect
// the real-time AgentState; sprite-preview state-cycling lives
// only in the dev-tools console now.

import {
  Bug,
  FileText,
  Mail,
  Plug,
  Send,
  Loader2,
  ShieldAlert,
  ShieldOff,
  Terminal,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DebugTab } from "@/components/command/DebugTab";
import { SessionBreadcrumb } from "@/components/command/SessionBreadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  commandDrainInbox,
  commandGrantPermission,
  commandResumeSession,
  commandSmokeCancel,
  commandSmokeKill,
  commandSmokePrompt,
  commandSwitchBackend,
  type A2AMessage,
  type BackendKind,
} from "@/lib/tauri/command";
import type {
  CommandUnit,
  IssuedCommand,
  PermissionRequest,
  TouchedFile,
  TranscriptEntry,
} from "@/stores/command/store";
import { useCommandStore } from "@/stores/command/store";

const STATE_LABEL: Record<CommandUnit["state"], string> = {
  idle: "Idle",
  thinking: "Thinking",
  tool_running: "Running tool",
  streaming: "Streaming",
  awaiting_permission: "Awaiting permission",
  done: "Done",
  error: "Error",
};

const STATE_CHIP_COLOR: Record<CommandUnit["state"], string> = {
  idle: "bg-zinc-800 text-zinc-300 border-zinc-700",
  thinking: "bg-blue-900/40 text-blue-200 border-blue-700/60",
  tool_running: "bg-amber-900/40 text-amber-200 border-amber-700/60",
  streaming: "bg-teal-900/40 text-teal-200 border-teal-700/60",
  awaiting_permission: "bg-yellow-900/40 text-yellow-100 border-yellow-700/70",
  done: "bg-emerald-900/40 text-emerald-200 border-emerald-700/60",
  error: "bg-red-900/40 text-red-200 border-red-700/60",
};

export function UnitChatPanel() {
  const selectedUnitId = useCommandStore((s) => s.selectedUnitId);
  const unit = useCommandStore((s) =>
    selectedUnitId ? s.units[selectedUnitId] : null,
  );
  const setPromptInFlight = useCommandStore((s) => s.setPromptInFlight);
  const setUnitState = useCommandStore((s) => s.setUnitState);
  const appendTranscript = useCommandStore((s) => s.appendTranscript);
  const consumeRolePrompt = useCommandStore((s) => s.consumeRolePrompt);
  const setUnitLive = useCommandStore((s) => s.setUnitLive);
  const clearInbox = useCommandStore((s) => s.clearInbox);
  const setSuppressNotifications = useCommandStore(
    (s) => s.setSuppressNotifications,
  );
  const switchBackend = useCommandStore((s) => s.switchBackend);

  const [text, setText] = useState("");
  const [resuming, setResuming] = useState(false);
  const [switching, setSwitching] = useState<BackendKind | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new transcript entries / extensions.
  useEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [unit?.transcript.length, unit?.transcript[unit.transcript.length - 1]?.text]);

  const onSwitchBackend = useCallback(
    async (target: BackendKind) => {
      if (!unit || switching !== null || target === unit.backend) return;
      setSwitching(target);
      try {
        const newAcpId = await commandSwitchBackend(unit.id, target);
        switchBackend(unit.id, target, newAcpId);
        appendTranscript(
          unit.id,
          "system",
          `Backend switched to ${BACKEND_LABEL[target]}. Agent context restarted; transcript preserved.`,
          { newEntry: true },
        );
        toast.success(`Switched to ${BACKEND_LABEL[target]}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Switch failed: ${msg}`);
        appendTranscript(unit.id, "error", `Backend switch failed: ${msg}`, {
          newEntry: true,
        });
      } finally {
        setSwitching(null);
      }
    },
    [unit, switching, switchBackend, appendTranscript],
  );

  const onResume = useCallback(async () => {
    if (!unit || resuming) return;
    setResuming(true);
    // Suppress notifications BEFORE the resume call so the wrapper's
    // session/load replay (which restates the entire prior
    // conversation) doesn't duplicate the transcript we already
    // hydrated from SQLite. We hold the suppression for a brief tail
    // window after the resume promise resolves to catch any
    // trailing replay events that landed after the response.
    setSuppressNotifications(unit.id, true);
    try {
      await commandResumeSession(unit.id);
      setUnitLive(unit.id, true);
      appendTranscript(unit.id, "system", "Session resumed.", { newEntry: true });
      toast.success(`${unit.name} resumed`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Resume failed: ${msg}`);
      appendTranscript(unit.id, "error", `Resume failed: ${msg}`, { newEntry: true });
    } finally {
      setResuming(false);
      setTimeout(() => setSuppressNotifications(unit.id, false), 400);
    }
  }, [unit, resuming, setUnitLive, appendTranscript, setSuppressNotifications]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!unit || unit.promptInFlight || !unit.isLive) return;
      const prompt = text.trim();
      if (!prompt) return;
      setText("");
      appendTranscript(unit.id, "user", prompt, { newEntry: true });
      setPromptInFlight(unit.id, true);
      setUnitState(unit.id, "thinking");
      // Drain any A2A inbox first — the messages get prepended as
      // system context so the agent actually sees them on this turn.
      // We rely on Rust's drain to clear server-side state; the
      // store's clearInbox keeps the UI in sync.
      let inbox: A2AMessage[] = [];
      try {
        inbox = await commandDrainInbox(unit.id);
      } catch {
        // non-fatal; the in-memory store inbox still gets used.
      }
      if (inbox.length === 0 && unit.inbox.length > 0) {
        inbox = unit.inbox;
      }
      clearInbox(unit.id);
      const rolePrefix = consumeRolePrompt(unit.id);
      const inboxPrefix =
        inbox.length > 0
          ? inbox
              .map(
                (m) =>
                  `[Inbox · from ${m.fromName}${m.subject ? ` · ${m.subject}` : ""}]\n${m.body}`,
              )
              .join("\n\n")
          : "";
      const prefixParts = [rolePrefix, inboxPrefix].filter(Boolean);
      const fullPrompt =
        prefixParts.length > 0
          ? `${prefixParts.join("\n\n---\n\n")}\n\n---\n\nUser request:\n${prompt}`
          : prompt;
      try {
        await commandSmokePrompt(unit.id, fullPrompt);
        setUnitState(unit.id, "idle");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        appendTranscript(unit.id, "error", msg, { newEntry: true });
        setUnitState(unit.id, "error");
        toast.error(`Prompt failed: ${msg}`);
      } finally {
        setPromptInFlight(unit.id, false);
      }
    },
    [
      unit,
      text,
      appendTranscript,
      setPromptInFlight,
      setUnitState,
      consumeRolePrompt,
      clearInbox,
    ],
  );

  if (!unit) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
        Select a unit on the field to open its chat.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <SessionBreadcrumb unitId={unit.id} />
      <div className="border-b border-white/10 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">{unit.name}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {unit.role} · {unit.backend} · {unit.modelId}
            </p>
          </div>
          <span
            aria-live="polite"
            aria-atomic="true"
            className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
              unit.isLive ? STATE_CHIP_COLOR[unit.state] : STATE_CHIP_COLOR.error
            }`}
          >
            {unit.isLive ? STATE_LABEL[unit.state] : "Disconnected"}
          </span>
        </div>
        {unit.usage && (
          <div
            className="mt-1 inline-flex items-center gap-2 rounded border border-white/10 bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-white/60"
            title={`Tokens used vs context window${unit.usage.costUsd != null ? " · estimated USD spend" : ""}`}
          >
            <span>
              {formatTokens(unit.usage.tokens)}
              {unit.usage.contextSize != null && (
                <>
                  <span className="text-white/30"> / </span>
                  {formatTokens(unit.usage.contextSize)}
                </>
              )}
            </span>
            {unit.usage.contextSize != null && (
              <span className="text-white/40">
                · {Math.round((unit.usage.tokens / unit.usage.contextSize) * 100)}%
              </span>
            )}
            {unit.usage.costUsd != null && (
              <span className="text-emerald-300/80">
                · ${unit.usage.costUsd.toFixed(unit.usage.costUsd >= 1 ? 2 : 3)}
              </span>
            )}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {!unit.isLive && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 border-amber-700/60 bg-amber-900/30 px-2 text-[10px] text-amber-200 hover:bg-amber-800/40"
              disabled={resuming}
              onClick={() => void onResume()}
              aria-label="Resume disconnected unit"
            >
              {resuming ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Plug className="mr-1 h-3 w-3" />
              )}
              Resume
            </Button>
          )}
          {unit.isLive && (
            <BackendSwitcher
              current={unit.backend}
              busy={switching}
              onSwitch={(b) => void onSwitchBackend(b)}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            disabled={!unit.promptInFlight || !unit.isLive}
            onClick={() => {
              void commandSmokeCancel(unit.id).catch(() => {});
            }}
            aria-label="Cancel current turn"
          >
            <X className="mr-1 h-3 w-3" /> Cancel turn
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-red-300/80 hover:bg-red-500/10"
            onClick={() => {
              void commandSmokeKill(unit.id).catch(() => {});
            }}
            aria-label="Terminate unit"
          >
            Kill unit
          </Button>
        </div>
      </div>

      <Tabs defaultValue="chat" className="flex flex-1 min-h-0 flex-col">
        <TabsList className="mx-3 mt-2 h-8 self-start bg-black/30">
          <TabsTrigger value="chat" className="h-6 px-2 text-[11px]">
            Chat
          </TabsTrigger>
          <TabsTrigger value="files" className="h-6 px-2 text-[11px]">
            <FileText className="mr-1 h-3 w-3" />
            Files {unit.files.length > 0 ? `(${unit.files.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="commands" className="h-6 px-2 text-[11px]">
            <Terminal className="mr-1 h-3 w-3" />
            Commands {unit.commands.length > 0 ? `(${unit.commands.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="debug" className="h-6 px-2 text-[11px]">
            <Bug className="mr-1 h-3 w-3" />
            Debug
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="chat"
          className="flex-1 min-h-0 overflow-hidden focus-visible:outline-none"
        >
          <div
            ref={transcriptRef}
            className="h-full space-y-2 overflow-y-auto p-3 text-xs"
          >
            {unit.transcript.map((entry) => (
              <TranscriptRow key={entry.id} entry={entry} />
            ))}
            {unit.inbox.length > 0 && <InboxCard inbox={unit.inbox} />}
            {unit.pendingPermission && (
              <PermissionCard
                unitId={unit.id}
                request={unit.pendingPermission}
              />
            )}
          </div>
        </TabsContent>
        <TabsContent
          value="files"
          className="flex-1 min-h-0 overflow-hidden focus-visible:outline-none"
        >
          <FilesTab files={unit.files} />
        </TabsContent>
        <TabsContent
          value="commands"
          className="flex-1 min-h-0 overflow-hidden focus-visible:outline-none"
        >
          <CommandsTab commands={unit.commands} />
        </TabsContent>
        <TabsContent
          value="debug"
          className="flex-1 min-h-0 overflow-hidden focus-visible:outline-none"
        >
          <DebugTab unit={unit} />
        </TabsContent>
      </Tabs>

      <div className="border-t border-white/10 p-2">
        <form className="flex gap-2" onSubmit={(e) => void onSubmit(e)}>
          <Input
            disabled={unit.promptInFlight || !unit.isLive}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              !unit.isLive
                ? "Disconnected — click Resume to reconnect"
                : unit.promptInFlight
                  ? "Awaiting agent response…"
                  : "Send a prompt…"
            }
            className="flex-1 bg-black/30"
          />
          <Button
            type="submit"
            size="icon"
            disabled={unit.promptInFlight || !unit.isLive || text.trim().length === 0}
            aria-label="Send prompt"
          >
            {unit.promptInFlight ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ACP option `kind` → short canonical label. The wrapper's `name`
// field often inlines the tool target (e.g. "Always allow Edit
// (/very/long/path/file.ts)") which overflows the narrow chat
// panel. Render the short label on the button + put the full name
// on `title` for hover discoverability.
const PERMISSION_LABEL: Record<string, string> = {
  allow_always: "Always allow",
  allow_once: "Allow once",
  reject_once: "Reject",
  reject_always: "Always reject",
};

function permissionLabel(kind: string | undefined, fallbackName: string): string {
  if (kind && PERMISSION_LABEL[kind]) return PERMISSION_LABEL[kind];
  // Fallback: trim the wrapper's `name` to its first clause so a
  // long path doesn't take over the card.
  const first = fallbackName.split(/[(:]/, 1)[0]?.trim();
  return first && first.length > 0 ? first : fallbackName;
}

function PermissionCard({
  unitId,
  request,
}: {
  unitId: string;
  request: PermissionRequest;
}) {
  const setPendingPermission = useCommandStore((s) => s.setPendingPermission);
  const setUnitState = useCommandStore((s) => s.setUnitState);
  const appendTranscript = useCommandStore((s) => s.appendTranscript);
  const [responding, setResponding] = useState(false);

  const allow =
    request.options.find((o) => o.kind === "allow_always") ??
    request.options.find((o) => o.kind === "allow_once") ??
    request.options.find((o) => (o.kind ?? "").startsWith("allow")) ??
    null;
  const deny =
    request.options.find((o) => o.kind === "reject_always") ??
    request.options.find((o) => o.kind === "reject_once") ??
    request.options.find((o) => (o.kind ?? "").startsWith("reject")) ??
    null;

  const respond = async (optionId: string, label: string) => {
    if (responding) return;
    setResponding(true);
    try {
      await commandGrantPermission(unitId, request.requestId, optionId);
      appendTranscript(unitId, "system", `Permission ${label}`, { newEntry: true });
      setPendingPermission(unitId, null);
      setUnitState(unitId, "tool_running");
    } catch (err) {
      toast.error(
        `Permission response failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setResponding(false);
    }
  };

  const kindStr =
    typeof request.toolCall?.kind === "string"
      ? request.toolCall.kind.trim()
      : "";
  const titleStr =
    typeof request.toolCall?.title === "string"
      ? request.toolCall.title.trim()
      : "";

  return (
    <div className="overflow-hidden rounded-md border border-yellow-700/60 bg-yellow-950/40 p-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-yellow-200">
        <ShieldAlert className="h-3.5 w-3.5" />
        Permission required
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
        {kindStr && (
          <span className="rounded border border-yellow-700/50 bg-yellow-900/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-yellow-200">
            {kindStr}
          </span>
        )}
        <span className="break-all text-xs text-yellow-100">
          {titleStr || (!kindStr ? "Tool call" : "")}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {allow && (
          <Button
            size="sm"
            variant="outline"
            title={allow.name}
            className="h-7 max-w-full border-emerald-600/60 bg-emerald-900/40 px-2 text-[11px] text-emerald-100 hover:bg-emerald-800/40"
            disabled={responding}
            onClick={() => void respond(allow.optionId, allow.name)}
          >
            {responding ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            {permissionLabel(allow.kind, allow.name)}
          </Button>
        )}
        {deny && (
          <Button
            size="sm"
            variant="outline"
            title={deny.name}
            className="h-7 max-w-full border-red-700/60 bg-red-950/40 px-2 text-[11px] text-red-100 hover:bg-red-900/40"
            disabled={responding}
            onClick={() => void respond(deny.optionId, deny.name)}
          >
            <ShieldOff className="mr-1 h-3 w-3" /> {permissionLabel(deny.kind, deny.name)}
          </Button>
        )}
        {request.options
          .filter((o) => o !== allow && o !== deny)
          .map((o) => (
            <Button
              key={o.optionId}
              size="sm"
              variant="ghost"
              title={o.name}
              className="h-7 max-w-full px-2 text-[11px] text-yellow-100/70 hover:bg-yellow-900/30"
              disabled={responding}
              onClick={() => void respond(o.optionId, o.name)}
            >
              {permissionLabel(o.kind, o.name)}
            </Button>
          ))}
      </div>
    </div>
  );
}

const BACKEND_LABEL: Record<BackendKind, string> = {
  claudeAcp: "Claude",
  geminiAcp: "Gemini",
  codexAcp: "Codex",
  qwenAcp: "Qwen",
};

function BackendSwitcher({
  current,
  busy,
  onSwitch,
}: {
  current: BackendKind;
  busy: BackendKind | null;
  onSwitch: (target: BackendKind) => void;
}) {
  const targets: BackendKind[] = ["claudeAcp", "geminiAcp", "codexAcp", "qwenAcp"];
  return (
    <div className="ml-auto flex shrink-0 items-center gap-0.5 rounded-md border border-white/10 bg-black/30 px-1 py-0.5">
      <span className="px-1 text-[9px] uppercase tracking-wider text-white/40">
        switch
      </span>
      {targets.map((b) => {
        const isCurrent = b === current;
        const isBusy = busy === b;
        return (
          <button
            key={b}
            type="button"
            disabled={isCurrent || busy !== null}
            onClick={() => onSwitch(b)}
            className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
              isCurrent
                ? "bg-white/15 text-white/90 cursor-default"
                : "text-white/60 hover:bg-white/10 hover:text-white/90"
            } ${busy !== null && !isCurrent ? "opacity-40" : ""}`}
            title={
              isCurrent
                ? `Current: ${BACKEND_LABEL[b]}`
                : `Switch to ${BACKEND_LABEL[b]} (agent context resets)`
            }
            aria-label={
              isCurrent
                ? `Current backend: ${BACKEND_LABEL[b]}`
                : `Switch to ${BACKEND_LABEL[b]}`
            }
            aria-pressed={isCurrent}
          >
            {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : BACKEND_LABEL[b]}
          </button>
        );
      })}
    </div>
  );
}

function FilesTab({ files }: { files: TouchedFile[] }) {
  if (files.length === 0) {
    return (
      <div className="p-3 text-center text-xs text-muted-foreground">
        No files touched yet.
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto p-2 text-xs">
      <ul className="divide-y divide-white/5">
        {files.map((f) => (
          <li key={f.path} className="py-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="break-all font-mono text-[11px] text-white/90">
                {f.path}
              </span>
              <span className="shrink-0 rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/50">
                {f.lastKind || "touch"}
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {relativeAge(f.lastTouchedAt)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CommandsTab({ commands }: { commands: IssuedCommand[] }) {
  if (commands.length === 0) {
    return (
      <div className="p-3 text-center text-xs text-muted-foreground">
        No commands executed yet.
      </div>
    );
  }
  return (
    <div className="h-full overflow-y-auto p-2 text-xs">
      <ul className="divide-y divide-white/5">
        {commands.map((c) => {
          const statusColor =
            c.status === "completed"
              ? "border-emerald-700/50 bg-emerald-900/30 text-emerald-200"
              : c.status === "failed"
                ? "border-red-700/50 bg-red-950/40 text-red-200"
                : "border-amber-700/40 bg-amber-900/20 text-amber-200";
          return (
            <li key={c.id} className="py-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <code className="break-all font-mono text-[11px] text-white/90">
                  {c.command}
                </code>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${statusColor}`}
                >
                  {c.status ?? "running"}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {relativeAge(c.createdAt)}
                {c.exitCode != null && ` · exit ${c.exitCode}`}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
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

function InboxCard({ inbox }: { inbox: A2AMessage[] }) {
  return (
    <div className="rounded-md border border-violet-700/60 bg-violet-950/40 p-2">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-200">
        <Mail className="h-3.5 w-3.5" />
        Inbox ({inbox.length} message{inbox.length === 1 ? "" : "s"})
      </div>
      <div className="mt-1 text-[10px] text-violet-300/70">
        These will be prepended to your next prompt so the agent sees them.
      </div>
      <ul className="mt-2 space-y-1.5">
        {inbox.map((m) => (
          <li key={m.messageId} className="rounded border border-violet-700/40 bg-violet-900/30 px-2 py-1.5">
            <div className="text-[10px] font-medium text-violet-200">
              from {m.fromName}
              {m.subject ? <span className="text-violet-300/70"> · {m.subject}</span> : null}
            </div>
            <div className="mt-0.5 break-words text-xs text-white/85">{m.body}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Memoised so streaming a 50-chunk reply only re-renders the
// final agent_text row (whose ref changes per chunk) instead of
// every row above it.
const TranscriptRow = memo(function TranscriptRow({
  entry,
}: {
  entry: TranscriptEntry;
}) {
  const styleByKind: Record<TranscriptEntry["kind"], string> = {
    system: "border-white/10 bg-white/5 text-white/70 italic",
    user: "border-blue-700/50 bg-blue-900/30 text-blue-100",
    agent_text: "border-white/10 bg-black/30 text-white/90 whitespace-pre-wrap",
    agent_thought: "border-violet-700/40 bg-violet-900/20 text-violet-200/80 italic",
    tool_call: "border-amber-700/50 bg-amber-900/25 text-amber-200 font-mono",
    tool_result: "border-emerald-700/50 bg-emerald-900/25 text-emerald-200 font-mono",
    error: "border-red-700/60 bg-red-950/40 text-red-200",
  };
  return (
    <div className={`rounded-md border px-2 py-1.5 ${styleByKind[entry.kind]}`}>
      {entry.text || "…"}
    </div>
  );
});
