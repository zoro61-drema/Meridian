// AgentCard — per-unit summary card for the fleet grid.
//
// Spec §2.1 (v1.1): one card per active unit. Shows the unit
// sprite, name, role, backend chip, state dot, transient
// indicator, usage chip, inbox badge, and the last few
// transcript entries. Clicking promotes the unit to the
// focused panel on the right.
//
// Subscribes to a single unit's slice of the store so streaming
// a 50-chunk reply only re-renders the affected card.

import { AlertCircle, Mail } from "lucide-react";
import { memo, useEffect, useState, type ComponentType } from "react";

import type { StatuslineSegmentId } from "@/lib/commandStatusline";
import { Engineer } from "@/lib/commandSprites/Engineer";
import { FieldTech } from "@/lib/commandSprites/FieldTech";
import { LightWalker } from "@/lib/commandSprites/LightWalker";
import { Marine } from "@/lib/commandSprites/Marine";
import { SiegeWalker } from "@/lib/commandSprites/SiegeWalker";
import type { UnitProps } from "@/lib/commandSprites/types";
import type { CommandUnit } from "@/stores/command/store";
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

const STATE_DOT_COLOR: Record<CommandUnit["state"], string> = {
  idle: "bg-zinc-500",
  thinking: "bg-blue-400",
  tool_running: "bg-amber-400",
  streaming: "bg-teal-400",
  awaiting_permission: "bg-yellow-300",
  done: "bg-emerald-400",
  error: "bg-red-400",
};

const SPRITE_FOR_ID: Record<CommandUnit["spriteId"], ComponentType<UnitProps>> = {
  marine: Marine as ComponentType<UnitProps>,
  engineer: Engineer as ComponentType<UnitProps>,
  "field-tech": FieldTech as ComponentType<UnitProps>,
  "light-walker": LightWalker as ComponentType<UnitProps>,
  "siege-walker": SiegeWalker as ComponentType<UnitProps>,
};

const CARD_SPRITE_SIZE = 64;

interface AgentCardProps {
  unitId: string;
}

export const AgentCard = memo(function AgentCard({ unitId }: AgentCardProps) {
  const unit = useCommandStore((s) => s.units[unitId]);
  const selectedUnitId = useCommandStore((s) => s.selectedUnitId);
  const selectUnit = useCommandStore((s) => s.selectUnit);
  if (!unit) return null;

  const isSelected = selectedUnitId === unitId;
  const Sprite = SPRITE_FOR_ID[unit.spriteId];
  const recent = unit.transcript.slice(-5);
  const displayState = unit.isLive ? unit.state : "error";

  return (
    <button
      type="button"
      onClick={() => selectUnit(unitId)}
      className={`group relative flex h-full w-full flex-col overflow-hidden rounded-md border bg-black/40 p-2 text-left transition-colors focus:outline-none ${
        isSelected
          ? "border-amber-400/70 bg-amber-950/30 shadow-[0_0_18px_rgba(255,180,80,0.18)]"
          : "border-white/10 hover:border-white/25 hover:bg-black/50"
      }`}
      aria-label={`${unit.name} — ${unit.isLive ? unit.state : "disconnected"}`}
      aria-pressed={isSelected}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        {/* Thumbnail box stays at CARD_SPRITE_SIZE; the sprite is
            zoomed 1.5× via CSS transform with overflow:hidden
            clipping the excess, so the character looks bigger
            without making the card layout shift. */}
        <div
          className="shrink-0 overflow-hidden"
          style={{ width: CARD_SPRITE_SIZE, height: CARD_SPRITE_SIZE }}
        >
          <div
            style={{
              transform: "scale(1.5)",
              transformOrigin: "center center",
              width: CARD_SPRITE_SIZE,
              height: CARD_SPRITE_SIZE,
            }}
          >
            <Sprite
              state={displayState}
              transient={unit.transient}
              size={CARD_SPRITE_SIZE}
              facing="S"
            />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-1">
            <h3 className="truncate text-[11px] font-semibold text-white/90">
              {unit.name}
            </h3>
            {unit.inbox.length > 0 && (
              <span
                className="inline-flex items-center gap-0.5 rounded border border-violet-700/60 bg-violet-950/50 px-1 py-0 font-mono text-[9px] text-violet-200"
                title={`${unit.inbox.length} pending inbox message${
                  unit.inbox.length === 1 ? "" : "s"
                }`}
              >
                <Mail className="h-2.5 w-2.5" />
                {unit.inbox.length}
              </span>
            )}
          </div>
          <p className="truncate text-[10px] text-muted-foreground">
            {unit.role} · {unit.backend}
          </p>
        </div>
      </div>

      {/* Statusline — model, context progress, tokens in/out, state */}
      <Statusline unit={unit} />

      {/* Pills row: state + transient + permission. The statusline
          carries the quantitative info; this row carries the
          categorical/qualitative signals. */}
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
        <span
          aria-live="polite"
          className="inline-flex items-center gap-1 rounded border border-white/10 bg-black/30 px-1.5 py-0.5"
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              unit.isLive ? STATE_DOT_COLOR[unit.state] : "bg-zinc-700"
            } ${
              unit.state === "thinking" || unit.state === "tool_running"
                ? "animate-pulse"
                : ""
            }`}
          />
          <span className="text-white/70">
            {unit.isLive ? STATE_LABEL[unit.state] : "Disconnected"}
          </span>
        </span>
        {unit.transient && (
          <span className="rounded border border-amber-700/40 bg-amber-900/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-200">
            {unit.transient}
          </span>
        )}
        {unit.pendingPermission && (
          <span
            className="inline-flex items-center gap-0.5 rounded border border-yellow-700/60 bg-yellow-950/50 px-1.5 py-0.5 text-yellow-200"
            title="Awaiting permission"
          >
            <AlertCircle className="h-2.5 w-2.5" />
            permission
          </span>
        )}
      </div>

      {/* Recent activity */}
      <div className="mt-1.5 flex-1 min-h-0 space-y-0.5 overflow-hidden text-[10px]">
        {recent.length === 0 ? (
          <div className="italic text-white/30">No activity yet.</div>
        ) : (
          recent.map((entry) => (
            <div
              key={entry.id}
              className={`truncate ${KIND_COLOR[entry.kind] ?? "text-white/60"}`}
              title={entry.text}
            >
              <span className="font-mono opacity-50">
                {KIND_GLYPH[entry.kind] ?? "·"}
              </span>{" "}
              {entry.text}
            </div>
          ))
        )}
      </div>
    </button>
  );
});

const KIND_COLOR: Record<string, string> = {
  user: "text-blue-200",
  agent_text: "text-white/85",
  agent_thought: "text-violet-200/70 italic",
  tool_call: "text-amber-200",
  tool_result: "text-emerald-200/80",
  error: "text-red-300",
  system: "text-white/40 italic",
};

const KIND_GLYPH: Record<string, string> = {
  user: ">",
  agent_text: "←",
  agent_thought: "~",
  tool_call: "⚙",
  tool_result: "✓",
  error: "✗",
  system: "·",
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Model + context-used progress bar + tokens in/out. Sits below
 *  the card header as the card's primary at-a-glance status row. */
function Statusline({ unit }: { unit: CommandUnit }) {
  return <AgentCardStatusline unit={unit} />;
}

/** Card statusline as a composable, config-driven component. Reads
 *  the user's ordered/enabled segment list from the store and
 *  renders each enabled segment in turn. Exported separately so
 *  the settings preview can show "what would the cards look like
 *  with this config" without remounting whole agent cards. */
export function AgentCardStatusline({ unit }: { unit: CommandUnit }) {
  const segments = useCommandStore((s) => s.statuslineSegments);
  const enabled = segments.filter((s) => s.enabled);
  if (enabled.length === 0) return null;

  // Split segments into "inline" (compact, flex-row chips) and
  // "block" (full-width visualizations like the context bar). The
  // context bar reads as a block; everything else is inline.
  const isBlock = (id: StatuslineSegmentId) => id === "context_bar";
  const inline = enabled.filter((s) => !isBlock(s.id));
  const blocks = enabled.filter((s) => isBlock(s.id));

  return (
    <div className="mt-1.5 rounded border border-white/10 bg-black/30 px-1.5 py-1">
      {inline.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[10px]">
          {inline.map((s) => (
            <StatuslineSegment key={s.id} id={s.id} unit={unit} />
          ))}
        </div>
      )}
      {blocks.map((s) => (
        <StatuslineSegment key={s.id} id={s.id} unit={unit} />
      ))}
    </div>
  );
}

function StatuslineSegment({
  id,
  unit,
}: {
  id: StatuslineSegmentId;
  unit: CommandUnit;
}) {
  const usage = unit.usage;
  switch (id) {
    case "model":
      return (
        <span className="truncate text-white/80" title={unit.modelId}>
          {unit.modelId || "—"}
        </span>
      );
    case "role":
      return (
        <span className="text-white/65" title="Agent role">
          {unit.role}
        </span>
      );
    case "tokens_in_out":
      if (!usage) return <Dim>no usage yet</Dim>;
      if (usage.inputTokens == null && usage.outputTokens == null) {
        return <Dim>(in/out not reported)</Dim>;
      }
      return (
        <span className="text-white/65">
          <span title="Input / prompt tokens">
            in {formatTokens(usage.inputTokens ?? 0)}
          </span>
          <span className="mx-1 text-white/25">·</span>
          <span title="Output / completion tokens">
            out {formatTokens(usage.outputTokens ?? 0)}
          </span>
        </span>
      );
    case "tokens_total":
      if (!usage) return <Dim>no usage yet</Dim>;
      return (
        <span className="text-white/65" title="Cumulative session tokens">
          {formatTokens(usage.tokens)} tokens
        </span>
      );
    case "context_pct": {
      if (!usage || usage.contextSize == null) return <Dim>ctx —</Dim>;
      const pct = (usage.tokens / usage.contextSize) * 100;
      return (
        <span className="text-white/65" title="Context window used">
          ctx {pct.toFixed(0)}%
        </span>
      );
    }
    case "files_touched": {
      const n = unit.files.length;
      return (
        <span
          className={n > 0 ? "text-white/65" : "text-white/30"}
          title="Files touched this session"
        >
          {n} file{n === 1 ? "" : "s"}
        </span>
      );
    }
    case "last_command": {
      const last = unit.commands[unit.commands.length - 1];
      if (!last) return <Dim>no commands</Dim>;
      return (
        <span
          className="truncate text-white/65"
          title={last.command}
        >
          $ {truncate(last.command, 32)}
        </span>
      );
    }
    case "time":
      return <LiveClock />;
    case "inbox": {
      const n = unit.inbox.length;
      if (n === 0) return <Dim>inbox 0</Dim>;
      return (
        <span className="text-violet-200" title="Pending A2A messages">
          inbox {n}
        </span>
      );
    }
    case "context_bar": {
      const pct =
        usage && usage.contextSize != null && usage.contextSize > 0
          ? Math.min(100, Math.max(0, (usage.tokens / usage.contextSize) * 100))
          : null;
      return (
        <>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-sm bg-white/10">
            <div
              className="h-full bg-white/70 transition-[width] duration-300 ease-out"
              style={{ width: `${pct ?? 0}%` }}
              role="progressbar"
              aria-valuenow={pct ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={
                pct != null
                  ? `Context used: ${pct.toFixed(0)}%`
                  : "Context usage unknown"
              }
            />
          </div>
          <div className="mt-0.5 flex items-baseline justify-between font-mono text-[9px] text-white/40">
            <span>context</span>
            <span>
              {pct != null
                ? `${pct.toFixed(0)}%`
                : usage?.contextSize == null
                  ? "—"
                  : `${formatTokens(usage.tokens)}/${formatTokens(usage.contextSize)}`}
            </span>
          </div>
        </>
      );
    }
  }
}

function Dim({ children }: { children: React.ReactNode }) {
  return <span className="text-white/30">{children}</span>;
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="text-white/55" title="Current time">
      {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </span>
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
