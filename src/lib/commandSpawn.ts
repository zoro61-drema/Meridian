// Spawn ceremony choreography (spec §5.5). Pure functions — given
// the ceremony's elapsed time, returns where the dropship should
// sit, whether the unit sprite is visible yet, and what Y-offset to
// apply to it as it falls into the anchor. Driven from the
// command-store tick by TacticalField's rAF loop.

const SPRITE_HEIGHT_PX = 120; // matches SPRITE_SIZE in UnitInstance.tsx
const TILE_FALL_HEIGHT = SPRITE_HEIGHT_PX; // "1 tile above" the anchor

/** Timeline (ms from ceremony start). */
export const SPAWN_TIMELINE = {
  descentEnd: 1200,
  hoverEnd: 1800,
  unitDropEnd: 2100,
  ascentEnd: 2500,
} as const;
export const SPAWN_TOTAL_MS = SPAWN_TIMELINE.ascentEnd;

/** Dropship Y offset (relative to unit anchor) at the start of the
 *  descent. Stays off-screen for top-row anchors (Y≈180) so the
 *  dropship slides into view from above. */
const DROPSHIP_TOP = -260;
/** Dropship Y offset while hovering — the dropship sits just above
 *  the model's drop-off point so it visually delivers the unit.
 *  The model is released at anchorY - TILE_FALL_HEIGHT (1 tile up);
 *  the dropship hovers a half-tile beyond that with its hull
 *  centered there, putting its bottom edge right at the release
 *  point. Closer-coupled than 2 tiles felt — and keeps the dropship
 *  on-screen for top-row units. */
const DROPSHIP_HOVER = -Math.round(TILE_FALL_HEIGHT * 1.25);

function smoothstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

export interface SpawnVisuals {
  /** Dropship Y offset from the unit's anchor. */
  dropshipDy: number;
  /** Whether the dropship should be rendered at all. */
  dropshipVisible: boolean;
  /** Whether the unit sprite should be rendered. False during
   *  descent + hover, true once the unit "drops" out of the bay. */
  unitVisible: boolean;
  /** Y offset to apply to the unit relative to its anchor (gravity
   *  curve from -TILE_FALL_HEIGHT to 0). */
  unitDy: number;
  /** Ceremony has fully finished; caller should clear `transient`
   *  and reset `spawnStartedAt` on the unit. */
  done: boolean;
}

export function computeSpawnVisuals(elapsedMs: number): SpawnVisuals {
  const t = SPAWN_TIMELINE;

  // Dropship
  let dropshipDy = DROPSHIP_TOP;
  let dropshipVisible = true;
  if (elapsedMs < t.descentEnd) {
    const p = elapsedMs / t.descentEnd;
    dropshipDy = DROPSHIP_TOP + (DROPSHIP_HOVER - DROPSHIP_TOP) * smoothstep(p);
  } else if (elapsedMs < t.unitDropEnd) {
    // Hovering during both the hover-only phase and the unit drop.
    dropshipDy = DROPSHIP_HOVER;
  } else if (elapsedMs < t.ascentEnd) {
    const p =
      (elapsedMs - t.unitDropEnd) / (t.ascentEnd - t.unitDropEnd);
    dropshipDy =
      DROPSHIP_HOVER + (DROPSHIP_TOP - DROPSHIP_HOVER) * smoothstep(p);
  } else {
    dropshipDy = DROPSHIP_TOP;
    dropshipVisible = false;
  }

  // Unit: hidden during descent + hover, drops from -tile to 0
  // during the unitDrop phase, then sits at the anchor.
  let unitVisible = false;
  let unitDy = 0;
  if (elapsedMs >= t.hoverEnd) {
    unitVisible = true;
    if (elapsedMs < t.unitDropEnd) {
      const p = (elapsedMs - t.hoverEnd) / (t.unitDropEnd - t.hoverEnd);
      // Ease-in (quadratic) — accelerating fall reads as gravity.
      const eased = p * p;
      unitDy = -TILE_FALL_HEIGHT * (1 - eased);
    }
  }

  return {
    dropshipDy,
    dropshipVisible,
    unitVisible,
    unitDy,
    done: elapsedMs >= t.ascentEnd,
  };
}
