// Arrow-key walk control for the currently-selected unit (spec §2.4
// extension). Hold-to-walk: while one or more arrow keys are held,
// the unit travels continuously in the resulting compass direction.
// Release the keys → unit stops. Mounted once at the screen level so
// the listener works regardless of which view is currently up.

import { useEffect } from "react";

import { useCommandStore } from "@/stores/command/store";

// Walk speed in px/sec — tuned to roughly match the cosmetic
// wander's perceived pace (smoothstep over moveDist/moveDuration
// peaks around 30 px/sec; pick the same constant here so direct
// keyboard control doesn't feel teleport-fast next to the
// background wander).
const WALK_SPEED_PX_PER_SEC = 30;

export function useArrowKeyWalk(): void {
  const debugSetWalkVelocity = useCommandStore((s) => s.debugSetWalkVelocity);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const held = new Set<string>();
    const isArrow = (k: string) =>
      k === "ArrowUp" ||
      k === "ArrowDown" ||
      k === "ArrowLeft" ||
      k === "ArrowRight";

    /** Map the currently-held set of arrows to a unit velocity
     *  vector. Diagonals get the same total speed as cardinals
     *  thanks to vector normalisation. */
    const velocityFromHeld = (): { vx: number; vy: number } => {
      let dx = 0;
      let dy = 0;
      if (held.has("ArrowLeft")) dx -= 1;
      if (held.has("ArrowRight")) dx += 1;
      if (held.has("ArrowUp")) dy -= 1;
      if (held.has("ArrowDown")) dy += 1;
      if (dx === 0 && dy === 0) return { vx: 0, vy: 0 };
      const len = Math.hypot(dx, dy);
      return {
        vx: (dx / len) * WALK_SPEED_PX_PER_SEC,
        vy: (dy / len) * WALK_SPEED_PX_PER_SEC,
      };
    };

    const apply = () => {
      const sel = useCommandStore.getState().selectedUnitId;
      if (!sel) return;
      const { vx, vy } = velocityFromHeld();
      debugSetWalkVelocity(sel, vx, vy);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isArrow(e.key)) return;
      // Don't hijack arrow keys while typing in a text field.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable)
        return;
      const sel = useCommandStore.getState().selectedUnitId;
      if (!sel) return;
      e.preventDefault();
      // The browser auto-repeats keydowns while a key is held. We
      // only need to update velocity when the held set actually
      // changes; skip the no-op apply on repeat events.
      if (held.has(e.key)) return;
      held.add(e.key);
      apply();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!isArrow(e.key)) return;
      if (!held.has(e.key)) return;
      held.delete(e.key);
      apply();
    };
    // Clear held keys on blur so a tab-out / refocus doesn't leave
    // a phantom arrow pressed. Also issue a zero-velocity so the
    // currently-selected unit comes to a stop.
    const onBlur = () => {
      held.clear();
      const sel = useCommandStore.getState().selectedUnitId;
      if (sel) debugSetWalkVelocity(sel, 0, 0);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [debugSetWalkVelocity]);
}
