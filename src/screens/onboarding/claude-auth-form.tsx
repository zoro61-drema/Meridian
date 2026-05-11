import { CredentialField } from "@/components/CredentialField";
import { Button } from "@/components/ui/button";
import { getCredentialStatus } from "@/lib/tauri/credentials";
import {
  detectClaudeCodeCli,
  enableClaudeCodeDelegation,
  getClaudeModels,
  testAnthropicStored,
  validateAnthropic,
} from "@/lib/tauri/providers";
import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { MASKED_SENTINEL, ValidationMessage, type ValidationState } from "./_shared";

export function ClaudeAuthForm({
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
  const [cliPath, setCliPath] = useState<string | null>(null);
  const [cliError, setCliError] = useState<string | null>(null);

  useEffect(() => {
    void getCredentialStatus()
      .then((status) => {
        if (status.anthropicApiKey) {
          setApiKey(MASKED_SENTINEL);
          setSaved(true);
        }
      })
      .catch(() => {});
    void detectClaudeCodeCli()
      .then((p) => {
        setCliPath(p);
        setCliError(null);
      })
      .catch((e) => {
        setCliPath(null);
        setCliError(String(e));
      });
  }, []);

  async function reportFirstClaudeModel() {
    try {
      const result = await getClaudeModels();
      const first = result.models[0]?.[0];
      onAuthed(first);
    } catch {
      onAuthed();
    }
  }

  async function handleUseCliDelegation() {
    setEnabling(true);
    setTestState("loading");
    setTestMessage("Detecting Claude Code CLI…");
    try {
      const msg = await enableClaudeCodeDelegation();
      setCliPath(msg.match(/at (\S+)/)?.[1] ?? null);
      setCliError(null);
      setTestState("success");
      setTestMessage(msg);
      await reportFirstClaudeModel();
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

  async function handleSaveAndTest() {
    if (!apiKey.trim() || apiKey === MASKED_SENTINEL) return;
    setSaving(true);
    setTestState("loading");
    setTestMessage("Saving and testing connection…");
    try {
      const msg = await validateAnthropic(apiKey.trim());
      setSaved(true);
      setTestState("success");
      setTestMessage(msg);
      await reportFirstClaudeModel();
    } catch (err) {
      setTestState("error");
      setTestMessage(String(err));
      onCleared();
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTestState("loading");
    setTestMessage("Testing connection…");
    try {
      const msg = apiKey === MASKED_SENTINEL
        ? await testAnthropicStored()
        : await validateAnthropic(apiKey.trim());
      setTestState("success");
      setTestMessage(msg);
      await reportFirstClaudeModel();
    } catch (err) {
      setTestState("error");
      setTestMessage(String(err));
    }
  }

  const isNewKey = apiKey !== MASKED_SENTINEL && apiKey.trim().length > 0;
  const canTest = !!apiKey.trim();

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-3 space-y-2">
        <div>
          <p className="text-xs font-medium">Use your Claude Code CLI install</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Meridian delegates each call to <code className="text-[10px]">claude -p</code>.
            The CLI handles auth (Pro/Max subscription or its own API key) — Meridian
            never sees your credentials.
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
            <code className="text-[10px]">npm install -g @anthropic-ai/claude-code</code>
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
            "Use Claude Code CLI"
          )}
        </Button>
      </div>

      <div className="relative flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[11px] text-muted-foreground shrink-0">or use an API key</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <CredentialField
        id="anthropic-key"
        label="API Key"
        placeholder="sk-ant-api03-…"
        masked
        value={apiKey}
        onChange={(v) => { setApiKey(v); setSaved(false); setTestState("idle"); setTestMessage(""); }}
        disabled={saving || enabling || testState === "loading"}
        helperText={saved && apiKey === MASKED_SENTINEL ? "Credential already saved — clear to enter a new one" : "API key from platform.claude.com"}
      />

      <ValidationMessage state={testState} message={testMessage} />

      <div className="flex items-center justify-between gap-2">
        <a
          href="https://platform.claude.com/api-keys"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Get an API key <ExternalLink className="h-3 w-3" />
        </a>

        <div className="flex gap-2">
          {isNewKey ? (
            <Button size="sm" onClick={handleSaveAndTest} disabled={saving || enabling}>
              {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : "Save key"}
            </Button>
          ) : saved ? (
            <Button variant="outline" size="sm" onClick={handleTest} disabled={!canTest || enabling || testState === "loading"}>
              {testState === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Test connection"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
