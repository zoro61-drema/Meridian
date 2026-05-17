// MiniField — compressed tactical-field tile for the agent-card grid.
//
// Spec §2.1 (v1.1): the tactical field, shrunk down to a single
// card-sized tile so it sits alongside per-agent cards in the
// fleet grid. The same TacticalField primitive renders inside,
// scaled via CSS transform so all sprite positions, terrain
// patterns, tethers, and signal arcs remain pixel-accurate.
//
// Double-click → bubbles a request to enter expanded-field mode
// (handled by the parent CommandScreen).

import { useLayoutEffect, useRef, useState } from "react";

import { TacticalField } from "./TacticalField";

const FIELD_W = 800;
const FIELD_H = 420;

interface MiniFieldProps {
  onExpand?: () => void;
}

export function MiniField({ onExpand }: MiniFieldProps) {
  const wrapperRef = useRef<HTMLButtonElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      // Uniform scale — pick the smaller of the two so the terrain
      // SVG fills as much of the tile as it can without distorting
      // its 40:21 aspect ratio. The parent AgentCardGrid pins each
      // tile to a stable aspect via `aspect-ratio`, so the leftover
      // space (letterbox / pillarbox) is usually minimal; using the
      // smaller scale keeps the field crisp regardless.
      const sx = el.offsetWidth / FIELD_W;
      const sy = el.offsetHeight / FIELD_H;
      setScale(Math.max(0.05, Math.min(sx, sy)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <button
      type="button"
      ref={wrapperRef}
      onDoubleClick={onExpand}
      title="Double-click to expand"
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-md border border-white/10 bg-black/40 text-left focus:outline-none focus:ring-2 focus:ring-amber-400/50"
      aria-label="Mini tactical field — double-click to expand"
    >
      <div
        style={{
          width: FIELD_W,
          height: FIELD_H,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          flexShrink: 0,
        }}
      >
        <TacticalField compact />
      </div>
      <div className="pointer-events-none absolute bottom-1 right-1 rounded border border-white/10 bg-black/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white/60">
        field
      </div>
    </button>
  );
}
