// DebugTab — protocol/animation inspection surface for the
// currently-selected unit. Lets you:
//   - Force any AgentState animation, fire either transient one-shot
//   - Read the role-priming prompt the unit was launched with
//   - Inspect identity / lifecycle / IDs at a glance
//   - Inject synthetic A2A inbox messages and permission requests
//     so the UI surfaces can be tested without a live agent doing
//     the matching tool call
//   - Peek at the last raw ACP `session/update` body
//
// Not gated behind a dev-only flag — Meridian is single-user, so
// having the tab in production is harmless.

import { AlertCircle, Mail, Send, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { AgentState, TransientAnimation } from "@/lib/commandSprites";
import type { A2AMessage, CommandEventRaw } from "@/lib/tauri/command";
import type { CommandUnit } from "@/stores/command/store";
import { useCommandStore } from "@/stores/command/store";

const STATES: AgentState[] = [
  "idle",
  "thinking",
  "tool_running",
  "streaming",
  "awaiting_permission",
  "done",
  "error",
];
const TRANSIENTS: TransientAnimation[] = ["spawning", "deploying"];

export function DebugTab({ unit }: { unit: CommandUnit }) {
  const setUnitState = useCommandStore((s) => s.setUnitState);
  const fireTransient = useCommandStore((s) => s.fireTransient);
  const receiveA2AMessage = useCommandStore((s) => s.receiveA2AMessage);
  const setPendingPermission = useCommandStore((s) => s.setPendingPermission);
  const units = useCommandStore((s) => s.units);

  const otherUnits = useMemo(
    () => Object.values(units).filter((u) => u.id !== unit.id),
    [units, unit.id],
  );

  return (
    <div className="h-full overflow-y-auto p-3 text-xs">
      <Section title="Animation Tester">
        <div className="text-[10px] text-muted-foreground">
          Force the sprite into any AgentState. Real ACP events will overwrite
          this on the next turn.
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {STATES.map((s) => (
            <Chip
              key={s}
              active={unit.state === s}
              onClick={() => setUnitState(unit.id, s)}
            >
              {s}
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {TRANSIENTS.map((t) => (
            <Chip
              key={t}
              active={unit.transient === t}
              onClick={() => fireTransient(unit.id, t)}
              tone="amber"
            >
              transient · {t}
            </Chip>
          ))}
          <Chip onClick={() => fireTransient(unit.id, undefined)} tone="ghost">
            clear transient
          </Chip>
        </div>
      </Section>

      <Section title="Role Prompt">
        {unit.rolePrompt ? (
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded border border-white/10 bg-black/30 p-2 font-mono text-[10px] text-white/80">
            {unit.rolePrompt}
          </pre>
        ) : (
          <div className="text-[10px] text-muted-foreground italic">
            No pending role prompt — either no prompt at launch, or it was
            already consumed by the first user message.
          </div>
        )}
      </Section>

      <Section title="Identity">
        <KV k="Meridian id" v={unit.id} mono />
        <KV k="ACP id" v={unit.acpSessionId} mono />
        <KV k="Backend" v={unit.backend} mono />
        <KV k="Sprite" v={unit.spriteId} />
        <KV k="Role" v={unit.role} />
        <KV k="Model" v={unit.modelId} />
        <KV k="Project dir" v={unit.projectId} mono />
      </Section>

      <Section title="Lifecycle">
        <KV k="State" v={unit.state} />
        <KV k="Transient" v={unit.transient ?? "(none)"} />
        <KV k="Live" v={String(unit.isLive)} />
        <KV k="Subagent" v={String(unit.isSubagent)} />
        <KV k="Parent" v={unit.parentId ?? "(none)"} mono />
        <KV k="Children" v={String(unit.childIds.length)} />
        <KV k="Prompt in flight" v={String(unit.promptInFlight)} />
        <KV k="Suppress notifs" v={String(unit.suppressNotifications)} />
        <KV k="Transcript" v={`${unit.transcript.length} entries`} />
        <KV k="Inbox" v={`${unit.inbox.length} pending`} />
        <KV k="Files touched" v={String(unit.files.length)} />
        <KV k="Commands" v={String(unit.commands.length)} />
        <KV k="Created" v={new Date(unit.createdAt).toLocaleString()} />
        <KV k="Last active" v={new Date(unit.lastActiveAt).toLocaleString()} />
      </Section>

      <Section title="Inject Synthetic Events">
        <div className="text-[10px] text-muted-foreground">
          Drive the UI surfaces without a live agent producing the matching
          ACP event. Safe — these don't touch the wrapper.
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px]"
            onClick={() => {
              const from = otherUnits[0];
              const fake: A2AMessage = {
                messageId: `debug-${Date.now()}`,
                fromSessionId: from?.id ?? unit.id,
                fromName: from?.name ?? "Debug",
                toSessionId: unit.id,
                toName: unit.name,
                subject: "Debug test",
                body:
                  "This is a synthetic A2A message injected from the Debug tab to test the inbox card + signal arc UI.",
                createdAtMs: Date.now(),
              };
              receiveA2AMessage(fake);
            }}
          >
            <Mail className="mr-1 h-3 w-3" /> Fake inbox message
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px]"
            onClick={() => {
              setPendingPermission(unit.id, {
                requestId: `debug-${Date.now()}`,
                toolCall: {
                  title: "/Users/example/path/to/file.ts",
                  kind: "edit",
                },
                options: [
                  { optionId: "allow_always", name: "Always allow", kind: "allow_always" },
                  { optionId: "allow_once", name: "Allow once", kind: "allow_once" },
                  { optionId: "reject_once", name: "Reject", kind: "reject_once" },
                ],
              });
            }}
          >
            <AlertCircle className="mr-1 h-3 w-3" /> Fake permission card
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px]"
            disabled={otherUnits.length === 0}
            title={
              otherUnits.length === 0
                ? "Need another unit on the field to fire an arc"
                : `Fire signal arc from this unit → ${otherUnits[0]!.name}`
            }
            onClick={() => {
              const to = otherUnits[0];
              if (!to) return;
              receiveA2AMessage({
                messageId: `debug-arc-${Date.now()}`,
                fromSessionId: unit.id,
                fromName: unit.name,
                toSessionId: to.id,
                toName: to.name,
                subject: null,
                body: "(debug signal-arc test — no real message body)",
                createdAtMs: Date.now(),
              });
            }}
          >
            <Send className="mr-1 h-3 w-3" /> Fire signal arc →
          </Button>
        </div>
      </Section>

      <Section title="Usage">
        {unit.usage ? (
          <>
            <KV k="Tokens (total)" v={unit.usage.tokens.toLocaleString()} mono />
            <KV
              k="Tokens in"
              v={
                unit.usage.inputTokens != null
                  ? unit.usage.inputTokens.toLocaleString()
                  : "(not reported)"
              }
              mono
            />
            <KV
              k="Tokens out"
              v={
                unit.usage.outputTokens != null
                  ? unit.usage.outputTokens.toLocaleString()
                  : "(not reported)"
              }
              mono
            />
            <KV
              k="Context"
              v={
                unit.usage.contextSize != null
                  ? unit.usage.contextSize.toLocaleString()
                  : "(unknown)"
              }
              mono
            />
            {unit.usage.contextSize != null && (
              <KV
                k="Used"
                v={`${((unit.usage.tokens / unit.usage.contextSize) * 100).toFixed(2)}%`}
              />
            )}
            <KV
              k="Updated"
              v={new Date(unit.usage.updatedAtMs).toLocaleTimeString()}
            />
          </>
        ) : (
          <div className="text-[10px] text-muted-foreground italic">
            No usage_update events received yet.
          </div>
        )}
      </Section>

      <Section title="Last Raw ACP Event">
        {unit.lastRawEvent ? (
          <RawEventBlock raw={unit.lastRawEvent} />
        ) : (
          <div className="text-[10px] text-muted-foreground italic">
            No session/update events received yet.
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300/80">
        <Sparkles className="h-3 w-3" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Chip({
  active,
  onClick,
  tone = "default",
  children,
}: {
  active?: boolean;
  onClick: () => void;
  tone?: "default" | "amber" | "ghost";
  children: React.ReactNode;
}) {
  const base = "rounded border px-1.5 py-0.5 text-[10px] transition-colors";
  let style = "";
  if (tone === "amber") {
    style = active
      ? "border-amber-500/60 bg-amber-900/30 text-amber-200"
      : "border-amber-700/30 bg-amber-900/10 text-amber-200/70 hover:bg-amber-900/30";
  } else if (tone === "ghost") {
    style = "border-white/10 bg-transparent text-white/50 hover:bg-white/5";
  } else {
    style = active
      ? "border-emerald-500/60 bg-emerald-900/30 text-emerald-200"
      : "border-white/10 bg-black/30 text-white/70 hover:bg-white/5";
  }
  return (
    <button type="button" onClick={onClick} className={`${base} ${style}`}>
      {children}
    </button>
  );
}

function KV({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="w-28 shrink-0 text-[10px] uppercase tracking-wider text-white/40">
        {k}
      </span>
      <span
        className={`min-w-0 flex-1 break-all text-[11px] ${
          mono ? "font-mono text-white/90" : "text-white/80"
        }`}
      >
        {v}
      </span>
    </div>
  );
}

function RawEventBlock({ raw }: { raw: CommandEventRaw }) {
  const [expanded, setExpanded] = useState(false);
  const json = useMemo(() => JSON.stringify(raw, null, 2), [raw]);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="font-mono">{raw.method}</span>
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 hover:bg-white/5"
        >
          {expanded ? "collapse" : "expand"}
        </button>
      </div>
      <pre
        className={`overflow-y-auto rounded border border-white/10 bg-black/40 p-2 font-mono text-[10px] text-white/80 ${
          expanded ? "max-h-96" : "max-h-32"
        }`}
      >
        {json}
      </pre>
    </div>
  );
}
