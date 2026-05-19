/**
 * Typed accessors for the user-tunable preferences exposed in Settings.
 *
 * Each preference has a default and a parser. Reading is fault-tolerant —
 * missing or malformed values fall back to the default rather than
 * propagating errors, so a preference file corrupted by a manual edit
 * never blocks the app from starting.
 */

import { getPreferences, setPreference, deletePreference } from "@/lib/preferences";

// ── Keys ──────────────────────────────────────────────────────────────────────

const KEY = {
  prReviewDefaultChunkChars: "pr_review_default_chunk_chars",
  prTasksPollIntervalMinutes: "pr_tasks_poll_interval_minutes",
  workloadOverloadThresholdPct: "workload_overload_threshold_pct",
  dailyTokenBudget: "daily_token_budget",
  notifyPrTaskAdded: "notify_pr_task_added",
  notifyAgentStageComplete: "notify_agent_stage_complete",
  aiDebugEnabled: "ai_debug_enabled",
  aiDebugDockMode: "ai_debug_dock_mode",
  meetingsEmbeddingModel: "meetings_embedding_model",
  meetingsSearchMinScore: "meetings_search_min_score",
  commandStateBadgesEnabled: "command_state_badges_enabled",
  commandBugFilingBoards: "command_bug_filing_boards",
  preferredIdeId: "preferred_ide_id",
} as const;

/** A user-named JIRA destination for Bug Hunter reports. `name` is
 *  the friendly label shown in the dropdown; `projectKey` is the
 *  JIRA project key (e.g. "PROJ") or numeric board id used as
 *  `pid` in the create-issue URL. */
export interface BugFilingBoard {
  name: string;
  projectKey: string;
}

// ── Defaults ──────────────────────────────────────────────────────────────────
//
// Centralised so the Settings UI can render placeholder text matching the
// runtime fallback, and so a "Reset to default" button can target the
// canonical value.

export const APP_PREFERENCE_DEFAULTS = {
  prReviewDefaultChunkChars: 80000,
  prTasksPollIntervalMinutes: 60,
  workloadOverloadThresholdPct: 140,
  /** Null = no budget set; positive integer = soft daily cap (UI alert
   *  when exceeded, no enforcement). */
  dailyTokenBudget: null as number | null,
  notifyPrTaskAdded: false,
  notifyAgentStageComplete: false,
  /** Capture every LLM round-trip (prompt + response + usage) and emit
   *  an event the in-app debug panel renders. Off by default — capture
   *  costs IPC bandwidth and only matters when the user is actively
   *  inspecting prompts. */
  aiDebugEnabled: false,
  /** Where the debug panel docks: edge of the main window, a popped-
   *  out separate window, or hidden entirely. Defaults to "hidden" so
   *  the app doesn't ship a developer panel to the user on first
   *  launch — they open it on demand from View → AI Debug Panel
   *  (Cmd/Ctrl+Shift+D), which restores to the last visible mode they
   *  picked (or "bottom" if they've never picked one). */
  aiDebugDockMode: "hidden" as AiDebugDockMode,
  /** Ollama embedding model used by the cross-meetings RAG search.
   *  `nomic-embed-text` is a sensible default — 768 dims, English-
   *  optimised, runs on consumer hardware. Users can switch via
   *  Settings → Meetings; doing so clears existing embeddings (they
   *  live in different vector spaces) and triggers a re-embed. */
  meetingsEmbeddingModel: "nomic-embed-text",
  /** Cross-meetings search relevance threshold. Hits with a fused
   *  score below this value are filtered out before reaching the
   *  user. Calibrated against raw cosine similarity from
   *  nomic-embed-text on English conversational prose:
   *    ≥ 0.70  paraphrase / direct match
   *    ≥ 0.55  likely relevant
   *    ≥ 0.45  loosely related
   *    < 0.45  noise
   *  0.61 lands just above "likely relevant" — strict enough to cut
   *  tail noise, lenient enough to allow on-topic non-paraphrase
   *  matches through. */
  meetingsSearchMinScore: 0.61,
  /** Per-provider response-token ceiling. Set to a generous default
   *  (32K) for Anthropic + Gemini because `max_tokens` is a cap not
   *  an allocation — typical responses are 1–4K, but Plan / Test Plan
   *  / Code Review can blow past 8K and silently truncate at the
   *  adapter's historical default. Ollama is intentionally absent —
   *  its server enforces the loaded model's native context window,
   *  and overriding it produces confusing mid-response truncation. */
  /** Show the emoji bubble above each command unit when its state
   *  changes. Useful at a glance; some users prefer the quieter
   *  read of just the animation. */
  commandStateBadgesEnabled: true,
  /** Named JIRA destinations for the Bug Hunter's "Open JIRA"
   *  button. Empty list = no dropdown; the user pastes manually
   *  after the Copy-as-JIRA flow. Each entry is `{ name, projectKey }`
   *  — name is the dropdown label, projectKey is what lands in
   *  `pid=` on the create-issue URL. May differ from the sprint
   *  board id under Integrations. */
  commandBugFilingBoards: [] as BugFilingBoard[],
  /** Preferred IDE for "Open in IDE" buttons across Bugs / My PRs /
   *  Reviewed PRs tabs. One of the ids in `IDES` from
   *  `ideLauncher.ts` (vscode, cursor, zed, idea, clion, …). */
  preferredIdeId: "vscode" as string,
} as const;

export type AiDebugDockMode = "bottom" | "right" | "left" | "window" | "hidden";

export type AppPreferences = {
  prReviewDefaultChunkChars: number;
  prTasksPollIntervalMinutes: number;
  workloadOverloadThresholdPct: number;
  dailyTokenBudget: number | null;
  notifyPrTaskAdded: boolean;
  notifyAgentStageComplete: boolean;
  aiDebugEnabled: boolean;
  aiDebugDockMode: AiDebugDockMode;
  meetingsEmbeddingModel: string;
  meetingsSearchMinScore: number;
  commandStateBadgesEnabled: boolean;
  commandBugFilingBoards: BugFilingBoard[];
  preferredIdeId: string;
};

// ── Parsing helpers ───────────────────────────────────────────────────────────

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseOptionalPositiveInt(
  raw: string | undefined,
  fallback: number | null,
): number | null {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

function parseFloatPositive(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ── Bulk read ─────────────────────────────────────────────────────────────────

/**
 * Read every app preference in one round-trip and apply defaults to any
 * missing or malformed entries. Use this in places where you need the
 * full set (e.g. the Settings screen). For one-off reads, prefer the
 * dedicated getters below — they each fetch the prefs map.
 */
export async function getAppPreferences(): Promise<AppPreferences> {
  let prefs: Record<string, string>;
  try {
    prefs = await getPreferences();
  } catch {
    prefs = {};
  }
  return {
    prReviewDefaultChunkChars: parsePositiveInt(
      prefs[KEY.prReviewDefaultChunkChars],
      APP_PREFERENCE_DEFAULTS.prReviewDefaultChunkChars,
    ),
    prTasksPollIntervalMinutes: parsePositiveInt(
      prefs[KEY.prTasksPollIntervalMinutes],
      APP_PREFERENCE_DEFAULTS.prTasksPollIntervalMinutes,
    ),
    workloadOverloadThresholdPct: parseFloatPositive(
      prefs[KEY.workloadOverloadThresholdPct],
      APP_PREFERENCE_DEFAULTS.workloadOverloadThresholdPct,
    ),
    dailyTokenBudget: parseOptionalPositiveInt(
      prefs[KEY.dailyTokenBudget],
      APP_PREFERENCE_DEFAULTS.dailyTokenBudget,
    ),
    notifyPrTaskAdded: parseBool(
      prefs[KEY.notifyPrTaskAdded],
      APP_PREFERENCE_DEFAULTS.notifyPrTaskAdded,
    ),
    notifyAgentStageComplete: parseBool(
      prefs[KEY.notifyAgentStageComplete],
      APP_PREFERENCE_DEFAULTS.notifyAgentStageComplete,
    ),
    aiDebugEnabled: parseBool(
      prefs[KEY.aiDebugEnabled],
      APP_PREFERENCE_DEFAULTS.aiDebugEnabled,
    ),
    aiDebugDockMode: parseDockMode(
      prefs[KEY.aiDebugDockMode],
      APP_PREFERENCE_DEFAULTS.aiDebugDockMode,
    ),
    meetingsEmbeddingModel:
      (prefs[KEY.meetingsEmbeddingModel] || "").trim() ||
      APP_PREFERENCE_DEFAULTS.meetingsEmbeddingModel,
    meetingsSearchMinScore: parseClampedFloat(
      prefs[KEY.meetingsSearchMinScore],
      APP_PREFERENCE_DEFAULTS.meetingsSearchMinScore,
      0,
      1,
    ),
    commandStateBadgesEnabled: parseBool(
      prefs[KEY.commandStateBadgesEnabled],
      APP_PREFERENCE_DEFAULTS.commandStateBadgesEnabled,
    ),
    commandBugFilingBoards: parseBugFilingBoards(
      prefs[KEY.commandBugFilingBoards],
    ),
    preferredIdeId:
      (prefs[KEY.preferredIdeId] ?? "").trim() ||
      APP_PREFERENCE_DEFAULTS.preferredIdeId,
  };
}

/** Tolerant parser — the value is a JSON-encoded array; if the
 *  stored value is malformed (manual edit, version skew) fall
 *  back to an empty list rather than blocking app start. */
function parseBugFilingBoards(raw: string | undefined): BugFilingBoard[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry): BugFilingBoard | null => {
        if (!entry || typeof entry !== "object") return null;
        const o = entry as Record<string, unknown>;
        const name = typeof o.name === "string" ? o.name.trim() : "";
        const projectKey =
          typeof o.projectKey === "string" ? o.projectKey.trim() : "";
        if (name.length === 0 || projectKey.length === 0) return null;
        return { name, projectKey };
      })
      .filter((b): b is BugFilingBoard => b !== null);
  } catch {
    return [];
  }
}

function parseClampedFloat(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseDockMode(
  raw: string | undefined,
  fallback: AiDebugDockMode,
): AiDebugDockMode {
  if (
    raw === "bottom" ||
    raw === "right" ||
    raw === "left" ||
    raw === "window" ||
    raw === "hidden"
  ) {
    return raw;
  }
  return fallback;
}

// ── Setters ───────────────────────────────────────────────────────────────────

export async function setPrReviewDefaultChunkChars(value: number): Promise<void> {
  await setPreference(KEY.prReviewDefaultChunkChars, String(value));
}
export async function setPrTasksPollIntervalMinutes(value: number): Promise<void> {
  await setPreference(KEY.prTasksPollIntervalMinutes, String(value));
}
export async function setWorkloadOverloadThresholdPct(value: number): Promise<void> {
  await setPreference(KEY.workloadOverloadThresholdPct, String(value));
}
export async function setDailyTokenBudget(value: number | null): Promise<void> {
  if (value === null) {
    await deletePreference(KEY.dailyTokenBudget);
  } else {
    await setPreference(KEY.dailyTokenBudget, String(value));
  }
}
export async function setNotifyPrTaskAdded(value: boolean): Promise<void> {
  await setPreference(KEY.notifyPrTaskAdded, value ? "true" : "false");
}
export async function setNotifyAgentStageComplete(value: boolean): Promise<void> {
  await setPreference(KEY.notifyAgentStageComplete, value ? "true" : "false");
}
export async function setAiDebugEnabled(value: boolean): Promise<void> {
  await setPreference(KEY.aiDebugEnabled, value ? "true" : "false");
}
export async function setAiDebugDockMode(value: AiDebugDockMode): Promise<void> {
  await setPreference(KEY.aiDebugDockMode, value);
}
export async function setMeetingsEmbeddingModel(value: string): Promise<void> {
  await setPreference(KEY.meetingsEmbeddingModel, value);
}
export async function setMeetingsSearchMinScore(value: number): Promise<void> {
  const clamped = Math.min(1, Math.max(0, value));
  // Format with 2 decimals to keep the on-disk pref readable.
  await setPreference(KEY.meetingsSearchMinScore, clamped.toFixed(2));
}
export async function setCommandStateBadgesEnabled(value: boolean): Promise<void> {
  await setPreference(KEY.commandStateBadgesEnabled, value ? "true" : "false");
}
export async function setCommandBugFilingBoards(
  boards: BugFilingBoard[],
): Promise<void> {
  const cleaned = boards
    .map((b) => ({ name: b.name.trim(), projectKey: b.projectKey.trim() }))
    .filter((b) => b.name.length > 0 && b.projectKey.length > 0);
  if (cleaned.length === 0) {
    await deletePreference(KEY.commandBugFilingBoards);
  } else {
    await setPreference(KEY.commandBugFilingBoards, JSON.stringify(cleaned));
  }
}
export async function setPreferredIdeId(value: string): Promise<void> {
  await setPreference(KEY.preferredIdeId, value);
}
