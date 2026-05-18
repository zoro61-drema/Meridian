// Models catalog — mirrors the opencode technique of pulling a
// curated provider/model catalog from https://models.dev/api.json.
// We fetch once per session (with a 24h localStorage TTL) and
// surface a per-backend model list to the launch modal so the user
// can pick a model from a dropdown instead of guessing the exact
// id string accepted by each CLI.

import type { BackendKind } from "@/lib/tauri/command";

const CATALOG_URL = "https://models.dev/api.json";
const CACHE_KEY = "meridian:modelsCatalog:v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** BackendKind → models.dev provider id. Alibaba is the upstream
 *  DashScope catalog that the `qwen` CLI talks to by default. */
const BACKEND_PROVIDER_ID: Record<BackendKind, string> = {
  claudeAcp: "anthropic",
  geminiAcp: "google",
  codexAcp: "openai",
  qwenAcp: "alibaba",
};

interface RawModel {
  id?: string;
  name?: string;
  tool_call?: boolean;
  reasoning?: boolean;
  release_date?: string;
  limit?: { context?: number; output?: number };
  modalities?: { input?: string[]; output?: string[] };
}

interface RawProvider {
  id?: string;
  name?: string;
  models?: Record<string, RawModel>;
}

type RawCatalog = Record<string, RawProvider>;

export interface ModelEntry {
  id: string;
  label: string;
  contextTokens: number | null;
  releaseDate: string | null;
}

interface CachedCatalog {
  fetchedAt: number;
  catalog: RawCatalog;
}

let inFlight: Promise<RawCatalog> | null = null;

function readCache(): RawCatalog | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCatalog;
    if (!parsed.fetchedAt || !parsed.catalog) return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.catalog;
  } catch {
    return null;
  }
}

function writeCache(catalog: RawCatalog): void {
  try {
    const payload: CachedCatalog = { fetchedAt: Date.now(), catalog };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be full or unavailable; swallow — we'll
    // simply re-fetch next session.
  }
}

async function fetchCatalog(): Promise<RawCatalog> {
  const cached = readCache();
  if (cached) return cached;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const res = await fetch(CATALOG_URL, { cache: "no-cache" });
    if (!res.ok) {
      throw new Error(`models.dev fetch failed: ${res.status}`);
    }
    const json = (await res.json()) as RawCatalog;
    writeCache(json);
    return json;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Tool-callable text-out filter. Embedding, image, audio, and
 *  realtime endpoints don't belong in a coding-agent picker. */
function isCodingFriendly(m: RawModel): boolean {
  if (m.tool_call !== true) return false;
  const outputs = m.modalities?.output ?? [];
  if (outputs.length > 0 && !outputs.includes("text")) return false;
  return true;
}

function formatContext(tokens: number | null): string {
  if (tokens == null || tokens <= 0) return "";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M ctx`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k ctx`;
  return `${tokens} ctx`;
}

function toEntry(id: string, m: RawModel): ModelEntry {
  const ctx = m.limit?.context ?? null;
  const ctxLabel = formatContext(ctx);
  const release = m.release_date ?? null;
  const labelParts = [id];
  if (ctxLabel) labelParts.push(ctxLabel);
  if (release) labelParts.push(release);
  return {
    id,
    label: labelParts.join("  ·  "),
    contextTokens: ctx,
    releaseDate: release,
  };
}

/** Fetch + filter + sort the model list for a given backend.
 *  Sorted by release_date descending (newest first); models with
 *  no release_date go to the bottom. Throws if the catalog can't
 *  be loaded — caller decides how to surface that. */
/** Fetch + filter + sort the catalog's model list for a given
 *  models.dev provider id (`anthropic`, `google`, `openai`,
 *  `alibaba`, `github-copilot`, …). Sorted newest-first by
 *  `release_date`; models without one go to the bottom. Throws
 *  if the catalog can't be loaded — caller decides how to surface. */
export async function getModelsForProvider(
  modelsDevId: string,
): Promise<ModelEntry[]> {
  const catalog = await fetchCatalog();
  const provider = catalog[modelsDevId];
  if (!provider?.models) return [];
  const entries: ModelEntry[] = [];
  for (const [id, m] of Object.entries(provider.models)) {
    if (!isCodingFriendly(m)) continue;
    entries.push(toEntry(id, m));
  }
  entries.sort((a, b) => {
    if (a.releaseDate && b.releaseDate) {
      return a.releaseDate > b.releaseDate ? -1 : a.releaseDate < b.releaseDate ? 1 : 0;
    }
    if (a.releaseDate) return -1;
    if (b.releaseDate) return 1;
    return a.id.localeCompare(b.id);
  });
  return entries;
}

/** Commander Launch-modal wrapper — maps the ACP backend kind to
 *  the matching models.dev provider id and returns the filtered
 *  catalog entries. */
export async function getModelsForBackend(
  backend: BackendKind,
): Promise<ModelEntry[]> {
  return getModelsForProvider(BACKEND_PROVIDER_ID[backend]);
}


/** Settings/header-picker `AiProvider` → models.dev id. `local`
 *  has no catalog mapping — the Ollama server is the source of
 *  truth for what's installed locally. */
const AI_PROVIDER_MODELS_DEV_ID: Record<string, string | null> = {
  claude: "anthropic",
  gemini: "google",
  copilot: "github-copilot",
  local: null,
};

export function modelsDevIdForAiProvider(aiProvider: string): string | null {
  return AI_PROVIDER_MODELS_DEV_ID[aiProvider] ?? null;
}

/** Settings-screen wrapper. Returns `[id, label][]` to match the
 *  existing `ClaudeModelsResult.models` shape, plus a `fetchError`
 *  string when the catalog couldn't be loaded. `null` mapping (e.g.
 *  `local`) yields an empty list with no error — callers fall back
 *  to their own source. */
export async function getCatalogModelsForAiProvider(
  aiProvider: string,
): Promise<{ models: [string, string][]; fetchError: string | null }> {
  const id = modelsDevIdForAiProvider(aiProvider);
  if (!id) return { models: [], fetchError: null };
  try {
    const entries = await getModelsForProvider(id);
    return {
      models: entries.map((e) => [e.id, e.label] as [string, string]),
      fetchError: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { models: [], fetchError: msg };
  }
}


/** Merge user-added custom model ids on top of a catalog list.
 *  Customs prepend to the start (most-relevant first), with a
 *  `· custom` label suffix so the UI can distinguish them. Catalog
 *  ids take precedence — a duplicate id in `customIds` is dropped. */
export function mergeCustomModels(
  catalog: [string, string][],
  customIds: string[],
): [string, string][] {
  const seen = new Set(catalog.map(([id]) => id));
  const customs: [string, string][] = customIds
    .filter((id) => !seen.has(id))
    .map((id) => [id, `${id}  ·  custom`] as [string, string]);
  return [...customs, ...catalog];
}
