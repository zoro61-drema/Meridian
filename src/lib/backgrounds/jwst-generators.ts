// JWST-inspired SVG background generators (realistic v2). Authored as design
// code via claude.ai/design — each function returns a complete <svg>…</svg>
// string sized w × h, deterministic by seed. Thin React wrappers in jwst.tsx
// inject the output via dangerouslySetInnerHTML.

import {
  commonDefs,
  heroStars,
  mulberry32,
  nebulaFilter,
  stars,
  warpFilter,
} from "./_jwst-helpers";

// ── 1. Cosmic Cliffs (Carina-like) ───────────────────────────────────────────

export function bgCosmicCliffs(w: number, h: number, seed: number = 1): string {
  const rng = mulberry32(seed * 9973);
  const horY = h * 0.5;
  const fadeStart = (horY / h - 0.04).toFixed(3);
  const fadeEnd = (horY / h + 0.18).toFixed(3);

  return `
  <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <defs>
      ${commonDefs(seed)}

      <linearGradient id="cc-sky-${seed}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0"   stop-color="#040814"/>
        <stop offset="0.45" stop-color="#0d2236"/>
        <stop offset="0.7" stop-color="#28455a"/>
        <stop offset="1"   stop-color="#5a3826"/>
      </linearGradient>

      ${nebulaFilter(`cc-dust-${seed}`,    seed,      "0.005 0.014", 5, 1.00, 0.62, 0.32, 0.95)}
      ${nebulaFilter(`cc-dustHi-${seed}`,  seed + 3,  "0.018 0.045", 3, 1.00, 0.80, 0.55, 0.55)}
      ${nebulaFilter(`cc-dustLo-${seed}`,  seed + 5,  "0.002 0.006", 4, 0.55, 0.20, 0.10, 0.7)}
      ${nebulaFilter(`cc-blue-${seed}`,    seed + 11, "0.004 0.010", 3, 0.55, 0.78, 1.00, 0.45)}
      ${warpFilter(`cc-warp-${seed}`, seed + 17, "0.005 0.011", 180)}

      <linearGradient id="cc-edge-${seed}" x1="0" x2="0" y1="0" y2="${h}" gradientUnits="userSpaceOnUse">
        <stop offset="0"           stop-color="black"/>
        <stop offset="${fadeStart}" stop-color="black"/>
        <stop offset="${fadeEnd}"   stop-color="white"/>
        <stop offset="1"           stop-color="white"/>
      </linearGradient>

      <mask id="cc-mask-${seed}" maskUnits="userSpaceOnUse" x="-300" y="-300" width="${w + 600}" height="${h + 600}">
        <rect x="-300" y="-300" width="${w + 600}" height="${h + 600}" fill="url(#cc-edge-${seed})" filter="url(#cc-warp-${seed})"/>
      </mask>

      <radialGradient id="cc-glow-${seed}" cx="48%" cy="56%" r="55%">
        <stop offset="0"   stop-color="#ffd9a8" stop-opacity="0.45"/>
        <stop offset="0.4" stop-color="#ff9555" stop-opacity="0.18"/>
        <stop offset="1"   stop-color="#ff8a4a" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="cc-glow2-${seed}" cx="78%" cy="42%" r="35%">
        <stop offset="0"   stop-color="#fff5d8" stop-opacity="0.18"/>
        <stop offset="1"   stop-color="#fff5d8" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <rect width="${w}" height="${h}" fill="url(#cc-sky-${seed})"/>

    <!-- diffuse blue gas drifting in the upper sky -->
    <rect width="${w}" height="${h}" filter="url(#cc-blue-${seed})" opacity="0.32"
          mask="url(#cc-mask-${seed})" style="mask-mode: luminance; transform: scaleY(-1); transform-origin: center;"/>
    <rect width="${w}" height="${h}" filter="url(#cc-blue-${seed})" opacity="0.18"/>

    <!-- background star field -->
    ${stars(rng, w, h, 380, { yMax: horY + 60, seed })}

    <!-- backlight glow blooming off the cliff face -->
    <rect width="${w}" height="${h}" fill="url(#cc-glow-${seed})"/>
    <rect width="${w}" height="${h}" fill="url(#cc-glow2-${seed})"/>

    <!-- cliff dust — irregular soft top edge from displacement-warp mask -->
    <g mask="url(#cc-mask-${seed})">
      <rect width="${w}" height="${h}" filter="url(#cc-dustLo-${seed})" opacity="0.85"/>
      <rect width="${w}" height="${h}" filter="url(#cc-dust-${seed})"   opacity="0.85"/>
      <rect width="${w}" height="${h}" filter="url(#cc-dustHi-${seed})" opacity="0.55"
            style="mix-blend-mode: screen;"/>
    </g>

    <!-- a sprinkling of foreground stars within the dust -->
    ${stars(rng, w, h, 60, { yMin: horY + 20, seed })}

    <!-- newborn stars piercing the dust -->
    ${heroStars(rng, w, h, 4, { yMax: horY - 10, seed })}
    ${heroStars(rng, w, h, 2, { yMin: horY + 40, yMax: h - 80, seed })}
  </svg>`;
}

// ── 2. Deep Field ─────────────────────────────────────────────────────────────

export function bgDeepField(w: number, h: number, seed: number = 3): string {
  const rng = mulberry32(seed * 9973);
  const palette = [
    { core: "#ffd2a3", shell: "#7a3a18" },
    { core: "#c9b3ff", shell: "#3d2766" },
    { core: "#a3d6ff", shell: "#1f3d66" },
    { core: "#ffe7a3", shell: "#5a3a18" },
    { core: "#ffb3a3", shell: "#5a1f1f" },
    { core: "#fff0d0", shell: "#3a2a14" },
  ];

  let galaxies = "";
  let galaxyDefs = "";
  const galCount = 80;
  for (let i = 0; i < galCount; i++) {
    const cx = rng() * w,
      cy = rng() * h;
    const sizeRoll = Math.pow(rng(), 2.2);
    const rx = 4 + sizeRoll * 30;
    const ry = rx * (0.18 + rng() * 0.55);
    const rot = rng() * 180;
    const p = palette[Math.floor(rng() * palette.length)];
    const op = (0.30 + rng() * 0.55).toFixed(2);
    const id = `gx-${seed}-${i}`;
    galaxyDefs += `
      <radialGradient id="${id}" cx="50%" cy="50%" r="50%">
        <stop offset="0"    stop-color="${p.core}" stop-opacity="${op}"/>
        <stop offset="0.35" stop-color="${p.core}" stop-opacity="${(parseFloat(op) * 0.5).toFixed(2)}"/>
        <stop offset="0.7"  stop-color="${p.shell}" stop-opacity="${(parseFloat(op) * 0.25).toFixed(2)}"/>
        <stop offset="1"    stop-color="${p.shell}" stop-opacity="0"/>
      </radialGradient>`;
    galaxies += `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}"
                          rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"
                          fill="url(#${id})"
                          transform="rotate(${rot.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`;
    // Brighter dot at galactic core for the larger ones — soft-edged via the bloom gradient.
    if (rx > 12) {
      const coreR = (rx * 0.18).toFixed(2);
      galaxies += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${coreR}"
                           fill="url(#bloom-${seed})" opacity="${(parseFloat(op) * 0.85).toFixed(2)}"/>`;
    }
  }

  return `
  <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <defs>
      ${commonDefs(seed)}
      <radialGradient id="df-bg-${seed}" cx="50%" cy="50%" r="80%">
        <stop offset="0"   stop-color="#0b0f22"/>
        <stop offset="0.7" stop-color="#04060f"/>
        <stop offset="1"   stop-color="#01020a"/>
      </radialGradient>
      ${galaxyDefs}
      ${nebulaFilter(`df-mist-${seed}`, seed, "0.003 0.008", 4, 0.5, 0.55, 0.85, 0.4)}
    </defs>

    <rect width="${w}" height="${h}" fill="url(#df-bg-${seed})"/>
    <rect width="${w}" height="${h}" filter="url(#df-mist-${seed})" opacity="0.10"/>

    ${stars(rng, w, h, 480, { seed, yMin: 0, yMax: h })}
    ${galaxies}
    ${heroStars(rng, w, h, 4, { seed })}
  </svg>`;
}

// ── 3. Diffraction (quiet sky with JWST hero stars) ──────────────────────────
//
// Dark blue radial gradient + 320-star background field + 4 hero stars with
// JWST-style 6-spike diffraction patterns. Originally drafted as a face-on
// spiral galaxy, but the intended arm/core composition wasn't loved so the
// slot was simplified to lean into the JWST hero-star aesthetic instead.

export function bgDiffraction(w: number, h: number, seed: number = 4): string {
  const rng = mulberry32(seed * 9973);
  return `
  <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <defs>
      ${commonDefs(seed)}
      <radialGradient id="dif-bg-${seed}" cx="50%" cy="50%" r="80%">
        <stop offset="0" stop-color="#0d1228"/>
        <stop offset="1" stop-color="#02030a"/>
      </radialGradient>
    </defs>

    <rect width="${w}" height="${h}" fill="url(#dif-bg-${seed})"/>
    ${stars(rng, w, h, 320, { seed })}
    ${heroStars(rng, w, h, 4, { seed })}
  </svg>`;
}

// ── 4. Stellar Nursery (Tarantula-like) ──────────────────────────────────────

export function bgNursery(w: number, h: number, seed: number = 6): string {
  const rng = mulberry32(seed * 9973);
  return `
  <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <defs>
      ${commonDefs(seed)}
      <radialGradient id="ns-bg-${seed}" cx="50%" cy="50%" r="80%">
        <stop offset="0"   stop-color="#180d22"/>
        <stop offset="1"   stop-color="#04020a"/>
      </radialGradient>
      <radialGradient id="ns-cloudA-${seed}" cx="38%" cy="42%" r="48%">
        <stop offset="0"   stop-color="#ffb0c5" stop-opacity="0.65"/>
        <stop offset="0.5" stop-color="#c44d7a" stop-opacity="0.35"/>
        <stop offset="1"   stop-color="#3a0e2a" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="ns-cloudB-${seed}" cx="65%" cy="60%" r="42%">
        <stop offset="0"   stop-color="#9bd0ff" stop-opacity="0.55"/>
        <stop offset="0.5" stop-color="#3a6ec9" stop-opacity="0.3"/>
        <stop offset="1"   stop-color="#0e1f3a" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="ns-cluster-${seed}" cx="50%" cy="50%" r="50%">
        <stop offset="0"   stop-color="#ffffff" stop-opacity="0.65"/>
        <stop offset="0.4" stop-color="#fff2a8" stop-opacity="0.35"/>
        <stop offset="1"   stop-color="#fff2a8" stop-opacity="0"/>
      </radialGradient>
      ${nebulaFilter(`ns-pink-${seed}`, seed,     "0.008 0.020", 4, 1.00, 0.55, 0.70, 0.85)}
      ${nebulaFilter(`ns-blue-${seed}`, seed + 5, "0.007 0.018", 4, 0.50, 0.70, 1.00, 0.7)}
      ${nebulaFilter(`ns-fine-${seed}`, seed + 9, "0.025 0.05",  2, 0.95, 0.70, 0.85, 0.55)}

      <mask id="ns-pinkmask-${seed}">
        <rect width="${w}" height="${h}" fill="url(#ns-cloudA-${seed})"/>
      </mask>
      <mask id="ns-bluemask-${seed}">
        <rect width="${w}" height="${h}" fill="url(#ns-cloudB-${seed})"/>
      </mask>
    </defs>

    <rect width="${w}" height="${h}" fill="url(#ns-bg-${seed})"/>

    <rect width="${w}" height="${h}" fill="url(#ns-cloudA-${seed})"/>
    <rect width="${w}" height="${h}" filter="url(#ns-pink-${seed})"
          mask="url(#ns-pinkmask-${seed})" opacity="0.55" style="mix-blend-mode: screen;"/>

    <rect width="${w}" height="${h}" fill="url(#ns-cloudB-${seed})"/>
    <rect width="${w}" height="${h}" filter="url(#ns-blue-${seed})"
          mask="url(#ns-bluemask-${seed})" opacity="0.5" style="mix-blend-mode: screen;"/>

    ${stars(rng, w, h, 520, { seed })}
    <ellipse cx="${w * 0.42}" cy="${h * 0.45}" rx="180" ry="120" fill="url(#ns-cluster-${seed})"
             filter="url(#medblur-${seed})"/>
    ${heroStars(rng, w, h, 8, { seed })}
  </svg>`;
}

// ── 5. Galactic Wisps ────────────────────────────────────────────────────────

export function bgWisps(w: number, h: number, seed: number = 7): string {
  const rng = mulberry32(seed * 9973);
  return `
  <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <defs>
      ${commonDefs(seed)}
      <linearGradient id="ws-bg-${seed}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0"   stop-color="#06081a"/>
        <stop offset="0.5" stop-color="#0d1f2e"/>
        <stop offset="1"   stop-color="#04060f"/>
      </linearGradient>
      <linearGradient id="ws-band-${seed}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0"   stop-color="#5edcc4" stop-opacity="0"/>
        <stop offset="0.45" stop-color="#5edcc4" stop-opacity="0.5"/>
        <stop offset="0.6" stop-color="#9b6cff" stop-opacity="0.45"/>
        <stop offset="1"   stop-color="#9b6cff" stop-opacity="0"/>
      </linearGradient>
      ${nebulaFilter(`ws-tex-${seed}`,  seed,      "0.003 0.018", 4, 0.50, 0.85, 0.85, 0.7)}
      ${nebulaFilter(`ws-tex2-${seed}`, seed + 11, "0.003 0.014", 3, 0.70, 0.55, 1.00, 0.7)}
      ${warpFilter(`ws-warp-${seed}`,   seed + 7,  "0.002 0.006", 80)}

      <mask id="ws-mask-${seed}">
        <rect width="${w}" height="${h}" fill="url(#ws-band-${seed})" filter="url(#ws-warp-${seed})"/>
      </mask>
    </defs>

    <rect width="${w}" height="${h}" fill="url(#ws-bg-${seed})"/>
    ${stars(rng, w, h, 380, { seed })}
    <g mask="url(#ws-mask-${seed})" style="mix-blend-mode: screen;">
      <rect width="${w}" height="${h}" filter="url(#ws-tex-${seed})" opacity="0.7"/>
      <rect width="${w}" height="${h}" filter="url(#ws-tex2-${seed})" opacity="0.55" transform="translate(40 -20)"/>
    </g>
    ${heroStars(rng, w, h, 6, { seed })}
  </svg>`;
}

// ── 6. Twilight Cliffs (cooler-palette horizon variant) ──────────────────────

export function bgTwilight(w: number, h: number, seed: number = 8): string {
  const rng = mulberry32(seed * 9973);
  const horY = h * 0.55;
  const fadeStart = (horY / h - 0.05).toFixed(3);
  const fadeEnd = (horY / h + 0.20).toFixed(3);

  return `
  <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <defs>
      ${commonDefs(seed)}

      <linearGradient id="tw-sky-${seed}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0"   stop-color="#040618"/>
        <stop offset="0.55" stop-color="#1a1d4a"/>
        <stop offset="1"   stop-color="#3a2e6a"/>
      </linearGradient>

      ${nebulaFilter(`tw-dust-${seed}`,   seed,     "0.005 0.014", 5, 0.55, 0.50, 0.90, 0.95)}
      ${nebulaFilter(`tw-dustHi-${seed}`, seed + 3, "0.018 0.04",  3, 0.78, 0.72, 1.00, 0.55)}
      ${nebulaFilter(`tw-dustLo-${seed}`, seed + 5, "0.002 0.006", 4, 0.20, 0.18, 0.45, 0.7)}
      ${nebulaFilter(`tw-faintGas-${seed}`, seed + 11, "0.004 0.010", 3, 0.85, 0.70, 1.00, 0.4)}
      ${warpFilter(`tw-warp-${seed}`, seed + 17, "0.005 0.012", 200)}

      <linearGradient id="tw-edge-${seed}" x1="0" x2="0" y1="0" y2="${h}" gradientUnits="userSpaceOnUse">
        <stop offset="0"           stop-color="black"/>
        <stop offset="${fadeStart}" stop-color="black"/>
        <stop offset="${fadeEnd}"   stop-color="white"/>
        <stop offset="1"           stop-color="white"/>
      </linearGradient>
      <mask id="tw-mask-${seed}" maskUnits="userSpaceOnUse" x="-300" y="-300" width="${w + 600}" height="${h + 600}">
        <rect x="-300" y="-300" width="${w + 600}" height="${h + 600}" fill="url(#tw-edge-${seed})" filter="url(#tw-warp-${seed})"/>
      </mask>

      <radialGradient id="tw-glow-${seed}" cx="55%" cy="58%" r="55%">
        <stop offset="0"   stop-color="#c9a3ff" stop-opacity="0.40"/>
        <stop offset="0.5" stop-color="#7a5ad6" stop-opacity="0.16"/>
        <stop offset="1"   stop-color="#7a5ad6" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <rect width="${w}" height="${h}" fill="url(#tw-sky-${seed})"/>
    <rect width="${w}" height="${h}" filter="url(#tw-faintGas-${seed})" opacity="0.22"/>

    ${stars(rng, w, h, 380, { yMax: horY + 50, seed })}

    <rect width="${w}" height="${h}" fill="url(#tw-glow-${seed})"/>

    <g mask="url(#tw-mask-${seed})">
      <rect width="${w}" height="${h}" filter="url(#tw-dustLo-${seed})" opacity="0.85"/>
      <rect width="${w}" height="${h}" filter="url(#tw-dust-${seed})"   opacity="0.85"/>
      <rect width="${w}" height="${h}" filter="url(#tw-dustHi-${seed})" opacity="0.5"
            style="mix-blend-mode: screen;"/>
    </g>

    ${stars(rng, w, h, 60, { yMin: horY + 20, seed })}
    ${heroStars(rng, w, h, 5, { yMax: horY - 10, seed })}
  </svg>`;
}

// ── 7. Carina Ridges (Cosmic Cliffs / weic2205a homage) ──────────────────────

export function bgCarinaRidges(w: number, h: number, seed: number = 9): string {
  const rng = mulberry32(seed * 9973);
  const horY = h * 0.40; // ridgeline sits low — cliffs dominate the bottom 60%
  const fadeStart = (horY / h - 0.02).toFixed(3);
  const fadeEnd = (horY / h + 0.22).toFixed(3);

  return `
  <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <defs>
      ${commonDefs(seed)}

      <!-- sky: ink black at top → cobalt → teal-cyan glow near the ridge → warm rim -->
      <linearGradient id="cr-sky-${seed}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0"    stop-color="#02030a"/>
        <stop offset="0.30" stop-color="#0a1f3a"/>
        <stop offset="0.55" stop-color="#1d5a86"/>
        <stop offset="0.78" stop-color="#3a8fb8"/>
        <stop offset="0.92" stop-color="#7a5a3a"/>
        <stop offset="1"    stop-color="#3a1a10"/>
      </linearGradient>

      <!-- saturated rust/ember nebular dust palette -->
      ${nebulaFilter(`cr-rust-${seed}`,    seed,      "0.005 0.013", 5, 0.92, 0.48, 0.20, 0.95)}
      ${nebulaFilter(`cr-ember-${seed}`,   seed + 3,  "0.020 0.050", 3, 1.00, 0.74, 0.40, 0.55)}
      ${nebulaFilter(`cr-deep-${seed}`,    seed + 5,  "0.002 0.005", 4, 0.40, 0.14, 0.06, 0.78)}
      ${nebulaFilter(`cr-cavity-${seed}`,  seed + 8,  "0.003 0.009", 4, 0.10, 0.04, 0.02, 0.88)}
      ${nebulaFilter(`cr-cyan-${seed}`,    seed + 11, "0.004 0.010", 3, 0.45, 0.85, 1.00, 0.55)}
      ${nebulaFilter(`cr-cyanHi-${seed}`,  seed + 13, "0.012 0.030", 3, 0.65, 0.95, 1.00, 0.45)}
      ${warpFilter(`cr-warp-${seed}`,      seed + 17, "0.006 0.013", 220)}
      ${warpFilter(`cr-warpFine-${seed}`,  seed + 23, "0.014 0.030",  60)}

      <!-- ragged ridgeline mask (oversized so warp can sample painted gradient near edges) -->
      <linearGradient id="cr-edge-${seed}" x1="0" x2="0" y1="0" y2="${h}" gradientUnits="userSpaceOnUse">
        <stop offset="0"           stop-color="black"/>
        <stop offset="${fadeStart}" stop-color="black"/>
        <stop offset="${fadeEnd}"   stop-color="white"/>
        <stop offset="1"           stop-color="white"/>
      </linearGradient>
      <mask id="cr-mask-${seed}" maskUnits="userSpaceOnUse" x="-300" y="-300" width="${w + 600}" height="${h + 600}">
        <rect x="-300" y="-300" width="${w + 600}" height="${h + 600}"
              fill="url(#cr-edge-${seed})" filter="url(#cr-warp-${seed})"/>
      </mask>

      <!-- thin rim-light mask: the band right around the ridge silhouette -->
      <linearGradient id="cr-rim-${seed}" x1="0" x2="0" y1="0" y2="${h}" gradientUnits="userSpaceOnUse">
        <stop offset="${(horY / h - 0.04).toFixed(3)}" stop-color="black"/>
        <stop offset="${(horY / h + 0.01).toFixed(3)}" stop-color="white"/>
        <stop offset="${(horY / h + 0.06).toFixed(3)}" stop-color="black"/>
        <stop offset="1"                                stop-color="black"/>
      </linearGradient>
      <mask id="cr-rimmask-${seed}" maskUnits="userSpaceOnUse" x="-300" y="-300" width="${w + 600}" height="${h + 600}">
        <rect x="-300" y="-300" width="${w + 600}" height="${h + 600}"
              fill="url(#cr-rim-${seed})" filter="url(#cr-warp-${seed})"/>
      </mask>

      <!-- inverted mask for sky-side blue gas: white above the ridge, black below -->
      <linearGradient id="cr-sky-edge-${seed}" x1="0" x2="0" y1="0" y2="${h}" gradientUnits="userSpaceOnUse">
        <stop offset="0"                                 stop-color="white"/>
        <stop offset="${(horY / h - 0.04).toFixed(3)}"   stop-color="white"/>
        <stop offset="${(horY / h + 0.10).toFixed(3)}"   stop-color="black"/>
        <stop offset="1"                                 stop-color="black"/>
      </linearGradient>
      <mask id="cr-skymask-${seed}" maskUnits="userSpaceOnUse" x="-300" y="-300" width="${w + 600}" height="${h + 600}">
        <rect x="-300" y="-300" width="${w + 600}" height="${h + 600}"
              fill="url(#cr-sky-edge-${seed})" filter="url(#cr-warpFine-${seed})"/>
      </mask>

      <!-- blooms behind the ridge — backlight where hot stars ionise the gas -->
      <radialGradient id="cr-back-${seed}" cx="42%" cy="42%" r="55%">
        <stop offset="0"    stop-color="#a6e6ff" stop-opacity="0.55"/>
        <stop offset="0.45" stop-color="#3a8fc4" stop-opacity="0.22"/>
        <stop offset="1"    stop-color="#143052" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="cr-back2-${seed}" cx="78%" cy="36%" r="40%">
        <stop offset="0"    stop-color="#cdf2ff" stop-opacity="0.35"/>
        <stop offset="1"    stop-color="#cdf2ff" stop-opacity="0"/>
      </radialGradient>

      <!-- warm glow rising from the cliff face -->
      <radialGradient id="cr-emberGlow-${seed}" cx="50%" cy="58%" r="60%">
        <stop offset="0"    stop-color="#ffd0a0" stop-opacity="0.40"/>
        <stop offset="0.45" stop-color="#ff8a3a" stop-opacity="0.18"/>
        <stop offset="1"    stop-color="#ff7a3a" stop-opacity="0"/>
      </radialGradient>

      <!-- rim-light tint -->
      <linearGradient id="cr-rimtint-${seed}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#ffe2b0"/>
        <stop offset="1" stop-color="#ff9a55"/>
      </linearGradient>
    </defs>

    <!-- base sky -->
    <rect width="${w}" height="${h}" fill="url(#cr-sky-${seed})"/>

    <!-- backlight blooms behind the ridge -->
    <rect width="${w}" height="${h}" fill="url(#cr-back-${seed})"/>
    <rect width="${w}" height="${h}" fill="url(#cr-back2-${seed})"/>

    <!-- diffuse cyan gas drifting in the upper sky, masked off below the ridge -->
    <g mask="url(#cr-skymask-${seed})" style="mix-blend-mode: screen;">
      <rect width="${w}" height="${h}" filter="url(#cr-cyan-${seed})"   opacity="0.55"/>
      <rect x="-60" y="10" width="${w}" height="${h}" filter="url(#cr-cyanHi-${seed})" opacity="0.40" transform="translate(60 -10)"/>
    </g>

    <!-- background star field, kept above the ridge -->
    ${stars(rng, w, h, 520, { yMax: horY + 50, seed })}

    <!-- warm aerial glow blooming up off the cliff face -->
    <rect width="${w}" height="${h}" fill="url(#cr-emberGlow-${seed})"/>

    <!-- the cliff itself: stacked dust layers cut by the ragged ridge mask -->
    <g mask="url(#cr-mask-${seed})">
      <rect width="${w}" height="${h}" filter="url(#cr-deep-${seed})"  opacity="0.95"/>
      <rect width="${w}" height="${h}" filter="url(#cr-rust-${seed})"  opacity="0.92"/>
      <rect width="${w}" height="${h}" filter="url(#cr-ember-${seed})" opacity="0.6"
            style="mix-blend-mode: screen;"/>
      <!-- dark cavities inside the cliff -->
      <rect width="${w}" height="${h}" filter="url(#cr-cavity-${seed})" opacity="0.55"
            style="mix-blend-mode: multiply;"/>
    </g>

    <!-- rim light: warm gradient banded along the silhouette -->
    <g mask="url(#cr-rimmask-${seed})" style="mix-blend-mode: screen;">
      <rect width="${w}" height="${h}" fill="url(#cr-rimtint-${seed})" opacity="0.55"/>
      <rect width="${w}" height="${h}" filter="url(#cr-ember-${seed})" opacity="0.7"/>
    </g>

    <!-- foreground stars peppered through the dust -->
    ${stars(rng, w, h, 90, { yMin: horY + 30, seed })}

    <!-- bright protostars: a cluster above the ridge plus a couple piercing the dust -->
    ${heroStars(rng, w, h, 6, { yMax: horY - 20, seed })}
    ${heroStars(rng, w, h, 2, { yMin: horY + 60, yMax: h - 100, seed })}
  </svg>`;
}
