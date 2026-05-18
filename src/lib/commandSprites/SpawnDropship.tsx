import { FACING_TO_DIR, type Facing } from "./types";
import { getRotationUrl } from "./spriteUrls";

interface SpawnDropshipProps {
  /** Default 72 — see pixel-scale note. */
  size?: number;
  /** Default 'S' per spec §5.5 — the dropship does not follow the
   *  receiving unit's facing. */
  facing?: Facing;
}

// Pixel-scale note: the dropship's native PNG is 48×48 while Marine
// is 96×96. Spec §5.5 calls for 1.5× infantry display size, but
// rendering a 48px sprite at 144px (1.5×96) gives 3× pixel
// upscaling next to Marine's 1×, which reads as chunky and
// inconsistent. We default to 72 (1.5×48) to keep pixel scale
// uniform with the rest of the field; callers can pass `size={144}`
// for strict spec compliance at the cost of chunkier pixels.
//
// Position translation during the descent / drop / ascent sequence
// (spec §5.5) is the rendering layer's responsibility (Phase 12 per
// spec §15) — this component just renders a static sprite.
export function SpawnDropship({
  size = 72,
  facing = "S",
}: SpawnDropshipProps) {
  const url = getRotationUrl("SpawnDropship", FACING_TO_DIR[facing]);
  return (
    <img
      src={url}
      alt="Spawn dropship"
      width={size}
      height={size}
      style={{ imageRendering: "pixelated", display: "block" }}
      draggable={false}
    />
  );
}
