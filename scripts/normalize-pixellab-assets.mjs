#!/usr/bin/env node
// Copies pixellab/<folder>/ into src/lib/commandSprites/assets/<Component>/
// and normalizes the inconsistencies introduced by the PixelLab export:
//   - folder name (medic -> FieldTech, Bipedal_Scout_Walker -> LightWalker, ...)
//   - animation folder (needs_permission -> awaiting_permission, spawn -> spawning,
//     Walking -> walking, streaming-<uuid> -> streaming)
//   - UUID-suffixed direction folders inside an animation: pick the
//     alphabetically-first variant and rename it to the clean direction.
//
// Idempotent: re-running wipes assets/<Component>/ and regenerates.

import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const SRC = join(REPO_ROOT, "pixellab");
const DST = join(REPO_ROOT, "src/lib/commandSprites/assets");

const UNIT_MAP = [
  { folder: "marine", component: "Marine" },
  { folder: "engineer", component: "Engineer" },
  { folder: "medic", component: "FieldTech" },
  { folder: "Bipedal_Scout_Walker", component: "LightWalker" },
  { folder: "Heavy_Artillery_Walker", component: "SiegeWalker" },
  { folder: "dropship", component: "SpawnDropship" },
];

const CLEAN_DIRS = new Set([
  "north", "north-east", "east", "south-east",
  "south", "south-west", "west", "north-west",
]);

// streaming-<8 hex>; treat as the canonical streaming folder.
const STREAMING_UUID = /^streaming-[0-9a-f]{8,}$/;

function renameAnimDir(name) {
  if (name === "needs_permission") return "awaiting_permission";
  if (name === "spawn") return "spawning";
  if (name === "Walking") return "walking";
  if (STREAMING_UUID.test(name)) return "streaming";
  return name;
}

function pickClean(suffixedVariants) {
  // suffixedVariants: list of like "north-west-aad68231"
  const sorted = [...suffixedVariants].sort();
  return sorted[0];
}

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function normalizeAnimationFolder(animDir) {
  // Within an animation folder there are direction subfolders.
  // Some are clean (north, north-east, ...), some have a UUID suffix
  // like north-west-aad68231 from a stale regeneration.
  // For each clean direction missing on disk, find the suffixed
  // variants and pick the alphabetically-first one.
  const entries = readdirSync(animDir).filter((e) => isDir(join(animDir, e)));
  const byDir = new Map();
  for (const e of entries) {
    // strip optional -<hex>$ suffix
    const m = e.match(/^([a-z-]+?)(-[0-9a-f]{6,})?$/);
    if (!m) continue;
    const base = m[1];
    if (!CLEAN_DIRS.has(base)) continue;
    if (!byDir.has(base)) byDir.set(base, []);
    byDir.get(base).push(e);
  }

  for (const [base, variants] of byDir) {
    const hasClean = variants.includes(base);
    if (hasClean) {
      // Keep the clean one as-is; remove any UUID-suffixed siblings.
      for (const v of variants) {
        if (v !== base) rmSync(join(animDir, v), { recursive: true, force: true });
      }
      continue;
    }
    // No clean variant — pick alphabetically-first suffixed and rename.
    const kept = pickClean(variants);
    const dropped = variants.filter((v) => v !== kept);
    renameSync(join(animDir, kept), join(animDir, base));
    for (const v of dropped) {
      rmSync(join(animDir, v), { recursive: true, force: true });
    }
    console.warn(
      `[normalize] ${animDir.replace(REPO_ROOT + "/", "")}: ` +
      `no clean "${base}/" — kept "${kept}" (dropped ${dropped.join(", ")})`,
    );
  }
}

function normalizeUnit(folder, component) {
  const srcUnit = join(SRC, folder);
  const dstUnit = join(DST, component);
  if (!existsSync(srcUnit)) {
    console.warn(`[normalize] skip ${folder}: missing at ${srcUnit}`);
    return;
  }

  // Wipe + copy fresh
  rmSync(dstUnit, { recursive: true, force: true });
  mkdirSync(dstUnit, { recursive: true });
  cpSync(srcUnit, dstUnit, { recursive: true });

  // metadata.json + rotations/ ride along.

  // Animations
  const animRoot = join(dstUnit, "animations");
  if (!existsSync(animRoot)) return;

  // Pass 1: rename top-level animation folders to clean names.
  // macOS' default filesystem is case-insensitive, so `Walking` and
  // `walking` resolve to the same path. To do a case-only rename
  // safely, bounce through a tmp name.
  for (const name of readdirSync(animRoot)) {
    const p = join(animRoot, name);
    if (!isDir(p)) continue;
    const renamed = renameAnimDir(name);
    if (renamed === name) continue;
    const target = join(animRoot, renamed);
    const caseOnly = name.toLowerCase() === renamed.toLowerCase();
    if (caseOnly) {
      const tmp = join(animRoot, `${renamed}.__casefix__`);
      renameSync(p, tmp);
      renameSync(tmp, target);
      console.warn(`[normalize] ${component}: animation ${name} -> ${renamed} (case fix)`);
      continue;
    }
    if (existsSync(target)) {
      console.warn(`[normalize] ${component}: conflict ${name} -> ${renamed}, dropping ${name}`);
      rmSync(p, { recursive: true, force: true });
    } else {
      renameSync(p, target);
      console.warn(`[normalize] ${component}: animation ${name} -> ${renamed}`);
    }
  }

  // Pass 2: normalize direction folders within each animation.
  for (const anim of readdirSync(animRoot)) {
    const p = join(animRoot, anim);
    if (isDir(p)) normalizeAnimationFolder(p);
  }
}

function main() {
  if (!existsSync(SRC)) {
    console.error(`Missing PixelLab source dir: ${SRC}`);
    process.exit(1);
  }
  mkdirSync(DST, { recursive: true });
  for (const { folder, component } of UNIT_MAP) {
    normalizeUnit(folder, component);
  }
  console.log(`\n[normalize] wrote ${DST}`);
}

main();
