# Claude Code Integration Prompt: PixelLab Sprites → Meridian commandSprites Library

Copy the section below into Claude Code as a single prompt. It contains everything Claude Code needs to integrate the 5 PixelLab-generated units into Meridian's sprite library, replacing the 3 legacy Claude Design components.

---

## Task

Integrate 5 PixelLab-generated units and 1 static dropship asset into Meridian's command sprite library at `src/lib/commandSprites/`. This replaces 3 legacy single-direction static Claude Design components (`Marine.tsx`, `Engineer.tsx`, `FieldTech.tsx`) with proper 8-direction animated components, and adds 2 new mech units plus the dropship visual prop.

**Read first before doing anything:** the `SPEC-COMMAND.md` file at the project root describes the sprite library contract — see §10 (Sprite & Animation Library), §8.3 (Zustand store and Unit interface), §5.5 (Dropship delivery), and §2.4 (Unit Movement, including the `canWander` flag). The `UnitProps` interface, the 8-direction `Facing` type, the 10 animation states (or 9 for the lone stationary unit Sentinel Turret, which is not in this batch), and the `canWander` flag all come from there. Implement to that contract.

## Source assets

PixelLab assets live at `pixellab/` in the project root. Each unit folder contains:

- `metadata.json` — character metadata (read this for canonical info; don't assume frame counts or fps)
- `rotations/` — 8 static directional sprites (`north.png`, `north-east.png`, `east.png`, `south-east.png`, `south.png`, `south-west.png`, `west.png`, `north-west.png`)
- `animations/<animation_name>/<direction>/frame_NNN.png` — per-frame PNG sequences

The dropship folder has only `rotations/` and `metadata.json`, no `animations/` — it's a static asset that gets position-translated by the rendering layer, not internally animated (see spec §5.5).

## Folder-to-component mapping

Use this exact mapping (the PixelLab folder names diverge from the React component names in several places):

| PixelLab folder | React component | Display name | Class | canWander |
|---|---|---|---|---|
| `marine` | `Marine.tsx` | Marine | Infantry | true |
| `engineer` | `Engineer.tsx` | Engineer | Infantry | true |
| `medic` | `FieldTech.tsx` | Field Tech | Infantry | true |
| `Bipedal_Scout_Walker` | `LightWalker.tsx` | Light Walker | Mech | true |
| `Heavy_Artillery_Walker` | `SiegeWalker.tsx` | Siege Walker | Mech | true |
| `dropship` | `SpawnDropship.tsx` | Spawn Dropship | (visual prop) | n/a |

Important: **the codebase keeps `FieldTech` as the canonical name** even though the PixelLab folder is called `medic`. Don't rename `FieldTech` to `Medic` in the spec, brief, store, or component name. Only the asset folder uses the `medic` name; map it.

Important: **Siege Walker is a wandering unit** (`canWander: true`) despite being a heavy artillery class. It has a walking animation and uses the wander system normally. The only stationary unit in the roster is Sentinel Turret, which isn't in this batch.

## Animation state mapping

PixelLab folder names → `AgentState` / `TransientAnimation` values:

| PixelLab folder | State enum value | Persistent or transient |
|---|---|---|
| `idle` | `idle` | persistent |
| `thinking` | `thinking` | persistent |
| `tool_running` | `tool_running` | persistent |
| `streaming` (or `streaming-<uuid>`) | `streaming` | persistent |
| `awaiting_permission` (or `needs_permission`) | `awaiting_permission` | persistent |
| `done` | `done` | persistent |
| `error` | `error` | persistent |
| `spawning` (or `spawn`) | `spawning` | transient (one-shot) |
| `deploy` | `deploying` | transient (one-shot) |
| `walking` (or `Walking`) | `walk` | locomotion loop |

## Known inconsistencies to handle

The PixelLab export has several naming inconsistencies and stale-regeneration artifacts. Handle them as follows:

1. **`awaiting_permission` vs `needs_permission`** — Engineer uses `needs_permission`; others use `awaiting_permission`. Both map to the `awaiting_permission` state.

2. **`spawning` vs `spawn`** — Medic uses `spawn`; others use `spawning`. Both map to the `spawning` state.

3. **`walking` vs `Walking`** — Marine uses capital `Walking`; others use lowercase `walking`. Match case-insensitively, normalize to `walking` on disk and `walk` in the React animation map. Linux filesystems are case-sensitive, so do an explicit rename during the normalization step rather than relying on macOS's case-insensitivity.

4. **`streaming-b8bac642`** on Marine — UUID-suffixed regeneration artifact. Marine has no clean `streaming/` folder; treat `streaming-b8bac642` as the canonical streaming animation.

5. **UUID-suffixed direction folders** — several units have direction folders with UUID suffixes from stale regenerations:
   - Marine `deploy/`: `north-west-aad68231` + `north-west-bcd23cc1` (no clean `north-west`)
   - Marine `error/`: `north-east-5217a256` + `north-east-f4af791e` (no clean `north-east`)
   - Engineer `walking/`: `south-96b7430f` + `south-cc7b655b` (no clean `south`)
   - Heavy_Artillery_Walker `streaming/`: `south-west-36f0df2c` + `south-west-4b20eff5` (no clean `south-west`)

   **Pick the alphabetically-first variant** as the canonical version for that direction (`aad68231` < `bcd23cc1`, `5217a256` < `f4af791e`, etc.). Log a warning to console at integration time so I know which alternate was picked for each.

6. **Per-direction frame count inconsistency** — Medic's `error` animation has 5 frames per direction for most facings but 9 frames for `north` and `south`. This causes the animation to play for different durations depending on facing. **Log a warning** when you detect mismatched frame counts within an animation, but don't fail — render each direction at its own frame count.

## Steps

### 1. Discovery and assertions

Before generating any code, verify the structure:

```bash
ls pixellab/
ls src/lib/commandSprites/
cat pixellab/marine/metadata.json
ls pixellab/marine/animations/idle/north/ | head
```

Confirm:
- All 6 expected PixelLab folders exist (`marine`, `engineer`, `medic`, `Bipedal_Scout_Walker`, `Heavy_Artillery_Walker`, `dropship`)
- The 3 legacy components exist at `src/lib/commandSprites/Marine.tsx`, `Engineer.tsx`, `FieldTech.tsx`
- Read one `metadata.json` to learn its shape — this informs what fields to extract (sprite dimensions, native framerate hints if any, character description)
- Read one existing legacy component to learn the project's React style conventions (functional components, prop typing, imports)

If any assumption is wrong, stop and ask before proceeding. Do not invent fields that aren't in `metadata.json`.

### 2. Asset organization

Copy the PixelLab assets into a location Vite can serve. Use `src/lib/commandSprites/assets/<ComponentName>/` matching the React component name (so `Marine.tsx` reads from `assets/Marine/`, `LightWalker.tsx` from `assets/LightWalker/`, etc.). Copying rather than symlinking is safer for Vite's static asset pipeline.

Within each unit's asset folder, normalize the animation folder names:
- `needs_permission/` → `awaiting_permission/`
- `spawn/` → `spawning/`
- `Walking/` → `walking/`
- `streaming-b8bac642/` → `streaming/`

For UUID-suffixed direction folders, pick the alphabetically-first variant and rename it to the clean direction name (e.g., `north-west-aad68231/` → `north-west/`). Discard the rejected alternates. Log which alternate was kept for each.

Final asset layout per unit (example for Marine):
```
src/lib/commandSprites/assets/Marine/
  metadata.json
  rotations/
    north.png, north-east.png, east.png, south-east.png,
    south.png, south-west.png, west.png, north-west.png
  animations/
    idle/<direction>/frame_NNN.png
    thinking/<direction>/frame_NNN.png
    tool_running/<direction>/frame_NNN.png
    streaming/<direction>/frame_NNN.png
    awaiting_permission/<direction>/frame_NNN.png
    done/<direction>/frame_NNN.png
    error/<direction>/frame_NNN.png
    spawning/<direction>/frame_NNN.png
    deploy/<direction>/frame_NNN.png
    walking/<direction>/frame_NNN.png
```

Same structure for Engineer, FieldTech, LightWalker, SiegeWalker. SpawnDropship has only `metadata.json` and `rotations/` (no `animations/`).

### 3. Implement the UnitProps contract

The `UnitProps` interface is defined by spec §10:

```ts
type Facing = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
type AgentState = 'idle' | 'thinking' | 'tool_running' | 'streaming'
                | 'awaiting_permission' | 'done' | 'error';
type TransientAnimation = 'spawning' | 'deploying';

interface UnitProps {
  state: AgentState;
  transient?: TransientAnimation;
  isMoving?: boolean;   // when true, play `walk` instead of the state animation (cosmetic wander, spec §2.4)
  accent: AccentColor;
  size?: number;        // default 96
  facing: Facing;
  onTransientComplete?: () => void;  // fires when one-shot ends
}
```

Note `onTransientComplete` — when a `transient` is set, the component plays it once and fires this callback at the end so the parent can clear the transient and return the unit to its persistent state. This is how the `spawning` and `deploying` animations integrate with the lifecycle in §5.3.

Note `isMoving` — `TacticalField` (spec §2.4, §13) drives cosmetic idle wander by toggling this prop. When `isMoving` is true and no `transient` is active, the component plays the `walk` animation in place of the persistent state animation. Stationary units (Sentinel Turret, not in this batch) never receive `isMoving=true`. Precedence: `transient` > `isMoving` > `state`.

**Map `facing` (compass enum) to PixelLab's direction filename (kebab-case):**

```ts
const FACING_TO_DIR: Record<Facing, string> = {
  N:  'north',
  NE: 'north-east',
  E:  'east',
  SE: 'south-east',
  S:  'south',
  SW: 'south-west',
  W:  'west',
  NW: 'north-west',
};
```

**Map `state` + `transient` to the animation folder name:**

```ts
const STATE_TO_ANIM: Record<AgentState, string> = {
  idle: 'idle',
  thinking: 'thinking',
  tool_running: 'tool_running',
  streaming: 'streaming',
  awaiting_permission: 'awaiting_permission',
  done: 'done',
  error: 'error',
};

const TRANSIENT_TO_ANIM: Record<TransientAnimation, string> = {
  spawning: 'spawning',
  deploying: 'deploy',  // PixelLab folder is 'deploy', state enum is 'deploying'
};

// Precedence: transient (one-shot) > isMoving (walk) > state (persistent).
const currentAnim = props.transient
  ? TRANSIENT_TO_ANIM[props.transient]
  : props.isMoving
    ? 'walking'
    : STATE_TO_ANIM[props.state];
```

`accent` is preserved in the prop type for forward-compatibility but PixelLab assets aren't readily palette-swappable. For v0, accept and ignore the `accent` prop (or apply only as a CSS `filter: hue-rotate(...)` overlay if time permits). Document this in a code comment — accent palette swap is deferred until the SVG-rendered approach in spec §10 is revisited.

### 4. Component generation pattern

Each unit component follows the same pattern. Generate shared utilities first, then thin per-unit components on top.

**4a. Shared `useSpriteAnimation` hook** at `src/lib/commandSprites/useSpriteAnimation.ts`:

```ts
import { useEffect, useRef, useState } from 'react';

interface UseSpriteAnimationOpts {
  frameCount: number;
  fps: number;
  loop: boolean;
  onComplete?: () => void;
  key: string;  // animation+direction key — resets frame counter when this changes
}

export function useSpriteAnimation({
  frameCount, fps, loop, onComplete, key,
}: UseSpriteAnimationOpts): number {
  const [frame, setFrame] = useState(0);
  const startedAt = useRef<number | null>(null);
  const rafId = useRef<number | null>(null);
  const completedRef = useRef(false);

  // Stash onComplete in a ref so the effect doesn't tear down + reset to
  // frame 0 every parent render when callers pass an inline arrow.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    setFrame(0);
    startedAt.current = null;
    completedRef.current = false;

    const tick = (now: number) => {
      if (startedAt.current === null) startedAt.current = now;
      const elapsed = now - startedAt.current;
      const totalFrames = Math.floor(elapsed * fps / 1000);
      const f = loop ? totalFrames % frameCount : Math.min(totalFrames, frameCount - 1);
      setFrame(f);

      if (!loop && totalFrames >= frameCount - 1 && !completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
        return;  // stop scheduling further frames
      }
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, [key, frameCount, fps, loop]);

  return frame;
}
```

The `key` parameter is what triggers the animation to restart — pass `${anim}:${direction}` so changing facing or state resets the frame counter to 0. `onComplete` is intentionally excluded from the effect deps and read via a ref — otherwise an inline arrow from a parent (the common case) would re-identify every render and reset the frame counter to 0 forever.

**4b. Shared frame manifest** at `src/lib/commandSprites/manifest.ts`:

Frame counts vary per unit per animation per direction. Don't hardcode them — generate a manifest at integration time by walking the assets folder and counting files. Output something like:

```ts
// AUTO-GENERATED — do not edit. Regenerate with `npm run generate:sprite-manifest`.
export interface SpriteManifest {
  [componentName: string]: {
    [animation: string]: {
      [direction: string]: number;  // frame count
    };
  };
}

export const SPRITE_MANIFEST: SpriteManifest = {
  Marine: {
    idle: { north: 9, 'north-east': 9, /* ... */ },
    thinking: { /* ... */ },
    // ...
  },
  // ...
};
```

Write a Node script at `scripts/generate-sprite-manifest.mjs` that walks `src/lib/commandSprites/assets/*/animations/*/*/` and outputs this file. Wire it to `npm run generate:sprite-manifest` and run it after each PixelLab regeneration. Run it once now to produce the initial manifest.

**4c. Shared image-loader utility** at `src/lib/commandSprites/spriteUrls.ts`:

Use Vite's `import.meta.glob` to eagerly import all PNG paths into a flat lookup:

```ts
const allFrames = import.meta.glob('./assets/*/animations/*/*/frame_*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const allRotations = import.meta.glob('./assets/*/rotations/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export function getFrameUrl(component: string, anim: string, dir: string, frame: number): string {
  const padded = frame.toString().padStart(3, '0');
  const key = `./assets/${component}/animations/${anim}/${dir}/frame_${padded}.png`;
  const url = allFrames[key];
  if (!url) throw new Error(`Missing sprite frame: ${key}`);
  return url;
}

export function getRotationUrl(component: string, dir: string): string {
  const key = `./assets/${component}/rotations/${dir}.png`;
  const url = allRotations[key];
  if (!url) throw new Error(`Missing rotation: ${key}`);
  return url;
}
```

This bundles all frames at build time. Vite handles cache-busting and asset paths automatically.

**4d. Per-unit components.** Each unit gets a thin component using the shared utilities. Example for `Marine.tsx`:

```tsx
import { useMemo } from 'react';
import type { UnitProps, Facing } from './types';
import { useSpriteAnimation } from './useSpriteAnimation';
import { getFrameUrl } from './spriteUrls';
import { SPRITE_MANIFEST } from './manifest';

const FACING_TO_DIR: Record<Facing, string> = { /* as above */ };
const STATE_TO_ANIM = { /* as above */ };
const TRANSIENT_TO_ANIM = { /* as above */ };

const FPS = 10;
const COMPONENT = 'Marine';

export function Marine({
  state, transient, isMoving, facing, size = 96, onTransientComplete,
}: UnitProps) {
  const dir = FACING_TO_DIR[facing];
  // Precedence: transient (one-shot) > isMoving (walk) > state (persistent).
  const anim = transient
    ? TRANSIENT_TO_ANIM[transient]
    : isMoving
      ? 'walking'
      : STATE_TO_ANIM[state];
  const isTransient = Boolean(transient);

  const frameCount = SPRITE_MANIFEST[COMPONENT]?.[anim]?.[dir];
  if (frameCount === undefined) {
    // Loud failure — a missing manifest entry means the asset normalization
    // step or the manifest generator dropped frames. Don't silently render
    // frame 0 forever.
    throw new Error(`Missing sprite manifest entry: ${COMPONENT}/${anim}/${dir}`);
  }

  const frame = useSpriteAnimation({
    frameCount,
    fps: FPS,
    loop: !isTransient,  // transients play once; persistent + walk loop
    onComplete: isTransient ? onTransientComplete : undefined,
    key: `${anim}:${dir}`,
  });

  const url = useMemo(
    () => getFrameUrl(COMPONENT, anim, dir, frame),
    [anim, dir, frame],
  );

  return (
    <img
      src={url}
      alt={`Marine ${anim} facing ${facing}`}
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated', display: 'block' }}
      draggable={false}
    />
  );
}
```

Generate identical components for `Engineer.tsx`, `FieldTech.tsx`, `LightWalker.tsx`, `SiegeWalker.tsx` — only the `COMPONENT` constant differs. If `metadata.json` for any unit specifies a different fps (e.g., walk faster than idle), restructure the FPS lookup to be per-animation; otherwise keep the single 10 fps default. Transients (`spawning`, `deploy`) used 12 fps in the original PixelLab prompts — if you want exactness, branch the FPS based on `isTransient`. The visual difference at sprite scale is small, so a single 10 fps everywhere is acceptable for v0.

**4e. SpawnDropship component** at `src/lib/commandSprites/SpawnDropship.tsx`:

Static asset, no animation. Renders a single PNG keyed off `facing` (defaults to `S` per spec §5.5 — the dropship doesn't follow the receiving unit's facing). Per spec §5.5, position translation during the spawn sequence is handled by the rendering layer, not by this component. This component just renders the static sprite.

```tsx
import type { Facing } from './types';
import { getRotationUrl } from './spriteUrls';

const FACING_TO_DIR: Record<Facing, string> = {
  N: 'north', NE: 'north-east', E: 'east', SE: 'south-east',
  S: 'south', SW: 'south-west', W: 'west', NW: 'north-west',
};

interface SpawnDropshipProps {
  size?: number;       // default 72 — see "pixel-scale note" below
  facing?: Facing;     // default 'S'
}

export function SpawnDropship({ size = 72, facing = 'S' }: SpawnDropshipProps) {
  const url = getRotationUrl('SpawnDropship', FACING_TO_DIR[facing]);
  return (
    <img
      src={url}
      alt="Spawn dropship"
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated', display: 'block' }}
      draggable={false}
    />
  );
}
```

Don't implement the descent/drop/ascent position translation here — that lives in the tactical field rendering layer (Phase 12 per spec §15) and is out of scope for this integration. Just expose the static sprite component so Phase 12 work can wire it up later.

**Pixel-scale note.** The dropship's native PNG is 48×48 (see `pixellab/dropship/metadata.json → objects[0].size`), while Marine's native is 96×96. Spec §5.5 specifies the dropship should display at 1.5× infantry. The infantry size default is 96, so 1.5× = 144, but rendering a 48px sprite at 144px is a 3× upscale next to Marine's 1× — pixels won't be uniform across the field. Default to `size = 72` (1.5× × 48) to keep pixel scale consistent and flag the spec mismatch in a comment. If the user prefers strict spec compliance (1.5× infantry display size), they can pass `size={144}` from the call site and accept the chunkier pixels. Alternatively, the dropship source assets could be re-exported at 96×96 native — out of scope here, but worth a follow-up note.

### 5. Update the barrel exports

At `src/lib/commandSprites/index.ts`:

```ts
export { Marine } from './Marine';
export { Engineer } from './Engineer';
export { FieldTech } from './FieldTech';
export { LightWalker } from './LightWalker';
export { SiegeWalker } from './SiegeWalker';
export { SpawnDropship } from './SpawnDropship';
export type { UnitProps, Facing, AgentState, TransientAnimation, AccentColor } from './types';
```

Extract the shared types (`UnitProps`, `Facing`, `AgentState`, `TransientAnimation`, `AccentColor`) into `src/lib/commandSprites/types.ts` so all components import from one place.

**Note on the existing `types.ts`:** it currently re-exports the type aliases *from* `./Marine` (the legacy 1k-line SVG component declares them and `types.ts` proxies). That dependency direction inverts in the new design — `types.ts` becomes the source of truth and every component imports from it. Rewrite `types.ts` accordingly; don't preserve the re-export-from-Marine pattern. The existing `ACCENT_PALETTE` const in `types.ts` (used by `TacticalField` for tethers and signal arcs) should be kept — only the type re-exports flip.

If there's a sprite registry / lookup table elsewhere in the codebase (e.g., a map in the Zustand store that resolves `spriteId` → component), update it to include `LightWalker` and `SiegeWalker` as new entries. Check `SPEC-COMMAND.md` §8.3 for the Unit shape and find where `spriteId` resolves to a component. If no such registry exists yet, don't invent one — the spec §8.3 describes the Unit data model but the dispatch from `spriteId` to component may not be implemented yet.

### 6. Delete the legacy components

After verifying the new components render correctly (see step 7), delete:

- `src/lib/commandSprites/Marine.tsx` (the legacy Claude Design version)
- `src/lib/commandSprites/Engineer.tsx` (the legacy Claude Design version)
- `src/lib/commandSprites/FieldTech.tsx` (the legacy Claude Design version)

The new versions live at the same paths. Make sure you've moved them in (not just placed them alongside) — one file per component, the PixelLab-backed one.

If the legacy components had unique exports or props that the new versions don't match (e.g., they took color hex strings instead of accent enums), search the codebase for their import sites and adjust callers. The new `UnitProps` is the contract; if callers break, fix them.

### 7. Verification

Create a demo page. Check first if there's an existing demo at `src/lib/commandSprites/demo.tsx` or `src/routes/command-sprites-demo.tsx` or similar — if so, update that. If not, create one at the project's conventional location (look for an existing demo route to match the pattern).

The demo should render a grid of all units in all states and facings:

- Rows: each unit (Marine, Engineer, FieldTech, LightWalker, SiegeWalker)
- Columns: each persistent state (idle, thinking, tool_running, streaming, awaiting_permission, done, error)
- Per-cell: a dropdown or button row to select facing direction

Plus a separate row for transients (spawning, deploying) with a "play" button per unit that triggers the one-shot and logs `onTransientComplete` to the console.

Plus a row with an `isMoving` toggle per unit so the `walk` animation can be exercised in isolation — this is what `TacticalField` will drive during cosmetic wander (spec §2.4).

Plus a SpawnDropship preview row that renders the static sprite at all 8 facing options for completeness.

Verify in the browser:

1. **All persistent states loop** smoothly for all 5 units in all 8 directions
2. **Facing changes** trigger an immediate re-render at frame 0 of the new direction
3. **Transient animations** play once and fire `onTransientComplete` — and fire it exactly once (toggling state on the parent in the callback must not retrigger the animation or double-fire)
4. **`isMoving` toggle** swaps to the `walk` animation while held and returns to the persistent state when released
5. **No 404s in the network tab** — every frame URL resolves
6. **Console warnings** appear for the known frame-count mismatches (Medic error north/south have 9 frames vs 5 elsewhere) and for the UUID-suffixed direction choices

Click through each unit and state in the demo and confirm visually that the animations look like the PixelLab outputs (no missing frames, no flickering, no wrong directions).

### 8. Done check

Before declaring done:

- [ ] All 5 unit components live at the expected paths with `UnitProps` interface
- [ ] `SpawnDropship.tsx` exists as a static-asset component
- [ ] Legacy `Marine.tsx`, `Engineer.tsx`, `FieldTech.tsx` (Claude Design versions) are deleted
- [ ] Barrel `index.ts` exports all 6 components and shared types
- [ ] `assets/` folder is normalized (no `needs_permission`, `spawn`, `Walking`, `streaming-b8bac642`, or UUID-suffixed directions remain)
- [ ] `manifest.ts` exists and reflects actual frame counts on disk
- [ ] `scripts/generate-sprite-manifest.mjs` exists and `npm run generate:sprite-manifest` works
- [ ] Demo page renders all units, all states, all facings without errors
- [ ] Console warnings logged for the known inconsistencies (Medic error frame mismatch, UUID-direction choices)
- [ ] `tsc --noEmit` passes
- [ ] If there's a lint config, `npm run lint` passes
- [ ] If `Command.tsx` or the tactical field already references the legacy unit components, those imports still work (or have been updated to the new API)

If anything is unclear or you'd be guessing, stop and ask before proceeding. Specifically: if `metadata.json`'s shape differs from what you expect, if the legacy components have a different API than `UnitProps`, or if the project has an existing sprite-loading convention you're unsure about, ask before generating code.

---

## Notes from prior decisions

- **Siege Walker walks.** Despite being "heavy artillery," it has a `walking/` animation in the PixelLab folder and is implemented with `canWander: true`. Don't strip the walk animation from it. The only stationary unit in the roster is Sentinel Turret, which is not in this batch.
- **The dropship's internal animations were abandoned.** PixelLab couldn't generate reliable per-direction animations for it (engine pulses, ramp opening). It ships as a static sprite; position translation during spawn happens in the rendering layer (Phase 12 per spec §15), out of scope for this integration.
- **Accent prop is a no-op for v0 — this is a known regression.** The legacy SVG-based `Marine.tsx`/`Engineer.tsx`/`FieldTech.tsx` components currently support live palette swap via an embedded `ACCENTS` map (see the 1k-line Marine.tsx). The PixelLab raster sprites don't expose palette channels, so the swap goes away when those components are replaced. Document this clearly in code comments on the new components. Restoring palette swap is deferred until either (a) PixelLab exports a palette-mask channel or (b) the SVG-rendered approach in spec §10 is revisited — not blocking this integration.
- **Frame counts vary per direction.** Medic's `error` animation is the most extreme example (5 frames most directions, 9 for north/south). The animation hook reads frame count from the manifest per direction, so this is handled gracefully — each direction plays at its own duration. Just log a warning so it's visible.

If you finish this and things look good, the next phases are wiring up the spawn dropship's position-translation animation (spec §5.5) and the broader subagent Level 3 spawn/deploy choreography (spec §5.3). Those are tracked as Phase 12 and aren't part of this task.