import { useMemo, type CSSProperties } from "react";
import { W, H } from "./_shared";
import {
  bgCarinaRidges,
  bgCosmicCliffs,
  bgDeepField,
  bgDiffraction,
  bgNursery,
  bgTwilight,
  bgWisps,
} from "./jwst-generators";

// JWST backgrounds are produced by deterministic SVG-string generators
// (jwst-generators.ts) rather than as JSX trees, so each component here is a
// thin wrapper that runs the generator once via useMemo and injects the
// resulting markup. The wrapper div absolute-fills its parent and uses an
// arbitrary descendant selector to size the inner <svg> — the generator
// emits viewBox + preserveAspectRatio="xMidYMid slice" but no explicit
// width/height, so it relies on CSS for sizing.

type Generator = (w: number, h: number, seed?: number) => string;

const FILL_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
};

// Tailwind arbitrary-descendant selector to make the injected SVG fill the
// wrapper. We can't use a className constant the JIT compiler can scan, so
// the literal lives here at module scope as a hint to the JIT plugin.
const FILL_SVG_CLASSES =
  "absolute inset-0 [&>svg]:absolute [&>svg]:inset-0 [&>svg]:w-full [&>svg]:h-full [&>svg]:block";

function JWSTBackground({ generator, seed }: { generator: Generator; seed: number }) {
  const html = useMemo(() => generator(W, H, seed), [generator, seed]);
  return (
    <div
      className={FILL_SVG_CLASSES}
      style={FILL_STYLE}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// Per-design seeds match the registry the user authored alongside the
// generators — kept as named exports so each background remains an independent
// React component the registry can map by id.
export const JWSTCosmicCliffsBg = () => <JWSTBackground generator={bgCosmicCliffs} seed={1} />;
export const JWSTDeepFieldBg     = () => <JWSTBackground generator={bgDeepField}     seed={3} />;
export const JWSTDiffractionBg   = () => <JWSTBackground generator={bgDiffraction}   seed={4} />;
export const JWSTStellarNurseryBg= () => <JWSTBackground generator={bgNursery}       seed={6} />;
export const JWSTGalacticWispsBg = () => <JWSTBackground generator={bgWisps}         seed={7} />;
export const JWSTTwilightCliffsBg= () => <JWSTBackground generator={bgTwilight}      seed={8} />;
export const JWSTCarinaRidgesBg  = () => <JWSTBackground generator={bgCarinaRidges}  seed={9} />;
