// Shared chat-bubble primitives used by every conversation panel in
// the app — keeps Plan/Build/Sprint/Groom/Meeting/PR-Review/Address-PR/
// Cross-Meetings looking identical so users learn the pattern once.
//
// Three variants:
//
//   <UserBubble>   — right-aligned, primary tinted, "You" tag.
//   <QueuedBubble> — right-aligned, dashed border, "You · queued" tag,
//                    italic; for messages typed while the agent is busy.
//   <AgentBubble>  — left-aligned, neutral card, "Agent" tag, renders
//                    its body as Markdown so headings/lists/code render
//                    properly. Optional `streaming` flag adds a spinner
//                    next to the "Agent" tag.
//
// Match Plan's design (the canonical reference) and stay flexible enough
// for the other panels' content (string body or arbitrary children for
// streaming previews / tool indicators).

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import type { ReactNode } from "react";

function BubbleHeader({
  label,
  streaming,
  tone,
}: {
  label: string;
  streaming?: boolean;
  /** When set to "amber", the header label takes the amber tint used
   *  by the open-questions callout — keeps "Agent · question for you"
   *  visually consistent with the other "needs your answer" affordances. */
  tone?: "amber";
}) {
  return (
    <p
      className={cn(
        "text-[10px] font-medium uppercase tracking-wide flex items-center gap-1.5",
        tone === "amber"
          ? "text-amber-700 dark:text-amber-300"
          : "text-muted-foreground",
      )}
    >
      {label}
      {streaming && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
    </p>
  );
}

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex w-full justify-end">
      <div className="space-y-1 rounded-md bg-primary/10 px-3 py-2">
        <BubbleHeader label="You" />
        <p className="text-sm whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}

export function QueuedBubble({ text }: { text: string }) {
  return (
    <div className="flex w-full justify-end">
      <div className="space-y-1 rounded-md bg-primary/5 border border-dashed border-primary/30 px-3 py-2 text-foreground/70 italic">
        <p className="not-italic text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          You · queued
        </p>
        <p className="text-sm whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}

export function AgentBubble({
  text,
  streaming,
  children,
  label = "Agent",
}: {
  /** Markdown-formatted body text. Renders ABOVE any `children`
   *  passed in — the two are additive, not mutually exclusive, so
   *  callers can show "agent message + tool list" or "agent message
   *  + custom callout" with one bubble. */
  text?: string;
  streaming?: boolean;
  children?: ReactNode;
  /** Override the tag label. Defaults to "Agent". */
  label?: string;
}) {
  // Tint the bubble amber when the agent is asking the user something
  // so questions stand out in the chat flow. Heuristic: the body
  // contains at least one `?`. Code fences are excluded so a `?` in a
  // code snippet (e.g. an optional TS field type) doesn't false-positive.
  const isQuestion = text != null && containsUserQuestion(text);
  return (
    <div className="flex w-full justify-start">
      <div
        className={cn(
          "space-y-2 rounded-md border px-3 py-2",
          isQuestion
            ? "border-amber-300/60 bg-amber-50/60 dark:border-amber-700/50 dark:bg-amber-950/30"
            : "bg-card/60",
        )}
      >
        <BubbleHeader
          label={isQuestion ? `${label} · question for you` : label}
          streaming={streaming}
          tone={isQuestion ? "amber" : undefined}
        />
        {text != null && text.length > 0 && <MarkdownBlock text={text} />}
        {children}
      </div>
    </div>
  );
}

/** Return true when the rendered text contains a real question for
 *  the user — i.e. a `?` outside of fenced or inline code, where a
 *  question mark could legitimately appear in syntax (`field?: T`,
 *  regex `(\d+)?`, etc.) and would otherwise false-positive. */
function containsUserQuestion(text: string): boolean {
  let stripped = text;
  // Strip fenced code blocks (```…```), tolerating any fence language.
  stripped = stripped.replace(/```[\s\S]*?```/g, "");
  // Strip inline code spans (`…`).
  stripped = stripped.replace(/`[^`\n]*`/g, "");
  return stripped.includes("?");
}

/** Compact "live action" indicator — shown once per tool call and
 *  replaced by the next one (no accumulating list). Same visual
 *  language as the agent bubble but tinted with primary so the eye
 *  picks it out from the conversation flow. */
export function ToolActivityBubble({
  name,
  arg,
}: {
  name: string;
  arg?: string;
}) {
  return (
    <div className="flex w-full justify-start">
      <div
        className={cn(
          "rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5",
          "flex items-center gap-2",
        )}
      >
        <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
        <span className="text-xs font-mono font-medium shrink-0">{name}</span>
        {arg && (
          <span className="text-xs text-muted-foreground/80 truncate font-mono">
            {arg}
          </span>
        )}
      </div>
    </div>
  );
}
