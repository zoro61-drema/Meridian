// AgentCardGrid — fleet view layout.
//
// Spec §2.1 (v1.1): tiles the MiniField + one AgentCard per
// active unit in a responsive grid. The mini-field always
// occupies the first slot; cards follow in insertion order.
//
// Layout strategy: `repeat(auto-fill, minmax(<min>, 1fr))` columns
// plus a fixed `aspect-ratio` on every tile. The chat-side-panel
// resize handle drives only the COUNT of tiles per row — never the
// shape. Without this, columns flex with the container while rows
// stay pinned, and the MiniField stretches non-uniformly to keep
// the terrain edge-to-edge.

import { useCommandStore, type TileSize } from "@/stores/command/store";
import { AgentCard } from "./AgentCard";
import { MiniField } from "./MiniField";

interface GridConfig {
  /** Minimum column width — drives how many tiles fit per row at
   *  any given container width. */
  minWidthPx: number;
  /** `aspect-ratio` value (CSS). Tiles preserve this shape as the
   *  surrounding panel resizes; height scales with width. */
  aspect: string;
}

const TILE_GEOMETRY: Record<TileSize, GridConfig> = {
  // sm: pack more tiles in; slightly taller than wide so the
  // recent-activity list still has breathing room.
  sm: { minWidthPx: 240, aspect: "3 / 2" },
  // md: balanced — close to the underlying field's 40:21 aspect
  // so the MiniField fills cleanly without big letterbox bars.
  md: { minWidthPx: 320, aspect: "16 / 10" },
  // lg: inspection-friendly, biased wider so the field can stretch
  // out and the agent card has room for a full activity log.
  lg: { minWidthPx: 460, aspect: "16 / 9" },
};

interface AgentCardGridProps {
  onExpandField?: () => void;
}

export function AgentCardGrid({ onExpandField }: AgentCardGridProps) {
  const unitOrder = useCommandStore((s) => s.unitOrder);
  const tileSize = useCommandStore((s) => s.tileSize);
  const { minWidthPx, aspect } = TILE_GEOMETRY[tileSize];

  return (
    <div
      className="grid h-full content-start gap-2 overflow-y-auto p-2"
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${minWidthPx}px, 1fr))`,
      }}
    >
      <div style={{ aspectRatio: aspect }}>
        <MiniField onExpand={onExpandField} />
      </div>
      {unitOrder.map((id) => (
        <div key={id} style={{ aspectRatio: aspect }}>
          <AgentCard unitId={id} />
        </div>
      ))}
    </div>
  );
}
