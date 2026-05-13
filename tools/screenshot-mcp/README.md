# meridian-screenshot — tiny MCP server

A minimal Model Context Protocol server that lets Claude Code see
Meridian's running macOS window. After making UI changes in this repo,
Claude can call the `screenshot` tool, get a PNG of the actual Tauri
window back, and verify the change visually — same as a human reviewer
glancing at the screen.

## Tools

- **`screenshot`** — captures the running Meridian window and returns
  a PNG. Optional `navigateTo: <screen-id>` argument jumps to a
  specific screen before capturing.
- **`navigate`** — switches Meridian's main window to a specific
  screen by id (without capturing). Useful when you want to set up the
  UI for a follow-up step.

## How it works

Both tools talk to Meridian's own control server on
`127.0.0.1:31415` (`src-tauri/src/control_server.rs`).

- **Screenshot path**: `GET /window-bounds` returns the main window's
  CGWindowID + screen rect — Tauri reads it directly via
  `NSWindow.windowNumber`. The MCP server then runs `screencapture
  -l <window_id> -t png …` to grab that window's pixels even when
  occluded, without raising focus.
  - On older builds whose control server doesn't return a `window_id`,
    falls back to `screencapture -R x,y,w,h` (region capture).
  - Sidestepping `CGWindowListCopyWindowInfo` matters because on
    macOS 26 that API silently returns an empty list to processes
    that lack a per-binary Screen Recording grant in TCC, even when
    the parent terminal has the grant.
- **Navigation path**: The MCP server POSTs
  `{"screen":"sprint-dashboard"}` to `/navigate`; the Rust handler
  emits a `meridian:navigate` Tauri event; the React app's listener
  switches screens. Loopback-only — no auth needed, only processes
  on the same machine can reach it.

## Setup

From the repo root:

```bash
pnpm mcp:connect
```

That installs this server's deps and registers the two project-scope
MCP servers Meridian uses for development — `meridian-screenshot`
and `chrome-devtools` (the latter is pulled in on demand via `npx`,
no local install needed). See the **MCP servers used while
developing Meridian** section in the repo-root `CLAUDE.md` for what
each does and when to reach for it. `context7` is also useful while
developing Meridian, but it now lives at user scope (installed via
the official Claude Code marketplace as
`context7@claude-plugins-official`) rather than per-project.

For screenshot only: `pnpm mcp:connect:screenshot`.

Restart Claude Code (or `/mcp`) to confirm `meridian-screenshot` is
listed as **connected**.

To remove both: `pnpm mcp:disconnect`.

## Usage

Have Meridian open — `pnpm tauri dev` from the repo root. Then in a
Claude Code session, ask Claude to verify a UI change:

> "Use the screenshot tool to show me the sprint dashboard."

The tool takes no required arguments. Optional `navigateTo: <screen-id>`
jumps to a specific screen first. Valid ids match Meridian's
`Screen` union — see `src-tauri/src/control_server.rs`
(`VALID_SCREENS`) and `src/App.tsx` (`EXTERNAL_NAV_SCREENS`).

## Requirements

- macOS (uses `osascript`, `screencapture`, and CoreGraphics — all
  ship with the OS).
- Node ≥ 18 (the only thing pulled from npm is
  `@modelcontextprotocol/sdk`).
- Meridian must be running and have at least one on-screen window
  when the tool is called.

## Permissions

The first time `screencapture` runs against another app's window,
macOS will prompt for **Screen Recording** permission for the parent
process (typically `node`, but practically your terminal — Terminal,
iTerm, Ghostty, etc.). Approve it once in System Settings →
Privacy & Security → Screen Recording.
