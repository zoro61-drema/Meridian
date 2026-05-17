// TerrainPicker — toggle for the active tactical-field terrain.
//
// Spec §2.3.2 / Phase 14: surfaces the two v1.1 terrains
// (Badlands, Space Station) as a small button group in the
// Command header. Writes the selection to both the in-memory
// store and the `command_terrain` preference so it survives
// app restart.

import { Globe2, Satellite } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TERRAIN_IDS, TERRAINS, type TerrainId } from "@/lib/commandTerrains";
import { setPreference } from "@/lib/preferences";
import { useCommandStore } from "@/stores/command/store";

export const COMMAND_TERRAIN_PREF_KEY = "command_terrain";

const TERRAIN_ICONS: Record<TerrainId, typeof Globe2> = {
  badlands: Globe2,
  "space-station": Satellite,
};

export function TerrainPicker() {
  const terrain = useCommandStore((s) => s.terrain);
  const setTerrain = useCommandStore((s) => s.setTerrain);

  const onSelect = (id: TerrainId) => {
    if (id === terrain) return;
    setTerrain(id);
    void setPreference(COMMAND_TERRAIN_PREF_KEY, id);
  };

  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-white/10 bg-black/30 px-1 py-0.5"
      role="radiogroup"
      aria-label="Tactical field terrain"
    >
      <span className="px-1 text-[9px] uppercase tracking-wider text-white/40">
        terrain
      </span>
      {TERRAIN_IDS.map((id) => {
        const def = TERRAINS[id];
        const Icon = TERRAIN_ICONS[id];
        const active = id === terrain;
        return (
          <Button
            key={id}
            type="button"
            variant="ghost"
            size="sm"
            role="radio"
            aria-checked={active}
            title={`${def.label} — ${def.description}`}
            onClick={() => onSelect(id)}
            className={`h-6 gap-1 px-1.5 text-[10px] ${
              active
                ? "bg-white/15 text-white/90 hover:bg-white/15"
                : "text-white/60 hover:bg-white/10 hover:text-white/90"
            }`}
          >
            <Icon className="h-3 w-3" />
            {def.label}
          </Button>
        );
      })}
    </div>
  );
}
