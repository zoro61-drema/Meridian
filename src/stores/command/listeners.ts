// Subscribe the Command store to backend events.
//
// Phase 3 wires the `command:session:update` event channel (emitted
// by `src-tauri/src/command/sessions.rs::forward_notifications`) into
// the per-unit state machine + transcript. Three event kinds are
// handled:
//
//   - `sessionCreated`     — a session was just opened. We dedup
//     against units the frontend already added (user-initiated
//     launches add the unit synchronously when the invoke resolves).
//   - `sessionUpdate`      — opaque ACP notification (method +
//     params). The `update.sessionUpdate` field on `session/update`
//     payloads drives the unit's AgentState + transcript.
//   - `sessionTerminated`  — the child process exited. Remove the
//     unit from the field. Phase 8 will preserve it as a
//     fade-to-done sprite first.

import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import {
  COMMAND_A2A_EVENT_NAME,
  COMMAND_EVENT_NAME,
  commandListMessages,
  commandListSessions,
  type A2AMessage,
  type CommandEvent,
  type CommandEventRaw,
  type StoredMessage,
} from "@/lib/tauri/command";
import type { AgentState } from "@/lib/commandSprites";
import { useCommandStore } from "./store";

let attached = false;
let detachers: UnlistenFn[] = [];

export async function attachCommandListeners(): Promise<() => void> {
  if (attached) return () => detach();
  attached = true;

  const unlisten = await listen<CommandEvent>(COMMAND_EVENT_NAME, (e) => {
    dispatch(e.payload);
  });
  const unlistenA2A = await listen<A2AMessage>(COMMAND_A2A_EVENT_NAME, (e) => {
    useCommandStore.getState().receiveA2AMessage(e.payload);
  });
  detachers = [unlisten, unlistenA2A];
  return () => detach();
}

function detach() {
  for (const fn of detachers) fn();
  detachers = [];
  attached = false;
}

function dispatch(event: CommandEvent) {
  const store = useCommandStore.getState();
  switch (event.kind) {
    case "sessionCreated":
      // No-op for Phase 6. Launches always go through the
      // LaunchUnitModal which calls addUnit directly with the full
      // metadata (including acpSessionId). Phase 8 reintroduces a
      // listener path for subagent spawns; that revision will need
      // acpSessionId added to the SessionCreated event payload.
      return;

    case "sessionUpdate":
      // Skip notifications while a session/load replay is in flight.
      // The wrapper re-emits the prior conversation as session/update
      // events; our transcript is already loaded from SQLite, so
      // appending the replay would duplicate every message.
      if (store.units[event.sessionId]?.suppressNotifications) return;
      handleSessionUpdate(event.sessionId, event.raw);
      return;

    case "sessionTerminated":
      store.removeUnit(event.sessionId, event.exitCode);
      return;
  }
}

interface AcpUpdateBody {
  sessionId?: string;
  update?: AcpUpdate;
  [k: string]: unknown;
}

interface AcpUpdate {
  sessionUpdate?: string;
  content?: { type?: string; text?: string };
  toolCallId?: string;
  title?: string;
  kind?: string;
  status?: string;
  [k: string]: unknown;
}

// (Phase 8 walkback) — auto-spawning subagent units from tool_call
// events was over-eager and produced rogue sprites for any tool
// whose title shape resembled a Task dispatch. The store's
// `addSubagent` action and the tether/breadcrumb rendering stay
// available for a future detection mechanism (e.g. an ACP method
// the wrapper would emit explicitly for subagent spawn); for now
// Task tool calls just appear as regular tool entries on the
// parent's transcript and Claude's reply carries the findings.

const SESSION_UPDATE_TO_STATE: Record<string, AgentState | null> = {
  agent_message_chunk: "streaming",
  agent_thought_chunk: "thinking",
  tool_call: "tool_running",
  tool_call_update: "tool_running",
  plan: "thinking",
  user_message_chunk: null, // user echo, no state change
};

function handleSessionUpdate(sessionId: string, raw: CommandEventRaw) {
  const store = useCommandStore.getState();
  store.setLastRawEvent(sessionId, raw);

  // ACP server-originated request — Phase 4 surfaces these as an
  // inline permission card in the chat panel. We park the request
  // on the unit and wait for the user to click Allow / Deny; the
  // chat panel calls commandGrantPermission which resolves the RPC.
  if (raw.id !== null && raw.id !== undefined) {
    if (raw.method === "session/request_permission") {
      const params = raw.params as
        | {
            toolCall?: { title?: string; kind?: string; content?: unknown };
            options?: Array<{ optionId: string; name: string; kind?: string }>;
          }
        | null;
      const options = params?.options ?? [];
      store.setUnitState(sessionId, "awaiting_permission");
      store.setPendingPermission(sessionId, {
        requestId: raw.id,
        toolCall: params?.toolCall ?? undefined,
        options: options.map((o) => ({
          optionId: o.optionId,
          name: o.name,
          kind: o.kind,
        })),
      });
      store.appendTranscript(
        sessionId,
        "system",
        `Permission requested: ${describePermissionTarget(params?.toolCall)}`,
        { newEntry: true },
      );
    }
    return;
  }

  if (raw.method !== "session/update") return;

  const params = raw.params as AcpUpdateBody | null;
  const update = params?.update ?? null;
  if (!update) return;

  const kind = update.sessionUpdate ?? "";
  const mapped = SESSION_UPDATE_TO_STATE[kind];
  if (mapped !== null && mapped !== undefined) {
    store.setUnitState(sessionId, mapped);
  }

  // usage_update lands frequently (per turn, sometimes per chunk).
  // Pull it out before the main switch so the costlier transcript
  // mutations don't run on what is effectively a counter update.
  if (kind === "usage_update") {
    const used = (update as Record<string, unknown>).used;
    const size = (update as Record<string, unknown>).size;
    const cost = (update as Record<string, unknown>).cost as
      | { amount?: number; currency?: string }
      | undefined;
    if (typeof used === "number") {
      store.setUsage(sessionId, {
        tokens: used,
        contextSize: typeof size === "number" ? size : null,
        costUsd:
          cost && (cost.currency ?? "USD") === "USD" && typeof cost.amount === "number"
            ? cost.amount
            : null,
      });
    }
    return;
  }

  switch (kind) {
    case "agent_message_chunk": {
      const text = update.content?.text ?? "";
      if (text) store.appendTranscript(sessionId, "agent_text", text);
      return;
    }
    case "agent_thought_chunk": {
      const text = update.content?.text ?? "";
      if (text) store.appendTranscript(sessionId, "agent_thought", text);
      return;
    }
    case "tool_call": {
      const label = describeToolCall(update);
      store.appendTranscript(sessionId, "tool_call", label, { newEntry: true });
      recordFilesFromToolCall(sessionId, update);
      recordCommandFromToolCall(sessionId, update);
      return;
    }
    case "tool_call_update": {
      const status = update.status;
      // Files may show up only on update events (not the initial
      // tool_call), so harvest from here too.
      recordFilesFromToolCall(sessionId, update);
      if (update.toolCallId && status) {
        store.finishCommand(sessionId, update.toolCallId, status);
      }
      if (status === "completed" || status === "failed") {
        const label = `tool ${status}: ${update.title ?? update.kind ?? "call"}`;
        store.appendTranscript(
          sessionId,
          status === "completed" ? "tool_result" : "error",
          label,
          { newEntry: true },
        );
      }
      return;
    }
    case "plan": {
      const text =
        (update.content?.text as string | undefined) ??
        JSON.stringify(update).slice(0, 200);
      store.appendTranscript(sessionId, "agent_thought", `Plan: ${text}`, {
        newEntry: true,
      });
      return;
    }
  }
}

/** ACP tool_call payloads can carry a `locations` array of
 *  `{path, line?}` entries — that's the canonical place for
 *  edit/read/delete tools to declare which files they touched.
 *  Fall back to rawInput common fields if the wrapper omitted it. */
function recordFilesFromToolCall(sessionId: string, update: AcpUpdate) {
  const store = useCommandStore.getState();
  const kind = (update.kind ?? "").toLowerCase();
  const locations = (update as Record<string, unknown>).locations;
  if (Array.isArray(locations)) {
    for (const loc of locations) {
      const path = (loc as Record<string, unknown>)?.path;
      if (typeof path === "string" && path.trim().length > 0) {
        store.touchFile(sessionId, path, kind);
      }
    }
  }
  const rawInput = (update as Record<string, unknown>).rawInput as
    | Record<string, unknown>
    | undefined;
  if (rawInput) {
    for (const key of ["path", "file_path", "filePath", "filename"]) {
      const v = rawInput[key];
      if (typeof v === "string" && v.trim().length > 0) {
        store.touchFile(sessionId, v, kind);
      }
    }
  }
}

/** Pull shell-like commands out of execute tool calls. The
 *  canonical place is `rawInput.command` for Bash-style tools;
 *  some wrappers stash it in the title. */
function recordCommandFromToolCall(sessionId: string, update: AcpUpdate) {
  const store = useCommandStore.getState();
  const kind = (update.kind ?? "").toLowerCase();
  if (kind !== "execute") return;
  const toolCallId = update.toolCallId;
  if (!toolCallId) return;
  const rawInput = (update as Record<string, unknown>).rawInput as
    | Record<string, unknown>
    | undefined;
  const cmd =
    (rawInput?.command as string | undefined) ??
    (rawInput?.cmd as string | undefined) ??
    update.title ??
    "";
  if (typeof cmd !== "string" || cmd.trim().length === 0) return;
  store.recordCommand(sessionId, toolCallId, cmd);
}

function describeToolCall(update: NonNullable<AcpUpdateBody["update"]>): string {
  const titleStr = typeof update.title === "string" ? update.title.trim() : "";
  const kindStr = typeof update.kind === "string" ? update.kind.trim() : "";
  if (kindStr && titleStr) return `Tool [${kindStr}]: ${titleStr}`;
  if (titleStr) return `Tool: ${titleStr}`;
  if (kindStr) return `Tool [${kindStr}]`;
  return "Tool call";
}

function describePermissionTarget(toolCall: {
  title?: string;
  kind?: string;
} | undefined): string {
  const titleStr = typeof toolCall?.title === "string" ? toolCall.title.trim() : "";
  const kindStr = typeof toolCall?.kind === "string" ? toolCall.kind.trim() : "";
  if (kindStr && titleStr) return `[${kindStr}] ${titleStr}`;
  if (titleStr) return titleStr;
  if (kindStr) return `[${kindStr}]`;
  return "tool call";
}


/** Clear the per-unit spawning transient ~1s after launch so the
 *  sprite settles into its idle animation. Called from the launch
 *  flow because we know exactly when the unit was added. */
export function scheduleSpawnSettle(sessionId: string) {
  setTimeout(() => {
    useCommandStore.getState().fireTransient(sessionId, undefined);
  }, 1000);
}

/** Load persisted sessions + transcripts from SQLite into the
 *  store. Called once at app boot from `App.tsx`. Units land in
 *  `isLive: false` — Send is disabled, a Resume button is shown
 *  on the chat panel until the user reconnects. */
export async function hydrateCommandStore(): Promise<void> {
  try {
    const sessions = await commandListSessions();
    const messagesBySession: Record<string, StoredMessage[]> = {};
    await Promise.all(
      sessions.map(async (s) => {
        try {
          messagesBySession[s.id] = await commandListMessages(s.id);
        } catch (e) {
          console.warn("[command] failed to load messages for", s.id, e);
          messagesBySession[s.id] = [];
        }
      }),
    );
    useCommandStore.getState().hydrateFromStorage(sessions, messagesBySession);
  } catch (e) {
    console.warn("[command] hydrate failed", e);
  }
}
