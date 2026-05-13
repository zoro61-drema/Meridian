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

- **Screenshot path**: JXA + CoreGraphics' `CGWindowListCopyWindowInfo`
  locates Meridian's largest on-screen window. `screencapture
  -l <CGWindowID>` then captures *just that window* (not the whole
  screen), so terminal output and other apps stay out of the image.
- **Navigation path**: Meridian's Rust process runs a tiny HTTP
  server on `127.0.0.1:31415` (see
  `src-tauri/src/control_server.rs`). The MCP server POSTs
  `{"screen":"sprint-dashboard"}` to `/navigate`; the Rust handler
  emits a `meridian:navigate` Tauri event; the React app's listener
  switches screens. Loopback-only — no auth needed, only processes on
  the same machine can reach it.

## Setup

From the repo root:

```bash
pnpm mcp:connect
```

That installs the server's deps and registers it with Claude Code in
one shot — equivalent to `cd tools/screenshot-mcp && pnpm install`
followed by `claude mcp add meridian-screenshot -- node $PWD/tools/screenshot-mcp/server.js`.
Restart Claude Code (or `/mcp`) to confirm `meridian-screenshot` is
listed as **connected**.

To remove: `pnpm mcp:disconnect`.

## Usage

Have Meridian open — `pnpm tauri dev` from the repo root. Then in a
Claude Code session, ask Claude to verify a UI change:

> "Use the screenshot tool to show me the sprint dashboard."

The tool takes no required arguments. Optional `appName` override (for
renamed builds): `{ "appName": "Meridian Dev" }`.

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
