// ChatPanelResizer — drag-to-resize handle on the left edge of the
// chat side-panel.
//
// Mounted as a 6-px-wide column inside the chat aside. mousedown
// captures pointer events on `window` and updates the width every
// frame; release commits the final value to the preference store
// so the layout survives reloads. Width is clamped to a sensible
// min/max so the user can't drag it into uselessness.

import { useCallback, useEffect, useRef } from "react";

interface ChatPanelResizerProps {
  width: number;
  onResize: (next: number) => void;
  onCommit: (next: number) => void;
  min: number;
  max: number;
}

export function ChatPanelResizer({
  width,
  onResize,
  onCommit,
  min,
  max,
}: ChatPanelResizerProps) {
  const draggingRef = useRef(false);
  const latestRef = useRef(width);
  latestRef.current = width;

  // Window-bound mouse handlers so the drag continues even when
  // the pointer leaves the 6-px handle (which it usually does).
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      // Width grows as the pointer moves LEFT (handle is on the
      // panel's left edge). Compute from the viewport's right side
      // so the math stays stable across DPR / scrollbar variations.
      const next = Math.round(window.innerWidth - e.clientX);
      const clamped = Math.max(min, Math.min(max, next));
      onResize(clamped);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onCommit(latestRef.current);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [min, max, onResize, onCommit]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    // Lock the body cursor so it stays as resize-grip throughout
    // the drag, even when the pointer wanders off the handle.
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize chat panel"
      onMouseDown={onMouseDown}
      className="group absolute inset-y-0 left-0 w-1.5 -translate-x-1/2 cursor-ew-resize select-none"
    >
      {/* Visible hairline + on-hover thickening so the affordance
          isn't invisible; the hit area is wider than what's drawn. */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10 transition-colors group-hover:w-0.5 group-hover:bg-amber-400/60" />
    </div>
  );
}
