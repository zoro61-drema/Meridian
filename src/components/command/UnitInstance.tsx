// UnitInstance — wraps a sprite component with state-driven props
// and click-to-select wiring. Switches sprite by `unit.spriteId`.

import { memo, type ComponentType } from "react";

import { Engineer, FieldTech, Marine, type UnitProps } from "@/lib/commandSprites";
import { type CommandUnit, useCommandStore } from "@/stores/command/store";

const SPRITE_SIZE = 80;

const SPRITE_FOR_ID: Record<CommandUnit["spriteId"], ComponentType<UnitProps>> = {
  marine: Marine as ComponentType<UnitProps>,
  engineer: Engineer as ComponentType<UnitProps>,
  "field-tech": FieldTech as ComponentType<UnitProps>,
};

interface Props {
  unit: CommandUnit;
}

// Memoised so a state change on one unit doesn't re-render every
// sprite on the field. Zustand preserves unit references across
// unrelated updates, so the default shallow compare is correct.
export const UnitInstance = memo(function UnitInstance({ unit }: Props) {
  const selectedUnitId = useCommandStore((s) => s.selectedUnitId);
  const selectUnit = useCommandStore((s) => s.selectUnit);
  const isSelected = selectedUnitId === unit.id;
  const Sprite = SPRITE_FOR_ID[unit.spriteId];

  // Disconnected units render the error animation regardless of
  // their last-known state, so the sprite shake is visible as a
  // "needs reconnect" cue. The unit's logical state stays intact;
  // resuming flips isLive back to true and the real state animates
  // again.
  const displayState = unit.isLive ? unit.state : "error";

  return (
    <button
      type="button"
      onClick={() => selectUnit(unit.id)}
      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer p-0 focus:outline-none"
      style={{ left: unit.positionX, top: unit.positionY }}
      aria-label={`${unit.name} — ${unit.isLive ? unit.state : "disconnected"}`}
    >
      <div
        className={`relative rounded-md transition-shadow ${
          isSelected
            ? "ring-2 ring-amber-300/80 ring-offset-2 ring-offset-transparent shadow-[0_0_24px_rgba(255,180,80,0.35)]"
            : "ring-1 ring-transparent hover:ring-white/20"
        }`}
        style={{ width: SPRITE_SIZE, height: SPRITE_SIZE }}
      >
        <Sprite
          state={displayState}
          transient={unit.transient}
          accent={unit.accent}
          size={SPRITE_SIZE}
          /* The designed sprites are drawn top-down with the
             helmet at the top edge of the canvas — `facing="S"`
             (south = facing screen-down) is the canonical pose.
             The store's left/right facing is a Phase 2 holdover
             that doesn't translate cleanly; ignore it here. */
          facing="S"
        />
      </div>
      <div className="mt-1 text-center font-mono text-[10px] uppercase tracking-wide text-white/70">
        {unit.name}
      </div>
    </button>
  );
});
