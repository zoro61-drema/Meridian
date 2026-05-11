// Workflow dispatch table — assembles every per-workflow runner into the
// `workflows` map keyed by the workflow name the frontend sends in
// `WorkflowStart.workflow`.

import type { WorkflowRunner } from "../types.js";
import { runGrooming } from "./grooming.js";
import { runPrReview } from "./pr-review.js";
import {
  runPrReviewChatWorkflow,
  runGroomingChatWorkflow,
} from "./chats.js";
import {
  runSprintRetrospectiveWorkflow,
  runWorkloadSuggestionsWorkflow,
  runMultiSprintTrendsWorkflow,
  runMeetingSummaryWorkflow,
  runMeetingTitleWorkflow,
  runSprintDashboardChatWorkflow,
  runMeetingChatWorkflow,
  runCrossMeetingsChatWorkflow,
  runGroomingFileProbeWorkflow,
} from "./markdown.js";

export const workflows: Record<string, WorkflowRunner> = {
  grooming: runGrooming,
  pr_review: runPrReview,
  sprint_retrospective: runSprintRetrospectiveWorkflow,
  workload_suggestions: runWorkloadSuggestionsWorkflow,
  multi_sprint_trends: runMultiSprintTrendsWorkflow,
  meeting_summary: runMeetingSummaryWorkflow,
  meeting_title: runMeetingTitleWorkflow,
  sprint_dashboard_chat: runSprintDashboardChatWorkflow,
  meeting_chat: runMeetingChatWorkflow,
  cross_meetings_chat: runCrossMeetingsChatWorkflow,
  pr_review_chat: runPrReviewChatWorkflow,
  grooming_chat: runGroomingChatWorkflow,
  grooming_file_probe: runGroomingFileProbeWorkflow,
};
