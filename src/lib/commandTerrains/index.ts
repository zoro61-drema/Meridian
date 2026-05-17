// Command terrain registry.
//
// Spec §2.3: the tactical field renders its own terrain
// background, separate from Meridian's global background system.
// v1.1 ships two terrains:
//   - badlands       — opaque planet surface (v1.0 default)
//   - space-station  — orbital platform; the app background
//                      bleeds through the polygon perimeter
//
// To add a terrain: drop a new component file alongside this
// one exporting a TerrainBackgroundProps component, then add
// the entry below. No other changes needed; consumers iterate
// `TERRAINS` for the picker UI.

import { Badlands } from "./Badlands";
import { SpaceStation } from "./SpaceStation";
import type { TerrainDef, TerrainId } from "./types";

export type { TerrainBackgroundProps, TerrainDef, TerrainId } from "./types";

export const DEFAULT_TERRAIN: TerrainId = "badlands";

export const TERRAINS: Record<TerrainId, TerrainDef> = {
  badlands: {
    id: "badlands",
    label: "Badlands",
    description: "Dusty planet surface — opaque ground.",
    Background: Badlands,
    bleedThrough: false,
  },
  "space-station": {
    id: "space-station",
    label: "Space Station",
    description: "Orbital platform — starfield shows through the perimeter.",
    Background: SpaceStation,
    bleedThrough: true,
  },
};

export const TERRAIN_IDS = Object.keys(TERRAINS) as TerrainId[];

export function isTerrainId(value: unknown): value is TerrainId {
  return typeof value === "string" && value in TERRAINS;
}

export function getTerrain(id: TerrainId | string | null | undefined): TerrainDef {
  if (isTerrainId(id)) return TERRAINS[id];
  return TERRAINS[DEFAULT_TERRAIN];
}
