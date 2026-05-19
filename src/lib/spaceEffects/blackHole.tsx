import React from "react";
import { r, uid } from "./_shared";

// ── 2. Black Hole ──────────────────────────────────────────────────────────────
//
// Video asset: `public/bh.mp4` is adapted from a NASA visualisation of
// light bending around a Schwarzschild black hole.
//   Credit: NASA's Goddard Space Flight Center / Jeremy Schnittman / Scott Noble.
//
// Rendered via <video> (hardware-decoded by WebKit) rather than <img> with an
// animated WebP because animated-WebP playback is software-decoded on the
// main thread — at the asset's resolution that produces visible framerate
// stutter during the appear keyframe and on every restart, since decoding
// competes with React render + the alpha composite. Video stays smooth
// regardless of what the main thread is doing.
//
// Format choice: HEVC-with-alpha in mp4 (hvc1 tag, bgra). The original
// Chrome export was VP9 with WebM `alpha_mode=1`, which Chrome decodes but
// WKWebView (Tauri's macOS webview) silently drops the alpha layer for —
// rendering the disk on opaque black. HEVC-with-alpha is Apple's documented
// transparent-video format and WKWebView decodes it natively.

export interface BH { id: number; x: number; y: number; duration: number; rotation: number; }

const BH_DUR = 5 * 60_000; // 5 minutes on-screen, then vanish

export function BHEl({ bh, onDone }: { bh: BH; onDone: () => void }) {
  const APPEAR = 3500;
  const VANISH = 2800;
  const [vanishing, setVanishing] = React.useState(false);

  // Parent passes fresh inline callbacks each render — timer must not depend on them
  // or the 5 min auto-vanish keeps resetting (same issue as PulsarEl).
  const onDoneRef = React.useRef(onDone);
  onDoneRef.current = onDone;

  const startVanish = React.useCallback(() => setVanishing(true), []);

  React.useEffect(() => {
    if (vanishing) {
      const t = setTimeout(() => onDoneRef.current(), VANISH);
      return () => clearTimeout(t);
    }
    // Natural lifetime: same path as click — m-bh-vanish for VANISH ms, then unmount.
    const t = setTimeout(startVanish, bh.duration - VANISH);
    return () => clearTimeout(t);
  }, [bh.duration, vanishing, startVanish]);

  const fadeAnim: React.CSSProperties = {
    animationName: vanishing ? "m-bh-vanish" : "m-bh-appear",
    animationDuration: vanishing ? `${VANISH}ms` : `${APPEAR}ms`,
    animationTimingFunction: vanishing ? "ease-in" : "ease-out",
    animationFillMode: "forwards",
  };

  return (
    <div data-space-dismissable="true" onClick={() => !vanishing && startVanish()} style={{ position: "absolute", left: `${bh.x}%`, top: `${bh.y}%`, transform: "translate(-50%, -50%)", cursor: "pointer", pointerEvents: "auto" }}>
      {/* Rotation wrapper — separate from fade so keyframe scale() doesn't overwrite rotate() */}
      <div style={{ transform: `rotate(${bh.rotation}deg)` }}>
        <div style={fadeAnim}>
          <video
            src="/bh.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            style={{
              width: "480px",
              height: "auto",
              display: "block",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function mkBH(x?: number, y?: number): BH {
  return { id: uid(), x: x ?? (15 + r() * 70), y: y ?? (15 + r() * 65), duration: BH_DUR, rotation: (r() * 90) - 45 };
}
