import { Button } from "@/components/ui/button";
import {
  detectCopilotCli,
  enableCopilotCliDelegation,
  getCopilotModels,
} from "@/lib/tauri/providers";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ValidationMessage, type ValidationState } from "./_shared";

export function CopilotAuthForm({
  onAuthed,
  onCleared,
}: {
  onAuthed: (suggestedModel?: string) => void;
  onCleared: () => void;
}) {
  const [testState, setTestState] = useState<ValidationState>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [enabling, setEnabling] = useState(false);
  const [cliPath, setCliPath] = useState<string | null>(null);
  const [cliError, setCliError] = useState<string | null>(null);

  useEffect(() => {
    void detectCopilotCli()
      .then((p) => {
        setCliPath(p);
        setCliError(null);
      })
      .catch((e) => {
        setCliPath(null);
        setCliError(String(e));
      });
  }, []);

  async function reportFirstCopilotModel() {
    try {
      const result = await getCopilotModels();
      const first = result.models[0]?.[0];
      onAuthed(first);
    } catch {
      onAuthed();
    }
  }

  async function handleUseCliDelegation() {
    setEnabling(true);
    setTestState("loading");
    setTestMessage("Detecting Copilot CLI…");
    try {
      const msg = await enableCopilotCliDelegation();
      setCliPath(msg.match(/at (\S+)/)?.[1] ?? null);
      setCliError(null);
      setTestState("success");
      setTestMessage(msg);
      await reportFirstCopilotModel();
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

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <div>
          <p className="text-xs font-medium">Use your Copilot CLI install</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Meridian delegates each call to <code className="text-[10px]">copilot -p</code>.
            Sign in once via <code className="text-[10px]">copilot login</code> against
            your GitHub account — Meridian never sees your credentials.
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
            <code className="text-[10px]">npm install -g @github/copilot</code>
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={handleUseCliDelegation}
          disabled={enabling || testState === "loading" || !cliPath}
        >
          {enabling ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
            </>
          ) : (
            "Use Copilot CLI"
          )}
        </Button>
      </div>

      <ValidationMessage state={testState} message={testMessage} />
    </div>
  );
}
