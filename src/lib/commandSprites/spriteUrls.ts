// Vite eager-imports every PNG under assets/*/animations/**/ and
// assets/*/rotations/* into a flat path → URL lookup. The component
// layer looks frames up by (component, anim, dir, frame). Vite
// hashes the URLs and emits them as static assets at build time.

const allFrames = import.meta.glob(
  "./assets/*/animations/*/*/frame_*.png",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

const allRotations = import.meta.glob(
  "./assets/*/rotations/*.png",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

export function getFrameUrl(
  component: string,
  anim: string,
  dir: string,
  frame: number,
): string {
  const padded = frame.toString().padStart(3, "0");
  const key = `./assets/${component}/animations/${anim}/${dir}/frame_${padded}.png`;
  const url = allFrames[key];
  if (!url) {
    throw new Error(`Missing sprite frame: ${key}`);
  }
  return url;
}

export function getRotationUrl(component: string, dir: string): string {
  const key = `./assets/${component}/rotations/${dir}.png`;
  const url = allRotations[key];
  if (!url) {
    throw new Error(`Missing rotation: ${key}`);
  }
  return url;
}
