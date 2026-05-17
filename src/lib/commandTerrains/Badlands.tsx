// Badlands — dusty desert planet surface.
//
// Spec §2.3.1: opaque terrain that fills the whole field, hiding
// Meridian's global space background. v1.1 rewrite gives the
// surface real desert character:
//
//   - layered base (warm sand gradient + horizontal wind-bands)
//   - drifted sand ripples (repeating diagonal pattern)
//   - boulders + boulder clusters (clumped dark pixels)
//   - cacti (vertical stalks with arms)
//   - bones / skull fragments (small bleached pixels)
//   - ground cracks (thin jagged dark lines)
//   - the BadlandsCreatures layer — a single wandering critter
//     that spawns occasionally and walks across the field
//
// All elements are authored in a fixed 800×420 SVG viewBox and
// stretched to whatever size the parent gives us
// (preserveAspectRatio="none"). The decoration positions are
// hand-placed so the field reads as composed rather than random.

import { BadlandsCreatures } from "./badlandsCreatures";
import type { TerrainBackgroundProps } from "./types";

const VB_W = 800;
const VB_H = 420;

// Bumps every foreground feature (boulders, cacti, bones, cracks)
// up so they read at typical card sizes. Positions in the data
// arrays stay unchanged — only the per-feature draw size scales.
const FEATURE_SCALE = 3;

// Hand-placed boulders. Each entry: [cx, cy, size, color].
// `color` is just the base — a lighter highlight pixel and a
// darker shadow pixel are added in the renderer.
type Boulder = [number, number, number, string];
const BOULDERS: Boulder[] = [
  [80, 80, 14, "#5a4030"],
  [120, 90, 8, "#6a4836"],
  [240, 60, 11, "#523828"],
  [710, 90, 16, "#5a4030"],
  [690, 110, 9, "#6a4836"],
  [430, 200, 13, "#5a4030"],
  [60, 320, 18, "#4a3628"],
  [110, 340, 11, "#5a4030"],
  [380, 360, 9, "#6a4836"],
  [600, 360, 14, "#5a4030"],
  [640, 340, 8, "#6a4836"],
  [280, 290, 7, "#4a3628"],
  [500, 100, 6, "#523828"],
  [560, 280, 10, "#5a4030"],
];

// Cacti — saguaro-ish silhouettes. [cx, baseY, height].
type Cactus = [number, number, number];
const CACTI: Cactus[] = [
  [180, 180, 22],
  [340, 130, 28],
  [580, 200, 18],
  [720, 300, 24],
  [200, 380, 20],
];

// Bones / skull fragments. [cx, cy, kind] — kind 0 = vertebra
// (small cross), kind 1 = rib (curved arc), kind 2 = skull dot.
type Bone = [number, number, 0 | 1 | 2];
const BONES: Bone[] = [
  [310, 220, 0],
  [450, 350, 1],
  [620, 60, 2],
  [150, 250, 0],
];

// Ground cracks. Each crack is an array of waypoints; the
// renderer connects them with a thin dark stroke.
const CRACKS: Array<Array<[number, number]>> = [
  [
    [40, 240],
    [110, 250],
    [170, 245],
    [230, 260],
  ],
  [
    [400, 60],
    [430, 80],
    [445, 110],
  ],
  [
    [520, 380],
    [560, 370],
    [610, 380],
    [660, 372],
  ],
  [
    [260, 130],
    [290, 145],
    [310, 175],
  ],
];

export function Badlands({ width, height }: TerrainBackgroundProps) {
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
        {/* Warm sand gradient — light at the upper-left simulates
            distant sun, deeper tan settling to brown at the
            bottom for "sun-baked dirt closer to the camera". */}
        <linearGradient id="badlands-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c89866" />
          <stop offset="55%" stopColor="#a06f44" />
          <stop offset="100%" stopColor="#6e4828" />
        </linearGradient>
        <radialGradient id="badlands-sun" cx="0.25" cy="0.18" r="0.55">
          <stop offset="0%" stopColor="rgba(255,220,150,0.40)" />
          <stop offset="100%" stopColor="rgba(255,220,150,0)" />
        </radialGradient>
        <radialGradient id="badlands-vignette" cx="0.5" cy="0.55" r="0.75">
          <stop offset="55%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(20,12,4,0.55)" />
        </radialGradient>
        {/* Sand grain noise — 1px specks at low opacity, tiled. */}
        <pattern
          id="badlands-grain"
          x="0"
          y="0"
          width="32"
          height="32"
          patternUnits="userSpaceOnUse"
        >
          <rect width="32" height="32" fill="transparent" />
          <rect x="4" y="6" width="1" height="1" fill="rgba(255,225,180,0.20)" />
          <rect x="15" y="14" width="1" height="1" fill="rgba(0,0,0,0.18)" />
          <rect x="28" y="10" width="1" height="1" fill="rgba(255,225,180,0.15)" />
          <rect x="9" y="22" width="1" height="1" fill="rgba(0,0,0,0.18)" />
          <rect x="22" y="28" width="1" height="1" fill="rgba(255,225,180,0.18)" />
          <rect x="6" y="30" width="1" height="1" fill="rgba(0,0,0,0.15)" />
          <rect x="18" y="4" width="1" height="1" fill="rgba(255,225,180,0.12)" />
        </pattern>
        {/* Sand ripples — diagonal crests every ~10 units. */}
        <pattern
          id="badlands-ripples"
          x="0"
          y="0"
          width="80"
          height="20"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-6)"
        >
          <rect width="80" height="20" fill="transparent" />
          <path
            d="M0 12 Q 20 8, 40 12 T 80 12"
            fill="none"
            stroke="rgba(255,225,180,0.10)"
            strokeWidth="1"
          />
          <path
            d="M0 16 Q 20 12, 40 16 T 80 16"
            fill="none"
            stroke="rgba(60,38,20,0.18)"
            strokeWidth="1"
          />
        </pattern>
      </defs>

      <rect width={VB_W} height={VB_H} fill="url(#badlands-base)" />
      <rect width={VB_W} height={VB_H} fill="url(#badlands-sun)" />
      <rect width={VB_W} height={VB_H} fill="url(#badlands-ripples)" />
      <rect width={VB_W} height={VB_H} fill="url(#badlands-grain)" />

      {/* Distant horizon mesa — a flat-topped silhouette across
          the upper third sells the depth of the desert. */}
      <Mesas />

      {/* Decorations are painted before the vignette so the
          dark edges deepen them. */}
      <g>
        {CRACKS.map((crack, i) => (
          <Crack key={`crack-${i}`} points={crack} />
        ))}
        {BOULDERS.map((b, i) => (
          <BoulderShape key={`boulder-${i}`} boulder={b} />
        ))}
        {CACTI.map(([cx, by, h], i) => (
          <CactusShape key={`cactus-${i}`} cx={cx} baseY={by} height={h} />
        ))}
        {BONES.map(([cx, cy, kind], i) => (
          <BoneShape key={`bone-${i}`} cx={cx} cy={cy} kind={kind} />
        ))}
      </g>

      {/* Wandering critter — single instance at a time. */}
      <BadlandsCreatures width={VB_W} height={VB_H} />

      {/* Edge vignette tops everything so the corners get the
          dusty falloff regardless of decoration density. */}
      <rect width={VB_W} height={VB_H} fill="url(#badlands-vignette)" />
    </svg>
  );
}

function Mesas() {
  // Two staggered flat-topped mesas in the upper third. Tones
  // are deliberately desaturated so they read as far away
  // through atmospheric haze.
  return (
    <g aria-hidden>
      <path
        d="M -20,140 L 60,140 L 90,118 L 230,118 L 260,140 L 360,140 L 360,150 L -20,150 Z"
        fill="rgba(110,75,55,0.55)"
      />
      <path
        d="M 440,138 L 540,138 L 580,116 L 720,116 L 760,138 L 830,138 L 830,150 L 440,150 Z"
        fill="rgba(100,70,52,0.55)"
      />
      {/* A faint band of haze at the mesa base ties them to the
          sand below. */}
      <rect
        x="-20"
        y="142"
        width={VB_W + 40}
        height="14"
        fill="rgba(180,140,100,0.18)"
      />
    </g>
  );
}

function BoulderShape({ boulder }: { boulder: Boulder }) {
  const [cx, cy, baseSize, color] = boulder;
  // Boulder = a stack of three rects forming a rough rock
  // silhouette, plus a highlight + shadow pixel cluster.
  const s = baseSize * FEATURE_SCALE;
  const r = s / 2;
  return (
    <g>
      <rect
        x={cx - r}
        y={cy - r + s * 0.15}
        width={s}
        height={s * 0.7}
        fill={color}
        rx={s * 0.2}
      />
      <rect
        x={cx - r * 0.7}
        y={cy - r}
        width={s * 0.7}
        height={s * 0.55}
        fill={color}
        rx={s * 0.25}
      />
      {/* Highlight on the upper-left */}
      <rect
        x={cx - r * 0.5}
        y={cy - r * 0.7}
        width={s * 0.18}
        height={s * 0.16}
        fill="rgba(255,225,180,0.35)"
      />
      {/* Shadow cast on the sand */}
      <rect
        x={cx - r * 0.6}
        y={cy + r * 0.55}
        width={s * 1.1}
        height={s * 0.18}
        fill="rgba(0,0,0,0.28)"
        rx={s * 0.1}
      />
    </g>
  );
}

function CactusShape({
  cx,
  baseY,
  height: baseHeight,
}: {
  cx: number;
  baseY: number;
  height: number;
}) {
  // Saguaro silhouette: central trunk + 1-2 arms branching up.
  const height = baseHeight * FEATURE_SCALE;
  const trunkW = Math.max(3, height * 0.18);
  const armOffset = height * 0.5;
  return (
    <g>
      {/* Trunk */}
      <rect
        x={cx - trunkW / 2}
        y={baseY - height}
        width={trunkW}
        height={height}
        fill="#3a5028"
        rx={trunkW * 0.3}
      />
      {/* Left arm */}
      <rect
        x={cx - trunkW * 1.6}
        y={baseY - height + armOffset}
        width={trunkW * 0.8}
        height={height * 0.4}
        fill="#3a5028"
        rx={trunkW * 0.3}
      />
      <rect
        x={cx - trunkW * 1.6}
        y={baseY - height + armOffset - trunkW * 0.5}
        width={trunkW * 0.8}
        height={trunkW * 0.8}
        fill="#3a5028"
        rx={trunkW * 0.3}
      />
      {/* Right arm — slightly shorter for asymmetry */}
      <rect
        x={cx + trunkW * 0.6}
        y={baseY - height + armOffset + height * 0.05}
        width={trunkW * 0.7}
        height={height * 0.3}
        fill="#3a5028"
        rx={trunkW * 0.3}
      />
      <rect
        x={cx + trunkW * 0.6}
        y={baseY - height + armOffset + height * 0.05 - trunkW * 0.4}
        width={trunkW * 0.7}
        height={trunkW * 0.7}
        fill="#3a5028"
        rx={trunkW * 0.3}
      />
      {/* Highlight ridge */}
      <rect
        x={cx - trunkW / 2 + 0.5}
        y={baseY - height + 2}
        width={1}
        height={height - 4}
        fill="rgba(120,160,90,0.45)"
      />
      {/* Shadow at base */}
      <ellipse
        cx={cx}
        cy={baseY + 1}
        rx={trunkW * 1.4}
        ry={1.2}
        fill="rgba(0,0,0,0.28)"
      />
    </g>
  );
}

function BoneShape({ cx, cy, kind }: { cx: number; cy: number; kind: 0 | 1 | 2 }) {
  const fill = "rgba(235,222,200,0.85)";
  const shadow = "rgba(0,0,0,0.25)";
  const k = FEATURE_SCALE;
  if (kind === 0) {
    // Vertebra — small cross
    return (
      <g>
        <rect x={cx - 0.5 * k} y={cy + 0.5 * k} width={4 * k} height={1 * k} fill={shadow} />
        <rect x={cx + 0.5 * k} y={cy - 1.5 * k} width={1 * k} height={4 * k} fill={shadow} />
        <rect x={cx - 1 * k} y={cy} width={4 * k} height={1 * k} fill={fill} />
        <rect x={cx} y={cy - 2 * k} width={1 * k} height={4 * k} fill={fill} />
      </g>
    );
  }
  if (kind === 1) {
    // Rib — curved arc
    return (
      <g>
        <path
          d={`M ${cx - 6 * k} ${cy + 1 * k} Q ${cx} ${cy - 4 * k} ${cx + 6 * k} ${cy + 1 * k}`}
          stroke={shadow}
          strokeWidth={1.5 * k}
          fill="none"
        />
        <path
          d={`M ${cx - 6 * k} ${cy} Q ${cx} ${cy - 5 * k} ${cx + 6 * k} ${cy}`}
          stroke={fill}
          strokeWidth={1.5 * k}
          fill="none"
        />
      </g>
    );
  }
  // Skull fragment — small irregular dot cluster
  return (
    <g>
      <rect x={cx - 1 * k} y={cy + 1 * k} width={4 * k} height={3 * k} fill={shadow} rx={1 * k} />
      <rect x={cx - 2 * k} y={cy - 1 * k} width={4 * k} height={3 * k} fill={fill} rx={1 * k} />
      <rect x={cx} y={cy + 1 * k} width={1 * k} height={1 * k} fill="#2a1410" />
      <rect x={cx + 2 * k} y={cy + 1 * k} width={1 * k} height={1 * k} fill="#2a1410" />
    </g>
  );
}

function Crack({ points }: { points: Array<[number, number]> }) {
  if (points.length < 2) return null;
  const d = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
  return (
    <g>
      <path
        d={d}
        stroke="rgba(0,0,0,0.45)"
        strokeWidth={1.2 * FEATURE_SCALE}
        fill="none"
      />
      <path
        d={d}
        stroke="rgba(255,220,170,0.18)"
        strokeWidth={0.5 * FEATURE_SCALE}
        fill="none"
        transform={`translate(0,${0.6 * FEATURE_SCALE})`}
      />
    </g>
  );
}
