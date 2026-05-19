// TacticalField — terrain background + unit positioning + tethers + arcs.
//
// Spec §2.3 (v1.1): terrain is pluggable via `src/lib/commandTerrains/`.
// The selected terrain id lives on the command store and is rendered
// here as a child layer. `bleedThrough` terrains (Space Station)
// don't paint an opaque background, so Meridian's global space
// theme shows through outside the platform polygon.

import { FIELD_ACCENTS, SpawnDropship } from "@/lib/commandSprites";
import { computeSpawnVisuals } from "@/lib/commandSpawn";
import { getTerrain } from "@/lib/commandTerrains";
import { useCommandStore } from "@/stores/command/store";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { UnitInstance } from "./UnitInstance";

const DROPSHIP_DISPLAY_SIZE = 108;

interface TacticalFieldProps {
  /** When true, suppresses per-unit name labels and the hover ring
   *  for use inside the MiniField tile where labels would be too
   *  small to read. */
  compact?: boolean;
}

export function TacticalField({ compact = false }: TacticalFieldProps = {}) {
  const units = useCommandStore((s) => s.units);
  const unitOrder = useCommandStore((s) => s.unitOrder);
  const signalArcs = useCommandStore((s) => s.signalArcs);
  const tickWander = useCommandStore((s) => s.tickWander);
  const setFieldBounds = useCommandStore((s) => s.setFieldBounds);

  // Cosmetic idle-wander rAF loop (spec §2.4). Pure read-from-store
  // side effect — the tick action no-ops when nothing changes, so
  // an empty field doesn't churn React. Disabled under
  // prefers-reduced-motion per spec §10.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    );
    if (reducedMotion?.matches) return;

    let rafId = 0;
    const loop = (now: number) => {
      tickWander(now);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [tickWander]);

  // Spawn-ceremony forced re-render. During the dropship's descent
  // + hover phases the unit's stored position doesn't change (it
  // stays at anchor), so the store-driven re-render path never
  // fires and the dropship overlay — computed from `performance.now()`
  // at render time — would be frozen at its initial frame. This
  // local rAF kicks a tick counter every frame while any unit has
  // an active spawn ceremony so the dropship animates.
  const anySpawning = unitOrder.some((id) => {
    const u = units[id];
    return u?.transient === "spawning" && u.spawnStartedAt != null;
  });
  const [, setSpawnTick] = useState(0);
  useEffect(() => {
    if (!anySpawning) return;
    let rafId = 0;
    const loop = () => {
      setSpawnTick((t) => (t + 1) % 1_000_000);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [anySpawning]);

  const terrainId = useCommandStore((s) => s.terrain);
  const terrain = getTerrain(terrainId);

  // Measure the container so the terrain SVG can size + scale to it.
  // ResizeObserver keeps the dimensions current as the panel resizes.
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 420 });
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      // offsetWidth/Height returns the *layout-box* size,
      // unaffected by ancestor CSS transforms. The MiniField
      // wraps us in `transform: scale(...)`; getBoundingClientRect
      // would return the visible (scaled-down) rect, causing the
      // terrain SVG to render at the post-transform size and only
      // fill the top-left quadrant of our 800×420 logical box.
      const w = Math.max(1, el.offsetWidth);
      const h = Math.max(1, el.offsetHeight);
      setSize({ w, h });
      // Non-compact (ExpandedField) drives the store-side field
      // bounds so wander + clamp use the full available area.
      // MiniField's TacticalField stays out of this — it sits inside
      // a `width: FIELD_W, height: FIELD_H` scaled wrapper that
      // measures 800×420 anyway, so updating bounds from there
      // would just race with the expanded view.
      if (!compact) setFieldBounds(w, h);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [compact, setFieldBounds]);

  // Reset bounds to the MiniField logical size when the non-compact
  // view unmounts. Without this, units that fanned out across the
  // expanded area would stay at logical positions > 800/420 when
  // the user closes the modal and the MiniField becomes the only
  // visible field — leaving them rendered outside MiniField's
  // visible 800×420 box.
  useEffect(() => {
    if (compact) return;
    return () => {
      setFieldBounds(800, 420);
    };
  }, [compact, setFieldBounds]);

  const Terrain = terrain.Background;

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
        color: FIELD_ACCENTS.tether.primary,
      });
    }
  }
  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-md"
      role="region"
      aria-label="Tactical field"
    >
      <Terrain width={size.w} height={size.h} />
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
            const color = FIELD_ACCENTS.signal.highlight;
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
        // During the descent + hover phases of the spawn ceremony
        // (spec §5.5) the unit is hidden inside the dropship; we
        // skip rendering its sprite until the drop phase begins.
        if (u.transient === "spawning" && u.spawnStartedAt != null) {
          const visuals = computeSpawnVisuals(
            performance.now() - u.spawnStartedAt,
          );
          if (!visuals.unitVisible) return null;
        }
        return <UnitInstance key={id} unit={u} compact={compact} />;
      })}
      {/* Spawn-ceremony dropships. Rendered as an overlay layer
          on top of unit sprites so a dropship that's lower in the
          frame still covers a unit's head. */}
      {unitOrder.map((id) => {
        const u = units[id];
        if (!u || u.transient !== "spawning" || u.spawnStartedAt == null) {
          return null;
        }
        const visuals = computeSpawnVisuals(
          performance.now() - u.spawnStartedAt,
        );
        if (!visuals.dropshipVisible) return null;
        return (
          <div
            key={`dropship-${id}`}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{
              left: u.anchorX,
              top: u.anchorY + visuals.dropshipDy,
            }}
          >
            <SpawnDropship size={DROPSHIP_DISPLAY_SIZE} />
          </div>
        );
      })}
    </div>
  );
}
