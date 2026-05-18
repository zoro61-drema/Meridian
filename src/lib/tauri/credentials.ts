import { invoke } from "@tauri-apps/api/core";
import { isMockMode, isMockClaudeMode } from "./core";

// ── Credential / config status ────────────────────────────────────────────────

export interface CredentialStatus {
  anthropicApiKey: boolean;
  geminiApiKey: boolean;
  /** True when the user has enabled GitHub Copilot CLI delegation
   *  (`copilot_auth_method=copilot_cli`). Copilot has no API-key path. */
  copilotCli: boolean;
  /** True when the user has enabled Codex CLI delegation
   *  (`codex_auth_method=codex_cli`). Codex is CLI-only — used by
   *  the Commander panel's `codexAcp` backend. */
  codexCli: boolean;
  localLlmUrl: boolean;
  jiraBaseUrl: boolean;
  jiraEmail: boolean;
  jiraApiToken: boolean;
  jiraBoardId: boolean;
  bitbucketWorkspace: boolean;
  bitbucketEmail: boolean;
  bitbucketAccessToken: boolean;
  bitbucketRepoSlug: boolean;
}

export function credentialStatusComplete(s: CredentialStatus) {
  return (
    s.jiraBaseUrl &&
    s.jiraEmail &&
    s.jiraApiToken &&
    s.jiraBoardId &&
    s.bitbucketWorkspace &&
    s.bitbucketEmail &&
    s.bitbucketAccessToken &&
    s.bitbucketRepoSlug
  );
}

export function anthropicComplete(s: CredentialStatus) {
  return s.anthropicApiKey;
}

export function copilotComplete(s: CredentialStatus) {
  return s.copilotCli;
}

export function codexComplete(s: CredentialStatus) {
  return s.codexCli;
}

/** True when at least one AI provider (Anthropic, Gemini, Copilot, or local LLM) is configured. */
export function aiProviderComplete(s: CredentialStatus) {
  return s.anthropicApiKey || s.geminiApiKey || s.copilotCli || s.localLlmUrl;
}

/** All three auth credentials are present (board ID not required). */
export function jiraCredentialsSet(s: CredentialStatus) {
  return s.jiraBaseUrl && s.jiraEmail && s.jiraApiToken;
}

/** All three auth credentials are present (repo slug not required). */
export function bitbucketCredentialsSet(s: CredentialStatus) {
  return s.bitbucketWorkspace && s.bitbucketEmail && s.bitbucketAccessToken;
}

/** Fully ready: credentials + board ID configured. */
export function jiraComplete(s: CredentialStatus) {
  return s.jiraBaseUrl && s.jiraEmail && s.jiraApiToken && s.jiraBoardId;
}

/** Fully ready: credentials + repo slug configured. */
export function bitbucketComplete(s: CredentialStatus) {
  return (
    s.bitbucketWorkspace &&
    s.bitbucketEmail &&
    s.bitbucketAccessToken &&
    s.bitbucketRepoSlug
  );
}

// ── Credential commands ───────────────────────────────────────────────────────

/** All-false default used as the starting status when the underlying
 *  Tauri invoke fails — happens only when the app is loaded from the
 *  vite dev URL in a plain browser (e.g. chrome-devtools UI inspection).
 *  Mock overlays below fill in whichever surfaces the user has opted
 *  into. In a real Tauri runtime the invoke always succeeds, so this
 *  fallback is never reached. */
const EMPTY_STATUS: CredentialStatus = {
  anthropicApiKey: false,
  geminiApiKey: false,
  copilotCli: false,
  codexCli: false,
  localLlmUrl: false,
  jiraBaseUrl: false,
  jiraEmail: false,
  jiraApiToken: false,
  jiraBoardId: false,
  bitbucketWorkspace: false,
  bitbucketEmail: false,
  bitbucketAccessToken: false,
  bitbucketRepoSlug: false,
};

export async function getCredentialStatus(): Promise<CredentialStatus> {
  let status: CredentialStatus;
  try {
    status = await invoke<CredentialStatus>("credential_status");
  } catch {
    status = EMPTY_STATUS;
  }
  let merged: CredentialStatus = { ...status };
  if (isMockMode()) {
    merged = {
      ...merged,
      jiraBaseUrl: true,
      jiraEmail: true,
      jiraApiToken: true,
      jiraBoardId: true,
      bitbucketWorkspace: true,
      bitbucketEmail: true,
      bitbucketAccessToken: true,
      bitbucketRepoSlug: true,
    };
  }
  if (isMockClaudeMode()) {
    merged = {
      ...merged,
      anthropicApiKey: true,
    };
  }
  return merged;
}

export async function saveCredential(
  key: string,
  value: string,
): Promise<void> {
  return invoke("save_credential", { key, value });
}

export async function deleteCredential(key: string): Promise<void> {
  return invoke("delete_credential", { key });
}

/** Returns non-secret stored config values (URLs, email, workspace slug) for UI display. */
export async function getNonSecretConfig(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("get_non_secret_config");
}
