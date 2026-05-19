import { CredentialField } from "@/components/CredentialField";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { setPreference } from "@/lib/preferences";
import { deleteCredential, getNonSecretConfig } from "@/lib/tauri/credentials";
import { getCatalogModelsForAiProvider } from "@/lib/modelsCatalog";
import {
    detectCodexCli,
    enableCodexCliDelegation,
    pingCodex,
    setupAiCli,
    testCodexStored,
    validateOpenAiApiKey,
} from "@/lib/tauri/providers";
import { cn } from "@/lib/utils";
import { Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import {
    MASKED_SENTINEL,
    SectionMessage,
    StatusBadge,
    VerifiedBadge,
    type SectionStatus,
    type TestResult,
} from "./_shared";

/** Two auth paths since 2026-05-19:
 *   - `api_key`: stored OpenAI API key (sk-…) → sidecar
 *     `OpenAIDirectChatModel` hits api.openai.com directly.
 *   - `codex_cli`: delegate to the user's locally-installed `codex`
 *     binary (uses `codex login` against their ChatGPT account).
 *     Commander's ACP wrapper picks up the API key via an injected
 *     `OPENAI_API_KEY` env var when `api_key` mode is active, so
 *     both Commander units and sidecar workflows honour the choice. */
type AuthMethod = "api_key" | "codex_cli";

export function CodexSection({
  isConfigured,
  onSaved,
}: {
  isConfigured: boolean;
  onSaved: () => void;
}) {
  const [authMethod, setAuthMethod] = useState<AuthMethod>("api_key");
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
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
  const [selectedModel, setSelectedModel] = useState("");

  async function refreshModelList() {
    const result = await getCatalogModelsForAiProvider("codex");
    setModels(result.models);
    setModelsFetchError(result.fetchError);
  }

  useEffect(() => {
    refreshModelList().catch(() => {});
    getNonSecretConfig()
      .then((cfg) => {
        if (cfg.codex_model) setSelectedModel(cfg.codex_model);
        if (cfg.codex_auth_method === "codex_cli") setAuthMethod("codex_cli");
      })
      .catch(() => {});
    void detectCodexCli()
      .then((p) => {
        setCliPath(p);
        setCliError(null);
      })
      .catch((e) => {
        setCliPath(null);
        setCliError(String(e));
      });
  }, []);

  function handleAuthMethodChange(next: AuthMethod) {
    setAuthMethod(next);
    setStatus({ state: "idle", message: "" });
    setTestResult("untested");
  }

  function startEditing() {
    setApiKey(isConfigured ? MASKED_SENTINEL : "");
    setEditing(true);
    setStatus({ state: "idle", message: "" });
    setTestResult("untested");
  }

  function handleCancel() {
    setEditing(false);
    setApiKey("");
    setStatus({ state: "idle", message: "" });
  }

  async function handleSave() {
    if (apiKey === MASKED_SENTINEL) {
      setStatus({
        state: "error",
        message: "Replace the masked value with a new API key, or cancel.",
      });
      return;
    }
    setStatus({ state: "loading", message: "Validating…" });
    setTestResult("untested");
    try {
      const msg = await validateOpenAiApiKey(apiKey);
      setEditing(false);
      setTestResult("success");
      setStatus({ state: "success", message: msg });
      onSaved();
    } catch (err) {
      setTestResult("error");
      setStatus({ state: "error", message: String(err) });
    }
  }

  async function handleReset() {
    if (!confirm("Remove the stored OpenAI API key?")) return;
    try {
      await deleteCredential("openai_api_key");
      setTestResult("untested");
      setStatus({ state: "success", message: "OpenAI API key cleared." });
      onSaved();
    } catch (err) {
      setStatus({ state: "error", message: String(err) });
    }
  }

  async function handleTestStored() {
    setStatus({ state: "loading", message: "Testing connection…" });
    setTestResult("untested");
    try {
      const msg = await testCodexStored();
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
      const msg = await pingCodex();
      setTestResult("success");
      setStatus({ state: "success", message: msg });
    } catch (err) {
      setTestResult("error");
      setStatus({ state: "error", message: String(err) });
    }
  }

  async function handleEnableDelegation() {
    setEnabling(true);
    setStatus({ state: "loading", message: "Detecting Codex CLI…" });
    try {
      const msg = await enableCodexCliDelegation();
      setCliPath(msg.match(/at (\S+)/)?.[1] ?? null);
      setCliError(null);
      setTestResult("success");
      setStatus({ state: "success", message: msg });
      onSaved();
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
      message: "Opening terminal to install and sign in to Codex CLI…",
    });
    try {
      await setupAiCli("codex");
      setStatus({
        state: "success",
        message:
          "Follow the prompts in your terminal to install and sign in, then click Re-detect CLI here.",
      });
    } catch (err) {
      setStatus({ state: "error", message: String(err) });
    }
  }

  async function handleModelChange(modelId: string) {
    setSelectedModel(modelId);
    try {
      await setPreference("codex_model", modelId);
    } catch {
      /* non-critical */
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">OpenAI Codex (ChatGPT)</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              ChatGPT / OpenAI authentication for all AI workflows
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <VerifiedBadge result={testResult} />
            <StatusBadge complete={isConfigured} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Auth method toggle */}
        <div className="flex w-fit overflow-hidden rounded-md border">
          <button
            type="button"
            onClick={() => handleAuthMethodChange("api_key")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              authMethod === "api_key"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            API Key
          </button>
          <button
            type="button"
            onClick={() => handleAuthMethodChange("codex_cli")}
            className={cn(
              "border-l px-3 py-1.5 text-xs font-medium transition-colors",
              authMethod === "codex_cli"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Codex CLI
          </button>
        </div>

        {/* API Key flow */}
        {authMethod === "api_key" &&
          (!editing ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={startEditing}>
                {isConfigured ? "Update key" : "Add key"}
              </Button>
              {isConfigured && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestStored}
                  disabled={status.state === "loading"}
                >
                  {status.state === "loading" ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Testing…
                    </>
                  ) : (
                    "Test connection"
                  )}
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
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Sending…
                    </>
                  ) : (
                    "Send test message"
                  )}
                </Button>
              )}
              {isConfigured && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-muted-foreground"
                  onClick={handleReset}
                >
                  <RotateCcw className="h-3 w-3" /> Reset
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <CredentialField
                id="settings-openai-key"
                label="OpenAI API Key"
                placeholder="sk-…"
                masked
                value={apiKey}
                onChange={(v) => {
                  setApiKey(v);
                  setTestResult("untested");
                }}
                disabled={status.state === "loading"}
              />
              <p className="text-[11px] text-muted-foreground">
                Find or create a key at{" "}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-foreground"
                >
                  platform.openai.com → API keys
                </a>
                . Stored in the macOS keychain; never exposed to the UI.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={
                    !apiKey.trim() ||
                    apiKey === MASKED_SENTINEL ||
                    status.state === "loading"
                  }
                >
                  {status.state === "loading" ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Saving…
                    </>
                  ) : (
                    "Save & verify"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={status.state === "loading"}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ))}

        {/* CLI delegation flow */}
        {authMethod === "codex_cli" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Delegate to your locally-installed{" "}
              <code className="text-[10px]">@openai/codex</code>. Sign in once via{" "}
              <code className="text-[10px]">codex login</code> against your
              ChatGPT account — Meridian never sees your credentials. Used by
              the Commander panel's Codex backend (via{" "}
              <code className="text-[10px]">@zed-industries/codex-acp</code>)
              and by sidecar workflows when this mode is active.
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
                <code className="text-[10px]">npm install -g @openai/codex</code>
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
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Checking…
                  </>
                ) : isConfigured ? (
                  "Re-detect CLI"
                ) : (
                  "Use Codex CLI"
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
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Sending…
                    </>
                  ) : (
                    "Send test message"
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        <SectionMessage {...status} />

        {/* Model picker — visible whenever Codex is configured under
            either auth mode */}
        {isConfigured && (
          <div className="space-y-1.5 border-t pt-2">
            <label className="text-xs font-medium text-muted-foreground">
              Default Codex Model
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
              Catalog pulled from{" "}
              <code className="text-[10px]">models.dev</code>. Used by the
              sidecar OpenAIDirectChatModel adapter (API-key mode) and by
              Commander's Codex backend (via the{" "}
              <code className="text-[10px]">OPENAI_MODEL</code> env var).
              {modelsFetchError && (
                <>
                  <br />
                  <span className="text-amber-600 dark:text-amber-500">
                    Catalog fetch failed: {modelsFetchError}
                  </span>
                </>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
