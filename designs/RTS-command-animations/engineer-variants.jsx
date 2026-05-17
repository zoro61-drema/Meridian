/* engineer-variants.jsx
 *
 * Three Engineer direction variants for the Command Sprites roster.
 *
 *   A — Field engineer     (work cap, coveralls, hand welder, multi-tool pouch)
 *   B — Combat tech        (tech helmet, hex chest, dorsal turret canister, deployer)
 *   C — Repair specialist  (hood, heavy backpack, dual claw arms over shoulders)
 *
 * Stencil contract matches Marine.tsx:
 *   1..5  armor ramp (V0..V4) — Steel by default
 *   V, v  accent (team-color zone)   err = error tone (unused on the variants page)
 *   g G M m  tool / welder body + muzzle
 *   b P   boot leather / sole
 *   u     under-suit dark
 *   k     strap / hard seal
 *   r     rivet / panel screw
 *   h     gloved hand
 *   i I   visor inner / visor glint
 *   X     outline (added in finalize)
 *   z y w ground-shadow inner/mid/outer
 */

const W = 48, H = 48;

/* ---------- row builder ---------- */
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

/* ---------- palettes (mirror Marine.tsx defaults) ---------- */
const ARMOR = { V0: "#0c0e12", V1: "#181c22", V2: "#262b33", V3: "#3a414c", V4: "#566273" };
const TOOL  = { g: "#13161c", G: "#363c45", M: "#5f6770", m: "#1c2028" };

const FIXED = {
  X: "#06080b",
  b: "#1a1d22", P: "#0b0d10",
  u: "#15181d", k: "#0a0c10", r: "#2b2f37",
  h: "#0a0c10",
  i: "#0e1217", I: "#aab5c0",
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
 *  VARIANT A — Field engineer
 *  Less bulky than the Marine. Brimmed work cap, coveralls,
 *  multi-tool pouch on the LEFT hip (4×4 bump), hand-held welding
 *  torch on the RIGHT side extending forward with an accent tip-glow.
 *  Shoulder light on the LEFT pauldron.
 * ============================================================ */
const VARIANT_A = [
  R(),                                                                // 00
  R(),                                                                // 01
  R(),                                                                // 02
  R(),                                                                // 03
  R(),                                                                // 04
  R(),                                                                // 05 — engineer is shorter than marine
  R([21, "445544"]),                                                  // 06 cap top
  R([20, "44555544"]),                                                // 07
  R([19, "4555555443"]),                                              // 08 cap full width
  R([19, "4555555443"]),                                              // 09 cap band
  R([19, "3iiiiiiii3"]),                                              // 10 goggle/visor band (neutral dark)
  R([20, "iIIIIIIi"]),                                                // 11 lenses with glint
  R([20, "33333333"]),                                                // 12 chin
  R([21, "u3333u"]),                                                  // 13 neck collar
  R([15, "44"],  [17, "Vv44"], [21, "33uu33"], [27, "3344"], [31, "44"]),       // 14 shoulders + accent shoulder light on left pauldron
  R([15, "443"], [18, "44443"], [20, "33444433"], [28, "34444"], [33, "33"]),  // 15 pauldron mid (wide)
  R([16, "33"],  [18, "443"],   [20, "44544443"], [28, "344"], [31, "33"]),    // 16 chest top + arms emerge
  R([16, "33"],  [18, "433"],   [20, "44544443"], [28, "33"],  [30, "33"]),    // 17 chest + arms
  R([16, "33"],  [18, "433"],   [20, "44544443"], [28, "33"],  [30, "33"]),    // 18
  R([16, "33"],  [18, "433"],   [20, "44VVVV43"], [28, "33"],  [30, "33"]),    // 19 vest stripe (chest accent line)
  R([16, "33"],  [18, "433"],   [20, "44VVVV43"], [28, "33"],  [30, "GG"]),    // 20 welder body begins (col 30-31)
  R([14, "rrrr"], [18, "33"],   [20, "44444443"], [28, "33"],  [30, "GM"]),    // 21 toolkit pouch top + welder
  R([14, "rPPr"], [18, "33"],   [20, "33333333"], [28, "3h"],  [30, "GM"]),    // 22 toolkit body + right glove at welder grip
  R([14, "rPPr"], [18, "h3"],   [20, "33333333"], [28, "33"],  [30, "GM"]),    // 23 left glove on toolkit
  R([14, "rPPr"], [18, "33"],   [20, "33333333"], [28, "33"],  [30, "Gm"]),    // 24 welder muzzle taper
  R([14, "rrrr"], [19, "kkkVkkkk"],                            [30, "Mg"]),    // 25 belt + accent buckle + welder muzzle
  R([19, "33333333"],                                          [30, "Vv"]),    // 26 belt under + WELDER TIP GLOW (accent)
  R([19, "3343"],   [25, "3433"]),                                    // 27 legs begin
  R([19, "3343"],   [25, "3433"]),                                    // 28
  R([19, "3343"],   [25, "3433"]),                                    // 29
  R([19, "2343"],   [25, "3432"]),                                    // 30 knee shadow
  R([19, "3343"],   [25, "3433"]),                                    // 31
  R([19, "3343"],   [25, "3433"]),                                    // 32
  R([19, "2233"],   [25, "3322"]),                                    // 33 ankle
  R([18, "bbbbb"],  [25, "bbbbb"]),                                   // 34 boot tops
  R([18, "bPPPb"],  [25, "bPPPb"]),                                   // 35
  R([18, "PPPPP"],  [25, "PPPPP"]),                                   // 36 soles
  R(), R(), R(), R(), R(), R(), R(), R(), R(), R(), R(),              // 37-47
];

/* ============================================================
 *  VARIANT B — Combat tech
 *  Marine-weight helmet, hex-grid chest plate (alternating 4/3
 *  diamond pattern), dorsal turret-kit canister bumping out
 *  north of the shoulders (cols 20-27 rows 14-16, visually behind
 *  the helmet). Compact deployer puck held at the right side.
 *  Shoulder light on the LEFT, deployer-tip accent on the RIGHT.
 * ============================================================ */
const VARIANT_B = [
  R(),                                                                // 00
  R(),                                                                // 01
  R(),                                                                // 02
  R(),                                                                // 03
  R(),                                                                // 04
  R([21, "445544"]),                                                  // 05 helmet apex
  R([20, "44555544"]),                                                // 06
  R([19, "4555555443"]),                                              // 07 helmet full
  R([19, "4555555443"]),                                              // 08
  R([19, "4555555443"]),                                              // 09
  R([19, "3iiiiiiii3"]),                                              // 10 visor band (neutral)
  R([20, "iIiiiiIi"]),                                                // 11 visor lenses w/ glints
  R([20, "33333333"]),                                                // 12 chin
  R([21, "u3333u"]),                                                  // 13 chin/neck
  R([16, "44"], [18, "445"], [21, "uuuu"], [25, "uuuu"], [29, "5"], [30, "44"]),     // 14 dorsal canister start (top of bump shows as 'u' antenna seam)
  R([15, "44"], [17, "Vv4"], [20, "44GGGGGG44"], [30, "4Vv"], [33, "44"]),  // 15 shoulder lights L+R + turret canister (gunmetal) behind shoulders
  R([15, "443"], [17, "443"], [20, "4MGGGGM4"], [28, "344"], [31, "33"]),   // 16 canister with mid-highlight + arms emerge
  R([15, "33"], [17, "443"], [20, "44544443"], [28, "344"], [31, "33"]),    // 17 chest top + arms
  R([15, "33"], [17, "443"], [20, "4V44V433"], [28, "33"], [30, "33"]),     // 18 hex grid row 1 (V at corners)
  R([15, "33"], [17, "433"], [20, "44V44V43"], [28, "33"], [30, "33"]),     // 19 hex grid row 2
  R([15, "33"], [17, "433"], [20, "4V44V443"], [28, "33"], [30, "33"]),     // 20 hex grid row 3
  R([15, "33"], [17, "433"], [20, "44V44V43"], [28, "33"], [30, "Mm"]),     // 21 hex grid row 4 + deployer puck top
  R([15, "33"], [17, "433"], [20, "44544443"], [28, "33"], [30, "MM"]),     // 22 chest + deployer body
  R([15, "33"], [17, "h3"],  [20, "44544443"], [28, "3h"], [30, "MG"]),     // 23 gloves + deployer mid
  R([16, "33"], [18, "33"],  [20, "33333333"], [28, "33"], [30, "GG"]),     // 24 deployer base
  R([19, "3kkkVkkk3"],                                                [30, "Vv"]),    // 25 belt + buckle + DEPLOYER TIP GLOW
  R([19, "33333333"]),                                                              // 26 belt under
  R([19, "3343"], [25, "3433"]),                                      // 27 legs
  R([19, "3343"], [25, "3433"]),                                      // 28
  R([19, "3343"], [25, "3433"]),                                      // 29
  R([19, "2343"], [25, "3432"]),                                      // 30 knee
  R([19, "3343"], [25, "3433"]),                                      // 31
  R([19, "3343"], [25, "3433"]),                                      // 32
  R([19, "2233"], [25, "3322"]),                                      // 33 ankle
  R([18, "bbbbb"], [25, "bbbbb"]),                                    // 34 boots
  R([18, "bPPPb"], [25, "bPPPb"]),                                    // 35
  R([18, "PPPPP"], [25, "PPPPP"]),                                    // 36
  R(), R(), R(), R(), R(), R(), R(), R(), R(), R(), R(),              // 37-47
];

/* ============================================================
 *  VARIANT C — Repair specialist
 *  Bulkier silhouette. Heavy hooded helmet, BIG backpack adding
 *  bulk laterally at the shoulders. DUAL MANIPULATOR CLAWS arch
 *  from the backpack OVER the shoulders, framing the helmet with
 *  their pincer tips visible at the unit's front edge (rows 4-7).
 *  Claw tips carry the accent (team-color zone).
 *  No hand-held welder — the claws ARE the tools.
 * ============================================================ */
const VARIANT_C = [
  R(),                                                                // 00
  R(),                                                                // 01
  R(),                                                                // 02
  R(),                                                                // 03
  R([17, "vV"], [29, "Vv"]),                                          // 04 CLAW TIPS — accent glow, framing helmet
  R([16, "GMVM"], [28, "MVMG"]),                                      // 05 claw pincers (gunmetal + accent inner)
  R([16, "GgG"], [21, "445544"], [29, "GgG"]),                        // 06 claw arms forward + helmet apex
  R([16, "GgG"], [20, "44555544"], [29, "GgG"]),                      // 07 claws + helmet wider
  R([16, "Gg"], [19, "4555555443"], [29, "gG"]),                      // 08 claws + helmet full
  R([16, "GG"], [19, "4555555443"], [29, "GG"]),                      // 09 claws + helmet band
  R([16, "GM"], [19, "3iiiiiiii3"], [29, "MG"]),                      // 10 claw shafts + visor band
  R([16, "GM"], [20, "iIIIIIIi"], [29, "MG"]),                        // 11 claw shafts + lenses
  R([16, "GM"], [20, "33333333"], [29, "MG"]),                        // 12 claw shafts + chin
  R([16, "GM"], [21, "u3333u"], [29, "MG"]),                          // 13 claw shafts + neck
  R([15, "MGG"], [21, "uuuu"], [29, "GGM"]),                          // 14 claws mount + shoulder seams
  R([14, "MGG4"], [18, "Vv44"], [22, "5544"], [26, "44Vv"], [30, "4GGM"]),     // 15 backpack mount + shoulder lights L+R + helmet collar
  R([14, "GGGG"], [18, "44444444"], [26, "44444"], [30, "GGGG"]),     // 16 backpack edge (G) + pauldrons + backpack edge
  R([13, "GG"], [15, "MGGr"], [19, "44544443"], [28, "rGGM"], [32, "GG"]),     // 17 backpack WIDEST + chest
  R([13, "GG"], [15, "MGGr"], [19, "44544443"], [28, "rGGM"], [32, "GG"]),     // 18
  R([13, "GG"], [15, "MGGr"], [19, "44VVVV43"], [28, "rGGM"], [32, "GG"]),     // 19 backpack + chest vest stripe
  R([13, "GG"], [15, "MGGr"], [19, "44VVVV43"], [28, "rGGM"], [32, "GG"]),     // 20
  R([14, "Mg"], [16, "GG3"], [19, "44544443"], [28, "3GG"], [32, "gM"]),       // 21 backpack tapers in
  R([14, "Mg"], [16, "G33"], [19, "33333333"], [28, "33G"], [32, "gM"]),       // 22
  R([14, "Mg"], [17, "h3"],  [19, "33333333"], [28, "3h"], [32, "gM"]),        // 23 gloves visible at sides
  R([15, "g"],  [17, "33"],  [19, "33333333"], [28, "33"], [32, "g"]),         // 24
  R([18, "3kkkkVkkk3"]),                                              // 25 belt + accent buckle
  R([18, "333333333"]),                                                // 26 belt under
  R([18, "33433"], [24, "33433"]),                                    // 27 hips
  R([18, "33343"], [24, "34333"]),                                    // 28 wider hips for bulk
  R([19, "3343"], [25, "3433"]),                                      // 29 legs
  R([19, "2343"], [25, "3432"]),                                      // 30 knee
  R([19, "3343"], [25, "3433"]),                                      // 31
  R([19, "3343"], [25, "3433"]),                                      // 32
  R([19, "2233"], [25, "3322"]),                                      // 33 ankle
  R([17, "bbbbbb"], [25, "bbbbbb"]),                                  // 34 boot tops (wider — heavier)
  R([17, "bPPPPb"], [25, "bPPPPb"]),                                  // 35
  R([17, "PPPPPP"], [25, "PPPPPP"]),                                  // 36 soles
  R(), R(), R(), R(), R(), R(), R(), R(), R(), R(), R(),              // 37-47
];

/* ============================================================ Grid build */

function newGrid(){return Array.from({length:H},()=>Array(W).fill("."));}

function applyStencil(g, stencil) {
  for (let y = 0; y < stencil.length && y < H; y++) {
    const row = stencil[y];
    for (let x = 0; x < row.length && x < W; x++) {
      const ch = row[x];
      if (ch !== "." && ch !== " ") g[y][x] = ch;
    }
  }
}

function addOutline(g) {
  const SHAD = new Set(["z","y","w"]);
  const skip = c => c === "." || c === "X" || SHAD.has(c);
  const out = g.map(r => [...r]);
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (g[y][x] !== ".") continue;
      for (const [dx,dy] of dirs) {
        const nx = x+dx, ny = y+dy;
        if (nx>=0 && nx<W && ny>=0 && ny<H && !skip(g[ny][nx])) { out[y][x] = "X"; break; }
      }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y][x] = out[y][x];
}

function paintShadow(g, cx, cy, rx, ry) {
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
}

function finalize(stencil, shadow) {
  const g = newGrid();
  applyStencil(g, stencil);
  addOutline(g);
  paintShadow(g, shadow.cx, shadow.cy, shadow.rx, shadow.ry);
  return g;
}

/* ============================================================ Renderer */

function resolveColor(c, accent) {
  if (c === "1") return ARMOR.V0;
  if (c === "2") return ARMOR.V1;
  if (c === "3") return ARMOR.V2;
  if (c === "4") return ARMOR.V3;
  if (c === "5") return ARMOR.V4;
  if (c === "V") return accent.V;
  if (c === "v") return accent.v;
  if (c === "g") return TOOL.g;
  if (c === "G") return TOOL.G;
  if (c === "M") return TOOL.M;
  if (c === "m") return TOOL.m;
  if (c === "z" || c === "y" || c === "w") return SHADOW[c];
  return FIXED[c] || "#f0f";
}

function gridToRects(grid, accent) {
  const out = [];
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = grid[y][x];
      if (c === ".") { x++; continue; }
      let xEnd = x + 1;
      while (xEnd < W && grid[y][xEnd] === c) xEnd++;
      out.push({ x, y, w: xEnd - x, h: 1, fill: resolveColor(c, accent) });
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

function buildA() { return finalize(VARIANT_A, { cx: 23, cy: 39, rx: 9,  ry: 2 }); }
function buildB() { return finalize(VARIANT_B, { cx: 23, cy: 39, rx: 10, ry: 2 }); }
function buildC() { return finalize(VARIANT_C, { cx: 23, cy: 39, rx: 12, ry: 2 }); }

const VARIANTS = {
  A: { id: "A", title: "Field engineer",
       subtitle: "Coveralls, work cap, hand-held welder torch on the right hip, multi-tool pouch bump on the left. Lightest silhouette.",
       build: buildA },
  B: { id: "B", title: "Combat tech",
       subtitle: "Tech helmet, hex-grid chest plate, dorsal turret canister behind shoulders, compact deployer puck. Mid-weight.",
       build: buildB },
  C: { id: "C", title: "Repair specialist",
       subtitle: "Hood + heavy backpack, dual manipulator claws arch over shoulders to frame the helmet. Accent rides the claw tips. Bulkiest.",
       build: buildC },
};

Object.assign(window, {
  W, H, ACCENTS, VARIANTS, SpriteSVG,
  buildA, buildB, buildC,
});
