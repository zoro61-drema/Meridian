// Per-backend slash command registry.
//
// Surfaces autocomplete suggestions in the chat input so the user
// can discover what each native CLI supports without leaving
// Meridian. We forward the command verbatim through ACP
// session/prompt; whether the wrapper actually handles it depends
// on the wrapper — most CLI slash commands are interactive-REPL
// features that don't pass through headless mode. Lists are
// conservative; expand as we verify which commands round-trip.
//
// Each entry has a name (without leading slash), a one-line
// description, and an optional `args` placeholder string that the
// menu appends so the user knows where their argument goes.

import type { BackendKind } from "@/lib/tauri/command";

export interface SlashCommand {
  name: string;
  description: string;
  /** When set, the menu fills the input with `/<name> ` followed
   *  by this placeholder hint (as a separate visible cue) so the
   *  user knows an argument is expected. */
  argsHint?: string;
}

/** Cold-start fallback for the `/review` prompt — used only when
 *  context7 is unreachable. The runtime path fetches the live copy
 *  from context7 every invocation (see `fetchClaudeReviewPrompt`
 *  below) so the agent always runs the latest published prompt. */
export const CLAUDE_REVIEW_PROMPT_FALLBACK = `Review the code in this repository for:

1. **Code Quality:**
   - Readability and maintainability
   - Consistent style and formatting
   - Appropriate abstraction levels

2. **Potential Issues:**
   - Logic errors or bugs
   - Edge cases not handled
   - Performance concerns

3. **Best Practices:**
   - Design patterns used correctly
   - Error handling present
   - Documentation adequate

Provide specific feedback with file and line references.`;

/** Pull the canonical `/review` prompt from context7 against
 *  `anthropics/claude-code`. The anchors below match the bounds
 *  of the prompt within context7's markdown response — same shape
 *  as the example committed at
 *  `plugins/plugin-dev/skills/command-development/examples/simple-commands.md`
 *  in the claude-code repo.
 *
 *  Returns the prompt verbatim. On any failure (network, anchor
 *  miss, etc.) the caller should fall back to
 *  `CLAUDE_REVIEW_PROMPT_FALLBACK` so /review keeps working
 *  offline. */
export async function fetchClaudeReviewPrompt(): Promise<string> {
  const { commandFetchContext7Prompt } = await import("@/lib/tauri/command");
  return commandFetchContext7Prompt(
    "anthropics/claude-code",
    "/review slash command code review prompt template",
    "Review the code in this repository for:",
    "Provide specific feedback with file and line references.",
  );
}

const CLAUDE_COMMANDS: SlashCommand[] = [
  { name: "clear", description: "Clear the conversation history" },
  { name: "help", description: "Show available commands" },
  { name: "review", description: "Review the recent code changes" },
  { name: "cost", description: "Show current token usage and cost" },
  { name: "compact", description: "Compact the context window" },
  { name: "memory", description: "Manage long-term memory" },
  { name: "agents", description: "List or manage subagents" },
  { name: "model", description: "Switch the active model", argsHint: "<model>" },
  { name: "config", description: "Open Claude Code configuration" },
  { name: "init", description: "Initialise project-level context" },
  { name: "permissions", description: "Manage tool permissions" },
  { name: "add-dir", description: "Allow a directory for tool access", argsHint: "<path>" },
  { name: "resume", description: "Resume a prior session", argsHint: "<id>" },
  { name: "exit", description: "Exit the session" },
];

const CODEX_COMMANDS: SlashCommand[] = [
  { name: "help", description: "Show available commands" },
  { name: "clear", description: "Clear the conversation" },
  { name: "save", description: "Save the current session" },
  { name: "quit", description: "Exit the session" },
];

const GEMINI_COMMANDS: SlashCommand[] = [
  { name: "help", description: "Show available commands" },
  { name: "clear", description: "Clear the conversation" },
  { name: "auth", description: "Re-authenticate" },
  { name: "theme", description: "Change theme" },
  { name: "about", description: "Show about info" },
  { name: "quit", description: "Exit the session" },
];

const QWEN_COMMANDS: SlashCommand[] = [
  { name: "help", description: "Show available commands" },
  { name: "clear", description: "Clear the conversation" },
  { name: "quit", description: "Exit the session" },
];

export const SLASH_COMMANDS_BY_BACKEND: Record<BackendKind, SlashCommand[]> = {
  claudeAcp: CLAUDE_COMMANDS,
  codexAcp: CODEX_COMMANDS,
  geminiAcp: GEMINI_COMMANDS,
  qwenAcp: QWEN_COMMANDS,
};

/** Filter a command list against the user's typed prefix
 *  (anything after the leading `/`, before the first space). */
export function filterSlashCommands(
  commands: SlashCommand[],
  prefix: string,
): SlashCommand[] {
  const p = prefix.toLowerCase();
  if (!p) return commands;
  // Two-tier match: name-prefix first, then substring elsewhere
  // in the name. Description matches come last for breadth.
  const prefixHits: SlashCommand[] = [];
  const substringHits: SlashCommand[] = [];
  const descHits: SlashCommand[] = [];
  for (const c of commands) {
    const n = c.name.toLowerCase();
    if (n.startsWith(p)) prefixHits.push(c);
    else if (n.includes(p)) substringHits.push(c);
    else if (c.description.toLowerCase().includes(p)) descHits.push(c);
  }
  return [...prefixHits, ...substringHits, ...descHits];
}

/** Extract the user's slash command prefix from the current
 *  input text. Returns null when the input isn't a slash command
 *  (no leading `/`, or already has a space — meaning args are
 *  being typed and we shouldn't suggest commands anymore). */
export function extractSlashPrefix(text: string): string | null {
  if (!text.startsWith("/")) return null;
  const rest = text.slice(1);
  if (rest.includes(" ") || rest.includes("\n")) return null;
  return rest;
}
