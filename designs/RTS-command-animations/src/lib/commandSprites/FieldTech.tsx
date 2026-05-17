/* src/lib/commandSprites/FieldTech.tsx — Forward Observer Field Tech. */

import React from "react";

export type AgentState =
  | "idle" | "thinking" | "tool_running" | "streaming"
  | "awaiting_permission" | "done" | "error";

export type TransientAnimation = "spawning" | "deploying";
export type AccentColor = "slate" | "blue" | "violet" | "green" | "orange" | "rose";
export type ArmorTemplate = "steel" | "graphite" | "olive" | "tan" | "navy" | "forest" | "maroon";
export type GunTemplate = "chrome" | "matte" | "gunmetal" | "bronze" | "sand" | "forest";
export type Facing = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export interface UnitProps {
  state: AgentState;
  transient?: TransientAnimation;
  accent: AccentColor;
  size?: number;
  facing?: Facing;
  armorTemplate?: ArmorTemplate;
  gunTemplate?: GunTemplate;
  darkness?: number;
}



/* ============================================================ Color helpers (shared family) */

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function rgbToHex([r,g,b]) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2,"0");
  return "#" + c(r)+c(g)+c(b);
}
function mix(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
function shiftValue(rgb, t) {
  if (t === 0) return rgb;
  if (t > 0)  return mix(rgb, [0,0,0], Math.min(0.9, t));
  return mix(rgb, [255,255,255], Math.min(0.9, -t));
}

const ACCENTS = {
  slate:  "#64748b",
  blue:   "#3b82f6",
  violet: "#8b5cf6",
  green:  "#22c55e",
  orange: "#f97316",
  rose:   "#f43f5e",
};
const ACCENT_BLACK = [10,12,16];
const ACCENT_WHITE = [240,245,255];
function accentColors(hex) {
  const base = hexToRgb(hex);
  return {
    V: rgbToHex(base),
    v: rgbToHex(mix(base, ACCENT_WHITE, 0.45)),
    err: rgbToHex(mix(base, ACCENT_BLACK, 0.75)),
  };
}

const ARMOR_TEMPLATES = {
  steel:    { name: "Steel Gray",   base: "#262b33", swatch: "#3a414c" },
  graphite: { name: "Graphite",     base: "#222226", swatch: "#3d3e44" },
  olive:    { name: "Olive Drab",   base: "#3a3a23", swatch: "#5c5c3a" },
  tan:      { name: "Desert Tan",   base: "#594a32", swatch: "#7d6a4a" },
  navy:     { name: "Navy",         base: "#1d2a4c", swatch: "#324369" },
  forest:   { name: "Forest Green", base: "#1f3a23", swatch: "#365a3c" },
  maroon:   { name: "Maroon",       base: "#3a1f25", swatch: "#5a3034" },
};
const ARMOR_HIGHLIGHT = [225, 228, 232];
const ARMOR_SHADOW    = [4, 6, 10];
function buildArmorRamp(baseHex, darkness = 0) {
  const base = shiftValue(hexToRgb(baseHex), darkness);
  return {
    V0: rgbToHex(mix(base, ARMOR_SHADOW,    0.7)),
    V1: rgbToHex(mix(base, ARMOR_SHADOW,    0.4)),
    V2: rgbToHex(base),
    V3: rgbToHex(mix(base, ARMOR_HIGHLIGHT, 0.30)),
    V4: rgbToHex(mix(base, ARMOR_HIGHLIGHT, 0.60)),
  };
}

const GUN_TEMPLATES = {
  chrome:   { name: "Chrome",       base: "#5a6270", swatch: "#9aa3b2" },
  matte:    { name: "Matte Black",  base: "#1f2025", swatch: "#3a3d44" },
  gunmetal: { name: "Gunmetal",     base: "#3c424a", swatch: "#6a717c" },
  bronze:   { name: "Bronze",       base: "#6e4628", swatch: "#a3724c" },
  sand:     { name: "Sand",         base: "#5e4a30", swatch: "#9a8055" },
  forest:   { name: "Forest Stock", base: "#2d3a26", swatch: "#4d5e40" },
};
const GUN_SHADOW    = [3, 4, 8];
const GUN_HIGHLIGHT = [232, 236, 244];
function buildGunRamp(baseHex, darkness = 0) {
  const base = shiftValue(hexToRgb(baseHex), darkness);
  return {
    g: rgbToHex(mix(base, GUN_SHADOW,    0.7)),
    G: rgbToHex(base),
    M: rgbToHex(mix(base, GUN_HIGHLIGHT, 0.55)),
    m: rgbToHex(mix(base, GUN_SHADOW,    0.85)),
  };
}

const FIXED_REST = {
  X: "#06080b", b: "#1a1d22", P: "#0b0d10", u: "#15181d", k: "#0a0c10", r: "#2b2f37",
  h: "#0a0c10",
  W: "#dee2e6",     // bubble / parachute chord
  R: "#ef2c3a",     // error red (matches family)
  e: "#a01818",     // error red dim
};
const SHADOW_TONES = {
  z: "rgba(0,0,0,0.55)", y: "rgba(0,0,0,0.32)", w: "rgba(0,0,0,0.16)",
};

/* ============================================================ Stencil — Variant C base */

const W = 48, H = 48;

function R(...segs) {
  const chars = new Array(W).fill(".");
  for (const [at, s] of segs) {
    for (let i = 0; i < s.length; i++) {
      const x = at + i;
      if (x >= 0 && x < W && s[i] !== " ") chars[x] = s[i];
    }
  }
  return chars.join("");
}

const STENCIL = [
  R(),                                                                 // 00
  R([28, "g"]),                                                        // 01 antenna tip
  R([28, "g"]),                                                        // 02
  R([28, "g"]),                                                        // 03
  R([28, "g"]),                                                        // 04
  R([21, "445544"], [28, "g"]),                                        // 05 helmet apex + antenna base
  R([20, "44555544"], [28, "g"]),                                      // 06
  R([19, "4555555443"]),                                               // 07 helmet widest
  R([19, "4555555443"]),                                               // 08
  // Binocular bar — rows 9-11 cols 18-30. Lenses (V/v) on row 10.
  R([18, "gMGGGgggGGGMg"]),                                            // 09 housing top
  R([18, "gMVvVggvVvVMg"]),                                            // 10 LENSES (accent — TCZ)
  R([18, "gGGGGggGGGGGg"]),                                            // 11 housing bottom
  R([20, "33333333"]),                                                 // 12 chin
  R([21, "u3333u"]),                                                   // 13 jaw underline
  R([22, "uuuu"]),                                                     // 14 neck
  // Radio backpack — wider dorsal bump behind the shoulders
  R([16, "GGGgggrrrrgggGGG"]),                                         // 15 backpack rim
  R([16, "V44443333334444V"]),                                         // 16 pauldrons widest + accent rim
  R([17, "44333333333344"]),                                           // 17 torso top
  R([17, "44333333333344"]),                                           // 18 torso
  R([17, "44333333VVV344"]),                                           // 19 torso + accent chest indicator
  R([15, "33"], [17, "44333333333344"], [31, "MG"]),                   // 20 LEFT arm + torso + carbine begin
  R([15, "33"], [17, "44333333333344"], [28, "33MGM"]),                // 21 + right arm stub + carbine
  R([15, "33"], [17, "44333333333344"], [28, "GMGg"]),                 // 22 + carbine
  R([15, "33"], [17, "44333333333344"], [28, "MGgg"]),                 // 23 + carbine
  R([15, "33"], [17, "33333333333334"], [28, "GGgg"]),                 // 24 + carbine
  R([18, "33kkVVkk333"], [28, "GGgg"]),                                // 25 belt + accent buckle + carbine
  R([18, "33333333333"], [28, "Ggg"]),                                 // 26 hips + carbine taper
  R([19, "3343"], [25, "3433"], [29, "Gg"]),                           // 27 legs begin + carbine taper
  R([19, "3343"], [25, "3433"], [29, "mg"]),                           // 28 + muzzle
  R([19, "3343"], [25, "3433"]),                                       // 29
  R([19, "3343"], [25, "3433"]),                                       // 30
  R([19, "2343"], [25, "3432"]),                                       // 31 knee
  R([19, "3343"], [25, "3433"]),                                       // 32
  R([19, "3343"], [25, "3433"]),                                       // 33
  R([19, "3343"], [25, "3433"]),                                       // 34
  R([19, "2233"], [25, "3322"]),                                       // 35 ankle
  R([18, "bbbbb"], [25, "bbbbb"]),                                     // 36 boot tops
  R([18, "bPPPb"], [25, "bPPPb"]),                                     // 37
  R([18, "PPPPP"], [25, "PPPPP"]),                                     // 38 boot soles
  R(), R(), R(), R(), R(), R(), R(), R(), R(),                         // 39-47
];

/* ============================================================ Grid build + classification */

function classifyPixel(c, x, y) {
  if (c === "z" || c === "y" || c === "w") return "shadow";
  // Antenna: vertical spike at col 28, rows 0-6
  if (x === 28 && y >= 0 && y <= 6 && c === "g") return "antenna";
  // Binoculars: full 3-row optic bar
  if (y >= 9 && y <= 11 && x >= 18 && x <= 30) return "binoculars";
  // Carbine: g/G/M/m codes anywhere except the binocular/antenna ranges
  if (c === "g" || c === "G" || c === "M" || c === "m") return "carbine";
  // Backpack rim (row 15) — gunmetal/rivet codes already caught above
  if (y === 15) return "backpack";
  // Right arm stub at cols 28-29, row 21 (right where carbine emerges)
  if (y === 21 && (x === 28 || x === 29)) return "rightArm";
  // Left arm — cols 15-17, rows 20-25 (the small protruding side arm)
  if (y >= 20 && y <= 25 && (x === 15 || x === 16 || x === 17)) return "leftArm";
  // Boots + legs
  if (y >= 36) return "boots";
  if (y >= 27) return "legs";
  // Helmet (rows 5-13, excluding binocular zone which already returned above)
  if (y >= 5 && y <= 14) return "head";
  // Default — torso, hips, belt
  return "body";
}

function newGrid() { return Array.from({length: H}, () => Array(W).fill(".")); }

function buildGrid() {
  const g = newGrid();
  for (let y = 0; y < STENCIL.length; y++) {
    const row = STENCIL[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch !== "." && ch !== " ") g[y][x] = ch;
    }
  }
  // Outline pass
  const SHAD = new Set(["z","y","w"]);
  const skip = (c) => c === "." || c === "X" || SHAD.has(c);
  const out = g.map((row) => [...row]);
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (g[y][x] !== ".") continue;
      for (const [dx, dy] of dirs) {
        const nx = x+dx, ny = y+dy;
        if (nx>=0 && nx<W && ny>=0 && ny<H && !skip(g[ny][nx])) { out[y][x] = "X"; break; }
      }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y][x] = out[y][x];
  // Ground shadow
  const cx = 23, cy = 41, rx = 12, ry = 2;
  for (let dy = -ry-1; dy <= ry+1; dy++) {
    for (let dx = -rx-1; dx <= rx+1; dx++) {
      const nx = dx/(rx+0.5), ny = dy/(ry+0.5);
      const d2 = nx*nx + ny*ny;
      if (d2 > 1.2) continue;
      const x = cx+dx, y = cy+dy;
      if (x<0 || x>=W || y<0 || y>=H || g[y][x] !== ".") continue;
      if (d2 < 0.5) g[y][x] = "z";
      else if (d2 < 0.85) g[y][x] = "y";
      else g[y][x] = "w";
    }
  }
  return g;
}

function gridToGroupedRects(grid) {
  const groups = {
    shadow:[], antenna:[], binoculars:[], head:[],
    backpack:[], body:[], leftArm:[], rightArm:[], carbine:[],
    legs:[], boots:[],
  };
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = grid[y][x];
      if (c === ".") { x++; continue; }
      const grp = classifyPixel(c, x, y);
      let xEnd = x + 1;
      while (xEnd < W && grid[y][xEnd] === c && classifyPixel(c, xEnd, y) === grp) xEnd++;
      groups[grp].push({ x, y, w: xEnd - x, h: 1, code: c });
      x = xEnd;
    }
  }
  return groups;
}

const BASE_GRID = buildGrid();
const GROUPED = gridToGroupedRects(BASE_GRID);

/* ============================================================ Color resolver */

function resolveColor(code, ramps, errorMode) {
  if (code === "1") return ramps.armor.V0;
  if (code === "2") return ramps.armor.V1;
  if (code === "3") return ramps.armor.V2;
  if (code === "4") return ramps.armor.V3;
  if (code === "5") return ramps.armor.V4;
  if (code === "g") return ramps.gun.g;
  if (code === "G") return ramps.gun.G;
  if (code === "M") return ramps.gun.M;
  if (code === "m") return ramps.gun.m;
  if (code === "V") return errorMode ? ramps.acc.err : ramps.acc.V;
  if (code === "v") return errorMode ? ramps.acc.err : ramps.acc.v;
  if (code === "z" || code === "y" || code === "w") return SHADOW_TONES[code];
  return FIXED_REST[code] || "#f0f";
}

function renderRects(rects, ramps, errorMode) {
  return rects.map((r, i) => (
    <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={resolveColor(r.code, ramps, errorMode)} />
  ));
}

/* ============================================================ Overlays
 *
 * Under-visor: a thin accent visor that lives BENEATH the binocular bar.
 * Normally hidden by the (opaque) binoculars. Revealed when the binoculars
 * translate down — used in awaiting_permission and done.
 */
const UNDER_VISOR = [];   // unused — kept for stability after the
                          // "lower the binoculars" pose was removed

/* Tool running — BINOCULARS REMOVED overlay. When she's scanning the
 * artifact, the binoculars hide and the face reads with a glowing
 * VISOR strip instead. TOOL_HELMET_LOWER fills the row-9 helmet gap
 * (where the binocular housing top used to be) so the silhouette
 * stays closed. TOOL_VISOR is a clean 8-px wide accent strip at
 * rows 10-11 (3-armor border at cols 19, 28; accent v/V interior at
 * cols 20-27) that glows in lockstep with the beam's pulse. */
const TOOL_HELMET_LOWER = [
  { x: 19, y: 9, w: 1, h: 1, c: "4" },
  { x: 20, y: 9, w: 8, h: 1, c: "5" },   // bright top-light helmet arc
  { x: 28, y: 9, w: 1, h: 1, c: "4" },
  // 1-px dark outline at the side edges so the silhouette reads clean
  { x: 18, y: 9, w: 1, h: 1, c: "X" },
  { x: 29, y: 9, w: 1, h: 1, c: "X" },
];
const TOOL_VISOR = [
  // Armor borders at cols 19 + 28
  { x: 19, y: 10, w: 1, h: 1, c: "3" },
  { x: 28, y: 10, w: 1, h: 1, c: "3" },
  { x: 19, y: 11, w: 1, h: 1, c: "3" },
  { x: 28, y: 11, w: 1, h: 1, c: "3" },
  // Visor strip — accent spec top, accent base bottom
  { x: 20, y: 10, w: 8, h: 1, c: "v" },
  { x: 20, y: 11, w: 8, h: 1, c: "V" },
  // 1-px dark outline on the sides + below to close the silhouette
  { x: 18, y: 10, w: 1, h: 2, c: "X" },
  { x: 29, y: 10, w: 1, h: 2, c: "X" },
];

/* Thinking — raised eyebrow above the LEFT binocular lens (3 bright
 * accent pixels in the top of the housing, replacing the gunmetal). The
 * brow is only visible while the chin hand is up (animated together). */
const THINKING_BROW = [
  { x: 19, y: 9, w: 1, h: 1, c: "v" },
  { x: 20, y: 9, w: 1, h: 1, c: "v" },
  { x: 21, y: 9, w: 1, h: 1, c: "v" },
];

/* Thinking — gloved hand at the chin (Marine vocabulary verbatim). Two
 * single-pixel rects positioned just under the chin row. The hand
 * jiggles in place to read as a scratch. */
const THINKING_HAND = [
  { x: 23, y: 13, w: 2, h: 1, c: "h" },
  { x: 24, y: 14, w: 1, h: 1, c: "h" },
];

/* Tool running — FOREIGN OBJECT on the ground next to her, scanned by
 * the binoculars. The artifact sits on her right (cols 34-39, rows
 * 40-44), with accent crystal facets + a white center pip. A diagonal
 * scan BEAM emits from the right edge of the binoculars (~col 28 row
 * 11) down to the artifact; a single bright "scan-cursor" pixel sweeps
 * L→R across the artifact's top surface to indicate active scan. */
const FOREIGN_OBJECT = [
  // top edge — dark outline
  { x: 35, y: 40, w: 3, h: 1, c: "X" },
  // mid surface — accent facets
  { x: 34, y: 41, w: 1, h: 1, c: "X" },
  { x: 35, y: 41, w: 1, h: 1, c: "V" },
  { x: 36, y: 41, w: 1, h: 1, c: "v" },
  { x: 37, y: 41, w: 1, h: 1, c: "V" },
  { x: 38, y: 41, w: 1, h: 1, c: "X" },
  // widest mid row with white center pip
  { x: 33, y: 42, w: 1, h: 1, c: "X" },
  { x: 34, y: 42, w: 1, h: 1, c: "V" },
  { x: 35, y: 42, w: 1, h: 1, c: "v" },
  { x: 36, y: 42, w: 1, h: 1, c: "W" },
  { x: 37, y: 42, w: 1, h: 1, c: "v" },
  { x: 38, y: 42, w: 1, h: 1, c: "V" },
  { x: 39, y: 42, w: 1, h: 1, c: "X" },
  // lower facet row
  { x: 34, y: 43, w: 1, h: 1, c: "X" },
  { x: 35, y: 43, w: 1, h: 1, c: "V" },
  { x: 36, y: 43, w: 1, h: 1, c: "V" },
  { x: 37, y: 43, w: 1, h: 1, c: "V" },
  { x: 38, y: 43, w: 1, h: 1, c: "X" },
  // bottom edge
  { x: 35, y: 44, w: 3, h: 1, c: "X" },
];

/* Tool running — BEAM TRIANGLE emitting from her binoculars to the
 * scan line on the artifact. The WHOLE triangle translates L→R as
 * one unit (no pivot), so the apex SWEEPS ALONG her binocular bar
 * (from col 22 to col 28) while the base sweeps over the artifact
 * (from col 33 to col 39). Apex sits on the binocular housing
 * throughout the sweep — reads as "beam emitting from binoculars,
 * source point moving L→R along the bar". The whole triangle pulses
 * opacity in lockstep with the sweep. */
const SCAN_BEAM_TRIANGLE = [
  // Top diagonal: apex (22, 11) → base top-corner (33, 40)
  { x: 22, y: 11, w: 1, h: 3, c: "v" },
  { x: 23, y: 14, w: 1, h: 2, c: "v" },
  { x: 24, y: 16, w: 1, h: 3, c: "v" },
  { x: 25, y: 19, w: 1, h: 3, c: "v" },
  { x: 26, y: 22, w: 1, h: 3, c: "v" },
  { x: 27, y: 25, w: 1, h: 2, c: "v" },
  { x: 28, y: 27, w: 1, h: 3, c: "v" },
  { x: 29, y: 30, w: 1, h: 3, c: "v" },
  { x: 30, y: 33, w: 1, h: 2, c: "v" },
  { x: 31, y: 35, w: 1, h: 3, c: "v" },
  { x: 32, y: 38, w: 1, h: 2, c: "v" },
  // Bottom diagonal: apex (22, 11) → base bottom-corner (33, 44)
  { x: 22, y: 11, w: 1, h: 3, c: "v" },
  { x: 23, y: 14, w: 1, h: 3, c: "v" },
  { x: 24, y: 17, w: 1, h: 3, c: "v" },
  { x: 25, y: 20, w: 1, h: 3, c: "v" },
  { x: 26, y: 23, w: 1, h: 3, c: "v" },
  { x: 27, y: 26, w: 1, h: 3, c: "v" },
  { x: 28, y: 29, w: 1, h: 3, c: "v" },
  { x: 29, y: 32, w: 1, h: 3, c: "v" },
  { x: 30, y: 35, w: 1, h: 3, c: "v" },
  { x: 31, y: 38, w: 1, h: 3, c: "v" },
  { x: 32, y: 41, w: 1, h: 3, c: "v" },
  // Base scan line ON the artifact (col 33 rows 40-44)
  { x: 33, y: 40, w: 1, h: 5, c: "v" },
];

/* Streaming — radio dots rising from the antenna. Three single-pixel
 * accent dots above the antenna tip, sequenced. Antenna tip is at
 * (28, 1); the dots rise to (28, -1) and fade. */
const RADIO_DOTS = [
  { id: 1, x: 28, y: 0 },
  { id: 2, x: 28, y: 0 },
  { id: 3, x: 28, y: 0 },
];

/* Streaming — speech bubble with a 1-px BLACK BORDER (per design
 * feedback), centered at cols 31-39 rows 0-4. The tail (last two
 * entries) breaks through the bottom-left of the border and points
 * down toward her mouth. */
const VOICE_BUBBLE = [
  // Top border
  { x: 32, y: 0, w: 7, h: 1, c: "k" },
  // Row 1: left border + white fill + right border
  { x: 31, y: 1, w: 1, h: 1, c: "k" },
  { x: 32, y: 1, w: 7, h: 1, c: "W" },
  { x: 39, y: 1, w: 1, h: 1, c: "k" },
  // Row 2: same
  { x: 31, y: 2, w: 1, h: 1, c: "k" },
  { x: 32, y: 2, w: 7, h: 1, c: "W" },
  { x: 39, y: 2, w: 1, h: 1, c: "k" },
  // Row 3: same
  { x: 31, y: 3, w: 1, h: 1, c: "k" },
  { x: 32, y: 3, w: 7, h: 1, c: "W" },
  { x: 39, y: 3, w: 1, h: 1, c: "k" },
  // Bottom border (skipping col 32 where the tail breaks through)
  { x: 33, y: 4, w: 6, h: 1, c: "k" },
  // Tail — 2-pixel diagonal pointing down-left toward her mouth
  { x: 32, y: 4, w: 1, h: 1, c: "k" },
  { x: 31, y: 5, w: 1, h: 1, c: "k" },
];
const VOICE_DOTS = [
  { id: 1, x: 33, y: 2 },
  { id: 2, x: 35, y: 2 },
  { id: 3, x: 37, y: 2 },
];

/* Error — flashing red lens overlay + mask (mask overdraws accent
 * between flashes). Same vocabulary as Marine. */
const ERROR_LENS_RED = [
  { x: 20, y: 10, w: 3, h: 1, c: "R" },
  { x: 25, y: 10, w: 3, h: 1, c: "R" },
];
const ERROR_LENS_MASK = [
  { x: 20, y: 10, w: 3, h: 1, c: "G" },
  { x: 25, y: 10, w: 3, h: 1, c: "G" },
];

/* Spawning — parachute REMOVED per design feedback (not enough room at
 * 48×48 to render a chute that reads clean). The unit now drops in
 * straight from above with the existing impact bounce. A brief white
 * dust puff sprays out at the boots on landing to cue arrival. */
const DUST_PUFF = [
  { x: 15, y: 39, w: 1, h: 1, c: "W" },
  { x: 16, y: 38, w: 1, h: 1, c: "W" },
  { x: 30, y: 38, w: 1, h: 1, c: "W" },
  { x: 31, y: 39, w: 1, h: 1, c: "W" },
  { x: 14, y: 40, w: 1, h: 1, c: "W" },
  { x: 32, y: 40, w: 1, h: 1, c: "W" },
];

/* Deploying — same big red button kit as Marine + Engineer. Pedestal
 * housing in gunmetal + bright red dome on top, sitting to the right of
 * the unit. Dome translates down 1 px on press; accent flash ring
 * radiates around the dome. */
const DEPLOY_BUTTON = [
  // Dome — red hemisphere with highlight + side shadow
  { x: 36, y: 27, w: 1, h: 1, c: "R" },
  { x: 37, y: 27, w: 1, h: 1, c: "W" },
  { x: 38, y: 27, w: 1, h: 1, c: "R" },
  { x: 39, y: 27, w: 1, h: 1, c: "e" },
  { x: 35, y: 28, w: 1, h: 1, c: "R" },
  { x: 36, y: 28, w: 1, h: 1, c: "R" },
  { x: 37, y: 28, w: 1, h: 1, c: "R" },
  { x: 38, y: 28, w: 1, h: 1, c: "R" },
  { x: 39, y: 28, w: 1, h: 1, c: "e" },
  { x: 40, y: 28, w: 1, h: 1, c: "e" },
  { x: 35, y: 29, w: 1, h: 1, c: "R" },
  { x: 36, y: 29, w: 1, h: 1, c: "R" },
  { x: 37, y: 29, w: 1, h: 1, c: "R" },
  { x: 38, y: 29, w: 1, h: 1, c: "R" },
  { x: 39, y: 29, w: 1, h: 1, c: "e" },
  { x: 40, y: 29, w: 1, h: 1, c: "e" },
  { x: 36, y: 30, w: 1, h: 1, c: "R" },
  { x: 37, y: 30, w: 1, h: 1, c: "R" },
  { x: 38, y: 30, w: 1, h: 1, c: "e" },
  { x: 39, y: 30, w: 1, h: 1, c: "e" },
  // Pedestal — gunmetal housing
  { x: 34, y: 31, w: 1, h: 1, c: "M" },
  { x: 35, y: 31, w: 1, h: 1, c: "M" },
  { x: 36, y: 31, w: 1, h: 1, c: "G" },
  { x: 37, y: 31, w: 1, h: 1, c: "G" },
  { x: 38, y: 31, w: 1, h: 1, c: "G" },
  { x: 39, y: 31, w: 1, h: 1, c: "G" },
  { x: 40, y: 31, w: 1, h: 1, c: "g" },
  { x: 41, y: 31, w: 1, h: 1, c: "g" },
  { x: 34, y: 32, w: 1, h: 1, c: "M" },
  { x: 35, y: 32, w: 1, h: 1, c: "G" },
  { x: 36, y: 32, w: 1, h: 1, c: "G" },
  { x: 37, y: 32, w: 1, h: 1, c: "G" },
  { x: 38, y: 32, w: 1, h: 1, c: "G" },
  { x: 39, y: 32, w: 1, h: 1, c: "g" },
  { x: 40, y: 32, w: 1, h: 1, c: "g" },
  { x: 41, y: 32, w: 1, h: 1, c: "g" },
  { x: 34, y: 33, w: 1, h: 1, c: "G" },
  { x: 35, y: 33, w: 1, h: 1, c: "G" },
  { x: 36, y: 33, w: 1, h: 1, c: "G" },
  { x: 37, y: 33, w: 1, h: 1, c: "G" },
  { x: 38, y: 33, w: 1, h: 1, c: "g" },
  { x: 39, y: 33, w: 1, h: 1, c: "g" },
  { x: 40, y: 33, w: 1, h: 1, c: "g" },
  { x: 41, y: 33, w: 1, h: 1, c: "m" },
  { x: 34, y: 34, w: 8, h: 1, c: "m" },
];
const DEPLOY_FLASH = [
  { x: 33, y: 28, w: 1, h: 1, c: "V" },
  { x: 42, y: 28, w: 1, h: 1, c: "V" },
  { x: 36, y: 25, w: 4, h: 1, c: "V" },
  { x: 33, y: 30, w: 1, h: 1, c: "V" },
  { x: 42, y: 30, w: 1, h: 1, c: "V" },
];

/* Deploying — Field Tech's right arm reaches out from her right
 * shoulder over to the dome. The arm is drawn as an overlay; the
 * default rightArm stub is hidden during deploy. Animates DOWN +1 px
 * on press (in sync with the dome compression), then back. */
const DEPLOY_PRESS_ARM = [
  // shoulder + upper arm angling down-right
  { x: 32, y: 18, w: 1, h: 1, c: "4" },
  { x: 33, y: 19, w: 1, h: 1, c: "3" },
  { x: 34, y: 20, w: 1, h: 1, c: "3" },
  // forearm continuing toward the dome
  { x: 35, y: 21, w: 1, h: 1, c: "3" },
  { x: 36, y: 22, w: 1, h: 1, c: "3" },
  { x: 36, y: 23, w: 1, h: 1, c: "3" },
  // hand resting on top of the dome
  { x: 37, y: 24, w: 1, h: 1, c: "h" },
  { x: 37, y: 25, w: 1, h: 1, c: "h" },
  { x: 37, y: 26, w: 1, h: 1, c: "h" },
];

/* Awaiting permission — full RIGHT-ARM WAVE pose. Drawn as an overlay
 * during awaiting only; default rightArm stub is hidden. Mirrors the
 * Marine's STREAM_RIGHT_ARM geometry: arm extends up-and-right from
 * the right shoulder, hand raised overhead. Animated with the same
 * rotate+translate waver as Marine + Engineer. */
const WAVE_RIGHT_ARM = [
  { x: 31, y: 19, w: 2, h: 1, c: "3" },
  { x: 32, y: 20, w: 2, h: 1, c: "3" },
  { x: 33, y: 18, w: 2, h: 1, c: "3" },
  { x: 34, y: 17, w: 2, h: 1, c: "3" },
  { x: 35, y: 16, w: 1, h: 1, c: "3" },
  { x: 35, y: 15, w: 1, h: 1, c: "h" },
  { x: 36, y: 15, w: 1, h: 1, c: "h" },
];

/* ============================================================ CSS */

const SCOPED_CSS = `
.ft-fieldtech { display:inline-block; position:relative; line-height:0; image-rendering:pixelated; image-rendering:crisp-edges; }
.ft-fieldtech svg { display:block; image-rendering:pixelated; overflow:visible; }
.ft-g { transform-box: fill-box; transform-origin: center; }

/* The visor underneath the binoculars — hidden by default (binoculars
 * are opaque and cover it). Becomes visible when the binoculars
 * translate down (awaiting / done states). */
.ft-underVisor { /* always present in DOM, covered by binoculars */ }

/* ============ idle: gentle 4-frame body sway like Marine ============
 *
 * Per design feedback: only the UPPER body sways — legs and boots stay
 * planted, matching the Marine + Engineer idle. The bodyGroup wrapper
 * itself does not animate; each upper-body subgroup animates on its own.
 */
@keyframes ft-idle-bob {
  0%, 24.99% { transform: translateX(0); }
  25%, 49.99% { transform: translateX(-1px); }
  50%, 74.99% { transform: translateX(0); }
  75%, 100% { transform: translateX(1px); }
}
@keyframes ft-idle-lens {
  0%, 49.99% { opacity: 1; }
  50%, 100% { opacity: 0.82; }
}
.ft-state-idle .ft-body,
.ft-state-idle .ft-head,
.ft-state-idle .ft-binoculars,
.ft-state-idle .ft-antenna,
.ft-state-idle .ft-backpack,
.ft-state-idle .ft-leftArm,
.ft-state-idle .ft-rightArm,
.ft-state-idle .ft-carbine {
  animation: ft-idle-bob 900ms linear infinite;
}
.ft-state-idle .ft-binoculars {
  animation: ft-idle-bob 900ms linear infinite, ft-idle-lens 1800ms ease-in-out infinite;
}

/* ============ thinking: brow raise + chin scratch (Marine vocabulary) ============
 *
 * No head tilt, no antenna twitch. The chin hand fades in and jiggles
 * in place to read as scratching; the brow appears only while the hand
 * is at the chin, then both fade out together.
 */
@keyframes ft-think-pose {
  0%, 9.99% { opacity: 0; }
  10%, 72%  { opacity: 1; }
  72.01%, 100% { opacity: 0; }
}
@keyframes ft-think-jiggle {
  0%, 14% { transform: translate(0, 0); }
  18%     { transform: translate(1px, 0); }
  24%     { transform: translate(0, 1px); }
  30%     { transform: translate(-1px, 0); }
  36%     { transform: translate(0, 0); }
  42%     { transform: translate(1px, 1px); }
  48%     { transform: translate(0, 0); }
  54%     { transform: translate(-1px, 1px); }
  60%     { transform: translate(0, 0); }
  66%     { transform: translate(1px, 0); }
  72%, 100% { transform: translate(0, 0); }
}
.ft-state-thinking .ft-thinkingHand {
  animation: ft-think-pose 1200ms linear infinite, ft-think-jiggle 1200ms linear infinite;
}
.ft-state-thinking .ft-thinkBrow { animation: ft-think-pose 1200ms linear infinite; }

/* ============ tool_running: scan a foreign object on the ground ============
 *
 * The WHOLE beam triangle translates L→R as one unit (no pivot). The
 * apex sweeps along her binocular bar (cols 22→28) while the base
 * sweeps over the artifact (cols 33→39). The whole beam pulses
 * opacity in lockstep with the sweep.
 */
@keyframes ft-scan-beam-sweep {
  0%   { transform: translateX(0); }
  50%  { transform: translateX(6px); }
  100% { transform: translateX(0); }
}
@keyframes ft-scan-beam-pulse {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 1; }
}
@keyframes ft-scan-object-bright {
  0%, 100% { filter: brightness(1); }
  50%      { filter: brightness(1.25); }
}
.ft-state-tool_running .ft-scanBeam   { animation: ft-scan-beam-sweep 1200ms linear infinite, ft-scan-beam-pulse 360ms linear infinite; }
.ft-state-tool_running .ft-scanObject { animation: ft-scan-object-bright 1200ms linear infinite; }
/* Hide the binoculars during scan — her face is now a glowing visor.
 * The visor overlay pulses opacity in lockstep with the beam (same
 * ft-scan-beam-pulse animation), so face + beam glow together. */
.ft-state-tool_running .ft-binoculars { visibility: hidden; }
.ft-state-tool_running .ft-toolVisor { animation: ft-scan-beam-pulse 360ms linear infinite; }

/* ============ streaming: speech bubble + radio dots (no antenna pulse) ============ */
@keyframes ft-stream-dot-1 {
  0%   { opacity: 0; transform: translateY(0); }
  10%  { opacity: 1; transform: translateY(0); }
  60%  { opacity: 1; transform: translateY(-3px); }
  100% { opacity: 0; transform: translateY(-5px); }
}
@keyframes ft-stream-dot-2 {
  0%, 30% { opacity: 0; transform: translateY(0); }
  40%     { opacity: 1; transform: translateY(0); }
  85%     { opacity: 1; transform: translateY(-3px); }
  100%    { opacity: 0; transform: translateY(-5px); }
}
@keyframes ft-stream-dot-3 {
  0%, 60% { opacity: 0; transform: translateY(0); }
  70%     { opacity: 1; transform: translateY(0); }
  100%    { opacity: 0; transform: translateY(-3px); }
}
@keyframes ft-talk-bubble {
  0%, 5%    { opacity: 0; }
  10%, 90%  { opacity: 1; }
  95%, 100% { opacity: 0; }
}
@keyframes ft-talk-dot-1 { 0%, 14.99% { opacity: 0; } 15%, 100% { opacity: 1; } }
@keyframes ft-talk-dot-2 { 0%, 34.99% { opacity: 0; } 35%, 100% { opacity: 1; } }
@keyframes ft-talk-dot-3 { 0%, 54.99% { opacity: 0; } 55%, 100% { opacity: 1; } }
/* Head no longer bobs during streaming — per design feedback she should
 * hold her head steady while talking. Antenna pulses + radio dots +
 * speech bubble carry the "transmitting" read. */
/* Streaming — antenna pulse REMOVED per design feedback. Antenna stays
 * steady; bubble + dots carry the "transmitting" read on their own. */
.ft-state-streaming .ft-radioDot { animation-duration: 1500ms; animation-iteration-count: infinite; animation-timing-function: linear; }
.ft-state-streaming .ft-radioDot-1 { animation-name: ft-stream-dot-1; }
.ft-state-streaming .ft-radioDot-2 { animation-name: ft-stream-dot-2; animation-delay: 100ms; }
.ft-state-streaming .ft-radioDot-3 { animation-name: ft-stream-dot-3; animation-delay: 200ms; }
.ft-state-streaming .ft-bubble { animation: ft-talk-bubble 1500ms linear infinite; }
.ft-state-streaming .ft-talkDot { animation-duration: 1500ms; animation-timing-function: linear; animation-iteration-count: infinite; }
.ft-state-streaming .ft-talkDot-1 { animation-name: ft-talk-dot-1; }
.ft-state-streaming .ft-talkDot-2 { animation-name: ft-talk-dot-2; }
.ft-state-streaming .ft-talkDot-3 { animation-name: ft-talk-dot-3; }

/* ============ awaiting_permission: patient jump + right-hand wave ============
 *
 * Body group jumps in the family patient-jump rhythm. The default
 * rightArm stub is hidden and replaced by a WAVE_RIGHT_ARM overlay
 * which rotates + translates over the head to wave — same vocabulary
 * as Marine + Engineer. Antenna twitches in sync.
 */
@keyframes ft-await-jump {
  0%, 9.99%   { transform: translateY(0); }
  10%, 24.99% { transform: translateY(-5px); }
  25%, 34.99% { transform: translateY(0); }
  35%, 49.99% { transform: translateY(-5px); }
  50%, 100%   { transform: translateY(0); }
}
@keyframes ft-await-wave {
  0%, 9.99%   { transform: translate(0, 0) rotate(0deg); }
  15%         { transform: translate(0, -10px) rotate(-22deg); }
  25%         { transform: translate(2px, -12px) rotate(22deg); }
  35%         { transform: translate(-2px, -12px) rotate(-22deg); }
  45%         { transform: translate(2px, -10px) rotate(22deg); }
  55%, 100%   { transform: translate(0, 0) rotate(0deg); }
}
.ft-state-awaiting_permission .ft-bodyGroup { animation: ft-await-jump 1400ms linear infinite; }
/* Antenna inherits the body's jump via bodyGroup nesting; no separate wiggle */
.ft-state-awaiting_permission .ft-antenna { animation: ft-await-jump 1400ms linear infinite; }
/* Hide the resting right-arm stub so the waving overlay reads cleanly */
.ft-state-awaiting_permission .ft-rightArm { visibility: hidden; }
.ft-state-awaiting_permission .ft-waveArm  {
  animation: ft-await-wave 1400ms linear infinite;
  transform-origin: 32px 20px;
}

/* ============ done: one-shot snap-up + lens brightens once ============ */
@keyframes ft-done-snap {
  0%, 19.99% { transform: translateY(-1px); }
  20%, 100% { transform: translateY(0); }
}
@keyframes ft-done-lens-bright {
  0%, 9.99%   { opacity: 1; filter: brightness(1); }
  10%, 39.99% { opacity: 1; filter: brightness(1.4); }
  40%, 100%   { opacity: 1; filter: brightness(1); }
}
.ft-state-done .ft-bodyGroup { animation: ft-done-snap 1400ms linear forwards; }
.ft-state-done .ft-binoculars { animation: ft-done-snap 1400ms linear forwards, ft-done-lens-bright 1400ms linear forwards; }

/* ============ error: body tilt + drooped antenna + flashing red lens ============ */
@keyframes ft-error-tilt {
  /* Body holds a static -3° tilt — no back-and-forth sway, per design feedback */
  0%, 100% { transform: rotate(-3deg); }
}
@keyframes ft-error-antenna-droop {
  /* Antenna falls to one side — translateX 2px + slight rotation */
  0%, 100% { transform: translate(2px, 1px) rotate(35deg); }
}
@keyframes ft-error-lens-flash {
  0%, 39.99% { opacity: 0; }
  40%, 59.99% { opacity: 1; }
  60%, 100% { opacity: 0; }
}
@keyframes ft-error-lens-mask {
  0%, 39.99% { opacity: 1; }
  40%, 59.99% { opacity: 0; }
  60%, 100% { opacity: 1; }
}
.ft-state-error .ft-bodyGroup { animation: ft-error-tilt 1800ms linear infinite; transform-origin: 23px 38px; }
.ft-state-error .ft-antenna { animation: ft-error-tilt 1800ms linear infinite, ft-error-antenna-droop 1800ms linear infinite; transform-origin: 28px 5px; }
/* The lens mask + lens red are children of bodyGroup, so they inherit
 * the body tilt automatically. Adding another tilt animation on them
 * would compound — only the flash/mask alternation lives here. */
.ft-state-error .ft-errorLensMask { animation: ft-error-lens-mask 1100ms linear infinite; }
.ft-state-error .ft-errorLensRed  { animation: ft-error-lens-flash 1100ms linear infinite; }

/* ============ spawning: straight drop from above + dust-puff impact ============
 *
 * Unit translates down from -38px to 0 with an impact-bounce squash;
 * shadow fades in at landing. A short dust-puff overlay flashes near
 * the boots at impact to cue arrival (replaces the parachute that was
 * removed per design feedback — not enough room at 48×48).
 */
@keyframes ft-spawn-drop {
  0%   { transform: translateY(-38px); }
  60%  { transform: translateY(-2px); }
  72%  { transform: translateY(1px); }
  84%  { transform: translateY(-1px); }
  100% { transform: translateY(0); }
}
@keyframes ft-spawn-shadow-in {
  0%, 55%   { opacity: 0; }
  72%, 100% { opacity: 1; }
}
@keyframes ft-spawn-dust {
  0%, 60%    { opacity: 0; transform: translateY(0); }
  68%        { opacity: 1; transform: translateY(0); }
  85%        { opacity: 0.6; transform: translateY(-1px); }
  100%       { opacity: 0; transform: translateY(-2px); }
}
.ft-tr-spawning .ft-bodyGroup { animation: ft-spawn-drop 1500ms cubic-bezier(0.4, 0, 0.7, 1) forwards; }
.ft-tr-spawning .ft-shadow    { animation: ft-spawn-shadow-in 1500ms linear forwards; }
.ft-tr-spawning .ft-dustPuff  { animation: ft-spawn-dust 1500ms linear forwards; }

/* ============ deploying: red-button kit (keyframes above) ============ */
/* ============ deploying: same red-button kit as Marine + Engineer ============
 *
 * Right-arm overlay reaches over from the right shoulder to the dome,
 * then translates down +1 px on press. Dome dome compresses +1 px in
 * sync. Accent flash ring pulses at the moment of press.
 */
@keyframes ft-deploy-arm {
  0%, 14.99% { transform: translate(0, 0); }
  25%, 60%   { transform: translate(0, 1px); }
  75%, 100%  { transform: translate(0, 0); }
}
@keyframes ft-deploy-button-press {
  0%, 19%   { transform: translate(0, 0); }
  25%, 60%  { transform: translate(0, 1px); }
  75%, 100% { transform: translate(0, 0); }
}
@keyframes ft-deploy-flash {
  0%, 24%   { opacity: 0; }
  28%, 55%  { opacity: 1; }
  65%, 100% { opacity: 0; }
}
.ft-tr-deploying .ft-deployArm    { animation: ft-deploy-arm 800ms linear forwards; }
.ft-tr-deploying .ft-deployButton { animation: ft-deploy-button-press 800ms linear forwards; }
.ft-tr-deploying .ft-deployFlash  { animation: ft-deploy-flash 800ms linear forwards; }
/* Hide the resting right-arm stub during deploy so the reaching arm reads cleanly */
.ft-tr-deploying .ft-rightArm     { visibility: hidden; }

/* ============ reduced motion ============ */
@media (prefers-reduced-motion: reduce) {
  .ft-fieldtech *, .ft-fieldtech *::before, .ft-fieldtech *::after {
    animation: none !important;
    transition: none !important;
  }
  .ft-state-tool_running .ft-scanBeam { opacity: 1; transform: translateX(0); }
  .ft-state-thinking .ft-thinkingHand { opacity: 1; }
  .ft-state-thinking .ft-thinkBrow { opacity: 1; }
  .ft-state-streaming .ft-bubble { opacity: 1; }
  .ft-state-streaming .ft-talkDot { opacity: 1; }
  .ft-state-streaming .ft-radioDot { opacity: 0; }   /* dots only animate */
  .ft-state-awaiting_permission .ft-binoculars { transform: translateY(8px); }
  .ft-state-done .ft-bodyGroup { transform: translateY(-1px); }
  .ft-state-error .ft-bodyGroup { transform: rotate(-3deg); transform-origin: 23px 38px; }
  .ft-state-error .ft-antenna   { transform: translate(2px, 1px) rotate(35deg); transform-origin: 28px 5px; }
  .ft-state-error .ft-errorLensRed { opacity: 1; }
  .ft-tr-deploying .ft-deployFlash { opacity: 1; }
  .ft-tr-deploying .ft-deployArm   { transform: translate(0, 1px); }
  .ft-tr-deploying .ft-deployButton { transform: translate(0, 1px); }
}
`;

/* ============================================================ Component */

function facingToDeg(f) {
  return ({ S:0, SW:45, W:90, NW:135, N:180, NE:225, E:270, SE:315 })[f] || 0;
}

export const FieldTech: React.FC<UnitProps> = ({
  state,
  transient,
  accent,
  size = 64,
  facing = "S",
  armorTemplate = "steel",
  gunTemplate = "matte",
  darkness = 0,
}) => {
  const ramps = React.useMemo(() => {
    const armorBase = (ARMOR_TEMPLATES[armorTemplate] || ARMOR_TEMPLATES.steel).base;
    const gunBase   = (GUN_TEMPLATES[gunTemplate]     || GUN_TEMPLATES.chrome).base;
    return {
      armor: buildArmorRamp(armorBase, darkness),
      gun:   buildGunRamp(gunBase, darkness),
      acc:   accentColors(ACCENTS[accent] || ACCENTS.slate),
    };
  }, [armorTemplate, gunTemplate, darkness, accent]);

  const errorMode = state === "error";
  const rotateDeg = facingToDeg(facing);

  return (
    <div
      className={`ft-fieldtech ft-state-${state}${transient ? ` ft-tr-${transient}` : ""}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Field Tech, ${state}`}
    >
      <style>{SCOPED_CSS}</style>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        shapeRendering="crispEdges"
        style={Object.assign(
          { overflow: "visible" },
          rotateDeg ? { transform: `rotate(${rotateDeg}deg)` } : {}
        )}
      >
        <g className="ft-g ft-shadow">{renderRects(GROUPED.shadow, ramps, errorMode)}</g>

        {/* Foreign artifact on the ground — rendered BEFORE the body
            group (on the ground, behind the unit in z-order). */}
        {state === "tool_running" && (
          <g className="ft-g ft-scanObject">
            {FOREIGN_OBJECT.map((p, i) => (
              <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                fill={p.c === "X" ? FIXED_REST.X : resolveColor(p.c, ramps, errorMode)} />
            ))}
          </g>
        )}

        {/* Body group — everything that animates together for spawn/error/jump */}
        <g className="ft-bodyGroup">
          <g className="ft-g ft-boots">{renderRects(GROUPED.boots, ramps, errorMode)}</g>
          <g className="ft-g ft-legs">{renderRects(GROUPED.legs, ramps, errorMode)}</g>
          <g className="ft-g ft-body">{renderRects(GROUPED.body, ramps, errorMode)}</g>
          <g className="ft-g ft-backpack">{renderRects(GROUPED.backpack, ramps, errorMode)}</g>
          <g className="ft-g ft-leftArm">{renderRects(GROUPED.leftArm, ramps, errorMode)}</g>
          <g className="ft-g ft-rightArm">{renderRects(GROUPED.rightArm, ramps, errorMode)}</g>
          <g className="ft-g ft-carbine">{renderRects(GROUPED.carbine, ramps, errorMode)}</g>

          <g className="ft-g ft-head">{renderRects(GROUPED.head, ramps, errorMode)}</g>
          {/* Under-visor — always drawn, hidden behind binoculars in default pose */}
          <g className="ft-g ft-underVisor">
            {UNDER_VISOR.map((p, i) => (
              <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                fill={resolveColor(p.c, ramps, errorMode)} />
            ))}
          </g>
          <g className="ft-g ft-binoculars">{renderRects(GROUPED.binoculars, ramps, errorMode)}</g>
          <g className="ft-g ft-antenna">{renderRects(GROUPED.antenna, ramps, errorMode)}</g>

          {/* Tool-running face: binoculars hide via CSS; helmet-row-9
              filler closes the silhouette gap, and the visor below it
              glows in lockstep with the beam pulse. */}
          {state === "tool_running" && (
            <>
              <g className="ft-g ft-toolHelmet">
                {TOOL_HELMET_LOWER.map((p, i) => (
                  <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                    fill={p.c === "X" ? FIXED_REST.X : resolveColor(p.c, ramps, errorMode)} />
                ))}
              </g>
              <g className="ft-g ft-toolVisor">
                {TOOL_VISOR.map((p, i) => (
                  <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                    fill={p.c === "X" ? FIXED_REST.X : resolveColor(p.c, ramps, errorMode)} />
                ))}
              </g>
            </>
          )}

          {/* Thinking — raised brow above the LEFT lens + gloved hand at the chin */}
          {state === "thinking" && (
            <>
              <g className="ft-g ft-thinkBrow">
                {THINKING_BROW.map((p, i) => (
                  <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                    fill={resolveColor(p.c, ramps, errorMode)} />
                ))}
              </g>
              <g className="ft-g ft-thinkingHand">
                {THINKING_HAND.map((p, i) => (
                  <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                    fill={resolveColor(p.c, ramps, errorMode)} />
                ))}
              </g>
            </>
          )}

          {/* Tool-running overlay moved OUT of bodyGroup (rendered before it)
              so the body occludes the beam where they overlap. */}

          {/* Error — flashing red lens overlay */}
          {state === "error" && (
            <>
              <g className="ft-g ft-errorLensMask">
                {ERROR_LENS_MASK.map((p, i) => (
                  <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                    fill={resolveColor(p.c, ramps, errorMode)} />
                ))}
              </g>
              <g className="ft-g ft-errorLensRed">
                {ERROR_LENS_RED.map((p, i) => (
                  <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                    fill={FIXED_REST.R} />
                ))}
              </g>
            </>
          )}

          {/* Streaming — radio dots rising above antenna */}
          {/* Streaming — radio dots rising above antenna (BLACK per design feedback) */}
          {state === "streaming" && (
            <g className="ft-g ft-radioDots">
              {RADIO_DOTS.map((d) => (
                <rect key={d.id} className={`ft-radioDot ft-radioDot-${d.id}`}
                  x={d.x} y={d.y} width={1} height={1} fill={FIXED_REST.k} />
              ))}
            </g>
          )}

          {/* Streaming — speech bubble + dots */}
          {state === "streaming" && (
            <g className="ft-g ft-bubble">
              {VOICE_BUBBLE.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
              {VOICE_DOTS.map((d) => (
                <rect key={d.id} className={`ft-talkDot ft-talkDot-${d.id}`}
                  x={d.x} y={d.y} width={1} height={1} fill={FIXED_REST.k} />
              ))}
            </g>
          )}

          {/* Awaiting permission — waving right arm overlay (default stub hidden via CSS) */}
          {state === "awaiting_permission" && (
            <g className="ft-g ft-waveArm">
              {WAVE_RIGHT_ARM.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
          )}

          {/* Deploying — right arm reaches over and presses the red button */}
          {transient === "deploying" && (
            <>
              <g className="ft-g ft-deployFlash">
                {DEPLOY_FLASH.map((p, i) => (
                  <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                    fill={resolveColor(p.c, ramps, errorMode)} />
                ))}
              </g>
              <g className="ft-g ft-deployButton">
                {DEPLOY_BUTTON.map((p, i) => (
                  <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                    fill={resolveColor(p.c, ramps, errorMode)} />
                ))}
              </g>
              <g className="ft-g ft-deployArm">
                {DEPLOY_PRESS_ARM.map((p, i) => (
                  <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                    fill={resolveColor(p.c, ramps, errorMode)} />
                ))}
              </g>
            </>
          )}
        </g>

        {/* Tool-running scan beam \u2014 rendered AFTER the body group so it
            paints ON TOP of the unit (foreground). The apex stays at
            pixel (28, 11) = her binoculars; the base swings L\u2192R over
            the artifact via rotation around that apex. */}
        {state === "tool_running" && (
          <g className="ft-g ft-scanBeam">
            {SCAN_BEAM_TRIANGLE.map((p, i) => (
              <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                fill={resolveColor(p.c, ramps, errorMode)} />
            ))}
          </g>
        )}

        {/* Spawning \u2014 brief dust puff at the boots when the unit lands.
            The body group itself owns the drop translate via .ft-bodyGroup. */}
        {transient === "spawning" && (
          <g className="ft-g ft-dustPuff">
            {DUST_PUFF.map((p, i) => (
              <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                fill={resolveColor(p.c, ramps, errorMode)} />
            ))}
          </g>
        )}
      </svg>
    </div>
  );
};
