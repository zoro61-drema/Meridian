import { Button } from "@/components/ui/button";
import {
  detectCodexCli,
  enableCodexCliDelegation,
  setupAiCli,
} from "@/lib/tauri/providers";
import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ValidationMessage, type ValidationState } from "./_shared";

/** Onboarding step for OpenAI Codex CLI delegation.
 *
 *  Codex is CLI-only — same shape as Copilot. The user runs
 *  `codex login` once against their ChatGPT account; Meridian
 *  detects the binary and delegates to it from the Commander
 *  `codexAcp` backend (via the @zed-industries/codex-acp wrapper).
 *  We never see credentials. */
export function CodexAuthForm({
  onAuthed,
  onCleared,
}: {
  onAuthed: (suggestedModel?: string) => void;
  onCleared: () => void;
}) {
  const [testState, setTestState] = useState<ValidationState>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [enabling, setEnabling] = useState(false);
  const [openingSetup, setOpeningSetup] = useState(false);
  const [cliPath, setCliPath] = useState<string | null>(null);
  const [cliError, setCliError] = useState<string | null>(null);

  useEffect(() => {
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

      <ValidationMessage state={testState} message={testMessage} />
    </div>
  );
}
