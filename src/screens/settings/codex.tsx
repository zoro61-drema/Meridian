import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { setPreference } from "@/lib/preferences";
import { getNonSecretConfig } from "@/lib/tauri/credentials";
import { getCatalogModelsForAiProvider } from "@/lib/modelsCatalog";
import {
    detectCodexCli,
    enableCodexCliDelegation,
    setupAiCli,
    testCodexStored,
} from "@/lib/tauri/providers";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
    SectionMessage,
    StatusBadge,
    VerifiedBadge,
    type SectionStatus,
    type TestResult,
} from "./_shared";

/** OpenAI Codex (`codex` CLI) is CLI-delegation only — same auth
 *  posture as GitHub Copilot. The user runs `codex login` against
 *  their ChatGPT account; Meridian never sees credentials. Codex is
 *  a first-class `AiProvider` — Commander backend AND every sidecar
 *  workflow (PR Review, grooming, retros, etc.). The sidecar adapter
 *  shells out `codex exec --json --yolo`. */
export function CodexSection({
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

  async function handleModelChange(modelId: string) {
    setSelectedModel(modelId);
    try {
      await setPreference("codex_model", modelId);
    } catch {
      /* non-critical */
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">OpenAI Codex (ChatGPT)</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Delegates to the locally-installed Codex CLI — no API key
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
            <code className="text-[10px]">@openai/codex</code>. Sign in once via{" "}
            <code className="text-[10px]">codex login</code> against your
            ChatGPT account — Meridian never sees your credentials. Used by
            the Commander panel's Codex backend (via{" "}
            <code className="text-[10px]">@zed-industries/codex-acp</code>),
            and by every sidecar workflow when you pick Codex as the
            provider in AI Defaults or a per-panel override (sidecar
            shells out <code className="text-[10px]">codex exec --json --yolo</code>).
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
                  <Loader2 className="h-3 w-3 animate-spin" /> Checking…
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
          </div>
        </div>

        <SectionMessage {...status} />

        {/* Model picker — visible when Codex is configured */}
        {isConfigured && (
          <div className="space-y-1.5 pt-2 border-t">
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
              <code className="text-[10px]">models.dev</code>. Set as the
              default in Commander's Launch modal when the Codex backend is
              selected. The codex CLI ultimately decides which model your
              ChatGPT plan can dispatch to.
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
