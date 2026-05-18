#!/usr/bin/env node
// One-time / re-runnable asset trim. PixelLab exports characters
// on a 96×96 canvas with the character occupying only the middle
// ~50% — the rest is transparent padding that makes thumbnails
// look like a sea of empty pixels.
//
// This script computes, for each unit, the union bounding box of
// every non-transparent pixel across every rotation and animation
// frame. It then squares that bbox (the runtime renders with
// width === height, so a non-square crop would distort) and
// rewrites every PNG cropped to that box.
//
// Run after `pnpm sprites:normalize`, before `pnpm sprites:manifest`.
// `pnpm sprites:rebuild` wires all three in order.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const ASSETS = join(REPO_ROOT, "src/lib/commandSprites/assets");

// Pixels with alpha below this are treated as transparent. PixelLab
// often dithers edges with low-alpha pixels; an 8/255 threshold
// keeps the character silhouette intact without including hairline
// halo pixels.
const ALPHA_THRESHOLD = 8;

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function walkPngs(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (isDir(p)) out.push(...walkPngs(p));
    else if (p.endsWith(".png")) out.push(p);
  }
  return out;
}

function loadPng(path) {
  return PNG.sync.read(readFileSync(path));
}

function savePng(png, path) {
  writeFileSync(path, PNG.sync.write(png));
}

function computeBbox(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  const { width, height, data } = png;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a >= ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function unionBbox(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

/** Expand `bbox` to a square centered on its midpoint, clamped to
 *  the canvas. The runtime always renders with width === height,
 *  so a non-square source would either letterbox or stretch. */
function squareBbox(bbox, canvasW, canvasH) {
  const size = Math.max(bbox.width, bbox.height);
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  let x = Math.round(cx - size / 2);
  let y = Math.round(cy - size / 2);
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + size > canvasW) x = canvasW - size;
  if (y + size > canvasH) y = canvasH - size;
  return { x, y, width: size, height: size };
}

function cropPng(png, bbox) {
  const out = new PNG({ width: bbox.width, height: bbox.height });
  const src = png.data;
  const dst = out.data;
  const srcStride = png.width * 4;
  const dstStride = bbox.width * 4;
  for (let y = 0; y < bbox.height; y++) {
    const srcStart = (bbox.y + y) * srcStride + bbox.x * 4;
    const dstStart = y * dstStride;
    src.copy(dst, dstStart, srcStart, srcStart + dstStride);
  }
  return out;
}

function trimUnit(unitDir, unitName) {
  const pngs = walkPngs(unitDir);
  if (pngs.length === 0) return;

  // Pass 1: load every PNG, compute its bbox, union them. Keep
  // the loaded PNGs in memory so the second pass doesn't re-read
  // from disk.
  const cache = new Map();
  let combined = null;
  let canvasW = 0;
  let canvasH = 0;
  for (const p of pngs) {
    const png = loadPng(p);
    if (canvasW === 0) {
      canvasW = png.width;
      canvasH = png.height;
    } else if (png.width !== canvasW || png.height !== canvasH) {
      console.warn(
        `[trim] ${unitName}: mixed canvas sizes (${canvasW}×${canvasH} vs ` +
        `${png.width}×${png.height} at ${p}). Falling back to per-frame max.`,
      );
      canvasW = Math.max(canvasW, png.width);
      canvasH = Math.max(canvasH, png.height);
    }
    const bbox = computeBbox(png);
    if (bbox) combined = unionBbox(combined, bbox);
    cache.set(p, png);
  }

  if (!combined) {
    console.warn(`[trim] ${unitName}: no non-transparent pixels found, skipping`);
    return;
  }

  const target = squareBbox(combined, canvasW, canvasH);
  // No-op if already square + tight.
  if (
    target.x === 0 &&
    target.y === 0 &&
    target.width === canvasW &&
    target.height === canvasH
  ) {
    console.log(`[trim] ${unitName}: already tight (${canvasW}×${canvasH}), skipping`);
    return;
  }

  console.log(
    `[trim] ${unitName}: ${canvasW}×${canvasH} → ${target.width}×${target.height} ` +
    `(offset ${target.x},${target.y}, content bbox ${combined.width}×${combined.height})`,
  );

  // Pass 2: crop and write back in place.
  for (const [p, png] of cache) {
    const cropped = cropPng(png, target);
    savePng(cropped, p);
  }
}

function main() {
  for (const unit of readdirSync(ASSETS).sort()) {
    const unitDir = join(ASSETS, unit);
    if (!isDir(unitDir)) continue;
    trimUnit(unitDir, unit);
  }
}

main();
