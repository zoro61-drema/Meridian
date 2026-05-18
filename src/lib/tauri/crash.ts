// Crash-report Tauri commands.
//
// Backed by `src-tauri/src/crash.rs`. The Rust side writes
// plain-text reports under `<app_data_dir>/crashes/` and uses a
// session.lock marker file to detect non-graceful exits across
// runs (panic, WebView crash, OOM, force kill, power loss).

import { invoke } from "@tauri-apps/api/core";

export interface CrashReport {
  /** Unix seconds when the report was written. */
  timestamp: number;
  /** "rust_panic" | "js_unhandled" | "unexpected_exit" */
  kind: string;
  /** One-line summary pulled from the report's `Message:` block. */
  summary: string;
  /** Absolute path — frontend uses revealItemInDir to open in Finder. */
  filePath: string;
}

interface RawCrashReport {
  timestamp: number;
  kind: string;
  summary: string;
  file_path: string;
}

/** Returns the previous-session crash report (if any) and clears
 *  it server-side, so subsequent calls return null. Call once on
 *  app mount. */
export async function getPendingCrashReport(): Promise<CrashReport | null> {
  const raw = await invoke<RawCrashReport | null>("get_pending_crash_report");
  if (!raw) return null;
  return {
    timestamp: raw.timestamp,
    kind: raw.kind,
    summary: raw.summary,
    filePath: raw.file_path,
  };
}

/** Write a crash report for an unhandled JS error. Returns the
 *  absolute path of the written file. */
export async function reportJsCrash(
  message: string,
  stack?: string,
): Promise<string> {
  return invoke<string>("report_js_crash", { message, stack: stack ?? null });
}
