import { CredentialField } from "@/components/CredentialField";
import { Button } from "@/components/ui/button";
import { getPreferences, setPreference } from "@/lib/preferences";
import { validateBaseBranch, validateSourceRepo } from "@/lib/tauri/worktree";
import { ArrowRight, ChevronLeft, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { TOTAL_STEPS, ValidationMessage, type ValidationState } from "./_shared";

const AUTO_SUFFIXES: ReadonlyArray<readonly [string, string]> = [
  ["Implementation", "-meridian-implement"],
  ["PR Review", "-meridian-pr-review"],
  ["Grooming", "-meridian-grooming"],
];

function deriveAutoPath(source: string, suffix: string): string {
  const trimmed = source.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  const lastSlash = trimmed.lastIndexOf("/");
  const parent = lastSlash >= 0 ? trimmed.slice(0, lastSlash) : "";
  const name = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
  return parent ? `${parent}/${name}${suffix}` : `${name}${suffix}`;
}

export function WorktreesStep({
  onNext,
  onBack,
  stepNum,
}: {
  onNext: () => void;
  onBack: () => void;
  stepNum: number;
}) {
  const [sourcePath, setSourcePath] = useState("");
  const [baseBranch, setBaseBranch] = useState("develop");
  const [saving, setSaving] = useState(false);
  const [testState, setTestState] = useState<ValidationState>("idle");
  const [testMessage, setTestMessage] = useState("");

  // Pre-fill if the user has already configured worktrees elsewhere
  // (Settings → Workflows, or a prior wizard run).
  useEffect(() => {
    getPreferences()
      .then((prefs) => {
        if (prefs["repo_source_path"]) {
          setSourcePath(prefs["repo_source_path"]);
        }
        if (prefs["repo_base_branch"]) {
          setBaseBranch(prefs["repo_base_branch"]);
        }
      })
      .catch(() => {});
  }, []);

  // Auto mode: Meridian derives the three sibling worktrees from this
  // source path on demand. Manual paths can still be set later in
  // Settings → Workflows if the user wants per-workflow overrides.
  async function persistPrefs() {
    await setPreference("worktree_mode", "auto");
    await setPreference("repo_source_path", sourcePath.trim());
    await setPreference("repo_base_branch", baseBranch.trim() || "develop");
  }

  async function handleNext() {
    if (saving) return;
    if (!sourcePath.trim()) {
      onNext();
      return;
    }
    setSaving(true);
    try {
      await persistPrefs();
    } finally {
      setSaving(false);
      onNext();
    }
  }

  async function handleTest() {
    if (!sourcePath.trim()) return;
    setTestState("loading");
    setTestMessage("Verifying repo…");
    try {
      // Persist first — the Rust validators read from prefs, so the
      // current input has to be on disk before we ask.
      await persistPrefs();
      const info = await validateSourceRepo();
      // Base branch is best-effort — surface the failure as a hint, not
      // a hard error, because the worktree itself is usable as long as
      // origin/<branch> resolves at first `git worktree add` time.
      let branchSuffix = "";
      try {
        const branchInfo = await validateBaseBranch();
        const presence: string[] = [];
        if (branchInfo.localExists) presence.push("local");
        if (branchInfo.remoteExists) presence.push("remote");
        branchSuffix =
          presence.length > 0
            ? `, base branch ${branchInfo.branch} found (${presence.join(", ")})`
            : `, base branch ${branchInfo.branch} not found locally or on origin`;
      } catch {
        // Leave branchSuffix empty — the source repo passed, that's enough.
      }
      setTestState("success");
      setTestMessage(
        `Repo accessible — branch: ${info.branch}, HEAD: ${info.headCommit}${branchSuffix}`,
      );
    } catch (err) {
      setTestState("error");
      setTestMessage(String(err));
    }
  }

  const hasInput = sourcePath.trim().length > 0;
  const nextLabel = hasInput ? "Next" : "Skip for now";

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-3">
          Step {stepNum} of {TOTAL_STEPS}
        </p>
        <h2 className="text-xl font-semibold">Code worktrees</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Point Meridian at your working git repo. PR Review, Commander, and
          Grooming all read code from per-workflow worktrees — Meridian
          creates them as siblings of the source repo on demand, so no manual
          setup is required.
        </p>
      </div>

      <div className="space-y-3">
        <CredentialField
          id="onb-repo-source"
          label="Source repo path"
          placeholder="/Users/you/REPOS/MyRepo"
          value={sourcePath}
          onChange={(v) => {
            setSourcePath(v);
            setTestState("idle");
            setTestMessage("");
          }}
          disabled={saving || testState === "loading"}
          helperText="Absolute path to your working git repository. Worktrees will be created next to it as needed."
        />
        <CredentialField
          id="onb-repo-base-branch"
          label="Base branch"
          placeholder="develop"
          value={baseBranch}
          onChange={(v) => {
            setBaseBranch(v);
            setTestState("idle");
            setTestMessage("");
          }}
          disabled={saving || testState === "loading"}
          helperText="Branch new worktrees track. Most teams use develop or main."
        />
      </div>

      {hasInput && (
        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground space-y-0.5">
          <p className="font-medium text-foreground">Will create on demand:</p>
          {AUTO_SUFFIXES.map(([label, suffix]) => (
            <p key={suffix} className="font-mono">
              <span className="text-foreground">{label}:</span>{" "}
              {deriveAutoPath(sourcePath, suffix)}
            </p>
          ))}
        </div>
      )}

      <ValidationMessage state={testState} message={testMessage} />

      <div className="flex gap-2">
        <Button variant="ghost" onClick={onBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        {hasInput && (
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testState === "loading" || saving}
          >
            {testState === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Verify"
            )}
          </Button>
        )}
        <Button
          className="flex-1"
          onClick={handleNext}
          disabled={saving || testState === "loading"}
          variant={hasInput ? "default" : "ghost"}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            <>
              {nextLabel} <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
