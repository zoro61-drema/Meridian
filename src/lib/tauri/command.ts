// Frontend wrappers for the Command (Phase 1) Tauri commands.
//
// These commands and their TS types are the dev-only smoke surface
// for ACP integration. The Phase 4 work (Command screen + real
// launch modal) replaces every export here with typed wrappers
// over the real command set (`command_launch_unit`,
// `command_send_prompt`, etc.).
//
// Until then, use the dev-tools console to exercise the flow:
//
//   import * as cmd from "@/lib/tauri/command";
//   const id = await cmd.commandSmokeLaunch("claudeAcp", "/path/to/repo");
//   cmd.subscribeCommandEvents(e => console.log("ACP:", e));
//   await cmd.commandSmokePrompt(id, "What files are here?");

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type BackendKind = "claudeAcp" | "geminiAcp" | "codexAcp" | "qwenAcp";

export interface SessionSummary {
  sessionId: string;
  backend: BackendKind;
  spawnedAtMs: number;
}

export interface CommandEventRaw {
  method: string;
  params: unknown;
  id: unknown;
}

export type CommandEvent =
  | {
      kind: "sessionCreated";
      sessionId: string;
      backend: BackendKind;
    }
  | {
      kind: "sessionUpdate";
      sessionId: string;
      // Phase 1 forwards the raw ACP notification body. Phase 3
      // replaces this with typed content blocks.
      raw: CommandEventRaw;
    }
  | {
      kind: "sessionTerminated";
      sessionId: string;
      exitCode: number | null;
    };

export const COMMAND_EVENT_NAME = "command:session:update";
export const COMMAND_A2A_EVENT_NAME = "command:a2a:message";


export const COMMAND_GROOMING_EVENT_NAME = "command:grooming:proposal";

/** Payload of `command:grooming:proposal` — emitted when a
 *  ticket-groomer agent calls the `submit_grooming_recommendations`
 *  MCP tool. The listener parses each entry of `suggestedEdits`
 *  into a `GroomingFieldChange` and appends a proposal to the
 *  sending unit's groomingQueue. */
export interface GroomingProposalEvent {
  id: string;
  sessionId: string;
  ticketKey: string;
  ticketSummary: string;
  ticketType: string;
  /** Raw per-edit objects — shape mirrors GroomingFieldChange minus
   *  the user-decision fields. Loose typing here so the listener
   *  can validate + normalize before landing in the store. */
  suggestedEdits: Array<Record<string, unknown>>;
  clarifyingQuestions: string[];
  groomingNotes: string;
  createdAtMs: number;
}

export interface A2AMessage {
  messageId: string;
  fromSessionId: string;
  fromName: string;
  toSessionId: string;
  toName: string;
  subject: string | null;
  body: string;
  createdAtMs: number;
}

export interface LaunchedSession {
  sessionId: string;
  acpSessionId: string;
}

export async function commandSmokeLaunch(
  backend: BackendKind,
  projectDir: string,
  name: string,
  extraMcpServers?: Record<string, unknown>[],
  groomingTickets?: string[],
  modelOverride?: string,
): Promise<LaunchedSession> {
  return invoke<LaunchedSession>("command_smoke_launch", {
    backend,
    projectDir,
    name,
    extraMcpServers: extraMcpServers ?? [],
    groomingTickets: groomingTickets ?? [],
    modelOverride: modelOverride && modelOverride.trim().length > 0 ? modelOverride : null,
  });
}

export async function commandDrainInbox(sessionId: string): Promise<A2AMessage[]> {
  return invoke<A2AMessage[]>("command_drain_inbox", { sessionId });
}

export async function commandSendMessage(
  fromSessionId: string,
  toSessionId: string,
  body: string,
  subject?: string,
): Promise<A2AMessage> {
  return invoke<A2AMessage>("command_send_message", {
    fromSessionId,
    toSessionId,
    subject: subject ?? null,
    body,
  });
}

/** Switch a unit to a different backend wrapper. Kills the
 *  current wrapper, spawns a fresh one for `backend`, calls
 *  session/new with the same project dir, persists the new ACP
 *  session id. The agent's prior turn-by-turn context is lost;
 *  Meridian's transcript / files / commands tabs persist. */
export async function commandSwitchBackend(
  sessionId: string,
  backend: BackendKind,
  extraMcpServers?: Record<string, unknown>[],
  modelOverride?: string,
): Promise<string> {
  return invoke<string>("command_switch_backend", {
    sessionId,
    backend,
    extraMcpServers: extraMcpServers ?? [],
    modelOverride: modelOverride && modelOverride.trim().length > 0 ? modelOverride : null,
  });
}

export async function commandSmokePrompt(sessionId: string, prompt: string): Promise<void> {
  await invoke<void>("command_smoke_prompt", { sessionId, prompt });
}

export async function commandSmokeCancel(sessionId: string): Promise<void> {
  await invoke<void>("command_smoke_cancel", { sessionId });
}

export async function commandSmokeKill(sessionId: string): Promise<void> {
  await invoke<void>("command_smoke_kill", { sessionId });
}


/** Launch the user's native CLI for `backend` in a fresh Terminal
 *  window pointed at `cwd`. macOS-only at the Rust layer; the
 *  promise rejects with a clear message on other platforms. */
/** Launch the user's native CLI for `backend` in a new tab/window
 *  of the user's preferred terminal (read from the
 *  `pr_review_terminal` preference — defaults to iTerm2). macOS-only
 *  at the Rust layer; the promise rejects with a clear message on
 *  other platforms.
 *
 *  `args` is appended after the binary (e.g. `["--resume", id]` so
 *  the native CLI picks up the same session the user was running
 *  inside Meridian). Each entry is single-quoted at the shell. */
export async function commandOpenInNativeApp(
  binary: string,
  cwd: string,
  args?: string[],
): Promise<void> {
  await invoke<void>("command_open_in_native_app", { binary, cwd, args });
}


/** Fetch a slash-command prompt template live from context7. Used
 *  by /review to pull the canonical Claude Code review prompt each
 *  invocation, so the agent always runs the latest published copy.
 *
 *  `anchorStart` / `anchorEnd` bound the relevant substring inside
 *  context7's markdown response — the Rust side just snips between
 *  them. Throws when context7 is unreachable or the anchors aren't
 *  present (caller should provide a fallback). */
export async function commandFetchContext7Prompt(
  libraryId: string,
  topic: string,
  anchorStart: string,
  anchorEnd: string,
): Promise<string> {
  return invoke<string>("command_fetch_context7_prompt", {
    libraryId,
    topic,
    anchorStart,
    anchorEnd,
  });
}


export interface CommandSkill {
  id: string;
  body: string;
  updatedAtMs: number;
}

/** List every saved skill in ~/.meridian/command/skills/. */
export async function commandListSkills(): Promise<CommandSkill[]> {
  return invoke<CommandSkill[]>("command_list_skills");
}

/** Create or update a skill. Id must be lowercase letters / digits
 *  / dashes, ≤64 chars. Body is freeform markdown. */
export async function commandSaveSkill(id: string, body: string): Promise<void> {
  await invoke<void>("command_save_skill", { id, body });
}

/** Remove a skill. Idempotent — missing files are not an error. */
export async function commandDeleteSkill(id: string): Promise<void> {
  await invoke<void>("command_delete_skill", { id });
}


/** Persist a grooming proposal to SQLite. The full proposal shape
 *  is stored as a JSON blob in `payload_json`; the store re-hydrates
 *  by parsing on app boot. Idempotent — call repeatedly as the user
 *  approves / edits / declines fields. */
export async function commandSaveGroomingProposal(
  sessionId: string,
  proposalId: string,
  ticketKey: string,
  payloadJson: string,
  createdAtMs: number,
): Promise<void> {
  await invoke<void>("command_save_grooming_proposal", {
    sessionId,
    proposalId,
    ticketKey,
    payloadJson,
    createdAtMs,
  });
}

export interface StoredGroomingProposal {
  sessionId: string;
  payloadJson: string;
}

/** Load every saved grooming proposal across all sessions. */
export async function commandListGroomingProposals(): Promise<StoredGroomingProposal[]> {
  return invoke<StoredGroomingProposal[]>("command_list_grooming_proposals");
}

/** Remove one proposal — used when the user wants to clear a
 *  submitted/skipped row from their queue. */
export async function commandDeleteGroomingProposal(
  proposalId: string,
): Promise<void> {
  await invoke<void>("command_delete_grooming_proposal", { proposalId });
}

export async function commandSmokeList(): Promise<SessionSummary[]> {
  return invoke<SessionSummary[]>("command_smoke_list");
}

export async function commandGrantPermission(
  sessionId: string,
  requestId: unknown,
  optionId: string,
): Promise<void> {
  await invoke<void>("command_grant_permission", {
    sessionId,
    requestId,
    optionId,
  });
}

// ── Persistence (Phase 6) ────────────────────────────────────────────

export interface StoredSession {
  id: string;
  name: string;
  spriteId: string;
  role: string;
  projectId: string;
  backend: BackendKind;
  modelId: string;
  state: string;
  acpSessionId: string;
  rolePrompt: string | null;
  positionX: number;
  positionY: number;
  facing: string;
  anchorX: number;
  anchorY: number;
  createdAt: number;
  lastActiveAt: number;
  archived: boolean;
}

export interface StoredMessage {
  id: string;
  sessionId: string;
  seq: number;
  kind: string;
  text: string;
  createdAt: number;
}

export async function commandSaveSession(session: StoredSession): Promise<void> {
  await invoke<void>("command_save_session", { session });
}

export async function commandSaveMessage(message: StoredMessage): Promise<void> {
  await invoke<void>("command_save_message", { message });
}

export async function commandListSessions(): Promise<StoredSession[]> {
  return invoke<StoredSession[]>("command_list_sessions");
}

export async function commandListMessages(sessionId: string): Promise<StoredMessage[]> {
  return invoke<StoredMessage[]>("command_list_messages", { sessionId });
}

export async function commandArchiveSession(sessionId: string): Promise<void> {
  await invoke<void>("command_archive_session", { sessionId });
}

export async function commandResumeSession(sessionId: string): Promise<void> {
  await invoke<void>("command_resume_session", { sessionId });
}

export interface ArchiveSearchHit {
  sessionId: string;
  sessionName: string;
  messageKind: string;
  snippet: string;
  createdAt: number;
}

export async function commandListArchivedSessions(): Promise<StoredSession[]> {
  return invoke<StoredSession[]>("command_list_archived_sessions");
}

export async function commandSearchArchive(
  query: string,
  limit?: number,
): Promise<ArchiveSearchHit[]> {
  return invoke<ArchiveSearchHit[]>("command_search_archive", { query, limit });
}

export async function commandUnarchiveSession(sessionId: string): Promise<void> {
  await invoke<void>("command_unarchive_session", { sessionId });
}

export async function commandDeleteSession(sessionId: string): Promise<void> {
  await invoke<void>("command_delete_session", { sessionId });
}

export async function subscribeCommandEvents(
  handler: (event: CommandEvent) => void,
): Promise<UnlistenFn> {
  return listen<CommandEvent>(COMMAND_EVENT_NAME, (e) => handler(e.payload));
}
