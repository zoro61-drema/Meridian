// Repositories settings card. Manages the user's list of configured VCS
// repos — each entry pins a (provider, workspace, slug, base branch,
// display name, optional worktree path) tuple. The PR Review header
// dropdown and the Commander launch modal both populate from this list,
// with independent defaults persisted in their own preference keys.

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  deleteVcsRepo,
  listVcsRepos,
  upsertVcsRepo,
  vcsRepoLabel,
  type VcsKind,
  type VcsRepo,
} from "@/lib/tauri/vcs";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

type FormState = {
  id: string;
  kind: VcsKind;
  workspace: string;
  slug: string;
  baseBranch: string;
  displayName: string;
  worktreePath: string;
};

const EMPTY_FORM: FormState = {
  id: "",
  kind: "bitbucket",
  workspace: "",
  slug: "",
  baseBranch: "develop",
  displayName: "",
  worktreePath: "",
};

export function VcsReposSection() {
  const [repos, setRepos] = useState<VcsRepo[]>([]);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      setRepos(await listVcsRepos());
    } catch (err) {
      setError(String(err));
    }
  }

  function startAdd() {
    setEditing({ ...EMPTY_FORM, id: cryptoRandomId() });
    setError("");
  }

  function startEdit(repo: VcsRepo) {
    setEditing({
      id: repo.id,
      kind: repo.kind,
      workspace: repo.workspace,
      slug: repo.slug,
      baseBranch: repo.baseBranch,
      displayName: repo.displayName,
      worktreePath: repo.worktreePath ?? "",
    });
    setError("");
  }

  async function handleSave() {
    if (!editing) return;
    if (!editing.workspace.trim() || !editing.slug.trim()) {
      setError("Workspace and slug are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const wt = editing.worktreePath.trim();
      const list = await upsertVcsRepo({
        id: editing.id,
        kind: editing.kind,
        workspace: editing.workspace.trim(),
        slug: editing.slug.trim(),
        baseBranch: editing.baseBranch.trim() || "main",
        displayName: editing.displayName.trim(),
        worktreePath: wt ? wt : null,
      });
      setRepos(list);
      setEditing(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(repoId: string) {
    setLoading(true);
    setError("");
    try {
      const list = await deleteVcsRepo(repoId);
      setRepos(list);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Repositories</CardTitle>
        <CardDescription className="text-xs mt-0.5">
          Pin one or more Bitbucket / GitHub repos. PR Review and Commander
          PR roles pick from this list independently.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {repos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No repositories configured yet. Add one to enable PR Review.
          </p>
        ) : (
          <div className="space-y-2">
            {repos.map((repo) => (
              <div
                key={repo.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {vcsRepoLabel(repo)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {repo.kind === "github" ? "GitHub" : "Bitbucket"} ·{" "}
                    {repo.workspace}/{repo.slug} · base{" "}
                    <code className="font-mono">{repo.baseBranch}</code>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => startEdit(repo)}
                    aria-label="Edit repo"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(repo.id)}
                    disabled={loading}
                    aria-label="Delete repo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {editing ? (
          <RepoForm
            value={editing}
            onChange={setEditing}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
            saving={loading}
          />
        ) : (
          <Button variant="outline" size="sm" onClick={startAdd} className="gap-1">
            <Plus className="h-3 w-3" /> Add repository
          </Button>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function RepoForm({
  value,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  value: FormState;
  onChange: (s: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-3 rounded-md border border-dashed border-border p-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="repo-kind" className="text-xs">
            Provider
          </Label>
          <select
            id="repo-kind"
            value={value.kind}
            onChange={(e) =>
              onChange({ ...value, kind: e.target.value as VcsKind })
            }
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="bitbucket">Bitbucket</option>
            <option value="github">GitHub</option>
          </select>
        </div>
        <div>
          <Label htmlFor="repo-base" className="text-xs">
            Default branch
          </Label>
          <Input
            id="repo-base"
            value={value.baseBranch}
            onChange={(e) =>
              onChange({ ...value, baseBranch: e.target.value })
            }
            placeholder={value.kind === "github" ? "main" : "develop"}
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div>
          <Label htmlFor="repo-ws" className="text-xs">
            {value.kind === "github" ? "Owner (org or user)" : "Workspace"}
          </Label>
          <Input
            id="repo-ws"
            value={value.workspace}
            onChange={(e) => onChange({ ...value, workspace: e.target.value })}
            placeholder={value.kind === "github" ? "octocat" : "my-workspace"}
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div>
          <Label htmlFor="repo-slug" className="text-xs">
            Repository
          </Label>
          <Input
            id="repo-slug"
            value={value.slug}
            onChange={(e) => onChange({ ...value, slug: e.target.value })}
            placeholder="my-repo"
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="repo-name" className="text-xs">
            Display name (optional)
          </Label>
          <Input
            id="repo-name"
            value={value.displayName}
            onChange={(e) =>
              onChange({ ...value, displayName: e.target.value })
            }
            placeholder={`${value.workspace}/${value.slug}`}
            className="mt-1 h-8 text-xs"
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="repo-wt" className="text-xs">
            Local worktree path (optional)
          </Label>
          <Input
            id="repo-wt"
            value={value.worktreePath}
            onChange={(e) =>
              onChange({ ...value, worktreePath: e.target.value })
            }
            placeholder="/Users/you/REPOS/my-repo"
            className="mt-1 h-8 text-xs"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `repo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
