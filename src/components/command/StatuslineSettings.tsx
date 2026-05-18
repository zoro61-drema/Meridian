// StatuslineSettings — configurable agent-card statusline tab.
//
// Models ccstatusline's segment-list concept: the user toggles
// which segments appear on every agent card, and reorders them
// with up/down arrows. The live preview at the bottom renders
// the current configuration against a synthetic unit so the
// effect is visible without leaving the dialog.

import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";

import { AgentCardStatusline } from "@/components/command/AgentCard";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_STATUSLINE_SEGMENTS,
  serializeStatuslineConfig,
  STATUSLINE_SEGMENT_META,
  type StatuslineSegmentEntry,
} from "@/lib/commandStatusline";
import { setPreference } from "@/lib/preferences";
import { useCommandStore, type CommandUnit } from "@/stores/command/store";

export const COMMAND_STATUSLINE_PREF_KEY = "command_statusline";

export function StatuslineSettings() {
  const segments = useCommandStore((s) => s.statuslineSegments);
  const setStatuslineSegments = useCommandStore(
    (s) => s.setStatuslineSegments,
  );

  const persist = (next: StatuslineSegmentEntry[]) => {
    setStatuslineSegments(next);
    void setPreference(
      COMMAND_STATUSLINE_PREF_KEY,
      serializeStatuslineConfig(next),
    );
  };

  const toggle = (id: string) => {
    persist(
      segments.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      ),
    );
  };

  const move = (id: string, delta: -1 | 1) => {
    const idx = segments.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= segments.length) return;
    const copy = [...segments];
    const [item] = copy.splice(idx, 1);
    if (item) copy.splice(target, 0, item);
    persist(copy);
  };

  const resetToDefault = () => persist(DEFAULT_STATUSLINE_SEGMENTS);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Pick which segments appear on every agent card, and what order
          they render in. Changes apply immediately to every visible card.
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={resetToDefault}
          className="h-7 shrink-0 px-2 text-[11px]"
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          Reset
        </Button>
      </div>

      <ul className="divide-y divide-white/5 rounded-md border border-white/10 bg-black/30">
        {segments.map((entry, i) => {
          const meta = STATUSLINE_SEGMENT_META[entry.id];
          const isFirst = i === 0;
          const isLast = i === segments.length - 1;
          return (
            <li
              key={entry.id}
              className="flex items-center gap-2 px-2 py-1.5"
            >
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => move(entry.id, -1)}
                  disabled={isFirst}
                  aria-label={`Move ${meta.label} up`}
                  className="rounded p-0.5 text-white/40 hover:bg-white/5 hover:text-white/80 disabled:opacity-20 disabled:hover:bg-transparent"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => move(entry.id, 1)}
                  disabled={isLast}
                  aria-label={`Move ${meta.label} down`}
                  className="rounded p-0.5 text-white/40 hover:bg-white/5 hover:text-white/80 disabled:opacity-20 disabled:hover:bg-transparent"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-white/90">
                  {meta.label}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {meta.description}
                </div>
              </div>
              <Switch
                checked={entry.enabled}
                onCheckedChange={() => toggle(entry.id)}
                aria-label={`Enable ${meta.label}`}
              />
            </li>
          );
        })}
      </ul>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">
          Preview
        </div>
        <div className="rounded-md border border-white/10 bg-black/40 p-2">
          <AgentCardStatusline unit={PREVIEW_UNIT} />
        </div>
      </div>
    </div>
  );
}

// Synthetic unit used purely for the settings preview. Numbers
// chosen so every segment has visible content (e.g. inbox > 0
// so that segment isn't an empty chip).
const PREVIEW_UNIT: CommandUnit = {
  id: "preview",
  name: "Preview",
  spriteId: "marine",
  role: "Implementer",
  projectId: "/path/to/project",
  backend: "claudeAcp",
  modelId: "claude-sonnet-4-5",
  state: "thinking",
  transient: undefined,
  positionX: 0,
  positionY: 0,
  facing: "right",
  anchorX: 0,
  anchorY: 0,
  facing8: "S",
  isWandering: false,
  canWander: true,
  spawnStartedAt: null,
  contextUsage: 0.45,
  createdAt: Date.now(),
  lastActiveAt: Date.now(),
  transcript: [],
  promptInFlight: false,
  rolePrompt: null,
  pendingPermission: null,
  acpSessionId: "preview",
  isLive: true,
  suppressNotifications: false,
  parentId: null,
  childIds: [],
  isSubagent: false,
  inbox: [
    {
      messageId: "preview-msg",
      fromSessionId: "preview-other",
      fromName: "Marine 2",
      toSessionId: "preview",
      toName: "Preview",
      subject: null,
      body: "preview inbox message",
      createdAtMs: Date.now(),
    },
  ],
  files: [
    {
      path: "/path/to/file.ts",
      firstTouchedAt: Date.now(),
      lastTouchedAt: Date.now(),
      lastKind: "edit",
    },
    {
      path: "/path/to/other.ts",
      firstTouchedAt: Date.now(),
      lastTouchedAt: Date.now(),
      lastKind: "read",
    },
  ],
  commands: [
    {
      id: "preview-cmd",
      command: "pnpm test",
      status: "completed",
      exitCode: 0,
      createdAt: Date.now(),
    },
  ],
  lastRawEvent: null,
  usage: {
    tokens: 18_400,
    inputTokens: 12_300,
    outputTokens: 6_100,
    contextSize: 200_000,
    costUsd: null,
    updatedAtMs: Date.now(),
  },
  groomingQueue: [],
  bugReports: [],
  addressedPrs: [],
  reviewedPrs: [],
};
