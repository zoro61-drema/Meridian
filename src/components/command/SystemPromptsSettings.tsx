// SystemPromptsSettings — edit per-role system prompts.
//
// Each role gets a textarea. Save persists the override to the
// `command_role_overrides` pref (JSON map). New units launched
// with the role pick up the override; in-flight units keep their
// existing rolePrompt until the next launch.
//
// Reset clears a role's override so subsequent launches use the
// static default from commandRoles.ts again.

import { RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { COMMAND_ROLES, roleById, type RoleId } from "@/lib/commandRoles";
import { setPreference } from "@/lib/preferences";
import { useCommandStore } from "@/stores/command/store";

export const COMMAND_ROLE_OVERRIDES_PREF_KEY = "command_role_overrides";

export function SystemPromptsSettings() {
  const overrides = useCommandStore((s) => s.roleOverrides);
  const setRoleOverride = useCommandStore((s) => s.setRoleOverride);

  // The user picks a role on the left; the right pane shows the
  // textarea pre-filled with the active prompt (override if set,
  // default otherwise).
  const [selectedId, setSelectedId] = useState<RoleId>(COMMAND_ROLES[0]!.id);
  const role = useMemo(() => roleById(selectedId), [selectedId]);
  const currentOverride = overrides[selectedId] ?? "";
  const defaultPrompt = role.systemPrompt;
  const [draft, setDraft] = useState(currentOverride || defaultPrompt);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Re-sync the draft when the user switches roles, or when the
  // saved override changes underneath us (e.g. reset).
  useEffect(() => {
    setDraft(currentOverride || defaultPrompt);
    setSavedAt(null);
  }, [selectedId, currentOverride, defaultPrompt]);

  const dirty = draft !== (currentOverride || defaultPrompt);
  const isCustom = currentOverride.length > 0;

  const persist = (next: Record<string, string>) => {
    void setPreference(
      COMMAND_ROLE_OVERRIDES_PREF_KEY,
      JSON.stringify(next),
    );
  };

  const onSave = () => {
    const trimmed = draft === defaultPrompt ? "" : draft;
    setRoleOverride(selectedId, trimmed);
    const next = { ...overrides, [selectedId]: trimmed };
    persist(next);
    setSavedAt(Date.now());
    toast.success(`Saved system prompt for ${role.title}`);
  };

  const onReset = () => {
    setRoleOverride(selectedId, "");
    const next = { ...overrides, [selectedId]: "" };
    persist(next);
    setDraft(defaultPrompt);
    toast.success(`Reverted ${role.title} to default prompt`);
  };

  return (
    <div className="flex h-full gap-3">
      {/* Role list on the left */}
      <ul className="flex w-44 shrink-0 flex-col gap-0.5 rounded-md border border-white/10 bg-black/30 p-1">
        {COMMAND_ROLES.map((r) => {
          const hasOverride = (overrides[r.id] ?? "").length > 0;
          const active = r.id === selectedId;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelectedId(r.id)}
                className={`flex w-full items-baseline justify-between gap-2 rounded px-2 py-1.5 text-left text-[11px] transition-colors ${
                  active
                    ? "bg-amber-500/15 text-white"
                    : "text-white/80 hover:bg-white/5"
                }`}
              >
                <span className="truncate font-medium">{r.title}</span>
                {hasOverride && (
                  <span
                    className="shrink-0 rounded border border-emerald-700/50 bg-emerald-900/30 px-1 py-0 font-mono text-[9px] text-emerald-300"
                    title="Custom override saved"
                  >
                    custom
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Editor on the right */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium text-white/90">
              {role.title}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {role.description}
            </div>
          </div>
          <div className="shrink-0 text-[10px] text-muted-foreground">
            {isCustom ? "Currently: custom override" : "Currently: default"}
          </div>
        </div>

        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            role.systemPrompt
              ? role.systemPrompt
              : "No default prompt — type something to prime the agent at launch."
          }
          className="min-h-[260px] flex-1 resize-none bg-black/30 font-mono text-[11px]"
        />

        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            {savedAt
              ? `Saved · changes apply on the next agent launch.`
              : "Edits apply to new launches; running agents keep their existing prompt."}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={!isCustom}
              className="h-7 px-2 text-[11px]"
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Reset to default
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onSave}
              disabled={!dirty}
              className="h-7 px-2 text-[11px]"
            >
              <Save className="mr-1 h-3 w-3" />
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
