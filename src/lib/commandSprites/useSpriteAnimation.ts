import { useEffect, useRef, useState } from "react";

interface UseSpriteAnimationOpts {
  frameCount: number;
  fps: number;
  loop: boolean;
  onComplete?: () => void;
  /** animation+direction key — resets the frame counter when this changes */
  key: string;
}

/** Frame-accurate sprite animation driver. Returns the current
 *  frame index in [0, frameCount). Resets to 0 whenever `key`
 *  changes (i.e. when the unit's facing or animation changes). */
export function useSpriteAnimation({
  frameCount,
  fps,
  loop,
  onComplete,
  key,
}: UseSpriteAnimationOpts): number {
  const [frame, setFrame] = useState(0);
  const startedAt = useRef<number | null>(null);
  const rafId = useRef<number | null>(null);
  const completedRef = useRef(false);

  // Stash onComplete in a ref so the rAF effect doesn't tear down and
  // reset to frame 0 on every parent render when callers pass an
  // inline arrow — the common case.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    setFrame(0);
    startedAt.current = null;
    completedRef.current = false;

    const tick = (now: number) => {
      if (startedAt.current === null) startedAt.current = now;
      const elapsed = now - startedAt.current;
      const totalFrames = Math.floor((elapsed * fps) / 1000);
      const f = loop
        ? totalFrames % frameCount
        : Math.min(totalFrames, frameCount - 1);
      setFrame(f);

      if (!loop && totalFrames >= frameCount - 1 && !completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
        return; // stop scheduling further frames
      }
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
    // onComplete intentionally omitted — read via ref above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, frameCount, fps, loop]);

  return frame;
}
