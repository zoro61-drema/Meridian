/* src/lib/commandSprites/Engineer.tsx — Repair specialist Engineer.
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

/* The Repair Specialist Engineer (Variant C).
 *
 * Pixel codes:
 *   1..5  armor ramp (V0..V4)
 *   V/v   accent (visor, claw tips, shoulder lights, belt buckle, chest stripe)
 *   g/G/M/m  tool / backpack / claw gunmetal ramp
 *   b/P   boot leather / sole
 *   u     under-suit (neck)
 *   k     belt strap
 *
 * Region map (used for animation grouping below):
 *   Left claw arch:  rows 4–13, cols 13–19 (pincer tips at row 4)
 *   Right claw arch: rows 4–13, cols 28–34
 *   Backpack mount:  rows 14–16, cols 13–17 (left), 30–34 (right)
 *   Helmet:          rows 5–13, cols 19–28
 *   Visor (accent):  rows 10–11
 *   Torso:           rows 14–24
 *   Legs:            rows 27–33
 *   Boots:           rows 34–36
 *   Shadow center at (23, 39).
 */
const STENCIL = [
  R(),                                                                // 00
  R(),                                                                // 01
  R(),                                                                // 02
  R(),                                                                // 03
  R([17, "vV"], [29, "Vv"]),                                          // 04 claw tips — accent glow framing helmet
  R([16, "GMVM"], [28, "MVMG"]),                                      // 05 claw pincers (gunmetal + accent inner) + helmet apex
  R([16, "GgG"], [21, "445544"], [29, "GgG"]),                        // 06 claw forward arms + helmet apex
  R([16, "GgG"], [20, "44555544"], [29, "GgG"]),                      // 07 helmet wider
  R([16, "Gg"], [19, "4555555443"], [29, "gG"]),                      // 08 helmet full
  R([16, "GG"], [19, "4555555443"], [29, "GG"]),                      // 09 helmet band
  R([16, "GM"], [19, "3vvvvvvvv3"], [29, "MG"]),                      // 10 VISOR HIGHLIGHT (accent)
  R([16, "GM"], [19, "3VVVVVVVV3"], [29, "MG"]),                      // 11 VISOR BASE (accent)
  R([16, "GM"], [20, "33333333"], [29, "MG"]),                        // 12 chin
  R([16, "GM"], [21, "u3333u"], [29, "MG"]),                          // 13 neck
  R([15, "MGG"], [21, "uuuu"], [29, "GGM"]),                          // 14 claw → backpack transition + neck collar
  R([14, "MGG4"], [18, "Vv44"], [22, "5544"], [26, "44Vv"], [30, "4GGM"]),     // 15 backpack mount + shoulder lights L+R + helmet collar
  R([14, "GGGG"], [18, "44444444"], [26, "44444"], [30, "GGGG"]),     // 16 backpack edge + pauldrons (widest body row)
  R([13, "GG"], [15, "MGGr"], [19, "44544443"], [28, "rGGM"], [32, "GG"]),     // 17 backpack WIDEST + chest top
  R([13, "GG"], [15, "MGGr"], [19, "44544443"], [28, "rGGM"], [32, "GG"]),     // 18 backpack + chest
  R([13, "GG"], [15, "MGGr"], [19, "44VVVV43"], [28, "rGGM"], [32, "GG"]),     // 19 backpack + chest stripe row 1 (accent)
  R([13, "GG"], [15, "MGGr"], [19, "44VVVV43"], [28, "rGGM"], [32, "GG"]),     // 20 backpack + chest stripe row 2 (accent)
  R([14, "Mg"], [16, "GG3"], [19, "44544443"], [28, "3GG"], [32, "gM"]),       // 21 backpack tapers
  R([14, "Mg"], [16, "G33"], [19, "33333333"], [28, "33G"], [32, "gM"]),       // 22 backpack base
  R([14, "Mg"], [17, "h3"],  [19, "33333333"], [28, "3h"], [32, "gM"]),        // 23 gloves at sides
  R([15, "g"],  [17, "33"],  [19, "33333333"], [28, "33"], [32, "g"]),         // 24 belly
  R([18, "3kkkkVkkk3"]),                                              // 25 belt + accent buckle (V at col 23)
  R([18, "333333333"]),                                               // 26 belt under
  R([18, "33433"], [24, "33433"]),                                    // 27 hips
  R([18, "33343"], [24, "34333"]),                                    // 28 wider hips
  R([19, "3343"], [25, "3433"]),                                      // 29 legs begin
  R([19, "2343"], [25, "3432"]),                                      // 30 knee shadow
  R([19, "3343"], [25, "3433"]),                                      // 31
  R([19, "3343"], [25, "3433"]),                                      // 32
  R([19, "2233"], [25, "3322"]),                                      // 33 ankle
  R([17, "bbbbbb"], [25, "bbbbbb"]),                                  // 34 boot tops (wider for heavy build)
  R([17, "bPPPPb"], [25, "bPPPPb"]),                                  // 35
  R([17, "PPPPPP"], [25, "PPPPPP"]),                                  // 36 soles
  R(), R(), R(), R(), R(), R(), R(), R(), R(), R(), R(),              // 37-47
];

/* ============================================================ Grid + grouping */

function classifyPixel(c, x, y) {
  if (c === "z" || c === "y" || c === "w") return "shadow";
  // VISOR — both visor rows 10-11 use accent codes
  if (y >= 10 && y <= 11 && x >= 19 && x <= 28) return "visor";
  // CLAWS — rows 4-13 outside the helmet block
  if (y >= 4 && y <= 13 && (x <= 19 && x >= 13)) {
    // Skip helmet pixels (cols 19-28 from row 5 down) — claw owns 13-18 here
    if (x === 19 && y >= 5) return "head";
    return "leftClaw";
  }
  if (y >= 4 && y <= 13 && x >= 28 && x <= 34) {
    if (x === 28 && y >= 5) return "head";
    return "rightClaw";
  }
  // Row 14 — neck + claw mounts
  if (y === 14) {
    if (x >= 15 && x <= 17) return "leftClaw";
    if (x >= 29 && x <= 31) return "rightClaw";
    return "head";
  }
  // Backpack lateral bulk rows 15-23 cols 13-17 (left) and 30-34 (right)
  if (y >= 15 && y <= 23) {
    if (x >= 13 && x <= 17) return "backpackL";
    if (x >= 30 && x <= 34) return "backpackR";
  }
  // Helmet upper rows 5-13 cols 19-28
  if (y >= 5 && y <= 13) return "head";
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
  // Recolor the manipulator-arm pixels from gunmetal (g/G/M/m) to the
  // industrial-yellow claw ramp (j/J/N/n). Backpack and tools keep their
  // gunmetal. The arm region: rows 4–14, cols 13–19 (left arm) and 28–34
  // (right arm). Row 14 is the claw→backpack mount — we treat it as claw
  // so the yellow reads as one continuous shape down to the backpack edge.
  const CLAW_REMAP = { g: "j", G: "J", M: "N", m: "n" };
  for (let y = 4; y <= 14; y++) {
    for (const [xLo, xHi] of [[13, 19], [28, 34]]) {
      for (let x = xLo; x <= xHi; x++) {
        const r = CLAW_REMAP[g[y][x]];
        if (r) g[y][x] = r;
      }
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
    shadow:[], leftClaw:[], rightClaw:[], backpackL:[], backpackR:[],
    visor:[], head:[], body:[], legs:[], boots:[],
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

/* Thinking: the right claw bends inward toward the helmet (the engineer
   cocks its working claw to peer at a schematic). Replacement shape for
   the right-claw group — the pincer tip dips down beside the visor and
   carries the accent so it reads clearly. */
const THINKING_BENT_CLAW = [
  { x: 30, y: 14, w: 2, h: 1, c: "J" },
  { x: 30, y: 13, w: 2, h: 1, c: "N" },
  { x: 30, y: 12, w: 2, h: 1, c: "J" },
  { x: 29, y: 11, w: 2, h: 1, c: "J" },
  { x: 28, y: 10, w: 2, h: 1, c: "j" },
  { x: 28, y: 9,  w: 2, h: 1, c: "J" },
  { x: 28, y: 8,  w: 2, h: 1, c: "N" },
  { x: 28, y: 7,  w: 1, h: 1, c: "J" },
  { x: 29, y: 7,  w: 1, h: 1, c: "V" },
  { x: 28, y: 6,  w: 1, h: 1, c: "N" },
  { x: 29, y: 6,  w: 1, h: 1, c: "v" },
];

/* Tool running: BOTH claws extend forward by 2 px and meet at a welding
   point in front of the engineer. Hot welding sparks burst at the meeting
   point (centered around col 23, row 18–24). Accent-tinted glow. */
/* tool_running extended claws — 2 px wide stair-step arms exiting the
   backpack mount and bending forward to flank the weld point. Each claw
   ends in a 2×2 pincer hook (yellow highlight row + accent face row),
   matching the idle pincer's structure. Render order is reversed below:
   weld glow draws first, then the claws over the top so the accent
   hooks stay legible. */
const TOOL_LEFT_CLAW_EXTENDED = [
  // Mount (row 14 cols 15–17 — replicates static stencil since the
  // leftClaw group is hidden in tool_running).
  { x: 15, y: 14, w: 1, h: 1, c: "N" },
  { x: 16, y: 14, w: 1, h: 1, c: "J" },
  { x: 17, y: 14, w: 1, h: 1, c: "J" },
  // 2 px wide diagonal arm stepping right one column every other row.
  { x: 16, y: 15, w: 1, h: 1, c: "J" },
  { x: 17, y: 15, w: 1, h: 1, c: "j" },
  { x: 17, y: 16, w: 1, h: 1, c: "N" },
  { x: 18, y: 16, w: 1, h: 1, c: "J" },
  { x: 18, y: 17, w: 1, h: 1, c: "J" },
  { x: 19, y: 17, w: 1, h: 1, c: "j" },
  { x: 19, y: 18, w: 1, h: 1, c: "N" },
  { x: 20, y: 18, w: 1, h: 1, c: "J" },
  { x: 19, y: 19, w: 1, h: 1, c: "J" },
  { x: 20, y: 19, w: 1, h: 1, c: "j" },
  { x: 20, y: 20, w: 1, h: 1, c: "J" },
  { x: 21, y: 20, w: 1, h: 1, c: "J" },
  // 2×2 pincer hook adjacent to the weld point (cols 22–23, row 23).
  { x: 20, y: 21, w: 1, h: 1, c: "N" },
  { x: 21, y: 21, w: 1, h: 1, c: "N" },
  { x: 20, y: 22, w: 1, h: 1, c: "V" },
  { x: 21, y: 22, w: 1, h: 1, c: "v" },
];
const TOOL_RIGHT_CLAW_EXTENDED = [
  // Mirrored mount.
  { x: 29, y: 14, w: 1, h: 1, c: "J" },
  { x: 30, y: 14, w: 1, h: 1, c: "J" },
  { x: 31, y: 14, w: 1, h: 1, c: "N" },
  { x: 30, y: 15, w: 1, h: 1, c: "J" },
  { x: 29, y: 15, w: 1, h: 1, c: "j" },
  { x: 29, y: 16, w: 1, h: 1, c: "N" },
  { x: 28, y: 16, w: 1, h: 1, c: "J" },
  { x: 28, y: 17, w: 1, h: 1, c: "J" },
  { x: 27, y: 17, w: 1, h: 1, c: "j" },
  { x: 27, y: 18, w: 1, h: 1, c: "N" },
  { x: 26, y: 18, w: 1, h: 1, c: "J" },
  { x: 27, y: 19, w: 1, h: 1, c: "J" },
  { x: 26, y: 19, w: 1, h: 1, c: "j" },
  { x: 26, y: 20, w: 1, h: 1, c: "J" },
  { x: 25, y: 20, w: 1, h: 1, c: "J" },
  { x: 26, y: 21, w: 1, h: 1, c: "N" },
  { x: 25, y: 21, w: 1, h: 1, c: "N" },
  { x: 26, y: 22, w: 1, h: 1, c: "v" },
  { x: 25, y: 22, w: 1, h: 1, c: "V" },
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
  // start at varied origin pixels, dy negative = upward, dx negative = leftward
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

/* Streaming: speech bubble + dots, identical pattern to the Marine so
   the family reads consistent. */
const VOICE_BUBBLE = [
  { x: 32, y: 1, w: 6, h: 1, c: "W" },
  { x: 32, y: 2, w: 6, h: 1, c: "W" },
  { x: 32, y: 3, w: 6, h: 1, c: "W" },
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

/* Deploying: side button slap + spark. The right claw doesn't move
   far — it dips down and a small spark bursts at the engineer's right
   hip, where a deployment kit would be mounted. */
const DEPLOY_KIT = [
  { x: 33, y: 22, w: 1, h: 1, c: "M" },
  { x: 33, y: 23, w: 1, h: 1, c: "G" },
  { x: 33, y: 24, w: 1, h: 1, c: "g" },
  { x: 34, y: 23, w: 1, h: 1, c: "G" },
];
const DEPLOY_SPARK = [
  { x: 35, y: 22 }, { x: 35, y: 23 },
  { x: 36, y: 22 },
];

/* Error: claws hang LIMP at the sides instead of arching over the helmet.
   The base sprite's claws are hidden and these drooped overlays render
   in their place — the claws look like they've gone slack. Pincer tips
   carry dimmed accent. */
/* error droop — claws hang limp at the sides. 2 px wide stair-step arms
   shifting outward from the backpack mount, then descending vertically
   to a 2×2 pincer hook at the bottom. Accent dims through errorMode. */
const ERROR_LEFT_CLAW_DROOP = [
  // Mount (replicates static row 14 cols 15–17 since leftClaw is hidden).
  { x: 15, y: 14, w: 1, h: 1, c: "N" },
  { x: 16, y: 14, w: 1, h: 1, c: "J" },
  { x: 17, y: 14, w: 1, h: 1, c: "J" },
  // Drape outward + down. 2 px wide arm stepping left.
  { x: 14, y: 15, w: 1, h: 1, c: "J" },
  { x: 15, y: 15, w: 1, h: 1, c: "j" },
  { x: 13, y: 16, w: 1, h: 1, c: "N" },
  { x: 14, y: 16, w: 1, h: 1, c: "J" },
  { x: 12, y: 17, w: 1, h: 1, c: "J" },
  { x: 13, y: 17, w: 1, h: 1, c: "j" },
  { x: 11, y: 18, w: 1, h: 1, c: "N" },
  { x: 12, y: 18, w: 1, h: 1, c: "J" },
  { x: 10, y: 19, w: 1, h: 1, c: "J" },
  { x: 11, y: 19, w: 1, h: 1, c: "j" },
  // Vertical descent to pincer.
  { x: 10, y: 20, w: 1, h: 1, c: "J" },
  { x: 11, y: 20, w: 1, h: 1, c: "J" },
  // 2×2 pincer hook.
  { x: 10, y: 21, w: 1, h: 1, c: "N" },
  { x: 11, y: 21, w: 1, h: 1, c: "N" },
  { x: 10, y: 22, w: 1, h: 1, c: "V" },
  { x: 11, y: 22, w: 1, h: 1, c: "v" },
];
const ERROR_RIGHT_CLAW_DROOP = [
  { x: 29, y: 14, w: 1, h: 1, c: "J" },
  { x: 30, y: 14, w: 1, h: 1, c: "J" },
  { x: 31, y: 14, w: 1, h: 1, c: "N" },
  { x: 31, y: 15, w: 1, h: 1, c: "j" },
  { x: 32, y: 15, w: 1, h: 1, c: "J" },
  { x: 32, y: 16, w: 1, h: 1, c: "J" },
  { x: 33, y: 16, w: 1, h: 1, c: "N" },
  { x: 33, y: 17, w: 1, h: 1, c: "j" },
  { x: 34, y: 17, w: 1, h: 1, c: "J" },
  { x: 34, y: 18, w: 1, h: 1, c: "J" },
  { x: 35, y: 18, w: 1, h: 1, c: "N" },
  { x: 35, y: 19, w: 1, h: 1, c: "j" },
  { x: 36, y: 19, w: 1, h: 1, c: "J" },
  { x: 36, y: 20, w: 1, h: 1, c: "J" },
  { x: 37, y: 20, w: 1, h: 1, c: "J" },
  { x: 36, y: 21, w: 1, h: 1, c: "N" },
  { x: 37, y: 21, w: 1, h: 1, c: "N" },
  { x: 36, y: 22, w: 1, h: 1, c: "v" },
  { x: 37, y: 22, w: 1, h: 1, c: "V" },
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

/* ===== idle: body sways L/R; claws follow with a phase lag so they look
   like loose mechanical arms tracking the body. Backpack moves with body. ===== */
@keyframes en-idle-body {
  0%, 24.99% { transform: translateX(0); }
  25%, 49.99% { transform: translateX(-1px); }
  50%, 74.99% { transform: translateX(0); }
  75%, 100% { transform: translateX(1px); }
}
@keyframes en-idle-claw-l {
  0%, 12.49%  { transform: translate(0, 0); }
  12.5%, 37.49% { transform: translate(-1px, 0); }
  37.5%, 62.49% { transform: translate(-1px, -1px); }
  62.5%, 87.49% { transform: translate(0, 0); }
  87.5%, 100% { transform: translate(1px, 0); }
}
@keyframes en-idle-claw-r {
  /* Right claw is offset — when left is leaning out, right is centering.
     Reads as gentle independent articulation, like a forklift idling. */
  0%, 12.49%  { transform: translate(0, 0); }
  12.5%, 37.49% { transform: translate(0, -1px); }
  37.5%, 62.49% { transform: translate(1px, 0); }
  62.5%, 87.49% { transform: translate(1px, -1px); }
  87.5%, 100% { transform: translate(0, 0); }
}
.en-state-idle .en-body, .en-state-idle .en-head, .en-state-idle .en-visor,
.en-state-idle .en-backpackL, .en-state-idle .en-backpackR,
.en-state-idle .en-legs {
  animation: en-idle-body 1100ms linear infinite;
}
.en-state-idle .en-leftClaw  { animation: en-idle-claw-l 1100ms linear infinite; }
.en-state-idle .en-rightClaw { animation: en-idle-claw-r 1100ms linear infinite; }

/* ===== thinking: head tilts toward right claw, right claw bends inward
   toward the helmet (replacement overlay), left claw twitches as if
   feeding the bent claw a part. ===== */
@keyframes en-think-head {
  0%, 19.99% { transform: translateX(0); }
  20%, 79.99% { transform: translateX(1px); }
  80%, 100% { transform: translateX(0); }
}
@keyframes en-think-leftclaw {
  0%, 19.99% { transform: translate(0, 0); }
  25%        { transform: translate(0, -1px); }
  35%        { transform: translate(1px, 0); }
  45%        { transform: translate(0, -1px); }
  55%        { transform: translate(1px, 0); }
  65%, 100%  { transform: translate(0, 0); }
}
@keyframes en-think-bent-flash {
  0%, 5%   { opacity: 0; }
  10%, 95% { opacity: 1; }
  100%     { opacity: 1; }
}
.en-state-thinking .en-rightClaw { visibility: hidden; }
.en-state-thinking .en-head, .en-state-thinking .en-visor {
  animation: en-think-head 1600ms linear infinite;
}
.en-state-thinking .en-leftClaw { animation: en-think-leftclaw 1600ms linear infinite; }
.en-state-thinking .en-thinkClaw { animation: en-think-bent-flash 1600ms linear infinite; }

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
/* tool_running: body holds dead still — welders don't sway while working.
   Only the claws (extended overlays), the weld core flicker, and the
   spark spray animate. */
.en-state-tool_running .en-leftClaw, .en-state-tool_running .en-rightClaw { visibility: hidden; }
.en-state-tool_running .en-toolLeftClaw, .en-state-tool_running .en-toolRightClaw {
  animation: en-tool-claws-pose 360ms linear infinite;
}
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

/* ===== streaming: speech bubble + dots + claws gesticulate
   (out-of-phase wave). Reads as the engineer chattering with hand-talk. ===== */
@keyframes en-stream-claw-l {
  0%, 24.99% { transform: translate(0, 0); }
  25%, 49.99% { transform: translate(-1px, -1px); }
  50%, 74.99% { transform: translate(-1px, 0); }
  75%, 100% { transform: translate(0, 1px); }
}
@keyframes en-stream-claw-r {
  0%, 24.99% { transform: translate(0, 1px); }
  25%, 49.99% { transform: translate(0, 0); }
  50%, 74.99% { transform: translate(1px, -1px); }
  75%, 100% { transform: translate(1px, 0); }
}
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
.en-state-streaming .en-leftClaw  { animation: en-stream-claw-l 1200ms linear infinite; }
.en-state-streaming .en-rightClaw { animation: en-stream-claw-r 1200ms linear infinite; }
.en-state-streaming .en-head, .en-state-streaming .en-visor { animation: en-stream-head 1200ms linear infinite; }
.en-state-streaming .en-bubble  { animation: en-talk-bubble 1500ms linear infinite; transform-origin: 30px 3px; }
.en-state-streaming .en-talkDot { animation-duration: 1500ms; animation-timing-function: linear; animation-iteration-count: infinite; }
.en-state-streaming .en-talkDot-1 { animation-name: en-talk-dot-1; }
.en-state-streaming .en-talkDot-2 { animation-name: en-talk-dot-2; }
.en-state-streaming .en-talkDot-3 { animation-name: en-talk-dot-3; }

/* ===== awaiting_permission: body does a small patient jump while BOTH
   claws raise overhead and wave attention-getting. ? glyph holds above. ===== */
@keyframes en-await-jump {
  0%, 9.99%   { transform: translateY(0); }
  10%, 24.99% { transform: translateY(-4px); }
  25%, 34.99% { transform: translateY(0); }
  35%, 49.99% { transform: translateY(-4px); }
  50%, 100%   { transform: translateY(0); }
}
@keyframes en-await-claw-l {
  0%, 9.99%   { transform: translate(0, 0); }
  20%         { transform: translate(2px, -6px); }
  30%         { transform: translate(3px, -7px); }
  40%         { transform: translate(2px, -6px); }
  50%, 100%   { transform: translate(0, 0); }
}
@keyframes en-await-claw-r {
  0%, 9.99%   { transform: translate(0, 0); }
  20%         { transform: translate(-3px, -7px); }
  30%         { transform: translate(-2px, -6px); }
  40%         { transform: translate(-3px, -7px); }
  50%, 100%   { transform: translate(0, 0); }
}
@keyframes en-await-glyph {
  0%, 14.99% { opacity: 0; }
  15%, 84.99% { opacity: 1; }
  85%, 100% { opacity: 0; }
}
.en-state-awaiting_permission .en-body, .en-state-awaiting_permission .en-head,
.en-state-awaiting_permission .en-visor, .en-state-awaiting_permission .en-backpackL,
.en-state-awaiting_permission .en-backpackR, .en-state-awaiting_permission .en-legs,
.en-state-awaiting_permission .en-boots {
  animation: en-await-jump 1500ms linear infinite;
}
.en-state-awaiting_permission .en-leftClaw  { animation: en-await-claw-l 1500ms linear infinite; }
.en-state-awaiting_permission .en-rightClaw { animation: en-await-claw-r 1500ms linear infinite; }
.en-state-awaiting_permission .en-glyph { animation: en-await-glyph 1500ms linear infinite; }

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
.en-state-done .en-backpackL, .en-state-done .en-backpackR {
  animation: en-done-body 1400ms linear forwards;
}
.en-state-done .en-leftClaw, .en-state-done .en-rightClaw {
  animation: en-done-claws 1400ms linear forwards;
}

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
.en-state-error .en-backpackL, .en-state-error .en-backpackR {
  animation: en-error-tilt 1800ms linear infinite;
  transform-origin: 23px 36px;
}
/* Hide the upright claws — replace with drooped overlays. */
.en-state-error .en-leftClaw, .en-state-error .en-rightClaw { visibility: hidden; }
.en-state-error .en-errorClawL, .en-state-error .en-errorClawR {
  animation: en-error-tilt 1800ms linear infinite, en-error-droop-sway 1800ms linear infinite;
  transform-origin: 23px 36px;
}
.en-state-error .en-errorMask  { animation: en-error-tilt 1800ms linear infinite, en-error-mask 1100ms linear infinite; transform-origin: 23px 36px; }
.en-state-error .en-errorVisor { animation: en-error-tilt 1800ms linear infinite, en-error-flash 1100ms linear infinite; transform-origin: 23px 36px; }

/* ===== spawning: teleport flash — three concentric rings collapse inward,
   unit fades in beneath. ===== */
@keyframes en-spawn-ring-outer {
  0%, 5%   { opacity: 0; transform: scale(1.4); }
  10%, 18% { opacity: 1; transform: scale(1.2); }
  35%      { opacity: 0.6; transform: scale(1); }
  50%, 100% { opacity: 0; transform: scale(0.9); }
}
@keyframes en-spawn-ring-mid {
  0%, 10%  { opacity: 0; transform: scale(1.3); }
  20%, 30% { opacity: 1; transform: scale(1); }
  45%      { opacity: 0.7; transform: scale(0.85); }
  60%, 100% { opacity: 0; transform: scale(0.8); }
}
@keyframes en-spawn-ring-inner {
  0%, 20%  { opacity: 0; transform: scale(1.2); }
  30%, 50% { opacity: 1; transform: scale(1); }
  65%, 100% { opacity: 0; transform: scale(0.85); }
}
@keyframes en-spawn-unit-fade {
  0%, 25%  { opacity: 0; }
  35%      { opacity: 0.3; }
  55%      { opacity: 0.8; }
  70%, 100% { opacity: 1; }
}
@keyframes en-spawn-unit-shimmer {
  /* Subtle horizontal scanline shimmer over the fade-in */
  0%, 30%  { filter: brightness(2.5); }
  50%      { filter: brightness(1.4); }
  70%, 100% { filter: brightness(1); }
}
.en-tr-spawning .en-spawnOuter { animation: en-spawn-ring-outer 1200ms linear forwards; transform-origin: 23px 19px; }
.en-tr-spawning .en-spawnMid   { animation: en-spawn-ring-mid 1200ms linear forwards; transform-origin: 23px 19px; }
.en-tr-spawning .en-spawnInner { animation: en-spawn-ring-inner 1200ms linear forwards; transform-origin: 23px 19px; }
.en-tr-spawning .en-body, .en-tr-spawning .en-head, .en-tr-spawning .en-visor,
.en-tr-spawning .en-leftClaw, .en-tr-spawning .en-rightClaw,
.en-tr-spawning .en-backpackL, .en-tr-spawning .en-backpackR,
.en-tr-spawning .en-legs, .en-tr-spawning .en-boots {
  animation: en-spawn-unit-fade 1200ms linear forwards, en-spawn-unit-shimmer 1200ms linear forwards;
}
.en-tr-spawning .en-shadow {
  animation: en-spawn-unit-fade 1200ms linear forwards;
}

/* ===== deploying: right claw dips to slap a side-mounted deploy kit; spark
   bursts at the kit. ===== */
@keyframes en-deploy-claw {
  0%, 14.99% { transform: translate(0, 0); }
  15%, 50%   { transform: translate(3px, 8px); }
  65%, 100%  { transform: translate(0, 0); }
}
@keyframes en-deploy-spark {
  0%, 24.99% { opacity: 0; transform: translate(0, 0); }
  25%, 55%   { opacity: 1; transform: translate(1px, -1px); }
  60%, 100%  { opacity: 0; transform: translate(3px, -2px); }
}
@keyframes en-deploy-kit-flash {
  0%, 19.99% { opacity: 0.7; }
  25%, 50%   { opacity: 1; }
  60%, 100%  { opacity: 0.7; }
}
.en-tr-deploying .en-rightClaw   { animation: en-deploy-claw 900ms linear forwards; transform-origin: 31px 14px; }
.en-tr-deploying .en-deployKit   { animation: en-deploy-kit-flash 900ms linear forwards; }
.en-tr-deploying .en-deploySpark { animation: en-deploy-spark 900ms linear forwards; }

@media (prefers-reduced-motion: reduce) {
  .en-engineer *, .en-engineer *::before, .en-engineer *::after {
    animation: none !important;
    transition: none !important;
  }
  .en-state-thinking .en-rightClaw { visibility: hidden; }
  .en-state-thinking .en-thinkClaw { opacity: 1; }
  .en-state-tool_running .en-leftClaw, .en-state-tool_running .en-rightClaw { visibility: hidden; }
  .en-state-tool_running .en-toolLeftClaw, .en-state-tool_running .en-toolRightClaw { opacity: 1; }
  .en-state-tool_running .en-weldCore { opacity: 1; }
  .en-state-tool_running .en-weldGlow { opacity: 0.8; }
  .en-state-tool_running .en-spark    { opacity: 0; }
  .en-state-streaming .en-bubble { opacity: 1; }
  .en-state-streaming .en-talkDot { opacity: 1; }
  .en-state-awaiting_permission .en-glyph { opacity: 1; }
  .en-state-error .en-body, .en-state-error .en-head, .en-state-error .en-visor,
  .en-state-error .en-backpackL, .en-state-error .en-backpackR,
  .en-state-error .en-errorClawL, .en-state-error .en-errorClawR {
    transform: rotate(-3deg); transform-origin: 23px 36px;
  }
  .en-state-error .en-leftClaw, .en-state-error .en-rightClaw { visibility: hidden; }
}
`;

/* ============================================================ Component */

function facingToDeg(f) {
  return ({ S:0, SW:45, W:90, NW:135, N:180, NE:225, E:270, SE:315 })[f] || 0;
}

export const Engineer: React.FC<UnitProps> = ({
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

        {/* Boots → legs → backpack (lateral) → body → claws → head → visor
            Ordered so claws render OVER the head (they arch forward over it). */}
        <g className="en-g en-boots">{renderRects(GROUPED.boots, ramps, errorMode)}</g>
        <g className="en-g en-legs">{renderRects(GROUPED.legs, ramps, errorMode)}</g>
        <g className="en-g en-backpackL">{renderRects(GROUPED.backpackL, ramps, errorMode)}</g>
        <g className="en-g en-backpackR">{renderRects(GROUPED.backpackR, ramps, errorMode)}</g>
        <g className="en-g en-body">{renderRects(GROUPED.body, ramps, errorMode)}</g>
        <g className="en-g en-head">{renderRects(GROUPED.head, ramps, errorMode)}</g>
        <g className="en-g en-visor">{renderRects(GROUPED.visor, ramps, errorMode)}</g>
        <g className="en-g en-leftClaw">{renderRects(GROUPED.leftClaw, ramps, errorMode)}</g>
        <g className="en-g en-rightClaw">{renderRects(GROUPED.rightClaw, ramps, errorMode)}</g>

        {isThinking && (
          <g className="en-g en-thinkClaw">
            {THINKING_BENT_CLAW.map((p, i) => (
              <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                fill={resolveColor(p.c, ramps, errorMode)} />
            ))}
          </g>
        )}

        {isToolRunning && (
          <>
            {/* Render order matters here:
               1. Welder mask + slit cover the helmet visor (rendered above
                  the visor by virtue of appearing later in the SVG).
               2. Weld glow + core sit at the chest meeting point.
               3. Extended claws draw ON TOP of glow/core so the accent
                  pincer hooks read clearly above the bright yellow halo.
               4. Spark layer is last so flying sparks pass over everything. */}
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
            <g className="en-g en-toolLeftClaw">
              {TOOL_LEFT_CLAW_EXTENDED.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            <g className="en-g en-toolRightClaw">
              {TOOL_RIGHT_CLAW_EXTENDED.map((p, i) => (
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
                    ["--dx" as any]: `${s.dx}px`,
                    ["--dy" as any]: `${s.dy}px`,
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
            <g className="en-g en-errorClawL">
              {ERROR_LEFT_CLAW_DROOP.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            <g className="en-g en-errorClawR">
              {ERROR_RIGHT_CLAW_DROOP.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
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

        {showGlyph && (
          <g className="en-g en-glyph">
            {GLYPH_QUESTION.map((p, i) => (
              <rect key={i} x={p.x} y={p.y} width={1} height={1} fill={ramps.acc.v} />
            ))}
          </g>
        )}

        {transient === "deploying" && (
          <>
            <g className="en-g en-deployKit">
              {DEPLOY_KIT.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            <g className="en-g en-deploySpark">
              {DEPLOY_SPARK.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={1} height={1} fill={ramps.acc.v} />
              ))}
            </g>
          </>
        )}

        {transient === "spawning" && (
          <>
            <g className="en-g en-spawnOuter">
              {TELEPORT_RING_OUTER.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            <g className="en-g en-spawnMid">
              {TELEPORT_RING_MID.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            <g className="en-g en-spawnInner">
              {TELEPORT_RING_INNER.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
          </>
        )}
      </svg>
    </div>
  );
};

export default Engineer;
export { ACCENTS, ARMOR_TEMPLATES, GUN_TEMPLATES };
