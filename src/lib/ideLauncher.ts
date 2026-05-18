// Open a source file in the user's preferred IDE, jumping to a
// specific line where possible. Each editor registers a URL scheme
// on macOS at install time (vscode://, cursor://, zed://, idea://,
// clion://, …). We build the right URL for the active IDE and
// hand it to Tauri's `opener` plugin to launch.
//
// The IDE choice is a user preference — see `appPreferences.ts`.
// Adding a new IDE is two lines: an entry here and one in the
// settings dropdown.

import { openUrl } from "@/lib/tauri/core";

export interface IdeDescriptor {
  id: string;
  label: string;
  /** Build the launch URL for the editor. `absPath` is an absolute
   *  filesystem path; `line` is 1-based. */
  buildUrl: (absPath: string, line?: number) => string;
}

/** Common IDEs that register a URL scheme on macOS. Order is the
 *  default dropdown order; users pick their preference in Settings. */
export const IDES: IdeDescriptor[] = [
  {
    id: "vscode",
    label: "VS Code",
    buildUrl: (p, l) =>
      `vscode://file${ensureLeadingSlash(p)}${l ? `:${l}:1` : ""}`,
  },
  {
    id: "cursor",
    label: "Cursor",
    buildUrl: (p, l) =>
      `cursor://file${ensureLeadingSlash(p)}${l ? `:${l}:1` : ""}`,
  },
  {
    id: "zed",
    label: "Zed",
    buildUrl: (p, l) => `zed://file${ensureLeadingSlash(p)}${l ? `:${l}` : ""}`,
  },
  {
    id: "idea",
    label: "IntelliJ IDEA",
    buildUrl: (p, l) =>
      `idea://open?file=${encodeURIComponent(p)}${l ? `&line=${l}` : ""}`,
  },
  {
    id: "clion",
    label: "CLion",
    buildUrl: (p, l) =>
      `clion://open?file=${encodeURIComponent(p)}${l ? `&line=${l}` : ""}`,
  },
  {
    id: "webstorm",
    label: "WebStorm",
    buildUrl: (p, l) =>
      `webstorm://open?file=${encodeURIComponent(p)}${l ? `&line=${l}` : ""}`,
  },
  {
    id: "pycharm",
    label: "PyCharm",
    buildUrl: (p, l) =>
      `pycharm://open?file=${encodeURIComponent(p)}${l ? `&line=${l}` : ""}`,
  },
  {
    id: "goland",
    label: "GoLand",
    buildUrl: (p, l) =>
      `goland://open?file=${encodeURIComponent(p)}${l ? `&line=${l}` : ""}`,
  },
  {
    id: "rubymine",
    label: "RubyMine",
    buildUrl: (p, l) =>
      `rubymine://open?file=${encodeURIComponent(p)}${l ? `&line=${l}` : ""}`,
  },
  {
    id: "sublime",
    label: "Sublime Text",
    buildUrl: (p, l) =>
      `subl://open?url=${encodeURIComponent(`file://${p}`)}${l ? `&line=${l}` : ""}`,
  },
];

export const DEFAULT_IDE_ID = "vscode";

export function getIdeById(id: string): IdeDescriptor {
  return IDES.find((i) => i.id === id) ?? IDES[0];
}

function ensureLeadingSlash(p: string): string {
  return p.startsWith("/") ? p : `/${p}`;
}

/** Resolve a possibly-relative path against an optional worktree
 *  root so URL-scheme handlers always get an absolute path. */
function resolveAbsolutePath(path: string, worktreeRoot: string | null): string {
  if (path.startsWith("/")) return path;
  if (!worktreeRoot) return path;
  const root = worktreeRoot.endsWith("/")
    ? worktreeRoot.slice(0, -1)
    : worktreeRoot;
  return `${root}/${path}`;
}

/** Open a file at a specific line in the user's preferred IDE.
 *  Fire-and-forget — the Tauri opener swallows its own errors so
 *  the only way this fails is a missing URL handler on the OS,
 *  which the user notices anyway when nothing opens. */
export function openFileInIde(opts: {
  ideId: string;
  path: string;
  line?: number;
  worktreeRoot: string | null;
}): void {
  const ide = getIdeById(opts.ideId);
  const abs = resolveAbsolutePath(opts.path, opts.worktreeRoot);
  openUrl(ide.buildUrl(abs, opts.line));
}
