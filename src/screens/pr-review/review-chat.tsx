import { MessageSquare } from "lucide-react";
import { ChatWindow } from "@/components/ChatWindow";
import { type SlashCommand } from "@/lib/slashCommands";
import { ToolRequestCard, type ToolRequest } from "@/components/ToolRequestCard";

interface ReviewChatProps {
  reviewChat: { role: "user" | "assistant"; content: string }[];
  reviewChatStreamText: string;
  reviewChatSending: boolean;
  /** Retained for backwards-compatibility with the parent's prior
   *  controlled-input pattern; ChatWindow now manages its own input
   *  state internally so these are unused. */
  reviewChatInput?: string;
  setReviewChatInput?: (s: string) => void;
  onSend: (text: string) => Promise<void>;
  commands: SlashCommand[];
  toolRequests: ToolRequest[];
  onDismissToolRequest: (id: string) => void;
  /** Reserved for the parent's auto-scroll wiring. ChatWindow handles
   *  sticky-bottom internally now, so this is unused but kept to
   *  preserve the parent component's interface. */
  chatBottomRef?: React.RefObject<HTMLDivElement>;
}

export function ReviewChat({
  reviewChat,
  reviewChatStreamText,
  reviewChatSending,
  onSend,
  commands,
  toolRequests,
  onDismissToolRequest,
}: ReviewChatProps) {
  const visibleToolRequests = toolRequests.filter((r) => !r.dismissed);
  return (
    <div className="border-t">
      <ChatWindow
        bare
        headerLabel="Ask the reviewer"
        headerIcon={
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        }
        messages={reviewChat.map((m, i) => ({
          id: i,
          role: m.role === "user" ? "user" : "agent",
          text: m.content,
        }))}
        streamingText={
          reviewChatSending ? reviewChatStreamText || "Thinking…" : null
        }
        onSend={onSend}
        busy={reviewChatSending}
        placeholder="Ask about a finding. Enter to send. / for commands."
        commands={commands}
        emptyState={
          <p className="text-xs text-muted-foreground italic text-center py-2">
            Ask a question about any finding — why it was raised, whether it
            applies given your context, or to reassess something.
          </p>
        }
        afterMessages={
          visibleToolRequests.length > 0 ? (
            <div className="space-y-2">
              {visibleToolRequests.map((r) => (
                <ToolRequestCard
                  key={r.id}
                  request={r}
                  onDismiss={onDismissToolRequest}
                />
              ))}
            </div>
          ) : null
        }
      />
    </div>
  );
}
