// Shared helpers for the JWST-inspired SVG background generators. Authored as
// design code via claude.ai/design — the generators (jwst-generators.ts)
// produce SVG *strings* that thin React wrappers (jwst.tsx) inject via
// dangerouslySetInnerHTML, rather than building the SVG tree as JSX. Mixing
// the two approaches inside a single workflow is awkward, so the helpers
// here mirror the design-canvas API: they take a seeded PRNG and return SVG
// fragment strings that the generator concatenates into its template.

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────

export type Rng = () => number;

export function mulberry32(a: number): Rng {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Per-seed namespaced shared <defs> ─────────────────────────────────────────

/** Per-seed gradient/filter defs used by every generator: bloom radials in
 *  three tints, a horizontal spike gradient for diffraction spikes, and three
 *  Gaussian-blur filters at small/medium/large stdDeviations. Generators
 *  embed this output verbatim inside their own <defs>. */
export function commonDefs(seed: number): string {
  return `
    <radialGradient id="bloom-${seed}" cx="50%" cy="50%" r="50%">
      <stop offset="0"   stop-color="#ffffff" stop-opacity="0.85"/>
      <stop offset="0.18" stop-color="#ffffff" stop-opacity="0.35"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.08"/>
      <stop offset="1"   stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bloomBlue-${seed}" cx="50%" cy="50%" r="50%">
      <stop offset="0"    stop-color="#dfeaff" stop-opacity="0.85"/>
      <stop offset="0.18" stop-color="#a8c4ff" stop-opacity="0.35"/>
      <stop offset="0.45" stop-color="#a8c4ff" stop-opacity="0.08"/>
      <stop offset="1"    stop-color="#a8c4ff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bloomWarm-${seed}" cx="50%" cy="50%" r="50%">
      <stop offset="0"    stop-color="#fff7e1" stop-opacity="0.85"/>
      <stop offset="0.18" stop-color="#ffd9a0" stop-opacity="0.35"/>
      <stop offset="0.45" stop-color="#ffb56a" stop-opacity="0.08"/>
      <stop offset="1"    stop-color="#ffb56a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="spike-${seed}" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0"   stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.7"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.7"/>
      <stop offset="1"   stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="softblur-${seed}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="0.6"/>
    </filter>
    <filter id="bigblur-${seed}" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="14"/>
    </filter>
    <filter id="medblur-${seed}" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
  `;
}

// ── Realistic star field ──────────────────────────────────────────────────────

export interface StarFieldOpts {
  /** Seed namespace for the bloom-* gradient ids. Required. */
  seed: number;
  /** Optional Y-range clip — useful for keeping stars above/below a ridgeline. */
  yMin?: number;
  yMax?: number;
}

/** Dim stars (the vast majority) — power-law size distribution, varied stellar
 *  tints, sub-pixel-friendly. The biggest of these get a soft halo so they
 *  don't read as aliased pixels. */
export function stars(rng: Rng, w: number, h: number, count: number, opts: StarFieldOpts): string {
  const yMin = opts.yMin ?? 0;
  const yMax = opts.yMax ?? h;
  const tints = ["#ffffff", "#fbf3d8", "#d8e3ff", "#ffe4c4", "#a8c4ff", "#ffd6c0"];
  let s = "";
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = yMin + rng() * (yMax - yMin);
    // r in 0.18..2.2, heavily skewed small
    const sz = Math.pow(rng(), 4.5);
    const r = 0.18 + sz * 2.0;
    const tint = tints[Math.floor(rng() * tints.length)];
    const op = (0.30 + Math.pow(rng(), 0.7) * 0.7).toFixed(2);
    // Soft halo for the brighter ones — gradient-filled ellipse so the outer
    // edge fades to alpha 0 instead of cutting a hard circle. Random aspect
    // ratio + rotation keeps the majority oval rather than perfectly round.
    if (r > 1.05) {
      const haloR = r * 5.0;
      const asp = 0.5 + rng() * 0.4; // 0.5..0.9 — minor axis ratio
      const rot = rng() * 360;
      s +=
        `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" ` +
        `rx="${haloR.toFixed(2)}" ry="${(haloR * asp).toFixed(2)}" ` +
        `fill="url(#bloom-${opts.seed})" opacity="${(parseFloat(op) * 0.65).toFixed(2)}" ` +
        `transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${tint}" opacity="${op}"/>`;
  }
  return s;
}

// ── Hero stars (JWST-style 6-spike diffraction) ───────────────────────────────

export interface HeroStarOpts {
  seed: number;
  /** Brightness/scale multiplier — defaults to 0.9..2.5 random per call. */
  sz?: number;
  /** Tint for the small bright core. Defaults to white. */
  tint?: string;
  /** Override the bloom gradient id; otherwise picks `bloom-${seed}`. */
  bloom?: string;
}

/** Hero star with JWST-style 6-spike diffraction pattern + horizontal struts.
 *  Spikes are gradient-filled rectangles passed through a soft Gaussian blur,
 *  wrapped in a wide multi-stop bloom — no hard edges anywhere. */
export function heroStar(rng: Rng, x: number, y: number, opts: HeroStarOpts): string {
  const seed = opts.seed;
  const sz = opts.sz ?? 0.9 + rng() * 1.6;
  const tint = opts.tint ?? "white";
  const bloomId = opts.bloom ?? `bloom-${seed}`;
  const len = 50 * sz;
  const strutLen = 70 * sz;
  // Bloom shape: most are oval, a few near-circular. Independent per-layer
  // rotation jitter keeps the two layers from looking like a single solid disc.
  const bAsp = 0.55 + rng() * 0.4; // 0.55..0.95 — minor axis ratio
  const bRot = rng() * 360;
  const bRot2 = bRot + (rng() - 0.5) * 30;
  let s = `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" style="mix-blend-mode: screen">`;

  // Wide diffuse bloom — two layers, rendered as rotated ellipses so they
  // don't read as perfect circles. Gradient fades to alpha 0 at the edge.
  s +=
    `<ellipse rx="${(34 * sz).toFixed(1)}" ry="${(34 * sz * bAsp).toFixed(1)}" ` +
    `fill="url(#${bloomId})" opacity="0.55" transform="rotate(${bRot.toFixed(1)})"/>`;
  s +=
    `<ellipse rx="${(14 * sz).toFixed(1)}" ry="${(14 * sz * bAsp).toFixed(1)}" ` +
    `fill="url(#${bloomId})" opacity="0.85" transform="rotate(${bRot2.toFixed(1)})"/>`;

  // 6 diffraction spikes, each = a thin tapered rectangle with the linear
  // spike gradient, soft-blurred so the line doesn't read as crisp.
  s += `<g filter="url(#softblur-${seed})">`;
  for (let k = 0; k < 6; k++) {
    const angle = k * 60 + 0;
    s +=
      `<rect x="${(-len / 2).toFixed(1)}" y="-0.45" width="${len.toFixed(1)}" height="0.9" ` +
      `fill="url(#spike-${seed})" opacity="0.7" transform="rotate(${angle})"/>`;
  }
  // The two long horizontal struts that JWST's secondary-mirror supports add.
  s +=
    `<rect x="${(-strutLen / 2).toFixed(1)}" y="-0.25" width="${strutLen.toFixed(1)}" height="0.5" ` +
    `fill="url(#spike-${seed})" opacity="0.45"/>`;
  s += `</g>`;

  // Bright but small core, no harder edge than the surrounding bloom.
  s += `<circle r="${(sz * 1.6).toFixed(2)}" fill="${tint}" opacity="0.95"/>`;
  s += `<circle r="${(sz * 0.7).toFixed(2)}" fill="${tint}"/>`;
  s += `</g>`;
  return s;
}

/** Place `count` hero stars across the field, picking randomly from the three
 *  bloom gradients (white-majority, with blue and warm minority tints). */
export function heroStars(
  rng: Rng,
  w: number,
  h: number,
  count: number,
  opts: HeroStarOpts & { yMin?: number; yMax?: number },
): string {
  const yMin = opts.yMin ?? 0;
  const yMax = opts.yMax ?? h;
  let s = "";
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = yMin + rng() * (yMax - yMin);
    const bloom =
      rng() < 0.25
        ? `bloomBlue-${opts.seed}`
        : rng() < 0.3
        ? `bloomWarm-${opts.seed}`
        : `bloom-${opts.seed}`;
    s += heroStar(rng, x, y, { ...opts, bloom });
  }
  return s;
}

// ── Procedural-gas filters (turbulence + warp) ────────────────────────────────

/** Multi-octave turbulence layer tinted to a target color. Wrap a `<rect>` in
 *  this filter to render procedural gas in the given colour. */
export function nebulaFilter(
  id: string,
  seed: number,
  baseFreq: string,
  octaves: number,
  r: number,
  g: number,
  b: number,
  density: number = 0.7,
): string {
  return `
  <filter id="${id}" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="${baseFreq}" numOctaves="${octaves}" seed="${seed}" result="t"/>
    <feColorMatrix in="t" values="
      0 0 0 0 ${r}
      0 0 0 0 ${g}
      0 0 0 0 ${b}
      0 0 0 ${density * 1.6} ${-density * 0.55}"/>
  </filter>`;
}

/** Filter that warps anything fed into it by displacing against turbulent
 *  noise — the trick that turns clean gradient edges into ragged gas edges. */
export function warpFilter(id: string, seed: number, baseFreq: string, scale: number): string {
  return `
  <filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="${baseFreq}" numOctaves="4" seed="${seed}" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="${scale}"/>
  </filter>`;
}
