// MCP server configuration for Commander agents.
//
// One global list of MCP servers, each scoped to a subset of
// backends via a checkbox row in the CommanderSettings dialog.
// At launch time the frontend filters the list by the launching
// unit's backend and forwards the result to Rust, which appends
// the entries alongside the auto-attached Meridian A2A server
// when calling `session/new`.
//
// HTTP servers ship `{name, url, type:"http", headers}`; stdio
// servers ship `{name, command, args, type:"stdio", env}` —
// matching the schema the Zed `claude-code-acp` wrapper expects
// (and that the other wrappers mirror).

import type { BackendKind } from "@/lib/tauri/command";

export type McpServerType = "http" | "stdio";

export interface McpServerEntry {
  /** Stable id, used as the unique key in the prefs JSON. */
  id: string;
  /** Display name shown in the wrapper's tool list. */
  name: string;
  type: McpServerType;
  /** HTTP only — URL the wrapper connects to. */
  url?: string;
  /** stdio only — command to spawn. */
  command?: string;
  /** stdio only — args appended to the command. */
  args?: string[];
  /** HTTP only — optional headers. */
  headers?: Array<{ name: string; value: string }>;
  /** Which backends can see this server. Empty = all backends. */
  availableFor: BackendKind[];
}

export const ALL_BACKENDS: BackendKind[] = [
  "claudeAcp",
  "codexAcp",
  "geminiAcp",
  "qwenAcp",
];

export const BACKEND_SHORT_LABEL: Record<BackendKind, string> = {
  claudeAcp: "Claude",
  codexAcp: "Codex",
  geminiAcp: "Gemini",
  qwenAcp: "Qwen",
};

const ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function isValidMcpServerId(id: string): boolean {
  return ID_PATTERN.test(id) && id.length <= 64;
}

/** Validate then narrow an unknown payload into a typed entry,
 *  dropping malformed fields. Returns null when the payload
 *  isn't recognizable as an MCP server. */
export function parseMcpServerEntry(raw: unknown): McpServerEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : null;
  const name = typeof r.name === "string" ? r.name : null;
  const type = r.type === "http" || r.type === "stdio" ? r.type : null;
  if (!id || !name || !type || !isValidMcpServerId(id)) return null;
  const availableFor = Array.isArray(r.availableFor)
    ? r.availableFor.filter(
        (b): b is BackendKind => typeof b === "string" && ALL_BACKENDS.includes(b as BackendKind),
      )
    : [...ALL_BACKENDS];
  const out: McpServerEntry = { id, name, type, availableFor };
  if (type === "http") {
    if (typeof r.url === "string") out.url = r.url;
    if (Array.isArray(r.headers)) {
      out.headers = r.headers
        .map((h) => {
          if (!h || typeof h !== "object") return null;
          const hr = h as Record<string, unknown>;
          if (typeof hr.name !== "string" || typeof hr.value !== "string") {
            return null;
          }
          return { name: hr.name, value: hr.value };
        })
        .filter((h): h is { name: string; value: string } => h !== null);
    }
  } else {
    if (typeof r.command === "string") out.command = r.command;
    if (Array.isArray(r.args)) {
      out.args = r.args.filter((a): a is string => typeof a === "string");
    }
  }
  return out;
}

export function parseMcpServerList(raw: unknown): McpServerEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => parseMcpServerEntry(entry))
    .filter((e): e is McpServerEntry => e !== null);
}

/** Filter the global list down to entries the given backend is
 *  allowed to see. An empty `availableFor` array means "all
 *  backends" (the default when the user just adds a server). */
export function filterServersForBackend(
  servers: McpServerEntry[],
  backend: BackendKind,
): McpServerEntry[] {
  return servers.filter(
    (s) => s.availableFor.length === 0 || s.availableFor.includes(backend),
  );
}

/** Project an entry into the wrapper-facing `mcpServers` payload
 *  shape — matches the format `command_smoke_launch` already uses
 *  for the Meridian A2A server. */
export function toWrapperPayload(entry: McpServerEntry): Record<string, unknown> {
  if (entry.type === "http") {
    return {
      name: entry.name,
      url: entry.url ?? "",
      type: "http",
      headers: (entry.headers ?? []).map((h) => [h.name, h.value]),
    };
  }
  return {
    name: entry.name,
    command: entry.command ?? "",
    args: entry.args ?? [],
    type: "stdio",
    env: [],
  };
}
