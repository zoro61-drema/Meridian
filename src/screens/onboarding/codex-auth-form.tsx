import { CredentialField } from "@/components/CredentialField";
import { Button } from "@/components/ui/button";
import { getCredentialStatus } from "@/lib/tauri/credentials";
import {
  detectCodexCli,
  enableCodexCliDelegation,
  setupAiCli,
  validateOpenAiApiKey,
} from "@/lib/tauri/providers";
import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  MASKED_SENTINEL,
  ValidationMessage,
  type ValidationState,
} from "./_shared";

/** Onboarding step for OpenAI Codex / ChatGPT. Two paths in one card:
 *   - **Codex CLI delegation** — sign in once via `codex login` against
 *     your ChatGPT account; Meridian shells out per call and never
 *     sees credentials. Used by the Commander panel and (when this
 *     mode is active) by sidecar workflows via the CLI adapter.
 *   - **API key** — paste an OpenAI API key (sk-…); the sidecar's
 *     `OpenAIDirectChatModel` adapter hits api.openai.com directly,
 *     and Commander's ACP wrapper picks the key up via an injected
 *     `OPENAI_API_KEY` env var. */
export function CodexAuthForm({
  onAuthed,
  onCleared,
}: {
  onAuthed: (suggestedModel?: string) => void;
  onCleared: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testState, setTestState] = useState<ValidationState>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [enabling, setEnabling] = useState(false);
  const [openingSetup, setOpeningSetup] = useState(false);
  const [cliPath, setCliPath] = useState<string | null>(null);
  const [cliError, setCliError] = useState<string | null>(null);

  useEffect(() => {
    void getCredentialStatus()
      .then((status) => {
        if (status.codexApiKey) {
          setApiKey(MASKED_SENTINEL);
          setSaved(true);
        }
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

  async function handleUseCliDelegation() {
    setEnabling(true);
    setTestState("loading");
    setTestMessage("Detecting Codex CLI…");
    try {
      const msg = await enableCodexCliDelegation();
      setCliPath(msg.match(/at (\S+)/)?.[1] ?? null);
      setCliError(null);
      setTestState("success");
      setTestMessage(msg);
      // No suggested model — Commander's Launch modal pulls the
      // OpenAI model list from models.dev when the user picks Codex.
      onAuthed();
    } catch (err) {
      setCliPath(null);
      setCliError(String(err));
      setTestState("error");
      setTestMessage(String(err));
      onCleared();
    } finally {
      setEnabling(false);
    }
  }

  async function handleSetupInTerminal() {
    setOpeningSetup(true);
    try {
      await setupAiCli("codex");
    } catch (err) {
      setTestState("error");
      setTestMessage(String(err));
    } finally {
      setOpeningSetup(false);
    }
  }

  async function handleSaveAndTest() {
    if (!apiKey.trim() || apiKey === MASKED_SENTINEL) return;
    setSaving(true);
    setTestState("loading");
    setTestMessage("Saving and testing connection…");
    try {
      const msg = await validateOpenAiApiKey(apiKey.trim());
      setSaved(true);
      setTestState("success");
      setTestMessage(msg);
      onAuthed();
    } catch (err) {
      setTestState("error");
      setTestMessage(String(err));
      onCleared();
    } finally {
      setSaving(false);
    }
  }

  const isNewKey = apiKey !== MASKED_SENTINEL && apiKey.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <div>
          <p className="text-xs font-medium">Use your Codex CLI install</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Meridian's Commander panel delegates each Codex agent to the
            local <code className="text-[10px]">codex</code> binary
            (via <code className="text-[10px]">@zed-industries/codex-acp</code>).
            Sign in once via <code className="text-[10px]">codex login</code>
            {" "}against your ChatGPT account — Meridian never sees your
            credentials.
          </p>
        </div>
        {cliPath && (
          <p className="text-[11px] text-green-700 dark:text-green-400">
            ✓ Detected at <code className="text-[10px]">{cliPath}</code>
          </p>
        )}
        {!cliPath && cliError && (
          <p className="text-[11px] text-amber-600 dark:text-amber-500">
            Not found on PATH. Install with:{" "}
            <code className="text-[10px]">npm install -g @openai/codex</code>
          </p>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-2"
            onClick={handleUseCliDelegation}
            disabled={enabling || testState === "loading" || !cliPath}
          >
            {enabling ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
              </>
            ) : (
              "Use Codex CLI"
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={handleSetupInTerminal}
            disabled={openingSetup}
            title="Open a terminal to install + sign in"
          >
            {openingSetup ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ExternalLink className="h-3.5 w-3.5" />
            )}
            Setup
          </Button>
        </div>
      </div>

      <div className="relative flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[11px] text-muted-foreground shrink-0">
          or use an API key
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <CredentialField
        id="openai-key"
        label="OpenAI API Key"
        placeholder="sk-…"
        masked
        value={apiKey}
        onChange={(v) => {
          setApiKey(v);
          setSaved(false);
          setTestState("idle");
          setTestMessage("");
        }}
        disabled={saving || enabling || testState === "loading"}
        helperText={
          saved && apiKey === MASKED_SENTINEL
            ? "Credential already saved — clear to enter a new one"
            : "API key from platform.openai.com → API keys"
        }
      />

      <ValidationMessage state={testState} message={testMessage} />

      <div className="flex items-center justify-between gap-2">
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Get an API key <ExternalLink className="h-3 w-3" />
        </a>

        <div className="flex gap-2">
          {isNewKey && (
            <Button
              size="sm"
              onClick={handleSaveAndTest}
              disabled={saving || enabling}
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                </>
              ) : (
                "Save key"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
