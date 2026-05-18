// Role presets for the Command launch modal.
//
// Phase 4: hardcoded TS module. Spec §11 says roles eventually live as
// JSON in `~/.meridian/command/roles/`, editable from a Command Settings
// tab. That filesystem indirection is Phase 4.5+ work; v0 keeps roles
// in code so the launch flow ships without a settings UI.
//
// The role bakes:
//   - Default sprite (from the v0 Infantry trio)
//   - Default backend (Claude unless noted)
//   - A system prompt the launch flow prepends to the user's first
//     turn (see `store.ts::consumeRolePrompt`).
//
// "Custom" is the escape hatch — user supplies their own prompt and
// picks any sprite. No system prompt prepended unless typed in.

import type { BackendKind, SpriteId } from "@/stores/command/store";
import {
  BUG_RULES,
  CONTENT_PRESERVATION_RULE,
  IMPORTANT_RULES,
  PER_EDIT_GUIDANCE,
  STYLE_CLOSING,
  TITLE_CASE_RULE,
  buildFormatTemplatesBlock,
  type GroomingFormatTemplates,
} from "@/lib/groomingPromptBlocks";

export type RoleId =
  | "implementer"
  | "pr-reviewer"
  | "ticket-groomer"
  | "researcher"
  | "custom";

export interface CommandRole {
  id: RoleId;
  title: string;
  description: string;
  defaultSprite: SpriteId;
  defaultBackend: BackendKind;
  /** Prepended to the user's first prompt as a system-prompt-style
   *  prefix. Empty string = no priming. */
  systemPrompt: string;
}

const PR_REVIEWER_PROMPT = `You are a code reviewer operating on the user's worktree. Review changes across five lenses:

  1. Acceptance Criteria Compliance — does the implementation address all AC? Does the PR description match what was built? Return zero findings if criteria are blank.
  2. Security & Vulnerability Analysis — injection (SQL, XSS, path traversal, command), auth/authz issues, sensitive data exposure, insecure dependencies, input validation gaps, cryptographic weaknesses. Cite file + line range for each. Never flag test/spec files.
  3. Logic Error Analysis — off-by-one, race conditions, null/undefined assumptions, swallowed exceptions, inverted conditionals, unexpected state mutations. Cite file + line range for each.
  4. Testing — missing tests for non-trivial business logic, gaps in edge-case coverage, weak assertions. Skip config/build/asset files. For Bug-typed tickets, check that new/modified unit tests carry a @tags <KEY> annotation.
  5. General Code Quality — adherence to codebase patterns, readability, performance, duplicate/redundant code (cite two distinct line labels). Do not flag test framework function choice as inconsistency.

Categorise every finding as Blocking, Non-blocking, or Nitpick. Security and logic findings default to Blocking; testing defaults to Non-blocking unless safety-critical.

Wait for the user to point you at a specific diff before reviewing.`;

const COMMAND_GROOMER_PREAMBLE = `You are a JIRA grooming agent helping a senior engineer \
understand and refine a batch of tickets one at a time. The launch context will give you \
a small header ("Grooming batch — Sprint: …" or "Grooming batch — manual selection") with \
the total count and the list of ticket keys.

Your job is twofold for every ticket:
1. Analyse the ticket and ground it in the actual codebase
2. Identify any gaps, inaccuracies, or missing sections in the ticket and suggest \
concrete improvements`;

const COMMAND_BATCH_WORKFLOW = `=== BATCH WORKFLOW ===
DO NOT WAIT for the user to feed you tickets. As soon as you receive any prompt, \
start grooming:

1. Call the MCP tool \`get_next_ticket\` (no arguments). It returns the next pending \
ticket as a "Ticket N of M" header followed by a markdown block with the key, type, \
status, and current field values for the six fields you can suggest edits to.

2. Read the ticket carefully. Cross-reference with the actual codebase (use your \
Read / Grep / Bash tools) to ground your understanding in real files.

3. Identify weak spots in the following fields ONLY — do NOT propose changes to \
priority, story points, or assignee:
  - description
  - acceptance_criteria
  - steps_to_reproduce
  - observed_behavior
  - expected_behavior
  - summary

4. Call \`submit_grooming_recommendations\` with the ticket key, its summary, type, \
your suggested edits (one per field that needs work — include current value, suggested \
replacement, and a short rationale), any clarifying questions, and grooming notes. If \
the ticket already looks strong, submit with an empty \`suggested_edits\` array and a \
brief \`grooming_notes\` saying so.

5. IMMEDIATELY call \`get_next_ticket\` again to get the next ticket. Do NOT wait for \
user feedback between tickets — the user reviews all submissions later in a separate UI.

6. When \`get_next_ticket\` responds that the queue is empty, stop calling it and send \
a one-paragraph summary of the whole batch (how many tickets, how many had non-trivial \
issues, anything that stood out).`;

/** Base system prompt for the Command Ticket Groomer role. Shared rule blocks
 *  (per-edit guidance, important rules, title-case, content/link preservation,
 *  bug rules, style) live in `src/lib/groomingPromptBlocks.ts` and are used by
 *  both the sidecar grooming workflow and this role — edit there to update
 *  both surfaces. Command-only scaffolding (batch loop, MCP tool names) stays
 *  here. The user's `acceptance_criteria` / `steps_to_reproduce` format
 *  templates are injected per-launch in `composeTicketGroomerPrompt`. */
const TICKET_GROOMER_PROMPT = [
  COMMAND_GROOMER_PREAMBLE,
  COMMAND_BATCH_WORKFLOW,
  PER_EDIT_GUIDANCE,
  IMPORTANT_RULES,
  TITLE_CASE_RULE,
  CONTENT_PRESERVATION_RULE,
  BUG_RULES,
  `=== STYLE ===\n${STYLE_CLOSING}`,
].join("\n\n");

/** Append the user's configured AC / STR format templates to the Ticket
 *  Groomer system prompt at agent launch time. Mirrors what the sidecar
 *  grooming workflow does via `buildSystemPrompt` — so both surfaces honour
 *  the same per-field format the user expects in their tickets. */
export function composeTicketGroomerPrompt(
  basePrompt: string,
  templates: GroomingFormatTemplates | null | undefined,
): string {
  const fmt = buildFormatTemplatesBlock(templates);
  return fmt ? `${basePrompt}\n\n${fmt}` : basePrompt;
}

const RESEARCHER_PROMPT = `You are a research-only agent. Investigate, summarise, and recommend — but do not modify files, run write commands, or commit. If the user asks for a change, describe the change instead of making it and surface what files would need to move.`;

export const COMMAND_ROLES: CommandRole[] = [
  {
    id: "implementer",
    title: "Implementer",
    description: "Freeform engineering, no opinionated prompt",
    defaultSprite: "marine",
    defaultBackend: "claudeAcp",
    systemPrompt: "",
  },
  {
    id: "pr-reviewer",
    title: "PR Reviewer",
    description: "5-lens review (AC, security, logic, testing, quality)",
    defaultSprite: "field-tech",
    defaultBackend: "claudeAcp",
    systemPrompt: PR_REVIEWER_PROMPT,
  },
  {
    id: "ticket-groomer",
    title: "Ticket Groomer",
    description: "Surfaces blockers on a JIRA ticket before pickup",
    defaultSprite: "engineer",
    defaultBackend: "claudeAcp",
    systemPrompt: TICKET_GROOMER_PROMPT,
  },
  {
    id: "researcher",
    title: "Researcher",
    description: "Read-only analysis — no file writes",
    defaultSprite: "field-tech",
    defaultBackend: "claudeAcp",
    systemPrompt: RESEARCHER_PROMPT,
  },
  {
    id: "custom",
    title: "Custom",
    description: "Bring your own prompt + sprite",
    defaultSprite: "marine",
    defaultBackend: "claudeAcp",
    systemPrompt: "",
  },
];

export function roleById(id: RoleId): CommandRole {
  return COMMAND_ROLES.find((r) => r.id === id) ?? COMMAND_ROLES[0];
}


/** Compute the system prompt actually used at launch:
 *  1. If the user overrode the role's prompt in Settings, use that.
 *  2. Otherwise fall back to the role's static default.
 *  3. Append every selected skill body (separated by ---), so the
 *     final prompt is `<base>\n\n---\n\nSkill: <id>\n\n<body>` etc.
 *
 *  Empty when the role has no base prompt and no skills attached
 *  — caller treats that as "no priming". */
export function effectiveRolePrompt(
  roleId: RoleId,
  overrides: Record<string, string>,
  selectedSkillIds: string[],
  skillsById: Record<string, string>,
  /** Optional grooming format templates. When `roleId === "ticket-groomer"`
   *  the user's AC / STR templates get appended to the base prompt so the
   *  agent honours the same per-field format the sidecar grooming workflow
   *  uses. Ignored for other roles. Pass null/undefined to skip. */
  groomingTemplates?: GroomingFormatTemplates | null,
): string {
  const role = roleById(roleId);
  const override = overrides[roleId];
  let base =
    typeof override === "string" && override.length > 0
      ? override
      : role.systemPrompt;
  if (roleId === "ticket-groomer") {
    base = composeTicketGroomerPrompt(base, groomingTemplates ?? null);
  }
  const skillBlocks = selectedSkillIds
    .map((id) => {
      const body = skillsById[id];
      return body ? `Skill: ${id}\n\n${body}` : null;
    })
    .filter((b): b is string => b !== null);
  if (skillBlocks.length === 0) return base;
  if (!base) return skillBlocks.join("\n\n---\n\n");
  return `${base}\n\n---\n\n${skillBlocks.join("\n\n---\n\n")}`;
}
