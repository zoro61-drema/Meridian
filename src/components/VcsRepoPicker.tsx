// Reusable repo dropdown shared by the PR Review header and the Commander
// launch modal. Each callsite passes its own `prefKey` so the two surfaces
// keep independent defaults (a change in PR Review does not leak into
// Commander launches, and vice versa).

import { getPreferences, setPreference } from "@/lib/preferences";
import { listVcsRepos, vcsRepoLabel, type VcsRepo } from "@/lib/tauri/vcs";
import { useEffect, useId, useState } from "react";

interface Props {
  /** Preference key the picker reads on mount and writes on change. */
  prefKey: string;
  /** Override the persisted value (controlled mode). When set, `prefKey` is
   *  not written automatically — `onChange` is the only side effect. */
  value?: string | null;
  /** Notified whenever the user picks a repo. Receives the full repo entry
   *  (or null if the placeholder option is chosen). */
  onChange?: (repo: VcsRepo | null) => void;
  /** Visible label above the dropdown. */
  label?: string;
  /** Placeholder text for the "no selection" option. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function VcsRepoPicker({
  prefKey,
  value,
  onChange,
  label,
  placeholder = "Select a repository…",
  disabled,
  className,
}: Props) {
  const [repos, setRepos] = useState<VcsRepo[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const id = useId();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, prefs] = await Promise.all([listVcsRepos(), getPreferences()]);
        if (cancelled) return;
        setRepos(list);
        // Controlled mode wins; otherwise hydrate from the pref. Fall back
        // to the first available repo so the dropdown is never blank when
        // entries exist.
        const stored = value ?? prefs[prefKey] ?? "";
        const initial =
          stored && list.some((r) => r.id === stored)
            ? stored
            : list[0]?.id ?? "";
        setSelected(initial);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefKey, value]);

  async function handleChange(newId: string) {
    setSelected(newId);
    if (value === undefined) {
      // Uncontrolled: persist the choice ourselves.
      await setPreference(prefKey, newId);
    }
    const repo = repos.find((r) => r.id === newId) ?? null;
    onChange?.(repo);
  }

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={id}
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          {label}
        </label>
      )}
      <select
        id={id}
        value={selected}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled || loading || repos.length === 0}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
      >
        {repos.length === 0 ? (
          <option value="">
            {loading ? "Loading…" : "No repositories configured"}
          </option>
        ) : (
          <>
            <option value="" disabled>
              {placeholder}
            </option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                [{r.kind === "github" ? "GH" : "BB"}] {vcsRepoLabel(r)}
              </option>
            ))}
          </>
        )}
      </select>
    </div>
  );
}
