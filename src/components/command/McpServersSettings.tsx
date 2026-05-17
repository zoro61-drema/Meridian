// McpServersSettings — global MCP server list with per-backend
// availability scoping.
//
// One flat list of servers (HTTP or stdio). Each row carries a
// row of "available for" checkboxes (Claude / Codex / Gemini /
// Qwen). At agent launch the frontend filters by the launching
// backend and ships the filtered list to Rust, which appends it
// alongside the auto-attached Meridian A2A server when calling
// `session/new`.
//
// Defaults to all-backends-checked so the simple case ("install a
// server, every agent gets it") stays a single toggle. Scoping
// only matters when the user wants to gate a server — e.g. a paid
// HTTP service to Claude only.

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  ALL_BACKENDS,
  BACKEND_SHORT_LABEL,
  isValidMcpServerId,
  type McpServerEntry,
  type McpServerType,
} from "@/lib/commandMcpServers";
import { setPreference } from "@/lib/preferences";
import { useCommandStore } from "@/stores/command/store";
import type { BackendKind } from "@/lib/tauri/command";

export const COMMAND_MCP_SERVERS_PREF_KEY = "command_mcp_servers";

export function McpServersSettings() {
  const servers = useCommandStore((s) => s.mcpServers);
  const setMcpServers = useCommandStore((s) => s.setMcpServers);

  const persist = (next: McpServerEntry[]) => {
    setMcpServers(next);
    void setPreference(COMMAND_MCP_SERVERS_PREF_KEY, JSON.stringify(next));
  };

  // New-server form state.
  const [draftId, setDraftId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<McpServerType>("stdio");
  const [draftTarget, setDraftTarget] = useState(""); // url or command
  const [draftArgs, setDraftArgs] = useState(""); // whitespace-separated, stdio only

  const reset = () => {
    setDraftId("");
    setDraftName("");
    setDraftType("stdio");
    setDraftTarget("");
    setDraftArgs("");
  };

  const onAdd = () => {
    const id = draftId.trim().toLowerCase();
    const name = draftName.trim();
    const target = draftTarget.trim();
    if (!isValidMcpServerId(id)) {
      toast.error("Id must be lowercase letters / digits / dashes (≤64 chars)");
      return;
    }
    if (servers.some((s) => s.id === id)) {
      toast.error(`Server "${id}" already exists`);
      return;
    }
    if (!name) {
      toast.error("Name is required");
      return;
    }
    if (!target) {
      toast.error(draftType === "http" ? "URL is required" : "Command is required");
      return;
    }
    const entry: McpServerEntry =
      draftType === "http"
        ? {
            id,
            name,
            type: "http",
            url: target,
            headers: [],
            availableFor: [...ALL_BACKENDS],
          }
        : {
            id,
            name,
            type: "stdio",
            command: target,
            args: draftArgs.trim().length === 0 ? [] : draftArgs.trim().split(/\s+/),
            availableFor: [...ALL_BACKENDS],
          };
    persist([...servers, entry]);
    toast.success(`Added MCP server "${id}"`);
    reset();
  };

  const onDelete = (id: string) => {
    persist(servers.filter((s) => s.id !== id));
  };

  const onToggleBackend = (
    serverId: string,
    backend: BackendKind,
    checked: boolean,
  ) => {
    persist(
      servers.map((s) => {
        if (s.id !== serverId) return s;
        const next = new Set(s.availableFor);
        if (checked) next.add(backend);
        else next.delete(backend);
        return { ...s, availableFor: [...next] };
      }),
    );
  };

  return (
    <div className="flex h-full flex-col gap-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Servers are forwarded to the wrapper's <code className="font-mono">session/new</code>{" "}
        config. Toggle the per-backend checkboxes to scope a server (e.g. a
        paid HTTP service to Claude only). All checked = available to every
        agent.
      </p>

      {/* Add form */}
      <div className="rounded-md border border-white/10 bg-black/30 p-2">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">
          Add server
        </div>
        <div className="grid grid-cols-12 items-stretch gap-1.5">
          <Input
            value={draftId}
            onChange={(e) => setDraftId(e.target.value)}
            placeholder="id (kebab-case)"
            className="col-span-3 h-7 bg-black/40 font-mono text-[11px]"
          />
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Display name"
            className="col-span-3 h-7 bg-black/40 text-[11px]"
          />
          <select
            value={draftType}
            onChange={(e) => setDraftType(e.target.value as McpServerType)}
            className="col-span-2 h-7 rounded-md border border-white/10 bg-black/40 px-2 text-[11px]"
          >
            <option value="stdio">stdio</option>
            <option value="http">http</option>
          </select>
          <Input
            value={draftTarget}
            onChange={(e) => setDraftTarget(e.target.value)}
            placeholder={
              draftType === "http"
                ? "https://example.com/mcp"
                : "npx @mcp/server-…"
            }
            className="col-span-4 h-7 bg-black/40 font-mono text-[11px]"
          />
          {draftType === "stdio" && (
            <Input
              value={draftArgs}
              onChange={(e) => setDraftArgs(e.target.value)}
              placeholder="args (space-separated)"
              className="col-span-10 h-7 bg-black/40 font-mono text-[11px]"
            />
          )}
          <Button
            type="button"
            size="sm"
            onClick={onAdd}
            className={`col-span-${draftType === "stdio" ? "2" : "12"} h-7 px-2 text-[11px]`}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>
      </div>

      {/* Server list */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-md border border-white/10 bg-black/30">
        {servers.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 py-8 text-center">
            <p className="text-xs italic text-white/40">
              No MCP servers configured. Add one above — every Commander
              agent will receive servers tagged for its backend.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {servers.map((server) => (
              <li key={server.id} className="px-2 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[12px] text-white/90">
                        {server.id}
                      </span>
                      <span className="rounded border border-white/10 bg-black/40 px-1.5 py-0 font-mono text-[9px] uppercase tracking-wider text-white/60">
                        {server.type}
                      </span>
                      <span className="truncate text-[11px] text-white/70">
                        {server.name}
                      </span>
                    </div>
                    <div className="truncate font-mono text-[10px] text-muted-foreground">
                      {server.type === "http"
                        ? server.url ?? "(no url)"
                        : `${server.command ?? "(no command)"} ${(server.args ?? []).join(" ")}`}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(server.id)}
                    className="h-7 shrink-0 px-2 text-[11px] text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Delete
                  </Button>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {ALL_BACKENDS.map((b) => {
                    const checked =
                      server.availableFor.length === 0 ||
                      server.availableFor.includes(b);
                    return (
                      <label
                        key={b}
                        className="flex items-center gap-1.5 rounded border border-white/10 bg-black/30 px-2 py-1 text-[11px]"
                      >
                        <Switch
                          checked={checked}
                          onCheckedChange={(v) =>
                            onToggleBackend(server.id, b, v)
                          }
                          aria-label={`Make ${server.id} available to ${BACKEND_SHORT_LABEL[b]}`}
                        />
                        <span className="text-white/85">
                          {BACKEND_SHORT_LABEL[b]}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
