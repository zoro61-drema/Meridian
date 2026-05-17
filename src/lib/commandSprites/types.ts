// Shared sprite types — re-exported from Marine.tsx, which is the
// canonical source (the design brief calls Marine the "pilot"
// component; Engineer + FieldTech derive their props from the same
// shape). All three sprite files duplicate the type declarations
// internally so they remain individually importable; this barrel
// just gives the rest of the app a single place to pull from.

export type {
  AccentColor,
  AgentState,
  ArmorTemplate,
  Facing,
  GunTemplate,
  TransientAnimation,
  UnitProps,
} from "./Marine";

/** Field-level accent colors — used by TacticalField for tethers
 *  and signal arcs (the sprites embed their own palette internally
 *  via ACCENTS map). Hex values match the sprites' base accent so
 *  field annotations read consistently next to their owning unit. */
export const ACCENT_PALETTE: Record<
  "slate" | "blue" | "violet" | "green" | "orange" | "rose",
  { primary: string; highlight: string; shadow: string }
> = {
  slate: { primary: "#64748b", highlight: "#94a3b8", shadow: "#334155" },
  blue: { primary: "#3b82f6", highlight: "#7aa8ff", shadow: "#1d4ed8" },
  violet: { primary: "#8b5cf6", highlight: "#b89cff", shadow: "#5b21b6" },
  green: { primary: "#22c55e", highlight: "#6ee7a0", shadow: "#15803d" },
  orange: { primary: "#f97316", highlight: "#fdba74", shadow: "#9a3412" },
  rose: { primary: "#f43f5e", highlight: "#fb7185", shadow: "#9f1239" },
};
