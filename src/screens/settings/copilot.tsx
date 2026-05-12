import { CredentialField } from "@/components/CredentialField";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { setPreference } from "@/lib/preferences";
import { deleteCredential, getNonSecretConfig } from "@/lib/tauri/credentials";
import {
    addCustomCopilotModel,
    detectCopilotCli,
    enableCopilotCliDelegation,
    getCopilotModels,
    getCustomCopilotModels,
    pingCopilot,
    removeCustomCopilotModel,
    setupAiCli,
    testCopilotPatStored,
    testCopilotStored,
    validateCopilotPat,
} from "@/lib/tauri/providers";
import { useAiSelectionStore } from "@/stores/aiSelectionStore";
import { ChevronDown, ChevronRight, ExternalLink, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
    MASKED_SENTINEL,
    SectionMessage,
    StatusBadge,
    VerifiedBadge,
    type SectionStatus,
    type TestResult,
} from "./_shared";

/** GitHub Copilot is CLI-delegation-only — there's no public API key path
 *  for third-party clients, and the OAuth flow used by VS Code is
 *  off-limits for distributed apps. The user signs in once via
 *  `copilot login`; Meridian shells out to the binary per call. */
export function CopilotSection({
  isConfigured,
  onSaved,
}: {
  isConfigured: boolean;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<SectionStatus>({
    state: "idle",
    message: "",
  });
  const [testResult, setTestResult] = useState<TestResult>("untested");
  const [enabling, setEnabling] = useState(false);
  const [cliPath, setCliPath] = useState<string | null>(null);
  const [cliError, setCliError] = useState<string | null>(null);
  const [models, setModels] = useState<[string, string][]>([]);
  const [modelsFetchError, setModelsFetchError] = useState<string | null>(null);
  const [customModels, setCustomModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [customModelDraft, setCustomModelDraft] = useState("");
  const [customModelErr, setCustomModelErr] = useState("");
  const [savingCustom, setSavingCustom] = useState(false);
  // PAT-based live model fetching state (independent of CLI delegation —
  // the PAT only powers the model picker; workflows still run via the CLI).
  const [patConfigured, setPatConfigured] = useState(false);
  const [patEditing, setPatEditing] = useState(false);
  const [patValue, setPatValue] = useState("");
  const [showPatInstructions, setShowPatInstructions] = useState(false);

  async function refreshModelLists() {
    const [result, custom] = await Promise.all([
      getCopilotModels(),
      getCustomCopilotModels(),
    ]);
    setModels(result.models);
    setModelsFetchError(result.fetchError);
    setCustomModels(custom);
  }

  useEffect(() => {
    refreshModelLists().catch(() => {});
    getNonSecretConfig()
      .then((cfg) => {
        if (cfg.copilot_model) setSelectedModel(cfg.copilot_model);
      })
      .catch(() => {});
    // The PAT presence isn't returned by getNonSecretConfig (it's a
    // secret), so we infer it from credential_status would-be flag —
    // but that flag doesn't exist for the PAT. Instead, treat any
    // non-null fetchError as "PAT is set but the fetch failed", and
    // a successful live list as "PAT is set and working". Both imply
    // patConfigured = true. An empty fetchError with a hardcoded-looking
    // list (id "auto" first, etc) leaves it false. A simpler signal is
    // the testCopilotPatStored call — if it returns "no PAT", we know.
    void testCopilotPatStored()
      .then(() => setPatConfigured(true))
      .catch(() => setPatConfigured(false));
    void detectCopilotCli()
      .then((p) => {
        setCliPath(p);
        setCliError(null);
      })
      .catch((e) => {
        setCliPath(null);
        setCliError(String(e));
      });
  }, [isConfigured]);

  async function handleAddCustomModel() {
    const id = customModelDraft.trim();
    if (!id) return;
    setSavingCustom(true);
    setCustomModelErr("");
    try {
      const updated = await addCustomCopilotModel(id);
      setCustomModels(updated);
      const refreshed = await getCopilotModels();
      setModels(refreshed.models);
      useAiSelectionStore.getState().invalidateModels("copilot");
      setCustomModelDraft("");
      if (!selectedModel) handleModelChange(id);
    } catch (err) {
      setCustomModelErr(String(err));
    } finally {
      setSavingCustom(false);
    }
  }

  async function handleRemoveCustomModel(id: string) {
    try {
      const updated = await removeCustomCopilotModel(id);
      setCustomModels(updated);
      const refreshed = await getCopilotModels();
      setModels(refreshed.models);
      useAiSelectionStore.getState().invalidateModels("copilot");
      if (selectedModel === id) handleModelChange("");
    } catch (err) {
      setCustomModelErr(String(err));
    }
  }

  async function handleModelChange(modelId: string) {
    setSelectedModel(modelId);
    try {
      await setPreference("copilot_model", modelId);
      void useAiSelectionStore.getState().refreshFromPrefs();
    } catch {
      /* non-critical */
    }
  }

  async function handleEnableDelegation() {
    setEnabling(true);
    setStatus({ state: "loading", message: "Detecting Copilot CLI…" });
    try {
      const msg = await enableCopilotCliDelegation();
      setCliPath(msg.match(/at (\S+)/)?.[1] ?? null);
      setCliError(null);
      setTestResult("success");
      setStatus({ state: "success", message: msg });
      onSaved();
      refreshModelLists().catch(() => {});
    } catch (err) {
      setCliPath(null);
      setCliError(String(err));
      setTestResult("error");
      setStatus({ state: "error", message: String(err) });
    } finally {
      setEnabling(false);
    }
  }

  async function handleSetupInTerminal() {
    setStatus({
      state: "loading",
      message: "Opening terminal to install and sign in to Copilot CLI…",
    });
    try {
      await setupAiCli("copilot");
      setStatus({
        state: "success",
        message:
          "Follow the prompts in your terminal to install and sign in, then click Re-detect CLI here.",
      });
    } catch (err) {
      setStatus({ state: "error", message: String(err) });
    }
  }

  async function handleTestStored() {
    setStatus({ state: "loading", message: "Testing connection…" });
    setTestResult("untested");
    try {
      const msg = await testCopilotStored();
      setTestResult("success");
      setStatus({ state: "success", message: msg });
    } catch (err) {
      setTestResult("error");
      setStatus({ state: "error", message: String(err) });
    }
  }

  async function handlePing() {
    setStatus({ state: "loading", message: "Sending test message…" });
    setTestResult("untested");
    try {
      const msg = await pingCopilot();
      setTestResult("success");
      setStatus({ state: "success", message: msg });
    } catch (err) {
      setTestResult("error");
      setStatus({ state: "error", message: String(err) });
    }
  }

  // ── PAT-based live model fetcher ──────────────────────────────────────────

  function startEditingPat() {
    setPatValue(patConfigured ? MASKED_SENTINEL : "");
    setStatus({ state: "idle", message: "" });
    setPatEditing(true);
  }

  function cancelEditingPat() {
    setPatEditing(false);
    setPatValue("");
    setStatus({ state: "idle", message: "" });
  }

  async function handlePatSave() {
    if (!patValue.trim() || patValue === MASKED_SENTINEL) return;
    setStatus({ state: "loading", message: "Verifying PAT against GitHub…" });
    try {
      const msg = await validateCopilotPat(patValue.trim());
      setPatConfigured(true);
      setPatEditing(false);
      setPatValue("");
      setStatus({ state: "success", message: msg });
      useAiSelectionStore.getState().invalidateModels("copilot");
      refreshModelLists().catch(() => {});
    } catch (err) {
      setStatus({ state: "error", message: String(err) });
    }
  }

  async function handlePatTest() {
    setStatus({ state: "loading", message: "Testing stored PAT…" });
    try {
      const msg = await testCopilotPatStored();
      setStatus({ state: "success", message: msg });
      useAiSelectionStore.getState().invalidateModels("copilot");
      refreshModelLists().catch(() => {});
    } catch (err) {
      setStatus({ state: "error", message: String(err) });
    }
  }

  async function handlePatReset() {
    try {
      await deleteCredential("copilot_github_pat");
      setPatConfigured(false);
      setPatEditing(false);
      setPatValue("");
      setStatus({
        state: "success",
        message:
          "PAT removed. Model list now shows the built-in fallback catalogue.",
      });
      useAiSelectionStore.getState().invalidateModels("copilot");
      refreshModelLists().catch(() => {});
    } catch (err) {
      setStatus({ state: "error", message: String(err) });
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">GitHub Copilot</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Delegates to the locally-installed Copilot CLI — no API key
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <VerifiedBadge result={testResult} />
            <StatusBadge complete={isConfigured} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Delegate to your locally-installed{" "}
            <code className="text-[10px]">@github/copilot</code>. The CLI
            handles auth (sign in once via{" "}
            <code className="text-[10px]">copilot login</code> against your
            GitHub account, or set{" "}
            <code className="text-[10px]">COPILOT_GITHUB_TOKEN</code>) and
            Meridian never sees your credentials — it just spawns{" "}
            <code className="text-[10px]">copilot -p</code> per call.
          </p>
          {cliPath && (
            <p className="text-xs text-green-700 dark:text-green-400">
              ✓ Detected at <code className="text-[10px]">{cliPath}</code>
            </p>
          )}
          {!cliPath && cliError && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              {cliError}
              <br />
              Install with:{" "}
              <code className="text-[10px]">npm install -g @github/copilot</code>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSetupInTerminal}
              disabled={enabling || status.state === "loading"}
              className="gap-1.5"
            >
              {status.state === "loading" ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Opening…
                </>
              ) : cliPath ? (
                "Re-install / re-authenticate"
              ) : (
                "Install & sign in via terminal"
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnableDelegation}
              disabled={enabling || status.state === "loading"}
            >
              {enabling ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking…
                </>
              ) : isConfigured ? (
                "Re-detect CLI"
              ) : (
                "Use Copilot CLI"
              )}
            </Button>
            {isConfigured && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestStored}
                disabled={status.state === "loading"}
              >
                Test
              </Button>
            )}
            {isConfigured && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePing}
                disabled={status.state === "loading"}
              >
                {status.state === "loading" ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> Sending…
                  </>
                ) : (
                  "Send test message"
                )}
              </Button>
            )}
          </div>
        </div>

        <SectionMessage {...status} />

        {/* Optional: GitHub PAT for plan-aware model list. The default
            list is hand-curated; with a PAT we fetch the user's actual
            Copilot subscription catalogue from GitHub's models endpoint. */}
        {isConfigured && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-muted-foreground">
                Plan-aware model list (optional)
              </label>
              {patConfigured && (
                <span className="text-[10px] uppercase tracking-wide text-green-700 dark:text-green-400">
                  Live fetch on
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground -mt-0.5">
              Paste a GitHub fine-grained PAT with the{" "}
              <strong>Copilot Requests</strong> permission to fetch the
              actual model list available on your Copilot subscription
              (instead of the built-in fallback list). The PAT is stored
              in your keychain and only used to query GitHub's models
              endpoint — workflows still run through the CLI.
            </p>

            <button
              type="button"
              onClick={() => setShowPatInstructions((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {showPatInstructions ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              How to create a PAT
            </button>

            {showPatInstructions && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground space-y-1.5">
                <ol className="list-decimal pl-4 space-y-1">
                  <li>
                    Open{" "}
                    <a
                      href="https://github.com/settings/personal-access-tokens/new"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 underline hover:text-foreground"
                    >
                      github.com/settings/personal-access-tokens/new
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </li>
                  <li>
                    <strong>Name:</strong> something like "Meridian Copilot".
                  </li>
                  <li>
                    <strong>Resource owner:</strong> your personal GitHub
                    account (whichever one holds the Copilot subscription).
                  </li>
                  <li>
                    <strong>Expiration:</strong> as long as you like —
                    longer means fewer rotations.
                  </li>
                  <li>
                    <strong>Repository access:</strong> "Public Repositories
                    (read-only)" — Copilot Requests is an account-level
                    permission, so repo access doesn't matter.
                  </li>
                  <li>
                    <strong>Account permissions →</strong> find{" "}
                    <code className="text-[10px]">Copilot Requests</code> and
                    set it to <strong>Read-only</strong>.
                  </li>
                  <li>
                    Click <strong>Generate token</strong>, copy the{" "}
                    <code className="text-[10px]">github_pat_…</code> value,
                    and paste it below.
                  </li>
                </ol>
                <p className="text-[10px] opacity-70">
                  The PAT is revocable from the same Settings page if you
                  ever want to disable Meridian's access.
                </p>
              </div>
            )}

            {!patEditing ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={startEditingPat}>
                  {patConfigured ? "Update PAT" : "Add PAT"}
                </Button>
                {patConfigured && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePatTest}
                    disabled={status.state === "loading"}
                  >
                    {status.state === "loading" ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Testing…
                      </>
                    ) : (
                      "Refresh model list"
                    )}
                  </Button>
                )}
                {patConfigured && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground gap-1"
                    onClick={handlePatReset}
                  >
                    <RotateCcw className="h-3 w-3" /> Remove PAT
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <CredentialField
                  id="settings-copilot-pat"
                  label="GitHub PAT"
                  placeholder="github_pat_…"
                  masked
                  value={patValue}
                  onChange={setPatValue}
                  disabled={status.state === "loading"}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handlePatSave}
                    disabled={
                      !patValue.trim() ||
                      patValue === MASKED_SENTINEL ||
                      status.state === "loading"
                    }
                  >
                    {status.state === "loading" ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Save & verify"
                    )}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={cancelEditingPat}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Model picker — visible when Copilot is configured */}
        {isConfigured && (
          <div className="space-y-1.5 pt-2 border-t">
            <label className="text-xs font-medium text-muted-foreground">
              Default Copilot Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {!selectedModel && <option value="">— select a model —</option>}
              {models.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              {patConfigured
                ? "Showing your plan-specific model list, fetched from GitHub."
                : <>
                    <code>auto</code> lets Copilot pick. Available named models
                    depend on your Copilot plan — add a PAT above to fetch
                    the actual catalogue for your subscription.
                  </>}
            </p>
            {modelsFetchError && (
              <p className="text-[11px] text-amber-600 dark:text-amber-500">
                Couldn't fetch the live model list from GitHub —{" "}
                {modelsFetchError}
              </p>
            )}

            <div className="pt-2 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Custom models
              </label>
              <p className="text-[11px] text-muted-foreground -mt-0.5">
                Add any model id GitHub has wired into the Copilot CLI (e.g. a
                newer GPT or Claude version). Useful when GitHub rolls out a
                model before Meridian's built-in list is updated.
              </p>
              <div className="flex gap-2">
                <Input
                  value={customModelDraft}
                  onChange={(e) => {
                    setCustomModelDraft(e.target.value);
                    if (customModelErr) setCustomModelErr("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomModel();
                    }
                  }}
                  placeholder="model-id…"
                  disabled={savingCustom}
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddCustomModel}
                  disabled={!customModelDraft.trim() || savingCustom}
                >
                  {savingCustom ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Add"
                  )}
                </Button>
              </div>
              {customModelErr && (
                <p className="text-[11px] text-destructive">{customModelErr}</p>
              )}
              {customModels.length > 0 && (
                <ul className="space-y-1 pt-1">
                  {customModels.map((id) => (
                    <li
                      key={id}
                      className="flex items-center justify-between rounded-md border px-2 py-1 text-xs"
                    >
                      <code className="font-mono">{id}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveCustomModel(id)}
                        aria-label={`Remove ${id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
