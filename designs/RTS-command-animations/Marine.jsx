/* Marine.jsx — in-browser mirror of src/lib/commandSprites/Marine.tsx
 *
 * Veteran scout marine. Self-contained React component.
 *
 * Props now include:
 *   - armorTemplate: pick an armor base color from a fixed set
 *   - gunTemplate:   pick a gun base color from a fixed set
 *   - darkness:      [-0.5..+0.5] global shade shift (negative=lighter)
 *
 * The accent stays its own thing (visor + chest stripe + buckle).
 */

/* ============================================================ Color helpers */

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function rgbToHex([r,g,b]) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2,"0");
  return "#" + c(r)+c(g)+c(b);
}
function mix(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }

// Shift a color toward black (t>0) or white (t<0). Used by the darkness slider.
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

/* ============================================================ Armor templates
 *
 * Each template's `base` is the V2 mid-armor tone. The 5-tone ramp
 * (V0 darkest → V4 brightest) is derived by mixing toward black or a
 * slightly off-white, so each template stays in its own hue family.
 */
const ARMOR_TEMPLATES = {
  steel:    { name: "Steel Gray",   base: "#262b33", swatch: "#3a414c" },
  graphite: { name: "Graphite",     base: "#222226", swatch: "#3d3e44" },
  olive:    { name: "Olive Drab",   base: "#3a3a23", swatch: "#5c5c3a" },
  tan:      { name: "Desert Tan",   base: "#594a32", swatch: "#7d6a4a" },
  navy:     { name: "Navy",         base: "#1d2a4c", swatch: "#324369" },
  forest:   { name: "Forest Green", base: "#1f3a23", swatch: "#365a3c" },
  maroon:   { name: "Maroon",       base: "#3a1f25", swatch: "#5a3034" },
};

const ARMOR_HIGHLIGHT = [225, 228, 232];   // off-white the armor highlights toward
const ARMOR_SHADOW    = [4, 6, 10];        // near-black the armor shadows toward

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

/* ============================================================ Gun templates
 *
 * The gun uses 3 tones: g (dark), G (mid), M (highlight). m (muzzle
 * interior) is fixed near-black.
 */
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

/* ============================================================ Non-tunable fixed palette */

const FIXED_REST = {
  X: "#06080b", b: "#1a1d22", P: "#0b0d10", u: "#15181d", k: "#0a0c10", r: "#2b2f37",
  h: "#0a0c10",
  W: "#dee2e6",
  R: "#ef2c3a",   // error red — for the flashing error visor
  F: "#ffd24a",
  f: "#ff6a1c",
  e: "#a01818",
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

const VARIANT_B = [
  R(), R(), R(), R(), R(),                                            // 00-04
  R([21, "445544"]),                                                  // 05 helmet apex
  R([20, "44555544"]),                                                // 06
  R([19, "4555555443"]),                                              // 07
  R([19, "4555555443"]),                                              // 08
  R([19, "4555555443"]),                                              // 09
  R([19, "3vvv33vvv3"]),                                              // 10 twin-slit visor
  R([19, "3VVV33VVV3"]),                                              // 11
  R([20, "33333333"]),                                                // 12 chin
  R([19, "u333333u4"]),                                               // 13 chin + scout antenna sprout
  R([21, "33uu33"], [29, "g"]),                                       // 14 neck + antenna
  R([17, "33344uu44333"], [29, "g"]),                                 // 15
  R([16, "4443"], [20, "34554433"], [29, "344"]),                     // 16 pauldron
  R([16, "4443"], [20, "33444333"], [29, "443"]),                     // 17
  R([17, "443"], [20, "42455243"], [28, "3443"]),                     // 18 X-strap row 1
  R([17, "443"], [20, "44255243"], [28, "3443"]),                     // 19 X-strap row 2
  R([16, "32"], [17, "443"], [20, "42424233"], [28, "GM3"], [31, "23"]),  // 20 carbine + arms
  R([16, "33"], [18, "43"], [20, "44252443"], [28, "GMg"], [31, "33"]),   // 21
  R([16, "33"], [18, "43"], [20, "44544243"], [28, "Ggg"], [31, "hh"]),   // 22 (right hand = dark glove)
  R([16, "h3"], [18, "33"], [20, "44544443"], [28, "Ggg"]),                // 23 left hand at col 16 = glove
  R([18, "33"], [20, "42524243"], [28, "Gmg"]),                       // 24
  R([19, "k"], [20, "kkkVVkkk"], [28, "Xg"]),                         // 25 belt + buckle
  R([19, "33"], [20, "33444433"], [29, "3"]),                         // 26
  R([19, "3433"], [26, "3433"]),                                      // 27
  R([19, "3433"], [26, "3433"]),                                      // 28
  R([19, "3343"], [26, "3343"]),                                      // 29
  R([19, "3343"], [26, "3343"]),                                      // 30
  R([19, "2343"], [26, "3432"]),                                      // 31 knee
  R([19, "3343"], [26, "3343"]),                                      // 32
  R([19, "3343"], [26, "3343"]),                                      // 33
  R([19, "3343"], [26, "3343"]),                                      // 34
  R([19, "2233"], [26, "3322"]),                                      // 35 ankle
  R([18, "bbbbb"], [25, "bbbbb"]),                                    // 36
  R([18, "bPPPb"], [25, "bPPPb"]),                                    // 37
  R([18, "PPPPP"], [25, "PPPPP"]),                                    // 38
  R(), R(), R(), R(), R(), R(), R(), R(), R(),                        // 39-47
];

function classifyPixel(c, x, y) {
  if (c === "z" || c === "y" || c === "w") return "shadow";
  if (c === "g" || c === "G" || c === "M" || c === "m") return "weapon";
  if ((c === "V" || c === "v") && y >= 10 && y <= 11) return "visor";
  if (x >= 28 && x <= 29 && y >= 9 && y <= 12) return "antenna";
  if ((x === 15 || x === 16) && y >= 20 && y <= 26) return "leftArm";
  if (x >= 31 && x <= 32 && y >= 20 && y <= 23) return "rightArm";
  if (y >= 36 && y <= 38) return "boots";
  if (y < 13) return "head";
  if (y < 27) return "body";
  return "legs";
}

function newGrid() { return Array.from({length: H}, () => Array(W).fill(".")); }

function buildGrid() {
  const g = newGrid();
  for (let y = 0; y < VARIANT_B.length; y++) {
    const row = VARIANT_B[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch !== "." && ch !== " ") g[y][x] = ch;
    }
  }
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
  const cx = 23, cy = 41, rx = 10, ry = 2;
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
  const groups = { shadow:[], weapon:[], antenna:[], leftArm:[], rightArm:[],
                   visor:[], head:[], body:[], legs:[], boots:[] };
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

/* ============================================================ Side-view stencil
 *
 * Marine in profile, facing right, jetpack on his back (left of
 * silhouette in screen-space). Rendered ONLY during the spawning
 * transient: he flies in from off-screen left in this pose, then
 * fades to the forward-facing base sprite at landing ("turns to
 * face the camera").
 */
const SIDE_VIEW = [
  R(), R(), R(), R(), R(),                                            // 00-04
  R([23, "554"]),                                                     // 05 helmet apex (back-bright crown)
  R([22, "55543"]),                                                   // 06
  R([21, "5555443"]),                                                 // 07 widest helmet top
  R([21, "55544433"]),                                                // 08 helmet body, back-bright
  R([21, "55443vVV"]),                                                // 09 visor on FRONT (cols 26-28)
  R([21, "5443vVV3"]),                                                // 10 visor row 2 (offset)
  R([22, "443333"]),                                                  // 11 chin
  R([23, "3333"]),                                                    // 12 jaw
  R([24, "uu"]),                                                      // 13 neck
  R([17, "111"], [21, "4554443"], [29, "3"]),                       // 14 jetpack + shoulder top + visible arm start
  R([17, "112"], [21, "344GGGgg"], [29, "33"]),                       // 15 rifle butt + upper arm
  R([17, "112"], [21, "33MGMGg3"], [29, "33"]),                       // 16 receiver + upper arm
  R([17, "1V2"], [21, "3GMGg333"], [29, "33"]),                       // 17 receiver + upper arm
  R([16, "g"], [17, "112"], [21, "GGgg3333"], [29, "22"]),             // 18 thruster + barrel + forearm darker
  R([21, "Ggg33333"], [29, "22"]),                                    // 19 barrel + forearm
  R([21, "gg333V33"], [29, "2h"]),                                    // 20 muzzle + wrist transitions
  R([21, "43333333"], [29, "hh"]),                                    // 21 chest + hand (glove)
  R([21, "43333322"], [29, "hh"]),                                    // 22 + hand
  R([21, "43333322"]),                                                // 23
  R([21, "33333322"]),                                                // 24
  R([21, "kkkVkkk3"]),                                                // 25 belt + buckle (V at col 24)
  R([21, "33333322"]),                                                // 26
  R([21, "33333322"]),                                                // 27 hips
  R([22, "333322"]),                                                  // 28 leg start narrower
  R([22, "333322"]),                                                  // 29
  R([22, "333322"]),                                                  // 30
  R([22, "333322"]),                                                  // 31
  R([22, "223322"]),                                                  // 32 knee shadow
  R([22, "333322"]),                                                  // 33
  R([22, "333322"]),                                                  // 34
  R([22, "222222"]),                                                  // 35 ankle
  R([21, "bbbbbbb"]),                                                 // 36 boot top
  R([21, "bPPPPPb"]),                                                 // 37
  R([21, "PPPPPPP"]),                                                 // 38 sole
  R(), R(), R(), R(), R(), R(), R(), R(), R(),                        // 39-47
];

function buildSideViewGrid() {
  const g = newGrid();
  for (let y = 0; y < SIDE_VIEW.length; y++) {
    const row = SIDE_VIEW[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch !== "." && ch !== " ") g[y][x] = ch;
    }
  }
  // Outline pass (no ground shadow — he's in the air)
  const skip = (c) => c === "." || c === "X";
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
  return g;
}

function gridToFlatRects(grid) {
  const rects = [];
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = grid[y][x];
      if (c === ".") { x++; continue; }
      let xEnd = x + 1;
      while (xEnd < W && grid[y][xEnd] === c) xEnd++;
      rects.push({ x, y, w: xEnd - x, h: 1, code: c });
      x = xEnd;
    }
  }
  return rects;
}

const SIDE_VIEW_RECTS = gridToFlatRects(buildSideViewGrid());

/* ============================================================ Color resolver
 *
 * Now takes a full ramps bag so armor + gun tones come from the
 * caller's chosen templates + darkness shift.
 */
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

// --- Streaming: speech bubble + dots animation (talking) replaces radio rings
const VOICE_BUBBLE = [
  // Bubble fill (W = bright off-white)
  { x: 32, y: 1, w: 7, h: 1, c: "W" },
  { x: 32, y: 2, w: 7, h: 1, c: "W" },
  { x: 32, y: 3, w: 7, h: 1, c: "W" },
  // Tail pointing down-left toward the helmet
  { x: 32, y: 4, w: 1, h: 1, c: "W" },
  { x: 31, y: 5, w: 1, h: 1, c: "W" },
];
const VOICE_DOTS = [
  { id: 1, x: 33, y: 2 },
  { id: 2, x: 35, y: 2 },
  { id: 3, x: 37, y: 2 },
];

// --- Awaiting permission: "?" pixel glyph above the helmet
const GLYPH_QUESTION = [
  { x: 23, y: 0 }, { x: 24, y: 0 },
  { x: 22, y: 1 }, { x: 25, y: 1 },
  { x: 24, y: 2 },
  { x: 24, y: 4 },
];

// --- Tool running: full shooting pose
const SHOOTING_RIFLE = [
  { x: 29, y: 19, w: 3, h: 1, c: "M" },
  { x: 29, y: 20, w: 3, h: 1, c: "G" },
  { x: 29, y: 21, w: 3, h: 1, c: "g" },
  { x: 26, y: 19, w: 3, h: 1, c: "g" },
  { x: 27, y: 18, w: 2, h: 1, c: "G" },
  { x: 25, y: 20, w: 5, h: 1, c: "M" },
  { x: 25, y: 21, w: 5, h: 1, c: "G" },
  { x: 25, y: 22, w: 5, h: 1, c: "g" },
  { x: 27, y: 23, w: 2, h: 1, c: "G" },
  { x: 27, y: 24, w: 2, h: 1, c: "M" },
  { x: 27, y: 25, w: 2, h: 1, c: "G" },
  { x: 27, y: 26, w: 2, h: 1, c: "G" },
  { x: 27, y: 27, w: 2, h: 1, c: "G" },
  { x: 27, y: 28, w: 2, h: 1, c: "G" },
  { x: 27, y: 29, w: 2, h: 1, c: "G" },
  { x: 27, y: 30, w: 2, h: 1, c: "G" },
  { x: 27, y: 31, w: 2, h: 1, c: "G" },
  { x: 27, y: 32, w: 2, h: 1, c: "G" },
  { x: 26, y: 33, w: 4, h: 1, c: "G" },
  { x: 26, y: 34, w: 1, h: 1, c: "g" },
  { x: 29, y: 34, w: 1, h: 1, c: "g" },
  { x: 27, y: 34, w: 2, h: 1, c: "m" },
];

const SHOOTING_ARMS = [
  { x: 17, y: 21, w: 2, h: 1, c: "3" },
  { x: 18, y: 22, w: 2, h: 1, c: "3" },
  { x: 20, y: 23, w: 2, h: 1, c: "3" },
  { x: 22, y: 24, w: 2, h: 1, c: "2" },
  { x: 24, y: 25, w: 3, h: 1, c: "h" },   // LEFT hand on barrel — dark glove
  { x: 30, y: 22, w: 2, h: 1, c: "3" },
  { x: 29, y: 23, w: 1, h: 1, c: "h" },   // RIGHT hand at trigger — dark glove
  { x: 30, y: 23, w: 1, h: 1, c: "h" },
];

// --- Tool running: small dark-green scope lens (translucent) with black border
const SCOPE_LENS_COLOR = "rgba(46, 200, 96, 0.75)";
const SCOPE_BORDER_COLOR = "#06080b";
const SCOPE_BORDER = [
  // top edge
  { x: 27, y: 18, w: 2, h: 1 },
  // bottom edge
  { x: 27, y: 21, w: 2, h: 1 },
  // left edge
  { x: 26, y: 19, w: 1, h: 2 },
  // right edge
  { x: 29, y: 19, w: 1, h: 2 },
];
const SCOPE_LENS = [
  { x: 27, y: 19, w: 2, h: 1 },
  { x: 27, y: 20, w: 2, h: 1 },
];

const LASER_BEAM = [
  { x: 26, y: 35, w: 4, h: 1, c: "v" },
  { x: 27, y: 36, w: 2, h: 1, c: "v" },
  { x: 27, y: 37, w: 2, h: 1, c: "v" },
  { x: 27, y: 38, w: 2, h: 1, c: "V" },
  { x: 27, y: 39, w: 2, h: 1, c: "V" },
  { x: 27, y: 40, w: 2, h: 1, c: "V" },
  { x: 27, y: 41, w: 2, h: 1, c: "V" },
  { x: 27, y: 42, w: 2, h: 1, c: "V" },
  { x: 27, y: 43, w: 2, h: 1, c: "V" },
  { x: 27, y: 44, w: 2, h: 1, c: "V" },
  { x: 27, y: 45, w: 2, h: 1, c: "V" },
  { x: 27, y: 46, w: 2, h: 1, c: "V" },
  { x: 27, y: 47, w: 2, h: 1, c: "V" },
  { x: 25, y: 35, w: 1, h: 1, c: "V" },
  { x: 30, y: 35, w: 1, h: 1, c: "V" },
  { x: 26, y: 36, w: 1, h: 1, c: "V" },
  { x: 29, y: 36, w: 1, h: 1, c: "V" },
];

/* Compute a 1-pixel X outline around a set of pixel rects — used to
   give the shooting-pose rifle an explicit black border so it reads
   as a distinct object against the marine's body. */
function computeOutline(pixels) {
  const occupied = new Set();
  for (const p of pixels) {
    for (let dx = 0; dx < p.w; dx++) {
      for (let dy = 0; dy < p.h; dy++) {
        occupied.add(`${p.x + dx},${p.y + dy}`);
      }
    }
  }
  const outline = new Map();
  for (const k of occupied) {
    const [x, y] = k.split(',').map(Number);
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      const nk = `${nx},${ny}`;
      if (!occupied.has(nk)) outline.set(nk, { x: nx, y: ny });
    }
  }
  return [...outline.values()];
}
const SHOOTING_RIFLE_OUTLINE = computeOutline(SHOOTING_RIFLE);

// --- Spawning: jetpack + red flame trail
const JETPACK = [
  { x: 18, y: 13, w: 4, h: 1, c: "2" },
  { x: 18, y: 14, w: 4, h: 1, c: "1" },
  { x: 18, y: 15, w: 4, h: 1, c: "1" },
  { x: 18, y: 16, w: 4, h: 1, c: "1" },
  { x: 18, y: 17, w: 4, h: 1, c: "1" },
  { x: 18, y: 18, w: 4, h: 1, c: "2" },
  { x: 18, y: 14, w: 1, h: 1, c: "2" },
  { x: 18, y: 15, w: 1, h: 1, c: "3" },
  { x: 18, y: 16, w: 1, h: 1, c: "3" },
  { x: 20, y: 15, w: 2, h: 1, c: "v" },
  { x: 17, y: 17, w: 1, h: 1, c: "g" },
  { x: 17, y: 18, w: 1, h: 1, c: "g" },
];

const FLAME = [
  // Vertical jet flame: matches jetpack width at thruster (4 px, cols 18-21).
  { x: 18, y: 20, w: 4, h: 1, c: "F" },
  { x: 18, y: 21, w: 4, h: 1, c: "F" },
  { x: 18, y: 22, w: 4, h: 1, c: "F" },
  { x: 19, y: 23, w: 3, h: 1, c: "F" },
  { x: 19, y: 24, w: 3, h: 1, c: "f" },
  { x: 19, y: 25, w: 3, h: 1, c: "f" },
  { x: 19, y: 26, w: 2, h: 1, c: "f" },
  { x: 19, y: 27, w: 2, h: 1, c: "f" },
  { x: 19, y: 28, w: 2, h: 1, c: "e" },
  { x: 19, y: 29, w: 2, h: 1, c: "e" },
  { x: 19, y: 30, w: 1, h: 1, c: "e" },
  { x: 20, y: 31, w: 1, h: 1, c: "e" },
  { x: 19, y: 32, w: 1, h: 1, c: "e" },
  { x: 20, y: 33, w: 1, h: 1, c: "e" },
  { x: 19, y: 34, w: 1, h: 1, c: "e" },
];

// --- Thinking: just the gloved hand scratching the chin (no arm rendered)
const THINKING_HAND = [
  { x: 23, y: 13, w: 2, h: 1, c: "h" },
  { x: 24, y: 14, w: 1, h: 1, c: "h" },
];

// --- Thinking: raised left eyebrow — only visible while the hand is scratching
const THINKING_BROW = [
  { x: 20, y: 9, w: 3, h: 1, c: "v" },
];

// --- Tool running: aiming visor (left eye closed, right eye open down the scope — no squint)
const TOOL_RUNNING_VISOR = [
  { x: 19, y: 10, w: 3, h: 1, c: "k" },
  { x: 19, y: 11, w: 3, h: 1, c: "k" },
  { x: 25, y: 10, w: 3, h: 1, c: "v" },
  { x: 25, y: 11, w: 3, h: 1, c: "V" },
];

// --- Error: flashing-red visor (overlay) + dark mask (overdraws accent between flashes)
const ERROR_VISOR_RED = [
  { x: 20, y: 10, w: 3, h: 1, c: "R" },
  { x: 20, y: 11, w: 3, h: 1, c: "R" },
  { x: 26, y: 10, w: 3, h: 1, c: "R" },
  { x: 26, y: 11, w: 3, h: 1, c: "R" },
];
const ERROR_VISOR_MASK = [
  { x: 20, y: 10, w: 3, h: 1, c: "2" },
  { x: 20, y: 11, w: 3, h: 1, c: "2" },
  { x: 26, y: 10, w: 3, h: 1, c: "2" },
  { x: 26, y: 11, w: 3, h: 1, c: "2" },
];

// --- Streaming: gesticulating arms (both hands move while talking)
const STREAM_LEFT_ARM = [
  // Left arm raised, hand near shoulder height
  { x: 15, y: 21, w: 2, h: 1, c: "3" },
  { x: 14, y: 20, w: 2, h: 1, c: "3" },
  { x: 13, y: 19, w: 2, h: 1, c: "3" },
  { x: 12, y: 18, w: 1, h: 1, c: "h" },
  { x: 13, y: 18, w: 1, h: 1, c: "h" },
];
const STREAM_RIGHT_ARM = [
  // Right arm raised, mirroring left
  { x: 31, y: 21, w: 2, h: 1, c: "3" },
  { x: 33, y: 20, w: 2, h: 1, c: "3" },
  { x: 35, y: 19, w: 1, h: 1, c: "3" },
  { x: 34, y: 18, w: 1, h: 1, c: "h" },
  { x: 35, y: 18, w: 1, h: 1, c: "h" },
];

/* Big red button — 3D pedestal with red dome on top. Same shading
 * vocabulary on the Marine for studio consistency. */
const DEPLOY_BUTTON = [
  // Dome — red hemisphere with highlight + side shadow
  { x: 36, y: 27, w: 1, h: 1, c: "R" },
  { x: 37, y: 27, w: 1, h: 1, c: "W" }, // specular highlight
  { x: 38, y: 27, w: 1, h: 1, c: "R" },
  { x: 39, y: 27, w: 1, h: 1, c: "e" }, // dome shadow side
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

/* ============================================================ CSS */

const SCOPED_CSS = `
.mr-marine { display:inline-block; position:relative; line-height:0; image-rendering:pixelated; image-rendering:crisp-edges; }
.mr-marine svg { display:block; image-rendering:pixelated; }
.mr-g { transform-box: fill-box; transform-origin: center; }

@keyframes mr-idle-bob {
  0%, 24.99% { transform: translateX(0); }
  25%, 49.99% { transform: translateX(-1px); }
  50%, 74.99% { transform: translateX(0); }
  75%, 100% { transform: translateX(1px); }
}
.mr-state-idle .mr-body, .mr-state-idle .mr-head,
.mr-state-idle .mr-weapon, .mr-state-idle .mr-leftArm,
.mr-state-idle .mr-rightArm, .mr-state-idle .mr-antenna,
.mr-state-idle .mr-visor {
  animation: mr-idle-bob 900ms linear infinite;
}

/* Thinking: gloved hand visible during scratch beats + chin-scratch jiggle */
@keyframes mr-think-pose {
  0%, 9.99% { opacity: 0; }
  10%, 72%  { opacity: 1; }
  72.01%, 100% { opacity: 0; }
}
@keyframes mr-think-jiggle {
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
@keyframes mr-think-head {
  0%, 19.99% { transform: translateX(0); }
  20%, 79.99% { transform: translateX(-1px); }
  80%, 100% { transform: translateX(0); }
}
@keyframes mr-think-antenna {
  0%, 49.99% { opacity: 1; }
  50%, 100% { opacity: 0.45; }
}
/* Thinking pose now shows only head tilt + hand scratching chin + raised eyebrow during scratch. */
.mr-state-thinking .mr-thinkingHand {
  animation: mr-think-pose 1200ms linear infinite, mr-think-jiggle 1200ms linear infinite;
}
.mr-state-thinking .mr-head, .mr-state-thinking .mr-visor { animation: mr-think-head 1200ms linear infinite; }
/* Eyebrow visible only while the hand is scratching, and rides the head shift so it stays aligned over the visor. */
.mr-state-thinking .mr-thinkBrow { animation: mr-think-pose 1200ms linear infinite, mr-think-head 1200ms linear infinite; }
.mr-state-thinking .mr-antenna { animation: mr-think-antenna 600ms linear infinite; }

/* Tool running: hide the regular twin-slit visor; show the squint+closed overlay. */
.mr-state-tool_running .mr-visor { visibility: hidden; }

@keyframes mr-tool-recoil {
  0%, 14.99% { transform: translateY(0); }
  15%, 22.99% { transform: translateY(-1px); }
  23%, 100% { transform: translateY(0); }
}
@keyframes mr-tool-laser {
  0%, 11.99% { opacity: 0; }
  12%, 36.99% { opacity: 1; }
  37%, 100% { opacity: 0; }
}
.mr-state-tool_running .mr-weapon,
.mr-state-tool_running .mr-rightArm,
.mr-state-tool_running .mr-leftArm { visibility: hidden; }
.mr-state-tool_running .mr-body,
.mr-state-tool_running .mr-head,
.mr-state-tool_running .mr-visor,
.mr-state-tool_running .mr-antenna,
.mr-state-tool_running .mr-shootingPose {
  animation: mr-tool-recoil 600ms linear infinite;
}
.mr-state-tool_running .mr-laser { animation: mr-tool-laser 600ms linear infinite; }

/* ===== streaming: gesticulating arms + speech bubble ===== */
@keyframes mr-stream-antenna {
  0%, 49.99% { opacity: 1; }
  50%, 100% { opacity: 0.4; }
}
@keyframes mr-stream-leftArm {
  0%, 24.99% { transform: translateY(0); }
  25%, 49.99% { transform: translateY(-2px); }
  50%, 74.99% { transform: translateY(0); }
  75%, 100% { transform: translateY(-1px); }
}
@keyframes mr-stream-rightArm {
  0%, 24.99% { transform: translateY(-1px); }
  25%, 49.99% { transform: translateY(0); }
  50%, 74.99% { transform: translateY(-2px); }
  75%, 100% { transform: translateY(0); }
}
@keyframes mr-stream-head {
  0%, 49.99% { transform: translateY(0); }
  50%, 100% { transform: translateY(-1px); }
}
@keyframes mr-talk-bubble {
  0%, 5%    { opacity: 0; }
  10%, 90%  { opacity: 1; }
  95%, 100% { opacity: 0; }
}
@keyframes mr-talk-dot-1 {
  0%, 14.99% { opacity: 0; }
  15%, 100%  { opacity: 1; }
}
@keyframes mr-talk-dot-2 {
  0%, 34.99% { opacity: 0; }
  35%, 100%  { opacity: 1; }
}
@keyframes mr-talk-dot-3 {
  0%, 54.99% { opacity: 0; }
  55%, 100%  { opacity: 1; }
}
/* Idle arms stay visible during streaming — no gesticulation. */
.mr-state-streaming .mr-head, .mr-state-streaming .mr-visor { animation: mr-stream-head 1000ms linear infinite; }
.mr-state-streaming .mr-antenna { animation: mr-stream-antenna 400ms linear infinite; }
.mr-state-streaming .mr-bubble  { animation: mr-talk-bubble 1500ms linear infinite; transform-origin: 30px 3px; }
.mr-state-streaming .mr-talkDot { animation-duration: 1500ms; animation-timing-function: linear; animation-iteration-count: infinite; }
.mr-state-streaming .mr-talkDot-1 { animation-name: mr-talk-dot-1; }
.mr-state-streaming .mr-talkDot-2 { animation-name: mr-talk-dot-2; }
.mr-state-streaming .mr-talkDot-3 { animation-name: mr-talk-dot-3; }

/* ===== awaiting_permission: jumping + waving overhead + ? glyph ===== */
@keyframes mr-await-jump {
  0%, 9.99%   { transform: translateY(0); }
  10%, 24.99% { transform: translateY(-5px); }
  25%, 34.99% { transform: translateY(0); }
  35%, 49.99% { transform: translateY(-5px); }
  50%, 100%   { transform: translateY(0); }
}
@keyframes mr-await-wave {
  0%, 9.99%   { transform: translate(0, 0) rotate(0deg); }
  15%         { transform: translate(0, -10px) rotate(-25deg); }
  25%         { transform: translate(2px, -12px) rotate(25deg); }
  35%         { transform: translate(-2px, -12px) rotate(-25deg); }
  45%         { transform: translate(2px, -10px) rotate(25deg); }
  55%, 100%   { transform: translate(0, 0) rotate(0deg); }
}
@keyframes mr-await-glyph {
  0%, 14.99% { opacity: 0; }
  15%, 84.99% { opacity: 1; }
  85%, 100% { opacity: 0; }
}
.mr-state-awaiting_permission .mr-body, .mr-state-awaiting_permission .mr-head,
.mr-state-awaiting_permission .mr-weapon, .mr-state-awaiting_permission .mr-leftArm,
.mr-state-awaiting_permission .mr-antenna, .mr-state-awaiting_permission .mr-visor,
.mr-state-awaiting_permission .mr-legs, .mr-state-awaiting_permission .mr-boots {
  animation: mr-await-jump 1400ms linear infinite;
}
.mr-state-awaiting_permission .mr-rightArm {
  animation: mr-await-wave 1400ms linear infinite;
  transform-origin: 31px 22px;
}
.mr-state-awaiting_permission .mr-glyph { animation: mr-await-glyph 1400ms linear infinite; }

@keyframes mr-done-body {
  0%, 19.99% { transform: translateY(-1px); }
  20%, 100% { transform: translateY(0); }
}
.mr-state-done .mr-body, .mr-state-done .mr-head, .mr-state-done .mr-weapon,
.mr-state-done .mr-leftArm, .mr-state-done .mr-rightArm, .mr-state-done .mr-antenna,
.mr-state-done .mr-visor {
  animation: mr-done-body 1400ms linear forwards;
}

/* ===== error: tilt + flashing red visor ===== */
@keyframes mr-error-tilt {
  0%, 49.99% { transform: rotate(-3deg) translateX(-1px); }
  50%, 100% { transform: rotate(-3deg) translateX(0); }
}
@keyframes mr-error-flash {
  0%, 39.99% { opacity: 0; }
  40%, 59.99% { opacity: 1; }
  60%, 100% { opacity: 0; }
}
@keyframes mr-error-mask {
  0%, 39.99% { opacity: 1; }
  40%, 59.99% { opacity: 0; }
  60%, 100% { opacity: 1; }
}
.mr-state-error .mr-body, .mr-state-error .mr-head, .mr-state-error .mr-weapon,
.mr-state-error .mr-leftArm, .mr-state-error .mr-rightArm, .mr-state-error .mr-antenna,
.mr-state-error .mr-visor {
  animation: mr-error-tilt 1800ms linear infinite;
  transform-origin: 23px 38px;
}
.mr-state-error .mr-errorMask  { animation: mr-error-tilt 1800ms linear infinite, mr-error-mask 1100ms linear infinite; transform-origin: 23px 38px; }
.mr-state-error .mr-errorVisor { animation: mr-error-tilt 1800ms linear infinite, mr-error-flash 1100ms linear infinite; transform-origin: 23px 38px; }

/* Curved landing path: marine arcs in from upper-left, descending. */
@keyframes mr-spawn-fly {
  0%   { transform: translate(-36px, -22px); opacity: 1; }
  20%  { transform: translate(-28px, -14px); opacity: 1; }
  40%  { transform: translate(-18px, -7px);  opacity: 1; }
  55%  { transform: translate(-8px,  -2px);  opacity: 1; }
  62%  { transform: translate(0,     0);     opacity: 1; }
  70%, 100% { transform: translate(0, 0); opacity: 0; }
}
@keyframes mr-spawn-fade-in {
  0%, 60% { opacity: 0; }
  72%, 100% { opacity: 1; }
}
@keyframes mr-spawn-flame-life {
  0%, 55% { opacity: 1; }
  62%     { opacity: 0.5; }
  68%, 100% { opacity: 0; }
}
/* Side-view group: marine + jetpack + flame all fly in together */
.mr-tr-spawning .mr-flyingPose {
  animation: mr-spawn-fly 1300ms linear forwards;
}
.mr-tr-spawning .mr-flame {
  animation: mr-spawn-flame-life 1300ms linear forwards;
}
/* Forward-view (base sprite) hides during flight, fades in at touchdown */
.mr-tr-spawning .mr-body, .mr-tr-spawning .mr-head, .mr-tr-spawning .mr-weapon,
.mr-tr-spawning .mr-leftArm, .mr-tr-spawning .mr-rightArm, .mr-tr-spawning .mr-antenna,
.mr-tr-spawning .mr-legs, .mr-tr-spawning .mr-boots, .mr-tr-spawning .mr-visor,
.mr-tr-spawning .mr-shadow {
  animation: mr-spawn-fade-in 1300ms linear forwards;
}

@keyframes mr-deploy-arm {
  0%, 14.99% { transform: translate(0,0); }
  25%, 60%   { transform: translate(0, 7px); }
  75%, 100%  { transform: translate(0, 0); }
}
@keyframes mr-deploy-button-press {
  0%, 19%    { transform: translate(0, 0); }
  25%, 60%   { transform: translate(0, 1px); }
  75%, 100%  { transform: translate(0, 0); }
}
@keyframes mr-deploy-flash {
  0%, 24%    { opacity: 0; }
  28%, 55%   { opacity: 1; }
  65%, 100%  { opacity: 0; }
}
.mr-tr-deploying .mr-rightArm    { animation: mr-deploy-arm 800ms linear forwards; }
.mr-tr-deploying .mr-deployButton { animation: mr-deploy-button-press 800ms linear forwards; }
.mr-tr-deploying .mr-deployFlash  { animation: mr-deploy-flash 800ms linear forwards; }

@media (prefers-reduced-motion: reduce) {
  .mr-marine *, .mr-marine *::before, .mr-marine *::after {
    animation: none !important;
    transition: none !important;
  }
  .mr-state-thinking .mr-thinkingHand { opacity: 1; }
  .mr-state-thinking .mr-head, .mr-state-thinking .mr-visor, .mr-state-thinking .mr-thinkBrow { transform: translateX(-1px); }
  .mr-state-thinking .mr-antenna { opacity: 0.7; }
  .mr-state-tool_running .mr-weapon,
  .mr-state-tool_running .mr-rightArm,
  .mr-state-tool_running .mr-leftArm { visibility: hidden; }
  .mr-state-tool_running .mr-laser { opacity: 1; }
  .mr-state-streaming .mr-visor { opacity: 1; }
  .mr-state-streaming .mr-bubble { opacity: 1; }
  .mr-state-streaming .mr-talkDot { opacity: 1; }
  .mr-state-awaiting_permission .mr-glyph { opacity: 1; }
  .mr-state-awaiting_permission .mr-weapon { transform: translateY(1px); }
  .mr-state-done .mr-body, .mr-state-done .mr-head, .mr-state-done .mr-weapon,
  .mr-state-done .mr-leftArm, .mr-state-done .mr-rightArm, .mr-state-done .mr-antenna,
  .mr-state-done .mr-visor {
    transform: translateY(-1px);
  }
  .mr-state-error .mr-body, .mr-state-error .mr-head, .mr-state-error .mr-weapon,
  .mr-state-error .mr-leftArm, .mr-state-error .mr-rightArm, .mr-state-error .mr-antenna,
  .mr-state-error .mr-visor {
    transform: rotate(-3deg); transform-origin: 23px 38px;
  }
}
`;

/* ============================================================ Component */

function facingToDeg(f) {
  return ({ S:0, SW:45, W:90, NW:135, N:180, NE:225, E:270, SE:315 })[f] || 0;
}

function Marine({
  state,
  transient,
  accent,
  size = 64,
  facing = "S",
  armorTemplate = "steel",
  gunTemplate = "matte",
  darkness = 0,
}) {
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
  const showShooting = state === "tool_running";
  const rotateDeg = facingToDeg(facing);

  return (
    <div
      className={`mr-marine mr-state-${state}${transient ? ` mr-tr-${transient}` : ""}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Marine, ${state}`}
    >
      <style>{SCOPED_CSS}</style>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        shapeRendering="crispEdges"
        style={rotateDeg ? { transform: `rotate(${rotateDeg}deg)` } : undefined}
      >
        <g className="mr-g mr-shadow">{renderRects(GROUPED.shadow, ramps, errorMode)}</g>

        {transient === "spawning" && (
          <g className="mr-g mr-flyingPose">
            <g className="mr-g mr-flame">
              {FLAME.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            <g className="mr-g mr-sideView">
              {SIDE_VIEW_RECTS.map((r, i) => (
                <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h}
                  fill={resolveColor(r.code, ramps, errorMode)} />
              ))}
            </g>
            <g className="mr-g mr-jetpack">
              {JETPACK.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
          </g>
        )}

        <g className="mr-g mr-boots">{renderRects(GROUPED.boots, ramps, errorMode)}</g>
        <g className="mr-g mr-legs">{renderRects(GROUPED.legs, ramps, errorMode)}</g>
        <g className="mr-g mr-body">{renderRects(GROUPED.body, ramps, errorMode)}</g>
        <g className="mr-g mr-leftArm">{renderRects(GROUPED.leftArm, ramps, errorMode)}</g>
        <g className="mr-g mr-weapon">{renderRects(GROUPED.weapon, ramps, errorMode)}</g>
        <g className="mr-g mr-rightArm">{renderRects(GROUPED.rightArm, ramps, errorMode)}</g>

        <g className="mr-g mr-head">{renderRects(GROUPED.head, ramps, errorMode)}</g>
        <g className="mr-g mr-visor">{renderRects(GROUPED.visor, ramps, errorMode)}</g>
        <g className="mr-g mr-antenna">{renderRects(GROUPED.antenna, ramps, errorMode)}</g>

        {showShooting && (
          <>
            <g className="mr-g mr-shootingPose">
              {SHOOTING_RIFLE_OUTLINE.map((p, i) => (
                <rect key={`o${i}`} x={p.x} y={p.y} width={1} height={1} fill={FIXED_REST.X} />
              ))}
              {SHOOTING_ARMS.map((p, i) => (
                <rect key={`a${i}`} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
              {SHOOTING_RIFLE.map((p, i) => (
                <rect key={`r${i}`} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
              {SCOPE_BORDER.map((p, i) => (
                <rect key={`sb${i}`} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={SCOPE_BORDER_COLOR} />
              ))}
              {SCOPE_LENS.map((p, i) => (
                <rect key={`s${i}`} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={SCOPE_LENS_COLOR} />
              ))}
            </g>
            <g className="mr-g mr-laser">
              {LASER_BEAM.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
          </>
        )}

        {state === "thinking" && (
          <>
            <g className="mr-g mr-thinkingHand">
              {THINKING_HAND.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            <g className="mr-g mr-thinkBrow">
              {THINKING_BROW.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
          </>
        )}

        {state === "tool_running" && (
          <g className="mr-g mr-toolVisor">
            {TOOL_RUNNING_VISOR.map((p, i) => (
              <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                fill={resolveColor(p.c, ramps, errorMode)} />
            ))}
          </g>
        )}

        {state === "error" && (
          <>
            <g className="mr-g mr-errorMask">
              {ERROR_VISOR_MASK.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            <g className="mr-g mr-errorVisor">
              {ERROR_VISOR_RED.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={FIXED_REST.R} />
              ))}
            </g>
          </>
        )}

        {state === "streaming" && (
          <g className="mr-g mr-bubble">
            {VOICE_BUBBLE.map((p, i) => (
              <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                fill={resolveColor(p.c, ramps, errorMode)} />
            ))}
            {VOICE_DOTS.map((d) => (
              <rect key={d.id} className={`mr-talkDot mr-talkDot-${d.id}`}
                x={d.x} y={d.y} width={1} height={1} fill={FIXED_REST.k} />
            ))}
          </g>
        )}

        {/* Question-mark glyph removed from awaiting_permission per design update. */}

        {transient === "deploying" && (
          <>
            <g className="mr-g mr-deployFlash">
              {DEPLOY_FLASH.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
            <g className="mr-g mr-deployButton">
              {DEPLOY_BUTTON.map((p, i) => (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h}
                  fill={resolveColor(p.c, ramps, errorMode)} />
              ))}
            </g>
          </>
        )}
      </svg>
    </div>
  );
}

Object.assign(window, { Marine, ACCENTS, ARMOR_TEMPLATES, GUN_TEMPLATES });
