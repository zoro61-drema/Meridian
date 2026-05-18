// Shared sprite types — source of truth for the commandSprites
// library. Per-unit components (Marine, Engineer, …) import from
// here; they used to export the types themselves, but the raster
// sprites moved that ownership up.

export type Facing =
  | "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export type AgentState =
  | "idle"
  | "thinking"
  | "tool_running"
  | "streaming"
  | "awaiting_permission"
  | "done"
  | "error";

export type TransientAnimation = "spawning" | "deploying";

export interface UnitProps {
  state: AgentState;
  transient?: TransientAnimation;
  /** When true and no transient is active, the unit plays the
   *  `walk` locomotion loop in place of the persistent state
   *  animation. Driven by `TacticalField` during cosmetic wander
   *  (spec §2.4). Stationary units never receive `isMoving=true`.
   *  Precedence: transient > isMoving > state. */
  isMoving?: boolean;
  size?: number;
  facing: Facing;
  /** Fired exactly once when a one-shot transient reaches its
   *  final frame, so the parent can clear `transient` and return
   *  to the persistent state. Never fired for looping animations. */
  onTransientComplete?: () => void;
}

/** Field annotation colors used by TacticalField for tethers and
 *  signal arcs. Single palette now that per-unit accent colors
 *  are gone — tethers read as "structural" cyan, signals as
 *  "transient" amber so the two layers stay distinguishable. */
export const FIELD_ACCENTS = {
  tether: { primary: "#3b82f6", highlight: "#7aa8ff" },
  signal: { primary: "#f59e0b", highlight: "#fcd34d" },
} as const;

export const FACING_TO_DIR: Record<Facing, string> = {
  N: "north",
  NE: "north-east",
  E: "east",
  SE: "south-east",
  S: "south",
  SW: "south-west",
  W: "west",
  NW: "north-west",
};

export const STATE_TO_ANIM: Record<AgentState, string> = {
  idle: "idle",
  thinking: "thinking",
  tool_running: "tool_running",
  streaming: "streaming",
  awaiting_permission: "awaiting_permission",
  done: "done",
  error: "error",
};

export const TRANSIENT_TO_ANIM: Record<TransientAnimation, string> = {
  spawning: "spawning",
  deploying: "deploy", // PixelLab folder is "deploy"; state enum is "deploying".
};
