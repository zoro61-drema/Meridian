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
import { deleteCredential, getNonSecretConfig, saveCredential } from "@/lib/tauri/credentials";
import {
    detectClaudeCodeCli,
    enableClaudeCodeDelegation,
    getClaudeModels,
    pingAnthropic,
    setupAiCli,
    testAnthropicStored,
    validateAnthropic,
} from "@/lib/tauri/providers";
import { cn } from "@/lib/utils";
import { useAiSelectionStore } from "@/stores/aiSelectionStore";
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

/** Two auth paths since the 2026-05-10 pivot:
 *   - `api_key`: stored Anthropic API key (sk-ant-api…), used directly via @langchain/anthropic.
 *   - `claude_code`: delegate to the user's locally-installed Claude Code CLI.
 *     The CLI owns auth (Pro/Max OAuth or its own API key); Meridian never
 *     sees credentials. Sidesteps the third-party-impersonation TOS problem
 *     the old Anthropic OAuth flow had. */
type AuthMethod = "api_key" | "claude_code";

export function AnthropicSection({
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
  const [models, setModels] = useState<[string, string][]>([]);
  const [modelsFetchError, setModelsFetchError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  // Claude Code CLI detection — resolved at mount and after switches so the
  // user can see whether delegation will actually work without clicking Test.
  const [cliPath, setCliPath] = useState<string | null>(null);
  const [cliError, setCliError] = useState<string | null>(null);

  useEffect(() => {
    getClaudeModels()
      .then((r) => {
        setModels(r.models);
        setModelsFetchError(r.fetchError);
      })
      .catch(() => {});
    getNonSecretConfig()
      .then((cfg) => {
        if (cfg.claude_model) setSelectedModel(cfg.claude_model);
        if (cfg.claude_auth_method === "claude_code") setAuthMethod("claude_code");
      })
      .catch(() => {});
    // Background probe — surface the CLI path/error even when the user is
    // on the API-key tab so the Claude Code tab doesn't pop a stale state.
    detectClaudeCodeCli()
      .then((p) => {
        setCliPath(p);
        setCliError(null);
      })
      .catch((e) => {
        setCliPath(null);
        setCliError(String(e));
      });
  }, []);

  async function handleModelChange(modelId: string) {
    setSelectedModel(modelId);
    try {
      await setPreference("claude_model", modelId);
      void useAiSelectionStore.getState().refreshFromPrefs();
    } catch {
      /* non-critical */
    }
  }

  async function handleAuthMethodChange(method: AuthMethod) {
    setAuthMethod(method);
    setEditing(false);
    setStatus({ state: "idle", message: "" });
    setTestResult("untested");
    try {
      await saveCredential("claude_auth_method", method);
      onSaved();
    } catch {
      /* non-critical */
    }
  }

  function startEditing() {
    setApiKey(isConfigured ? MASKED_SENTINEL : "");
    setStatus({ state: "idle", message: "" });
    setTestResult("untested");
    setEditing(true);
  }

  async function handleEnableDelegation() {
    setStatus({ state: "loading", message: "Detecting Claude Code CLI…" });
    try {
      const msg = await enableClaudeCodeDelegation();
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
    }
  }

  /** Open the user's terminal app and run the guided install + sign-in
   *  script. The button doesn't switch auth_method itself — after the
   *  user finishes the terminal flow they click "Re-detect CLI" (which
   *  runs handleEnableDelegation) to flip the mode and verify. */
  async function handleSetupInTerminal() {
    setStatus({
      state: "loading",
      message: "Opening terminal to install and sign in to Claude Code…",
    });
    try {
      await setupAiCli("anthropic");
      setStatus({
        state: "success",
        message:
          "Follow the prompts in your terminal to install and sign in, then click Re-detect CLI here.",
      });
    } catch (err) {
      setStatus({ state: "error", message: String(err) });
    }
  }

  async function handleSave() {
    if (!apiKey.trim() || apiKey === MASKED_SENTINEL) return;
    setStatus({ state: "loading", message: "Saving and testing…" });
    try {
      const msg = await validateAnthropic(apiKey.trim());
      const verified = msg.toLowerCase().includes("successfully");
      setTestResult(verified ? "success" : "untested");
      setStatus({ state: "success", message: msg });
      onSaved();
    } catch (err) {
      setTestResult("error");
      setStatus({ state: "error", message: String(err) });
    }
  }

  async function handleTest() {
    setStatus({ state: "loading", message: "Testing connection…" });
    setTestResult("untested");
    try {
      const msg =
        apiKey === MASKED_SENTINEL
          ? await testAnthropicStored()
          : await validateAnthropic(apiKey.trim());
      setTestResult("success");
      setStatus({ state: "success", message: msg });
    } catch (err) {
      setTestResult("error");
      setStatus({ state: "error", message: String(err) });
    }
  }

  async function handleTestStored() {
    setStatus({ state: "loading", message: "Testing connection…" });
    setTestResult("untested");
    try {
      const msg = await testAnthropicStored();
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
      const msg = await pingAnthropic();
      setTestResult("success");
      setStatus({ state: "success", message: msg });
    } catch (err) {
      setTestResult("error");
      setStatus({ state: "error", message: String(err) });
    }
  }

  function handleCancel() {
    setEditing(false);
    setApiKey("");
    setStatus({ state: "idle", message: "" });
  }

  async function handleReset() {
    try {
      await deleteCredential("anthropic_api_key");
      setTestResult("untested");
      onSaved();
    } catch {
      /* fine if not present */
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Anthropic</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Claude authentication for all AI workflows
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
        <div className="flex rounded-md border overflow-hidden w-fit">
          <button
            onClick={() => handleAuthMethodChange("api_key")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              authMethod === "api_key"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            API Key
          </button>
          <button
            onClick={() => handleAuthMethodChange("claude_code")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors border-l",
              authMethod === "claude_code"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            Claude Code CLI
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
                      <Loader2 className="h-3 w-3 animate-spin" /> Testing…
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
                      <Loader2 className="h-3 w-3 animate-spin" /> Sending…
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
                  className="text-muted-foreground gap-1"
                  onClick={handleReset}
                >
                  <RotateCcw className="h-3 w-3" /> Reset
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <CredentialField
                id="settings-anthropic-key"
                label="API Key"
                placeholder="sk-ant-api03-…"
                masked
                value={apiKey}
                onChange={(v) => {
                  setApiKey(v);
                  setTestResult("untested");
                }}
                disabled={status.state === "loading"}
              />
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
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Save key"
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTest}
                  disabled={!apiKey.trim() || status.state === "loading"}
                >
                  Test connection
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          ))}

        {/* Claude Code CLI delegation flow */}
        {authMethod === "claude_code" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Delegate to your locally-installed Claude Code CLI. The CLI handles auth
              (Pro/Max subscription or its own API key) and Meridian never sees your
              credentials — it just spawns <code className="text-[10px]">claude -p</code> per call.
              No third-party OAuth flow.
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
                <code className="text-[10px]">npm install -g @anthropic-ai/claude-code</code>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSetupInTerminal}
                disabled={status.state === "loading"}
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
                disabled={status.state === "loading"}
              >
                {isConfigured ? "Re-detect CLI" : "Use Claude Code CLI"}
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
        )}

        <SectionMessage {...status} />

        {/* Model picker — visible when Anthropic is configured */}
        {isConfigured && models.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t">
            <label className="text-xs font-medium text-muted-foreground">
              Default Claude Model
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
              Used for all AI features. Sonnet is recommended for quality; Haiku
              is faster and lower cost.
            </p>
            {modelsFetchError && (
              <p className="text-[11px] text-amber-600 dark:text-amber-500">
                Showing fallback model list — couldn't fetch the live catalogue
                from Anthropic ({modelsFetchError}). Check your network and re-open
                Settings, or pass any newer model id directly to the CLI via
                preferences.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
