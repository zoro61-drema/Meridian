// Pluggable terrain registry — type contract.
//
// Spec §2.3.2: adding a new terrain is one new file in this
// directory plus an entry in `index.ts`. No core changes.

import type { ComponentType } from "react";

export type TerrainId = "badlands" | "space-station";

export interface TerrainBackgroundProps {
  width: number;
  height: number;
}

export interface TerrainDef {
  id: TerrainId;
  label: string;
  /** Short description shown next to the option in the picker. */
  description: string;
  Background: ComponentType<TerrainBackgroundProps>;
  /** Whether Meridian's global app background should show through
   *  outside the terrain's visible footprint. Badlands fills the
   *  field opaquely; SpaceStation is masked to a polygon so the
   *  starfield bleeds in around the edges. */
  bleedThrough: boolean;
}
