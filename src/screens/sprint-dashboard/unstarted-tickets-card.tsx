import { JiraTicketLink } from "@/components/JiraTicketLink";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type JiraIssue } from "@/lib/tauri/jira";
import { statusCategory } from "./_shared";

/** Tickets in the sprint that haven't been started yet (statusCategory ===
 *  "todo"). Useful pair with the Team Performance card's Underloaded
 *  badges — devs that are running out of work are obvious candidates to
 *  pick up something from this list. */
export function UnstartedTicketsCard({ issues }: { issues: JiraIssue[] }) {
  const unstarted = issues.filter((i) => statusCategory(i) === "todo");
  if (unstarted.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          Unstarted tickets ({unstarted.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {unstarted.map((t) => (
          <div key={t.key} className="flex items-center gap-2 text-xs min-w-0">
            <JiraTicketLink ticketKey={t.key} url={t.url} />
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate min-w-0 flex-1">{t.summary}</span>
              </TooltipTrigger>
              <TooltipContent>{t.summary}</TooltipContent>
            </Tooltip>
            {t.storyPoints != null && (
              <span className="text-muted-foreground/60 shrink-0">
                {t.storyPoints}pt
              </span>
            )}
            <span className="text-muted-foreground/60 shrink-0 text-[10px]">
              {t.status}
            </span>
            <span className="text-muted-foreground shrink-0">
              {t.assignee?.displayName ?? "Unassigned"}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
