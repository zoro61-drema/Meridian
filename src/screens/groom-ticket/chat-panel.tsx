import { ChatWindow } from "@/components/ChatWindow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type SlashCommand } from "@/lib/slashCommands";
import { type GroomingOutput } from "@/lib/tauri/workflows";
import { PanelRightClose } from "lucide-react";
import { type GroomChatMessage, buildStreamingPreview } from "./_shared";

export function ChatPanel({
  messages,
  thinking,
  probeStatus,
  partialOutput,
  onSend,
  commands,
  onCollapse,
}: {
  messages: GroomChatMessage[];
  thinking: boolean;
  probeStatus: string;
  /** Streaming partial output emitted by the grooming agent while it's
   *  still mid-response. When non-null, the "Thinking…" bubble swaps to
   *  a live preview that grows token-by-token instead of sitting blank. */
  partialOutput: Partial<GroomingOutput> | null;
  onSend: (text: string) => void;
  commands: SlashCommand[];
  /** When provided, renders a collapse button in the header so the user
   *  can hide the chat pane to give the middle column more room. */
  onCollapse?: () => void;
}) {
  const streamingPreview =
    thinking && partialOutput ? buildStreamingPreview(partialOutput) : "";
  const streamingText = thinking
    ? streamingPreview || (probeStatus || "Thinking…")
    : null;

  return (
    <Card className="flex flex-col min-h-0 flex-1">
      <CardHeader className="pb-2 shrink-0 border-b">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold">Grooming Assistant</CardTitle>
            <p className="text-xs text-muted-foreground">
              Ask questions or request field changes — e.g. "update the AC to…"
            </p>
          </div>
          {onCollapse && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={onCollapse}
              title="Hide chat"
              aria-label="Hide chat"
            >
              <PanelRightClose className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 min-h-0 px-0 py-3">
        <ChatWindow
          bare
          headerLabel=""
          messages={messages.map((m, i) => ({
            id: i,
            role: m.role === "assistant" ? "agent" : "user",
            text: m.content,
          }))}
          streamingText={streamingText}
          onSend={onSend}
          busy={thinking}
          placeholder='Ask a question or say "update the AC to…". Enter to send. / for commands.'
          commands={commands}
          emptyState={
            <p className="text-xs text-muted-foreground text-center pt-4 leading-relaxed">
              The assistant will appear here after the initial analysis.
              <br />
              You can ask it to refine any draft field.
            </p>
          }
        />
      </CardContent>
    </Card>
  );
}
