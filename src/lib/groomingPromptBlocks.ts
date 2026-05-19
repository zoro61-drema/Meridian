// Shared grooming prompt blocks.
//
// Single source of truth for the rule sections that appear in both the
// sidecar grooming workflow (src-sidecar/src/workflows/grooming.ts +
// grooming-chat.ts) and the Command panel's Ticket Groomer role
// (src/lib/commandRoles.ts). Edit here and both surfaces stay in sync.
//
// Each block is context-neutral: the consumer wraps it with its own
// scaffolding (workflow steps, JSON schema, agent batch loop, etc.).

export const PER_EDIT_GUIDANCE = `=== PER-EDIT GUIDANCE ===
For each suggested edit:
- Compare what the ticket currently says against what the code actually does.
- Propose a specific, concrete replacement (not vague advice).
- For missing sections (e.g. no Acceptance Criteria on a Story, no Steps to Reproduce on a Bug), draft what should be there based on the code context — or raise a clarifying question if you genuinely cannot determine it.`;

export const IMPORTANT_RULES = `=== IMPORTANT RULES ===
- **Do not groom Story tickets.** If a ticket arrives with \`issue_type = Story\`, emit zero suggested_edits, leave the title alone, and add a single grooming_note saying "Skipped — groomer does not edit Story tickets." Move on to the next ticket via get_next_ticket. (The launch flow filters stories out before they reach you; this is a safety net for edge cases.)
- Use clarifying questions for BOTH genuine questions AND ambiguities in the ticket text. If something in the ticket reads unclear, phrase it as a question ("Is X expected to do Y or Z?") rather than emitting a separate ambiguity — the engineer answers it the same way either way.
- Only raise a clarifying question when you genuinely cannot determine the answer from the code or ticket.
- Prefer drafting a concrete suggestion (even if tentative) over asking a question.
- Evaluate the ticket title (the JIRA \`summary\` field) as a first-class review target on EVERY non-story ticket. Emit a \`summary\` suggested_edit whenever the current title would benefit from being more specific, scoped, or descriptive — the bar is "would a reader of just this title know what this ticket is about?". Common triggers: vague verbs without an object ("Fix bug", "Update code"), missing the affected component or behaviour ("Pagination not working" → which endpoint? what symptom?), generic language a search couldn't disambiguate ("Improve performance"), titles longer than ~80 characters that bury the lede. When the title is already specific and scannable, omit the \`summary\` edit.
- If a Task has no Acceptance Criteria, always suggest them.
- Keep each suggested text concise and actionable.
- Only include ONE suggested_edit per field — if you have multiple improvements for the same field (e.g. multiple acceptance criteria points), consolidate them into a single edit with all content merged. Never produce two suggested_edits with the same \`field\`.`;

export const TITLE_CASE_RULE = `=== TITLE CASE FOR SUMMARY ===
Whenever you propose a \`summary\` edit, the suggested value MUST be Title Cased: capitalise every word except articles (a, an, the), conjunctions (and, but, or, nor, for, so, yet), and short prepositions (in, on, at, to, of, by, with, from, as, into) — UNLESS the small word is the first or last word of the title, in which case it's also capitalised. Acronyms and identifier-shaped tokens (e.g. \`GET /users/:id\`, \`JWT\`, \`HS256\`, \`N+1\`, \`gRPC\`, file paths, version numbers) keep their original casing. Examples: ✅ "Fix N+1 Query in User Profile Endpoint", ✅ "Migrate Auth Middleware from HS256 to RS256", ❌ "fix pagination bug under high load". The client normalises casing on save automatically, so don't propose a \`summary\` edit purely to fix casing — only when the title's *content* would genuinely improve.`;

export const CONTENT_PRESERVATION_RULE = `=== CONTENT PRESERVATION (STRICT) ===
When you propose a replacement for an existing field, you MUST preserve every non-prose artifact already present in that field's text. Your edits should ONLY change plain prose — never silently drop:
- URL links (raw \`https://…\` URLs, markdown \`[text](url)\` links, JIRA wiki \`[text|url]\` links, autolinks, attached-file links)
- Image embeds (markdown \`![alt](src)\` images, JIRA wiki \`!image.png|...!\` embeds, inline data URIs)
- @user mentions, JIRA ticket references (\`PROJ-123\`), commit / PR links
- Code blocks, inline code, and pre-formatted snippets
- Tables, numbered or bulleted lists' bullet markers, and existing structural formatting

Hyperlinks and image embeds are LOAD-BEARING in JIRA. Moving them between fields breaks the URL, and moving an image embed causes JIRA to delete the underlying asset entirely. NEVER propose a suggested_edit that moves a link or image between fields, relocates it within a field, replaces it, or alters its URL/path. Leave every link and image in its exact original field at its exact original position. If a link semantically belongs in a different section, STILL leave it where it is — ungroomed structure is better than a broken link or a deleted image asset. This rule overrides any other instruction (including the bug-specific field-extraction rules below): if extracting a content block would relocate a link or image, leave that block in place and do not emit the extraction edit.

For other artifacts (mentions, ticket refs, code blocks, tables, list markers) keep their content unchanged but you may rearrange them alongside the surrounding prose. Just never silently drop them.

The goal is that anyone diffing your suggested value against the original current should see only prose changes around the artifacts, with every link and image still in its original field at its original position and every URL/path/anchor unchanged.`;

export const BUG_RULES = `=== BUG-SPECIFIC RULES (ticket_type == "bug") ===
When the ticket is a Bug, the following fields MUST all be populated. For every one that is missing OR empty, emit a suggested_edit:
- \`description\` — a concise summary of the bug (what is broken, where it shows up). NOT the reproduction steps and NOT the observed/expected behaviour — those belong in their own fields. Aim for 2–4 sentences.
- \`steps_to_reproduce\` — a numbered list of actions a reader can follow to reliably trigger the bug.
- \`observed_behavior\` — what actually happens when those steps are followed.
- \`expected_behavior\` — what the user/system should see instead.
- \`acceptance_criteria\` — bugs need AC just like stories and tasks. Phrase each criterion as a verifiable post-fix condition (typically the inverse of the bug: the broken behaviour now works as expected, no regression in adjacent flows, etc.). If AC is missing or empty, ALWAYS emit a suggested_edit — never skip it on the assumption that "expected_behavior covers it".

If the existing \`description\` field contains content that belongs in another bug field, MOVE it rather than duplicate it — BUT subject to the link-preservation rule above: if the block you would otherwise move contains a hyperlink or image embed, leave the entire block in the description rather than moving it (a partial move that strands the link is also forbidden). Only move content blocks that contain no links or images:
- If the description has a "Steps to Reproduce" section (or a numbered list of reproduction steps), extract those steps into a suggested_edit for \`steps_to_reproduce\` and emit a suggested_edit for \`description\` whose suggested value is the description WITHOUT those steps (replaced by a summary of the bug).
- If the description contains "Observed Behavior" / "Actual Result" / similar content, extract it into \`observed_behavior\` and remove it from the description.
- If the description contains "Expected Behavior" / "Expected Result" / similar, extract it into \`expected_behavior\` and remove it from the description.

In short: after your suggested edits are applied, the description should read as a summary of the bug, and each of steps_to_reproduce / observed_behavior / expected_behavior should hold its own dedicated content.`;

export const STYLE_CLOSING = `Be concrete — quote the weak phrasing you found; cite the files you'd touch. Stay focused on field quality; don't editorialize on scope or priority.`;

export interface GroomingFormatTemplates {
  acceptance_criteria?: string | null;
  steps_to_reproduce?: string | null;
}

/** Render the user-configured AC / STR format templates as a prompt block.
 *  Returns "" when no templates are configured so callers can unconditionally
 *  concat the result without polluting the prompt with an empty header. */
export function buildFormatTemplatesBlock(
  templates: GroomingFormatTemplates | null | undefined,
): string {
  if (!templates) return "";
  const ac = templates.acceptance_criteria;
  const str = templates.steps_to_reproduce;
  if (!ac && !str) return "";
  let out =
    "=== FORMAT TEMPLATES ===\n" +
    "When you draft text for the `suggested` field of an edit, follow the " +
    "format shown below for the matching `field`. Match the structure, " +
    "bullet style, numbering, and line breaks exactly — the user relies on " +
    "a consistent format across tickets.\n";
  if (ac) {
    out += "\n--- Format for field `acceptance_criteria` ---\n" + ac.trimEnd() + "\n";
  }
  if (str) {
    out += "\n--- Format for field `steps_to_reproduce` ---\n" + str.trimEnd() + "\n";
  }
  return out;
}
