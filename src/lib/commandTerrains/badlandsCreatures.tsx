// Badlands creature subsystem.
//
// Spawns one (1) pixel-art critter at a time that walks across
// the field, then disappears. Spawn cadence is intentionally
// slow so the field feels mostly still — the creature is a
// background-life flourish, not a centerpiece.
//
// Frame is a 12-column × 10-row grid; one <rect> per pixel,
// rendered into the parent SVG's coordinate space. The creature
// walks via CSS transition on `left`/`top` with the SVG
// `transform` attribute kept in sync (rotated to face heading).
//
// Skipped entirely when prefers-reduced-motion is on.

import { useEffect, useRef, useState } from "react";

const COLS = 12;
const ROWS = 10;

// Each frame is ROWS strings of COLS characters. '.' = empty,
// any other char = pixel (color picked by the creature def).
type Frame = string[];

interface CreatureDef {
  id: string;
  /** Pixel-art frames, played in rotation while walking. Two
   *  frames is enough for a believable leg-shuffle gait. */
  frames: Frame[];
  /** Foreground pixel color. */
  color: string;
  /** Optional shadow color (drawn at +1 pixel offset to ground
   *  the sprite against the sand). */
  shadow?: string;
  /** World-pixel size of each "pixel" of the sprite. The
   *  creature renders at COLS * pxSize × ROWS * pxSize in SVG
   *  user units. */
  pxSize: number;
}

// Scorpion — body left-of-center with tail curling up over
// itself, pincers leading. Two frames swap leg positions.
const SCORPION: CreatureDef = {
  id: "scorpion",
  color: "#3a2418",
  shadow: "rgba(0,0,0,0.35)",
  pxSize: 2.2,
  frames: [
    [
      "............",
      "............",
      "..........#.",
      ".........##.",
      "........##..",
      "..XX..####..",
      "X..XXX###...",
      "..XX..####..",
      ".X.X.X.X....",
      "............",
    ],
    [
      "............",
      "............",
      "..........#.",
      ".........##.",
      "........##..",
      "..XX..####..",
      "X..XXX###...",
      "..XX..####..",
      "X.X.X.X.....",
      "............",
    ],
  ],
};

// Lizard — long body, four splayed legs, whip tail. Top-down,
// heading right (the renderer rotates per heading).
const LIZARD: CreatureDef = {
  id: "lizard",
  color: "#5a4626",
  shadow: "rgba(0,0,0,0.32)",
  pxSize: 2.0,
  frames: [
    [
      "............",
      "....##......",
      "...####.....",
      "..######....",
      ".########X..",
      "..######....",
      "...####.....",
      ".X........X.",
      "............",
      "............",
    ],
    [
      "............",
      "....##......",
      "...####.....",
      "..######....",
      ".########.X.",
      "..######....",
      "...####.....",
      "X..........X",
      "............",
      "............",
    ],
  ],
};

// Beetle — small, dome-shaped carapace, six tiny legs.
const BEETLE: CreatureDef = {
  id: "beetle",
  color: "#1c1410",
  shadow: "rgba(0,0,0,0.35)",
  pxSize: 1.8,
  frames: [
    [
      "............",
      "............",
      "............",
      "....####....",
      "...######...",
      "...######...",
      "....####....",
      "....X..X....",
      "...X....X...",
      "............",
    ],
    [
      "............",
      "............",
      "............",
      "....####....",
      "...######...",
      "...######...",
      "....####....",
      "...X....X...",
      "....X..X....",
      "............",
    ],
  ],
};

// Snake — segmented body that "slithers" via frame offset.
const SNAKE: CreatureDef = {
  id: "snake",
  color: "#48381c",
  shadow: "rgba(0,0,0,0.32)",
  pxSize: 1.9,
  frames: [
    [
      "............",
      "............",
      "............",
      "..##.....#..",
      ".#..##..#...",
      "....##.##...",
      ".....###....",
      "............",
      "............",
      "............",
    ],
    [
      "............",
      "............",
      "............",
      "...##.....#.",
      "..#..##..#..",
      ".....##.##..",
      "......###...",
      "............",
      "............",
      "............",
    ],
  ],
};

const CREATURES: CreatureDef[] = [SCORPION, LIZARD, BEETLE, SNAKE];

interface ActiveRun {
  def: CreatureDef;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  /** Heading in degrees, rotated so the sprite "faces" travel. */
  angle: number;
  /** Total traversal time in ms. */
  durationMs: number;
  /** Per-frame interval for the leg shuffle. */
  frameStepMs: number;
}

interface BadlandsCreaturesProps {
  /** SVG viewport width in user units (the parent viewBox W). */
  width: number;
  /** SVG viewport height in user units (the parent viewBox H). */
  height: number;
}

export function BadlandsCreatures({ width, height }: BadlandsCreaturesProps) {
  const [run, setRun] = useState<ActiveRun | null>(null);
  // Two-stage position: start lets the element mount at the
  // entry point on one render, then we set the end position on
  // the next render so the CSS transition picks up the delta.
  const [cur, setCur] = useState<{ x: number; y: number } | null>(null);
  const [frame, setFrame] = useState(0);
  const reducedRef = useRef(false);

  // Honor prefers-reduced-motion — no creatures, no movement.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reducedRef.current = e.matches;
      if (e.matches) setRun(null);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Idle → spawn scheduler. Picks a creature, plots a path
  // from one edge to another (or to a vanishing point), and
  // arms the next spawn after the run completes.
  useEffect(() => {
    if (run) return;
    if (reducedRef.current) return;
    // 30–120 s of stillness between sightings.
    const idleMs = 30_000 + Math.random() * 90_000;
    const t = setTimeout(() => {
      setRun(plotRun(width, height));
    }, idleMs);
    return () => clearTimeout(t);
  }, [run, width, height]);

  // Active-run bookkeeping: position the creature at the entry,
  // schedule the despawn, drive the walk-cycle frame swap.
  useEffect(() => {
    if (!run) {
      setCur(null);
      return;
    }
    setCur({ x: run.startX, y: run.startY });
    // Next frame: trigger the transition to the end position.
    const raf = requestAnimationFrame(() => {
      setCur({ x: run.endX, y: run.endY });
    });
    const despawn = setTimeout(() => {
      setRun(null);
    }, run.durationMs + 800);
    const frameTimer = setInterval(() => {
      setFrame((f) => (f + 1) % run.def.frames.length);
    }, run.frameStepMs);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(despawn);
      clearInterval(frameTimer);
    };
  }, [run]);

  if (!run || !cur) return null;

  const { def, angle, durationMs } = run;
  const pose = def.frames[frame % def.frames.length] ?? def.frames[0]!;
  const spriteW = COLS * def.pxSize;
  const spriteH = ROWS * def.pxSize;

  return (
    <g
      style={{
        transform: `translate(${cur.x}px, ${cur.y}px) rotate(${angle}deg)`,
        transformOrigin: "0 0",
        transformBox: "fill-box",
        transition: `transform ${durationMs}ms linear`,
        // Fade out near the end of the run so the despawn
        // doesn't pop. Two-stage transition on opacity would
        // require another state hop; this CSS keyframe is
        // simpler and matches the run duration.
        animation: `badlands-creature-fade ${durationMs + 800}ms ease-in-out 1`,
      }}
    >
      <style>{`
        @keyframes badlands-creature-fade {
          0%   { opacity: 0; }
          8%   { opacity: 1; }
          88%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
      {/* Shadow drop — same pose, offset down-right one pixel,
          darker color, sits below the foreground draw order. */}
      {def.shadow && (
        <PoseRects
          pose={pose}
          color={def.shadow}
          pxSize={def.pxSize}
          offsetX={def.pxSize * 0.5}
          offsetY={def.pxSize * 0.6}
          originX={-spriteW / 2}
          originY={-spriteH / 2}
        />
      )}
      <PoseRects
        pose={pose}
        color={def.color}
        pxSize={def.pxSize}
        originX={-spriteW / 2}
        originY={-spriteH / 2}
      />
    </g>
  );
}

function PoseRects({
  pose,
  color,
  pxSize,
  offsetX = 0,
  offsetY = 0,
  originX,
  originY,
}: {
  pose: Frame;
  color: string;
  pxSize: number;
  offsetX?: number;
  offsetY?: number;
  originX: number;
  originY: number;
}) {
  const rects: React.ReactNode[] = [];
  for (let y = 0; y < pose.length; y++) {
    const row = pose[y]!;
    for (let x = 0; x < row.length; x++) {
      if (row[x] === ".") continue;
      rects.push(
        <rect
          key={`${x},${y}`}
          x={originX + x * pxSize + offsetX}
          y={originY + y * pxSize + offsetY}
          width={pxSize}
          height={pxSize}
          fill={color}
        />,
      );
    }
  }
  return <>{rects}</>;
}

function plotRun(width: number, height: number): ActiveRun {
  const def = CREATURES[Math.floor(Math.random() * CREATURES.length)]!;
  // Pick an entry edge (0=L, 1=R, 2=T, 3=B) and a target
  // somewhere on a different edge so the creature crosses the
  // field visibly. Margin keeps sprites out of the corner.
  const margin = 30;
  const inset = 60;
  const sides = [0, 1, 2, 3];
  const startSide = sides[Math.floor(Math.random() * 4)]!;
  let endSide = sides[Math.floor(Math.random() * 4)]!;
  if (endSide === startSide) endSide = (startSide + 2) % 4;

  const pickOn = (side: number): [number, number] => {
    switch (side) {
      case 0:
        return [-inset, margin + Math.random() * (height - margin * 2)];
      case 1:
        return [width + inset, margin + Math.random() * (height - margin * 2)];
      case 2:
        return [margin + Math.random() * (width - margin * 2), -inset];
      default:
        return [margin + Math.random() * (width - margin * 2), height + inset];
    }
  };
  const [sx, sy] = pickOn(startSide);
  const [ex, ey] = pickOn(endSide);
  const dx = ex - sx;
  const dy = ey - sy;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  // 18–45 s to traverse — slow enough to feel like a wandering
  // critter, not a dart.
  const durationMs = 18_000 + Math.random() * 27_000;
  return {
    def,
    startX: sx,
    startY: sy,
    endX: ex,
    endY: ey,
    angle,
    durationMs,
    frameStepMs: 220 + Math.random() * 140,
  };
}
