/* sprite-engine.jsx
 *
 * Procedural pixel-art primitives for the Meridian Command sprite roster.
 *
 * Sprite encoding: each unit is a 48×48 grid of character codes. Codes
 * resolve to colors at render time using a fixed palette + a derived
 * 5-tone ACCENT RAMP that tints the body armor.
 *
 * Char codes:
 *   .  transparent
 *   X  outline
 *   1  accent V0 — deepest accent shadow
 *   2  accent V1 — accent shadow
 *   3  accent V2 — accent base (the §4 hex)
 *   4  accent V3 — accent highlight
 *   5  accent V4 — accent rim / spec
 *   i  visor inner (dark optic)
 *   I  visor glint (small bright pixel)
 *   g  weapon dark
 *   G  weapon mid
 *   M  weapon hi
 *   m  muzzle hole
 *   b  boot leather
 *   P  boot sole / tread
 *   u  under-suit dark
 *   k  strap / hard seal
 *   r  rivet / panel screw
 *   z  ground shadow inner   (alpha ~0.55)
 *   y  ground shadow mid     (alpha ~0.32)
 *   w  ground shadow outer   (alpha ~0.16)
 */

/* ===== Accents (§4) — six team colors ===== */
const ACCENTS = {
  slate:  "#64748b",
  blue:   "#3b82f6",
  violet: "#8b5cf6",
  green:  "#22c55e",
  orange: "#f97316",
  rose:   "#f43f5e",
};

/* ===== Armor neutral ramp (fixed, not accent-derived) =====
 *
 * The body of the armor is a dark gritty steel — independent of the
 * accent. Accent only appears on specific zones (visor, chest light,
 * pauldron stripe), keyed by V / v in the stencil.
 */
const ARMOR_RAMP = {
  V0: "#0c0e12",  // deepest shadow / under-plate
  V1: "#181c22",  // dark armor base
  V2: "#262b33",  // armor base (main body tone)
  V3: "#3a414c",  // armor mid (top-lit panel)
  V4: "#566273",  // armor rim / spec
};

/* ===== Accent ramp =====
 *
 * The §4 accent hex maps to V (mid accent — for the visor strip and
 * other team-color zones). v is a brighter spec on top of that.
 * In error state both dim toward a near-black accent (err).
 */
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const ACCENT_BLACK = [10, 12, 16];
const ACCENT_WHITE = [240, 245, 255];

function deriveAccentRamp(hex) {
  const base = hexToRgb(hex);
  return {
    V: rgbToHex(base),
    v: rgbToHex(mix(base, ACCENT_WHITE, 0.45)),  // brighter spec
    err: rgbToHex(mix(base, ACCENT_BLACK, 0.75)), // error: very dim accent
  };
}

/* ===== Fixed (non-accent) palette ===== */
const FIXED = {
  X: "#06080b",  // outline — very dark, almost black
  i: "#0e1217",  // visor inner
  I: "#cfe6ff",  // visor glint
  g: "#13161c",  // weapon dark
  G: "#363c45",  // weapon mid
  M: "#5f6770",  // weapon hi
  m: "#1c2028",  // muzzle hole interior
  b: "#1a1d22",  // boot
  P: "#0b0d10",  // boot tread / sole
  u: "#15181d",  // under-suit dark
  k: "#0a0c10",  // strap / hard seal
  r: "#2b2f37",  // rivet
};

const SHADOW = {
  z: "rgba(0,0,0,0.55)",
  y: "rgba(0,0,0,0.32)",
  w: "rgba(0,0,0,0.16)",
};

/* ===== Grid helpers ===== */
const W = 48, H = 48;
function newGrid() { return Array.from({ length: H }, () => Array(W).fill(".")); }
function inb(x, y) { return x >= 0 && x < W && y >= 0 && y < H; }
function get(g, x, y) { return inb(x, y) ? g[y][x] : "."; }
function set(g, x, y, c) { if (inb(x, y)) g[y][x] = c; }

/* ===== Stencil blit (the main authoring primitive) ===== */
function blitStencil(g, x0, y0, stencil) {
  for (let r = 0; r < stencil.length; r++) {
    const row = stencil[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === "." || ch === " ") continue;
      set(g, x0 + c, y0 + r, ch);
    }
  }
}

function mirrorStencil(stencil) {
  return stencil.map((row) => row.split("").reverse().join(""));
}

// Validate that every row of a 48-wide stencil is exactly 48 chars,
// and the stencil itself is at most 48 rows. Logs a warning on mismatch.
function validateStencil(name, stencil) {
  if (stencil.length > H) {
    console.warn(`[${name}] stencil has ${stencil.length} rows, expected ≤ ${H}`);
  }
  stencil.forEach((row, i) => {
    if (row.length !== W) {
      console.warn(`[${name}] row ${i}: ${row.length} chars, expected ${W}`);
      console.warn(`        "${row}"`);
    }
  });
}

// Add a 1-pixel outline around any non-transparent, non-outline pixel.
// Skip ground-shadow tones (z/y/w) so they don't get outlined.
function addOutline(g) {
  const SHAD = new Set(["z", "y", "w"]);
  const skip = (c) => c === "." || c === "X" || SHAD.has(c);
  const out = g.map((row) => [...row]);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (g[y][x] !== ".") continue;
      for (const [dx, dy] of dirs) {
        const c = get(g, x + dx, y + dy);
        if (!skip(c)) { out[y][x] = "X"; break; }
      }
    }
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      g[y][x] = out[y][x];
}

// Ground shadow ellipse — paints only into empty pixels.
function paintShadow(g, cx, cy, rx, ry) {
  for (let dy = -ry - 1; dy <= ry + 1; dy++) {
    for (let dx = -rx - 1; dx <= rx + 1; dx++) {
      const nx = dx / (rx + 0.5), ny = dy / (ry + 0.5);
      const d2 = nx * nx + ny * ny;
      if (d2 > 1.2) continue;
      const x = cx + dx, y = cy + dy;
      if (!inb(x, y) || g[y][x] !== ".") continue;
      let code;
      if (d2 < 0.5) code = "z";
      else if (d2 < 0.85) code = "y";
      else code = "w";
      g[y][x] = code;
    }
  }
}

/* ===== Renderer ===== */
function gridToRects(grid, accent, errorMode) {
  const acc = deriveAccentRamp(ACCENTS[accent] || ACCENTS.slate);
  function resolve(c) {
    // Armor neutrals (fixed dark steel ramp)
    if (c === "1") return ARMOR_RAMP.V0;
    if (c === "2") return ARMOR_RAMP.V1;
    if (c === "3") return ARMOR_RAMP.V2;
    if (c === "4") return ARMOR_RAMP.V3;
    if (c === "5") return ARMOR_RAMP.V4;
    // Accent zones
    if (c === "V") return errorMode ? acc.err : acc.V;
    if (c === "v") return errorMode ? acc.err : acc.v;
    if (c === "z" || c === "y" || c === "w") return SHADOW[c];
    return FIXED[c] || "#f0f";
  }
  const rects = [];
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = grid[y][x];
      if (c === ".") { x++; continue; }
      let xEnd = x + 1;
      while (xEnd < W && grid[y][xEnd] === c) xEnd++;
      rects.push({ x, y, w: xEnd - x, h: 1, fill: resolve(c) });
      x = xEnd;
    }
  }
  return rects;
}

function SpriteSVG({ grid, accent, errorMode, size = 48 }) {
  const rects = React.useMemo(
    () => gridToRects(grid, accent, errorMode),
    [grid, accent, errorMode]
  );
  return (
    <svg
      className="pixelated"
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

Object.assign(window, {
  W, H, ACCENTS, FIXED, SHADOW,
  newGrid, set, get, blitStencil, mirrorStencil, validateStencil,
  addOutline, paintShadow,
  deriveAccentRamp, hexToRgb, rgbToHex,
  SpriteSVG, gridToRects,
});
