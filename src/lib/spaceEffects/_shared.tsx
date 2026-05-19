import { BACKGROUNDS, type BgCategory } from "@/lib/backgrounds/_registry";
import React from "react";

// ── Helpers ────────────────────────────────────────────────────────────────────

const SPACE_CATS: BgCategory[] = ["space", "jwst"];
export function isSpaceBg(bgId: string): boolean {
  return !!BACKGROUNDS.find((b) => b.id === bgId && SPACE_CATS.includes(b.category));
}

export const r = Math.random;
let _id = 0;
export const uid = () => _id++;

// ── Fire events (used by test buttons) ────────────────────────────────────────

export const EV_NOVA          = "m-fire-nova";
export const EV_BH            = "m-fire-bh";
export const EV_COMET         = "m-fire-comet";
export const EV_PULSAR        = "m-fire-pulsar";
export const EV_METEORS       = "m-fire-meteors";
export const EV_SHOOTING_STAR = "meridian-ss-fire";
export const EV_CLEAR         = "m-clear-all";
export const EV_ENABLED       = "m-effects-enabled";
/** Same event name used by the FX drawer to stay in sync with the overlay. */
export const SPACE_FX_TOGGLES_EVENT = "m-space-fx-kinds" as const;

const FX_KINDS_LS = "meridian-space-fx-kinds";

/** Background animation channels (auto-spawn + manual triggers respect these). */
export type SpaceEffectKind =
  | "shootingStars"
  | "comets"
  | "pulsars"
  | "meteors"
  | "blackHole"
  | "novas";

export const SPACE_EFFECT_KINDS: SpaceEffectKind[] = [
  "shootingStars",
  "comets",
  "pulsars",
  "meteors",
  "blackHole",
  "novas",
];

export const SPACE_FX_KIND_META: Record<
  SpaceEffectKind,
  { icon: string; short: string }
> = {
  shootingStars: { icon: "✦", short: "stars" },
  comets:        { icon: "☄", short: "comet" },
  pulsars:       { icon: "※", short: "supernova" },
  meteors:       { icon: "⁂", short: "meteors" },
  blackHole:     { icon: "◉", short: "black hole" },
  novas:         { icon: "※", short: "supernova" },
};

const DEFAULT_KIND_TOGGLES: Record<SpaceEffectKind, boolean> = {
  shootingStars: true,
  comets:        true,
  pulsars:       true,
  meteors:       true,
  blackHole:     true,
  novas:         true,
};

export function loadKindToggles(): Record<SpaceEffectKind, boolean> {
  try {
    const raw = localStorage.getItem(FX_KINDS_LS);
    if (!raw) return { ...DEFAULT_KIND_TOGGLES };
    const o = JSON.parse(raw) as Partial<Record<SpaceEffectKind, boolean>>;
    return { ...DEFAULT_KIND_TOGGLES, ...o };
  } catch {
    return { ...DEFAULT_KIND_TOGGLES };
  }
}

let kindTogglesCache = loadKindToggles();

export function getSpaceEffectKindToggles(): Record<SpaceEffectKind, boolean> {
  return { ...kindTogglesCache };
}

export function setSpaceEffectKindEnabled(kind: SpaceEffectKind, on: boolean) {
  if (kindTogglesCache[kind] === on) return;
  kindTogglesCache = { ...kindTogglesCache, [kind]: on };
  try {
    localStorage.setItem(FX_KINDS_LS, JSON.stringify(kindTogglesCache));
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(
    new CustomEvent(SPACE_FX_TOGGLES_EVENT, { detail: { ...kindTogglesCache } })
  );
}

export function toggleSpaceEffectKind(kind: SpaceEffectKind) {
  setSpaceEffectKindEnabled(kind, !kindTogglesCache[kind]);
}

export const fireSupernova    = () => window.dispatchEvent(new CustomEvent(EV_NOVA));
export const fireBlackHole    = () => window.dispatchEvent(new CustomEvent(EV_BH));
export const fireComet        = () => window.dispatchEvent(new CustomEvent(EV_COMET));
export const firePulsar       = () => window.dispatchEvent(new CustomEvent(EV_PULSAR));
export const fireMeteorShower = () => window.dispatchEvent(new CustomEvent(EV_METEORS));
export const fireShootingStar = () => window.dispatchEvent(new CustomEvent(EV_SHOOTING_STAR));
export const clearAllEffects  = () => window.dispatchEvent(new CustomEvent(EV_CLEAR));
export const setEffectsEnabled = (on: boolean) => window.dispatchEvent(new CustomEvent(EV_ENABLED, { detail: on }));

// ── CSS keyframe injection ─────────────────────────────────────────────────────

const KF_ID = "m-se-kf";
export function ensureKF() {
  if (document.getElementById(KF_ID)) return;
  const s = document.createElement("style");
  s.id = KF_ID;
  s.textContent = `
    /* ── Supernova ── */
    @keyframes m-nova-core {
      0%   { transform: scale(0.05); opacity: 1; filter: brightness(6) saturate(0.2); }
      12%  { transform: scale(1);    opacity: 1; filter: brightness(2.5) saturate(1); }
      50%  { transform: scale(2.5);  opacity: 0.5; }
      100% { transform: scale(5);    opacity: 0; }
    }
    @keyframes m-nova-ring1 {
      0%   { transform: scale(0.3);  opacity: 0.9; }
      100% { transform: scale(10);   opacity: 0; }
    }
    @keyframes m-nova-ring2 {
      0%   { transform: scale(0.5);  opacity: 0.7; }
      100% { transform: scale(16);   opacity: 0; }
    }
    @keyframes m-nova-flash {
      0%,100% { opacity: 0; }
      8%      { opacity: 1; }
      28%     { opacity: 0; }
    }
    /* ── Supernova Remnant Gas Cloud ──
       Fades in at full size while the blast is still dying out, holds briefly,
       then gravity collapses it inward to the size of the neutron star point.
       ease-in on the shrink makes the collapse accelerate like real gravity.
    */
    @keyframes m-nova-cloud-outer {
      0%   { transform: scale(1);     opacity: 0; }
      9%   { transform: scale(1.02);  opacity: 0.76; }
      18%  { transform: scale(1.02);  opacity: 0.76; }
      100% { transform: scale(0.015); opacity: 0; }
    }
    @keyframes m-nova-cloud-mid {
      0%   { transform: scale(0.92) rotate(-4deg); opacity: 0; }
      10%  { transform: scale(0.94) rotate(-4deg); opacity: 0.84; }
      18%  { transform: scale(0.94) rotate(-4deg); opacity: 0.84; }
      100% { transform: scale(0.015) rotate(3deg); opacity: 0; }
    }
    @keyframes m-nova-cloud-inner {
      0%   { transform: scale(0.78); opacity: 0; }
      11%  { transform: scale(0.80); opacity: 0.88; }
      18%  { transform: scale(0.80); opacity: 0.88; }
      100% { transform: scale(0.015); opacity: 0; }
    }
    @keyframes m-nova-filament {
      0%   { transform: scale(1.05); opacity: 0; }
      8%   { opacity: 0.62; }
      18%  { opacity: 0.62; }
      100% { transform: scale(0.015); opacity: 0; }
    }
    /* ── Black Hole ── */
    @keyframes m-bh-appear {
      from { opacity: 0; transform: scale(0.05); }
      to   { opacity: 1; transform: scale(1); }
    }
    @keyframes m-bh-vanish {
      from { opacity: 1; transform: scale(1); }
      to   { opacity: 0; transform: scale(0.05); }
    }
    @keyframes m-bh-disk-rot {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes m-bh-arch-pulse {
      0%,100% { opacity: 0.82; }
      50%     { opacity: 1; }
    }
    /* ── Pulsar ── */
    @keyframes m-pulsar-spin {
      0%      { transform: translate(-50%,-50%) rotate(0deg); animation-timing-function: ease-out; }
      12.5%   { transform: translate(-50%,-50%) rotate(26deg); animation-timing-function: ease-in; }
      25%     { transform: translate(-50%,-50%) rotate(0deg); animation-timing-function: ease-out; }
      37.5%   { transform: translate(-50%,-50%) rotate(-26deg); animation-timing-function: ease-in; }
      50%     { transform: translate(-50%,-50%) rotate(0deg); animation-timing-function: ease-out; }
      62.5%   { transform: translate(-50%,-50%) rotate(26deg); animation-timing-function: ease-in; }
      75%     { transform: translate(-50%,-50%) rotate(0deg); animation-timing-function: ease-out; }
      87.5%   { transform: translate(-50%,-50%) rotate(-26deg); animation-timing-function: ease-in; }
      100%    { transform: translate(-50%,-50%) rotate(0deg); }
    }
    @keyframes m-pulsar-core {
      0%,42%,58%,100% { opacity: 0.35; transform: translate(-50%,-50%) scale(0.8); box-shadow: 0 0 4px 2px rgba(160,210,255,0.35); }
      50%             { opacity: 1;    transform: translate(-50%,-50%) scale(1.5); box-shadow: 0 0 18px 8px rgba(160,210,255,0.9); }
    }
    @keyframes m-pulsar-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    /* ── Shooting Star ── */
    @keyframes meridian-ss {
      0%   { transform: translate(0,0); opacity: 0; }
      8%   { opacity: 1; }
      80%  { opacity: 0.8; }
      100% { transform: translate(var(--ss-tx),var(--ss-ty)); opacity: 0; }
    }
    /* ── Comet ── */
    @keyframes m-comet {
      0%   { transform: translate(0,0); opacity: 0; }
      6%   { opacity: 1; }
      88%  { opacity: 1; }
      100% { transform: translate(var(--cx-tx),var(--cx-ty)); opacity: 0; }
    }
    /* ── Meteor (shower) ── */
    @keyframes m-meteor {
      0%   { transform: translate(0,0); opacity: 0; }
      8%   { opacity: 1; }
      80%  { opacity: 0.9; }
      100% { transform: translate(var(--mt-tx),var(--mt-ty)); opacity: 0; }
    }
    @keyframes m-se-vanish {
      to { opacity: 0; scale: 0; }
    }
  `;
  document.head.appendChild(s);
}

