// Command screen.
//
// Phase 3: real ACP-backed sessions wired end-to-end. The Launch
// buttons in the header invoke the Phase 1 smoke commands to spawn
// claude / gemini ACP children; the listeners file dispatches the
// resulting `command:session:update` events into the store so unit
// state and transcript stay live. Phase 4 will replace the bare
// Launch buttons with a proper roster picker modal and a permission
// UI for `session/request_permission`.

import { ArrowLeft, Archive, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { APP_HEADER_TITLE, WorkflowPanelHeader } from "@/components/appHeaderLayout";
import { AgentCardGrid } from "@/components/command/AgentCardGrid";
import { useArrowKeyWalk } from "@/components/command/useArrowKeyWalk";
import { ArchiveDrawer } from "@/components/command/ArchiveDrawer";
import { ChatPanelResizer } from "@/components/command/ChatPanelResizer";
import { CommanderSettingsButton } from "@/components/command/CommanderSettings";
import { ExpandedField } from "@/components/command/ExpandedField";
import { LaunchUnitModal } from "@/components/command/LaunchUnitModal";
import { COMMAND_MCP_SERVERS_PREF_KEY } from "@/components/command/McpServersSettings";
import { COMMAND_ROLE_SKILLS_PREF_KEY } from "@/components/command/SkillsSettings";
import { COMMAND_STATUSLINE_PREF_KEY } from "@/components/command/StatuslineSettings";
import { COMMAND_ROLE_OVERRIDES_PREF_KEY } from "@/components/command/SystemPromptsSettings";
import { COMMAND_TERRAIN_PREF_KEY, TerrainPicker } from "@/components/command/TerrainPicker";
import {
  COMMAND_TILE_SIZE_PREF_KEY,
  TileSizePicker,
} from "@/components/command/TileSizePicker";
import { UnitChatPanel } from "@/components/command/UnitChatPanel";
import { Button } from "@/components/ui/button";
import { parseMcpServerList } from "@/lib/commandMcpServers";
import { normalizeStatuslineConfig } from "@/lib/commandStatusline";
import { isTerrainId } from "@/lib/commandTerrains";
import { getPreferences, setPreference } from "@/lib/preferences";

export const COMMAND_CHAT_PANEL_WIDTH_PREF_KEY = "command_chat_panel_width";
import { commandListSkills, commandResumeSession } from "@/lib/tauri/command";
import { isTileSize, useCommandStore } from "@/stores/command/store";

// Track which units we've already auto-reconnected so we don't loop
// forever against a backend that's permanently failing. Lives at
// module scope so it survives screen remounts within a session — but
// resets on every Vite HMR cycle so that saving code triggers a
// fresh round of reconnect attempts (the user's explicit ask).
const autoReconnectAttempted = new Set<string>();

function attemptAutoReconnect() {
  const store = useCommandStore.getState();
  const candidates = Object.values(store.units).filter(
    (u) =>
      !u.isLive &&
      !u.isSubagent &&
      !autoReconnectAttempted.has(u.id),
  );
  for (const u of candidates) {
    autoReconnectAttempted.add(u.id);
    // Suppress notifications so the wrapper's session/load replay
    // (which re-emits the prior conversation as session/update
    // events) doesn't duplicate the transcript we already
    // hydrated from SQLite.
    store.setSuppressNotifications(u.id, true);
    void commandResumeSession(u.id)
      .then(() => {
        store.setUnitLive(u.id, true);
        store.appendTranscript(u.id, "system", "Session auto-resumed.", {
          newEntry: true,
        });
      })
      .catch((err: unknown) => {
        // Quiet: the user can still click Resume manually. Log
        // for debugging without surfacing a toast for every
        // hydrated session that can't reconnect.
        console.warn("[command] auto-resume failed", u.id, err);
      })
      .finally(() => {
        setTimeout(
          () => store.setSuppressNotifications(u.id, false),
          400,
        );
      });
  }
}

if (import.meta.hot) {
  // On every hot-reload of this module: clear the attempted-set
  // and immediately re-fire the auto-reconnect. Fast Refresh tries
  // to preserve component state so the React useEffect below won't
  // re-run on its own; firing here is what makes save→reconnect
  // happen on every HMR cycle.
  import.meta.hot.dispose(() => {
    autoReconnectAttempted.clear();
  });
  import.meta.hot.accept(() => {
    attemptAutoReconnect();
  });
}

interface CommandScreenProps {
  onBack: () => void;
}

export function CommandScreen({ onBack }: CommandScreenProps) {
  // Arrow-key walk control for the selected unit. Mounted at the
  // screen level so it works regardless of which inner view
  // (mini-field grid vs expanded TacticalField) is currently up.
  useArrowKeyWalk();

  const units = useCommandStore((s) => s.units);
  const unitList = Object.values(units);
  const total = unitList.length;
  const idle = unitList.filter((u) => u.state === "idle").length;
  const busy = unitList.filter(
    (u) =>
      u.state === "thinking" ||
      u.state === "tool_running" ||
      u.state === "streaming",
  ).length;
  const blocked = unitList.filter(
    (u) => u.state === "awaiting_permission" || u.state === "error",
  ).length;

  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [fieldExpanded, setFieldExpanded] = useState(false);
  // Chat-side-panel width. Default matches the legacy w-96 (384 px);
  // clamped to a sensible range so the drag can't make the panel
  // useless or eat the grid entirely. Hydrated from the
  // `command_chat_panel_width` preference below.
  const [chatPanelWidth, setChatPanelWidth] = useState(384);
  const CHAT_PANEL_MIN = 280;
  const CHAT_PANEL_MAX = 720;
  const setTerrain = useCommandStore((s) => s.setTerrain);
  const setTileSize = useCommandStore((s) => s.setTileSize);
  const setStatuslineSegments = useCommandStore(
    (s) => s.setStatuslineSegments,
  );
  const setRoleOverrides = useCommandStore((s) => s.setRoleOverrides);
  const setAllRoleSkills = useCommandStore((s) => s.setAllRoleSkills);
  const setSkillsCache = useCommandStore((s) => s.setSkillsCache);
  const setMcpServers = useCommandStore((s) => s.setMcpServers);

  // Resolve the project directory from preferences as the launch
  // modal's default. Modal lets the user override per-launch.
  // Hydrate every Commander-scoped preference in the same round-trip.
  useEffect(() => {
    void getPreferences().then((prefs) => {
      const fromPrefs = [
        prefs.pr_review_repo_dir,
        prefs.repo_source_path,
        prefs.repo_worktree_path,
      ]
        .map((v) => (v ?? "").trim())
        .find((v) => v.length > 0);
      setProjectDir(fromPrefs ?? "~");
      const storedTerrain = prefs[COMMAND_TERRAIN_PREF_KEY];
      if (isTerrainId(storedTerrain)) setTerrain(storedTerrain);
      const storedTileSize = prefs[COMMAND_TILE_SIZE_PREF_KEY];
      if (isTileSize(storedTileSize)) setTileSize(storedTileSize);
      const storedStatusline = prefs[COMMAND_STATUSLINE_PREF_KEY];
      if (storedStatusline) {
        try {
          setStatuslineSegments(
            normalizeStatuslineConfig(JSON.parse(storedStatusline)),
          );
        } catch (err) {
          console.warn("[command] failed to parse statusline pref", err);
        }
      }
      const storedOverrides = prefs[COMMAND_ROLE_OVERRIDES_PREF_KEY];
      if (storedOverrides) {
        try {
          const parsed = JSON.parse(storedOverrides) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const cleaned: Record<string, string> = {};
            for (const [k, v] of Object.entries(parsed)) {
              if (typeof v === "string") cleaned[k] = v;
            }
            setRoleOverrides(cleaned);
          }
        } catch (err) {
          console.warn("[command] failed to parse role overrides pref", err);
        }
      }
      const storedSkills = prefs[COMMAND_ROLE_SKILLS_PREF_KEY];
      if (storedSkills) {
        try {
          const parsed = JSON.parse(storedSkills) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const cleaned: Record<string, string[]> = {};
            for (const [k, v] of Object.entries(parsed)) {
              if (Array.isArray(v)) {
                cleaned[k] = v.filter((s): s is string => typeof s === "string");
              }
            }
            setAllRoleSkills(cleaned);
          }
        } catch (err) {
          console.warn("[command] failed to parse role skills pref", err);
        }
      }
      const storedMcp = prefs[COMMAND_MCP_SERVERS_PREF_KEY];
      if (storedMcp) {
        try {
          setMcpServers(parseMcpServerList(JSON.parse(storedMcp)));
        } catch (err) {
          console.warn("[command] failed to parse mcp servers pref", err);
        }
      }
      const storedWidth = prefs[COMMAND_CHAT_PANEL_WIDTH_PREF_KEY];
      if (storedWidth) {
        const n = Number.parseInt(storedWidth, 10);
        if (Number.isFinite(n)) {
          setChatPanelWidth(
            Math.max(CHAT_PANEL_MIN, Math.min(CHAT_PANEL_MAX, n)),
          );
        }
      }
    });
  }, [
    setTerrain,
    setTileSize,
    setStatuslineSegments,
    setRoleOverrides,
    setAllRoleSkills,
    setMcpServers,
  ]);

  // Pre-load the skills library at Commander mount so the launch
  // flow can bundle attached skill bodies into the role prompt
  // even on the first launch (before the user has opened the
  // Settings dialog, which also refreshes this cache).
  useEffect(() => {
    void commandListSkills()
      .then(setSkillsCache)
      .catch((err: unknown) => {
        console.warn("[command] initial skills load failed", err);
      });
  }, [setSkillsCache]);

  // Auto-reconnect every disconnected unit once when the Command
  // screen mounts. Sessions hydrated from SQLite land in `isLive:
  // false`; without this, the user has to click Resume on each
  // tile. The Set guard at module scope prevents redundant retries.
  useEffect(() => {
    attemptAutoReconnect();
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <WorkflowPanelHeader
        barClassName="z-20"
        leading={
          <>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className={`${APP_HEADER_TITLE} leading-none`}>Command</h1>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                Multi-agent tactical field · {projectDir ?? "loading…"}
              </p>
            </div>
          </>
        }
        trailing={
          <div className="flex items-center gap-2">
            <TileSizePicker />
            <TerrainPicker />
            <CommanderSettingsButton />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLaunchOpen(true)}
              disabled={!projectDir}
              aria-label="Launch unit"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Launch
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setArchiveOpen(true)}
              aria-label="Open archive"
            >
              <Archive className="mr-1 h-3.5 w-3.5" />
              Archive
            </Button>
          </div>
        }
      />

      {projectDir !== null && (
        <LaunchUnitModal
          open={launchOpen}
          onOpenChange={setLaunchOpen}
          defaultProjectDir={projectDir}
        />
      )}
      <ArchiveDrawer open={archiveOpen} onOpenChange={setArchiveOpen} />

      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0">
          {unitList.length === 0 ? (
            <div className="p-2 h-full">
              <EmptyField />
            </div>
          ) : (
            <AgentCardGrid onExpandField={() => setFieldExpanded(true)} />
          )}
        </div>
        <aside
          className="relative shrink-0 border-l border-white/10 bg-black/40"
          style={{ width: chatPanelWidth }}
        >
          <ChatPanelResizer
            width={chatPanelWidth}
            onResize={setChatPanelWidth}
            onCommit={(next) => {
              void setPreference(
                COMMAND_CHAT_PANEL_WIDTH_PREF_KEY,
                String(next),
              );
            }}
            min={CHAT_PANEL_MIN}
            max={CHAT_PANEL_MAX}
          />
          <UnitChatPanel />
        </aside>
        {fieldExpanded && (
          <ExpandedField onClose={() => setFieldExpanded(false)} />
        )}
      </div>

      <footer className="flex items-center gap-4 border-t border-white/10 bg-black/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-white/60">
        <span>{total} unit{total === 1 ? "" : "s"}</span>
        <span>·</span>
        <span>{idle} idle</span>
        <span>·</span>
        <span>{busy} working</span>
        <span>·</span>
        <span>{blocked} blocked</span>
      </footer>
    </div>
  );
}

function EmptyField() {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-dashed border-amber-800/40 bg-black/30 text-sm text-muted-foreground">
      No units deployed. Click <span className="mx-1 font-medium text-foreground">Launch</span> to deploy a unit.
    </div>
  );
}
