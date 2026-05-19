// GitHub credentials settings card. Mirrors the Bitbucket section's shape
// so the two providers feel symmetrical in Settings.

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
import {
  deleteCredential,
  getNonSecretConfig,
  saveCredential,
} from "@/lib/tauri/credentials";
import { Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  MASKED_SENTINEL,
  SectionMessage,
  type SectionStatus,
  StatusBadge,
} from "./_shared";

const GH_PAT_KEY = "github_pat";
const GH_USERNAME_KEY = "github_username";
const GH_BASE_URL_KEY = "github_base_url";

export function GithubSection({
  isConfigured,
  onSaved,
}: {
  isConfigured: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pat, setPat] = useState("");
  const [username, setUsername] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [status, setStatus] = useState<SectionStatus>({
    state: "idle",
    message: "",
  });
  const [saving, setSaving] = useState(false);

  async function startEditing() {
    try {
      const config = await getNonSecretConfig();
      setUsername(config[GH_USERNAME_KEY] ?? "");
      setBaseUrl(config[GH_BASE_URL_KEY] ?? "");
      setPat(isConfigured ? MASKED_SENTINEL : "");
    } catch {
      setUsername("");
      setBaseUrl("");
      setPat("");
    }
    setStatus({ state: "idle", message: "" });
    setEditing(true);
  }

  async function handleSave() {
    if (!pat.trim() || !username.trim()) return;
    setSaving(true);
    setStatus({ state: "loading", message: "Saving…" });
    try {
      if (pat !== MASKED_SENTINEL) {
        await saveCredential(GH_PAT_KEY, pat.trim());
      }
      await saveCredential(GH_USERNAME_KEY, username.trim());
      // Base URL is optional — only store it if the user filled it in,
      // otherwise the backend uses api.github.com.
      const url = baseUrl.trim();
      if (url) {
        await setPreference(GH_BASE_URL_KEY, url);
      } else {
        await setPreference(GH_BASE_URL_KEY, "");
      }
      setStatus({ state: "success", message: "Credentials saved." });
      setEditing(false);
      onSaved();
    } catch (err) {
      setStatus({ state: "error", message: String(err) });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    for (const key of [GH_PAT_KEY, GH_USERNAME_KEY]) {
      try {
        await deleteCredential(key);
      } catch {
        /* already gone */
      }
    }
    await setPreference(GH_BASE_URL_KEY, "");
    onSaved();
  }

  function handleCancel() {
    setEditing(false);
    setPat("");
    setUsername("");
    setBaseUrl("");
    setStatus({ state: "idle", message: "" });
  }

  const canSave = !!(pat.trim() && username.trim());

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">GitHub</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              PR reviews and metrics for GitHub-hosted repos
            </CardDescription>
          </div>
          <StatusBadge complete={isConfigured} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!editing ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={startEditing}>
              {isConfigured ? "Update credentials" : "Add credentials"}
            </Button>
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
              id="s-gh-pat"
              label="Personal Access Token"
              placeholder="github_pat_… or ghp_…"
              masked
              value={pat}
              onChange={setPat}
              disabled={saving}
              helperText={
                isConfigured && pat === MASKED_SENTINEL
                  ? "Token already saved — clear to enter a new one"
                  : "Fine-grained or classic PAT with repo + read:user scopes. Generate at github.com/settings/tokens."
              }
            />
            <CredentialField
              id="s-gh-user"
              label="Username"
              placeholder="octocat"
              value={username}
              onChange={setUsername}
              disabled={saving}
              helperText="Your GitHub login — used to filter PRs assigned to you."
            />
            <CredentialField
              id="s-gh-base"
              label="Base URL (enterprise only)"
              placeholder="https://api.github.com"
              value={baseUrl}
              onChange={setBaseUrl}
              disabled={saving}
              helperText="Leave blank for github.com. For GitHub Enterprise, use https://<host>/api/v3."
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!canSave || saving}
              >
                {saving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Save credentials"
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        <SectionMessage {...status} />
      </CardContent>
    </Card>
  );
}
