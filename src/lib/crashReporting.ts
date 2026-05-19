// Frontend half of the crash reporting flow.
//
// On app mount:
//   1. installJsCrashHandlers() — `window.onerror` + unhandled
//      promise rejections forward to the Rust crash store so they
//      land in the same `<app_data_dir>/crashes/` folder as Rust
//      panics, and the same toast logic surfaces them next run.
//   2. checkPendingCrashAndToast() — asks Rust if the previous
//      session crashed; if so, sonner toast with a "View report"
//      action that opens the file in Finder.

import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

import { getPendingCrashReport, reportJsCrash } from "@/lib/tauri/crash";

let handlersInstalled = false;

/** True if this error came from Vite's React-Refresh path in dev mode.
 *  Those errors fire when HMR keeps a stale module closure alive that
 *  references a symbol that's since been removed — React's reconciler
 *  recovers, but our window.error listener still sees the throw. Suppress
 *  in dev so transient refresh state doesn't pollute the crash log. */
function isHmrRefreshNoise(_message: string, stack: string | undefined): boolean {
  if (!import.meta.env.DEV) return false;
  if (!stack) return false;
  return (
    stack.includes("@react-refresh") ||
    stack.includes("performReactRefresh") ||
    stack.includes("/@vite/client")
  );
}

export function installJsCrashHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;

  window.addEventListener("error", (ev: ErrorEvent) => {
    const message =
      ev.message || (ev.error instanceof Error ? ev.error.message : "Unknown error");
    const stack =
      ev.error instanceof Error
        ? ev.error.stack
        : `${ev.filename}:${ev.lineno}:${ev.colno}`;
    if (isHmrRefreshNoise(message, stack)) {
      // Dev-only: Vite/React-Refresh keeps stale closures alive after a
      // top-level symbol is removed. The thrown ReferenceError lands here
      // on the next HMR even though the source on disk is clean. React's
      // error-recovery still re-renders correctly — a hard reload would
      // clear the stale module entirely. Don't escalate this to a crash
      // report; just log it so it's still visible while developing.
      // eslint-disable-next-line no-console
      console.warn("[crash] suppressed HMR refresh error:", message);
      return;
    }
    void reportJsCrash(message, stack).catch(() => {
      // If we can't even write the report, there's nowhere left to
      // signal — swallow.
    });
  });

  window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
    const reason = ev.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
    const stack = reason instanceof Error ? reason.stack : undefined;
    if (isHmrRefreshNoise(message, stack)) {
      // eslint-disable-next-line no-console
      console.warn("[crash] suppressed HMR refresh rejection:", message);
      return;
    }
    void reportJsCrash(message, stack).catch(() => {});
  });
}

function formatCrashKind(kind: string): string {
  if (kind === "rust_panic") return "Backend panic";
  if (kind === "js_unhandled") return "Frontend error";
  if (kind === "unexpected_exit") return "Unexpected exit";
  return kind;
}

function formatTimestamp(unixSeconds: number): string {
  if (!unixSeconds) return "earlier";
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleString();
}

export async function checkPendingCrashAndToast(): Promise<void> {
  let report: Awaited<ReturnType<typeof getPendingCrashReport>> = null;
  try {
    report = await getPendingCrashReport();
  } catch (err) {
    console.warn("[crash] failed to query pending report", err);
    return;
  }
  if (!report) return;

  const kindLabel = formatCrashKind(report.kind);
  const when = formatTimestamp(report.timestamp);

  toast.error(`Meridian crashed (${kindLabel}) — ${when}`, {
    description: report.summary,
    duration: 15000,
    action: {
      label: "View report",
      onClick: () => {
        void revealItemInDir(report.filePath).catch((err: unknown) => {
          console.warn("[crash] revealItemInDir failed", err);
        });
      },
    },
  });
}
