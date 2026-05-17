// Command screen.
//
// Phase 3: real ACP-backed sessions wired end-to-end. The Launch
// buttons in the header invoke the Phase 1 smoke commands to spawn
// claude / gemini ACP children; the listeners file dispatches the
// resulting `command:session:update` events into the store so unit
// state and transcript stay live. Phase 4 will replace the bare
// Launch buttons with a proper roster picker modal and a permission
// UI for `session/request_permission`.

import { ArrowLeft, Archive, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { APP_HEADER_TITLE, WorkflowPanelHeader } from "@/components/appHeaderLayout";
import { ArchiveDrawer } from "@/components/command/ArchiveDrawer";
import { LaunchUnitModal } from "@/components/command/LaunchUnitModal";
import { TacticalField } from "@/components/command/TacticalField";
import { UnitChatPanel } from "@/components/command/UnitChatPanel";
import { Button } from "@/components/ui/button";
import { getPreferences } from "@/lib/preferences";
import { useCommandStore } from "@/stores/command/store";

interface CommandScreenProps {
  onBack: () => void;
}

export function CommandScreen({ onBack }: CommandScreenProps) {
  const units = useCommandStore((s) => s.units);
  const unitList = Object.values(units);
  const total = unitList.length;
  const idle = unitList.filter((u) => u.state === "idle").length;
  const busy = unitList.filter(
    (u) =>
      u.state === "thinking" ||
      u.state === "tool_running" ||
      u.state === "streaming",
  ).length;
  const blocked = unitList.filter(
    (u) => u.state === "awaiting_permission" || u.state === "error",
  ).length;

  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Resolve the project directory from preferences as the launch
  // modal's default. Modal lets the user override per-launch.
  useEffect(() => {
    void getPreferences().then((prefs) => {
      const fromPrefs = [
        prefs.pr_review_repo_dir,
        prefs.repo_source_path,
        prefs.repo_worktree_path,
      ]
        .map((v) => (v ?? "").trim())
        .find((v) => v.length > 0);
      setProjectDir(fromPrefs ?? "~");
    });
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <WorkflowPanelHeader
        barClassName="z-20"
        leading={
          <>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className={`${APP_HEADER_TITLE} leading-none`}>Command</h1>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                Multi-agent tactical field · {projectDir ?? "loading…"}
              </p>
            </div>
          </>
        }
        trailing={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLaunchOpen(true)}
              disabled={!projectDir}
              aria-label="Launch unit"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Launch
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setArchiveOpen(true)}
              aria-label="Open archive"
            >
              <Archive className="mr-1 h-3.5 w-3.5" />
              Archive
            </Button>
          </div>
        }
      />

      {projectDir !== null && (
        <LaunchUnitModal
          open={launchOpen}
          onOpenChange={setLaunchOpen}
          defaultProjectDir={projectDir}
        />
      )}
      <ArchiveDrawer open={archiveOpen} onOpenChange={setArchiveOpen} />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 p-2">
          {unitList.length === 0 ? (
            <EmptyField />
          ) : (
            <TacticalField />
          )}
        </div>
        <aside className="w-96 shrink-0 border-l border-white/10 bg-black/40">
          <UnitChatPanel />
        </aside>
      </div>

      <footer className="flex items-center gap-4 border-t border-white/10 bg-black/50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-white/60">
        <span>{total} unit{total === 1 ? "" : "s"}</span>
        <span>·</span>
        <span>{idle} idle</span>
        <span>·</span>
        <span>{busy} working</span>
        <span>·</span>
        <span>{blocked} blocked</span>
      </footer>
    </div>
  );
}

function EmptyField() {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-dashed border-amber-800/40 bg-black/30 text-sm text-muted-foreground">
      No units deployed. Click <span className="mx-1 font-medium text-foreground">Launch</span> to deploy a unit.
    </div>
  );
}
