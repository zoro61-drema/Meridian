// Command screen UI + Bug Hunter preferences. Lives under the
// Appearance section in Settings.

import { Plus, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BugFilingBoard } from "@/lib/appPreferences";
import { IDES } from "@/lib/ideLauncher";

import { ToggleRow, useAppPreferencesEditor } from "./_shared";

export function CommandUiSection() {
  const { prefs, error, update } = useAppPreferencesEditor();

  const boards = prefs?.commandBugFilingBoards ?? [];
  const setBoards = (next: BugFilingBoard[]) =>
    void update("commandBugFilingBoards", next);

  const updateBoardField = (
    idx: number,
    field: keyof BugFilingBoard,
    value: string,
  ) => {
    setBoards(
      boards.map((b, i) => (i === idx ? { ...b, [field]: value } : b)),
    );
  };
  const addBoard = () =>
    setBoards([...boards, { name: "", projectKey: "" }]);
  const removeBoard = (idx: number) =>
    setBoards(boards.filter((_, i) => i !== idx));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          Commander
        </CardTitle>
        <CardDescription className="text-xs mt-0.5">
          Visual tweaks to the Commander tactical field and routing for
          Bug Hunter reports.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!prefs ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <>
            <ToggleRow
              label="Pop a state badge above each unit"
              helper="Renders an emoji bubble (thinking, tool running, awaiting permission, etc.) above the sprite for ~1s on each state change."
              checked={prefs.commandStateBadgesEnabled}
              onChange={(b) => void update("commandStateBadgesEnabled", b)}
            />

            <div className="space-y-1">
              <Label className="text-sm font-medium">Preferred IDE</Label>
              <select
                value={prefs.preferredIdeId}
                onChange={(e) =>
                  void update("preferredIdeId", e.target.value)
                }
                className="h-8 w-48 rounded border border-input bg-background px-2 text-sm focus:border-ring focus:outline-none"
              >
                {IDES.map((ide) => (
                  <option key={ide.id} value={ide.id}>
                    {ide.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Used by "Open in IDE" buttons across the Bugs, My PRs,
                and Reviewed PRs tabs. Editor URL handlers must be
                registered on this machine (installing the IDE
                usually does it).
              </p>
            </div>

            <div className="space-y-2">
              <div>
                <Label className="text-sm font-medium">
                  Bug filing boards
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Named JIRA destinations for the Bugs tab's "Open JIRA"
                  button. The dropdown there will list these by name; the
                  selected board's project key lands in the create-issue
                  URL. May differ from your sprint board under
                  Integrations. Leave the list empty to skip the dropdown
                  and rely on Copy-as-JIRA instead.
                </p>
              </div>

              <div className="space-y-1.5">
                {boards.map((board, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <Input
                      type="text"
                      value={board.name}
                      placeholder="Name (e.g. Platform Bugs)"
                      onChange={(e) =>
                        updateBoardField(idx, "name", e.target.value)
                      }
                      className="h-8 flex-1 text-sm"
                    />
                    <Input
                      type="text"
                      value={board.projectKey}
                      placeholder="Project key (e.g. PROJ)"
                      onChange={(e) =>
                        updateBoardField(idx, "projectKey", e.target.value)
                      }
                      className="h-8 w-32 font-mono text-sm uppercase"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 shrink-0 p-0 text-red-300/80 hover:bg-red-950/40 hover:text-red-200"
                      onClick={() => removeBoard(idx)}
                      title="Remove this board"
                      aria-label="Remove board"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={addBoard}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add board
                </Button>
              </div>
            </div>
          </>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
