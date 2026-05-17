/**
 * Single source of truth for "is the Meridian window the user's active
 * surface?" — combines `document.hidden` (full background) with
 * `document.hasFocus()` (window is behind another app on the same
 * desktop). Subscribers are notified on every transition.
 *
 * Used to:
 *   - toggle a `body.app-bg-suspended` class so CSS-animated stars
 *     pause via `animation-play-state` instead of churning the GPU.
 *   - gate JS-scheduled spawns of comets, meteors, shooting stars so
 *     they don't accumulate in React state while you're away. Without
 *     this, regaining focus shows a burst of every effect that "should
 *     have" fired during the absence — visually loud and slow.
 */

const SUSPENDED_CLASS = "app-bg-suspended";

let active = computeActive();
const listeners = new Set<(active: boolean) => void>();
let installed = false;

function computeActive(): boolean {
  if (typeof document === "undefined") return true;
  if (document.hidden) return false;
  // `hasFocus()` is the focus check that matters on macOS — a Tauri
  // window behind another app stays `visible` but loses focus.
  if (typeof document.hasFocus === "function" && !document.hasFocus()) {
    return false;
  }
  return true;
}

function applyBodyClass(next: boolean): void {
  if (typeof document === "undefined") return;
  document.body.classList.toggle(SUSPENDED_CLASS, !next);
}

function recompute(): void {
  const next = computeActive();
  if (next === active) return;
  active = next;
  applyBodyClass(active);
  for (const fn of listeners) fn(active);
}

/** Install global focus/blur/visibilitychange listeners (idempotent). */
export function installWindowFocusTracker(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  applyBodyClass(active);
  window.addEventListener("focus", recompute);
  window.addEventListener("blur", recompute);
  document.addEventListener("visibilitychange", recompute);
}

/** True when the Meridian window is visible AND focused. */
export function isAppActive(): boolean {
  return active;
}

export function subscribeAppActive(fn: (active: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
