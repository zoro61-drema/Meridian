// @ts-nocheck
// ↑ Externally-authored designed sprite (from `designs/RTS-command-animations/`).
// See header note in Marine.tsx for the rationale. Unwrapped from the
// source file's IIFE shell so it works as an ES module.

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

/* Engineer — repair specialist with dual hip-mounted manipulator claws.
 *
 * Visual family note: this Engineer is the rendered-pixel-art sibling of
 * Marine.tsx — same 5-tone armor ramp, same gunmetal tool ramp, same dark
 * outline pass, same shadow-anchored stance. What makes it an Engineer:
 *
 *   - Bulkier silhouette than the Marine (backpack widens the shoulders).
 *   - Dual manipulator claws arch from the backpack forward over the
 *     helmet, framing it. Claw pincer tips carry the accent.
 *   - Accent also rides the visor strip, both shoulder lights, and the
 *     belt buckle. No hand-held weapon — the claws ARE the tools.
 */

/* ============================================================ Color helpers (shared with Marine) */

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

/* ============================================================ Accent */

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

/* ============================================================ Armor + tool ramps */

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

/* ============================================================ Fixed palette */

const FIXED_REST = {
  X: "#06080b", b: "#1a1d22", P: "#0b0d10", u: "#15181d", k: "#0a0c10", r: "#2b2f37",
  h: "#0a0c10",
  W: "#dee2e6",   // speech bubble fill
  R: "#ef2c3a",   // error red
  S: "#fff7c4",   // spark (welding-flash hot core)
  F: "#ffd24a",   // welding flame mid
  f: "#ff6a1c",   // welding flame outer
  e: "#a01818",   // welding ember
  T: "#cfe6ff",   // teleport flash bright
  t: "#9fc4ff",   // teleport flash mid
  // Claw / manipulator-arm yellow ramp — industrial construction yellow.
  // The backpack stays gunmetal (g/G/M/m); only the arm pixels remap.
  n: "#2e1d05",   // claw deep shadow / pincer inner
  j: "#5e3d0a",   // claw shadow
  J: "#b78318",   // claw base (mid)
  N: "#f1c33b",   // claw highlight
};

const SHADOW_TONES = {
  z: "rgba(0,0,0,0.55)", y: "rgba(0,0,0,0.32)", w: "rgba(0,0,0,0.16)",
};

/* ============================================================ Stencil */

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

/* The Repair Specialist Engineer — now piloting a yellow power-loader mech.
 *
 * Pixel codes:
 *   1..5  armor ramp (pilot armor visible inside the mech)
 *   V/v   accent (visor, mech accents, claw prong tips, chest stripe)
 *   J/N/j/n  yellow mech body + arms + claws
 *   G/M/g/m  gunmetal codes IN STENCIL — auto-remapped to yellow at build
 *            time, so the existing backpack/chest pixels become mech body.
 *   b/P   pilot boots
 *   u     pilot under-suit (neck)
 *   k     pilot belt
 *
 * Region map:
 *   Mech left claw:    rows 4–9, cols 0–7  (chunky pincer w/ accent tips)
 *   Mech left arm:     rows 9–13, cols 8–14 (horizontal shaft)
 *   Cage roof:         row 5, cols 16–31
 *   Cage bars:         rows 6–13, cols 17–18 (left) and 29–30 (right)
 *   Pilot helmet:      rows 6–13, cols 19–28 (visible through cage)
 *   Pilot visor:       rows 10–11
 *   Cage bars:         rows 5–14, cols 16–31
 *
 * Mech grippers — chunky 3D-shaded forks (Power Loader reference):
 *   Each gripper is a 2-prong forklift jaw. When the gripper is CLOSED
 *   the prongs sit touching each other (no visible gap), so the gripper
 *   reads as a solid horizontal bar. The back wall is a separate 1-col
 *   strip (col 12 left / col 35 right) that stays put when the prongs
 *   translate apart in the open animation.
 *
 *   Each prong is 3 rows tall (top highlight N, base J, base J — no
 *   shadow row so the touching prongs read as one continuous bar):
 *
 *   Left gripper:
 *     rows 18–20  upper prong (cols 3–11 = N J J)
 *     rows 21–23  lower prong (cols 3–11 = J J j) — touches upper at row 20/21
 *     rows 18–23  back wall (col 12 only) — bridges prongs when open
 *   Right gripper mirrors at cols 36–44 with back wall at col 35.
 *
 *   Pilot legs:        rows 27–33
 *   Shadow center at (23, 39).
 */
const STENCIL = [
  R(),                                                                // 00
  R(),                                                                // 01
  R(),                                                                // 02
  R(),                                                                // 03
  R(),                                                                // 04
  R([16, "NJJJJJJJJJJJJJJN"]),                                        // 05 cage roof
  R([17, "NJ"], [21, "445544"], [29, "JN"]),                          // 06 cage bars + helmet apex
  R([17, "NJ"], [20, "44555544"], [29, "JN"]),                        // 07
  R([17, "NJ"], [19, "4555555443"], [29, "JN"]),                      // 08
  R([17, "NJ"], [19, "4555555443"], [29, "JN"]),                      // 09
  R([17, "NJ"], [19, "3vvvvvvvv3"], [29, "JN"]),                      // 10 VISOR HIGHLIGHT
  R([17, "NJ"], [19, "3VVVVVVVV3"], [29, "JN"]),                      // 11 VISOR BASE
  R([17, "NJ"], [20, "33333333"], [29, "JN"]),                        // 12
  R([17, "NJ"], [21, "u3333u"], [29, "JN"]),                          // 13
  R([17, "NJ"], [21, "uuuu"], [29, "JN"]),                            // 14 cage bottom
  R([14, "MGG4"], [18, "Vv44"], [22, "5544"], [26, "44Vv"], [30, "4GGM"]),     // 15
  R([14, "GGGG"], [18, "44444444"], [26, "44444"], [30, "GGGG"]),              // 16 pauldrons
  R([13, "GG"], [15, "MGGr"], [19, "44544443"], [28, "rGGM"], [32, "GG"]),     // 17
  // Row 18 — UPPER prong top (N highlight) + back wall col 12/35 (J) + chest
  R([3, "NNNNNNNNNJ"], [13, "GG"], [15, "MGGr"], [19, "44544443"], [28, "rGGM"], [32, "GG"], [35, "JNNNNNNNNN"]),  // 18
  // Row 19 — UPPER prong base + back wall + chest stripe
  R([3, "JJJJJJJJJJ"], [13, "GG"], [15, "MGGr"], [19, "44VVVV43"], [28, "rGGM"], [32, "GG"], [35, "JJJJJJJJJJ"]),  // 19
  // Row 20 — SEAM row: prong cols left empty so the outline pass fills
  // them with X, giving a single black line between the two closed prongs.
  // Back wall (col 12 / col 35) continues here.
  R([12, "J"], [13, "GG"], [15, "MGGr"], [19, "44VVVV43"], [28, "rGGM"], [32, "GG"], [35, "J"]),                   // 20
  // Row 21 — LOWER prong base + back wall + chest taper
  R([3, "JJJJJJJJJJ"], [14, "Mg"], [16, "GG3"], [19, "44544443"], [28, "3GG"], [32, "gM"], [35, "JJJJJJJJJJ"]),    // 21
  // Row 22 — LOWER prong base + body
  R([3, "JJJJJJJJJJ"], [14, "Mg"], [16, "G33"], [19, "33333333"], [28, "33G"], [32, "gM"], [35, "JJJJJJJJJJ"]),    // 22
  // Row 23 — LOWER prong shadow (j underside) + back wall continues + body
  R([3, "jjjjjjjjjJ"], [14, "Mg"], [17, "h3"],  [19, "33333333"], [28, "3h"], [32, "gM"], [35, "Jjjjjjjjjj"]),     // 23
  R([15, "g"], [17, "33"],  [19, "33333333"], [28, "33"], [32, "g"]),          // 24 belly
  R([18, "3kkkkVkkk3"]),                                              // 25 belt + accent buckle
  R([18, "333333333"]),                                               // 26 belt under
  // Mech leg housings flank the pilot legs (yellow armor)
  R([15, "NNN"], [18, "33433"], [24, "33433"], [29, "NNN"]),          // 27 hip armor top (highlight)
  R([15, "NJJ"], [18, "33343"], [24, "34333"], [29, "JJN"]),          // 28 hip armor side (wider)
  R([15, "NJJ"], [19, "3343"], [25, "3433"], [29, "JJN"]),            // 29 thigh
  R([15, "NJN"], [19, "2343"], [25, "3432"], [29, "NJN"]),            // 30 KNEE BEVEL (bright N rim)
  R([15, "NJJ"], [19, "3343"], [25, "3433"], [29, "JJN"]),            // 31 shin
  R([15, "NJJ"], [19, "3343"], [25, "3433"], [29, "JJN"]),            // 32 shin
  R([15, "NJJ"], [19, "2233"], [25, "3322"], [29, "JJN"]),            // 33 ankle
  // Mech foot pads wrap the pilot boots and extend wider on each side
  R([13, "NJJJ"], [17, "bbbbbb"], [25, "bbbbbb"], [31, "JJJN"]),      // 34 foot pad top
  R([13, "JJJJ"], [17, "bPPPPb"], [25, "bPPPPb"], [31, "JJJJ"]),      // 35 foot pad middle
  R([13, "jjjj"], [17, "PPPPPP"], [25, "PPPPPP"], [31, "jjjj"]),      // 36 foot pad shadow underside
  R(), R(), R(), R(), R(), R(), R(), R(), R(), R(), R(),              // 37-47
];

/* ============================================================ Grid + grouping */

function classifyPixel(c, x, y) {
  if (c === "z" || c === "y" || c === "w") return "shadow";
  if (y >= 10 && y <= 11 && x >= 19 && x <= 28) return "visor";
  // Cage — yellow bars + roof around the pilot's head. Kept separate
  // from "head" so the helmet can animate independently of the cage.
  if (y >= 4 && y <= 14) {
    // Roof + outline above it span cols 16-31 across rows 4-5
    if (y <= 5 && x >= 16 && x <= 31) return "cage";
    // Side bars span cols 16-18 (left) and 29-31 (right), rows 6-14
    if (y >= 6 && y <= 14 && ((x >= 16 && x <= 18) || (x >= 29 && x <= 31))) return "cage";
    return "head";
  }
  // RIGHT gripper — sub-divided so prongs can open/close independently.
  // Ranges extend by 1px on each non-body side so the dark outline the
  // outline pass adds around each subgroup gets classified with that
  // subgroup and moves with it (open/close, relaxed rotation, error
  // tilt). Without this the border orphans on the body underneath.
  if (y >= 17 && y <= 20 && x >= 36 && x <= 45) return "rightProngU";
  if (y >= 21 && y <= 24 && x >= 36 && x <= 45) return "rightProngL";
  if (y >= 17 && y <= 24 && x === 35) return "rightClaw";    // back wall + outline
  // LEFT gripper — mirrored
  if (y >= 17 && y <= 20 && x >= 2 && x <= 11) return "leftProngU";
  if (y >= 21 && y <= 24 && x >= 2 && x <= 11) return "leftProngL";
  if (y >= 17 && y <= 24 && x === 12) return "leftClaw";     // back wall + outline
  // Mech body backpack
  if (y >= 15 && y <= 23) {
    if (x >= 13 && x <= 17) return "backpackL";
    if (x >= 30 && x <= 34) return "backpackR";
  }
  if (y >= 34 && y <= 36) return "boots";
  if (y >= 27 && y <= 33) return "legs";
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
  // Recolor the mech-body pixels (formerly gunmetal backpack) from
  // g/G/M/m → j/J/N/n so the entire mech reads as one yellow unit.
  const MECH_REMAP = { g: "j", G: "J", M: "N", m: "n" };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = MECH_REMAP[g[y][x]];
      if (r) g[y][x] = r;
    }
  }
  // Outline pass — 1px dark around silhouette
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
  // Ground shadow — wider than Marine because Engineer's backpack flares wider
  const cx = 23, cy = 39, rx = 12, ry = 2;
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
    shadow:[], leftClaw:[], rightClaw:[],
    leftProngU:[], leftProngL:[], rightProngU:[], rightProngL:[],
    backpackL:[], backpackR:[],
    visor:[], head:[], cage:[], body:[], legs:[], boots:[],
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

/* ============================================================ Overlays */

/* ============================================================ Claw overlays
 *
 * The Engineer's two manipulator claws are no longer baked into the
 * stencil — they're drawn as overlays so each state can pose them.
 * The DEFAULT overlay sits inside the en-leftClaw / en-rightClaw groups,
 * so the idle/streaming/awaiting/etc. CSS animations apply to it
 * unchanged. Per-state overlays (thinking, tool_running, error) hide
 * the default and draw a posed replacement.
 */

/* Default rest pose — both claws hang at the waist sides as full-sized
 * pincer tools. The arm shaft comes off the backpack at mid-torso,
 * angles outward (foreshortened in bird's-eye), and ends in a 4-wide
 * pincer head with accent inside and accent prong tips pointing down.
 * Same chunky proportions as the original over-the-helmet claws. */
const DEFAULT_LEFT_CLAW_HIP = [
  // Shoulder mount on the backpack edge (cols 14-15, rows 19-20)
  { x: 14, y: 19, w: 1, h: 1, c: "N" },
  { x: 15, y: 19, w: 1, h: 1, c: "J" },
  { x: 14, y: 20, w: 1, h: 1, c: "N" },
  { x: 15, y: 20, w: 1, h: 1, c: "J" },
  // Forearm angling outward toward the pincer
  { x: 13, y: 21, w: 1, h: 1, c: "N" },
  { x: 14, y: 21, w: 1, h: 1, c: "J" },
  { x: 12, y: 22, w: 1, h: 1, c: "N" },
  { x: 13, y: 22, w: 1, h: 1, c: "J" },
  // 4-wide pincer head — shoulder row
  { x: 10, y: 23, w: 1, h: 1, c: "J" },
  { x: 11, y: 23, w: 1, h: 1, c: "N" },
  { x: 12, y: 23, w: 1, h: 1, c: "N" },
  { x: 13, y: 23, w: 1, h: 1, c: "J" },
  // Pincer body with accent inner
  { x: 10, y: 24, w: 1, h: 1, c: "J" },
  { x: 11, y: 24, w: 1, h: 1, c: "V" },
  { x: 12, y: 24, w: 1, h: 1, c: "V" },
  { x: 13, y: 24, w: 1, h: 1, c: "J" },
  { x: 10, y: 25, w: 1, h: 1, c: "N" },
  { x: 11, y: 25, w: 1, h: 1, c: "v" },
  { x: 12, y: 25, w: 1, h: 1, c: "v" },
  { x: 13, y: 25, w: 1, h: 1, c: "N" },
  // Outer prong tips — accent, pointing down
  { x: 10, y: 26, w: 1, h: 1, c: "V" },
  { x: 13, y: 26, w: 1, h: 1, c: "V" },
];
const DEFAULT_RIGHT_CLAW_HIP = [
  { x: 32, y: 19, w: 1, h: 1, c: "J" },
  { x: 33, y: 19, w: 1, h: 1, c: "N" },
  { x: 32, y: 20, w: 1, h: 1, c: "J" },
  { x: 33, y: 20, w: 1, h: 1, c: "N" },
  { x: 33, y: 21, w: 1, h: 1, c: "J" },
  { x: 34, y: 21, w: 1, h: 1, c: "N" },
  { x: 34, y: 22, w: 1, h: 1, c: "J" },
  { x: 35, y: 22, w: 1, h: 1, c: "N" },
  { x: 34, y: 23, w: 1, h: 1, c: "J" },
  { x: 35, y: 23, w: 1, h: 1, c: "N" },
  { x: 36, y: 23, w: 1, h: 1, c: "N" },
  { x: 37, y: 23, w: 1, h: 1, c: "J" },
  { x: 34, y: 24, w: 1, h: 1, c: "J" },
  { x: 35, y: 24, w: 1, h: 1, c: "V" },
  { x: 36, y: 24, w: 1, h: 1, c: "V" },
  { x: 37, y: 24, w: 1, h: 1, c: "J" },
  { x: 34, y: 25, w: 1, h: 1, c: "N" },
  { x: 35, y: 25, w: 1, h: 1, c: "v" },
  { x: 36, y: 25, w: 1, h: 1, c: "v" },
  { x: 37, y: 25, w: 1, h: 1, c: "N" },
  { x: 34, y: 26, w: 1, h: 1, c: "V" },
  { x: 37, y: 26, w: 1, h: 1, c: "V" },
];

/* Thinking: raised eyebrow above visor (accent), shown while the
 * right gripper scratches at the chin. Same vocabulary as the Marine. */
const THINKING_BROW = [
  { x: 20, y: 9, w: 3, h: 1, c: "v" },
];

/* Tool running: BOTH claws lift off the hip and swing forward, meeting
 * at a welding point at the chest (row 23, cols 22-23). The two
 * pincers face each other at the weld. */
const TOOL_LEFT_CLAW_EXTENDED = [
  // Hip mount
  { x: 14, y: 21, w: 1, h: 1, c: "J" },
  { x: 15, y: 21, w: 1, h: 1, c: "N" },
  // Forearm sweeping forward toward the chest
  { x: 15, y: 22, w: 1, h: 1, c: "J" },
  { x: 16, y: 22, w: 1, h: 1, c: "J" },
  { x: 17, y: 22, w: 1, h: 1, c: "j" },
  { x: 17, y: 23, w: 1, h: 1, c: "N" },
  { x: 18, y: 23, w: 1, h: 1, c: "J" },
  { x: 19, y: 23, w: 1, h: 1, c: "J" },
  { x: 20, y: 23, w: 1, h: 1, c: "J" },
  // 2×2 pincer hook just left of the weld glow
  { x: 20, y: 22, w: 1, h: 1, c: "N" },
  { x: 21, y: 22, w: 1, h: 1, c: "N" },
  { x: 20, y: 24, w: 1, h: 1, c: "V" },
  { x: 21, y: 24, w: 1, h: 1, c: "v" },
];
const TOOL_RIGHT_CLAW_EXTENDED = [
  { x: 33, y: 21, w: 1, h: 1, c: "J" },
  { x: 32, y: 21, w: 1, h: 1, c: "N" },
  { x: 32, y: 22, w: 1, h: 1, c: "J" },
  { x: 31, y: 22, w: 1, h: 1, c: "J" },
  { x: 30, y: 22, w: 1, h: 1, c: "j" },
  { x: 30, y: 23, w: 1, h: 1, c: "N" },
  { x: 29, y: 23, w: 1, h: 1, c: "J" },
  { x: 28, y: 23, w: 1, h: 1, c: "J" },
  { x: 27, y: 23, w: 1, h: 1, c: "J" },
  { x: 27, y: 22, w: 1, h: 1, c: "N" },
  { x: 26, y: 22, w: 1, h: 1, c: "N" },
  { x: 27, y: 24, w: 1, h: 1, c: "v" },
  { x: 26, y: 24, w: 1, h: 1, c: "V" },
];

/* Welding mask: when tool_running, a dark face shield overlays the visor
   strip and extends down across the chin. A single bright horizontal slit
   on row 11 reads as the arc reflecting through the welder's eyepiece
   (tinted by the team color so it stays accent-coded). */
const WELDING_MASK = [
  // Solid dark shield covering visor + chin (8 px wide, 3 px tall)
  { x: 20, y: 10, w: 8, h: 1, c: "k" },
  { x: 20, y: 11, w: 8, h: 1, c: "k" },
  { x: 20, y: 12, w: 8, h: 1, c: "k" },
  // Viewing slit — accent-bright; flickers in CSS like a real arc.
  { x: 21, y: 11, w: 6, h: 1, c: "v" },
];

/* Welding: a small hot-white core at the meeting point of the two claws,
   ringed by a yellow glow, plus a constant spray of single-pixel sparks
   that fly outward in eight directions and fade out. Each spark carries
   its own Δx/Δy and animation-delay so the spray reads continuous.

   Why this shape: the core stays anchored at one pixel position so the
   eye doesn't track it as a moving object — only the sparks travel.
   Earlier versions scaled the core, which read as a wandering yellow
   circle (transform-origin under fill-box drifts off-frame). */
const WELD_CORE = [
  { x: 22, y: 23, w: 1, h: 1, c: "S" },
  { x: 23, y: 23, w: 1, h: 1, c: "S" },
];
const WELD_GLOW = [
  { x: 21, y: 23, w: 1, h: 1, c: "F" },
  { x: 24, y: 23, w: 1, h: 1, c: "F" },
  { x: 22, y: 22, w: 1, h: 1, c: "F" },
  { x: 23, y: 22, w: 1, h: 1, c: "F" },
  { x: 22, y: 24, w: 1, h: 1, c: "F" },
  { x: 23, y: 24, w: 1, h: 1, c: "F" },
];
/* Eight->ten sparks fanning outward from the weld point. Directions,
   magnitudes, durations, and delays are all deliberately uneven so the
   spray reads chaotic. Per-spark `dur` means each one cycles at its own
   rate — they drift out of phase forever, no swirl pattern. */
const WELD_SPARKS = [
  // start at varied origin pixels at the chest weld, fan outward
  { x: 23, y: 23, dx:   8, dy:   4, c: "f", delay:   0, dur: 640 },
  { x: 22, y: 23, dx:  -9, dy:  -3, c: "S", delay:  90, dur: 720 },
  { x: 22, y: 24, dx:   1, dy:   8, c: "F", delay: 180, dur: 600 },
  { x: 23, y: 22, dx:   6, dy:  -9, c: "S", delay: 280, dur: 700 },
  { x: 22, y: 23, dx: -11, dy:   1, c: "F", delay: 360, dur: 660 },
  { x: 23, y: 22, dx:  -2, dy: -10, c: "S", delay: 460, dur: 720 },
  { x: 23, y: 23, dx:  10, dy:  -2, c: "F", delay: 530, dur: 600 },
  { x: 22, y: 24, dx:  -7, dy:   6, c: "f", delay: 620, dur: 680 },
  { x: 23, y: 22, dx:   3, dy: -11, c: "S", delay: 700, dur: 740 },
  { x: 23, y: 23, dx:  11, dy:   3, c: "F", delay: 800, dur: 660 },
];

/* tool_running gripper overlay — the RIGHT gripper redrawn so its mouth
 * faces LEFT toward the chest welding spot. The gripper extends
 * horizontally across the body, with prong tips at cols 21–22 (right
 * over the weld) and back wall at col 32 against the right shoulder.
 * Same 3-tone shading (N top / J front) so it reads as the same tool. */
const TOOL_GRIPPER = [
  // Upper prong — top highlight + front face (rows 21–22, cols 21–32)
  { x: 21, y: 21, w: 12, h: 1, c: "N" },
  { x: 21, y: 22, w: 12, h: 1, c: "J" },
  // Back wall — single col at right, between the two prongs
  { x: 32, y: 23, w: 1, h: 1, c: "J" },
  // Lower prong — top highlight + front face (rows 24–25)
  { x: 21, y: 24, w: 12, h: 1, c: "N" },
  { x: 21, y: 25, w: 12, h: 1, c: "J" },
];

/* Streaming: speech bubble + dots, identical pattern to the Marine so
   the family reads consistent. */
const VOICE_BUBBLE = [
  { x: 32, y: 1, w: 7, h: 1, c: "W" },
  { x: 32, y: 2, w: 7, h: 1, c: "W" },
  { x: 32, y: 3, w: 7, h: 1, c: "W" },
  { x: 32, y: 4, w: 1, h: 1, c: "W" },
  { x: 31, y: 5, w: 1, h: 1, c: "W" },
];
const VOICE_DOTS = [
  { id: 1, x: 33, y: 2 },
  { id: 2, x: 35, y: 2 },
  { id: 3, x: 37, y: 2 },
];

/* Awaiting permission: "?" pixel glyph above helmet (same as Marine) */
const GLYPH_QUESTION = [
  { x: 23, y: 0 }, { x: 24, y: 0 },
  { x: 22, y: 1 }, { x: 25, y: 1 },
  { x: 24, y: 2 },
  { x: 24, y: 4 },
];

/* Deploying: engineer presses a big red button at his right side.
 *   1. The button is visible throughout the transient (yellow housing,
 *      bright red dome — universally readable "deploy" affordance).
 *   2. Right gripper translates down to "press" the button.
 *   3. The button dome depresses 1px and an accent flash ring pulses
 *      around it at the moment of press.
 * Same gesture vocabulary works on the Marine too. */
const DEPLOY_DOME = [
  // Red hemisphere — slides down into the pedestal when pressed.
  { x: 39, y: 28, w: 1, h: 1, c: "R" },
  { x: 40, y: 28, w: 1, h: 1, c: "S" }, // dome specular highlight
  { x: 41, y: 28, w: 1, h: 1, c: "R" },
  { x: 42, y: 28, w: 1, h: 1, c: "e" },
  { x: 38, y: 29, w: 1, h: 1, c: "R" },
  { x: 39, y: 29, w: 1, h: 1, c: "R" },
  { x: 40, y: 29, w: 1, h: 1, c: "R" },
  { x: 41, y: 29, w: 1, h: 1, c: "R" },
  { x: 42, y: 29, w: 1, h: 1, c: "e" },
  { x: 43, y: 29, w: 1, h: 1, c: "e" },
  { x: 38, y: 30, w: 1, h: 1, c: "R" },
  { x: 39, y: 30, w: 1, h: 1, c: "R" },
  { x: 40, y: 30, w: 1, h: 1, c: "R" },
  { x: 41, y: 30, w: 1, h: 1, c: "R" },
  { x: 42, y: 30, w: 1, h: 1, c: "e" },
  { x: 43, y: 30, w: 1, h: 1, c: "e" },
  { x: 39, y: 31, w: 1, h: 1, c: "R" },
  { x: 40, y: 31, w: 1, h: 1, c: "R" },
  { x: 41, y: 31, w: 1, h: 1, c: "e" },
  { x: 42, y: 31, w: 1, h: 1, c: "e" },
];
const DEPLOY_PEDESTAL = [
  // Yellow housing — stays put. Renders ON TOP of the dome so when the
  // dome translates down, its lower rows are visually hidden behind
  // the pedestal lip → reads as "button pressed into housing".
  { x: 37, y: 32, w: 1, h: 1, c: "N" },
  { x: 38, y: 32, w: 1, h: 1, c: "N" },
  { x: 39, y: 32, w: 1, h: 1, c: "J" },
  { x: 40, y: 32, w: 1, h: 1, c: "J" },
  { x: 41, y: 32, w: 1, h: 1, c: "J" },
  { x: 42, y: 32, w: 1, h: 1, c: "J" },
  { x: 43, y: 32, w: 1, h: 1, c: "j" },
  { x: 44, y: 32, w: 1, h: 1, c: "j" },
  { x: 37, y: 33, w: 1, h: 1, c: "N" },
  { x: 38, y: 33, w: 1, h: 1, c: "J" },
  { x: 39, y: 33, w: 1, h: 1, c: "J" },
  { x: 40, y: 33, w: 1, h: 1, c: "J" },
  { x: 41, y: 33, w: 1, h: 1, c: "J" },
  { x: 42, y: 33, w: 1, h: 1, c: "j" },
  { x: 43, y: 33, w: 1, h: 1, c: "j" },
  { x: 44, y: 33, w: 1, h: 1, c: "j" },
  { x: 37, y: 34, w: 1, h: 1, c: "J" },
  { x: 38, y: 34, w: 1, h: 1, c: "J" },
  { x: 39, y: 34, w: 1, h: 1, c: "J" },
  { x: 40, y: 34, w: 1, h: 1, c: "J" },
  { x: 41, y: 34, w: 1, h: 1, c: "j" },
  { x: 42, y: 34, w: 1, h: 1, c: "j" },
  { x: 43, y: 34, w: 1, h: 1, c: "j" },
  { x: 44, y: 34, w: 1, h: 1, c: "n" },
  { x: 37, y: 35, w: 8, h: 1, c: "n" },
];
const DEPLOY_FLASH = [
  // Accent ring around the dome — pulses on press
  { x: 36, y: 29, w: 1, h: 1, c: "V" },
  { x: 45, y: 29, w: 1, h: 1, c: "V" },
  { x: 39, y: 26, w: 4, h: 1, c: "V" },
  { x: 36, y: 31, w: 1, h: 1, c: "V" },
  { x: 45, y: 31, w: 1, h: 1, c: "V" },
];

/* Error: arms have gone slack. Both arms hang straight down past the
 * legs, ending in the SAME 4-wide pincer head as the default rest pose
 * (consistent visual language) — just with the accent dimmed via
 * errorMode. The arm shaft uses a clean two-tone stripe (highlight on
 * the outer edge, base on the inner) so the limb reads as one drooping
 * arm rather than a stippled trail. */
const ERROR_LEFT_CLAW_DROOP = [
  // Shoulder anchor at the top of the body
  { x: 14, y: 17, w: 1, h: 1, c: "N" },
  { x: 15, y: 17, w: 1, h: 1, c: "J" },
  // Arm shaft hanging straight down — consistent 2-tone stripe
  { x: 14, y: 18, w: 1, h: 1, c: "N" },
  { x: 15, y: 18, w: 1, h: 1, c: "J" },
  { x: 14, y: 19, w: 1, h: 1, c: "N" },
  { x: 15, y: 19, w: 1, h: 1, c: "J" },
  { x: 14, y: 20, w: 1, h: 1, c: "N" },
  { x: 15, y: 20, w: 1, h: 1, c: "J" },
  { x: 14, y: 21, w: 1, h: 1, c: "N" },
  { x: 15, y: 21, w: 1, h: 1, c: "J" },
  { x: 14, y: 22, w: 1, h: 1, c: "N" },
  { x: 15, y: 22, w: 1, h: 1, c: "J" },
  { x: 14, y: 23, w: 1, h: 1, c: "N" },
  { x: 15, y: 23, w: 1, h: 1, c: "J" },
  { x: 14, y: 24, w: 1, h: 1, c: "N" },
  { x: 15, y: 24, w: 1, h: 1, c: "J" },
  { x: 14, y: 25, w: 1, h: 1, c: "N" },
  { x: 15, y: 25, w: 1, h: 1, c: "J" },
  { x: 14, y: 26, w: 1, h: 1, c: "N" },
  { x: 15, y: 26, w: 1, h: 1, c: "J" },
  // 4-wide pincer head at the bottom — matches default pincer
  { x: 13, y: 27, w: 1, h: 1, c: "J" },
  { x: 14, y: 27, w: 1, h: 1, c: "N" },
  { x: 15, y: 27, w: 1, h: 1, c: "N" },
  { x: 16, y: 27, w: 1, h: 1, c: "J" },
  { x: 13, y: 28, w: 1, h: 1, c: "J" },
  { x: 14, y: 28, w: 1, h: 1, c: "V" },
  { x: 15, y: 28, w: 1, h: 1, c: "V" },
  { x: 16, y: 28, w: 1, h: 1, c: "J" },
  { x: 13, y: 29, w: 1, h: 1, c: "N" },
  { x: 14, y: 29, w: 1, h: 1, c: "v" },
  { x: 15, y: 29, w: 1, h: 1, c: "v" },
  { x: 16, y: 29, w: 1, h: 1, c: "N" },
  // Outer prong tips pointing straight down
  { x: 13, y: 30, w: 1, h: 1, c: "V" },
  { x: 16, y: 30, w: 1, h: 1, c: "V" },
];
const ERROR_RIGHT_CLAW_DROOP = [
  { x: 32, y: 17, w: 1, h: 1, c: "J" },
  { x: 33, y: 17, w: 1, h: 1, c: "N" },
  { x: 32, y: 18, w: 1, h: 1, c: "J" },
  { x: 33, y: 18, w: 1, h: 1, c: "N" },
  { x: 32, y: 19, w: 1, h: 1, c: "J" },
  { x: 33, y: 19, w: 1, h: 1, c: "N" },
  { x: 32, y: 20, w: 1, h: 1, c: "J" },
  { x: 33, y: 20, w: 1, h: 1, c: "N" },
  { x: 32, y: 21, w: 1, h: 1, c: "J" },
  { x: 33, y: 21, w: 1, h: 1, c: "N" },
  { x: 32, y: 22, w: 1, h: 1, c: "J" },
  { x: 33, y: 22, w: 1, h: 1, c: "N" },
  { x: 32, y: 23, w: 1, h: 1, c: "J" },
  { x: 33, y: 23, w: 1, h: 1, c: "N" },
  { x: 32, y: 24, w: 1, h: 1, c: "J" },
  { x: 33, y: 24, w: 1, h: 1, c: "N" },
  { x: 32, y: 25, w: 1, h: 1, c: "J" },
  { x: 33, y: 25, w: 1, h: 1, c: "N" },
  { x: 32, y: 26, w: 1, h: 1, c: "J" },
  { x: 33, y: 26, w: 1, h: 1, c: "N" },
  { x: 31, y: 27, w: 1, h: 1, c: "J" },
  { x: 32, y: 27, w: 1, h: 1, c: "N" },
  { x: 33, y: 27, w: 1, h: 1, c: "N" },
  { x: 34, y: 27, w: 1, h: 1, c: "J" },
  { x: 31, y: 28, w: 1, h: 1, c: "J" },
  { x: 32, y: 28, w: 1, h: 1, c: "V" },
  { x: 33, y: 28, w: 1, h: 1, c: "V" },
  { x: 34, y: 28, w: 1, h: 1, c: "J" },
  { x: 31, y: 29, w: 1, h: 1, c: "N" },
  { x: 32, y: 29, w: 1, h: 1, c: "v" },
  { x: 33, y: 29, w: 1, h: 1, c: "v" },
  { x: 34, y: 29, w: 1, h: 1, c: "N" },
  { x: 31, y: 30, w: 1, h: 1, c: "V" },
  { x: 34, y: 30, w: 1, h: 1, c: "V" },
];

/* Error: dim visor mask (overdraws the accent visor with armor base
   between flashes) + flashing red. Same vocabulary as Marine. */
const ERROR_VISOR_RED = [
  { x: 20, y: 10, w: 8, h: 1, c: "R" },
  { x: 20, y: 11, w: 8, h: 1, c: "R" },
];
const ERROR_VISOR_MASK = [
  { x: 20, y: 10, w: 8, h: 1, c: "2" },
  { x: 20, y: 11, w: 8, h: 1, c: "2" },
];

/* Spawning: teleport flash. A bright ring contracts inward to the
   engineer's silhouette, then dissipates. The unit fades in beneath. */
const TELEPORT_RING_OUTER = [
  // Big outer ring at frame 0
  { x: 12, y: 8,  w: 24, h: 1, c: "T" },
  { x: 12, y: 30, w: 24, h: 1, c: "T" },
  { x: 12, y: 8,  w: 1, h: 23, c: "T" },
  { x: 35, y: 8,  w: 1, h: 23, c: "T" },
];
const TELEPORT_RING_MID = [
  { x: 16, y: 12, w: 16, h: 1, c: "T" },
  { x: 16, y: 26, w: 16, h: 1, c: "T" },
  { x: 16, y: 12, w: 1, h: 15, c: "T" },
  { x: 31, y: 12, w: 1, h: 15, c: "T" },
];
const TELEPORT_RING_INNER = [
  { x: 19, y: 16, w: 10, h: 1, c: "t" },
  { x: 19, y: 22, w: 10, h: 1, c: "t" },
  { x: 19, y: 16, w: 1, h: 7, c: "t" },
  { x: 28, y: 16, w: 1, h: 7, c: "t" },
];

/* ============================================================ CSS */

const SCOPED_CSS = `
.en-engineer { display:inline-block; position:relative; line-height:0; image-rendering:pixelated; image-rendering:crisp-edges; }
.en-engineer svg { display:block; image-rendering:pixelated; }
.en-g { transform-box: fill-box; transform-origin: center; }
.en-bodyAssembly { transform-origin: 23px 28px; }

/* Each gripper has a wrapper group pivoting around its back-wall mount.
   The default identity transform leaves it in the horizontal closed pose;
   per-state rules rotate the wrapper to a "relaxed, pointing down" pose
   for whichever gripper isn't animating in that state. */
.en-leftArmWrap  { transform-origin: 12px 21px; }
.en-rightArmWrap { transform-origin: 35px 21px; }
/* Relaxed pose — gripper rotated down toward the body center (slightly
   inward) and translated a couple px down, as if the engineer is letting
   that arm hang loose. Applied to whichever gripper isn't actively
   animating in a given state. */
.en-state-idle      .en-leftArmWrap  { transform: translate(2px, 4px) rotate(-55deg); }
/* Thinking — LEFT gripper relaxes; RIGHT gripper scratches at the chin */
.en-state-thinking  .en-leftArmWrap  { transform: translate(2px, 4px) rotate(-55deg); }
.en-state-done      .en-leftArmWrap  { transform: translate(2px, 4px) rotate(-55deg); }
.en-state-done      .en-rightArmWrap { transform: translate(-2px, 4px) rotate(55deg); }
.en-state-error     .en-leftArmWrap  { transform: translate(2px, 4px) rotate(-55deg); }
.en-state-error     .en-rightArmWrap { transform: translate(-2px, 4px) rotate(55deg); }
/* Spawning is a transient, not a state — the right gripper should
   relax during the teleport-in flash. */
.en-tr-spawning     .en-rightArmWrap { transform: translate(-2px, 4px) rotate(55deg); }

/* ===== idle: identical sway to the marine — translateX 1px L/R at 900ms.
   The body assembly (everything above the hip) bobs together while the
   legs/boots stay planted. Meanwhile the RIGHT gripper opens fully and
   closes fully on its own cycle, then holds shut. ===== */
@keyframes en-idle-bob {
  0%, 24.99% { transform: translateX(0); }
  25%, 49.99% { transform: translateX(-1px); }
  50%, 74.99% { transform: translateX(0); }
  75%, 100% { transform: translateX(1px); }
}
@keyframes en-idle-prong-upper {
  0%       { transform: translateY(0); }    /* start: closed */
  20%      { transform: translateY(-3px); } /* fully open */
  40%      { transform: translateY(0); }    /* fully closed */
  100%     { transform: translateY(0); }    /* hold closed */
}
@keyframes en-idle-prong-lower {
  0%       { transform: translateY(0); }
  20%      { transform: translateY(3px); }
  40%      { transform: translateY(0); }
  100%     { transform: translateY(0); }
}
.en-state-idle .en-bodyAssembly { animation: en-idle-bob 900ms linear infinite; }
.en-state-idle .en-rightProngU  { animation: en-idle-prong-upper 1800ms ease-in-out infinite; }
.en-state-idle .en-rightProngL  { animation: en-idle-prong-lower 1800ms ease-in-out infinite; }

/* ===== thinking: head tilts; RIGHT gripper rotates up to the chin and
   scratches with a small jiggle; eyebrow rises above the visor.
   Vocabulary matches the Marine's hand-on-chin pose. ===== */
@keyframes en-think-head {
  0%, 19.99% { transform: translateX(0); }
  20%, 79.99% { transform: translateX(-1px); }
  80%, 100% { transform: translateX(0); }
}
@keyframes en-think-scratch {
  /* Rest in relaxed-dangling pose (matching done state) → reach up to
     chin → scratch jiggle → return to relaxed dangling pose. */
  0%, 12%   { transform: translate(-2px, 4px) rotate(55deg); }
  22%, 28%  { transform: translate(-4px, 1px) rotate(-130deg); }
  35%       { transform: translate(-5px, 1px) rotate(-128deg); }
  45%       { transform: translate(-4px, 2px) rotate(-132deg); }
  55%       { transform: translate(-5px, 1px) rotate(-128deg); }
  62%, 68%  { transform: translate(-4px, 1px) rotate(-130deg); }
  80%, 100% { transform: translate(-2px, 4px) rotate(55deg); }
}
@keyframes en-think-brow-pose {
  /* Brow only visible while the gripper is actually at the chin. */
  0%, 18%    { opacity: 0; }
  22%, 68%   { opacity: 1; }
  72%, 100%  { opacity: 0; }
}
.en-state-thinking .en-head, .en-state-thinking .en-visor {
  animation: en-think-head 1600ms linear infinite;
}
.en-state-thinking .en-thinkBrow {
  animation: en-think-head 1600ms linear infinite, en-think-brow-pose 1600ms linear infinite;
}
.en-state-thinking .en-rightArmWrap { animation: en-think-scratch 1600ms ease-in-out infinite; }

/* ===== tool_running: both claws extend forward and meet at the weld
   point. Welding sparks pulse rapidly. ===== */
@keyframes en-tool-claws-pose {
  0%, 9.99% { opacity: 0; }
  10%, 100% { opacity: 1; }
}
@keyframes en-weld-core-flicker {
  /* Opacity-only flicker — NO scale (scale + fill-box origin made the
     core wander across the frame like a yellow circle). */
  0%, 100% { opacity: 1; }
  35%      { opacity: 0.55; }
  50%      { opacity: 1; }
  72%      { opacity: 0.7; }
}
@keyframes en-weld-glow-flicker {
  0%, 100% { opacity: 0.65; }
  50%      { opacity: 1; }
}
@keyframes en-spark-fly {
  /* Per-spark trajectory — dx/dy come from CSS custom props on the
     element so all sparks share one keyframe. */
  0%   { transform: translate(0, 0); opacity: 1; }
  15%  { opacity: 1; }
  100% { transform: translate(var(--dx, 0px), var(--dy, 0px)); opacity: 0; }
}
/* tool_running: engineer welds in front of him. Both default grippers
   hide; the right gripper is redrawn as an overlay extending across the
   chest with its mouth pointing at the weld. Sparks fly from the weld
   point; welder mask drops over the visor. Body holds still. */
.en-state-tool_running .en-leftArm,
.en-state-tool_running .en-rightArm { visibility: hidden; }
.en-state-tool_running .en-weldCore { animation: en-weld-core-flicker 240ms linear infinite; }
.en-state-tool_running .en-weldGlow { animation: en-weld-glow-flicker 360ms linear infinite; }
/* Hide the normal accent visor — the welding mask takes its place. */
.en-state-tool_running .en-visor    { visibility: hidden; }
@keyframes en-weld-slit-flicker {
  0%, 100% { opacity: 1; }
  40%      { opacity: 0.55; }
  60%      { opacity: 1; }
  85%      { opacity: 0.75; }
}
.en-state-tool_running .en-weldSlit { animation: en-weld-slit-flicker 320ms linear infinite; }
.en-state-tool_running .en-spark    { animation-name: en-spark-fly; animation-timing-function: linear; animation-iteration-count: infinite; }

/* ===== streaming: speech bubble + dots + head bob. Both grippers
   stay in the relaxed-dangling rest pose — no gesticulation. ===== */
@keyframes en-stream-head {
  0%, 49.99% { transform: translateY(0); }
  50%, 100%  { transform: translateY(-1px); }
}
@keyframes en-talk-bubble {
  0%, 5%    { opacity: 0; }
  10%, 90%  { opacity: 1; }
  95%, 100% { opacity: 0; }
}
@keyframes en-talk-dot-1 { 0%, 14.99% { opacity: 0; } 15%, 100% { opacity: 1; } }
@keyframes en-talk-dot-2 { 0%, 34.99% { opacity: 0; } 35%, 100% { opacity: 1; } }
@keyframes en-talk-dot-3 { 0%, 54.99% { opacity: 0; } 55%, 100% { opacity: 1; } }
/* Both grippers rest in the relaxed-dangling pose (matching done state). */
.en-state-streaming .en-leftArmWrap  { transform: translate(2px, 4px) rotate(-55deg); }
.en-state-streaming .en-rightArmWrap { transform: translate(-2px, 4px) rotate(55deg); }
.en-state-streaming .en-head, .en-state-streaming .en-visor { animation: en-stream-head 1200ms linear infinite; }
.en-state-streaming .en-bubble  { animation: en-talk-bubble 1500ms linear infinite; transform-origin: 30px 3px; }
.en-state-streaming .en-talkDot { animation-duration: 1500ms; animation-timing-function: linear; animation-iteration-count: infinite; }
.en-state-streaming .en-talkDot-1 { animation-name: en-talk-dot-1; }
.en-state-streaming .en-talkDot-2 { animation-name: en-talk-dot-2; }
.en-state-streaming .en-talkDot-3 { animation-name: en-talk-dot-3; }

/* ===== awaiting_permission: body does a small patient jump; LEFT
   gripper rests at the side, RIGHT gripper waves at an upward angle
   to get attention. ===== */
@keyframes en-await-jump {
  0%, 9.99%   { transform: translateY(0); }
  10%, 24.99% { transform: translateY(-4px); }
  25%, 34.99% { transform: translateY(0); }
  35%, 49.99% { transform: translateY(-4px); }
  50%, 100%   { transform: translateY(0); }
}
@keyframes en-await-wave {
  /* Right gripper waves at an upward angle AND rides the body's
     patient-jump translation in sync with en-await-jump (up at 10-25%
     and 35-50%, on ground otherwise). */
  0%, 9.99%   { transform: translate(2px, -8px) rotate(-50deg); }
  10%, 24.99% { transform: translate(0, -13px) rotate(-30deg); }
  25%, 34.99% { transform: translate(2px, -8px) rotate(-50deg); }
  35%, 49.99% { transform: translate(4px, -13px) rotate(-70deg); }
  50%, 100%   { transform: translate(2px, -8px) rotate(-50deg); }
}
.en-state-awaiting_permission .en-body, .en-state-awaiting_permission .en-head,
.en-state-awaiting_permission .en-visor, .en-state-awaiting_permission .en-cage,
.en-state-awaiting_permission .en-backpackL,
.en-state-awaiting_permission .en-backpackR, .en-state-awaiting_permission .en-legs,
.en-state-awaiting_permission .en-boots {
  animation: en-await-jump 1500ms linear infinite;
}
@keyframes en-await-leftarm-jump {
  /* Left gripper holds the relaxed-dangling pose and rides the body's
     patient jump in sync with en-await-jump. */
  0%, 9.99%   { transform: translate(2px, 4px) rotate(-55deg); }
  10%, 24.99% { transform: translate(2px, 0px) rotate(-55deg); }
  25%, 34.99% { transform: translate(2px, 4px) rotate(-55deg); }
  35%, 49.99% { transform: translate(2px, 0px) rotate(-55deg); }
  50%, 100%   { transform: translate(2px, 4px) rotate(-55deg); }
}
/* Left gripper rests in relaxed pose AND jumps with the body. */
.en-state-awaiting_permission .en-leftArmWrap  { animation: en-await-leftarm-jump 1500ms linear infinite; }
.en-state-awaiting_permission .en-rightArmWrap { animation: en-await-wave 1500ms ease-in-out infinite; }

/* ===== done: brief snap-up — body squares up, claws retract to neutral. ===== */
@keyframes en-done-body {
  0%, 19.99% { transform: translateY(-1px); }
  20%, 100%  { transform: translateY(0); }
}
@keyframes en-done-claws {
  0%, 19.99% { transform: translate(0, -1px); }
  20%, 100%  { transform: translate(0, 0); }
}
.en-state-done .en-body, .en-state-done .en-head, .en-state-done .en-visor,
.en-state-done .en-cage,
.en-state-done .en-backpackL, .en-state-done .en-backpackR {
  animation: en-done-body 1400ms linear forwards;
}
/* Done: grippers relaxed (handled by .en-state-done .en-*ArmWrap above);
   no per-subgroup animation in this state. */

/* ===== error: body tilts, the upright claws are hidden and explicit
   drooped-claw overlays hang limp at the sides. Accent visor dims and
   flashes red. ===== */
@keyframes en-error-tilt {
  0%, 49.99% { transform: rotate(-3deg) translateX(-1px); }
  50%, 100%  { transform: rotate(-3deg) translateX(0); }
}
@keyframes en-error-droop-sway {
  /* Subtle dangle — limp claws sway a pixel back and forth. */
  0%, 49.99% { transform: translate(0, 0); }
  50%, 100%  { transform: translate(1px, 0); }
}
@keyframes en-error-flash {
  0%, 39.99% { opacity: 0; }
  40%, 59.99% { opacity: 1; }
  60%, 100% { opacity: 0; }
}
@keyframes en-error-mask {
  0%, 39.99% { opacity: 1; }
  40%, 59.99% { opacity: 0; }
  60%, 100% { opacity: 1; }
}
.en-state-error .en-body, .en-state-error .en-head, .en-state-error .en-visor,
.en-state-error .en-cage,
.en-state-error .en-backpackL, .en-state-error .en-backpackR {
  animation: en-error-tilt 1800ms linear infinite;
  transform-origin: 23px 36px;
}
/* Error: grippers stay in the relaxed dangling pose (handled by
   .en-state-error .en-*ArmWrap above), they don't participate in the
   body's stagger-tilt animation. */
.en-state-error .en-errorMask  { animation: en-error-tilt 1800ms linear infinite, en-error-mask 1100ms linear infinite; transform-origin: 23px 36px; }
.en-state-error .en-errorVisor { animation: en-error-tilt 1800ms linear infinite, en-error-flash 1100ms linear infinite; transform-origin: 23px 36px; }

/* ===== spawning: engineer falls from above into the frame.
   The whole unit translates from -56px (offscreen) down to 0 with an
   ease-in feel, then a 1px overshoot squash + bounce on landing. ===== */
@keyframes en-spawn-drop {
  0%        { transform: translateY(-56px); }
  70%       { transform: translateY(0); }
  /* Squash at impact */
  78%       { transform: translateY(1px); }
  88%       { transform: translateY(-1px); }
  100%      { transform: translateY(0); }
}
@keyframes en-spawn-shadow {
  /* Shadow stays hidden in the air and fades in at landing */
  0%, 60%   { opacity: 0; }
  72%, 100% { opacity: 1; }
}
.en-tr-spawning .en-body, .en-tr-spawning .en-head, .en-tr-spawning .en-visor,
.en-tr-spawning .en-cage,
.en-tr-spawning .en-leftArm, .en-tr-spawning .en-rightArm,
.en-tr-spawning .en-backpackL, .en-tr-spawning .en-backpackR,
.en-tr-spawning .en-legs, .en-tr-spawning .en-boots,
.en-tr-spawning .en-bodyAssembly {
  animation: en-spawn-drop 900ms cubic-bezier(0.4, 0, 0.7, 1) forwards;
}
.en-tr-spawning .en-shadow {
  animation: en-spawn-shadow 900ms linear forwards;
}

/* ===== deploying: engineer presses a big red button at his right side.
   Gripper translates down to press, button dome depresses 1px, accent
   flash ring pulses at the press moment. ===== */
@keyframes en-deploy-press {
  0%, 14.99% { transform: translate(0, 0); }
  25%, 60%   { transform: translate(0, 7px); }
  75%, 100%  { transform: translate(0, 0); }
}
@keyframes en-deploy-dome-press {
  /* Dome slides DOWN into the pedestal housing on press.
     Pedestal stays put and is drawn on top — visually clips the dome. */
  0%, 19%    { transform: translate(0, 0); }
  25%, 60%   { transform: translate(0, 3px); }
  75%, 100%  { transform: translate(0, 0); }
}
@keyframes en-deploy-flash {
  0%, 24%    { opacity: 0; }
  28%, 55%   { opacity: 1; }
  65%, 100%  { opacity: 0; }
}
.en-tr-deploying .en-rightArm    { animation: en-deploy-press 900ms linear forwards; }
.en-tr-deploying .en-deployDome  { animation: en-deploy-dome-press 900ms linear forwards; }
.en-tr-deploying .en-deployFlash { animation: en-deploy-flash 900ms linear forwards; }

@media (prefers-reduced-motion: reduce) {
  .en-engineer *, .en-engineer *::before, .en-engineer *::after {
    animation: none !important;
    transition: none !important;
  }
  .en-state-thinking .en-thinkBrow { opacity: 1; }
  .en-state-tool_running .en-leftArm, .en-state-tool_running .en-rightArm { visibility: hidden; }
  .en-state-tool_running .en-weldCore { opacity: 1; }
  .en-state-tool_running .en-weldGlow { opacity: 0.8; }
  .en-state-tool_running .en-spark    { opacity: 0; }
  .en-state-streaming .en-bubble { opacity: 1; }
  .en-state-streaming .en-talkDot { opacity: 1; }
  .en-state-awaiting_permission .en-glyph { opacity: 1; }
  .en-state-error .en-body, .en-state-error .en-head, .en-state-error .en-visor,
  .en-state-error .en-cage,
  .en-state-error .en-backpackL, .en-state-error .en-backpackR {
    transform: rotate(-3deg); transform-origin: 23px 36px;
  }
}
`;

/* ============================================================ Component */

function facingToDeg(f) {
  return ({ S:0, SW:45, W:90, NW:135, N:180, NE:225, E:270, SE:315 })[f] || 0;
}

const Engineer = ({
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
  const showGlyph = state === "awaiting_permission";
  const isToolRunning = state === "tool_running";
  const isThinking = state === "thinking";
  const rotateDeg = facingToDeg(facing);

  return (
    <div
      className={`en-engineer en-state-${state}${transient ? ` en-tr-${transient}` : ""}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Engineer, ${state}`}
    >
      <style>{SCOPED_CSS}</style>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        shapeRendering="crispEdges"
        style={rotateDeg ? { transform: `rotate(${rotateDeg}deg)` } : undefined}
      >
        <g className="en-g en-shadow">{renderRects(GROUPED.shadow, ramps, errorMode)}</g>

        {/* Boots + legs stay planted — body assembly rotates above them */}
        <g className="en-g en-boots">{renderRects(GROUPED.boots, ramps, errorMode)}</g>
        <g className="en-g en-legs">{renderRects(GROUPED.legs, ramps, errorMode)}</g>

        {/* Everything from the hip up rotates as one unit (hip sway, etc.) */}
        <g className="en-bodyAssembly">
          <g className="en-g en-backpackL">{renderRects(GROUPED.backpackL, ramps, errorMode)}</g>
          <g className="en-g en-backpackR">{renderRects(GROUPED.backpackR, ramps, errorMode)}</g>
          <g className="en-g en-body">{renderRects(GROUPED.body, ramps, errorMode)}</g>
          <g className="en-g en-cage">{renderRects(GROUPED.cage, ramps, errorMode)}</g>
          <g className="en-g en-head">{renderRects(GROUPED.head, ramps, errorMode)}</g>
          <g className="en-g en-visor">{renderRects(GROUPED.visor, ramps, errorMode)}</g>

          {/* Left gripper — wrapper allows pivot-rotation to a relaxed pose */}
          <g className="en-leftArmWrap">
            <g className="en-g en-leftClaw en-leftArm">{renderRects(GROUPED.leftClaw, ramps, errorMode)}</g>
            <g className="en-g en-leftProngU en-leftArm">{renderRects(GROUPED.leftProngU, ramps, errorMode)}</g>
            <g className="en-g en-leftProngL en-leftArm">{renderRects(GROUPED.leftProngL, ramps, errorMode)}</g>
          </g>
          {/* Right gripper — wrapper too */}
          <g className="en-rightArmWrap">
            <g className="en-g en-rightClaw en-rightArm">{renderRects(GROUPED.rightClaw, ramps, errorMode)}</g>
            <g className="en-g en-rightProngU en-rightArm">{renderRects(GROUPED.rightProngU, ramps, errorMode)}</g>
            <g className="en-g en-rightProngL en-rightArm">{renderRects(GROUPED.rightProngL, ramps, errorMode)}</g>
          </g>
        </g>

        {isToolRunning && (
          <>
            <g className="en-g en-weldMask">
              {WELDING_MASK.filter((p) => p.c === "k").map((p, i) => (
                <rect key={`m${i}`} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            <g className="en-g en-weldSlit">
              {WELDING_MASK.filter((p) => p.c !== "k").map((p, i) => (
                <rect key={`s${i}`} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            {/* Redrawn right gripper — extends horizontally across the chest with
                its mouth aimed at the weld point. Draws over the body but
                under the weld glow/core so the prong tips frame the weld. */}
            <g className="en-g en-toolGripper">
              {TOOL_GRIPPER.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            <g className="en-g en-weldGlow">
              {WELD_GLOW.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            <g className="en-g en-weldCore">
              {WELD_CORE.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            <g className="en-sparkLayer">
              {WELD_SPARKS.map((s, i) => (
                <rect
                  key={i}
                  className="en-spark"
                  x={s.x}
                  y={s.y}
                  width={1}
                  height={1}
                  fill={resolveColor(s.c, ramps, errorMode)}
                  style={{
                    "--dx": `${s.dx}px`,
                    "--dy": `${s.dy}px`,
                    animationDuration: `${s.dur}ms`,
                    animationDelay: `${s.delay}ms`,
                  }}
                />
              ))}
            </g>
          </>
        )}

        {state === "error" && (
          <>
            <g className="en-g en-errorMask">
              {ERROR_VISOR_MASK.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            <g className="en-g en-errorVisor">
              {ERROR_VISOR_RED.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={FIXED_REST.R} />
              ))}
            </g>
          </>
        )}

        {state === "thinking" && (
          <g className="en-g en-thinkBrow">
            {THINKING_BROW.map((p, i) => (
              <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                fill={resolveColor(p.c, ramps, errorMode)} />
            ))}
          </g>
        )}

        {state === "streaming" && (
          <g className="en-g en-bubble">
            {VOICE_BUBBLE.map((p, i) => (
              <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                fill={resolveColor(p.c, ramps, errorMode)} />
            ))}
            {VOICE_DOTS.map((d) => (
              <rect key={d.id} className={`en-talkDot en-talkDot-${d.id}`}
                x={d.x} y={d.y} width={1} height={1} fill={FIXED_REST.k} />
            ))}
          </g>
        )}

        {/* Question-mark glyph removed from awaiting_permission per design update. */}

        {transient === "deploying" && (
          <>
            <g className="en-g en-deployFlash">
              {DEPLOY_FLASH.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            {/* Dome first — it slides down into the pedestal when pressed */}
            <g className="en-g en-deployDome">
              {DEPLOY_DOME.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            {/* Pedestal renders on top of the dome so it clips the dome's
                bottom when the dome translates down (the "sliding into the
                housing" read). */}
            <g className="en-g en-deployPedestal">
              {DEPLOY_PEDESTAL.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
          </>
        )}

        {transient === "spawning" && null}
      </svg>
    </div>
  );
};

export { Engineer };
