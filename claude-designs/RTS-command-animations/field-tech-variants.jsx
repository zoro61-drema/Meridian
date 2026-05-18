/* field-tech-variants.jsx
 *
 * Three Field Tech direction variants for the Command Sprites roster (§7.3).
 *
 *   A — Medic              (rounded helmet, generic teal/white equipment cross
 *                           on chest, hand scanner extending forward, satchel
 *                           bump on the LEFT hip)
 *   B — Scientific officer (lighter armor + lab-coat skirt below the waist,
 *                           large forward scanner dish, data tablet in left
 *                           hand, slender antenna on the helmet)
 *   C — Forward observer   (binoculars held to the face — wide optic over
 *                           the visor zone — radio backpack with vertical
 *                           antenna spike, short scoped carbine on right hip)
 *
 * Same family rules as Marine.tsx / Engineer.tsx:
 *   - top-down 3/4 RTS perspective, facing screen-down (S)
 *   - 5-tone armor ramp (Steel default) — V0..V4 = codes 1..5
 *   - 1px dark outline pass around the silhouette
 *   - soft pixel ground-shadow ellipse anchored under the boots
 *   - accent (team color) rides ONLY the team-color zones — never the body
 *
 * §7.3 team-color zones: shoulder pauldron strip + scanner display. We also
 * tint the visor lightly for family consistency with the Marine + Engineer.
 *
 * §9 IP note (Red Cross): the Medic's chest mark is a generic teal/white
 * "cross of equipment", NOT a red cross. Coded with T (teal) + W (white)
 * fixed colors, independent of the accent palette.
 *
 * Char codes:
 *   1..5  armor ramp (V0..V4)
 *   V, v  accent + accent spec   (team-color zones)
 *   g G M m  gunmetal device ramp + muzzle interior
 *   b P   boot leather / sole
 *   u     under-suit / neck
 *   k     belt / hard seal
 *   r     rivet / strap detail
 *   h     dark glove
 *   T t   teal medical (T base, t spec)   — Medic only
 *   W     pure white pip (cross center, optics highlight)
 *   X     1px outline (added in finalize)
 *   z y w ground-shadow inner / mid / outer
 */

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

/* ============================================================ Palette */

const ARMOR = { V0: "#0c0e12", V1: "#181c22", V2: "#262b33", V3: "#3a414c", V4: "#566273" };
const TOOL  = { g: "#13161c", G: "#363c45", M: "#5f6770", m: "#1c2028" };
const FIXED = {
  X: "#06080b",
  b: "#1a1d22", P: "#0b0d10",
  u: "#15181d", k: "#0a0c10", r: "#2b2f37",
  h: "#0a0c10",
  // Medical: deliberately TEAL (not red) per §9 / §7.3 Red-Cross IP guardrail.
  T: "#36b8a6",   // teal base — medical equipment indicator
  t: "#6ed8c7",   // teal spec / highlight
  W: "#e8eef4",   // white pip (cross center, optic glint)
};
const SHADOW = { z: "rgba(0,0,0,0.55)", y: "rgba(0,0,0,0.32)", w: "rgba(0,0,0,0.16)" };

const ACCENTS = {
  slate:  "#64748b",
  blue:   "#3b82f6",
  violet: "#8b5cf6",
  green:  "#22c55e",
  orange: "#f97316",
  rose:   "#f43f5e",
};

function hexToRgb(h){const x=h.replace("#","");return [parseInt(x.slice(0,2),16),parseInt(x.slice(2,4),16),parseInt(x.slice(4,6),16)];}
function rgbToHex([r,g,b]){const c=n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,"0");return"#"+c(r)+c(g)+c(b);}
function mix(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
function accentRamp(hex){
  const base = hexToRgb(hex);
  return { V: rgbToHex(base), v: rgbToHex(mix(base,[240,245,255],0.45)) };
}

/* ============================================================
 *  VARIANT A — Medic
 *
 *  Marine-base frame, softer pauldrons (narrower than Marine), full-strip
 *  visor in accent, generic TEAL/WHITE equipment cross centered on the
 *  chest (rows 17–19, cols 22–24). Right hand carries a small scanner
 *  wand extending forward (down) with the accent display at its tip —
 *  cols 30–31, rows 21–28. LEFT hip carries a satchel bump (cols 14–17,
 *  rows 22–25) with its own tiny teal cross.
 *
 *  Accent zones: pauldron top stripe (rows 15–16 outer corners),
 *                visor (rows 10–11), scanner display tip (rows 27–28),
 *                belt buckle (row 25 center).
 * ============================================================ */
const VARIANT_A = [
  R(),                                                                 // 00
  R(),                                                                 // 01
  R(),                                                                 // 02
  R(),                                                                 // 03
  R(),                                                                 // 04
  R([21, "445544"]),                                                   // 05 helmet apex
  R([20, "44555544"]),                                                 // 06
  R([19, "4555555443"]),                                               // 07 helmet widest
  R([19, "4555555443"]),                                               // 08
  R([19, "4555555443"]),                                               // 09
  R([19, "3vvvvvvvv3"]),                                               // 10 visor spec (full strip — clinical)
  R([19, "3VVVVVVVV3"]),                                               // 11 visor base
  R([20, "33333333"]),                                                 // 12 chin
  R([20, "33333333"]),                                                 // 13 chin lower
  R([22, "uuuu"]),                                                     // 14 neck
  R([17, "VV3344uu4433VV"]),                                           // 15 shoulder tops + accent pauldron strip
  R([16, "V444443333344444V"]),                                        // 16 pauldrons widest (cols 16-32) — accent rim
  R([17, "443333333333344"]),                                          // 17 torso top                                                            (T cross row 1 added below)
  R([17, "443333TTT333344"]),                                          // 18 torso + cross horizontal arm (3-wide teal bar)
  R([17, "44333WTW3333344"]),                                          // 19 torso + cross center (W center pip flanked by T)
  R([15, "33"], [17, "443333TTT3334434"], [33, "."]),                  // 20 torso + cross bottom arm + LEFT arm emerging (col 15-16)
  R([15, "33"], [17, "443333333333344"], [32, "33"]),                  // 21 torso + LEFT arm + RIGHT arm grips scanner top
  R([14, "GGGG"], [18, "433333333333"], [30, "MG"]),                   // 22 LEFT satchel begins (cols 14-17) + torso + scanner upper
  R([14, "GTtG"], [18, "433333333333"], [30, "GG"]),                   // 23 satchel with teal cross + scanner shaft
  R([14, "GTtG"], [18, "33333333333"],  [30, "Gg"]),                   // 24 satchel cross center + scanner shaft mid
  R([14, "GGGG"], [18, "33kkVVkk333"],  [30, "gg"]),                   // 25 satchel base + belt + accent buckle + scanner shaft
  R([15, "44"], [18, "33333333333"],     [30, "Vv"]),                  // 26 hip armor + scanner display (accent — TCZ)
  R([19, "3343"], [25, "3433"], [30, "VV"]),                           // 27 legs begin + scanner head accent
  R([19, "3343"], [25, "3433"], [30, "vv"]),                           // 28 + scanner spec tip
  R([19, "3343"], [25, "3433"]),                                       // 29
  R([19, "3343"], [25, "3433"]),                                       // 30
  R([19, "2343"], [25, "3432"]),                                       // 31 knee shadow
  R([19, "3343"], [25, "3433"]),                                       // 32
  R([19, "3343"], [25, "3433"]),                                       // 33
  R([19, "3343"], [25, "3433"]),                                       // 34
  R([19, "2233"], [25, "3322"]),                                       // 35 ankle
  R([18, "bbbbb"], [25, "bbbbb"]),                                     // 36 boot tops
  R([18, "bPPPb"], [25, "bPPPb"]),                                     // 37
  R([18, "PPPPP"], [25, "PPPPP"]),                                     // 38 boot soles
  R(), R(), R(), R(), R(), R(), R(), R(), R(),                         // 39-47
];

/* ============================================================
 *  VARIANT B — Scientific officer
 *
 *  Less armored — no pauldron caps, narrower shoulders. A long lab-coat
 *  skirt flares wider than the legs from rows 27 down. Helmet has a
 *  slender antenna stub on top. Forward scanner dish (4 wide, rows
 *  23–26, cols 28–32) emits an accent display. Left hand holds a data
 *  tablet (cols 14–17, rows 22–25) with an accent screen.
 *
 *  Accent zones: collar strip (row 15), visor, scanner dish display,
 *                tablet screen, belt buckle.
 * ============================================================ */
const VARIANT_B = [
  R(),                                                                 // 00
  R(),                                                                 // 01
  R(),                                                                 // 02
  R(),                                                                 // 03
  R([24, "g"]),                                                        // 04 antenna tip
  R([22, "4554"], [24, "g"]),                                          // 05 helmet apex + antenna spike
  R([21, "455554"]),                                                   // 06 helmet 6-wide (narrower than Marine — less armored)
  R([20, "44555544"]),                                                 // 07
  R([20, "45555544"]),                                                 // 08
  R([20, "45555443"]),                                                 // 09
  R([20, "3vvvvvv3"]),                                                 // 10 visor spec (8-wide)
  R([20, "3VVVVVV3"]),                                                 // 11 visor base
  R([21, "333333"]),                                                   // 12 chin (smaller jaw)
  R([22, "uuuu"]),                                                     // 13 neck
  R([21, "33uu33"]),                                                   // 14 shoulder slope start
  R([19, "VVV33uu33VVV"]),                                             // 15 collar accent strip
  R([18, "33433uu33433"]),                                             // 16 shoulders narrow (no pauldron caps)
  R([18, "344333333443"]),                                             // 17 torso top
  R([18, "344333333443"]),                                             // 18 torso
  R([18, "344333333443"]),                                             // 19 torso
  R([18, "344333333443"]),                                             // 20 torso
  R([18, "344333333443"]),                                             // 21 torso (lab coat begins next row)
  R([14, "GGGG"], [18, "344333333443"], [30, "MGGM"]),                 // 22 tablet (LEFT) + torso + scanner dish upper (RIGHT)
  R([14, "GVvG"], [18, "344333333443"], [28, "MMVVVVMM"]),             // 23 tablet w/ accent screen + scanner dish ACCENT row 1
  R([14, "GVvG"], [18, "33433333334"],  [28, "MMvVVvMM"]),             // 24 tablet + scanner dish ACCENT row 2
  R([14, "GGGG"], [18, "33kkVVkk334"], [28, "MGGGGGGM"]),              // 25 tablet bottom + belt buckle + scanner dish base
  R([18, "33433333344"], [29, "GGGGGG"]),                              // 26 hips + scanner dish underside
  // Lab coat skirt — wider than legs, draped over them from row 27 down.
  R([16, "444433333334444"]),                                          // 27 coat top (wider than shoulders)
  R([15, "4444333333334444"]),                                         // 28 coat widest
  R([15, "4344333333334434"]),                                         // 29 coat panel seam
  R([15, "4344333333334434"]),                                         // 30 coat
  R([15, "4344333333334434"]),                                         // 31 coat
  R([16, "344333333334434"]),                                          // 32 coat narrows
  R([17, "4433333334434"]),                                            // 33 coat hem
  R([19, "33"], [21, "3434"], [27, "3343"]),                           // 34 boots + leg ankles visible at hem
  R([18, "bbb"], [21, "uuuu"], [26, "bbb"]),                           // 35 boot tops + boot inner
  R([18, "PPP"], [21, "bbbb"], [26, "PPP"]),                           // 36
  R([18, "PPP"], [22, "PP"], [26, "PPP"]),                             // 37 boot soles split
  R(),                                                                 // 38
  R(), R(), R(), R(), R(), R(), R(), R(), R(),                         // 39-47
];

/* ============================================================
 *  VARIANT C — Forward observer
 *
 *  Helmet has a vertical antenna spike rising from one side (radio
 *  backpack relay). Binoculars/scope held to the face — visible from
 *  above as a wide horizontal optic bar covering the visor zone (rows
 *  9–11, cols 18–29) with accent lenses in the eyepiece pads. Radio
 *  backpack widens the dorsal silhouette behind the shoulders (cols
 *  16–31 row 15). Right hip: short scoped carbine (cols 28–31, rows
 *  20–28). Compact tactical body — no lab coat, no satchel.
 *
 *  Accent zones: binocular lenses (TCZ — scanner display analog),
 *                pauldron strip, belt buckle.
 * ============================================================ */
const VARIANT_C = [
  R(),                                                                 // 00
  R([28, "g"]),                                                        // 01 antenna tip
  R([28, "g"]),                                                        // 02 antenna shaft
  R([28, "g"]),                                                        // 03 antenna shaft
  R([28, "g"]),                                                        // 04 antenna shaft
  R([21, "445544"], [28, "g"]),                                        // 05 helmet apex + antenna base
  R([20, "44555544"], [28, "g"]),                                      // 06 antenna mounts on right side of helmet
  R([19, "4555555443"]),                                               // 07 helmet widest
  R([19, "4555555443"]),                                               // 08
  // Binocular bar — wide horizontal optic across the face. The two lens
  // pads sit in the eye positions (cols 20-22 and 25-27); the rest is
  // dark optic housing (g/G).
  R([18, "gMGGGgggGGGMg"]),                                            // 09 binocular housing top edge
  R([18, "gMVvVggvVvVMg"]),                                            // 10 binocular LENSES (accent — TCZ)
  R([18, "gGGGGggGGGGGg"]),                                            // 11 binocular housing bottom
  R([20, "33333333"]),                                                 // 12 chin
  R([21, "u3333u"]),                                                   // 13 chin / jaw
  R([22, "uuuu"]),                                                     // 14 neck
  // Radio backpack — wider dorsal bump (cols 16-31), gunmetal with a
  // single accent indicator light.
  R([16, "GGGgggrrrrgggGGG"]),                                         // 15 backpack rim — visible behind shoulders
  R([16, "V44443333334444V"]),                                         // 16 pauldron widest + accent stripe on outer edges
  R([17, "44333333333344"]),                                           // 17 torso top
  R([17, "44333333333344"]),                                           // 18 torso
  R([17, "44333333VVV344"]),                                           // 19 torso + chest indicator (small accent strip)
  R([15, "33"], [17, "44333333333344"], [31, "MG"]),                   // 20 LEFT arm + torso + carbine receiver
  R([15, "33"], [17, "44333333333344"], [28, "33MGM"]),                // 21 LEFT arm + carbine receiver (cols 28-32)
  R([15, "33"], [17, "44333333333344"], [28, "GMGg"]),                 // 22 carbine receiver + arms
  R([15, "33"], [17, "44333333333344"], [28, "MGgg"]),                 // 23 carbine receiver
  R([15, "33"], [17, "33333333333334"], [28, "GGgg"]),                 // 24 carbine
  R([18, "33kkVVkk333"], [28, "GGgg"]),                                // 25 belt + buckle + carbine
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

/* ============================================================ Grid helpers */

function newGrid() { return Array.from({ length: H }, () => Array(W).fill(".")); }

function applyStencil(g, stencil) {
  for (let y = 0; y < stencil.length; y++) {
    const row = stencil[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch !== "." && ch !== " ") g[y][x] = ch;
    }
  }
}

function addOutline(g) {
  const SHAD = new Set(["z", "y", "w"]);
  const skip = (c) => c === "." || c === "X" || SHAD.has(c);
  const out = g.map((row) => [...row]);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (g[y][x] !== ".") continue;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && !skip(g[ny][nx])) { out[y][x] = "X"; break; }
      }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y][x] = out[y][x];
}

function paintShadow(g, cx, cy, rx, ry) {
  for (let dy = -ry - 1; dy <= ry + 1; dy++) {
    for (let dx = -rx - 1; dx <= rx + 1; dx++) {
      const nx = dx / (rx + 0.5), ny = dy / (ry + 0.5);
      const d2 = nx * nx + ny * ny;
      if (d2 > 1.2) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 0 || x >= W || y < 0 || y >= H || g[y][x] !== ".") continue;
      if (d2 < 0.5) g[y][x] = "z";
      else if (d2 < 0.85) g[y][x] = "y";
      else g[y][x] = "w";
    }
  }
}

function finalize(stencil, shadow) {
  const g = newGrid();
  applyStencil(g, stencil);
  addOutline(g);
  paintShadow(g, shadow.cx, shadow.cy, shadow.rx, shadow.ry);
  return g;
}

/* ============================================================ Renderer */

function resolveColor(c, acc) {
  if (c === "1") return ARMOR.V0;
  if (c === "2") return ARMOR.V1;
  if (c === "3") return ARMOR.V2;
  if (c === "4") return ARMOR.V3;
  if (c === "5") return ARMOR.V4;
  if (c === "V") return acc.V;
  if (c === "v") return acc.v;
  if (c === "g") return TOOL.g;
  if (c === "G") return TOOL.G;
  if (c === "M") return TOOL.M;
  if (c === "m") return TOOL.m;
  if (c === "z" || c === "y" || c === "w") return SHADOW[c];
  return FIXED[c] || "#f0f";
}

function gridToRects(grid, acc) {
  const out = [];
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = grid[y][x];
      if (c === ".") { x++; continue; }
      let xEnd = x + 1;
      while (xEnd < W && grid[y][xEnd] === c) xEnd++;
      out.push({ x, y, w: xEnd - x, h: 1, fill: resolveColor(c, acc) });
      x = xEnd;
    }
  }
  return out;
}

function SpriteSVG({ grid, accent, size = 48 }) {
  const acc = accentRamp(ACCENTS[accent] || ACCENTS.slate);
  const rects = React.useMemo(() => gridToRects(grid, acc), [grid, accent]);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${W} ${H}`}
      shapeRendering="crispEdges"
      style={{ display: "block", imageRendering: "pixelated" }}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
      ))}
    </svg>
  );
}

/* ============================================================ Variant builders */

function buildA() { return finalize(VARIANT_A, { cx: 23, cy: 41, rx: 11, ry: 2 }); }
function buildB() { return finalize(VARIANT_B, { cx: 23, cy: 39, rx: 11, ry: 2 }); }
function buildC() { return finalize(VARIANT_C, { cx: 23, cy: 41, rx: 12, ry: 2 }); }

const VARIANTS = {
  A: {
    id: "A",
    title: "Medic",
    subtitle:
      "Rounded helmet, full-strip visor, teal/white equipment cross on the chest, handheld scanner wand at the right side with accent display tip, satchel pouch on the LEFT hip.",
    build: buildA,
  },
  B: {
    id: "B",
    title: "Scientific officer",
    subtitle:
      "Less armored — no pauldron caps, narrower shoulders, lab-coat skirt flaring over the legs. Forward scanner dish on the right with accent display, data tablet held in the left hand. Slim antenna on the helmet.",
    build: buildB,
  },
  C: {
    id: "C",
    title: "Forward observer",
    subtitle:
      "Tactical assistant with binoculars held to the face — accent lenses cover the visor zone. Vertical antenna spike from a radio backpack; short scoped carbine at the right hip.",
    build: buildC,
  },
};

Object.assign(window, {
  W, H, ACCENTS, VARIANTS, SpriteSVG,
  buildA, buildB, buildC,
});
