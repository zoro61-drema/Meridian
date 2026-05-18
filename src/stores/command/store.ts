// Command Zustand store.
//
// Phase 3 scope: live ACP-backed sessions, no persistence yet.
//   - Units are created in response to `command:session:update`
//     events of kind `sessionCreated` (emitted by the Phase 1
//     backend after `session/new` succeeds).
//   - Per-unit state transitions are driven by the ACP `update.sessionUpdate`
//     kinds: agent_thought_chunk → thinking, tool_call → tool_running,
//     agent_message_chunk → streaming, … (see `listeners.ts`).
//   - Per-unit transcript accumulates text chunks so the chat panel
//     has something live to render.
//
// Phase 6 adds SQLite persistence + cross-session resume. Phase 8
// adds parent/child links + tree management. Until then, refresh
// drops the in-memory field.

import { create } from "zustand";

import { DEFAULT_TERRAIN, isTerrainId, type TerrainId } from "@/lib/commandTerrains";
import type {
  FieldDecision,
  GroomingProposal,
} from "@/lib/commandGrooming";
import type { McpServerEntry } from "@/lib/commandMcpServers";
import {
  DEFAULT_STATUSLINE_SEGMENTS,
  type StatuslineSegmentEntry,
} from "@/lib/commandStatusline";

export type TileSize = "sm" | "md" | "lg";
export const DEFAULT_TILE_SIZE: TileSize = "md";
const TILE_SIZES: TileSize[] = ["sm", "md", "lg"];
export function isTileSize(value: unknown): value is TileSize {
  return typeof value === "string" && (TILE_SIZES as string[]).includes(value);
}

import type {
  AgentState,
  Facing,
  TransientAnimation,
} from "@/lib/commandSprites";
import {
  initialSchedule as initialWanderSchedule,
  planWanderMove,
  scheduleNextPick,
  easedPosition,
  type WanderSchedule,
} from "@/lib/commandWander";
import {
  commandArchiveSession,
  commandSaveGroomingProposal,
  commandSaveMessage,
  commandSaveSession,
  type A2AMessage,
  type StoredMessage,
  type StoredSession,
} from "@/lib/tauri/command";

export type SpriteId = "marine" | "engineer" | "field-tech" | "light-walker" | "siege-walker";

export type BackendKind = "claudeAcp" | "geminiAcp" | "codexAcp" | "qwenAcp";

export type TranscriptEntryKind =
  | "system"
  | "user"
  | "agent_text"
  | "agent_thought"
  | "tool_call"
  | "tool_result"
  | "error";

export interface TranscriptEntry {
  id: string;
  kind: TranscriptEntryKind;
  text: string;
  createdAt: number;
}

export interface PermissionOption {
  optionId: string;
  name: string;
  /** ACP "kind" — usually one of allow_always, allow_once,
   *  reject_once, reject_always. The UI maps these to Allow / Deny
   *  buttons and picks the most permissive allow / most cautious
   *  deny by default. */
  kind?: string;
}

export interface PermissionRequest {
  /** JSON-RPC request id (string or number). Sent back as-is. */
  requestId: unknown;
  toolCall?: {
    title?: string;
    kind?: string;
    content?: unknown;
  };
  options: PermissionOption[];
}

export interface CommandUnit {
  id: string;
  name: string;
  spriteId: SpriteId;
  role: string;
  projectId: string;
  backend: BackendKind;
  modelId: string;
  state: AgentState;
  transient?: TransientAnimation;
  positionX: number;
  positionY: number;
  facing: "left" | "right";
  /** Anchor for cosmetic wander (spec §2.4). Fixed at launch; the
   *  unit drifts a few pixels around it during idle. Persisted so
   *  field layout survives reloads. */
  anchorX: number;
  anchorY: number;
  /** 8-compass facing for sprite render. Independent of state —
   *  rotates during wander and at launch. The legacy 2-direction
   *  `facing` above is kept for backwards compat with archive
   *  storage and isn't read by the renderer anymore. */
  facing8: Facing;
  /** True while a wander move is in progress (drives the `walk`
   *  animation on the sprite). In-memory only — not persisted. */
  isWandering: boolean;
  /** Whether this unit may wander at all. Derived from spriteId at
   *  launch (Sentinel Turret = false; all others = true). */
  canWander: boolean;
  contextUsage: number;
  createdAt: number;
  lastActiveAt: number;
  transcript: TranscriptEntry[];
  /** Tracks whether the user has an outstanding session/prompt call
   *  in flight. Used by the chat panel to disable Send while busy
   *  and by the listener to know when to fall back to idle. */
  promptInFlight: boolean;
  /** Set at launch when the role has a system prompt; consumed +
   *  cleared on the first user prompt. Null after consumption. */
  rolePrompt: string | null;
  /** Current outstanding session/request_permission, if any. The
   *  chat panel renders an inline Allow/Deny card while present. */
  pendingPermission: PermissionRequest | null;
  /** Opaque ACP session id, returned by `session/new`. Used as the
   *  resume key when restoring a unit after restart. */
  acpSessionId: string;
  /** True while the unit has a live ACP subprocess attached. False
   *  for units hydrated from disk on boot; they need an explicit
   *  resume to reconnect. */
  isLive: boolean;
  /** True while a `session/load` replay is in flight. The wrapper
   *  re-emits the full prior conversation as session/update
   *  notifications when we call session/load; we already have that
   *  history from SQLite, so the listener drops events while this
   *  flag is set to avoid duplicating the transcript. */
  suppressNotifications: boolean;
  /** Subagent tree (spec §5.2). Set when this unit was spawned as
   *  a child of another unit via a Task-style tool call.
   *  Subagents are in-memory only — they share the parent's
   *  wrapper session, so they don't survive app restart on their
   *  own (the parent's resume re-establishes the wrapper, and any
   *  in-flight subagent tool call gets replayed). */
  parentId: string | null;
  /** Derived; kept in sync by the store when subagents are added
   *  or removed. */
  childIds: string[];
  /** True for units created as subagents via tool_call detection.
   *  Affects rendering (smaller sprite, no Launch-time spawning
   *  transient) and persistence (skip SQLite save). */
  isSubagent: boolean;
  /** A2A messages addressed to this unit that haven't yet been
   *  consumed by an agent turn. The chat panel shows an inbox
   *  card; messages are drained (and prepended as system context)
   *  on the next user prompt. */
  inbox: A2AMessage[];
  /** Files the agent has read / edited / written — keyed by path,
   *  most-recent-touch first. Populated from `locations` blocks
   *  on tool_call events. */
  files: TouchedFile[];
  /** Shell-like commands the agent has invoked — keyed by tool
   *  call id so completion status can update in-place. */
  commands: IssuedCommand[];
  /** Last raw ACP `session/update` notification body. Surfaced by
   *  the Debug tab for protocol-level inspection. Cleared on
   *  unit removal; not persisted. */
  lastRawEvent: { method: string; params: unknown; id: unknown } | null;
  /** Most-recent usage snapshot from the wrapper's `usage_update`
   *  notifications. `tokens` is cumulative for the session;
   *  `contextSize` is the model's window. `cost` only arrives on
   *  some wrappers (Claude emits it; Gemini/Qwen don't yet). */
  usage: {
    /** Cumulative total tokens (input + output) for the session. */
    tokens: number;
    /** Input/prompt tokens this session, if the wrapper splits them
     *  out. Null when only the cumulative total is available. */
    inputTokens: number | null;
    /** Output/completion tokens this session, same nullable contract. */
    outputTokens: number | null;
    contextSize: number | null;
    costUsd: number | null;
    updatedAtMs: number;
  } | null;
  /** Grooming queue — populated by ticket-groomer units when they
   *  call the `submit_grooming_recommendations` MCP tool. One
   *  proposal per ticket; the user reviews and decides per-field
   *  in the focused panel's Tickets tab. */
  groomingQueue: GroomingProposal[];
}

/** Transient parent→child arc drawn by the tactical field for a
 *  few seconds after an A2A message lands. Keyed by sender →
 *  recipient pair so a quick burst of messages just refreshes the
 *  TTL on one arc rather than flooding the field with SVG. */
export interface SignalArc {
  id: string;
  fromSessionId: string;
  toSessionId: string;
  expiresAtMs: number;
}

/** A file the agent has read, written, or edited during this
 *  session. Tracked from ACP tool_call `locations` blocks and
 *  rawInput.path-style fields; multiple touches on the same path
 *  just update `lastTouchedAt`. */
export interface TouchedFile {
  path: string;
  firstTouchedAt: number;
  lastTouchedAt: number;
  /** Most recent tool kind that touched it (read/edit/delete/…). */
  lastKind: string;
}

/** A shell-like command the agent has executed. */
export interface IssuedCommand {
  id: string;
  command: string;
  createdAt: number;
  exitCode?: number | null;
  status?: string;
}

interface AddUnitInput {
  sessionId: string;
  backend: BackendKind;
  acpSessionId: string;
  spriteId?: SpriteId;
  name?: string;
  role?: string;
  modelId?: string;
  projectId?: string;
  rolePrompt?: string;
}

interface AddSubagentInput {
  parentId: string;
  /** Synthetic id — typically the wrapper's toolCallId so multiple
   *  updates for the same subagent collapse to one unit. */
  sessionId: string;
  name?: string;
  spriteId?: SpriteId;
}

interface CommandState {
  units: Record<string, CommandUnit>;
  /** Order of session-id keys, used by both rendering and the
   *  slot allocator. Plain insertion order. */
  unitOrder: string[];
  selectedUnitId: string | null;
  /** Currently-visible signal arcs. Cleared on TTL expiry by a
   *  periodic sweep kicked off when an arc is registered. */
  signalArcs: SignalArc[];
  /** Selected terrain id for the tactical field. Hydrated from the
   *  `command_terrain` preference on Command screen mount; setter
   *  is fire-and-forget (caller persists to prefs separately). */
  terrain: TerrainId;
  /** Card grid density. Hydrated from `command_tile_size` pref. */
  tileSize: TileSize;
  /** Configurable statusline segments on every agent card.
   *  Hydrated from `command_statusline` pref (JSON-encoded). */
  statuslineSegments: StatuslineSegmentEntry[];
  /** Per-role system-prompt overrides, keyed by role id. Empty/
   *  missing entry means use the static default in commandRoles.
   *  Hydrated from `command_role_overrides` pref (JSON map). */
  roleOverrides: Record<string, string>;
  /** Skill ids attached to each role. Selected skill bodies are
   *  appended to the role's system prompt at launch. Hydrated
   *  from `command_role_skills` pref (JSON map roleId → skillId[]). */
  roleSkills: Record<string, string[]>;
  /** In-memory cache of skills loaded from disk. Refreshed by
   *  the Settings dialog whenever the user opens it. */
  skills: { id: string; body: string; updatedAtMs: number }[];
  /** Global MCP server list, filtered per-backend at launch.
   *  Hydrated from `command_mcp_servers` pref (JSON array). */
  mcpServers: McpServerEntry[];

  selectUnit: (id: string | null) => void;
  setTerrain: (id: TerrainId) => void;
  setTileSize: (size: TileSize) => void;
  setStatuslineSegments: (segments: StatuslineSegmentEntry[]) => void;
  setRoleOverride: (roleId: string, prompt: string) => void;
  setRoleOverrides: (overrides: Record<string, string>) => void;
  setRoleSkills: (roleId: string, skillIds: string[]) => void;
  setAllRoleSkills: (map: Record<string, string[]>) => void;
  setSkillsCache: (
    skills: { id: string; body: string; updatedAtMs: number }[],
  ) => void;
  setMcpServers: (servers: McpServerEntry[]) => void;
  addUnit: (input: AddUnitInput) => void;
  addSubagent: (input: AddSubagentInput) => void;
  setUnitState: (id: string, state: AgentState) => void;
  fireTransient: (id: string, transient: TransientAnimation | undefined) => void;
  appendTranscript: (
    id: string,
    kind: TranscriptEntryKind,
    text: string,
    options?: { newEntry?: boolean },
  ) => void;
  /** Wipe a unit's transcript locally — used by the `/clear`
   *  slash command. Doesn't touch the wrapper; the agent's
   *  internal context is unaffected. */
  clearTranscript: (id: string) => void;
  setPromptInFlight: (id: string, inFlight: boolean) => void;
  /** Read-and-clear the role's system prompt. Returns null when
   *  there's nothing to prepend (subsequent user turns). */
  consumeRolePrompt: (id: string) => string | null;
  setPendingPermission: (id: string, request: PermissionRequest | null) => void;
  setUnitLive: (id: string, isLive: boolean) => void;
  setSuppressNotifications: (id: string, suppress: boolean) => void;
  /** Apply a runtime backend switch — updates the unit's backend,
   *  default sprite (if it was the auto-picked default), and
   *  clears wrapper-specific transient state (inbox / pending
   *  permission). Transcript / files / commands persist. */
  switchBackend: (id: string, backend: BackendKind, acpSessionId: string) => void;
  /** Update a unit's model id — used by the `/model <id>` slash
   *  command after the wrapper has been restarted with the new
   *  env var. The actual model the agent talks to is governed by
   *  what was injected into the wrapper's env at spawn time; this
   *  field is just the UI's record of what the user picked. */
  setUnitModel: (id: string, modelId: string) => void;
  /** Append an A2A message to the recipient's inbox and register
   *  a transient signal arc on the field. */
  receiveA2AMessage: (msg: A2AMessage) => void;
  /** Clear the recipient's inbox after the user's next prompt has
   *  consumed the messages (or the user explicitly dismissed). */
  clearInbox: (sessionId: string) => void;
  /** Record a file the agent just touched. Dedupes by path. */
  touchFile: (sessionId: string, path: string, kind: string) => void;
  /** Record a shell-like command the agent invoked. */
  recordCommand: (
    sessionId: string,
    toolCallId: string,
    command: string,
  ) => void;
  /** Update a recorded command's completion status. */
  finishCommand: (
    sessionId: string,
    toolCallId: string,
    status: string,
    exitCode?: number | null,
  ) => void;
  /** Snapshot the most recent raw ACP event for the Debug tab. */
  setLastRawEvent: (
    sessionId: string,
    raw: { method: string; params: unknown; id: unknown },
  ) => void;
  /** Update the unit's token/cost usage snapshot. */
  setUsage: (
    sessionId: string,
    usage: {
      tokens: number;
      inputTokens: number | null;
      outputTokens: number | null;
      contextSize: number | null;
      costUsd: number | null;
    },
  ) => void;
  /** Drive the cosmetic wander system (spec §2.4). Called from
   *  TacticalField's requestAnimationFrame loop. Advances any
   *  in-flight moves, picks new destinations on schedule, and
   *  cancels wander when state isn't `idle`. */
  tickWander: (nowMs: number) => void;
  /** Append (or replace, if a proposal for the same ticket key
   *  already exists) a grooming proposal on the unit's queue. */
  upsertGroomingProposal: (
    sessionId: string,
    proposal: GroomingProposal,
  ) => void;
  /** Set a single change's decision + approved value (the user's
   *  per-field choice in the Tickets-tab detail UI). */
  setGroomingFieldDecision: (
    sessionId: string,
    proposalId: string,
    changeId: string,
    decision: FieldDecision,
    approvedValue: string | null,
  ) => void;
  /** Mark a proposal as skipped — moves it out of the user's
   *  pending pile without touching JIRA. */
  skipGroomingProposal: (sessionId: string, proposalId: string) => void;
  /** Mark a proposal as submitted after successful JIRA push. */
  markGroomingProposalSubmitted: (
    sessionId: string,
    proposalId: string,
  ) => void;
  removeUnit: (id: string, exitCode?: number | null) => void;
  /** Replace the store with units + transcripts loaded from SQLite
   *  on app boot. Units land in `isLive: false` until resumed. */
  hydrateFromStorage: (
    sessions: StoredSession[],
    messagesBySession: Record<string, StoredMessage[]>,
    proposalsBySession?: Record<string, GroomingProposal[]>,
  ) => void;
}

const POSITION_SLOTS: Array<{ x: number; y: number }> = [
  { x: 220, y: 180 },
  { x: 380, y: 180 },
  { x: 540, y: 180 },
  { x: 220, y: 320 },
  { x: 380, y: 320 },
  { x: 540, y: 320 },
  { x: 700, y: 180 },
  { x: 700, y: 320 },
];

function nextSlot(used: number): { x: number; y: number } {
  if (used < POSITION_SLOTS.length) return POSITION_SLOTS[used];
  // Beyond the static slots, scatter with a deterministic offset so
  // refreshes keep the same position for the same launch index.
  const offset = used - POSITION_SLOTS.length;
  return { x: 240 + (offset % 6) * 90, y: 460 + Math.floor(offset / 6) * 130 };
}



function newEntryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const SPRITE_FOR_BACKEND: Record<BackendKind, SpriteId> = {
  claudeAcp: "marine",
  geminiAcp: "field-tech",
  codexAcp: "engineer",
  qwenAcp: "engineer",
};

/** Wander capability per sprite. All current sprites can wander;
 *  Sentinel Turret (not yet in the roster) will be `false` when it
 *  ships per spec §2.4. */
const CAN_WANDER_BY_SPRITE: Record<SpriteId, boolean> = {
  marine: true,
  engineer: true,
  "field-tech": true,
  "light-walker": true,
  "siege-walker": true,
};

/** Per-unit wander schedule. In-memory only — not persisted. The
 *  positions/facing are derived from this every tickWander call
 *  and written back into the unit's positionX/Y, facing8,
 *  isWandering fields. Keyed by unit id; cleaned up on removal. */
const wanderSchedules = new Map<string, WanderSchedule>();

export const useCommandStore = create<CommandState>((set, get) => ({
  units: {},
  unitOrder: [],
  selectedUnitId: null,
  signalArcs: [],
  terrain: DEFAULT_TERRAIN,
  tileSize: DEFAULT_TILE_SIZE,
  statuslineSegments: DEFAULT_STATUSLINE_SEGMENTS,
  roleOverrides: {},
  roleSkills: {},
  skills: [],
  mcpServers: [],

  selectUnit: (id) => set({ selectedUnitId: id }),
  setTerrain: (id) => set({ terrain: isTerrainId(id) ? id : DEFAULT_TERRAIN }),
  setTileSize: (size) =>
    set({ tileSize: isTileSize(size) ? size : DEFAULT_TILE_SIZE }),
  setStatuslineSegments: (segments) =>
    set({ statuslineSegments: segments }),
  setRoleOverride: (roleId, prompt) =>
    set((s) => ({
      roleOverrides: { ...s.roleOverrides, [roleId]: prompt },
    })),
  setRoleOverrides: (overrides) => set({ roleOverrides: overrides }),
  setRoleSkills: (roleId, skillIds) =>
    set((s) => ({
      roleSkills: { ...s.roleSkills, [roleId]: skillIds },
    })),
  setAllRoleSkills: (map) => set({ roleSkills: map }),
  setSkillsCache: (skills) => set({ skills }),
  setMcpServers: (servers) => set({ mcpServers: servers }),

  addUnit: ({
    sessionId,
    backend,
    acpSessionId,
    spriteId,
    name,
    role,
    modelId,
    projectId,
    rolePrompt,
  }) =>
    set((s) => {
      if (s.units[sessionId]) return s; // dedup
      const orderIndex = s.unitOrder.length;
      const pos = nextSlot(orderIndex);
      const chosenSprite: SpriteId = spriteId ?? SPRITE_FOR_BACKEND[backend];
      const now = Date.now();
      const unit: CommandUnit = {
        id: sessionId,
        name: name ?? `${labelForBackend(backend)} ${orderIndex + 1}`,
        spriteId: chosenSprite,
        role: role ?? "Implementer",
        projectId: projectId ?? "meridian",
        backend,
        modelId: modelId ?? defaultModelFor(backend),
        state: "idle",
        transient: "spawning",
        positionX: pos.x,
        positionY: pos.y,
        facing: "right",
        anchorX: pos.x,
        anchorY: pos.y,
        facing8: "S",
        isWandering: false,
        canWander: CAN_WANDER_BY_SPRITE[chosenSprite] ?? true,
        contextUsage: 0,
        createdAt: now,
        lastActiveAt: now,
        transcript: [
          {
            id: newEntryId(),
            kind: "system",
            text: rolePrompt
              ? `Session attached on ${labelForBackend(backend)} · role primed (${(rolePrompt ?? "").length} chars).`
              : `Session attached on ${labelForBackend(backend)}.`,
            createdAt: now,
          },
        ],
        promptInFlight: false,
        rolePrompt: rolePrompt && rolePrompt.length > 0 ? rolePrompt : null,
        pendingPermission: null,
        acpSessionId,
        isLive: true,
        suppressNotifications: false,
        parentId: null,
        childIds: [],
        isSubagent: false,
        inbox: [],
        files: [],
        commands: [],
        lastRawEvent: null,
        usage: null,
        groomingQueue: [],
};
      // Persist asynchronously — best effort; surfaces no error to
      // the UI because the unit is fully usable in memory regardless
      // of disk persistence outcome. SQLite write errors land in the
      // Rust stderr log.
      void commandSaveSession(toStoredSession(unit)).catch(() => {});
      return {
        units: { ...s.units, [sessionId]: unit },
        unitOrder: [...s.unitOrder, sessionId],
        selectedUnitId: s.selectedUnitId ?? sessionId,
      };
    }),

  setUnitState: (id, state) =>
    set((s) => {
      const u = s.units[id];
      if (!u) return s;
      return {
        units: {
          ...s.units,
          [id]: { ...u, state, lastActiveAt: Date.now() },
        },
      };
    }),

  fireTransient: (id, transient) =>
    set((s) => {
      const u = s.units[id];
      if (!u) return s;
      return { units: { ...s.units, [id]: { ...u, transient } } };
    }),

  appendTranscript: (id, kind, text, options) =>
    set((s) => {
      const u = s.units[id];
      if (!u) return s;
      const now = Date.now();
      const last = u.transcript[u.transcript.length - 1];
      const shouldExtend =
        !options?.newEntry && last && last.kind === kind && kind !== "tool_call";
      const transcript = shouldExtend
        ? [
            ...u.transcript.slice(0, -1),
            { ...last!, text: last!.text + text, createdAt: now },
          ]
        : [
            ...u.transcript,
            { id: newEntryId(), kind, text, createdAt: now },
          ];
      // Persist only durable transcript kinds; tool_call /
      // tool_result are wrapper-replayed on resume, no point
      // storing them.
      const persistKinds: TranscriptEntryKind[] = [
        "user",
        "agent_text",
        "agent_thought",
        "system",
        "error",
      ];
      if (persistKinds.includes(kind)) {
        const newest = transcript[transcript.length - 1]!;
        void commandSaveMessage({
          id: newest.id,
          sessionId: id,
          seq: transcript.length,
          kind,
          text: newest.text,
          createdAt: newest.createdAt,
        }).catch(() => {});
      }
      return {
        units: {
          ...s.units,
          [id]: { ...u, transcript, lastActiveAt: now },
        },
      };
    }),

  clearTranscript: (id) =>
    set((s) => {
      const u = s.units[id];
      if (!u) return s;
      return {
        units: {
          ...s.units,
          [id]: { ...u, transcript: [], lastActiveAt: Date.now() },
        },
      };
    }),

  setPromptInFlight: (id, inFlight) =>
    set((s) => {
      const u = s.units[id];
      if (!u) return s;
      return {
        units: { ...s.units, [id]: { ...u, promptInFlight: inFlight } },
      };
    }),

  consumeRolePrompt: (id) => {
    const u = get().units[id];
    if (!u || !u.rolePrompt) return null;
    const prompt = u.rolePrompt;
    set((s) => {
      const unit = s.units[id];
      if (!unit) return s;
      return { units: { ...s.units, [id]: { ...unit, rolePrompt: null } } };
    });
    return prompt;
  },

  setPendingPermission: (id, request) =>
    set((s) => {
      const u = s.units[id];
      if (!u) return s;
      return {
        units: { ...s.units, [id]: { ...u, pendingPermission: request } },
      };
    }),

  setUnitLive: (id, isLive) =>
    set((s) => {
      const u = s.units[id];
      if (!u) return s;
      return { units: { ...s.units, [id]: { ...u, isLive } } };
    }),

  receiveA2AMessage: (msg) =>
    set((s) => {
      const recipient = s.units[msg.toSessionId];
      if (!recipient) return s;
      const now = Date.now();
      const arcId = `${msg.fromSessionId}->${msg.toSessionId}`;
      const arcs = [
        ...s.signalArcs.filter((a) => a.id !== arcId && a.expiresAtMs > now),
        {
          id: arcId,
          fromSessionId: msg.fromSessionId,
          toSessionId: msg.toSessionId,
          expiresAtMs: now + 1800,
        },
      ];
      // Kick a one-shot sweep so the arc actually disappears
      // even if no other state changes happen before TTL.
      window.setTimeout(() => {
        useCommandStore.setState((cs) => ({
          signalArcs: cs.signalArcs.filter((a) => a.expiresAtMs > Date.now()),
        }));
      }, 1900);
      return {
        signalArcs: arcs,
        units: {
          ...s.units,
          [msg.toSessionId]: { ...recipient, inbox: [...recipient.inbox, msg] },
        },
      };
    }),

  clearInbox: (sessionId) =>
    set((s) => {
      const u = s.units[sessionId];
      if (!u) return s;
      return { units: { ...s.units, [sessionId]: { ...u, inbox: [] } } };
    }),

  touchFile: (sessionId, path, kind) =>
    set((s) => {
      const u = s.units[sessionId];
      if (!u || !path) return s;
      const now = Date.now();
      const existing = u.files.find((f) => f.path === path);
      const filtered = u.files.filter((f) => f.path !== path);
      const entry: TouchedFile = existing
        ? { ...existing, lastTouchedAt: now, lastKind: kind || existing.lastKind }
        : { path, firstTouchedAt: now, lastTouchedAt: now, lastKind: kind || "" };
      return {
        units: { ...s.units, [sessionId]: { ...u, files: [entry, ...filtered] } },
      };
    }),

  recordCommand: (sessionId, toolCallId, command) =>
    set((s) => {
      const u = s.units[sessionId];
      if (!u || !command.trim()) return s;
      if (u.commands.some((c) => c.id === toolCallId)) return s;
      const entry: IssuedCommand = {
        id: toolCallId,
        command,
        createdAt: Date.now(),
        status: "running",
      };
      return {
        units: { ...s.units, [sessionId]: { ...u, commands: [entry, ...u.commands] } },
      };
    }),

  finishCommand: (sessionId, toolCallId, status, exitCode) =>
    set((s) => {
      const u = s.units[sessionId];
      if (!u) return s;
      const idx = u.commands.findIndex((c) => c.id === toolCallId);
      if (idx === -1) return s;
      const updated = [...u.commands];
      updated[idx] = { ...updated[idx]!, status, exitCode: exitCode ?? null };
      return { units: { ...s.units, [sessionId]: { ...u, commands: updated } } };
    }),

  setLastRawEvent: (sessionId, raw) =>
    set((s) => {
      const u = s.units[sessionId];
      if (!u) return s;
      return { units: { ...s.units, [sessionId]: { ...u, lastRawEvent: raw } } };
    }),

  upsertGroomingProposal: (sessionId, proposal) =>
    set((s) => {
      const u = s.units[sessionId];
      if (!u) return s;
      const existingIdx = u.groomingQueue.findIndex(
        (p) => p.ticketKey === proposal.ticketKey,
      );
      const nextQueue =
        existingIdx >= 0
          ? u.groomingQueue.map((p, i) => (i === existingIdx ? proposal : p))
          : [...u.groomingQueue, proposal];
      // Persist alongside the in-memory update — fire-and-forget;
      // if the write fails the user still sees the queue, and the
      // next mutation will retry the row.
      void commandSaveGroomingProposal(
        sessionId,
        proposal.id,
        proposal.ticketKey,
        JSON.stringify(proposal),
        proposal.createdAtMs,
      ).catch((err: unknown) => {
        console.warn("[command] failed to persist grooming proposal", err);
      });
      return {
        units: { ...s.units, [sessionId]: { ...u, groomingQueue: nextQueue } },
      };
    }),

  setGroomingFieldDecision: (sessionId, proposalId, changeId, decision, approvedValue) => {
    let toPersist: GroomingProposal | null = null;
    set((s) => {
      const u = s.units[sessionId];
      if (!u) return s;
      const nextQueue = u.groomingQueue.map((p) => {
        if (p.id !== proposalId) return p;
        const updated: GroomingProposal = {
          ...p,
          changes: p.changes.map((c) =>
            c.id === changeId ? { ...c, decision, approvedValue } : c,
          ),
        };
        toPersist = updated;
        return updated;
      });
      return {
        units: { ...s.units, [sessionId]: { ...u, groomingQueue: nextQueue } },
      };
    });
    if (toPersist) {
      const p = toPersist as GroomingProposal;
      void commandSaveGroomingProposal(
        sessionId,
        p.id,
        p.ticketKey,
        JSON.stringify(p),
        p.createdAtMs,
      ).catch((err: unknown) => {
        console.warn("[command] failed to persist grooming decision", err);
      });
    }
  },

  skipGroomingProposal: (sessionId, proposalId) => {
    let toPersist: GroomingProposal | null = null;
    set((s) => {
      const u = s.units[sessionId];
      if (!u) return s;
      const nextQueue = u.groomingQueue.map((p) => {
        if (p.id !== proposalId) return p;
        const updated = { ...p, skippedAt: Date.now() };
        toPersist = updated;
        return updated;
      });
      return {
        units: { ...s.units, [sessionId]: { ...u, groomingQueue: nextQueue } },
      };
    });
    if (toPersist) {
      const p = toPersist as GroomingProposal;
      void commandSaveGroomingProposal(
        sessionId,
        p.id,
        p.ticketKey,
        JSON.stringify(p),
        p.createdAtMs,
      ).catch((err: unknown) => {
        console.warn("[command] failed to persist grooming skip", err);
      });
    }
  },

  markGroomingProposalSubmitted: (sessionId, proposalId) => {
    let toPersist: GroomingProposal | null = null;
    set((s) => {
      const u = s.units[sessionId];
      if (!u) return s;
      const nextQueue = u.groomingQueue.map((p) => {
        if (p.id !== proposalId) return p;
        const updated = { ...p, submittedAt: Date.now() };
        toPersist = updated;
        return updated;
      });
      return {
        units: { ...s.units, [sessionId]: { ...u, groomingQueue: nextQueue } },
      };
    });
    if (toPersist) {
      const p = toPersist as GroomingProposal;
      void commandSaveGroomingProposal(
        sessionId,
        p.id,
        p.ticketKey,
        JSON.stringify(p),
        p.createdAtMs,
      ).catch((err: unknown) => {
        console.warn("[command] failed to persist grooming submit", err);
      });
    }
  },

  setUsage: (sessionId, usage) =>
    set((s) => {
      const u = s.units[sessionId];
      if (!u) return s;
      return {
        units: {
          ...s.units,
          [sessionId]: {
            ...u,
            usage: { ...usage, updatedAtMs: Date.now() },
          },
        },
      };
    }),

  tickWander: (nowMs) =>
    set((s) => {
      // Snapshot positions of all units once so candidate-collision
      // checks see a stable picture for the whole tick.
      const positions: Array<{ id: string; x: number; y: number }> = [];
      for (const id of s.unitOrder) {
        const u = s.units[id];
        if (u) positions.push({ id, x: u.positionX, y: u.positionY });
      }

      let changed = false;
      const next: Record<string, CommandUnit> = { ...s.units };

      for (const id of s.unitOrder) {
        const u = s.units[id];
        if (!u) continue;
        // Stationary units (canWander=false) never wander.
        // State must be idle, no active transient, and the unit
        // must be live (don't wander disconnected units).
        const wanderEligible =
          u.canWander &&
          u.state === "idle" &&
          !u.transient &&
          u.isLive &&
          !u.isSubagent;

        let schedule = wanderSchedules.get(id);
        if (!schedule) {
          schedule = initialWanderSchedule(nowMs);
          wanderSchedules.set(id, schedule);
        }

        // Cancel an in-flight move if the unit is no longer
        // eligible (state changed mid-walk). The sprite returns
        // to its persistent state animation in place.
        if (!wanderEligible && schedule.active) {
          schedule.active = null;
          schedule.nextPickAtMs = scheduleNextPick(nowMs);
          if (u.isWandering) {
            next[id] = { ...u, isWandering: false };
            changed = true;
          }
          continue;
        }

        if (!wanderEligible) continue;

        // Advance an in-flight move.
        if (schedule.active) {
          const r = easedPosition(schedule.active, nowMs);
          const newX = r.x;
          const newY = r.y;
          const stillMoving = !r.done;
          const facing = schedule.active.facing;
          if (
            u.positionX !== newX ||
            u.positionY !== newY ||
            u.facing8 !== facing ||
            u.isWandering !== stillMoving
          ) {
            next[id] = {
              ...u,
              positionX: newX,
              positionY: newY,
              facing8: facing,
              isWandering: stillMoving,
            };
            changed = true;
          }
          if (r.done) {
            schedule.active = null;
            schedule.nextPickAtMs = scheduleNextPick(nowMs);
          }
          continue;
        }

        // Resting between moves — check if it's time to pick.
        if (nowMs >= schedule.nextPickAtMs) {
          const others = positions
            .filter((p) => p.id !== id)
            .map((p) => ({ x: p.x, y: p.y }));
          const move = planWanderMove({
            anchorX: u.anchorX,
            anchorY: u.anchorY,
            currentX: u.positionX,
            currentY: u.positionY,
            others,
            nowMs,
          });
          if (move) {
            schedule.active = move;
            next[id] = {
              ...u,
              facing8: move.facing,
              isWandering: true,
            };
            changed = true;
          } else {
            // Couldn't find a non-colliding target — try again
            // sooner than the standard 15-45s interval, but not
            // every frame.
            schedule.nextPickAtMs = nowMs + 1500;
          }
        }
      }

      // Drop schedules for units that no longer exist.
      for (const id of wanderSchedules.keys()) {
        if (!s.units[id]) wanderSchedules.delete(id);
      }

      return changed ? { units: next } : s;
    }),

  addSubagent: ({ parentId, sessionId, name, spriteId }) =>
    set((s) => {
      const parent = s.units[parentId];
      if (!parent) return s;
      if (s.units[sessionId]) return s; // dedup by toolCallId
      const childIdx = parent.childIds.length;
      const offsetX = 70 + childIdx * 30;
      const offsetY = (childIdx % 2 === 0 ? 1 : -1) * 60;
      const now = Date.now();
      const childUnit: CommandUnit = {
        id: sessionId,
        name: name ?? `${parent.name} · child ${childIdx + 1}`,
        spriteId: spriteId ?? "field-tech",
        role: "Subagent",
        projectId: parent.projectId,
        backend: parent.backend,
        modelId: parent.modelId,
        state: "thinking",
        transient: "spawning",
        positionX: parent.positionX + offsetX,
        positionY: parent.positionY + offsetY,
        facing: parent.facing,
        anchorX: parent.positionX + offsetX,
        anchorY: parent.positionY + offsetY,
        facing8: parent.facing8,
        isWandering: false,
        canWander:
          CAN_WANDER_BY_SPRITE[spriteId ?? "field-tech"] ?? true,
        contextUsage: 0,
        createdAt: now,
        lastActiveAt: now,
        transcript: [
          {
            id: newEntryId(),
            kind: "system",
            text: `Subagent dispatched by ${parent.name}.`,
            createdAt: now,
          },
        ],
        promptInFlight: false,
        rolePrompt: null,
        pendingPermission: null,
        acpSessionId: parent.acpSessionId,
        isLive: parent.isLive,
        suppressNotifications: false,
        parentId,
        childIds: [],
        isSubagent: true,
        inbox: [],
        files: [],
        commands: [],
        lastRawEvent: null,
        usage: null,
        groomingQueue: [],
};
      return {
        units: {
          ...s.units,
          [sessionId]: childUnit,
          [parentId]: { ...parent, childIds: [...parent.childIds, sessionId] },
        },
        unitOrder: [...s.unitOrder, sessionId],
      };
    }),

  setSuppressNotifications: (id, suppress) =>
    set((s) => {
      const u = s.units[id];
      if (!u) return s;
      return {
        units: { ...s.units, [id]: { ...u, suppressNotifications: suppress } },
      };
    }),

  switchBackend: (id, backend, acpSessionId) =>
    set((s) => {
      const u = s.units[id];
      if (!u) return s;
      // Only auto-update the sprite if the user hadn't customised
      // it; if they overrode it manually at launch, respect that.
      const wasDefaultSprite = u.spriteId === SPRITE_FOR_BACKEND[u.backend];
      const spriteId = wasDefaultSprite ? SPRITE_FOR_BACKEND[backend] : u.spriteId;
      return {
        units: {
          ...s.units,
          [id]: {
            ...u,
            backend,
            acpSessionId,
            spriteId,
            modelId: defaultModelFor(backend),
            isLive: true,
            inbox: [],
            pendingPermission: null,
            state: "idle",
            transient: "spawning",
            lastActiveAt: Date.now(),
          },
        },
      };
    }),

  setUnitModel: (id, modelId) =>
    set((s) => {
      const u = s.units[id];
      if (!u) return s;
      return {
        units: {
          ...s.units,
          [id]: { ...u, modelId, lastActiveAt: Date.now() },
        },
      };
    }),

  removeUnit: (id, _exitCode) =>
    set((s) => {
      const u = s.units[id];
      if (!u) return s;
      const next = { ...s.units };
      delete next[id];
      const nextOrder = s.unitOrder.filter((x) => x !== id);
      // Detach from parent's childIds list if this was a subagent.
      if (u.parentId && next[u.parentId]) {
        const parent = next[u.parentId];
        next[u.parentId] = {
          ...parent,
          childIds: parent.childIds.filter((c) => c !== id),
        };
      }
      // Archive top-level units only — subagents are transient and
      // don't have a row in command_sessions to flip.
      if (!u.isSubagent) {
        void commandArchiveSession(id).catch(() => {});
      }
      return {
        units: next,
        unitOrder: nextOrder,
        selectedUnitId:
          s.selectedUnitId === id ? (nextOrder[0] ?? null) : s.selectedUnitId,
      };
    }),

  hydrateFromStorage: (sessions, messagesBySession, proposalsBySession) =>
    set(() => {
      const units: Record<string, CommandUnit> = {};
      const unitOrder: string[] = [];
      for (const s of sessions) {
        const sprite = parseSprite(s.spriteId);
        const transcript: TranscriptEntry[] = (messagesBySession[s.id] ?? []).map(
          (m) => ({
            id: m.id,
            kind: parseTranscriptKind(m.kind),
            text: m.text,
            createdAt: m.createdAt,
          }),
        );
        const unit: CommandUnit = {
          id: s.id,
          name: s.name,
          spriteId: sprite,
          role: s.role,
          projectId: s.projectId,
          backend: s.backend,
          modelId: s.modelId,
          state: parseAgentState(s.state),
          positionX: s.positionX,
          positionY: s.positionY,
          facing: s.facing === "left" ? "left" : "right",
          anchorX: s.anchorX ?? s.positionX,
          anchorY: s.anchorY ?? s.positionY,
          facing8: parseFacing8(s.facing),
          isWandering: false,
          canWander: CAN_WANDER_BY_SPRITE[sprite] ?? true,
          contextUsage: 0,
          createdAt: s.createdAt,
          lastActiveAt: s.lastActiveAt,
          transcript,
          promptInFlight: false,
          rolePrompt: s.rolePrompt && s.rolePrompt.length > 0 ? s.rolePrompt : null,
          pendingPermission: null,
          acpSessionId: s.acpSessionId,
          isLive: false,
          suppressNotifications: false,
          parentId: null,
          childIds: [],
          isSubagent: false,
          inbox: [],
          files: [],
          commands: [],
          lastRawEvent: null,
          usage: null,
          groomingQueue: proposalsBySession?.[s.id] ?? [],
        };
        units[s.id] = unit;
        unitOrder.push(s.id);
      }
      return {
        units,
        unitOrder,
        selectedUnitId: unitOrder[0] ?? null,
      };
    }),
}));

// ── Helpers ────────────────────────────────────────────────────────

function toStoredSession(unit: CommandUnit): StoredSession {
  return {
    id: unit.id,
    name: unit.name,
    spriteId: unit.spriteId,
    role: unit.role,
    projectId: unit.projectId,
    backend: unit.backend,
    modelId: unit.modelId,
    state: unit.state,
    acpSessionId: unit.acpSessionId,
    rolePrompt: unit.rolePrompt,
    positionX: unit.positionX,
    positionY: unit.positionY,
    // Persist the 8-direction facing.
    facing: unit.facing8,
    anchorX: unit.anchorX,
    anchorY: unit.anchorY,
    createdAt: unit.createdAt,
    lastActiveAt: unit.lastActiveAt,
    archived: false,
  };
}

const VALID_SPRITES: ReadonlySet<SpriteId> = new Set([
  "marine",
  "engineer",
  "field-tech",
]);
function parseSprite(raw: string): SpriteId {
  return VALID_SPRITES.has(raw as SpriteId) ? (raw as SpriteId) : "marine";
}

const VALID_FACING8: ReadonlySet<Facing> = new Set([
  "N", "NE", "E", "SE", "S", "SW", "W", "NW",
]);
/** Translate the persisted `facing` column to an 8-direction value.
 *  Pre-Phase-13 rows held the legacy "left"/"right" pair — those
 *  collapse to "S" (canonical S-facing card pose). */
function parseFacing8(raw: string): Facing {
  if (VALID_FACING8.has(raw as Facing)) return raw as Facing;
  return "S";
}

const VALID_STATES: ReadonlySet<AgentState> = new Set([
  "idle",
  "thinking",
  "tool_running",
  "streaming",
  "awaiting_permission",
  "done",
  "error",
]);
function parseAgentState(raw: string): AgentState {
  return VALID_STATES.has(raw as AgentState) ? (raw as AgentState) : "idle";
}

const VALID_KINDS: ReadonlySet<TranscriptEntryKind> = new Set([
  "system",
  "user",
  "agent_text",
  "agent_thought",
  "tool_call",
  "tool_result",
  "error",
]);
function parseTranscriptKind(raw: string): TranscriptEntryKind {
  return VALID_KINDS.has(raw as TranscriptEntryKind)
    ? (raw as TranscriptEntryKind)
    : "system";
}

/** Compute the default display name a new unit would get if added
 *  on the current state. Exported so the launch flow can pass it
 *  to Rust (which uses the name in MCP list_agents responses)
 *  before `addUnit` runs. */
export function computeNextUnitName(
  state: { unitOrder: string[] },
  backend: BackendKind,
): string {
  return `${labelForBackend(backend)} ${state.unitOrder.length + 1}`;
}

function labelForBackend(backend: BackendKind): string {
  switch (backend) {
    case "claudeAcp":
      return "Claude";
    case "geminiAcp":
      return "Gemini";
    case "codexAcp":
      return "Codex";
    case "qwenAcp":
      return "Qwen";
  }
}

function defaultModelFor(backend: BackendKind): string {
  switch (backend) {
    case "claudeAcp":
      return "claude (default)";
    case "geminiAcp":
      return "gemini (default)";
    case "codexAcp":
      return "codex (default)";
    case "qwenAcp":
      return "qwen (default)";
  }
}
