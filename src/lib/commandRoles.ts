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

const TICKET_GROOMER_PROMPT = `You are a JIRA grooming agent. For the ticket the user names, surface blockers before pickup:
  - Missing acceptance criteria
  - Missing story points
  - Ambiguity in requirements
  - Scope clarity issues
  - Vague titles

Re-read the worktree on demand to ground recommendations in actual code. Be concrete — quote the AC sections you found weak; cite the files you'd touch.`;

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
