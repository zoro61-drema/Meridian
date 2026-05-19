import { CredentialField } from "@/components/CredentialField";
import {
  BITBUCKET_SCOPES,
  GITHUB_SCOPES,
  ScopeList,
} from "@/components/ScopeList";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { setPreference } from "@/lib/preferences";
import {
  getNonSecretConfig,
  saveCredential,
} from "@/lib/tauri/credentials";
import {
  testBitbucketStored,
  testGithubStored,
  validateBitbucket,
  validateGithub,
} from "@/lib/tauri/providers";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  MASKED_SENTINEL,
  TOTAL_STEPS,
  ValidationMessage,
  type ValidationState,
} from "./_shared";

type Provider = "bitbucket" | "github";

export function CodeHostingStep({
  onNext,
  onBack,
  stepNum,
}: {
  onNext: () => void;
  onBack: () => void;
  stepNum: number;
}) {
  const [bitbucketSaved, setBitbucketSaved] = useState(false);
  const [githubSaved, setGithubSaved] = useState(false);
  const [expanded, setExpanded] = useState<Provider | null>("bitbucket");

  // Hydrate "already configured" badges from non-secret config. Each card
  // owns its own form state internally; we only need to know whether a
  // provider is connected so the badge + Next-button state are correct
  // even before the user expands a card.
  useEffect(() => {
    getNonSecretConfig()
      .then((config) => {
        if (config["bitbucket_workspace"]) setBitbucketSaved(true);
        if (config["github_username"]) setGithubSaved(true);
      })
      .catch(() => {});
  }, []);

  const anySaved = bitbucketSaved || githubSaved;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-3">
          Step {stepNum} of {TOTAL_STEPS}
        </p>
        <h2 className="text-xl font-semibold">Code hosting</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connect at least one provider so PR Review, Commander, and team
          metrics can read your pull requests. You can configure both — repos
          from either provider show up alongside each other in Meridian.
        </p>
      </div>

      <div className="space-y-2">
        <ProviderCard
          title="Bitbucket"
          blurb="HTTP access token from bitbucket.org → Workspace settings → Access tokens."
          connected={bitbucketSaved}
          expanded={expanded === "bitbucket"}
          onToggleExpand={() =>
            setExpanded(expanded === "bitbucket" ? null : "bitbucket")
          }
        >
          <BitbucketForm
            saved={bitbucketSaved}
            onSaved={() => setBitbucketSaved(true)}
          />
        </ProviderCard>

        <ProviderCard
          title="GitHub"
          blurb="Fine-grained or classic Personal Access Token. Works for github.com and GitHub Enterprise."
          connected={githubSaved}
          expanded={expanded === "github"}
          onToggleExpand={() =>
            setExpanded(expanded === "github" ? null : "github")
          }
        >
          <GithubForm
            saved={githubSaved}
            onSaved={() => setGithubSaved(true)}
          />
        </ProviderCard>
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <Button className="flex-1" onClick={onNext}>
          {anySaved ? "Next" : "Skip for now"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ProviderCard({
  title,
  blurb,
  connected,
  expanded,
  onToggleExpand,
  children,
}: {
  title: string;
  blurb: string;
  connected: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <button
          type="button"
          onClick={onToggleExpand}
          className="w-full flex items-start gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{title}</p>
              {connected ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="h-3 w-3" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <AlertCircle className="h-3 w-3" /> Not connected
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{blurb}</p>
          </div>
        </button>

        {expanded && <div className="pt-1 pl-6">{children}</div>}
      </CardContent>
    </Card>
  );
}

function BitbucketForm({
  saved,
  onSaved,
}: {
  saved: boolean;
  onSaved: () => void;
}) {
  const [workspace, setWorkspace] = useState("");
  const [email, setEmail] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [localSaved, setLocalSaved] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [testState, setTestState] = useState<ValidationState>("idle");
  const [testMessage, setTestMessage] = useState("");

  useEffect(() => {
    getNonSecretConfig()
      .then((config) => {
        if (config["bitbucket_workspace"]) {
          setWorkspace(config["bitbucket_workspace"]);
          setEmail(config["bitbucket_email"] ?? "");
          setAccessToken(MASKED_SENTINEL);
          setLocalSaved(true);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    if (!workspace.trim() || !email.trim() || !accessToken.trim()) return;
    setSaving(true);
    try {
      await saveCredential("bitbucket_workspace", workspace.trim());
      await saveCredential("bitbucket_email", email.trim());
      if (accessToken !== MASKED_SENTINEL) {
        await saveCredential("bitbucket_access_token", accessToken.trim());
      }
      setLocalSaved(true);
      onSaved();
      setTestState("idle");
      setTestMessage("");
    } catch (err) {
      setTestState("error");
      setTestMessage(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTestState("loading");
    setTestMessage("Connecting to Bitbucket…");
    try {
      const msg =
        accessToken === MASKED_SENTINEL
          ? await testBitbucketStored()
          : await validateBitbucket(
              workspace.trim(),
              email.trim(),
              accessToken.trim(),
            );
      setTestState("success");
      setTestMessage(msg);
    } catch (err) {
      setTestState("error");
      setTestMessage(String(err));
    }
  }

  const hasInput = workspace.trim() && email.trim() && accessToken.trim();

  return (
    <div className="space-y-3">
      <ScopeList {...BITBUCKET_SCOPES} />
      <CredentialField
        id="bb-workspace"
        label="Workspace slug"
        placeholder="your-workspace"
        value={workspace}
        onChange={(v) => {
          setWorkspace(v);
          setLocalSaved(false);
        }}
        disabled={saving || testState === "loading"}
        helperText="The slug from your Bitbucket workspace URL"
      />
      <CredentialField
        id="bb-email"
        label="Email"
        placeholder="you@yourcompany.com"
        value={email}
        onChange={(v) => {
          setEmail(v);
          setLocalSaved(false);
        }}
        disabled={saving || testState === "loading"}
        helperText="The email address associated with your Bitbucket account"
      />
      <CredentialField
        id="bb-token"
        label="Access Token"
        placeholder="ATCTT3x…"
        masked
        value={accessToken}
        onChange={(v) => {
          setAccessToken(v);
          setLocalSaved(false);
        }}
        disabled={saving || testState === "loading"}
        helperText={
          localSaved && accessToken === MASKED_SENTINEL
            ? "Token already saved — clear to enter a new one"
            : "Workspace or repository HTTP access token"
        }
      />

      <ValidationMessage state={testState} message={testMessage} />

      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={handleSave}
          disabled={!hasInput || saving}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            "Save credentials"
          )}
        </Button>
        {localSaved && (
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={!hasInput || testState === "loading"}
          >
            {testState === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Test"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function GithubForm({
  saved,
  onSaved,
}: {
  saved: boolean;
  onSaved: () => void;
}) {
  const [pat, setPat] = useState("");
  const [username, setUsername] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [localSaved, setLocalSaved] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [testState, setTestState] = useState<ValidationState>("idle");
  const [testMessage, setTestMessage] = useState("");

  useEffect(() => {
    getNonSecretConfig()
      .then((config) => {
        if (config["github_username"]) {
          setUsername(config["github_username"]);
          setBaseUrl(config["github_base_url"] ?? "");
          setPat(MASKED_SENTINEL);
          setLocalSaved(true);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    if (!pat.trim() || !username.trim()) return;
    setSaving(true);
    try {
      if (pat !== MASKED_SENTINEL) {
        await saveCredential("github_pat", pat.trim());
      }
      await saveCredential("github_username", username.trim());
      // Base URL is a preference (not secret). Persist whatever the user
      // entered, including the empty string — that lets the backend
      // recognise "use api.github.com" without ambiguity.
      await setPreference("github_base_url", baseUrl.trim());
      setLocalSaved(true);
      onSaved();
      setTestState("idle");
      setTestMessage("");
    } catch (err) {
      setTestState("error");
      setTestMessage(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTestState("loading");
    setTestMessage("Connecting to GitHub…");
    try {
      const msg =
        pat === MASKED_SENTINEL
          ? await testGithubStored()
          : await validateGithub(pat.trim(), username.trim(), baseUrl.trim());
      setTestState("success");
      setTestMessage(msg);
    } catch (err) {
      setTestState("error");
      setTestMessage(String(err));
    }
  }

  const hasInput = pat.trim() && username.trim();

  return (
    <div className="space-y-3">
      <ScopeList {...GITHUB_SCOPES} />
      <CredentialField
        id="gh-pat"
        label="Personal Access Token"
        placeholder="github_pat_… or ghp_…"
        masked
        value={pat}
        onChange={(v) => {
          setPat(v);
          setLocalSaved(false);
        }}
        disabled={saving || testState === "loading"}
        helperText={
          localSaved && pat === MASKED_SENTINEL
            ? "Token already saved — clear to enter a new one"
            : "Generate at github.com/settings/tokens — fine-grained or classic"
        }
      />
      <CredentialField
        id="gh-username"
        label="Username"
        placeholder="octocat"
        value={username}
        onChange={(v) => {
          setUsername(v);
          setLocalSaved(false);
        }}
        disabled={saving || testState === "loading"}
        helperText="Your GitHub login — used to filter PRs assigned to you"
      />
      <CredentialField
        id="gh-base-url"
        label="API base URL (enterprise only)"
        placeholder="https://github.yourcompany.com/api/v3"
        value={baseUrl}
        onChange={(v) => {
          setBaseUrl(v);
          setLocalSaved(false);
        }}
        disabled={saving || testState === "loading"}
        helperText="Leave blank for github.com. For GitHub Enterprise, use https://<host>/api/v3."
      />

      <ValidationMessage state={testState} message={testMessage} />

      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={handleSave}
          disabled={!hasInput || saving}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            "Save credentials"
          )}
        </Button>
        {localSaved && (
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={!hasInput || testState === "loading"}
          >
            {testState === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Test"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
