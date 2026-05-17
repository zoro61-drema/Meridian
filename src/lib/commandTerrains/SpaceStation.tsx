// SpaceStation — orbital platform with perimeter bleed-through.
//
// Spec §2.3.1: the platform occupies an irregular polygon in
// the center of the field. Pixels outside the polygon are
// transparent so Meridian's global space background (stars,
// nebula, JWST imagery) shows through around the edges. Sells
// the "we're operating from orbit" feel.
//
// Render is a single SVG covering the field. The polygon path
// is drawn three times:
//   1. As the plate fill (metal panel pattern, cool gray-teal)
//   2. As the perimeter glow strip (teal stroke, blurred)
//   3. As the inner highlight edge (thin lighter stroke)
// Plus a few decoration sprites (vents, cargo crates) placed
// inside the polygon to give it the "occupied platform" feel.
//
// The polygon is parameterized to scale to the field's
// width/height via SVG viewBox transformation. Coordinates are
// authored in a 800×420 design space; the viewBox does the
// scaling.

import type { TerrainBackgroundProps } from "./types";

const VB_W = 800;
const VB_H = 420;

const PLATFORM_PATH = [
  "M 90,30",
  "L 710,30",
  "L 770,90",
  "L 770,200",
  "L 730,220",
  "L 770,240",
  "L 770,330",
  "L 710,390",
  "L 90,390",
  "L 30,330",
  "L 30,240",
  "L 70,220",
  "L 30,200",
  "L 30,90",
  "Z",
].join(" ");

export function SpaceStation({ width, height }: TerrainBackgroundProps) {
  return (
    <svg
      aria-hidden
      className="absolute inset-0"
      width={width}
      height={height}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      style={{ imageRendering: "pixelated" }}
    >
      <defs>
        {/* Metal-plate pattern: ~32px panels with rivets and
            faint groove lines. Cool gray-teal tone so the
            platform reads "industrial / orbital" against the
            warm-blue space backdrop. */}
        <pattern
          id="platform-plates"
          x="0"
          y="0"
          width="32"
          height="32"
          patternUnits="userSpaceOnUse"
        >
          <rect width="32" height="32" fill="#2a3540" />
          <rect width="32" height="32" fill="url(#plate-grad)" />
          <line x1="0" y1="0" x2="32" y2="0" stroke="rgba(0,0,0,0.45)" strokeWidth="1" />
          <line x1="0" y1="0" x2="0" y2="32" stroke="rgba(0,0,0,0.45)" strokeWidth="1" />
          <line x1="0" y1="16" x2="32" y2="16" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          <rect x="2" y="2" width="2" height="2" fill="rgba(140,180,200,0.35)" />
          <rect x="28" y="2" width="2" height="2" fill="rgba(140,180,200,0.35)" />
          <rect x="2" y="28" width="2" height="2" fill="rgba(140,180,200,0.35)" />
          <rect x="28" y="28" width="2" height="2" fill="rgba(140,180,200,0.35)" />
        </pattern>
        <linearGradient id="plate-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(80,110,130,0.45)" />
          <stop offset="50%" stopColor="rgba(60,85,100,0.25)" />
          <stop offset="100%" stopColor="rgba(40,55,70,0.55)" />
        </linearGradient>
        <filter id="edge-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        {/* Clip everything visual to the platform footprint so the
            patterns and decorations don't bleed past the edge. */}
        <clipPath id="platform-clip">
          <path d={PLATFORM_PATH} />
        </clipPath>
      </defs>

      {/* Platform body. Filled with the plate pattern, clipped to
          the polygon. Outside the polygon stays transparent —
          that's where Meridian's app background shows through. */}
      <g clipPath="url(#platform-clip)">
        <path d={PLATFORM_PATH} fill="url(#platform-plates)" />

        {/* Subtle vignette toward the platform's interior — makes
            the perimeter feel more "edge". */}
        <radialGradient id="platform-vignette" cx="0.5" cy="0.5" r="0.65">
          <stop offset="60%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
        </radialGradient>
        <rect x="0" y="0" width={VB_W} height={VB_H} fill="url(#platform-vignette)" />

        {/* Decoration: vents, cargo crates, antenna bases. Just
            enough flavor to read as an occupied platform, not so
            much that they clutter unit positioning. */}
        <Decoration />
      </g>

      {/* Glowing perimeter strip — teal, blurred. Painted *over*
          the clipped body so the glow can extend slightly outside
          the polygon for the bleed effect. */}
      <path
        d={PLATFORM_PATH}
        fill="none"
        stroke="rgba(120,200,220,0.7)"
        strokeWidth="3"
        filter="url(#edge-glow)"
      />
      {/* Crisp inner highlight on the perimeter for definition. */}
      <path
        d={PLATFORM_PATH}
        fill="none"
        stroke="rgba(180,220,235,0.85)"
        strokeWidth="1"
      />
    </svg>
  );
}

function Decoration() {
  return (
    <g aria-hidden>
      {/* Vent grilles — flat dark rectangles with slats */}
      <Vent x={140} y={70} />
      <Vent x={620} y={70} />
      <Vent x={140} y={340} />
      <Vent x={620} y={340} />

      {/* Cargo crates — tiny stacked boxes */}
      <Crate x={210} y={70} />
      <Crate x={560} y={350} />

      {/* Antenna / comms tower bases */}
      <AntennaBase x={400} y={50} />
      <AntennaBase x={400} y={370} />

      {/* Diagonal warning hazard stripes near the chamfered
          corners, suggesting "drop edge ahead" */}
      <HazardStripe x={36} y={94} angle={-45} />
      <HazardStripe x={734} y={94} angle={45} />
      <HazardStripe x={36} y={326} angle={45} />
      <HazardStripe x={734} y={326} angle={-45} />
    </g>
  );
}

function Vent({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect width="40" height="14" fill="rgba(20,30,40,0.85)" />
      <line x1="0" y1="3" x2="40" y2="3" stroke="rgba(120,160,180,0.4)" strokeWidth="0.5" />
      <line x1="0" y1="7" x2="40" y2="7" stroke="rgba(120,160,180,0.4)" strokeWidth="0.5" />
      <line x1="0" y1="11" x2="40" y2="11" stroke="rgba(120,160,180,0.4)" strokeWidth="0.5" />
    </g>
  );
}

function Crate({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect width="12" height="12" fill="#4a3a2a" stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
      <rect x="14" y="2" width="10" height="10" fill="#5a4530" stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
      <rect x="2" y="14" width="10" height="10" fill="#3e2f22" stroke="rgba(0,0,0,0.5)" strokeWidth="0.5" />
    </g>
  );
}

function AntennaBase({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r="5" fill="#1a2530" stroke="rgba(120,180,200,0.6)" strokeWidth="0.6" />
      <circle r="1.5" fill="rgba(180,230,240,0.9)" />
    </g>
  );
}

function HazardStripe({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <g transform={`translate(${x},${y}) rotate(${angle})`}>
      <rect width="36" height="3" fill="#d4c060" opacity="0.6" />
      <rect y="3" width="36" height="3" fill="#1a1a1a" opacity="0.7" />
      <rect y="6" width="36" height="3" fill="#d4c060" opacity="0.6" />
    </g>
  );
}
