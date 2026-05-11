/**
 * Single entry point for "stop every running AI agent now". Wired to the
 * Escape-key shortcut in `App.tsx` so the user can interrupt any in-flight
 * workflow without hunting for the per-screen cancel control.
 *
 * Each cancellation source lives in its own store and exposes its own
 * cancel action; this module just polls those stores' current state and
 * fires the matching cancel when something is actually running. The
 * goal is to keep the integration cost of adding new cancellable
 * agents low — drop another `if` block here, no central registry to
 * keep in sync.
 *
 * Returns true when at least one agent was cancelled, so the caller can
 * decide whether to surface a confirmation toast (and whether to
 * `preventDefault()` the keystroke).
 */
import { usePrReviewStore } from "@/stores/prReview/store";

export function cancelAllAgents(): boolean {
  let cancelled = false;

  // PR Review — `cancelReview` operates on whichever PR session is
  // currently selected; the action itself no-ops when nothing is
  // reviewing, but we gate on the session flag so we don't claim to
  // have cancelled something we didn't.
  const pr = usePrReviewStore.getState();
  if (pr.selectedPr) {
    const session = pr.sessions.get(pr.selectedPr.id);
    if (session?.reviewing) {
      pr.cancelReview();
      cancelled = true;
    }
  }

  return cancelled;
}
