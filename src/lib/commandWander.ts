// Cosmetic idle-wander engine (spec §2.4). Pure functions consumed
// by the command store's `tickWander` action. The store holds
// per-unit wander schedule + in-flight move state; this module owns
// the math: timing, target selection, collision avoidance, facing.

import type { Facing } from "@/lib/commandSprites";

/** Inputs the engine treats as constants. Tune here, not at call sites. */
export const WANDER = {
  /** Radius around anchor a unit may drift to. */
  anchorRadius: 30,
  /** Per-step move distance range (px). */
  moveDistMin: 5,
  moveDistMax: 15,
  /** Per-step move duration range (ms). */
  moveDurationMinMs: 2000,
  moveDurationMaxMs: 3000,
  /** Time between wander picks (ms). Spec §2.4: 15–45s. */
  pickIntervalMinMs: 15_000,
  pickIntervalMaxMs: 45_000,
  /** Minimum separation between two units (px). A candidate target
   *  closer than this to any other unit's current position is
   *  rejected. */
  separationPx: 40,
  /** Max attempts to find a non-colliding candidate before giving up. */
  maxAttempts: 8,
} as const;

export interface WanderInProgress {
  /** Wall-clock ms when the move started. */
  startedAtMs: number;
  /** How long the move takes. */
  durationMs: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Cached facing matching (fromX,fromY)→(toX,toY) so we don't recompute every frame. */
  facing: Facing;
}

export interface WanderSchedule {
  /** Wall-clock ms when this unit should next pick a destination. */
  nextPickAtMs: number;
  /** Active move, or null while resting between picks. */
  active: WanderInProgress | null;
}

/** Compass facing for a 2D direction. (0,0) returns null — the caller
 *  decides whether to keep current facing or use a default. */
export function pickFacing(dx: number, dy: number): Facing | null {
  if (dx === 0 && dy === 0) return null;
  // atan2 here uses screen coords where +y is *down*. North = -y, so
  // we feed -dy to get a mathematical "up = positive" angle.
  const deg = (Math.atan2(-dy, dx) * 180) / Math.PI; // -180..180; 0 = east, 90 = north
  // Normalize to [0, 360).
  const a = (deg + 360) % 360;
  // 8 sectors of 45° each, centered on the compass points.
  // east is 0°; we want east to span [-22.5, 22.5).
  // shift by 22.5 so sector boundaries align cleanly.
  const sector = Math.floor(((a + 22.5) % 360) / 45);
  const COMPASS: Facing[] = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"];
  return COMPASS[sector];
}

/** Linear interpolation between current and target, clamped at the end. */
export function easedPosition(
  active: WanderInProgress,
  nowMs: number,
): { x: number; y: number; done: boolean } {
  const elapsed = nowMs - active.startedAtMs;
  const t = Math.max(0, Math.min(1, elapsed / active.durationMs));
  // Smoothstep — easeInOut without overshoot. The 2–3s window is
  // already gentle, so the eased curve mainly tames the start/stop.
  const eased = t * t * (3 - 2 * t);
  return {
    x: active.fromX + (active.toX - active.fromX) * eased,
    y: active.fromY + (active.toY - active.fromY) * eased,
    done: t >= 1,
  };
}

interface PickInputs {
  anchorX: number;
  anchorY: number;
  currentX: number;
  currentY: number;
  /** Positions of every other unit on the field — used for soft collision. */
  others: ReadonlyArray<{ x: number; y: number }>;
  rng?: () => number;
  nowMs: number;
}

/** Pick a candidate destination + the move that gets there.
 *  Returns null if no non-colliding spot was found within the
 *  attempt budget — caller should reschedule and try later. */
export function planWanderMove(input: PickInputs): WanderInProgress | null {
  const rng = input.rng ?? Math.random;
  const { anchorX, anchorY, currentX, currentY, others } = input;

  for (let attempt = 0; attempt < WANDER.maxAttempts; attempt++) {
    // Random heading by default; when near the edge of the anchor
    // radius, restrict to a ±90° cone around the toward-anchor
    // direction so the unit drifts back rather than off the field.
    const ax = currentX - anchorX;
    const ay = currentY - anchorY;
    const distFromAnchor = Math.hypot(ax, ay);
    let angle: number;
    if (distFromAnchor > WANDER.anchorRadius * 0.7) {
      // atan2 takes (y, x); we want the angle of (-ax, -ay) — the
      // vector from current back to anchor — using screen coords
      // where +y is down. Math.atan2's y arg is what's plotted, so
      // pass -ay (north positive) to match pickFacing's convention
      // would be wrong here — angle is consumed by Math.cos/sin
      // below in *screen* space, so we use raw (-ay, -ax).
      const towardAnchor = Math.atan2(-ay, -ax);
      angle = towardAnchor + (rng() - 0.5) * Math.PI;
    } else {
      angle = rng() * Math.PI * 2;
    }

    const dist =
      WANDER.moveDistMin +
      rng() * (WANDER.moveDistMax - WANDER.moveDistMin);
    let toX = currentX + Math.cos(angle) * dist;
    let toY = currentY + Math.sin(angle) * dist;

    // Clamp inside anchor radius — don't blow past it just because
    // we wanted a 15px step from a position already near the edge.
    const dxFromAnchor = toX - anchorX;
    const dyFromAnchor = toY - anchorY;
    const candidateDist = Math.hypot(dxFromAnchor, dyFromAnchor);
    if (candidateDist > WANDER.anchorRadius) {
      const scale = WANDER.anchorRadius / candidateDist;
      toX = anchorX + dxFromAnchor * scale;
      toY = anchorY + dyFromAnchor * scale;
    }

    // Soft collision check.
    const collides = others.some(
      (o) => Math.hypot(o.x - toX, o.y - toY) < WANDER.separationPx,
    );
    if (collides) continue;

    const facing = pickFacing(toX - currentX, toY - currentY);
    if (!facing) continue; // zero-length step; try again

    const durationMs =
      WANDER.moveDurationMinMs +
      rng() *
        (WANDER.moveDurationMaxMs - WANDER.moveDurationMinMs);

    return {
      startedAtMs: input.nowMs,
      durationMs,
      fromX: currentX,
      fromY: currentY,
      toX,
      toY,
      facing,
    };
  }
  return null;
}

/** Compute the wall-clock ms when this unit should next pick a destination. */
export function scheduleNextPick(nowMs: number, rng: () => number = Math.random): number {
  const interval =
    WANDER.pickIntervalMinMs +
    rng() * (WANDER.pickIntervalMaxMs - WANDER.pickIntervalMinMs);
  return nowMs + interval;
}

/** Initial schedule for a freshly-launched unit — give it a short
 *  delay so a roomful of newly-launched units doesn't all start
 *  walking at the exact same moment. */
export function initialSchedule(
  nowMs: number,
  rng: () => number = Math.random,
): WanderSchedule {
  return {
    // 2–8s before the first pick.
    nextPickAtMs: nowMs + 2000 + rng() * 6000,
    active: null,
  };
}
