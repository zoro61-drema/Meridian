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
  effectiveRolePrompt,
  roleById,
} from "@/lib/commandRoles";
import {
  formatIssueBlock,
  parseTicketKeyList,
} from "@/lib/commandGroomerLaunch";
import { loadGroomingTemplate } from "@/lib/tauri/templates";
import type { GroomingFormatTemplates } from "@/lib/groomingPromptBlocks";
import {
  filterServersForBackend,
  toWrapperPayload,
} from "@/lib/commandMcpServers";
import { getModelsForBackend, type ModelEntry } from "@/lib/modelsCatalog";
import {
  getAllActiveSprints,
  getFutureSprints,
  getIssue,
  getSprintIssuesById,
  type JiraIssue,
  type JiraSprint,
} from "@/lib/tauri/jira";
import {
  commandSmokeLaunch,
  commandSmokePrompt,
  type BackendKind,
} from "@/lib/tauri/command";
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

/** Suggested model id per backend — purely a placeholder hint
 *  in the launch modal's Model input. The field is freeform so
 *  the user can paste whatever id their CLI accepts. */
const MODEL_PLACEHOLDER: Record<BackendKind, string> = {
  claudeAcp: "claude-opus-4-7 / claude-sonnet-4-6 / claude-haiku-4-5",
  codexAcp: "gpt-5 / gpt-4o / o3",
  geminiAcp: "gemini-2.5-pro / gemini-2.5-flash",
  qwenAcp: "qwen3-coder / qwen3-turbo",
};

/** Env var the wrapper inherits — used in the modal's helper copy
 *  + by the Rust spawn code (mirrored in `acp_spawn::build_model_env`). */
const MODEL_ENV_VAR: Record<BackendKind, string> = {
  claudeAcp: "ANTHROPIC_MODEL",
  codexAcp: "OPENAI_MODEL",
  geminiAcp: "GEMINI_MODEL",
  qwenAcp: "QWEN_MODEL",
};

const SPRITE_OPTIONS: Array<{ id: SpriteId; label: string }> = [
  { id: "marine", label: "Marine" },
  { id: "engineer", label: "Engineer" },
  { id: "field-tech", label: "Medic" },
  { id: "light-walker", label: "Light Walker" },
  { id: "siege-walker", label: "Siege Walker" },
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
  /** Optional model override. Empty string = wrapper default
   *  (whatever the native CLI is configured to use). Passed as
   *  the appropriate env var per backend (`ANTHROPIC_MODEL`,
   *  `OPENAI_MODEL`, …) at spawn time. */
  const [modelOverride, setModelOverride] = useState("");
  /** Catalog of model ids available for `backend` (pulled from
   *  models.dev). Empty until the first fetch completes. */
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  /** When true, the Model field renders a freeform Input so the
   *  user can paste an id not present in the catalog. The select
   *  switches into this mode when the user picks the "Custom…"
   *  sentinel option. */
  const [customModelMode, setCustomModelMode] = useState(false);
  const [launching, setLaunching] = useState(false);

  // Ticket-groomer batch picker state. Only meaningful when
  // role.id === "ticket-groomer" but kept declared at component
  // scope so resets don't have to dance around conditional hooks.
  const [groomerMode, setGroomerMode] = useState<"sprint" | "manual">("sprint");
  const [sprints, setSprints] = useState<JiraSprint[]>([]);
  const [sprintsLoading, setSprintsLoading] = useState(false);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);
  const [manualTicketsRaw, setManualTicketsRaw] = useState("");

  useEffect(() => {
    if (!open) return;
    setSpriteId(role.defaultSprite);
    setBackend(role.defaultBackend);
    setCustomPrompt("");
    setCustomName("");
    setModelOverride("");
    setCustomModelMode(false);
    setProjectDir(defaultProjectDir);
    setGroomerMode("sprint");
    setSelectedSprintId(null);
    setManualTicketsRaw("");
  }, [open, role, defaultProjectDir]);

  // Pull the per-backend model list whenever the modal opens or
  // the user switches backend. Cached in localStorage by
  // modelsCatalog, so re-opens within the TTL are instant.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setModelsLoading(true);
    setModelsError(null);
    getModelsForBackend(backend)
      .then((list) => {
        if (!alive) return;
        setModels(list);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const msg = err instanceof Error ? err.message : String(err);
        setModelsError(msg);
        setModels([]);
      })
      .finally(() => {
        if (alive) setModelsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, backend]);

  // Switching backend invalidates the previous backend's model id.
  // Reset the override + leave custom-mode so the picker re-engages.
  useEffect(() => {
    setModelOverride("");
    setCustomModelMode(false);
  }, [backend]);

  // Fetch the sprint list once when the ticket-groomer role is
  // selected. Active + future sprints get concatenated; the future-
  // sprint cap of 10 is arbitrary but generous for typical teams.
  useEffect(() => {
    if (!open || role.id !== "ticket-groomer") return;
    let alive = true;
    setSprintsLoading(true);
    void Promise.all([getAllActiveSprints(), getFutureSprints(10)])
      .then(([active, future]) => {
        if (!alive) return;
        const combined = [...active, ...future];
        setSprints(combined);
        if (combined.length > 0 && selectedSprintId == null) {
          setSelectedSprintId(combined[0]!.id);
        }
      })
      .catch((err: unknown) => {
        console.warn("[command] sprint fetch failed", err);
      })
      .finally(() => {
        if (alive) setSprintsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, role.id, selectedSprintId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (launching) return;
    if (!projectDir.trim()) {
      toast.error("Project directory is required.");
      return;
    }

    // For the ticket-groomer role, fetch the batch BEFORE spawning
    // the agent — if there are no tickets to groom or the JIRA
    // fetch fails, we don't want a half-launched unit on the field.
    // `groomerHeader` is a tiny metadata block prepended to the
    // role prompt; the actual per-ticket data lands in the Rust
    // pending-queue and is dispensed one at a time via the
    // `get_next_ticket` MCP tool.
    let groomerHeader: string | null = null;
    let groomerTickets: string[] = [];
    if (role.id === "ticket-groomer") {
      setLaunching(true);
      try {
        let sprint: JiraSprint | null = null;
        let issues: JiraIssue[] = [];
        if (groomerMode === "sprint") {
          if (selectedSprintId == null) {
            toast.error("Pick a sprint to groom.");
            setLaunching(false);
            return;
          }
          sprint = sprints.find((s) => s.id === selectedSprintId) ?? null;
          issues = await getSprintIssuesById(selectedSprintId);
        } else {
          const { keys, invalid } = parseTicketKeyList(manualTicketsRaw);
          if (invalid.length > 0) {
            toast.error(
              `Invalid ticket keys: ${invalid.slice(0, 3).join(", ")}${
                invalid.length > 3 ? "…" : ""
              }`,
            );
            setLaunching(false);
            return;
          }
          if (keys.length === 0) {
            toast.error("Add at least one ticket key (e.g. PROJ-1234).");
            setLaunching(false);
            return;
          }
          const fetched = await Promise.allSettled(keys.map((k) => getIssue(k)));
          const missing: string[] = [];
          fetched.forEach((r, i) => {
            if (r.status === "fulfilled") issues.push(r.value);
            else missing.push(keys[i]!);
          });
          if (missing.length > 0) {
            toast.error(
              `Could not fetch: ${missing.slice(0, 3).join(", ")}${
                missing.length > 3 ? "…" : ""
              }`,
            );
            setLaunching(false);
            return;
          }
        }
        if (issues.length === 0) {
          toast.error("No tickets to groom — sprint is empty.");
          setLaunching(false);
          return;
        }
        // Header: small metadata block, NOT the full ticket data —
        // tickets get dispensed one at a time via get_next_ticket.
        const headerLines = [
          sprint
            ? `Grooming batch — Sprint: ${sprint.name} (id ${sprint.id})${
                sprint.goal ? ` · goal: ${sprint.goal}` : ""
              }`
            : "Grooming batch — manual selection",
          `Count: ${issues.length} ticket${issues.length === 1 ? "" : "s"}`,
          `Keys: ${issues.map((i) => i.key).join(", ")}`,
        ];
        groomerHeader = headerLines.join("\n");
        groomerTickets = issues.map(formatIssueBlock);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`JIRA fetch failed: ${msg}`);
        setLaunching(false);
        return;
      }
    } else {
      setLaunching(true);
    }

    try {
      const displayName =
        customName.trim() || computeNextUnitName(useCommandStore.getState(), backend);
      const storeSnap = useCommandStore.getState();
      const filteredServers = filterServersForBackend(
        storeSnap.mcpServers,
        backend,
      ).map(toWrapperPayload);
      const { sessionId, acpSessionId } = await commandSmokeLaunch(
        backend,
        projectDir,
        displayName,
        filteredServers,
        groomerTickets,
        modelOverride.trim(),
      );
      // For the Custom role the user types the prompt directly in
      // the modal; everything else goes through `effectiveRolePrompt`
      // so per-role overrides + attached skill bodies (from
      // CommanderSettings) compose into the launch prompt.
      const storeNow = useCommandStore.getState();
      const skillsById: Record<string, string> = {};
      for (const s of storeNow.skills) skillsById[s.id] = s.body;
      const selectedSkillIds = storeNow.roleSkills[role.id] ?? [];
      // For the Ticket Groomer role only, load the user's per-field format
      // templates so the prompt includes them — same templates the sidecar
      // grooming workflow uses. `loadGroomingTemplate` returns "" when not
      // configured, which `buildFormatTemplatesBlock` treats as absent.
      let groomingTemplates: GroomingFormatTemplates | null = null;
      if (role.id === "ticket-groomer") {
        const [ac, str] = await Promise.all([
          loadGroomingTemplate("acceptance_criteria").catch(() => ""),
          loadGroomingTemplate("steps_to_reproduce").catch(() => ""),
        ]);
        if (ac.trim() || str.trim()) {
          groomingTemplates = {
            acceptance_criteria: ac.trim() ? ac : null,
            steps_to_reproduce: str.trim() ? str : null,
          };
        }
      }
      let systemPrompt =
        role.id === "custom"
          ? customPrompt.trim()
          : effectiveRolePrompt(
              role.id,
              storeNow.roleOverrides,
              selectedSkillIds,
              skillsById,
              groomingTemplates,
            );
      // Append the batch header AFTER the base role prompt so the
      // agent sees the directive first and the batch metadata second.
      // Per-ticket content is delivered on demand via get_next_ticket.
      if (groomerHeader) {
        systemPrompt = systemPrompt
          ? `${systemPrompt}\n\n---\n\n${groomerHeader}`
          : groomerHeader;
      }
      addUnit({
        sessionId,
        backend,
        acpSessionId,
        spriteId,
        name: displayName,
        role: role.title,
        rolePrompt: systemPrompt || undefined,
        projectId: projectDir,
        modelId: modelOverride.trim() || undefined,
      });
      scheduleSpawnSettle(sessionId);
      toast.success(`Launched ${role.title}`);
      onOpenChange(false);

      // Ticket-groomer kickoff: the role prompt tells the agent to
      // start calling get_next_ticket immediately, but ACP agents
      // only act after they receive a session/prompt. Fire one
      // automatically so the user doesn't have to type "go".
      // Consumes the role-prompt prefix in the same way a normal
      // user message would, then drives the unit to "thinking"
      // until the wrapper acks the turn.
      if (groomerTickets.length > 0) {
        const store = useCommandStore.getState();
        const rolePrefix = store.consumeRolePrompt(sessionId) ?? "";
        const kickoff =
          "Begin grooming the queue. Call get_next_ticket now to fetch the first ticket.";
        const fullPrompt = rolePrefix
          ? `${rolePrefix}\n\n---\n\nUser request:\n${kickoff}`
          : kickoff;
        store.appendTranscript(
          sessionId,
          "system",
          `Auto-starting grooming queue (${groomerTickets.length} ticket${
            groomerTickets.length === 1 ? "" : "s"
          }).`,
          { newEntry: true },
        );
        store.setPromptInFlight(sessionId, true);
        store.setUnitState(sessionId, "thinking");
        void commandSmokePrompt(sessionId, fullPrompt)
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            const s = useCommandStore.getState();
            s.appendTranscript(
              sessionId,
              "error",
              `Auto-kickoff failed: ${msg}`,
              { newEntry: true },
            );
            s.setUnitState(sessionId, "error");
          })
          .finally(() => {
            useCommandStore.getState().setPromptInFlight(sessionId, false);
          });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Launch failed: ${msg}`);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-4rem)] max-w-4xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-white/10 p-5 pb-4">
          <DialogTitle>Launch a unit</DialogTitle>
          <DialogDescription>
            Deploy an AI agent to the tactical field. The role's system prompt is
            prepended to your first message; subsequent turns are unprefixed.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => void onSubmit(e)}
        >
          <div className="flex min-h-0 flex-1">
            {/* Left rail — role list. Vertical list of roles with
                title + short description per row. Scrolls
                independently from the right pane. */}
            <div className="flex w-64 shrink-0 flex-col border-r border-white/10">
              <div className="px-4 pt-4 pb-2 text-xs uppercase tracking-wider text-muted-foreground">
                Role
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-3">
                {COMMAND_ROLES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRoleId(r.id)}
                    className={`mb-1 w-full rounded-md border px-2.5 py-2 text-left transition-colors ${
                      roleId === r.id
                        ? "border-amber-500/60 bg-amber-900/20 text-amber-100"
                        : "border-transparent hover:border-white/10 hover:bg-white/5"
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

            {/* Right pane — everything else. Scrolls independently. */}
            <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
              <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Sprite
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {SPRITE_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSpriteId(s.id)}
                    className={`flex-1 basis-[calc(50%-3px)] rounded-md border px-2 py-1.5 text-xs transition-colors ${
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
              htmlFor="launch-model"
              className="text-xs uppercase tracking-wider text-muted-foreground"
            >
              Model (optional)
            </Label>
            {customModelMode ? (
              <div className="flex gap-1.5">
                <Input
                  id="launch-model"
                  value={modelOverride}
                  onChange={(e) => setModelOverride(e.target.value)}
                  placeholder={MODEL_PLACEHOLDER[backend]}
                  className="bg-black/30 font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCustomModelMode(false);
                    setModelOverride("");
                  }}
                >
                  Pick from list
                </Button>
              </div>
            ) : (
              <select
                id="launch-model"
                value={modelOverride}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__custom__") {
                    setCustomModelMode(true);
                    setModelOverride("");
                  } else {
                    setModelOverride(v);
                  }
                }}
                disabled={modelsLoading}
                className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 font-mono text-xs"
              >
                <option value="">
                  {modelsLoading
                    ? "Loading models…"
                    : "Use CLI default"}
                </option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                <option value="__custom__">Custom… (type your own id)</option>
              </select>
            )}
            <p className="text-[10px] text-muted-foreground">
              {modelsError ? (
                <>
                  <span className="text-amber-300">
                    Couldn't load model catalog ({modelsError}).
                  </span>{" "}
                  Use Custom to type an id manually.
                </>
              ) : (
                <>
                  Catalog pulled from{" "}
                  <code className="rounded bg-black/30 px-1 py-0.5 font-mono">
                    models.dev
                  </code>
                  . Passed via{" "}
                  <code className="rounded bg-black/30 px-1 py-0.5 font-mono">
                    {MODEL_ENV_VAR[backend]}
                  </code>{" "}
                  at spawn time. Leave blank to use the CLI's configured default.
                </>
              )}
            </p>
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

          {role.id === "ticket-groomer" && (
            <div className="space-y-2 rounded-md border border-amber-700/40 bg-amber-900/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs uppercase tracking-wider text-amber-200/80">
                  Grooming batch
                </Label>
                <div className="flex gap-1 rounded border border-white/10 bg-black/30 p-0.5">
                  {(["sprint", "manual"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setGroomerMode(m)}
                      className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${
                        groomerMode === m
                          ? "bg-amber-500/20 text-amber-100"
                          : "text-white/60 hover:bg-white/5"
                      }`}
                    >
                      {m === "sprint" ? "From sprint" : "Manual"}
                    </button>
                  ))}
                </div>
              </div>

              {groomerMode === "sprint" ? (
                <select
                  value={selectedSprintId ?? ""}
                  onChange={(e) =>
                    setSelectedSprintId(
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                  disabled={sprintsLoading || sprints.length === 0}
                  className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs"
                >
                  {sprintsLoading && <option value="">Loading sprints…</option>}
                  {!sprintsLoading && sprints.length === 0 && (
                    <option value="">No active or future sprints found</option>
                  )}
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.state ? ` (${s.state})` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <Textarea
                  value={manualTicketsRaw}
                  onChange={(e) => setManualTicketsRaw(e.target.value)}
                  placeholder="PROJ-1234, PROJ-1235, PROJ-1240"
                  rows={3}
                  className="bg-black/30 font-mono text-xs"
                />
              )}
              <p className="text-[10px] text-muted-foreground">
                The agent receives every ticket's current fields in its
                launch prompt and submits per-ticket recommendations as it
                works through the batch. Review them in the Tickets tab.
              </p>
            </div>
          )}

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

              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-white/10 p-4">
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
