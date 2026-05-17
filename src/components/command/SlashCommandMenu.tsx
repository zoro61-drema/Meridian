// SlashCommandMenu — autocomplete popover for the chat input.
//
// Renders above the chat input when the text starts with `/`.
// Lists slash commands for the current backend, filtered by
// what the user has typed. ↑/↓ navigate, Enter / Tab accept,
// Esc closes. Selecting a command fills the input with
// `/<name> ` (trailing space when the command takes args, none
// otherwise); the user reviews, then presses Send.

import { useEffect, useMemo, useRef } from "react";

import type { SlashCommand } from "@/lib/commandSlashCommands";

interface SlashCommandMenuProps {
  open: boolean;
  commands: SlashCommand[];
  highlight: number;
  onHighlightChange: (index: number) => void;
  onPick: (cmd: SlashCommand) => void;
}

export function SlashCommandMenu({
  open,
  commands,
  highlight,
  onHighlightChange,
  onPick,
}: SlashCommandMenuProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the highlighted row in view as the user arrows through.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[highlight] as HTMLElement | undefined;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  if (!open || commands.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Slash command suggestions"
      className="absolute bottom-full left-0 right-0 z-20 mb-1 overflow-hidden rounded-md border border-white/15 bg-zinc-950/95 shadow-lg backdrop-blur-sm"
    >
      <ul ref={listRef} className="max-h-56 overflow-y-auto py-1">
        {commands.map((c, i) => {
          const active = i === highlight;
          return (
            <li
              key={c.name}
              role="option"
              aria-selected={active}
              onMouseEnter={() => onHighlightChange(i)}
              onMouseDown={(e) => {
                // mouseDown (not click) so the input doesn't lose
                // focus before we apply the selection.
                e.preventDefault();
                onPick(c);
              }}
              className={`flex cursor-pointer items-baseline gap-2 px-2 py-1 text-[11px] ${
                active
                  ? "bg-amber-500/15 text-white"
                  : "text-white/80 hover:bg-white/5"
              }`}
            >
              <span className="font-mono text-amber-200">/{c.name}</span>
              {c.argsHint && (
                <span className="font-mono text-white/40">{c.argsHint}</span>
              )}
              <span className="ml-auto truncate text-[10px] text-white/55">
                {c.description}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Stateful helper that resolves the current command list, the
 *  filtered subset for what the user typed, and the highlight
 *  index — designed to be co-located with the chat input's
 *  state so keyboard handlers can drive it.
 *
 *  Menu closes when:
 *  - text doesn't start with `/`
 *  - text contains whitespace (the user is typing args)
 *  - text is an exact match for a single command — user already
 *    picked one and the next Enter should submit, not autocomplete.
 */
export function useSlashCommandState(
  text: string,
  commands: SlashCommand[],
): {
  open: boolean;
  filtered: SlashCommand[];
  prefix: string | null;
} {
  return useMemo(() => {
    if (!text.startsWith("/")) {
      return { open: false, filtered: [], prefix: null };
    }
    const rest = text.slice(1);
    if (rest.includes(" ") || rest.includes("\n")) {
      return { open: false, filtered: [], prefix: null };
    }
    const lowered = rest.toLowerCase();
    const filtered = commands.filter((c) =>
      c.name.toLowerCase().startsWith(lowered),
    );
    // Exact single-match → user has fully typed a command name.
    // Hide the menu so Enter submits as a normal prompt instead of
    // re-accepting the autocomplete in a loop.
    const isExact =
      filtered.length === 1 &&
      filtered[0]!.name.toLowerCase() === lowered &&
      // Only treat as "done picking" when the command takes no
      // args — if it does, keep the menu visible so the user can
      // see the args hint while typing them.
      !filtered[0]!.argsHint;
    return {
      open: !isExact,
      filtered: filtered.length > 0 ? filtered : commands,
      prefix: rest,
    };
  }, [text, commands]);
}
