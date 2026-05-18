#!/usr/bin/env node
// Walks src/lib/commandSprites/assets/*/animations/*/*/ and writes
// src/lib/commandSprites/manifest.ts with frame counts per
// component/animation/direction.
//
// Logs warnings for per-direction frame-count mismatches inside a
// single animation (e.g. FieldTech.error north/south have 9 frames
// while other directions have 5).

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const ASSETS = join(REPO_ROOT, "src/lib/commandSprites/assets");
const OUT = join(REPO_ROOT, "src/lib/commandSprites/manifest.ts");

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function countFrames(dirPath) {
  return readdirSync(dirPath).filter((f) => /^frame_\d+\.png$/i.test(f)).length;
}

function buildManifest() {
  const manifest = {};
  for (const component of readdirSync(ASSETS).sort()) {
    const compPath = join(ASSETS, component);
    const animRoot = join(compPath, "animations");
    if (!isDir(animRoot)) continue;
    const animations = {};
    for (const anim of readdirSync(animRoot).sort()) {
      const animPath = join(animRoot, anim);
      if (!isDir(animPath)) continue;
      const dirs = {};
      const counts = new Set();
      for (const dir of readdirSync(animPath).sort()) {
        const dirPath = join(animPath, dir);
        if (!isDir(dirPath)) continue;
        const n = countFrames(dirPath);
        dirs[dir] = n;
        counts.add(n);
      }
      if (counts.size > 1) {
        const summary = Object.entries(dirs)
          .map(([d, n]) => `${d}=${n}`)
          .join(", ");
        console.warn(`[manifest] ${component}/${anim}: mixed frame counts — ${summary}`);
      }
      animations[anim] = dirs;
    }
    manifest[component] = animations;
  }
  return manifest;
}

function render(manifest) {
  const header = [
    "// AUTO-GENERATED — do not edit.",
    "// Run `pnpm generate:sprite-manifest` after regenerating PixelLab assets.",
    "",
    "export interface SpriteManifest {",
    "  [component: string]: {",
    "    [animation: string]: {",
    "      [direction: string]: number;",
    "    };",
    "  };",
    "}",
    "",
    "export const SPRITE_MANIFEST: SpriteManifest = ",
  ].join("\n");
  return `${header}${JSON.stringify(manifest, null, 2)};\n`;
}

function main() {
  const manifest = buildManifest();
  writeFileSync(OUT, render(manifest));
  console.log(`[manifest] wrote ${OUT}`);
}

main();
