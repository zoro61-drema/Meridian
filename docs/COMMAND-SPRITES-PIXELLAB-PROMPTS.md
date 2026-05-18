# Command Sprites — PixelLab Prompts Reference

Working reference for generating the 16-unit Command roster in [PixelLab.ai](https://www.pixellab.ai). Companion to `COMMAND-SPRITES-DESIGN-BRIEF.md`.

**Current status:**
- **Marine locked** as style anchor. Character ID: `405dde5f-ceb0-4c80-bdfc-6c5b9e760376`.
- **Engineer locked** (gunmetal black + crimson exo-suit with flamethrower).
- **Field Tech locked** as Shield Medic variant (rectangular shield with teal 4-armed plus, white-glow scanner).
- All animation prompts iteration-tested across these three units. The patterns below are what's *actually worked* in production.

---

## 1. Workflow

PixelLab differs from open-ended AI tools in several important ways:

- Prompts are short (~1000 character limit for animations, ~1500 for character descriptions).
- Style consistency comes from **reference images** (the Marine character_id as `style_reference`), not from prompt repetition.
- Animations are generated via tool calls (`animate_character`), not described in prose.
- **Use v3 model** (not Pro). v3 produces the rendered shading depth and detail that matches the SC1-inspired aesthetic. Pro produces flatter, cleaner output that does NOT match the established style.

**Confirmed working pattern (Pattern B):** style anchor units (Marine, Engineer, Field Tech) generated manually with iteration. Remaining units generated autonomously via PixelLab's MCP through Claude Code, using the Marine's character_id as the style anchor.

---

## 2. The Style Anchor Method

The Marine is the visual contract for the rest of the roster. Every other unit's `create_character` call passes the Marine's character_id as the style reference. PixelLab uses the Marine's actual sprite as the visual anchor — not prompt repetition, an actual rendered image.

This means:
- Per-unit prompts focus on what makes each unit *distinct* — silhouette, equipment, role.
- Common style attributes (dark palette, rendered shading, top-down 3/4 perspective, sci-fi military aesthetic) are carried by the reference image automatically.
- Per-unit prompts don't need to repeat "StarCraft 1 style," "rendered shading," etc. — the reference image carries it.

### Lessons from Marine, Engineer, and Medic pilots — read these before generating new units

**Era and genre anchoring needed.** "Marine" alone reads as modern military. "Sci-fi space marine in late-1990s RTS aesthetic" is required to anchor the era. Same pattern applies to all units: use "sci-fi [archetype]" + "late-1990s RTS aesthetic" framing.

**PixelLab leans heroic/decorative by default.** Negative directives ("NO gold trim, NO Warhammer 40K, NO heroic embellishments") were necessary on the Marine. Subtle decorations may still slip through; if they're acceptable, lock them in as part of the established style.

**PixelLab cannot reliably render:**
- **Continuous flowing effects** (sustained flame streams, water, electricity arcs). Use discrete frame-shape designs (muzzle flashes, pulse bursts) instead.
- **Sparks/particles.** Stochastic by nature — per-frame randomness drifts across directions. Avoid sparks entirely; use intensity-pulsing of existing elements instead.
- **Forward-projected emission from devices held forward.** Always reads as weapon-firing regardless of color or stated intent. Use diffuse glows, downward-angled cones, or area effects instead.
- **Abstract emitted effects** (e.g., "dots emitting from helmet"). Always fails. Use physical props (radios, scanners) instead.
- **Per-direction prop consistency for transient props.** Beacons, weapons, equipment all vary across 8 directions unless pixel-level specified.

**PixelLab handles reliably:**
- **Anchored intensity-based animations** (existing elements pulsing brighter/dimmer/changing color).
- **Color shifts on stationary objects.**
- **Single-element animations** (only one or two things change per frame).
- **Concrete props** (radios, beacons, weapons) when given explicit dimensions and hex codes.

**Per-unit color decoupling.** When a unit has both a persistent identifier and an active effect element, they MUST use different colors. The medic's teal cross + teal healing glow caused PixelLab to animate the cross sympathetically during healing. Fixed by making the scanner glow white (#ffffff) while the cross stays teal (#00b8a9). General principle: **persistent identifier color ≠ active effect color.**

**Frame-equivalence language locks elements as static.** When an element must not animate across frames, use language like "pixel-identical across all frames, frame 1's [element] = frame 2's [element] = etc." Stronger than "static" or "doesn't animate."

**Frame-phase structure for one-shot animations.** Breaking one-shots into explicit phases (rise → hold → lower with specific frame numbers) prevents PixelLab from smearing motion across all frames. Critical for `done`, `spawning`, `deploying`.

**Symbol geometry needs explicit specification.** At small pixel sizes, "cross" can render as asterisk/star/etc. Specify "4-armed plus sign with arms at right angles, NO diagonal arms" — gives the model unambiguous geometry.

**Weapon position drift.** If the static character doesn't show a weapon clearly, animations invent weapons in wrong positions per direction. Either regenerate the character with explicit weapon placement, or design `tool_running` around a non-weapon action (scanning, broadcasting, internal-glow signaling).

**Character regeneration sometimes needed.** When animation iteration won't converge despite refined prompts, the fix is usually at the character level (regenerate with stronger color/equipment/posture directives) rather than continuing to refine animations.

---

## 3. Master prompt template (per unit)

For each unit, the `create_character` call uses:

- **Description:** unit-specific prompt from §5 (~1500 char limit)
- **Style reference:** Marine character_id `405dde5f-ceb0-4c80-bdfc-6c5b9e760376`
- **Model:** v3 (NOT Pro)
- **n_directions:** 8 (full RTS rotations)
- **Size:** 96×96 (matches Marine and Engineer)
- **Background:** transparent

The unit description doesn't need to repeat style attributes carried by the reference. It should specify: archetype, top-down silhouette, key equipment, color palette where it diverges from Marine, and any unit-specific constraints (weapon position, symbol geometry, color decoupling).

---

## 4. State animation prompts — iteration-tested

These are the canonical animation prompts after extensive iteration. Each fits within PixelLab's ~1000-character prompt limit. Use with `animate_character(character_id="<unit_id>", animation="<prompt>")`.

### Frame count framework

Frame counts are tuned to motion complexity, not matched to FPS. Loop duration = frame_count ÷ fps.

| State | Frames | FPS | Loop duration | Why |
|---|---|---|---|---|
| `idle` | 6 | 8 | 0.75s | subtle, calm motion |
| `thinking` | 8 | 10 | 0.8s | more complex gesture |
| `tool_running` | 6 | 12 | 0.5s | snappy, repeated action |
| `streaming` | 6 | 10 | 0.6s | radio/transmission rhythm |
| `awaiting_permission` | 8 | 8 | 1.0s | patient, slower pacing |
| `done` | 8 | 10 | 0.8s | one-shot brief salute |
| `error` | 4 | 4 | 1.0s | very slow, minimal motion |
| `spawning` | 8 | 12 | 0.67s | quick arrival |
| `deploying` | 6 | 12 | 0.5s | one-shot beacon place |
| `walk` | 8 | 8 | 1.0s | full leg cycle |

### `idle` — loops

> Subtle ambient breathing loop. Unit at ready position. Shoulders shift weight gently side to side, weapon barrel sways slightly. Body bobs 1 pixel up and down. Calm, slow, seamless loop. 6 frames, 8 fps.

### `thinking` — loops

> Visible deliberation. Unit's head tilts slightly to one side as if listening. One hand raises to touch the comm bead on the helmet, holds briefly, lowers. Loop. 8 frames, 10 fps.

### `tool_running` — loops *(varies by unit — see below)*

The default firing-weapon version for combat infantry like Marine:

> Active engagement. Unit raises weapon and sights down the barrel, weapon extends forward slightly, brief muzzle flash, slight recoil shift, returns to ready. 6 frames, 12 fps, loops.

**Tool_running varies significantly by unit type.** Forward-emission animations consistently read as weapon-firing in PixelLab regardless of color or framing. For non-combat units, use these alternatives:

- **Combat infantry** (Marine, Recon Scout): rifle-firing with muzzle flash (default above)
- **Heavy combat** (Engineer with flamethrower, Combat Drone): pulse-burst flame from the weapon with defined cone shape (NOT continuous stream)
- **Scout/recon** (Light Walker, Probe Drone): scanning beam or sensor pulse — see Option A in unit-specific section below
- **Support/medic** (Field Tech): downward-angled flashlight cone illuminating ground — see Option D below
- **Stationary weapons** (Sentinel Turret, Siege Walker): muzzle flash + recoil with explicit "feet stay locked, only body absorbs recoil"
- **Bio-Construct**: dorsal vents pulse brightly, eye glow shifts color, claws extend slightly — NO emission

### `streaming` — loops *(physical radio prop, not emitted dots)*

> Unit speaks into a handheld military radio. One hand raises a chunky radio to the side of the helmet, holds it there while speaking. Other hand keeps weapon at side. Small repeating light flashes on the radio indicate transmission. Subtle head movement as if talking. 6 frames, 10 fps, loops.

### `awaiting_permission` — loops *(overhead signal, no glyph)*

> Unit raises one arm overhead in a signaling gesture (calling for orders or attention). Body squared toward viewer. Arm held high, then lowered slightly, then raised again — repeating signal motion. Other hand keeps weapon at side. 8 frames, 8 fps, loops.

### `done` — one-shot *(frame-phased to prevent salute-hand motion)*

> Quiet acknowledgment, plays once. Frame 1: ready stance. Frames 2-3: unit rises into salute — weapon rotates to vertical shoulder position, free hand to side of helmet. Frames 4-6: salute HELD — body, weapon, and saluting hand are PIXEL-IDENTICAL across these frames, completely static. ZERO motion during the hold. Frames 7-8: smooth return to ready position. Disciplined, not celebratory. 8 frames, 10 fps, one-shot. Critical: the salute hold phase shows no motion in any limb.

### `error` — loops *(varies by unit class)*

**Humanoid units** (Marine, Engineer, Field Tech, Recon Scout) — kneeling wounded:

> Badly wounded, kneeling. Unit drops to one knee in exhaustion or injury, other leg bent supporting weight. Body slumps forward heavily, weapon held loosely or resting against the ground. Head tilts downward as if barely conscious. Subtle motion only — shoulders rise and fall with labored breathing. Very slow loop. 4 frames, 4 fps.

**Mech-class units** (Light Walker, Assault Mech, Siege Walker, Engineering Walker) — collapsed on ground:

> [Unit] destroyed in battle, collapsed on the ground. The unit is NOT standing — it has fallen and is lying on its side. Body posture is horizontal/prone, NOT vertical. Legs sprawled outward at unnatural angles, no longer supporting the body — one leg folded under, the other bent at the joint. Body tilted against the ground. Weapons hang loose, resting on the terrain. Battle damage: scorch marks, dents, blackened armor panels. Cockpit emits a steady deep red distress light (#cc1a1a) — pulses slowly, the only colored element. Subtle motion only: red light pulses, very small body settle. The unit does NOT stand up, NOT move legs, NOT reposition. 4 frames, 4 fps, very slow loop.

**Spacecraft** — lists off-axis, engine glow dims; **Drones** — body droops, optic dims; **Bio-Construct** — curls inward.

### `spawning` — one-shot

> Drop-pod arrival, plays once. Unit drops into frame from above with landing impact, briefly absorbs the impact in a low crouch pose, then rises to standard idle stance. 8 frames, 12 fps, one-shot. Total under 1.5 seconds.

### `deploying` — one-shot *(beacon placement — 949 chars)*

> Marine crouches, plants identical beacon on ground, stands. Beacon: short cylinder 8px wide × 6px tall, dark gunmetal gray (#3a3a3a) body, three small vertical ridge slots, flat top with single clear dome 4px wide sitting flush, wide flat base ring. When placed, dome emits bright cyan (#00d4ff) — only colored element. Same beacon shape, size, color, proportions in EVERY direction. Action timing: frame 1 ready stance, frame 2 crouching, frame 3 placing beacon, frame 4 dome flashes cyan, frames 5-6 standing back up. Rifle in other hand throughout. 6 frames, 12 fps, one-shot.

### `walk` — loops *(for cosmetic idle wander per spec §2.4)*

> Unit walks forward at a deliberate pace. Two-step gait cycle — left foot forward then right foot forward, body weight shifts naturally between supporting legs. Body bobs vertically by 1 pixel with each step. Weapon held steady in ready position, swaying minimally. Calm walking pace, not running. 8 frames, 8 fps, fully looping. Critical: legs visibly alternate stepping — left foot lifts and plants forward, then right foot does the same. Direction-of-travel matches the unit's facing.

**Walking is omitted for stationary units** (Sentinel Turret, Siege Walker). Generate only the other 9 animations for these units.

### Adaptation for non-humanoid and non-combat units

Motion intent is preserved per unit, but the body part performing the action adapts:

- **Drones:** no head tilt for `thinking` — optic darts side to side. No comm bead for `streaming` — antenna pulses or transmits via a small dish. No crouch for `deploying` — hover down to ground level and release the beacon. No wounded knee for `error` — body droops, shadow flattens, optic dims. `walk` is a hovering glide. **`tool_running` is sensor pulse/scan, not weapon-fire.**

- **Spacecraft:** no kneel for `error` — list dramatically off-axis with engine lights dimming. No arm-raise for `awaiting_permission` — hover in place with running lights blinking in a slow attention pattern. `Deploying` opens a hangar bay underneath and drops the beacon. `walk` is a slow forward hover.

- **Bio-Construct:** no human gestures. `Thinking` is multi-eye scan. `Streaming` is bioluminescent dorsal vents pulsing. `Deploying` is extruding a smaller pod from the dorsal side that becomes the beacon. `Error` is curling inward. `walk` is creeping/scuttling/slithering. **`tool_running` is dorsal vent pulse + claw extension — no emission.**

- **Sentinel Turret and Siege Walker:** stationary. No `walk`. For other states, only the turret/barrel rotates; the base is locked.

The beacon's physical spec (cylinder, dimensions, hex colors) stays identical across all units. Only the placement gesture differs.

### Non-combat `tool_running` alternatives

**Option A — Scanning sweep (for scout/recon units like Light Walker, Probe Drone):**

> Active reconnaissance. Unit stands in stable scanning posture. Antenna or optic pulses brightly in a continuous transmission rhythm. A small directional cone of light projects forward from the front of the unit — narrow, soft, illuminating the ground ahead in a triangular pattern. The cone pulses on/off in a steady rhythm. Body and supporting structure hold steady. 6 frames, 12 fps, loops.

**Option D — Downward flashlight (for medic/support units):**

> Active scanning with handheld light. Unit stands in a calm, attentive posture, holding a scanner forward and tilted slightly downward, like someone using a flashlight to search the ground. From the scanner's front aperture, a translucent white light cone (#ffffff) projects forward-and-downward at roughly 30 degrees below horizontal — narrow at the scanner tip, widening to about 16 pixels at its far end, where it forms a clearly illuminated patch on the ground. The light cone is stationary — does NOT sweep or flicker. Only its brightness pulses gently. The illuminated ground patch pulses in sync. Other equipment held steady. Body still. Reads as methodically searching the ground, NOT firing a weapon. 6 frames, 12 fps, loops.

---

## 5. The 16-unit character prompts

The Marine is the style anchor (§5.1, locked). The remaining 15 units each reference the Marine via PixelLab's style reference parameter.

### 5.1 `Marine` — heavy armored infantry *(LOCKED — character_id `405dde5f-ceb0-4c80-bdfc-6c5b9e760376`)*

> Sci-fi space marine in heavy power armor, late-1990s real-time strategy game aesthetic (StarCraft 1 Terran Marine era, not modern military). Top-down 3/4 RTS perspective viewed from above and slightly behind. Bulky futuristic armored exosuit — thick layered armor plates with visible joints and mechanical greebles, fully enclosed helmet with no visible face (mirrored or solid visor strip, no human features showing), oversized shoulder pauldrons. Sci-fi rifle/blaster with chunky futuristic profile (not a modern AR or M16 — think bulky pulse rifle), held forward across the body. Team-color zone: helmet visor strip. Color palette: STRICTLY dark and muted. Armor in deep gunmetal, charcoal, near-black. Shade ramps compressed into the dark end of the value range. The team-color visor strip is the only bright/saturated color in the entire sprite — armor itself stays uniformly dark. NO gold trim, NO brass accents, NO yellow ornamentation, NO Warhammer 40K-style decorative armor, NO shoulder-mounted fuel tanks or backpack cylinders, NO heroic embellishments. Functional grunt soldier aesthetic — faceless industrial trooper, not a champion or knight. Shaded pixel art with 3-4 shade tones per surface, top-edge highlights, bottom-edge shadows. Functional, weighty, sci-fi military aesthetic.

*Note: subtle gold trim came through in the final generation despite the negative directives; accepted as part of the established style.*

### Infantry (§5.2 – §5.4)

#### 5.2 `Engineer` — utility/builder *(LOCKED, gunmetal black + crimson, exo-suit with flamethrower)*

> Sci-fi combat engineer in a bulky powered exo-suit / industrial loader frame, top-down 3/4 RTS view. Larger and chunkier silhouette than Marine — visible exo-frame with hydraulic pistons on shoulders and hips, pilot visible inside the frame. Holds a heavy flamethrower with a wide-mouthed nozzle protruding forward and a bulky fuel tank on the back.
>
> Color palette: armor is gunmetal black (near-black, darker than the reference Marine — matte industrial black). Red accents on the shoulder pauldrons, hydraulic piston housings, and fuel tank — a deep crimson/blood-red (#8b1a1a), NOT bright magenta-red. The red appears as trim lines, small warning panels, and accent stripes — substantial enough to identify the unit but not overwhelming.
>
> No bright accent or team-color zone — the unit's identity is its silhouette and the gunmetal-black + crimson palette. Avoid any bright/saturated focal points; keep the entire sprite within the dark + crimson palette range.
>
> Same rendered shading sensibility as the reference Marine — 3-4 shade tones per surface, top-edge highlights from above, bottom-edge shadows. Industrial military aesthetic — heavier than infantry, lighter than a piloted mech.

#### 5.3 `Field Tech` — medic/scanner/support *(LOCKED as Shield Medic variant)*

> Sci-fi combat medic, top-down 3/4 RTS view. Female humanoid — slimmer and narrower-shouldered than the Marine reference, articulated armor segments rather than thick plates (lighter field-medic armor, not heavy infantry). Dark gunmetal armor matching Marine, with white/off-white fabric panels on chest and shoulders as medic uniform markings.
>
> Shield held to one side: large rectangular armored panel ~16×10 pixels at native resolution, dark gunmetal body with a prominent teal medical cross (#00b8a9) occupying roughly half the shield's face.
>
> The cross is a STANDARD 4-ARMED MEDICAL PLUS SIGN — exactly four arms at right angles (one up, one down, one left, one right), forming a thick "+" shape. Each arm equal length and thickness. NOT an asterisk, NOT a star, NO diagonal arms, NO 6 or 8 points. Exactly 4 arms, no more, no fewer. The cross is the unit's PRIMARY identifier, persistent and unchanging across all states.
>
> Other hand holds a healing scanner: chunky tactical device, dark gunmetal gray (#3a3d42) body in idle. When healing, the scanner glows pure white (#ffffff). The scanner is NEVER teal. Teal is reserved for the cross only; white is reserved for the scanner only. These colors are distinct and must never be confused.
>
> Secondary identifiers: small 4-armed teal plus sign (#00b8a9) on top of the helmet, smaller 4-armed teal plus sign on medical satchel at hip. Every cross uses identical 4-armed plus geometry — no variants.
>
> No rifle. Same rendered shading as Marine.

#### 5.4 `Recon Scout` — fast/light scout infantry

> Sci-fi light reconnaissance soldier in low-profile stealth gear, top-down 3/4 RTS view. Compact elongated silhouette in low-ready crouch (reads as squashed-from-above), scoped carbine or suppressed sidearm extending forward, hooded lightweight bodysuit. Team-color zone: optic visor stripe and small chest indicator. Same dark palette as reference.

### Mechs (§5.5 – §5.8)

#### 5.5 `Light Walker` — scout mech *(updated to twin side-mounted autocannons)*

> Sci-fi small bipedal scout walker, top-down 3/4 RTS view. Two-legged mech with reverse-jointed bird-like legs — knees bend backward like a velociraptor, lightly sprung at the joints. Legs are the unit's defining visual feature.
>
> Body: a recessed armored cockpit canopy as the dominant top-feature — rounded dark-tinted dome (#1a2538) clearly facing forward. Short antenna spike on top of the cockpit with a small indicator light at the tip.
>
> Weapons: TWO identical automatic weapons mounted symmetrically on the LEFT and RIGHT sides of the body, one on each side of the cockpit. Each weapon is a chunky multi-barrel autocannon protruding forward 6-8 pixels past the body. Both weapons fire straight forward in parallel. The two weapons are visually identical — same size, same shape, same forward orientation, mounted at the same height on each side. No center weapon, no chin gun. The pair of side-mounted autocannons is the unit's complete armament.
>
> Proportions: smaller and more compact than the Assault Mech. Total silhouette ~40 pixels wide at native — visibly more agile than a heavy mech.
>
> Color palette: dark gunmetal armor matching Marine reference. Tinted cockpit dome (#1a2538). Both autocannons same gunmetal as the body.
>
> Same rendered shading as Marine reference. Mechanical, agile, scout-archetype aesthetic.
>
> CRITICAL: BOTH weapons must be clearly visible in EVERY direction-frame, mounted on the left and right sides of the body. Symmetric — same weapon on both sides, identical in size, shape, and orientation.

#### 5.6 `Assault Mech`

> Sci-fi heavy bipedal combat mech, top-down 3/4 RTS view. Wide squat body wider laterally than Marine, weapon arms extending out either side, recessed cockpit visible as a circle near body center. Team-color zone: chest core and shoulder caps. Same dark palette as reference. Heavy machinery aesthetic with panel lines and exposed mechanical detail.

#### 5.7 `Siege Walker`

> Sci-fi heavy artillery walker, top-down 3/4 RTS view. Low and broad, multiple legs splayed outward in star pattern (3-4 elongated leg tabs from central body), massive gun barrel protruding forward (longest weapon in the roster). Team-color zone: gun barrel band and dorsal armor stripe. Same dark palette as reference. Heavy industrial aesthetic. Stationary — does NOT walk; only barrel and scope rotate.

#### 5.8 `Engineering Walker`

> Sci-fi utility construction walker, top-down 3/4 RTS view. Bipedal core with multiple manipulator arms radiating outward from torso (3-4 short tool protrusions in various directions), recessed cockpit on top. Cargo cradle or welding rig visible. Team-color zone: cockpit and manipulator joint glows. Same dark palette as reference.

### Spacecraft (§5.9 – §5.12)

#### 5.9 `Starfighter`

> Sci-fi small single-seat starfighter, top-down 3/4 view from above. Pointed nose forward, swept-back wings extending laterally, twin engine glows trailing rearward. Hovering with shadow visible beneath. Team-color zone: cockpit canopy and engine glow. Same dark palette as reference.

#### 5.10 `Interceptor`

> Sci-fi compact defensive interceptor, top-down 3/4 view from above. Smaller and more rounded than starfighter, oversized engine glows trailing rearward. Hovering. Team-color zone: engine glow and nose strip. Same dark palette as reference.

#### 5.11 `Dropship`

> Sci-fi boxy utility transport vessel, top-down 3/4 view from above. Rectangular hull, cargo door panel visible on top, engines at corners with glow points, optional dorsal turret bump. Hovering. Team-color zone: side hull stripe and cockpit window. Same dark palette as reference.

#### 5.12 `Capital Ship`

> Sci-fi massive command vessel, top-down 3/4 view from above. Elongated hull (taller than wide, filling the 96×96 frame vertically), bridge tower as small bump near one end, hangar bay opening or gun emplacements along hull, multiple engine glows trailing rearward. Largest unit in roster. Team-color zone: bridge tower light and hull stripe. Same dark palette as reference.

### Drones & Constructs (§5.13 – §5.16)

#### 5.13 `Probe Drone`

> Sci-fi small autonomous sensor drone, top-down 3/4 view from above. Spherical or disc-shaped body (one of the smallest sprites), central optic as the focal point, small thrusters around perimeter. Hovering. Team-color zone: central optic. Same dark palette and rendered shading as reference.

#### 5.14 `Combat Drone`

> Sci-fi small attack drone, top-down 3/4 view from above. Larger than probe drone, asymmetric body with weapon mount extending in one direction. Hovering. Team-color zone: weapon barrel base and central optic. Same dark palette as reference.

#### 5.15 `Bio-Construct`

> Sci-fi alien biological creature, top-down 3/4 view from above. Organic asymmetric outline with no straight lines, claws/tentacles/limbs radiating outward from central body, dorsal vents visible on upper surface. STRICTLY avoid Xenomorph cues — no second jaw, no elongated dome head, no biomech ribbing, no acid drool, no Giger surface texture. Team-color zone: bioluminescent dorsal vents and eye glow. Different palette from other units (organic, not metallic). Alien biological aesthetic.

#### 5.16 `Sentinel Turret`

> Sci-fi anchored gun turret, top-down 3/4 view from above. Circular wide base flush with terrain (no shadow gap — it sits on the ground), rotating top section with gun barrels extending in one direction. Stationary. Team-color zone: scope/sensor on turret head and base stripe. Same dark palette as reference.

---

## 6. Process — confirmed Pattern B workflow

**Phase 1 (complete):** Marine, Engineer, Field Tech generated manually with iteration. Locked as style anchors.

**Phase 1.5 (pending — required before Phase 2):** Generate the `walk` animation for the three locked units. The `walk` animation was added to the spec after these units were locked, so they need it generated retroactively. Three `animate_character` calls total.

**Phase 2 (next):** Remaining 13 units generated via PixelLab MCP through Claude Code, orchestrated autonomously. Marine's character_id passed as style reference for every `create_character` call. Use v3 model explicitly. Claude Code generates each unit's character + 10 animations sequentially (or 9 for stationary units), saves files locally to `src/lib/commandSprites/[UnitName]/`, and writes a manifest at `src/lib/commandSprites/pixellab-manifest.json`.

Suggested generation order (matches the orchestration prompt):

1. Recon Scout *(Infantry — completes the humanoid set, validates style anchor across 4 units)*
2. Light Walker → Assault Mech → Siege Walker → Engineering Walker *(Mechs — checkpoint after each)*
3. Starfighter → Interceptor → Dropship → Capital Ship *(Spacecraft — checkpoint)*
4. Probe Drone → Combat Drone → Bio-Construct → Sentinel Turret *(Drones — final checkpoint)*

**Critical checkpoint: after Recon Scout.** Verify the family-coherence across the four humanoid units (Marine, Engineer, Field Tech, Recon Scout). If they read as siblings, the style anchor is doing its job. If they drift visually, stop the orchestration and diagnose before continuing.

**Expect iteration on `tool_running` for several units.** The medic alone required 6+ regeneration cycles to land. Plan for similar iteration on:
- Light Walker (twin-weapon firing sync OR scanning fallback)
- Probe Drone (sensor pulse — easy)
- Combat Drone (small weapon firing — moderate risk)
- Bio-Construct (organic action — high risk, may need multiple attempts)
- Engineering Walker (manipulator action — moderate risk)

The other animations (idle, thinking, streaming, awaiting_permission, done, error, spawning, deploying, walk) should generate cleanly across most units once the static character is correct.

---

## 7. Cost & time

Rough order of magnitude:

- **Style anchor units (Marine, Engineer, Field Tech):** ~all-day work each with iteration. Done.
- **Remaining 13 units via MCP orchestration:** estimated ~60-120 minutes wall time including expected iteration on `tool_running`. Highly dependent on PixelLab generation speed and v3 stability.
- **Total API calls for remaining batch:** ~144 baseline (11 wandering units × 11 calls + 2 stationary × 10 calls), plus iteration regenerations (budget 20-30 additional calls for tool_running retries).

Watch your PixelLab credit balance. Running out mid-batch leaves the manifest partially populated and creates a recovery problem.

---

## 8. PixelLab MCP — installed and ready

PixelLab MCP is installed in Claude Code. Workflow for the autonomous batch:

1. **Verify the MCP connection** with a quick *"what PixelLab tools are available?"* check before kicking off the batch.
2. **Verify v3 model selection** is available as a parameter. Use v3 explicitly on every call. If the MCP does not expose mode selection, STOP and report back — we'll need to switch to manual generation rather than proceed with the wrong mode (Pro produces flatter output that does NOT match the established style).
3. **Confirm the style-reference parameter** name (might be `style_reference`, `style_reference_id`, `reference_character`, etc.) — Claude Code should inspect this before the first call.
4. **Run the orchestration prompt** (separate document) to begin Phase 2.
5. **Spot-check at each category checkpoint** — verify family coherence before continuing.

If PixelLab rejects any prompt for length, trim secondary directives first (the style anchor carries most of the constraint). If PixelLab rejects for content (e.g., flagging "Xenomorph cues" as confusing), rewrite that section affirmatively (*"organic creature with claws and dorsal vents — original alien design"* instead of *"no Xenomorph"*).

If `tool_running` for any unit fails to converge after 3-4 regeneration attempts, fall back to a non-emission alternative (Option A scanning, Option D flashlight, or unit-specific anchored intensity animation) rather than continuing to refine forward-emission prompts.
