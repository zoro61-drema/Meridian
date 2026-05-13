/**
 * Layout shell that hosts the `AiDebugPanel` in one of four slots:
 *
 *   - "bottom" / "right" / "left": split off a strip from the main
 *     window for the panel, with a draggable divider.
 *   - "window": pop the panel out into its own Tauri WebviewWindow
 *     so the user can drag it to a second monitor.
 *   - "hidden": panel is collapsed away; main app fills the viewport.
 *
 * Critical: the children (the entire app) must NOT unmount when the
 * dock mode changes. We always render the same outer `<div>` wrapper
 * with children at a stable JSX position (gridArea: "main"); the
 * panel and divider are conditionally rendered as siblings. React
 * preserves the children subtree across mode toggles, so workflow
 * state and the current screen survive a Cmd-Shift-D press.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAiDebugStore } from "@/stores/aiDebugStore";
import type { AiDebugDockMode } from "@/lib/appPreferences";
import { AiDebugPanel } from "@/components/AiDebugPanel";
import { openAiDebugWindow, closeAiDebugWindow, AI_DEBUG_SET_DOCK_MODE_EVENT } from "@/lib/aiDebugWindow";
import { listen } from "@tauri-apps/api/event";

export function AiDebugDock({ children }: { children: React.ReactNode }) {
  const dockMode = useAiDebugStore((s) => s.dockMode);
  const setDockMode = useAiDebugStore((s) => s.setDockMode);
  const panelSize = useAiDebugStore((s) => s.panelSize);
  const setPanelSize = useAiDebugStore((s) => s.setPanelSize);

  // Toggle the popped-out window when the dock mode changes to/from
  // "window". The window subscribes to the same store, so it stays in
  // sync with the main pane's enable/clear actions automatically.
  useEffect(() => {
    if (dockMode === "window") {
      void openAiDebugWindow();
    } else {
      void closeAiDebugWindow();
    }
  }, [dockMode]);

  // Publish the docked strip's size as CSS variables on <html>. Other
  // root-level fixed-positioned elements (TasksPanel, GlobalFxDrawer,
  // Toaster) read these to inset themselves so the dock reserves space
  // for itself instead of clipping app UI. Includes the 4px divider so
  // those elements clear it cleanly. Vars are 0px when no split is
  // active (popped-out or hidden), so consumers always have a value to
  // read.
  useEffect(() => {
    const root = document.documentElement;
    const size = dockMode === "bottom" || dockMode === "right" || dockMode === "left"
      ? `${panelSize + 4}px`
      : "0px";
    root.style.setProperty("--ai-debug-dock-bottom", dockMode === "bottom" ? size : "0px");
    root.style.setProperty("--ai-debug-dock-right", dockMode === "right" ? size : "0px");
    root.style.setProperty("--ai-debug-dock-left", dockMode === "left" ? size : "0px");
    return () => {
      root.style.setProperty("--ai-debug-dock-bottom", "0px");
      root.style.setProperty("--ai-debug-dock-right", "0px");
      root.style.setProperty("--ai-debug-dock-left", "0px");
    };
  }, [dockMode, panelSize]);

  // The popped-out window can't change the main window's store directly —
  // they're separate webviews with isolated zustand state. Its dock-mode
  // picker emits a Tauri event instead, and we apply the change here. The
  // resulting dockMode flip back to a split mode triggers the effect above
  // and the popped-out window closes itself.
  useEffect(() => {
    let dispose: (() => void) | undefined;
    listen<AiDebugDockMode>(AI_DEBUG_SET_DOCK_MODE_EVENT, (event) => {
      void setDockMode(event.payload);
    })
      .then((unlisten) => {
        dispose = unlisten;
      })
      .catch((err) =>
        console.warn(`[ai-debug] listen ${AI_DEBUG_SET_DOCK_MODE_EVENT} failed`, err),
      );
    return () => {
      dispose?.();
    };
  }, [setDockMode]);

  // The inline panel only renders for the three split modes. For
  // "hidden" and "window" we still render the wrapper (so children stay
  // mounted) but pass `orientation = null` to skip the panel slot.
  const splitOrientation: "bottom" | "right" | "left" | null =
    dockMode === "hidden" || dockMode === "window" ? null : dockMode;

  return (
    <DockSplit
      orientation={splitOrientation}
      panelSize={panelSize}
      onPanelSizeChange={setPanelSize}
      panelSlot={
        <AiDebugPanel
          onClose={() => void setDockMode("hidden")}
          controls={<DockModePicker mode={dockMode} setMode={setDockMode} />}
        />
      }
    >
      {children}
    </DockSplit>
  );
}

export function DockModePicker({
  mode,
  setMode,
}: {
  mode: AiDebugDockMode;
  setMode: (m: AiDebugDockMode) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Button rect drives the popover's fixed position. The panel slot has
  // `overflow-hidden` (and the popped-out window's wrapper does too), so
  // rendering the menu inline would clip — we portal to document.body and
  // pin with fixed coordinates instead, recomputing on resize/scroll.
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const r = buttonRef.current?.getBoundingClientRect();
      if (!r) return;
      setAnchor({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const opts: { mode: AiDebugDockMode; label: string }[] = [
    { mode: "bottom", label: "↓" },
    { mode: "right", label: "→" },
    { mode: "left", label: "←" },
    { mode: "window", label: "⧉" },
  ];

  return (
    <>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setOpen((v) => !v)}
        title="Dock options"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </Button>
      {open && anchor &&
        createPortal(
          <div
            ref={popoverRef}
            role="menu"
            aria-label="Dock side"
            style={{
              position: "fixed",
              top: anchor.top,
              right: anchor.right,
              zIndex: 100,
            }}
            className="flex items-center gap-1 rounded-md border bg-popover text-popover-foreground shadow-lg px-2 py-1.5"
          >
            <span className="text-[11px] text-muted-foreground">Dock side:</span>
            {opts.map((opt) => (
              <Button
                key={opt.mode}
                variant={mode === opt.mode ? "default" : "ghost"}
                size="icon"
                className="h-7 w-7 text-[11px]"
                onClick={() => {
                  void setMode(opt.mode);
                  setOpen(false);
                }}
                title={`Dock ${opt.mode}`}
              >
                {opt.label}
              </Button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function DockSplit({
  orientation,
  panelSize,
  onPanelSizeChange,
  panelSlot,
  children,
}: {
  orientation: "bottom" | "right" | "left" | null;
  panelSize: number;
  onPanelSizeChange: (px: number) => void;
  panelSlot: React.ReactNode;
  children: React.ReactNode;
}) {
  const draggingRef = useRef(false);
  const startRef = useRef({ pos: 0, size: 0 });

  const onDividerDown = (e: React.MouseEvent) => {
    if (!orientation) return;
    e.preventDefault();
    draggingRef.current = true;
    startRef.current = {
      pos: orientation === "bottom" ? e.clientY : e.clientX,
      size: panelSize,
    };
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const cur = orientation === "bottom" ? ev.clientY : ev.clientX;
      const delta = cur - startRef.current.pos;
      // Bottom dock: dragging up grows the panel, so subtract.
      // Right dock: dragging left grows the panel, so subtract too.
      // Left dock: dragging right grows the panel, so add.
      const sign = orientation === "left" ? 1 : -1;
      const next = startRef.current.size + sign * delta;
      onPanelSizeChange(next);
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Single grid layout, parameterised by orientation. Named grid areas
  // ("main" / "divider" / "panel") let us keep the children div at a
  // STABLE JSX position regardless of mode — switching modes only
  // changes CSS, never the React tree, so children never unmount.
  const containerStyle = useMemo<React.CSSProperties>(() => {
    const base: React.CSSProperties = {
      display: "grid",
      height: "100dvh",
      width: "100vw",
    };
    if (!orientation) {
      return {
        ...base,
        gridTemplateRows: "1fr",
        gridTemplateColumns: "1fr",
        gridTemplateAreas: '"main"',
      };
    }
    if (orientation === "bottom") {
      return {
        ...base,
        gridTemplateColumns: "1fr",
        gridTemplateRows: `1fr 4px ${panelSize}px`,
        gridTemplateAreas: '"main" "divider" "panel"',
      };
    }
    if (orientation === "right") {
      return {
        ...base,
        gridTemplateRows: "1fr",
        gridTemplateColumns: `1fr 4px ${panelSize}px`,
        gridTemplateAreas: '"main divider panel"',
      };
    }
    return {
      ...base,
      gridTemplateRows: "1fr",
      gridTemplateColumns: `${panelSize}px 4px 1fr`,
      gridTemplateAreas: '"panel divider main"',
    };
  }, [orientation, panelSize]);

  const dividerStyle: React.CSSProperties = orientation
    ? {
        gridArea: "divider",
        cursor: orientation === "bottom" ? "ns-resize" : "ew-resize",
        background: "var(--border)",
      }
    : {};

  return (
    <div style={containerStyle}>
      {/*
        Children always live in this single div at this single JSX position.
        `min-h-0 min-w-0` lets the grid track size it correctly; `overflow-y-auto`
        is the safety net for screens that use `min-h-screen` (which would
        otherwise overflow the smaller grid track when a dock is active).
        Screens that already use `h-full` / `h-dvh` fit exactly and the
        scrollbar never appears.
      */}
      <div
        style={{ gridArea: "main" }}
        className="min-h-0 min-w-0 overflow-y-auto"
      >
        {children}
      </div>
      {orientation && (
        <>
          <div onMouseDown={onDividerDown} style={dividerStyle} />
          <div
            style={{ gridArea: "panel" }}
            className="min-h-0 min-w-0 overflow-hidden"
          >
            {panelSlot}
          </div>
        </>
      )}
    </div>
  );
}
