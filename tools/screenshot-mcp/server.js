#!/usr/bin/env node
// Tiny MCP server: screenshots Meridian's running macOS window and
// returns the PNG to the calling LLM as an image content block.
//
// Capture path (no external CLI deps beyond what ships with macOS):
//   1. GET /window-bounds on Meridian's control server → main window's
//      CGWindowID plus its screen rect in logical points.
//   2. `screencapture -l <windowId> -t png -x` writes that window's
//      pixels to a temp PNG (window content, not screen region — so
//      occluding apps don't show up, and we never have to raise focus
//      away from whatever the user was just in).
//   3. If the control server didn't return a windowId (e.g. running
//      against an old build), fall back to `screencapture -R x,y,w,h`.
//   4. The server reads the PNG, base64-encodes it, and returns it as
//      an MCP `image` content block.
//
// Why bounds-from-Tauri rather than CGWindowList: macOS 26 silently
// returns an empty window list to processes that lack a per-binary
// Screen Recording grant in TCC, even when the parent terminal has it.
// `screencapture` itself works fine via inheritance, so we just need
// the windowId/rect from a source we already own — Meridian itself.
//
// Why window-scoped (not full-screen): a full-screen grab would also
// include the terminal Claude Code is running in plus any other apps —
// noisy context and a real privacy concern.
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

const CONTROL_SERVER_URL = "http://127.0.0.1:31415";

/** Screen ids the running Meridian app accepts for programmatic
 *  navigation. Mirrors VALID_SCREENS in control_server.rs and
 *  EXTERNAL_NAV_SCREENS in App.tsx. Kept here so the tool's input
 *  schema can advertise the closed set to the calling LLM. */
const NAV_SCREENS = [
  "landing",
  "onboarding",
  "settings",
  "agent-skills",
  "review-pr",
  "sprint-dashboard",
  "retrospectives",
  "ticket-quality",
  "meetings",
  "time-tracking",
];

/** GET /window-bounds on Meridian's control server. Returns the main
 *  window's screen rect in logical points (matches `screencapture -R`
 *  coordinate units). Throws with the same "is Meridian running?" hint
 *  navigateApp uses, so the LLM gets a consistent signal. */
async function fetchWindowBounds() {
  let response;
  try {
    response = await fetch(`${CONTROL_SERVER_URL}/window-bounds`);
  } catch (err) {
    throw new Error(
      `Meridian control server is unreachable at ${CONTROL_SERVER_URL}. ` +
        `Is Meridian running (pnpm tauri dev)? Underlying error: ${
          err instanceof Error ? err.message : String(err)
        }`,
    );
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Bounds lookup failed (HTTP ${response.status}): ${body || "(empty body)"}`,
    );
  }
  const json = await response.json();
  if (!json || json.ok !== true) {
    throw new Error(`Bounds lookup returned: ${JSON.stringify(json)}`);
  }
  const { x, y, width, height, window_id: windowId } = json;
  if (![x, y, width, height].every((v) => Number.isFinite(v))) {
    throw new Error(`Bounds response missing numeric fields: ${JSON.stringify(json)}`);
  }
  if (width <= 0 || height <= 0) {
    throw new Error(
      `Meridian window has zero size (${width}x${height}). Is the window minimized?`,
    );
  }
  return { x, y, width, height, windowId: Number.isFinite(windowId) ? windowId : null };
}

/** POST `{screen}` to the running Meridian app's control server. Throws
 *  with a useful message if the app isn't reachable so the LLM gets a
 *  clear "Meridian isn't running" signal instead of a network error. */
async function navigateApp(screen) {
  let response;
  try {
    response = await fetch(`${CONTROL_SERVER_URL}/navigate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screen }),
    });
  } catch (err) {
    throw new Error(
      `Meridian control server is unreachable at ${CONTROL_SERVER_URL}. ` +
        `Is Meridian running (pnpm tauri dev)? Underlying error: ${
          err instanceof Error ? err.message : String(err)
        }`,
    );
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Navigation failed (HTTP ${response.status}): ${body || "(empty body)"}`,
    );
  }
  // Small settle delay — gives React a frame or two to commit the new
  // screen's first paint before the caller (often) calls screenshot.
  await new Promise((r) => setTimeout(r, 250));
}

async function captureMeridian({ windowId, x, y, width, height }) {
  const path = join(tmpdir(), `meridian-screenshot-${randomUUID()}.png`);
  // Prefer window-id capture: grabs Meridian's content even when
  // occluded, so we never need to raise focus. Region capture is the
  // fallback for old builds whose control server doesn't return an id.
  let args;
  if (windowId != null) {
    // -l <id>: capture window by CGWindowID
    // -o:      no window shadow (smaller image, no fuzzy alpha edge)
    // -t png:  PNG output
    // -x:      no shutter sound
    args = ["-l", String(windowId), "-t", "png", "-x", "-o", path];
  } else {
    const rect = `${Math.round(x)},${Math.round(y)},${Math.round(width)},${Math.round(height)}`;
    args = ["-R", rect, "-t", "png", "-x", path];
  }
  await exec("screencapture", args);
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
      "changes to verify them visually. Optionally jump to a specific " +
      "screen first via `navigateTo` so you don't have to ask the user " +
      "to click around. Requires Meridian to be open " +
      "(`pnpm tauri dev` from the repo root).",
    inputSchema: {
      navigateTo: z
        .enum(NAV_SCREENS)
        .optional()
        .describe(
          "If set, navigate the app to this screen before capturing. " +
            "Useful when verifying a change on a specific surface. " +
            "Omit to screenshot whatever is currently displayed.",
        ),
    },
  },
  async ({ navigateTo }) => {
    try {
      if (navigateTo) {
        await navigateApp(navigateTo);
      }
      const bounds = await fetchWindowBounds();
      const base64 = await captureMeridian(bounds);
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

server.registerTool(
  "navigate",
  {
    title: "Navigate Meridian",
    description:
      "Switch Meridian's main window to a specific screen. Hits the " +
      "running app's local control server on 127.0.0.1:31415. Useful " +
      "by itself when you want to set up the UI for a follow-up step; " +
      "for the common 'navigate then screenshot' pattern, prefer the " +
      "`screenshot` tool's `navigateTo` argument so it's one round-trip.",
    inputSchema: {
      screen: z
        .enum(NAV_SCREENS)
        .describe("The screen id to switch to."),
    },
  },
  async ({ screen }) => {
    try {
      await navigateApp(screen);
      return {
        content: [
          { type: "text", text: `Navigated to ${screen}.` },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Navigation failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
