#!/usr/bin/env node
// Tiny MCP server: screenshots Meridian's running macOS window and
// returns the PNG to the calling LLM as an image content block.
//
// Lookup path (no external CLI deps beyond what ships with macOS):
//   1. JXA (`osascript -l JavaScript`) calls CGWindowListCopyWindowInfo
//      and walks the on-screen window list to find the largest window
//      owned by the configured app name (default "Meridian").
//   2. `screencapture -l <CGWindowID> -t png -x` writes that window's
//      pixels to a temp PNG.
//   3. The server reads the PNG, base64-encodes it, and returns it as
//      an MCP `image` content block.
//
// Why only-the-window (not full-screen): a full-screen grab would also
// include the terminal Claude Code is running in plus any other apps —
// noisy context and a real privacy concern. Window-scoped capture
// stays tight.
//
// Register in Claude Code by running, from the repo root:
//   claude mcp add meridian-screenshot \
//     -- node $(pwd)/tools/screenshot-mcp/server.js
// or by adding to ~/.claude/settings.json under `mcpServers`.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const exec = promisify(execFile);

const DEFAULT_APP_NAME = "Meridian";

// JXA program that prints the CGWindowID of the largest on-screen
// window owned by the requested app, or "NOTFOUND" if none. Run via
// `osascript -l JavaScript -e <code>`. Kept as a template so we can
// inject the app name without shell-escaping headaches.
function jxaFindWindowId(appName) {
  // The JXA runtime exposes ObjC bindings out of the box. We use
  // CGWindowListCopyWindowInfo to enumerate every on-screen window
  // (excluding the desktop and dock), then pick the largest one
  // owned by `appName` — Tauri-built apps typically open a single
  // main window, but during DevTools-open sessions there's a second
  // child window; the main one is reliably the largest.
  return `
    ObjC.import('CoreGraphics');
    ObjC.import('Foundation');
    const opts = $.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements;
    const windows = $.CGWindowListCopyWindowInfo(opts, $.kCGNullWindowID);
    const count = windows.count;
    let winID = null;
    let bestArea = 0;
    for (let i = 0; i < count; i++) {
      const w = windows.objectAtIndex(i);
      const owner = ObjC.unwrap(w.objectForKey("kCGWindowOwnerName")) || "";
      if (owner !== ${JSON.stringify(appName)}) continue;
      const bounds = w.objectForKey("kCGWindowBounds");
      if (!bounds) continue;
      const width = ObjC.unwrap(bounds.objectForKey("Width")) || 0;
      const height = ObjC.unwrap(bounds.objectForKey("Height")) || 0;
      const area = width * height;
      if (area > bestArea) {
        bestArea = area;
        winID = ObjC.unwrap(w.objectForKey("kCGWindowNumber"));
      }
    }
    winID === null ? "NOTFOUND" : String(winID);
  `;
}

async function findWindowId(appName) {
  const { stdout } = await exec("osascript", [
    "-l",
    "JavaScript",
    "-e",
    jxaFindWindowId(appName),
  ]);
  const id = stdout.trim();
  if (id === "NOTFOUND" || !/^\d+$/.test(id)) {
    throw new Error(
      `No on-screen window found for app "${appName}". Is Meridian running?`,
    );
  }
  return id;
}

async function captureWindow(windowId) {
  const path = join(tmpdir(), `meridian-screenshot-${randomUUID()}.png`);
  // -l <id>: capture window by CGWindowID
  // -t png:  PNG output
  // -x:      no shutter sound
  // -o:      no window shadow (smaller image, no fuzzy alpha edge)
  await exec("screencapture", ["-l", windowId, "-t", "png", "-x", "-o", path]);
  try {
    const bytes = await readFile(path);
    return bytes.toString("base64");
  } finally {
    // Best-effort cleanup; if it fails the OS will reclaim the tmp file
    // on reboot, no leak that matters.
    unlink(path).catch(() => {});
  }
}

const server = new McpServer({
  name: "meridian-screenshot",
  version: "0.1.0",
});

server.registerTool(
  "screenshot",
  {
    title: "Screenshot Meridian",
    description:
      "Capture a PNG screenshot of the currently-running Meridian " +
      "window on macOS and return it as an image. Use after making UI " +
      "changes to verify them visually. Requires Meridian to be open " +
      "(`pnpm tauri dev` from the repo root).",
    inputSchema: {
      appName: z
        .string()
        .optional()
        .describe(
          "macOS app/process name to look for (defaults to 'Meridian'). " +
            "Override only when running against a renamed build.",
        ),
    },
  },
  async ({ appName }) => {
    const resolvedName = (appName && appName.trim()) || DEFAULT_APP_NAME;
    try {
      const winId = await findWindowId(resolvedName);
      const base64 = await captureWindow(winId);
      return {
        content: [
          {
            type: "image",
            data: base64,
            mimeType: "image/png",
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
