// Command screen UI preferences. One toggle for now — whether the
// emoji state bubble pops above each unit on state transitions.
// Lives under the Appearance section in Settings.

import { Sparkles } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { ToggleRow, useAppPreferencesEditor } from "./_shared";

export function CommandUiSection() {
  const { prefs, error, update } = useAppPreferencesEditor();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          Commander
        </CardTitle>
        <CardDescription className="text-xs mt-0.5">
          Visual tweaks to the Commander tactical field. State badges
          help read what each unit is doing at a glance; turn them off
          for a quieter field.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!prefs ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <ToggleRow
            label="Pop a state badge above each unit"
            helper="Renders an emoji bubble (thinking, tool running, awaiting permission, etc.) above the sprite for ~1s on each state change."
            checked={prefs.commandStateBadgesEnabled}
            onChange={(b) => void update("commandStateBadgesEnabled", b)}
          />
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
