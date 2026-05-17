// TileSizePicker — header control for agent-card grid density.
//
// Three presets — small / medium / large — adjust the grid's
// row height and breakpoint column counts in AgentCardGrid.
// Selection persists via the `command_tile_size` preference so
// the choice survives app restart.

import { LayoutGrid, Rows3, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { setPreference } from "@/lib/preferences";
import { useCommandStore, type TileSize } from "@/stores/command/store";

export const COMMAND_TILE_SIZE_PREF_KEY = "command_tile_size";

interface Option {
  id: TileSize;
  label: string;
  Icon: typeof Square;
  hint: string;
}

const OPTIONS: Option[] = [
  { id: "sm", label: "S", Icon: LayoutGrid, hint: "Small tiles — more per row" },
  { id: "md", label: "M", Icon: Square, hint: "Medium tiles (default)" },
  { id: "lg", label: "L", Icon: Rows3, hint: "Large tiles — more detail per row" },
];

export function TileSizePicker() {
  const tileSize = useCommandStore((s) => s.tileSize);
  const setTileSize = useCommandStore((s) => s.setTileSize);

  const onSelect = (id: TileSize) => {
    if (id === tileSize) return;
    setTileSize(id);
    void setPreference(COMMAND_TILE_SIZE_PREF_KEY, id);
  };

  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-white/10 bg-black/30 px-1 py-0.5"
      role="radiogroup"
      aria-label="Agent card tile size"
    >
      <span className="px-1 text-[9px] uppercase tracking-wider text-white/40">
        tiles
      </span>
      {OPTIONS.map(({ id, label, Icon, hint }) => {
        const active = id === tileSize;
        return (
          <Button
            key={id}
            type="button"
            variant="ghost"
            size="sm"
            role="radio"
            aria-checked={active}
            title={hint}
            onClick={() => onSelect(id)}
            className={`h-6 gap-1 px-1.5 text-[10px] ${
              active
                ? "bg-white/15 text-white/90 hover:bg-white/15"
                : "text-white/60 hover:bg-white/10 hover:text-white/90"
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </Button>
        );
      })}
    </div>
  );
}
