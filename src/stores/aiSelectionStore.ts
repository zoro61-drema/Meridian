/**
 * Per-panel AI provider/model selection.
 *
 * The user picks ONE default provider+model (settable in Settings → Models or
 * seeded by the first authenticated provider during onboarding). Any panel may
 * override that default with its own provider+model. There is no fallback
 * chain — if the resolved provider isn't authenticated, the app surfaces a
 * "needs auth" badge in the header model picker rather than silently
 * substituting another provider.
 *
 * Pref keys:
 *   ai_default_provider — "claude" | "gemini" | "local" | "copilot"
 *   ai_default_model    — the model id for the default provider
 *   panel_ai_overrides  — flat JSON `{ pr_review: {provider,model}, … }`
 *
 * Migration: an earlier version stored overrides nested by an "AI Provider
 * Priority" mode (auto / claude / gemini / local) and used that
 * mode plus a provider order to pick a fallback chain. On hydrate we detect
 * the legacy nested shape, flatten it, and seed the default provider/model
 * from the legacy ai_provider value (or the first per-provider model that
 * exists when priority was "auto"). The legacy keys are then overwritten
 * with the new flat shape so subsequent loads skip the migration path.
 */

import { deletePreference, getPreferences, setPreference } from "@/lib/preferences";
import {
  getCatalogModelsForAiProvider,
  mergeCustomModels,
} from "@/lib/modelsCatalog";
import {
  getCustomCopilotModels,
  getCustomGeminiModels,
  getLocalModels,
} from "@/lib/tauri/providers";
import { create } from "zustand";

export type AiProvider = "claude" | "gemini" | "local" | "copilot";

export type PanelId =
  | "pr_review"
  | "ticket_quality"
  | "sprint_dashboard"
  | "retrospectives"
  | "meetings";

export interface AiOverride {
  provider: AiProvider;
  model: string;
}

export const PANEL_LABELS: Record<PanelId, string> = {
  pr_review: "PR Review",
  ticket_quality: "Groom Ticket",
  sprint_dashboard: "Sprint Dashboard",
  retrospectives: "Retrospectives",
  meetings: "Meetings",
};

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  claude: "Claude",
  gemini: "Gemini",
  local: "Local LLM",
  copilot: "GitHub Copilot",
};

export const ALL_PROVIDERS: AiProvider[] = ["claude", "gemini", "local", "copilot"];

const PROVIDER_VALUES = new Set<string>(ALL_PROVIDERS);

type OverrideMap<K extends string> = Partial<Record<K, AiOverride>>;

interface State {
  hydrated: boolean;
  /** Default provider used by panels with no explicit override. */
  defaultProvider: AiProvider | undefined;
  /** Default model paired with `defaultProvider`. May be empty if the
   *  user hasn't picked one yet — workflows error in that case. */
  defaultModel: string;
  panelOverrides: OverrideMap<PanelId>;
  /** Provider-default model preferences (set at the global Settings
   *  level — separate from `defaultModel` because each provider has its
   *  own "preferred model" pref that fills the picker dropdown's first
   *  selection when the user opens it without an existing override). */
  providerDefaultModel: Partial<Record<AiProvider, string>>;
  /** Model lists per provider, lazy-loaded on first picker open. */
  modelsByProvider: Partial<Record<AiProvider, [string, string][]>>;
  modelsLoading: Partial<Record<AiProvider, boolean>>;
}

interface Actions {
  hydrate: () => Promise<void>;
  refreshFromPrefs: () => Promise<void>;
  loadModels: (provider: AiProvider) => Promise<void>;
  /** Drop the cached model list for a provider so the next picker open
   *  re-fetches it. Settings calls this after adding/removing custom models
   *  so header dropdowns pick up the change without a reload. */
  invalidateModels: (provider: AiProvider) => void;
  /** Set or clear a panel-level override. */
  setPanelOverride: (panel: PanelId, value: AiOverride | null) => Promise<void>;
  /** Replace the global default provider+model. */
  setDefault: (value: AiOverride) => Promise<void>;
  /** Resolve the active provider+model for a panel. */
  resolve: (panel: PanelId) => {
    provider: AiProvider;
    model: string;
    source: "panel" | "default";
  };
}

// ── Parsing helpers ───────────────────────────────────────────────────────────

function isAiOverride(v: unknown): v is AiOverride {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.provider === "string" &&
    PROVIDER_VALUES.has(r.provider) &&
    typeof r.model === "string"
  );
}

function parseFlatOverrideMap<K extends string>(obj: unknown): OverrideMap<K> {
  if (!obj || typeof obj !== "object") return {};
  const out: Record<string, AiOverride> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (isAiOverride(v)) out[k] = v;
  }
  return out as OverrideMap<K>;
}

/**
 * Parse `panel_ai_overrides`. Handles both the new
 * flat `{panel: AiOverride}` shape and the legacy nested
 * `{auto: {panel: AiOverride}, claude: {…}}` shape (taking either the
 * provided `legacyMode`'s slice or — when null — the first non-empty mode
 * found as a best-effort flatten). The caller decides which mode to prefer
 * via `legacyMode` so migration matches what the user was actually seeing.
 */
function parseOverridesAnyShape<K extends string>(
  raw: string | undefined,
  legacyMode: string | null,
): { map: OverrideMap<K>; needsRewrite: boolean } {
  if (!raw?.trim()) return { map: {}, needsRewrite: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { map: {}, needsRewrite: false };
  }
  if (!parsed || typeof parsed !== "object") {
    return { map: {}, needsRewrite: false };
  }
  const obj = parsed as Record<string, unknown>;
  // Heuristic: legacy shape has top-level keys that are priority modes
  // ("auto" | provider) and values that are objects of objects. New flat
  // shape has top-level keys that are panel/stage ids and values that are
  // {provider, model} objects.
  const looksLegacy = Object.entries(obj).some(([k, v]) => {
    return (
      (k === "auto" || PROVIDER_VALUES.has(k)) &&
      v &&
      typeof v === "object" &&
      !isAiOverride(v)
    );
  });
  if (!looksLegacy) {
    return { map: parseFlatOverrideMap<K>(obj), needsRewrite: false };
  }
  // Legacy nested. Pick the slice for the active legacyMode if present;
  // otherwise fall through to "auto"; otherwise the first non-empty slice.
  const candidateOrder = [
    legacyMode ?? "",
    "auto",
    ...ALL_PROVIDERS,
  ].filter(Boolean) as string[];
  for (const mode of candidateOrder) {
    const slice = obj[mode];
    if (slice && typeof slice === "object") {
      const flat = parseFlatOverrideMap<K>(slice);
      if (Object.keys(flat).length > 0) {
        return { map: flat, needsRewrite: true };
      }
    }
  }
  // Empty across all modes — write back an empty flat map to clear legacy.
  return { map: {}, needsRewrite: true };
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAiSelectionStore = create<State & Actions>((set, get) => ({
  hydrated: false,
  defaultProvider: undefined,
  defaultModel: "",
  panelOverrides: {},
  providerDefaultModel: {},
  modelsByProvider: {},
  modelsLoading: {},

  hydrate: async () => {
    if (get().hydrated) return;
    await get().refreshFromPrefs();
    set({ hydrated: true });
  },

  refreshFromPrefs: async () => {
    try {
      const prefs = await getPreferences();
      const providerDefaultModel = {
        claude: prefs.claude_model,
        gemini: prefs.gemini_model,
        local: prefs.local_llm_model,
        copilot: prefs.copilot_model,
      };

      // Legacy `ai_provider` was either "auto" or one of the provider ids.
      // It steers (a) which slice of nested overrides to flatten, and
      // (b) what to seed the default provider from when no new keys exist.
      const legacyAiProvider = (prefs.ai_provider || "").trim() || null;

      const { map: panelOverrides, needsRewrite: panelLegacy } =
        parseOverridesAnyShape<PanelId>(prefs.panel_ai_overrides, legacyAiProvider);

      // Resolve default provider+model. Order of preference:
      //   1. New keys ai_default_provider + ai_default_model (post-migration).
      //   2. Legacy locked priority (e.g. "claude") + that provider's
      //      saved model.
      //   3. Legacy "auto": pick the first provider in ALL_PROVIDERS that
      //      has a saved per-provider model.
      //   4. Undefined — onboarding hasn't completed; workflows surface
      //      this as "configure a default model in Settings".
      let defaultProvider: AiProvider | undefined;
      let defaultModel = "";
      const newDefProv = (prefs.ai_default_provider || "").trim();
      if (PROVIDER_VALUES.has(newDefProv)) {
        defaultProvider = newDefProv as AiProvider;
        defaultModel = prefs.ai_default_model || providerDefaultModel[defaultProvider] || "";
      } else if (legacyAiProvider && PROVIDER_VALUES.has(legacyAiProvider)) {
        defaultProvider = legacyAiProvider as AiProvider;
        defaultModel = providerDefaultModel[defaultProvider] || "";
      } else if (legacyAiProvider === "auto") {
        for (const p of ALL_PROVIDERS) {
          if (providerDefaultModel[p]) {
            defaultProvider = p;
            defaultModel = providerDefaultModel[p] || "";
            break;
          }
        }
      }

      set({
        defaultProvider,
        defaultModel,
        panelOverrides,
        providerDefaultModel,
      });

      // Best-effort writeback of the migrated state. Skip awaiting so a
      // failing pref write doesn't keep the user staring at a spinner.
      if (panelLegacy) {
        void setPreference("panel_ai_overrides", JSON.stringify(panelOverrides));
      }
      const needsDefaultWrite =
        defaultProvider !== undefined && !PROVIDER_VALUES.has(newDefProv);
      if (needsDefaultWrite && defaultProvider) {
        void setPreference("ai_default_provider", defaultProvider);
        if (defaultModel) {
          void setPreference("ai_default_model", defaultModel);
        }
      }

      // One-time cleanup of the dead `stage_ai_overrides` key. Implement-a-
      // Ticket was the only feature that used stage-level overrides, and it
      // was removed in 2026-05; leftover entries from before that date sit
      // in the prefs file unread. Best-effort delete on first hydrate per
      // session — `prefs.stage_ai_overrides === undefined` skips it for
      // users who never had Implement-a-Ticket configured.
      if (prefs.stage_ai_overrides !== undefined) {
        void deletePreference("stage_ai_overrides");
      }
    } catch {
      /* leave defaults */
    }
  },

  loadModels: async (provider) => {
    const { modelsByProvider, modelsLoading } = get();
    const cached = modelsByProvider[provider];
    // Empty cache for "local" is treated as a cache miss — the URL/server can
    // change at runtime when the user configures Ollama in Settings, and we
    // don't want a previous "URL not set yet" attempt to permanently shadow
    // the real list (would otherwise leave the dropdown stuck on
    // "no models available" or, mid-flight, "loading…").
    const cacheIsUsable = cached && (provider !== "local" || cached.length > 0);
    if (cacheIsUsable || modelsLoading[provider]) return;
    set({ modelsLoading: { ...modelsLoading, [provider]: true } });
    try {
      let list: [string, string][] = [];
      if (provider === "local") {
        list = await getLocalModels();
      } else {
        // Cloud providers — pull from the models.dev catalog (same
        // source-of-truth opencode uses), then merge in user-added
        // custom model ids for providers that support them.
        const catalog = await getCatalogModelsForAiProvider(provider);
        const customIds: string[] =
          provider === "gemini"
            ? await getCustomGeminiModels().catch(() => [])
            : provider === "copilot"
              ? await getCustomCopilotModels().catch(() => [])
              : [];
        list = mergeCustomModels(catalog.models, customIds);
      }
      set((s) => ({
        modelsByProvider: { ...s.modelsByProvider, [provider]: list },
        modelsLoading: { ...s.modelsLoading, [provider]: false },
      }));
    } catch {
      set((s) => ({
        modelsLoading: { ...s.modelsLoading, [provider]: false },
      }));
    }
  },

  invalidateModels: (provider) => {
    set((s) => {
      const next = { ...s.modelsByProvider };
      delete next[provider];
      return { modelsByProvider: next };
    });
  },

  setPanelOverride: async (panel, value) => {
    const { panelOverrides } = get();
    const next = { ...panelOverrides };
    if (value === null) delete next[panel];
    else next[panel] = value;
    set({ panelOverrides: next });
    await setPreference("panel_ai_overrides", JSON.stringify(next));
  },

  setDefault: async (value) => {
    set({ defaultProvider: value.provider, defaultModel: value.model });
    await setPreference("ai_default_provider", value.provider);
    await setPreference("ai_default_model", value.model);
  },

  resolve: (panel) => {
    const s = get();
    const panelOv = s.panelOverrides[panel];
    if (panelOv) {
      return { provider: panelOv.provider, model: panelOv.model, source: "panel" };
    }
    return {
      // Fall back to "claude" with empty model when the user hasn't picked
      // a default yet. The header picker shows a "needs auth / pick a model"
      // badge in that case — workflows still error so the user gets a clear
      // message rather than a silent run with no model.
      provider: s.defaultProvider ?? "claude",
      model: s.defaultModel || s.providerDefaultModel[s.defaultProvider ?? "claude"] || "",
      source: "default",
    };
  },
}));
