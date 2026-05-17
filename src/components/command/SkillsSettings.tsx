// SkillsSettings — manage the shared skills library and per-role
// attachments.
//
// Skills live at ~/.meridian/command/skills/<id>.md (filesystem,
// owned by the Rust side). The CommanderSettings dialog refreshes
// the in-memory cache on open, and writes go through Tauri
// commands so the disk + cache stay in sync.
//
// Per-role attachments — which skills get bundled into each role's
// launch prompt — live in the `command_role_skills` pref (JSON map
// keyed by role id).

import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { COMMAND_ROLES } from "@/lib/commandRoles";
import { setPreference } from "@/lib/preferences";
import {
  commandDeleteSkill,
  commandListSkills,
  commandSaveSkill,
} from "@/lib/tauri/command";
import { useCommandStore } from "@/stores/command/store";

export const COMMAND_ROLE_SKILLS_PREF_KEY = "command_role_skills";

const ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function SkillsSettings() {
  const skills = useCommandStore((s) => s.skills);
  const setSkillsCache = useCommandStore((s) => s.setSkillsCache);
  const roleSkills = useCommandStore((s) => s.roleSkills);
  const setRoleSkills = useCommandStore((s) => s.setRoleSkills);

  // Refresh the cache when the tab mounts — keeps disk + UI in
  // sync if the user edited files outside the app.
  useEffect(() => {
    let alive = true;
    void commandListSkills()
      .then((list) => {
        if (alive) setSkillsCache(list);
      })
      .catch((err) => {
        console.warn("[command] failed to list skills", err);
      });
    return () => {
      alive = false;
    };
  }, [setSkillsCache]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => skills.find((s) => s.id === selectedId) ?? null,
    [skills, selectedId],
  );

  // Keep a selected id sticky: if the current selection vanishes
  // (e.g. user deleted it), fall back to the first available.
  useEffect(() => {
    if (selectedId && !skills.find((s) => s.id === selectedId)) {
      setSelectedId(skills[0]?.id ?? null);
    } else if (!selectedId && skills.length > 0) {
      setSelectedId(skills[0]!.id);
    }
  }, [skills, selectedId]);

  // New-skill form state.
  const [newId, setNewId] = useState("");
  const [creating, setCreating] = useState(false);

  // Body editor state.
  const [draft, setDraft] = useState("");
  useEffect(() => {
    setDraft(selected?.body ?? "");
  }, [selected?.id, selected?.body]);
  const dirty = draft !== (selected?.body ?? "");

  const persistRoleSkills = (next: Record<string, string[]>) => {
    void setPreference(
      COMMAND_ROLE_SKILLS_PREF_KEY,
      JSON.stringify(next),
    );
  };

  const onCreate = async () => {
    const id = newId.trim().toLowerCase();
    if (!ID_PATTERN.test(id) || id.length > 64) {
      toast.error(
        "Skill id must be lowercase letters / digits / dashes (≤64 chars)",
      );
      return;
    }
    if (skills.some((s) => s.id === id)) {
      toast.error(`Skill "${id}" already exists`);
      return;
    }
    setCreating(true);
    try {
      await commandSaveSkill(id, "");
      const refreshed = await commandListSkills();
      setSkillsCache(refreshed);
      setSelectedId(id);
      setNewId("");
      toast.success(`Created skill "${id}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Could not create skill: ${msg}`);
    } finally {
      setCreating(false);
    }
  };

  const onSave = async () => {
    if (!selected) return;
    try {
      await commandSaveSkill(selected.id, draft);
      const refreshed = await commandListSkills();
      setSkillsCache(refreshed);
      toast.success(`Saved skill "${selected.id}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Could not save skill: ${msg}`);
    }
  };

  const onDelete = async () => {
    if (!selected) return;
    try {
      await commandDeleteSkill(selected.id);
      // Also drop the skill from every role attachment so we don't
      // launch agents pointing at a missing skill.
      const nextRoleSkills: Record<string, string[]> = {};
      for (const [rid, ids] of Object.entries(roleSkills)) {
        nextRoleSkills[rid] = ids.filter((id) => id !== selected.id);
      }
      for (const [rid, ids] of Object.entries(nextRoleSkills)) {
        setRoleSkills(rid, ids);
      }
      persistRoleSkills(nextRoleSkills);
      const refreshed = await commandListSkills();
      setSkillsCache(refreshed);
      toast.success(`Deleted skill "${selected.id}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Could not delete skill: ${msg}`);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Skills are markdown blocks at{" "}
        <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[10px]">
          ~/.meridian/command/skills/
        </code>
        . At launch, every skill attached to the agent's role gets
        appended to the role's system prompt.
      </p>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* Skill list + new-skill form */}
        <div className="flex w-52 shrink-0 flex-col gap-2">
          <div className="flex items-stretch gap-1">
            <Input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="new-skill-id"
              className="h-7 bg-black/30 font-mono text-[11px]"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => void onCreate()}
              disabled={creating || newId.trim().length === 0}
              className="h-7 shrink-0 px-2 text-[11px]"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          <ul className="flex-1 min-h-0 overflow-y-auto rounded-md border border-white/10 bg-black/30 p-1">
            {skills.length === 0 ? (
              <li className="px-2 py-3 text-center text-[10px] italic text-white/40">
                No skills yet. Add one above.
              </li>
            ) : (
              skills.map((s) => {
                const active = s.id === selectedId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      className={`w-full truncate rounded px-2 py-1 text-left text-[11px] transition-colors ${
                        active
                          ? "bg-amber-500/15 text-white"
                          : "text-white/80 hover:bg-white/5"
                      }`}
                      title={s.id}
                    >
                      <span className="font-mono">{s.id}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        {/* Editor + per-role attachment toggles */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {selected ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-[12px] text-white/90">
                    {selected.id}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Updated{" "}
                    {selected.updatedAtMs
                      ? new Date(selected.updatedAtMs).toLocaleString()
                      : "—"}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void onDelete()}
                  className="h-7 px-2 text-[11px] text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  Delete
                </Button>
              </div>

              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Markdown body — instructions, guidelines, examples…"
                className="min-h-[180px] flex-1 resize-none bg-black/30 font-mono text-[11px]"
              />

              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] text-muted-foreground">
                  {dirty
                    ? "Unsaved changes"
                    : "Synced with disk"}
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void onSave()}
                  disabled={!dirty}
                  className="h-7 px-2 text-[11px]"
                >
                  <Save className="mr-1 h-3 w-3" />
                  Save
                </Button>
              </div>

              {/* Per-role attachment row — toggles whether this skill
                  is bundled into each role's launch prompt. */}
              <div className="mt-2 rounded-md border border-white/10 bg-black/30 p-2">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">
                  Attached to roles
                </div>
                <div className="flex flex-wrap gap-2">
                  {COMMAND_ROLES.map((role) => {
                    const attached = (roleSkills[role.id] ?? []).includes(
                      selected.id,
                    );
                    return (
                      <label
                        key={role.id}
                        className="flex items-center gap-1.5 rounded border border-white/10 bg-black/30 px-2 py-1 text-[11px]"
                      >
                        <Switch
                          checked={attached}
                          onCheckedChange={(checked) => {
                            const current = roleSkills[role.id] ?? [];
                            const next = checked
                              ? [...current, selected.id]
                              : current.filter((id) => id !== selected.id);
                            setRoleSkills(role.id, next);
                            const allNext = {
                              ...roleSkills,
                              [role.id]: next,
                            };
                            persistRoleSkills(allNext);
                          }}
                          aria-label={`Attach ${selected.id} to ${role.title}`}
                        />
                        <span className="text-white/85">{role.title}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-white/15 bg-black/20 text-center">
              <div className="px-6 py-8">
                <div className="text-sm text-white/85">No skill selected</div>
                <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                  Pick a skill on the left, or create a new one to build out
                  your library.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void commandListSkills().then(setSkillsCache);
                  }}
                  className="mt-2 h-7 px-2 text-[11px]"
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Refresh from disk
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
