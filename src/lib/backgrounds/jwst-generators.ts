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


