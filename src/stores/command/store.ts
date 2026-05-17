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

import type {
  AccentColor,
  AgentState,
  TransientAnimation,
} from "@/lib/commandSprites";
import {
  commandArchiveSession,
  commandSaveMessage,
  commandSaveSession,
  type A2AMessage,
  type StoredMessage,
  type StoredSession,
} from "@/lib/tauri/command";

export type SpriteId = "marine" | "engineer" | "field-tech";

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
  accent: AccentColor;
  positionX: number;
  positionY: number;
  facing: "left" | "right";
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
    tokens: number;
    contextSize: number | null;
    costUsd: number | null;
    updatedAtMs: number;
  } | null;
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
  accent?: AccentColor;
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

  selectUnit: (id: string | null) => void;
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
      contextSize: number | null;
      costUsd: number | null;
    },
  ) => void;
  removeUnit: (id: string, exitCode?: number | null) => void;
  /** Replace the store with units + transcripts loaded from SQLite
   *  on app boot. Units land in `isLive: false` until resumed. */
  hydrateFromStorage: (
    sessions: StoredSession[],
    messagesBySession: Record<string, StoredMessage[]>,
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

const ACCENT_CYCLE: AccentColor[] = ["blue", "orange", "green", "violet", "slate", "rose"];

function defaultAccent(index: number): AccentColor {
  return ACCENT_CYCLE[index % ACCENT_CYCLE.length];
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

export const useCommandStore = create<CommandState>((set, get) => ({
  units: {},
  unitOrder: [],
  selectedUnitId: null,
  signalArcs: [],

  selectUnit: (id) => set({ selectedUnitId: id }),

  addUnit: ({
    sessionId,
    backend,
    acpSessionId,
    spriteId,
    name,
    role,
    accent,
    modelId,
    projectId,
    rolePrompt,
  }) =>
    set((s) => {
      if (s.units[sessionId]) return s; // dedup
      const orderIndex = s.unitOrder.length;
      const pos = nextSlot(orderIndex);
      const chosenSprite: SpriteId = spriteId ?? SPRITE_FOR_BACKEND[backend];
      const chosenAccent = accent ?? defaultAccent(orderIndex);
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
        accent: chosenAccent,
        positionX: pos.x,
        positionY: pos.y,
        facing: "right",
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
        accent: parent.accent,
        positionX: parent.positionX + offsetX,
        positionY: parent.positionY + offsetY,
        facing: parent.facing,
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

  hydrateFromStorage: (sessions, messagesBySession) =>
    set(() => {
      const units: Record<string, CommandUnit> = {};
      const unitOrder: string[] = [];
      for (const s of sessions) {
        const sprite = parseSprite(s.spriteId);
        const accent = parseAccent(s.accent);
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
          accent,
          positionX: s.positionX,
          positionY: s.positionY,
          facing: s.facing === "left" ? "left" : "right",
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
    accent: unit.accent,
    state: unit.state,
    acpSessionId: unit.acpSessionId,
    rolePrompt: unit.rolePrompt,
    positionX: unit.positionX,
    positionY: unit.positionY,
    facing: unit.facing,
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

const VALID_ACCENTS: ReadonlySet<AccentColor> = new Set([
  "slate",
  "blue",
  "violet",
  "green",
  "orange",
  "rose",
]);
/** Migration map: units persisted before the designed-sprite swap
 *  used a different accent palette. Map the old names onto their
 *  closest analogue in the new palette so existing transcripts
 *  don't all wash to blue on first boot post-swap. */
const LEGACY_ACCENT_MIGRATIONS: Record<string, AccentColor> = {
  amber: "orange",
  red: "rose",
  teal: "slate",
};
function parseAccent(raw: string): AccentColor {
  if (VALID_ACCENTS.has(raw as AccentColor)) return raw as AccentColor;
  const migrated = LEGACY_ACCENT_MIGRATIONS[raw];
  return migrated ?? "blue";
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
