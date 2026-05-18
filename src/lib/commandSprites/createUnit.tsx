import { useMemo } from "react";

import { SPRITE_MANIFEST } from "./manifest";
import {
  FACING_TO_DIR,
  STATE_TO_ANIM,
  TRANSIENT_TO_ANIM,
  type UnitProps,
} from "./types";
import { useSpriteAnimation } from "./useSpriteAnimation";
import { getFrameUrl } from "./spriteUrls";

// Animation frame rate. PixelLab's authoring tool exports nominally
// at 12fps; 10fps reads more deliberately for the in-app sprite
// scale and matches the legacy SVG cadence callers were tuned to.
const FPS = 10;

interface CreateUnitOpts {
  /** Display name, used in the alt text and for debugging. */
  displayName: string;
  /** Asset folder name under src/lib/commandSprites/assets/. */
  component: string;
  /** Default render size in px. Spec §10 defaults infantry to 96. */
  defaultSize?: number;
}

export function createUnit({
  displayName,
  component,
  defaultSize = 96,
}: CreateUnitOpts): React.FC<UnitProps> {
  const Unit: React.FC<UnitProps> = ({
    state,
    transient,
    isMoving,
    facing,
    size = defaultSize,
    onTransientComplete,
  }) => {
    const dir = FACING_TO_DIR[facing];
    // Precedence: transient (one-shot) > isMoving (walk) > state (persistent).
    const anim = transient
      ? TRANSIENT_TO_ANIM[transient]
      : isMoving
        ? "walking"
        : STATE_TO_ANIM[state];
    const isTransient = Boolean(transient);
    // These states play once and freeze on the last frame instead
    // of looping — used for persistent indicators where a terminal
    // pose reads better than a continuous loop. No callback fires
    // when they settle; the unit just holds until state changes.
    const FREEZE_LAST: ReadonlySet<typeof state> = new Set(["error", "thinking"]);
    const oneShot = isTransient || FREEZE_LAST.has(state);

    // Manifest lookup before hooks so the hook receives a stable
    // count. If the entry is missing we still want to fail loudly,
    // so throw *after* the hook runs (keeps hook count consistent
    // across renders even if frames disappear from disk).
    const manifestEntry = SPRITE_MANIFEST[component]?.[anim]?.[dir];

    const frame = useSpriteAnimation({
      frameCount: manifestEntry ?? 1,
      fps: FPS,
      loop: !oneShot, // transients + error play once; others loop
      onComplete: isTransient ? onTransientComplete : undefined,
      key: `${anim}:${dir}`,
    });

    if (manifestEntry === undefined) {
      // Loud failure — missing manifest entry means the normalize
      // or manifest-generation step dropped frames. Don't silently
      // freeze on frame 0.
      throw new Error(
        `[commandSprites] missing manifest entry: ${component}/${anim}/${dir}`,
      );
    }

    // Clamp against the current frame count. When `anim` or `dir`
    // changes, useSpriteAnimation's setFrame(0) is queued in an
    // effect — for one render it still returns the previous frame
    // index, which may exceed the new animation's frame count and
    // point at a nonexistent file. Modulo here keeps the lookup
    // valid through the transition.
    const safeFrame = frame % manifestEntry;

    const url = useMemo(
      () => getFrameUrl(component, anim, dir, safeFrame),
      [anim, dir, safeFrame],
    );

    return (
      <img
        src={url}
        alt={`${displayName} ${anim} facing ${facing}`}
        width={size}
        height={size}
        // `maxWidth: none` overrides Tailwind preflight's
        // `img { max-width: 100% }` rule — without it, an img
        // placed inside an overflow-hidden container smaller than
        // `size` would silently scale down to fit and our card
        // thumbnail zoom wouldn't take effect.
        style={{
          imageRendering: "pixelated",
          display: "block",
          maxWidth: "none",
          maxHeight: "none",
          width: size,
          height: size,
        }}
        draggable={false}
      />
    );
  };
  Unit.displayName = displayName;
  return Unit;
}
