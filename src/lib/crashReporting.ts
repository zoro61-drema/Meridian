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
