/**
 * Mirrors `CredentialStatus` (which providers/integrations have credentials
 * stored) into a zustand slice so any component can react to changes
 * without prop-drilling.
 *
 * App.tsx is the source of truth — it calls `setStatus` after the initial
 * load and again whenever Settings or Onboarding close (since either may
 * have added or cleared a credential). Components that need to know "is
 * Gemini authenticated?" subscribe via `useCredentialStatusStore`.
 */

import { type CredentialStatus, getCredentialStatus } from "@/lib/tauri/credentials";
import type { AiProvider } from "@/stores/aiSelectionStore";
import { create } from "zustand";

interface State {
  status: CredentialStatus | null;
  setStatus: (status: CredentialStatus | null) => void;
  /** Re-fetch from the Rust backend. Returns the fresh value so callers
   *  that just wrote a credential can branch on the new state without
   *  having to re-read the store after the set. */
  refresh: () => Promise<CredentialStatus | null>;
}

export const useCredentialStatusStore = create<State>((set) => ({
  status: null,
  setStatus: (status) => set({ status }),
  refresh: async () => {
    try {
      const status = await getCredentialStatus();
      set({ status });
      return status;
    } catch {
      return null;
    }
  },
}));

/** Convenience: which AiProvider ids are currently authenticated. Returns
 *  a fresh Set on each call so callers can use it directly in a useMemo
 *  without worrying about reference identity. Used by HeaderModelPicker
 *  and PerPanelAiSection to badge unauthenticated providers. */
export function authenticatedProviders(
  status: CredentialStatus | null,
): Set<AiProvider> {
  const out = new Set<AiProvider>();
  if (!status) return out;
  if (status.anthropicApiKey) out.add("claude");
  if (status.geminiApiKey) out.add("gemini");
  if (status.localLlmUrl) out.add("local");
  if (status.copilotCli) out.add("copilot");
  if (status.codexCli || status.codexApiKey) out.add("codex");
  return out;
}
