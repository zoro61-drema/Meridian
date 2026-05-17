/* marine-variants.jsx
 *
 * Three Marine direction variants, redesigned per critique:
 *
 *   - Accent tints the WHOLE armor (V0..V4 ramp), not just visor.
 *   - Anatomical proportions: head + neck + shoulders + tapered torso
 *     + visible legs + boots. Not boxy/robotic.
 *   - View is ~3/4 from above-and-front. Marine faces screen-down (S):
 *     we see the front of the visor, the chest, the front of the legs.
 *
 *   A — Standard issue   (balanced bulk, full visor, slung rifle)
 *   B — Veteran scout    (leaner, split visor slits, lighter plates, carbine)
 *   C — Heavy trooper    (broader frame, brow ridge, drum-fed weapon)
 *
 * Char codes (see sprite-engine.jsx):
 *   1..5  accent armor ramp (1 darkest → 5 brightest)
 *   i     visor inner dark    I  visor glint
 *   g/G/M weapon              m  muzzle hole
 *   b/P   boot / sole         u  under-suit  k  strap  r  rivet
 *   z/y/w ground shadow rings
 */

// Row-builder: returns a 48-char row, default '.', with one or more
// inserts of the form [colStart, "string"].
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

/* ===== Variant A — Standard issue ===== */
//
// Width plan (cols, S = facing screen-down):
//   helmet         cols 19..28 (10 wide), rows 5..13
//   neck           cols 22..25, row 14
//   pauldrons      widest row 16 cols 14..33 (20 wide)
//   chest plate    rows 17..24, cols 18..29 (12 wide, tapering)
//   belt           rows 25..26, cols 19..28 (10 wide)
//   hips           rows 27..29, cols 18..29
//   legs           rows 30..37, each 4 wide
//                    left  cols 19..22
//                    right cols 25..28
//                    gap   cols 23..24
//   boots          rows 38..42, each 5 wide (flared outward by 1)
//   shadow         rows 43..45
//
// Rifle (slung at right hip, barrel forward, doesn't cross chest accent):
//   stock          col 30, rows 20..23
//   receiver       cols 28..30, rows 22..25
//   barrel         cols 28..29, rows 25..30
//   muzzle         cols 28..29, row 30
const VARIANT_A = [
  R(),                                                                // 00
  R(),                                                                // 01
  R(),                                                                // 02
  R(),                                                                // 03
  R(),                                                                // 04
  R([21, "445544"]),                                                  // 05 helmet top, rounded (was 2-wide apex)
  R([20, "44555544"]),                                                // 06
  R([19, "4555555443"]),                                              // 07 full width
  R([19, "4555555443"]),                                              // 08 flat-domed top
  R([19, "4555555443"]),                                              // 09
  R([19, "4555555432"]),                                              // 10 lower curve (light from upper-left)
  R([19, "3vvvvvvvv3"]),                                              // 11 visor row 1 (accent, brighter top)
  R([19, "3VVVVVVVV3"]),                                              // 12 visor row 2 (accent, mid)
  R([19, "3333333333"]),                                              // 13 chin / lower helmet
  R([21, "33uuuu33"]),                                                // 14 neck (under-suit dark) flanked by shoulder ridges
  R([17, "44444"], [22, "uuuu"], [26, "44444"]),                       // 15 shoulder tops + neck gap
  R([14, "5V4443"], [20, "34555543"], [28, "344V32"]),                 // 16 pauldrons WIDEST + shoulder accent caps
  R([14, "454433"], [20, "44544443"], [28, "334432"]),                 // 17 pauldron mid
  R([15, "44443"], [20, "44544443"], [28, "44432"]),                   // 18 pauldron narrows, chest visible
  R([16, "4433"], [20, "44544443"], [28, "3443"]),                     // 19 pauldron narrows further
  R([15, "33"], [17, "443"], [20, "44544443"], [28, "GM3"], [31, "33"]),     // 20 chest + arms emerge below pauldrons
  R([15, "33"], [17, "433"], [20, "44552443"], [28, "GGM"], [31, "33"]),     // 21 chest mid w/ darker plate seam + arms
  R([15, "33"], [17, "433"], [20, "44VVVV43"], [28, "GGg"], [31, "32"]),     // 22 chest stripe + arms (right hand transitions to rifle)
  R([15, "33"], [18, "33"], [20, "44544443"], [28, "GGg"]),                  // 23 left arm continues, right hand on rifle
  R([15, "33"], [18, "33"], [20, "44544443"], [28, "GGg"]),                  // 24 left arm continues
  R([15, "33"], [19, "3"], [20, "kkkkukkkk"], [29, "3"]),                    // 25 left forearm at hip + belt
  R([19, "33kkukkku33"]),                                              // 26 belt
  R([18, "4433444433"], [28, "GG"]),                                   // 27 hip armor top, barrel begins
  R([18, "4433444433"], [28, "Gg"]),                                   // 28 hips
  R([18, "33433433"], [28, "mg"]),                                     // 29 hip lower + muzzle
  R([19, "3343"], [25, "3433"]),                                       // 30 legs begin (4-wide each, 2-wide gap)
  R([19, "3343"], [25, "3433"]),                                       // 31
  R([19, "3343"], [25, "3433"]),                                       // 32
  R([19, "2343"], [25, "3432"]),                                       // 33 knee shadow
  R([19, "3343"], [25, "3433"]),                                       // 34
  R([19, "3343"], [25, "3433"]),                                       // 35
  R([19, "3343"], [25, "3433"]),                                       // 36
  R([19, "2233"], [25, "3322"]),                                       // 37 ankle shadow
  R([18, "bbbbbb"], [24, "bbbbbb"]),                                   // 38 boot tops, flared
  R([18, "bPPPPb"], [24, "bPPPPb"]),                                   // 39
  R([17, "bPPPPPb"], [24, "bPPPPPb"]),                                 // 40 boots widest
  R([17, "PPPPPPP"], [24, "PPPPPPP"]),                                 // 41 boot soles
  R(),                                                                // 42
  R(),                                                                // 43
  R(),                                                                // 44
  R(),                                                                // 45
  R(),                                                                // 46
  R(),                                                                // 47
];

/* ===== Variant B — Veteran scout ===== */
//
// Leaner: narrower shoulders, smaller pauldrons, split visor slits,
// X-strap rig instead of solid chest plate, longer carbine.
const VARIANT_B = [
  R(),                                                                // 00
  R(),                                                                // 01
  R(),                                                                // 02
  R(),                                                                // 03
  R(),                                                                // 04
  R([21, "445544"]),                                                  // 05 rounded apex (was pointy)
  R([20, "44555544"]),                                                // 06
  R([19, "4555555443"]),                                              // 07 full width
  R([19, "4555555443"]),                                              // 08 flat-domed top
  R([19, "4555555443"]),                                              // 09
  R([19, "3vvv33vvv3"]),                                              // 10 twin-slit visor (accent, brighter top)
  R([19, "3VVV33VVV3"]),                                              // 11 twin-slit visor (accent, mid)
  R([20, "33333333"]),                                                // 12
  R([19, "u333333u4"]),                                               // 13 chin + scout antenna sprout right
  R([21, "33uu33"], [29, "g"]),                                       // 14 neck + antenna extends
  R([17, "33344uu44333"], [29, "g"]),                                 // 15 shoulder ridge (smaller), antenna tip
  R([16, "4443"], [20, "34554433"], [29, "344"]),                     // 16 pauldron + chest (narrower than A)
  R([16, "4443"], [20, "33444333"], [29, "443"]),                     // 17
  R([17, "443"], [20, "42455243"], [28, "3443"]),                    // 18 X-strap diagonal (dark seam pixels)
  R([17, "443"], [20, "44255243"], [28, "3443"]),                     // 19 X-strap row 2
  R([16, "32"], [17, "443"], [20, "42424233"], [28, "GM3"], [31, "23"]),     // 20 carbine receiver + arms emerge
  R([16, "33"], [18, "43"], [20, "44252443"], [28, "GMg"], [31, "33"]),      // 21 X-strap crossover + arms
  R([16, "33"], [18, "43"], [20, "44544243"], [28, "Ggg"], [31, "32"]),      // 22 buckle + arms (right arm to carbine)
  R([16, "33"], [18, "33"], [20, "44544443"], [28, "Ggg"]),                  // 23 left arm continues
  R([18, "33"], [20, "42524243"], [28, "Gmg"]),                       // 24 muzzle near
  R([19, "k"], [20, "kkkVVkkk"], [28, "Xg"]),                         // 25 belt + accent buckle
  R([19, "33"], [20, "33444433"], [29, "3"]),                         // 26 belt under
  R([19, "3433"], [26, "3433"]),                                      // 27 hips + leg start
  R([19, "3433"], [26, "3433"]),                                      // 28
  R([19, "3343"], [26, "3343"]),                                      // 29
  R([19, "3343"], [26, "3343"]),                                      // 30
  R([19, "2343"], [26, "3432"]),                                      // 31 knee
  R([19, "3343"], [26, "3343"]),                                      // 32
  R([19, "3343"], [26, "3343"]),                                      // 33
  R([19, "3343"], [26, "3343"]),                                      // 34
  R([19, "2233"], [26, "3322"]),                                      // 35 ankle
  R([18, "bbbbb"], [25, "bbbbb"]),                                    // 36 boot tops
  R([18, "bPPPb"], [25, "bPPPb"]),                                    // 37
  R([18, "PPPPP"], [25, "PPPPP"]),                                    // 38 soles
  R(),                                                                // 39
  R(),                                                                // 40
  R(),                                                                // 41
  R(),                                                                // 42
  R(),                                                                // 43
  R(),                                                                // 44
  R(),                                                                // 45
  R(),                                                                // 46
  R(),                                                                // 47
];

/* ===== Variant C — Heavy trooper ===== */
//
// Broader: wider pauldrons, brow ridge above visor, thicker torso,
// drum-fed weapon, larger boots.
const VARIANT_C = [
  R(),                                                                // 00
  R(),                                                                // 01
  R(),                                                                // 02
  R(),                                                                // 03
  R([20, "44555544"]),                                                // 04 rounded apex (was 4-wide pointy)
  R([19, "4455555543"]),                                              // 05
  R([18, "445555555543"]),                                            // 06 full width
  R([18, "455555555443"]),                                            // 07 flat-domed top
  R([18, "455555555443"]),                                            // 08
  R([18, "445555555543"]),                                            // 09
  R([18, "33gggggggg33"]),                                            // 10 brow ridge (dark)
  R([18, "33vvvvvvvv33"]),                                            // 11 visor row 1 (accent, brighter top)
  R([18, "33VVVVVVVV33"]),                                            // 12 visor row 2 (accent, mid)
  R([19, "3333333333"]),                                              // 13 chin (wider)
  R([20, "22uuuu22"]),                                                // 14 neck guard
  R([15, "44544444444445444"]),                                       // 15 wider shoulder
  R([13, "5444433"], [20, "34555543"], [27, "3344445"]),               // 16 pauldrons WIDEST (heavier)
  R([13, "4444433"], [20, "44555443"], [27, "3344444"]),               // 17
  R([12, "33"], [14, "443433"], [20, "42VvvV43"], [28, "334443"], [34, "33"]),    // 18 chest + reinforcement + arms emerge
  R([12, "33"], [14, "443433"], [20, "42VvvV43"], [28, "334443"], [34, "33"]),    // 19 arms continue
  R([13, "32"], [15, "44433"], [20, "GGGGGGGG"], [28, "33443"], [33, "23"]),       // 20 drum mag + arms taper inward toward grip
  R([13, "33"], [15, "44443"], [20, "MGGGGMM3"], [28, "3443"], [33, "33"]),        // 21 receiver + arms gripping
  R([15, "44443"], [20, "GGGGGGG3"], [28, "3443"]),                   // 22 receiver lower
  R([15, "4433"], [20, "GgGgGGGG"], [28, "3443"]),                    // 23
  R([16, "433"], [20, "3GGGG333"], [28, "3433"]),                     // 24 belt approach + barrel begins
  R([16, "43"], [20, "kGGGGukk"], [28, "3433"]),                      // 25 belt
  R([16, "33"], [20, "33GGGG33"], [28, "3333"]),                      // 26 hips
  R([17, "433343"], [25, "343334"]),                                  // 27 hip armor top
  R([18, "3343"], [25, "3433"]),                                      // 28 hips lower
  R([18, "3343"], [25, "3433"]),                                      // 29 legs begin
  R([18, "3343"], [25, "3433"]),                                      // 30
  R([18, "3343"], [25, "3433"]),                                      // 31
  R([18, "2343"], [25, "3432"]),                                      // 32 knee
  R([18, "3343"], [25, "3433"]),                                      // 33
  R([18, "3343"], [25, "3433"]),                                      // 34
  R([18, "2233"], [25, "3322"]),                                      // 35 ankle
  R([17, "bbbbbb"], [25, "bbbbbb"]),                                  // 36 boot tops (heavier, wider)
  R([17, "bPPPPb"], [25, "bPPPPb"]),                                  // 37
  R([16, "bPPPPPb"], [25, "bPPPPPb"]),                                // 38 boots flared
  R([16, "PPPPPPP"], [25, "PPPPPPP"]),                                // 39 soles
  R(),                                                                // 40
  R(),                                                                // 41
  R(),                                                                // 42
  R(),                                                                // 43
  R(),                                                                // 44
  R(),                                                                // 45
  R(),                                                                // 46
  R(),                                                                // 47
];

// ---------- Variant builders (validate + outline + shadow) ----------
function finalize(stencil, shadowOpts) {
  const g = newGrid();
  for (let y = 0; y < stencil.length; y++) {
    const row = stencil[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch !== "." && ch !== " ") set(g, x, y, ch);
    }
  }
  addOutline(g);
  if (shadowOpts) paintShadow(g, shadowOpts.cx, shadowOpts.cy, shadowOpts.rx, shadowOpts.ry);
  return g;
}

function buildVariantA() {
  validateStencil("Marine.A", VARIANT_A);
  return finalize(VARIANT_A, { cx: 23, cy: 44, rx: 11, ry: 2 });
}
function buildVariantB() {
  validateStencil("Marine.B", VARIANT_B);
  return finalize(VARIANT_B, { cx: 23, cy: 41, rx: 10, ry: 2 });
}
function buildVariantC() {
  validateStencil("Marine.C", VARIANT_C);
  return finalize(VARIANT_C, { cx: 23, cy: 42, rx: 12, ry: 2 });
}

const VARIANTS = {
  A: { id: "A", title: "Standard issue", subtitle: "Balanced bulk, full visor, slung rifle. The control sample.", build: buildVariantA },
  B: { id: "B", title: "Veteran scout",  subtitle: "Lean, segmented plates, twin-slit visor + X-strap rig, short carbine.", build: buildVariantB },
  C: { id: "C", title: "Heavy trooper",  subtitle: "Broad shoulders, brow ridge, drum-fed weapon, heavier boots.", build: buildVariantC },
};

Object.assign(window, { VARIANTS, buildVariantA, buildVariantB, buildVariantC });
