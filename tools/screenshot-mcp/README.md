# meridian-screenshot — tiny MCP server

A minimal Model Context Protocol server that lets Claude Code see
Meridian's running macOS window. After making UI changes in this repo,
Claude can call the `screenshot` tool, get a PNG of the actual Tauri
window back, and verify the change visually — same as a human reviewer
glancing at the screen.

## What it does

- Locates Meridian's main on-screen window via macOS's CoreGraphics
  window list (JXA, no extra dependencies).
- Captures *just that window* (not the whole screen) with
  `screencapture -l <CGWindowID>` so terminal output and other apps
  stay out of the screenshot.
- Returns the PNG to the calling LLM as an MCP `image` content block.

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
