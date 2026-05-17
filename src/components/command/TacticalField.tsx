// TacticalField — Badlands terrain background + per-unit positioning.
//
// Spec §2.3: v1 ships a single Badlands terrain — dusty rocky planet
// surface, warm neutral tones, sparse decoration. Phase 2 stubs this
// as a CSS gradient + procedural-noise overlay; Phase 3 swaps in
// actual 32×32 pixel-art tiles. Subagent tethers (§5.2) and signal
// arcs (§6.4) are also drawn at this layer when those phases land —
// for Phase 2 we render units only.

import { ACCENT_PALETTE } from "@/lib/commandSprites";
import { useCommandStore } from "@/stores/command/store";
import { UnitInstance } from "./UnitInstance";

export function TacticalField() {
  const units = useCommandStore((s) => s.units);
  const unitOrder = useCommandStore((s) => s.unitOrder);
  const signalArcs = useCommandStore((s) => s.signalArcs);

  // Collect parent→child position pairs for tether rendering.
  const tethers: Array<{
    key: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
  }> = [];
  for (const id of unitOrder) {
    const u = units[id];
    if (!u || u.childIds.length === 0) continue;
    for (const childId of u.childIds) {
      const child = units[childId];
      if (!child) continue;
      tethers.push({
        key: `${u.id}->${childId}`,
        x1: u.positionX,
        y1: u.positionY,
        x2: child.positionX,
        y2: child.positionY,
        color: ACCENT_PALETTE[u.accent].primary,
      });
    }
  }
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-md border border-amber-950/40"
      style={{
        // Badlands base: warm brown-tan radial gradient suggesting a
        // lit surface, with a darker vignette toward the edges so the
        // field reads as a contained tactical area rather than the
        // global page background.
        backgroundImage: [
          "radial-gradient(ellipse at 35% 30%, rgba(214,178,128,0.42), transparent 60%)",
          "radial-gradient(ellipse at 70% 75%, rgba(143,107,76,0.45), transparent 65%)",
          "linear-gradient(180deg, rgba(82,60,42,0.95) 0%, rgba(58,42,30,0.95) 100%)",
        ].join(", "),
        backgroundColor: "#3a2a1e",
        imageRendering: "pixelated",
      }}
      role="region"
      aria-label="Tactical field"
    >
      {/* Procedural rocky noise — repeating SVG that breaks up the
          gradient so it feels like terrain instead of a flat fill.
          Phase 3 replaces this with proper Badlands tiles. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
            `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'>
               <rect width='48' height='48' fill='transparent'/>
               <rect x='4'  y='6'  width='2' height='2' fill='rgba(255,220,170,0.10)'/>
               <rect x='15' y='14' width='2' height='2' fill='rgba(0,0,0,0.18)'/>
               <rect x='28' y='10' width='3' height='2' fill='rgba(255,220,170,0.07)'/>
               <rect x='38' y='22' width='2' height='2' fill='rgba(0,0,0,0.18)'/>
               <rect x='9'  y='30' width='2' height='3' fill='rgba(0,0,0,0.18)'/>
               <rect x='22' y='34' width='2' height='2' fill='rgba(255,220,170,0.08)'/>
               <rect x='34' y='38' width='2' height='2' fill='rgba(0,0,0,0.18)'/>
               <rect x='44' y='6'  width='2' height='2' fill='rgba(255,220,170,0.06)'/>
             </svg>`,
          )}")`,
          backgroundRepeat: "repeat",
          opacity: 0.9,
          mixBlendMode: "overlay",
        }}
      />
      {/* Optional faint grid overlay — keeps the bird's-eye perspective
          legible. Per spec §2.3 it's configurable; default off. */}
      {(tethers.length > 0 || signalArcs.length > 0) && (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ width: "100%", height: "100%" }}
        >
          <defs>
            <filter id="tether-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
            </filter>
            <filter id="signal-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" />
            </filter>
            <style>{`
              @keyframes signal-arc-pulse {
                0%   { stroke-opacity: 0; }
                25%  { stroke-opacity: 1; }
                100% { stroke-opacity: 0; }
              }
              @media (prefers-reduced-motion: reduce) {
                /* Skip the pulse animation; just show the arc at
                   full opacity for the same duration the JS-side
                   TTL holds it. */
                .command-signal-arc {
                  animation: none !important;
                  stroke-opacity: 0.85;
                }
              }
            `}</style>
          </defs>
          {tethers.map((t) => (
            <g key={t.key}>
              <line
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke={t.color}
                strokeOpacity={0.5}
                strokeWidth={3}
                strokeDasharray="4 4"
                filter="url(#tether-glow)"
              />
              <line
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke={t.color}
                strokeOpacity={0.95}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            </g>
          ))}
          {signalArcs.map((arc) => {
            const from = units[arc.fromSessionId];
            const to = units[arc.toSessionId];
            if (!from || !to) return null;
            const dx = to.positionX - from.positionX;
            const dy = to.positionY - from.positionY;
            // Quadratic curve control: midpoint, lifted perpendicular
            // to the chord by ~25% of its length for a gentle arc.
            const mx = (from.positionX + to.positionX) / 2;
            const my = (from.positionY + to.positionY) / 2;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const lift = Math.min(60, Math.max(20, len * 0.25));
            const nx = -dy / len;
            const ny = dx / len;
            const cx = mx + nx * lift;
            const cy = my + ny * lift;
            const path = `M ${from.positionX} ${from.positionY} Q ${cx} ${cy}, ${to.positionX} ${to.positionY}`;
            const color = ACCENT_PALETTE[from.accent].highlight;
            return (
              <g key={arc.id}>
                <path
                  className="command-signal-arc"
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeOpacity={0.6}
                  strokeWidth={5}
                  filter="url(#signal-glow)"
                  style={{ animation: "signal-arc-pulse 1.8s ease-out 1" }}
                />
                <path
                  className="command-signal-arc"
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeOpacity={1}
                  strokeWidth={1.5}
                  style={{ animation: "signal-arc-pulse 1.8s ease-out 1" }}
                />
              </g>
            );
          })}
        </svg>
      )}
      {unitOrder.map((id) => {
        const u = units[id];
        if (!u) return null;
        return <UnitInstance key={id} unit={u} />;
      })}
    </div>
  );
}
