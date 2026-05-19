// UnitInstance — wraps a sprite component with state-driven props
// and click-to-select wiring. Switches sprite by `unit.spriteId`.

import { memo, useEffect, useState, type ComponentType } from "react";

import {
  Engineer,
  FieldTech,
  LightWalker,
  Marine,
  SiegeWalker,
  type AgentState,
  type TransientAnimation,
  type UnitProps,
} from "@/lib/commandSprites";
import { type CommandUnit, useCommandStore } from "@/stores/command/store";

const SPRITE_SIZE = 120;

const SPRITE_FOR_ID: Record<CommandUnit["spriteId"], ComponentType<UnitProps>> = {
  marine: Marine as ComponentType<UnitProps>,
  engineer: Engineer as ComponentType<UnitProps>,
  "field-tech": FieldTech as ComponentType<UnitProps>,
  "light-walker": LightWalker as ComponentType<UnitProps>,
  "siege-walker": SiegeWalker as ComponentType<UnitProps>,
};

// State badges — animations alone can be hard to read at a glance,
// so we float an emoji bubble above each sprite when the unit is in
// a non-idle state. Idle has no badge so a quiet field reads as
// quiet. Transient one-shots take precedence over the persistent
// state so the badge matches the animation actually playing.
const STATE_EMOJI: Partial<Record<AgentState, string>> = {
  thinking: "🤔",
  tool_running: "🛠️",
  streaming: "...",
  awaiting_permission: "🙋",
  done: "✅",
  error: "⚠️",
};

const TRANSIENT_EMOJI: Record<TransientAnimation, string> = {
  spawning: "✨",
  deploying: "🪂",
};

function badgeFor(
  state: AgentState,
  transient: TransientAnimation | undefined,
): string | undefined {
  if (transient) return TRANSIENT_EMOJI[transient];
  return STATE_EMOJI[state];
}

interface Props {
  unit: CommandUnit;
  /** Hide the per-sprite name label + hover ring. Used inside the
   *  MiniField tile where text would be too small to read. */
  compact?: boolean;
}

// Memoised so a state change on one unit doesn't re-render every
// sprite on the field. Zustand preserves unit references across
// unrelated updates, so the default shallow compare is correct.
export const UnitInstance = memo(function UnitInstance({ unit, compact = false }: Props) {
  const selectedUnitId = useCommandStore((s) => s.selectedUnitId);
  const selectUnit = useCommandStore((s) => s.selectUnit);
  const stateBadgesEnabled = useCommandStore((s) => s.stateBadgesEnabled);
  const isSelected = selectedUnitId === unit.id;
  const Sprite = SPRITE_FOR_ID[unit.spriteId];

  // Disconnected units render the error animation regardless of
  // their last-known state, so the sprite shake is visible as a
  // "needs reconnect" cue. The unit's logical state stays intact;
  // resuming flips isLive back to true and the real state animates
  // again.
  const displayState = unit.isLive ? unit.state : "error";

  // Compute badge from the actually-playing animation (transient
  // takes precedence over state). Pops in for 1s on each state
  // transition then dismisses itself, so a unit sitting in
  // `thinking` for a long time doesn't carry a persistent label.
  // Renders in both the compact MiniField tile and the full
  // TacticalField — MiniField scales everything down via CSS
  // transform so the badge shrinks with the rest of the sprite.
  const targetBadge = stateBadgesEnabled
    ? badgeFor(displayState, unit.transient)
    : undefined;
  const [visibleBadge, setVisibleBadge] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!targetBadge) {
      setVisibleBadge(undefined);
      return;
    }
    setVisibleBadge(targetBadge);
    const id = setTimeout(() => setVisibleBadge(undefined), 1000);
    return () => clearTimeout(id);
  }, [targetBadge]);
  const badge = visibleBadge;

  const innerSprite = (
    <>
      <div
        className="group relative"
        style={{ width: SPRITE_SIZE, height: SPRITE_SIZE }}
      >
        {/* Selection ring — sized to the unit's body, not the full
            sprite canvas (the canvas has lots of transparent
            padding around the character art). Sits behind the
            sprite so the sprite stays crisp. */}
        <div
          className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md transition-shadow ${
            isSelected
              ? "ring-2 ring-amber-300/80 shadow-[0_0_24px_rgba(255,180,80,0.35)]"
              : "ring-1 ring-transparent group-hover:ring-white/20"
          }`}
          style={{ width: SPRITE_SIZE * 0.75, height: SPRITE_SIZE * 0.75 }}
        />
        {/* Centered absolute wrapper so smaller-than-container sprites
            (Medic / Engineer — shrunk by per-unit scale to compensate
            for tighter native crops) sit in the middle of the
            SPRITE_SIZE box instead of anchoring top-left like a plain
            block child would. Marine still fills the box edge-to-edge,
            so for him this is a no-op. */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Sprite
            state={displayState}
            transient={unit.transient}
            isMoving={unit.isWandering}
            size={SPRITE_SIZE}
            /* facing8 is driven by the cosmetic wander system
               (spec §2.4) — defaults to S at launch and rotates
               during walks. AgentCard thumbnails stay hardcoded
               to S per spec §2.4 ("Card thumbnails"). */
            facing={unit.facing8}
          />
        </div>
        {badge && (
          /* `key` is the badge content itself — when state flips
             (e.g. thinking → tool_running) React remounts the
             element, retriggering the pop-in animation. */
          <div
            key={badge}
            className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-black/80 px-2 py-1 text-base leading-none shadow-lg animate-in fade-in zoom-in-75 duration-200"
            aria-hidden
          >
            {badge}
          </div>
        )}
      </div>
      {!compact && (
        <div className="mt-1 text-center font-mono text-[10px] uppercase tracking-wide text-white/70">
          {unit.name}
        </div>
      )}
    </>
  );

  // When `compact` is true we're rendering inside MiniField, which
  // is itself a <button>. Nested <button> is invalid HTML — render
  // as a `role="button"` div with click + keyboard handlers so
  // the sprite stays independently selectable but the markup is
  // still valid. `stopPropagation` keeps the MiniField's
  // double-click-to-expand from firing when a single click was
  // aimed at the unit.
  if (compact) {
    const select = (e: React.SyntheticEvent) => {
      e.stopPropagation();
      selectUnit(unit.id);
    };
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={select}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            select(e);
          }
        }}
        className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer focus:outline-none"
        style={{ left: unit.positionX, top: unit.positionY }}
        aria-label={`${unit.name} — ${unit.isLive ? unit.state : "disconnected"}`}
      >
        {innerSprite}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => selectUnit(unit.id)}
      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer p-0 focus:outline-none"
      style={{ left: unit.positionX, top: unit.positionY }}
      aria-label={`${unit.name} — ${unit.isLive ? unit.state : "disconnected"}`}
    >
      {innerSprite}
    </button>
  );
});
