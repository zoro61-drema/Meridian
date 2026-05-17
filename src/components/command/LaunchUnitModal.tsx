// LaunchUnitModal — Phase 4 launch flow.
//
// Picks: role (preset or Custom), sprite (defaults from role, override
// for Custom), backend, project directory, optional unit name + custom
// system prompt for Custom role. On submit, calls
// `commandSmokeLaunch` and primes the unit with the role's system
// prompt via the store's `rolePrompt` field; the first user message
// in the chat panel will prepend it.

import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  COMMAND_ROLES,
  type CommandRole,
  type RoleId,
  roleById,
} from "@/lib/commandRoles";
import { commandSmokeLaunch, type BackendKind } from "@/lib/tauri/command";
import { scheduleSpawnSettle } from "@/stores/command/listeners";
import {
  computeNextUnitName,
  type SpriteId,
  useCommandStore,
} from "@/stores/command/store";

const BACKEND_OPTIONS: Array<{
  id: BackendKind;
  label: string;
  hint: string;
  disabled?: boolean;
  disabledReason?: string;
}> = [
  { id: "claudeAcp", label: "Claude", hint: "@agentclientprotocol/claude-agent-acp" },
  { id: "geminiAcp", label: "Gemini", hint: "gemini --acp" },
  {
    id: "codexAcp",
    label: "Codex",
    hint: "@zed-industries/codex-acp — needs `codex login` first",
  },
  { id: "qwenAcp", label: "Qwen", hint: "qwen --acp — run `qwen` once to set up auth" },
];

const SPRITE_OPTIONS: Array<{ id: SpriteId; label: string }> = [
  { id: "marine", label: "Marine" },
  { id: "engineer", label: "Engineer" },
  { id: "field-tech", label: "Field Tech" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultProjectDir: string;
}

export function LaunchUnitModal({ open, onOpenChange, defaultProjectDir }: Props) {
  const addUnit = useCommandStore((s) => s.addUnit);

  const [roleId, setRoleId] = useState<RoleId>("implementer");
  const role = useMemo<CommandRole>(() => roleById(roleId), [roleId]);

  // Sprite + backend default from the chosen role, but the user can
  // override. Reset overrides whenever the role changes.
  const [spriteId, setSpriteId] = useState<SpriteId>(role.defaultSprite);
  const [backend, setBackend] = useState<BackendKind>(role.defaultBackend);
  const [projectDir, setProjectDir] = useState(defaultProjectDir);
  const [customName, setCustomName] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSpriteId(role.defaultSprite);
    setBackend(role.defaultBackend);
    setCustomPrompt("");
    setCustomName("");
    setProjectDir(defaultProjectDir);
  }, [open, role, defaultProjectDir]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (launching) return;
    if (!projectDir.trim()) {
      toast.error("Project directory is required.");
      return;
    }
    setLaunching(true);
    try {
      const displayName =
        customName.trim() || computeNextUnitName(useCommandStore.getState(), backend);
      const { sessionId, acpSessionId } = await commandSmokeLaunch(
        backend,
        projectDir,
        displayName,
      );
      const systemPrompt =
        role.id === "custom" ? customPrompt.trim() : role.systemPrompt;
      addUnit({
        sessionId,
        backend,
        acpSessionId,
        spriteId,
        name: displayName,
        role: role.title,
        rolePrompt: systemPrompt || undefined,
        projectId: projectDir,
      });
      scheduleSpawnSettle(sessionId);
      toast.success(`Launched ${role.title}`);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Launch failed: ${msg}`);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Launch a unit</DialogTitle>
          <DialogDescription>
            Deploy an AI agent to the tactical field. The role's system prompt is
            prepended to your first message; subsequent turns are unprefixed.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Role
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {COMMAND_ROLES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRoleId(r.id)}
                  className={`rounded-md border px-2.5 py-2 text-left transition-colors ${
                    roleId === r.id
                      ? "border-amber-500/60 bg-amber-900/20 text-amber-100"
                      : "border-white/10 bg-black/30 hover:bg-white/5"
                  }`}
                >
                  <div className="text-sm font-medium">{r.title}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">
                    {r.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Sprite
              </Label>
              <div className="flex gap-1.5">
                {SPRITE_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSpriteId(s.id)}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      spriteId === s.id
                        ? "border-amber-500/60 bg-amber-900/20 text-amber-100"
                        : "border-white/10 bg-black/30 hover:bg-white/5"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Backend
              </Label>
              <div className="flex gap-1.5">
                {BACKEND_OPTIONS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => !b.disabled && setBackend(b.id)}
                    disabled={b.disabled}
                    title={b.disabledReason ?? b.hint}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      b.disabled
                        ? "cursor-not-allowed border-white/5 bg-black/20 text-white/30"
                        : backend === b.id
                          ? "border-amber-500/60 bg-amber-900/20 text-amber-100"
                          : "border-white/10 bg-black/30 hover:bg-white/5"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="launch-project-dir"
              className="text-xs uppercase tracking-wider text-muted-foreground"
            >
              Project directory
            </Label>
            <Input
              id="launch-project-dir"
              value={projectDir}
              onChange={(e) => setProjectDir(e.target.value)}
              placeholder="/path/to/repo"
              className="bg-black/30"
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="launch-unit-name"
              className="text-xs uppercase tracking-wider text-muted-foreground"
            >
              Unit name (optional)
            </Label>
            <Input
              id="launch-unit-name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={role.title}
              className="bg-black/30"
            />
          </div>

          {role.id === "custom" && (
            <div className="space-y-1.5">
              <Label
                htmlFor="launch-custom-prompt"
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                Custom system prompt
              </Label>
              <Textarea
                id="launch-custom-prompt"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="You are an agent that…"
                rows={5}
                className="bg-black/30 font-mono text-xs"
              />
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={launching}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={launching}>
              {launching ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3.5 w-3.5" />
              )}
              Deploy {role.title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
