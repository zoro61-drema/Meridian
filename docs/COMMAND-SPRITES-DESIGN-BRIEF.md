# Command Sprites — Design Brief

A brief for [claude.ai/design](https://claude.ai/design) to design the **animated pixel-art unit roster** for the **Command** workflow in Meridian, a desktop productivity app for senior engineers.

Command is a real-time tactical interface for managing multiple AI coding agents running in parallel. The dashboard frames each agent as a **unit fighting on a planet's surface**, viewed from a **top-down 3/4 RTS perspective** — the commander's bird's-eye view, like StarCraft, Command & Conquer, or Advance Wars. You're the commander; the agents are your forces. This roster is the visual identity layer for those forces.

The roster is a **16-unit generic space-RTS lineup** rendered as **32-bit-style pixel art**: marines, mechs, spacecraft, drones, bio-constructs. Fully original designs — no references to specific film, TV, or game IP. See §9 for the explicit guardrail list.

**The sprites carry their own state.** Each unit's animation IS how it communicates what its agent is doing — there is no separate effects layer rendering around them. A thinking unit *looks like it's thinking*. A unit under fire *looks like it's under fire*. A unit reporting in *looks like it's transmitting*. This is the classic RTS production pattern.

---

## 0. How to work this brief

Five things worth knowing before you start:

1. **Pilot with one complete unit first.** Pick the **Marine** (§7.1) and design all of its state animations end-to-end before touching any other unit. This locks the perspective, visual language, and animation vocabulary for the whole family. Cheaper to discover problems on one unit than on sixteen.
2. **Link the Meridian repo during project onboarding** so Claude Design can read existing UI patterns and accent token definitions.
3. **Use the progress tracker in §13 as persistent memory.** Claude Design has no cross-session memory of its own; update the tracker as work progresses and paste the updated brief back in when starting a new session.
4. **Pixel art is unforgiving at small sizes.** Every pixel decision matters. We'd rather see slow, careful work than a fast first pass. Prefer fewer, better units over many sketchy ones.
5. **The IP guardrails in §9 are not suggestions.** Space-battle aesthetics carry decades of iconic designs that are all owned by someone. The roster must read as a unique force, not a tribute to anything specific.

---

## 1. Context, briefly

Command is Meridian's tactical multi-agent dashboard. Each running Claude Code / Codex / Gemini session is a **unit** deployed to a tactical field — a planet-surface terrain viewed from above. Users pick a unit type at agent creation; the unit becomes that agent's persistent visual identity across the dashboard, archive, and chat panel.

Each unit has **seven persistent state animations**, **two transient one-shots**, and **one locomotion loop** (§6) corresponding to what its agent is currently doing. The unit's own animation is the state communication; nothing renders around it. Stationary units (Sentinel Turret, Siege Walker) skip the locomotion loop since they don't wander.

The dashboard is **read at-a-glance**. Up to 20 units may be on the field at once. The mood is **commander's display, retro RTS** — late-90s strategy game viewed from orbit. Players surveyed StarCraft battlefields by glancing at unit sprites and reading their behavior. Same paradigm here: glance at the unit, read what it's doing, drill in only when needed.

---

## 2. Visual language goals

- **Pixel art with rendered shading sensibility.** Late-90s strategy-game aesthetic — specifically the **StarCraft 1 / Tiberian Sun feel** of small sprites that look like miniature *rendered* models rather than hand-pixeled icons. Hand-authored pixel art, but with the visual weight of pre-rendered 3D: **3–4 shade tones per major surface** (not just 1–2), deliberate highlighting on top-facing edges (lit from above), shadow ramps on under-facing edges, panel lines and surface detail packed into the available pixels. Color palette per sprite: typically **16–32 colors** including multiple shade ramps for the main material plus accent and shadow tones. **Not** clean flat pixel art (Advance Wars, Into the Breach) — chunky but shaded, like SC1 viewed up close.
- **Rendered look, not flat look.** Each surface should read with depth. A Marine's armor plate has a highlight ramp on top, a midtone, a shadow at the bottom edge. A ship's hull catches light asymmetrically. A drone's curved body shades from light at the top to dark at the bottom. Curves are simulated through shade ramps even on rectangular pixel surfaces. This is what separates StarCraft 1's chunky-but-rich pixel art from cleaner contemporary pixel art.
- **Top-down 3/4 RTS perspective.** Units viewed from above and slightly behind, like **StarCraft, Command & Conquer: Tiberian Sun, or Advance Wars**. The commander sees the top of each unit plus a hint of its front/sides. Faces and chest details are partial or obscured — they don't carry the silhouette. Weapons protrude forward; legs/treads/thrusters trail rearward; antennae and turrets are visible from on high. Sprites should be designed in this perspective from the start — **no frontal poses**.
- **Functional, military-utilitarian.** Designed for purpose. Plating, exposed mechanical detail, panel lines, scuff and wear. Not chrome and curves. Soldiers, not heroes.
- **Strong silhouette with shaded surface detail.** Each unit renders at ~48–64px most of the time. The outline — read from above — must be unmistakable peripherally; the surface detail (shade ramps, highlights, panel lines) must give the unit weight when viewed at 4× scale. Both matter. Silhouette discipline doesn't mean flat — it means the *outline* reads clearly even when the *interior* is richly shaded.
- **Native resolution: 48×48 pixels.** Sprites designed at this size and rendered with `image-rendering: pixelated` for crisp display when scaled up.
- **Shadow-anchored.** Each unit casts a soft shadow on the terrain beneath. The shadow is the unit's positional anchor — animations that bob or shift do so *over* the shadow; the shadow stays put. This sells the bird's-eye perspective.
- **Animation is deliberate, not smooth.** Pixel art animations don't blend frames. They snap. Typical frame counts: 4–8 frames per loop. Frame rate: 6–12 fps for ambient loops, faster for action moments.
- **Coherent as a family.** Sixteen units should feel like one army, one studio, one art bible. Same color discipline, same shading philosophy, same outline treatment, same perspective angle.

---

## 3. Technical contract

These constraints are how the sprites integrate with the rest of Meridian.

### Component shape

Every unit is a React component with this interface:

```ts
type AgentState =
  | 'idle'
  | 'thinking'
  | 'tool_running'
  | 'streaming'
  | 'awaiting_permission'
  | 'done'
  | 'error';

type TransientAnimation =
  | 'spawning'    // one-shot when the unit first appears (subagent emerging)
  | 'deploying'; // one-shot when this unit spawns a subagent

interface UnitProps {
  state: AgentState;
  transient?: TransientAnimation;  // optional one-shot layered over the persistent state
  accent: AccentColor;   // one of six, see §4
  size?: number;         // display size in px (default: 64). Sprite stays at 48px native; size scales via CSS.
  facing?: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';  // default: 'S' (facing screen-down)
}
```

Note on `facing`: top-down units face one of 8 compass directions. For v1, design the unit in *one* direction (default: facing screen-down / south, since that's the most readable angle for the commander's view) — the others can be derived by SVG transform if needed. Note in the README which direction your unit is drawn in.

### Output format

- One React component per unit, in its own file, named per §7 (e.g., `Marine.tsx`, `Engineer.tsx`).
- Pixel art rendered as **SVG with one `<rect>` per pixel**. This keeps everything in code, scales cleanly with `size`, and allows runtime accent palette swap. No external PNG assets.
- Animations via CSS keyframes in scoped `<style>` blocks. Frame transitions snap (no interpolation between states).
- `image-rendering: pixelated` (and `crisp-edges` fallback) applied via the scoped style block.
- Self-contained — no external CSS files, no Tailwind classes inside the SVG.

### Performance budget

Up to **20 instances on screen at 60fps on a 2020-era MacBook Air**. Pixel-art SVG is cheap, but mind the per-frame DOM updates if animations are aggressive.

### Reduced motion

Every unit respects `prefers-reduced-motion: reduce` — animations freeze to a single representative frame per state. The accent color and pose still communicate state; only the motion stops. Implement via media query in the scoped style block.

---

## 4. Accent palette & palette swap

Each unit has a **base intrinsic palette** plus a designated **team-color zone** of 2–4 pixels that takes the agent's runtime accent at render time. This is the StarCraft / C&C team-color convention.

Examples of team-color zones (visible from above):

- Marine: helmet visor strip (visible from above as a top-edge stripe)
- Engineer: shoulder light + welder tip glow
- Starfighter: cockpit canopy + engine glow trail
- Probe Drone: central optic
- Bio-Construct: bioluminescent dorsal vents

The six accents:

| Token | Hex | Mood |
|---|---|---|
| `slate` | `#64748b` | neutral, default |
| `blue` | `#3b82f6` | classic, technical |
| `violet` | `#8b5cf6` | creative, exploratory |
| `green` | `#22c55e` | growth, success |
| `orange` | `#f97316` | warm, attention |
| `rose` | `#f43f5e` | urgent, critical |

**Implementation:** the unit component receives the `accent` prop and substitutes the matching hex into the team-color zone's `<rect fill>` values. Everything else stays put.

For the `error` state, the accent inverts toward its dimmer cousin (`orange → smoldering ember`, `green → mossy shadow`, etc.). Define a per-accent "error tone" — your call.

**Terrain context.** The tactical field renders a planet-surface terrain background — v1 default is **Badlands** (dusty rock, neutral browns and grays). Accents must read against this terrain *and* against pure black / deep blue test backgrounds. Test all six accents against all three backgrounds.

---

## 5. Process

For each unit, we want **2–3 design directions** as your first pass — different visual interpretations of the same archetype — then a full state-animation pass on the chosen direction.

Concretely:

1. **Pilot session deliverable**: the Marine, all three direction variants as static poses in the top-down 3/4 RTS perspective (default facing screen-down), rendered side-by-side at native resolution and at 4× scale, with global accent toggle, against the three test backgrounds (pure black, deep blue, a Badlands-style dusty terrain swatch).
2. **Once a Marine direction is picked**: same session or next, design all nine animations for the chosen Marine — the seven persistent states plus the two transients. This is the canonical reference for every other unit.
3. **Subsequent sessions**: each new unit follows the same pattern — 2–3 directions, pick, animate.

You can surprise us. If a fourth direction reveals itself while designing, include it.

---

## 6. State animations — seven persistent states + two transients + one locomotion

These define the animation vocabulary. Each unit must convincingly express seven persistent states (§6.1–§6.7), two transient one-shots (§6.8), and one locomotion loop (§6.9). The *means* by which a Marine expresses "thinking" will differ from how a Starfighter or Bio-Construct expresses it — but each should be unmistakable for its state when viewed from above. Stationary units (Sentinel Turret, Siege Walker) skip §6.9 since they don't move.

**Top-down motion principle.** Vertical motion (chest rising, body bobbing forward) is largely invisible from above. Lean instead on **rotational motion** (turning, swiveling), **lateral shifts** (weight rocking side to side), **limb extensions** (arms reaching outward, weapons protruding further), **shadow size changes** (a small dilation/contraction reads as hovering or breathing), and **integral light pulses** (visor, vents, engines).

### 6.1 `idle`

**Purpose.** Agent is alive and waiting for orders. Baseline state.

**Motion vocabulary (top-down).** Subtle ambient presence. A Marine's shoulders shift weight side to side; weapon barrel sways slightly. A ship hovers — shadow expands and contracts subtly as it rises and falls a pixel or two. A drone's optic gently sweeps. A bio-construct's dorsal vents pulse rhythmically.

**Loop.** 4–6 frames, ~8 fps, fully looping.

**Avoid.** Anything attention-grabbing. The field might have ten idle units; if they all twitch, the commander can't focus.

### 6.2 `thinking`

**Purpose.** Agent is processing — inference, planning, deliberation.

**Motion vocabulary (top-down).** Visible deliberation. A Marine's head tilts toward its raised hand (touching comm bead) — readable from above as a head-rotation + hand-position cue. An Engineer's tool dips toward a wrist console. A ship's scanner dish rotates visibly. A drone's optic darts side to side. A bio-construct's eyes scan in a sweeping pattern.

**Loop.** 6–8 frames, ~10 fps.

**Avoid.** Generic spinning. Make it feel like the unit is *thinking*, not loading.

### 6.3 `tool_running`

**Purpose.** Agent is executing a tool call — reading a file, running a command, etc. May persist briefly or sustain across longer tool operations.

**Motion vocabulary (top-down).** Active work. A Marine's rifle extends forward as it sights down (length increases by 1–2 px). An Engineer's welding torch flares — bright sparks emit from the tool tip. A ship's forward gun flashes muzzle-bright. A drone's manipulator arm extends outward. A bio-construct lashes a claw — a limb whips out and retracts.

**Loop.** 4–6 frames, ~12 fps. Snappier than thinking.

**Avoid.** Same motion as `streaming`. These two need to be visually distinct at a glance.

### 6.4 `streaming`

**Purpose.** Tokens are streaming back from the model. The agent is mid-transmission.

**Motion vocabulary (top-down).** Communication outward. A Marine's helmet comm-bead pulses rhythmically; small accent-tinted dots emit briefly from the helmet (radio chatter). An Engineer's hand gestures expressively, arm waving. A ship's antenna spike pulses brightly. A drone's optic projects flickering light outward. A bio-construct's bioluminescent vents flicker in rhythm.

**Loop.** 4–6 frames, ~10 fps.

**Avoid.** Conflation with `thinking`. Streaming is *outward emission*; thinking is *internal processing*.

### 6.5 `awaiting_permission`

**Purpose.** Agent is paused, needs commander approval before proceeding. Patient but visible.

**Motion vocabulary (top-down).** Waiting with intent. A Marine rotates to face the commander's view (turns toward screen-down) and holds steady, weapon lowered. An Engineer holds the tool aloft, looking up. A ship's running lights blink in a slow attention pattern. A drone hovers locked in place, optic pointed at the commander.

**Loop.** 6–8 frames, ~6 fps (slower than idle — patience reads as slow).

**Visual augmentation.** A small `?` pixel-glyph above the unit's silhouette, integrated into the sprite (not a separate effect). Snaps in on the first frame, holds, snaps out on state transition. From a top-down view, "above the head" is *centered on the unit, offset up by ~6px*.

**Avoid.** Anything alarmed or rushed. The field might have five units waiting at once.

### 6.6 `done`

**Purpose.** Agent finished its turn. One-shot transition into a brighter idle.

**Motion vocabulary (top-down).** Quiet acknowledgment. A Marine snaps to attention briefly — body squares up, weapon shouldered (rifle silhouette rotates to vertical). An Engineer pockets the tool with a brief gesture. A ship dips one wing or settles its engines — a quick lateral roll. A drone bobs once (shadow expansion + contraction). A bio-construct gives a satisfied stretch — limbs extend then retract.

**Loop.** 6–10 frames, ~10 fps, one-shot (not looping). On completion the unit transitions back to `idle`, with the idle loop running at slightly increased brightness in the team-color zone for ~2 seconds before settling.

**Avoid.** Celebration animations — no fireworks, no confetti, no Pokémon-evolution-flash. This is a quiet "objective complete."

### 6.7 `error`

**Purpose.** Agent hit an unrecoverable error or is stuck. Persistent state.

**Motion vocabulary (top-down).** Defeat, not alarm. A Marine sags — body silhouette tilts asymmetrically, weapon droops. An Engineer's tool hangs limp at the side. A ship lists — visible as the silhouette rotating off its level axis by a few degrees, running lights dimmed. A drone droops on its hover — shadow flattens. A bio-construct curls inward — limbs retract toward the body.

**Color shift.** Team-color zone shifts to the accent's error tone (dimmer cousin). Some pixels of the unit itself may dim by 1 shade.

**Loop.** 4–6 frames, ~4 fps (very slow). Subtle.

**Avoid.** Red palettes regardless of accent, flashing, sparks, anything that reads as alarm. The field might have five errored units. Loud error states across many units would be exhausting to look at.

### 6.8 Transient animations — `spawning` and `deploying`

These are **one-shot** animations layered on top of whichever persistent state the unit is currently in. They play once, then automatically yield back to the underlying state. Used to dramatize subagent lifecycle moments — a parent agent spawning a subagent triggers `deploying` on the parent and `spawning` on the new subagent simultaneously.

#### `spawning`

**Purpose.** A subagent has just been deployed — the unit visibly *arrives* on the field rather than fading in. This is the unit's birth moment.

**Motion vocabulary (top-down).** Unit-appropriate emergence. A Marine drops in from above — drop pod shadow expands rapidly on the terrain, then the pod cracks open (sprite emerges, pod halves separate to the sides, fade out). A drone unfolds from a stowed configuration — body inflates from a flat-folded silhouette. A bio-construct uncoils from a coiled-tight position. A ship drops from FTL — brief compression-then-snap, with a bright flash on the terrain beneath. An Engineer materializes as a teleport flash dissipates.

**Loop.** 6–10 frames, ~12 fps, one-shot. On completion the unit settles into `idle`.

**Avoid.** Long elaborate sequences — this fires every time a subagent spawns and may happen often. Keep it under 1.5 seconds total.

#### `deploying`

**Purpose.** A unit is *emitting* a subagent — counterpart to `spawning`. Plays on the parent at the moment of subagent creation, in parallel with the new subagent's `spawning` animation.

**Motion vocabulary (top-down).** Unit-appropriate deployment, with gesture direction *toward* where the child will appear. A Marine signals overhead (one arm raises and points). An Engineer slaps a button on a deployment kit at its side. A ship opens a hangar bay — a hatch panel slides open on the dorsal hull. A capital ship's bridge tower flashes dispatch lights. A bio-construct extrudes a small pod from its dorsal side.

**Loop.** 4–8 frames, ~12 fps, one-shot. On completion the unit returns to whatever persistent state it was in.

**Avoid.** Conflation with `tool_running` — both involve active gesture. Make `deploying` clearly outward/relational (the gesture is *toward* where the child will appear) rather than inward/focused.

**Pairing.** Not every unit deploys every other unit, but you don't need to design custom per-pair animations — a single generic `deploying` per unit is fine for v1. Sensible pairings the design should anticipate (so the gesture's direction reads natural):

- Marine / Engineer / Field Tech → Probe Drone, Combat Drone
- Capital Ship → Starfighter, Interceptor, Dropship, Probe Drone
- Dropship → Marine, Engineer, Field Tech, Recon Scout
- Engineering Walker → Sentinel Turret, Probe Drone
- Bio-Construct → a smaller Bio-Construct
- Assault Mech / Light Walker → Combat Drone

### 6.9 Locomotion — `walk`

**Purpose.** Plays during cosmetic idle wander (see SPEC §2.4). Units occasionally shift position by a few pixels during downtime to keep the field reading as a living battle scene rather than a static dashboard. The `walk` animation is the locomotion loop used during these wander moves.

**Motion vocabulary.** Unit-appropriate forward locomotion. Humanoids (Marine, Engineer, Field Tech, Recon Scout) use a two-step gait with alternating legs. Mechs and walkers use slower, heavier multi-leg cycles appropriate to their leg count. Spacecraft and drones glide forward (no legs to animate — body translates with engine glow trail). Bio-Construct creeps with organic asymmetric limb articulation.

**Loop.** 6–8 frames, ~8 fps, fully looping. Direction-of-travel matches facing — a unit walking east plays the walk loop with east-facing sprites.

**Stationary exception.** Sentinel Turret and Siege Walker do not get a `walk` animation. Sentinel Turret has no legs and is permanently anchored. Siege Walker has legs but is rooted artillery by spec — its anchored personality is core to the unit's identity. Both skip `walk` entirely; the wander system excludes them via the `canWander: false` flag.

**Avoid.** Running, sprinting, urgent motion — wander is slow and deliberate. Walks should read as "ambient repositioning," not "moving with purpose."

---

## 7. The 16-unit roster

Four categories, four units each. Each unit entry gives **archetype**, **top-down silhouette**, **team-color zone**, **personality cue**, and **directions to explore**.

All silhouettes are described from the **top-down 3/4 RTS perspective** — what the commander sees looking down at the unit on the terrain.

---

### Infantry — close-range humanoid ground units

#### 7.1 `Marine` — heavy armored infantry (PILOT)

- **Archetype.** Standard-issue space soldier. Bulky armor, helmeted, rifle-equipped.
- **Top-down silhouette.** Circular helmet at center, broad shoulder pauldrons extending laterally as two short bumps either side of the helmet. Rifle protrudes forward (1–2 px past the front of the body). Boots/legs trail rearward as two short pixel-tabs. Reads as 'helmeted soldier with forward-pointed weapon' from bird's eye.
- **Team-color zone.** Visor strip on the front edge of the helmet, 3–4 pixels wide.
- **Personality.** Disciplined, reliable, by-the-book.
- **Directions to explore.**
  - **A. Standard issue.** Bulky utilitarian armor, full-face visor, boxy rifle.
  - **B. Veteran scout.** Lighter armor, segmented plates, exposed under-suit details, carbine instead of rifle.
  - **C. Heavy trooper.** Larger frame, additional pauldron plating (generic, not Warhammer-coded), heavy weapon.
- **Avoid.** No specific N7-style stripes (Mass Effect), no Space Marine pauldron iconography (Warhammer), no Halo Spartan visor shape, no specific Aliens Colonial Marine details.

#### 7.2 `Engineer` — utility/builder unit

- **Archetype.** Combat engineer. Practical gear, visible toolkit, repair welder.
- **Top-down silhouette.** Similar to Marine head/torso but asymmetric — toolkit visible as a square bump on one side of the body, welder/tool extends from the opposite hand. Slightly smaller overall than Marine.
- **Team-color zone.** Shoulder light + welder tip glow.
- **Personality.** Hands-on, focused, talkative.
- **Directions to explore.**
  - **A. Field engineer.** Coveralls + light vest, welder, multi-tool belt.
  - **B. Combat tech.** Heavier armor than coveralls but lighter than Marine, hex-grid plating, deployable-turret kit on back.
  - **C. Repair specialist.** Bulkier with a backpack-mounted toolkit, dual manipulator claws extending over shoulders.
- **Avoid.** No Mass Effect Engineer-class iconography, no specific Halo Marine engineer cues.

#### 7.3 `Field Tech` — medic/scanner/support

- **Archetype.** Combat support specialist. Scanner array, medkit, lighter armor.
- **Top-down silhouette.** Same Marine-base frame but visually softer (less plate emphasis). Scanner dish or wand extends forward; satchel visible as an asymmetric bump on one hip.
- **Team-color zone.** Shoulder pauldron strip + scanner display.
- **Personality.** Calm, attentive, scientific.
- **Directions to explore.**
  - **A. Medic.** Cross/caduceus-free medical insignia (use generic teal/white cross of equipment), satchel of supplies, handheld scanner.
  - **B. Scientific officer.** Less armored, lab-coat-over-suit aesthetic, larger scanner array, data tablet.
  - **C. Forward observer.** Tactical assistant with binoculars/scope, radio backpack.
- **Avoid.** Star Trek tricorder silhouette specifically. Red Cross symbol (it's a protected emblem). Specific Mass Effect Salarian/Asari cues.

#### 7.4 `Recon Scout` — fast/light scout infantry

- **Archetype.** Lightly armed reconnaissance. Stealth gear, low-profile silhouette.
- **Top-down silhouette.** Smaller and more elongated than Marine — the crouched stance reads as compressed-from-above, so the unit's footprint is oblong (longer than wide). Compact sidearm or scoped carbine extends forward.
- **Team-color zone.** Optic visor + a small chest indicator.
- **Personality.** Watchful, quiet, quick.
- **Directions to explore.**
  - **A. Stealth operative.** Hooded, lightweight bodysuit, suppressed sidearm, low-light optics.
  - **B. Pathfinder.** Tactical jacket + lightweight plate, sniper-style scoped rifle, range finder.
  - **C. Drone operator.** Lightly armored, holding a hand-launched recon drone (note: this is sprite detail, not the §6.8 subagent companion).
- **Avoid.** No Solid Snake / Sam Fisher silhouettes specifically, no Mass Effect Infiltrator cues.

---

### Mechs — bipedal/multi-leg walkers

#### 7.5 `Light Walker` — scout mech

- **Archetype.** Two-legged scout walker. Cockpit canopy, sensor head, light weapons.
- **Top-down silhouette.** Cockpit canopy as a central rounded shape (the focal point from above). Two reverse-jointed legs extend out diagonally from the body — visible as elongated tabs angled outward. Antenna spike protrudes upward from the cockpit (visible from above as a small dot at center).
- **Team-color zone.** Cockpit canopy + chest plate stripe.
- **Personality.** Nimble, observant.
- **Directions to explore.**
  - **A. Hopper.** Compact, sprung-leg posture, single twin-barrel weapon.
  - **B. Sentinel.** Taller and lankier, dish-shaped sensor head, single ranged weapon.
  - **C. Strider.** Wider stance, more stable, dual light weapons on either side of the cockpit.
- **Avoid.** AT-ST silhouette (Star Wars), specific MechWarrior chassis cues, Titanfall Stalker form.

#### 7.6 `Assault Mech` — heavy bipedal combat

- **Archetype.** The signature mech. Heavy bipedal walker, large weapon arms, armored cockpit.
- **Top-down silhouette.** Wide squat body — broader laterally than the Marine. Cockpit visible as a recessed circle near the body center. Weapon arms extend laterally either side (visible as two protrusions widening the unit's lateral footprint). Reads as 'heavy bipedal war machine viewed from above.'
- **Team-color zone.** Chest core + shoulder caps.
- **Personality.** Implacable, methodical, heavy.
- **Directions to explore.**
  - **A. Brawler.** Symmetrical, heavy autocannons on both arms, broad armored shoulders.
  - **B. Skirmisher.** Asymmetric — one large weapon arm, one manipulator/lighter weapon arm. More dynamic stance.
  - **C. Bulwark.** Wider and heavier, shield-arm + cannon-arm, defensive posture.
- **Avoid.** AT-AT / AT-ST silhouettes (Star Wars), specific BattleMech designs (Warhammer, Atlas), Titanfall Ogre form.

#### 7.7 `Siege Walker` — heavy artillery walker

- **Archetype.** Quadruped or tripod artillery platform. Massive primary weapon, slow.
- **Top-down silhouette.** Low and broad — the broadest footprint in the roster. Multiple legs splayed outward in a star or X pattern (visible as 3–4 elongated tabs from the central body). Massive gun barrel protrudes forward (the longest weapon protrusion in the roster). Reads as 'anchored artillery platform.'
- **Team-color zone.** Gun barrel band + dorsal armor stripe.
- **Personality.** Slow, deliberate, devastating when it commits.
- **Directions to explore.**
  - **A. Quadruped artillery.** Four splayed legs, central body, single massive barrel.
  - **B. Tripod siege.** Three legs in a stable triangle, rotating turret on top, twin barrels.
  - **C. Crawler.** Tracked rather than legged (still under "mech" category for our purposes), low profile, single huge gun.
- **Avoid.** AT-AT (Star Wars) walker silhouette, StarCraft Siege Tank specifically, Half-Life 2 Strider.

#### 7.8 `Engineering Walker` — utility mech

- **Archetype.** Construction/repair walker. Manipulator arms instead of weapons, hauling capacity.
- **Top-down silhouette.** Bipedal core, but visually busier than other walkers — multiple manipulator arms visible radiating outward from the torso (3–4 short protrusions in various directions). Cockpit on top visible as a recessed circle.
- **Team-color zone.** Cockpit + manipulator joint glows.
- **Personality.** Useful, methodical, ever-tinkering.
- **Directions to explore.**
  - **A. Builder.** Two heavy manipulator arms, prominent welding rig, cargo cradle on back.
  - **B. Salvager.** Crane-like extending arm, magnetic gripper, hopper on back.
  - **C. Bulldozer.** Heavy plow attachment on front, dual short arms.
- **Avoid.** Disney WALL-E silhouette specifically, Aliens Power Loader (which is itself iconic).

---

### Spacecraft — aerial / orbital units

(These hover above the terrain — visible shadow beneath establishes their altitude. The sprite itself shows the dorsal hull seen from above.)

#### 7.9 `Starfighter` — small fast attack craft

- **Archetype.** Single-seat fighter. Engine glow, swept wings, forward weapons.
- **Top-down silhouette.** Pointed nose forward (visible as a tapered tip at the front of the body). Wings extend laterally — either swept-back (forming a delta) or Y-fold (two wings spread above the central hull). Twin engines visible as glow points at the rear. Reads as 'small fast aerial craft viewed from above.' Hovers ~3 px above its shadow.
- **Team-color zone.** Cockpit canopy + engine glow.
- **Personality.** Quick, eager, mobile.
- **Directions to explore.**
  - **A. Wedge fighter.** Triangle profile, twin engines tucked under, single canopy.
  - **B. Y-fold fighter.** Two wings spread in a Y configuration.
  - **C. Bladed interceptor.** Long thin body with narrow swept wings, almost dart-like.
- **Avoid.** X-wing silhouette, TIE fighter silhouette, Viper (BSG) silhouette, F-302 (Stargate).

#### 7.10 `Interceptor` — defensive fast craft

- **Archetype.** Lighter and twitchier than the Starfighter. Built for short-range defensive engagement.
- **Top-down silhouette.** Smaller and more rounded than Starfighter — body footprint closer to a fat ellipse. Oversized engine glows trailing rearward (the engines are large enough to be a defining visual element from above). Hovers ~3 px above shadow.
- **Team-color zone.** Engine glow + nose strip.
- **Personality.** Snappy, defensive, agile.
- **Directions to explore.**
  - **A. Bubble interceptor.** Round canopy, compact body, twin tail-stabilizers.
  - **B. Wedge interceptor.** Smaller version of Starfighter wedge, oversized engines.
  - **C. Disc interceptor.** Flat circular profile (UFO-ish but not a flying saucer — more like a flying disc fighter).
- **Avoid.** TIE Interceptor silhouette, generic UFO clichés.

#### 7.11 `Dropship` — transport vessel

- **Archetype.** Boxy utility transport. Cargo bay, side thrusters, defensive turrets.
- **Top-down silhouette.** Rectangular boxy hull viewed from above. Cargo door visible as a paneled section on top. Engines at corners or sides visible as glow points. Optional turret bump on the dorsal hull. Reads as 'utility transport.' Hovers ~4 px above shadow (slower, heavier).
- **Team-color zone.** Side hull stripe + cockpit window.
- **Personality.** Workhorse, reliable, slightly slow.
- **Directions to explore.**
  - **A. Brick transport.** Pure utility box with engines, no pretense.
  - **B. Combat dropship.** Same boxy body but with visible side turret mounts and chunkier armor.
  - **C. Heavy lifter.** Larger, slower, with cargo containers slung underneath the hull.
- **Avoid.** UD-4L Cheyenne dropship (Aliens) silhouette specifically, Pelican (Halo) silhouette, USS Sulaco (Aliens) shape.

#### 7.12 `Capital Ship` — large carrier/battleship

- **Archetype.** Massive command vessel. Long hull, multiple engine banks, visible gun batteries or hangar bays.
- **Top-down silhouette.** Elongated hull (significantly taller than wide from this angle — fills the 48×48 box vertically). Bridge tower visible as a small recessed bump near one end. Hangar bay opening or gun emplacements visible along the hull. Multiple engine glows trail rearward. Largest unit in the roster — should still fit 48×48 by using a thin elongated proportion. Hovers ~5 px above shadow (heaviest).
- **Team-color zone.** Bridge tower light + a hull stripe.
- **Personality.** Commanding, anchored, slow.
- **Directions to explore.**
  - **A. Carrier.** Long flat-deck top, suggestion of fighter launch bays.
  - **B. Battleship.** Bristling with gun emplacements, prominent bridge tower.
  - **C. Command ship.** Less weaponized, more antenna arrays and command tower.
- **Avoid.** Star Destroyer silhouette (Star Wars), Normandy SR-2 (Mass Effect), Enterprise saucer-and-nacelles, Galactica configuration.

---

### Drones & Constructs

#### 7.13 `Probe Drone` — small autonomous scout

- **Archetype.** Floating sensor drone. Single optic, minimal manipulators, hovers.
- **Top-down silhouette.** Small circular or disc-shaped body (one of the smallest sprites). Central optic visible as the focal point — often *is* the team-color zone. Possibly small thin probe arms extending. Hovers ~3 px above shadow.
- **Team-color zone.** Central optic.
- **Personality.** Watchful, curious, mobile.
- **Directions to explore.**
  - **A. Eye-orb.** Spherical body, single large central optic, tiny thrusters.
  - **B. Disc probe.** Flat disc with optic on the underside (visible as a glow on the shadow beneath), small antenna array on top.
  - **C. Insectile.** Body with two short manipulator legs extending forward, eye-cluster optic.
- **Avoid.** Probe Droid (Star Wars) silhouette, Sentry (Half-Life) shape, Geth Recon Drone (Mass Effect).

#### 7.14 `Combat Drone` — small attack drone

- **Archetype.** Aggressive drone with visible weapon mount. Hovers, mobile.
- **Top-down silhouette.** Larger than Probe Drone — asymmetric, with a weapon mount visible extending in one direction. Body shape often quadrangular (compared to the Probe's circle). Hovers ~3 px above shadow.
- **Team-color zone.** Weapon barrel base + central optic.
- **Personality.** Aggressive, twitchy.
- **Directions to explore.**
  - **A. Gun-drone.** Flat body with a single gun pod underneath, twin sensor optics.
  - **B. Sting drone.** Vertical body with a downward-pointing weapon barb, two side optics.
  - **C. Quad-thruster.** Four thrusters in a square, central body, weapon mount underneath.
- **Avoid.** Hunter-Killer drone (Terminator) silhouette, ED-209 form.

#### 7.15 `Bio-Construct` — alien/biological creature

- **Archetype.** Non-mechanical unit. Organic creature, claws, carapace, alien biology. Distinct from all the metal of the other units.
- **Top-down silhouette.** Asymmetric and organic — no straight lines anywhere. Claws/tentacles/limbs visible radiating outward from a central body. Dorsal vents on the upper surface (visible from above). Reads as 'alive and strange' — the only unit whose silhouette has no hard geometry.
- **Team-color zone.** Bioluminescent dorsal vents + eye glow.
- **Personality.** Patient, alien, unsettling-but-not-hostile.
- **Directions to explore.**
  - **A. Carapace stalker.** Quadrupedal, low-slung, segmented carapace, single large eye and multiple smaller eyes.
  - **B. Tentacled assembler.** Stationary base with three or four manipulator tentacles extending outward.
  - **C. Skitterer.** Insectile, six legs, low body, twin scanning antennae.
- **Avoid.** **Critical IP zone.** No Xenomorph cues (no second jaw, no elongated dome head, no biomech ribbing, no acid-drool, no Giger surface texture). No Zerg cues (no specific Hydralisk/Zergling silhouettes). No Tyranid (40K) cues. No Halo Flood form. No Necromorph (Dead Space).

#### 7.16 `Sentinel Turret` — stationary defensive unit

- **Archetype.** Anchored gun emplacement. No movement base, only rotation/elevation. Defensive.
- **Top-down silhouette.** Circular wide base visible flush with the terrain (no shadow gap — it sits on the ground). Rotating top section with gun barrel(s) extending in one direction (the only animated rotation in idle). Reads as 'anchored gun emplacement.'
- **Team-color zone.** Scope/sensor on the turret head + base stripe.
- **Personality.** Patient, watchful, doesn't move.
- **Directions to explore.**
  - **A. Twin-gun turret.** Symmetric twin barrels on a low rotating base.
  - **B. Cannon turret.** Single large barrel, hexagonal base.
  - **C. Missile pod.** Vertical launch tubes on a rotating base, no horizontal barrel.
- **Avoid.** TF2 Engineer sentry silhouette, Half-Life turret form, specific Aliens Sentry Gun shape.

---

## 8. Composition with the dashboard

Each unit needs to compose with the tactical field around it:

1. **No bleed past 48×48 (with a 1-pixel allowance for animation overshoot).** A Marine raising a rifle, a Walker extending a leg — these can briefly exceed the box, but the base resting frame stays inside. This gives the tactical field predictable spacing.
2. **Shadow-centered anchoring.** Each unit sits over a small soft pixel-art shadow on the terrain. The shadow is the unit's *position* on the field. Bobbing or hovering animations move the unit silhouette up/down by 1–4 px while the shadow stays put. The shadow may expand/contract by 1 px to suggest altitude change but doesn't translate. This is what sells the top-down perspective.
3. **Facing matters.** Units face one of 8 compass directions. Design in the default (`S` — facing screen-down) for v1; other directions derive via SVG rotation. The tactical field may rotate the sprite to face a message recipient, point at a target, etc.
4. **Terrain context.** The tactical field renders a planet-surface terrain — v1 is **Badlands** (dusty rocky neutral tones). Sprites must read against this terrain. Add a subtle 1-pixel dark outline to all sprites for legibility against varied terrain colors. Test sprites against three backgrounds: pure black, deep blue `#0a1628`, and a Badlands-style dusty terrain swatch (warm browns, beige, gray-tan).

---

## 9. IP guardrails

These designs must be **fully original**. Drawing on the *tropes* of the genre is fine; replicating any specific design is not.

**Hard avoid list — do not reference, do not approximate:**

- **Star Wars** — no AT-AT, AT-ST, X-wing, TIE fighter, Star Destroyer, Stormtrooper armor, Mandalorian silhouette, Probe Droid.
- **StarCraft** — no Terran Marine specific bipedal armor shape, no Siege Tank specifically, no Zerg unit silhouettes, no Protoss energy aesthetic.
- **Warhammer 40K** — no oversized Space Marine shoulder pauldrons with chapter iconography, no Tyranid, no Imperium iconography.
- **Aliens / AVP** — no Xenomorph (no second jaw, no dome head, no biomech ribbing, no acid drool, no Giger surface). No Colonial Marine specific armor (UD-4L dropship, pulse rifle).
- **Halo** — no Spartan armor, no Master Chief visor shape, no Pelican silhouette, no specific Covenant or Flood designs.
- **Mass Effect** — no N7 stripes, no Geth, no Reapers, no Normandy.
- **Stargate** — no F-302, no Goa'uld glider.
- **Battlestar Galactica** — no Viper, no Cylon Centurion, no Galactica configuration.
- **Half-Life / Portal** — no Strider, no Combine soldier, no Sentry Turret form.
- **Terminator** — no T-800, no HK-Aerial, no Endoskeleton.
- **MechWarrior / Titanfall** — no specific mech chassis.
- **Dead Space** — no Necromorph.
- **TF2** — no Engineer Sentry.

**Soft avoid list — recognize the trope but don't replicate the iconic instance:**

- Generic "space marine" is fine; a specific recognizable space marine is not.
- "Bipedal mech with cockpit" is fine; AT-ST is not.
- "Alien biological creature with claws" is fine; Xenomorph is not.

**When in doubt, push toward functional/industrial-utilitarian and away from "cool". The most copied designs are the ones with strong signature flair. Plain, sturdy, slightly worn — these are unowned design spaces.**

---

## 10. Acceptance criteria

- 20 instances render concurrently at 60fps on a 2020-era MacBook Air.
- Reduced-motion fallback engages correctly when `prefers-reduced-motion: reduce` is set.
- Each unit's state is recognizable from across the room — a commander glancing at the field can identify what each agent is doing without reading text.
- All 16 final units share a coherent visual language — they read as one army, one art bible, designed by one studio at one perspective.
- No fixed pixel coordinates outside the unit's 48×48 base box (1-pixel animation overshoot allowed).
- Team-color zones swap cleanly when accent prop changes.
- All units cast and respect their shadow anchor — top-down perspective is consistent across the roster.
- Sprites read clearly against the three test backgrounds (black, deep blue, Badlands terrain).
- No designs trigger the §9 hard-avoid list.

---

## 11. Out of scope

- The tactical field canvas itself, unit positioning, hover/selection effects, terrain rendering.
- Sound effects.
- Light mode (Command is dark-mode-only in v1).
- Damage states beyond `error` (no health bars in v1).
- Faction variants per unit (everyone's on the same team, distinguished only by accent).
- Voice / dialogue.
- Multi-direction sprite variants (only `S` / facing-screen-down designed for v1; other directions derive via rotation).

---

## 12. References & inspiration

For mood, perspective, technique, and **shading sensibility**, look at:

**Primary references — this is the target look:**

- **StarCraft (1998) / Brood War (1998)** — *the* primary reference for this work. Top-down 3/4 perspective, rendered-feel pixel art, rich shade ramps on small sprites, palette-swap team colors. The exemplar we're emulating. Note shape, perspective, and shading approach; don't copy specific designs.
- **Command & Conquer: Tiberian Sun (1999)** — same shading sensibility as SC1, slightly grittier mood. Strong reference for how to animate units convincingly through 4–6 frames.
- **Warcraft II (1995)** — slightly older but in the same rendered-2D-pixel-art family. Useful for thinking about how shading carries weight at very small sizes.
- **They Are Billions (2017)** — modern game that successfully revives the SC1 rendered-pixel-art aesthetic. Best contemporary reference for what we're aiming at.

**Secondary references — perspective and composition only, *not* shading:**

- **Command & Conquer: Red Alert (1996)** — for unit personality and animation discipline through limited frames.
- **Advance Wars** and **Into the Breach (2018)** — useful for top-down composition and the principle of strong silhouettes at small scale, but their **flat, clean** pixel art is *not* the look we want. Reference them for layout, not for surface treatment.

Avoid copying any of these. Internalize the technique, perspective, and shading approach; produce original designs.

---

## 13. Progress tracker

Update this section as work progresses. It serves as persistent memory across Claude Design sessions.

**At the end of each session**, output the updated `## 13. Progress tracker` section so it can be pasted back into the brief for the next session.

### Setup

- [ ] Meridian repo linked during project onboarding
- [ ] Design system loaded; accent palette matches §4
- [ ] §9 IP guardrails reviewed and acknowledged
- [ ] Top-down 3/4 perspective confirmed (§2)

### Pilot phase — Marine

- [ ] Marine direction variants generated (A, B, C, top-down 3/4 perspective, side-by-side at native + 4× scale)
- [ ] Marine direction chosen: _____
- [ ] Marine `idle` animation complete
- [ ] Marine `thinking` animation complete
- [ ] Marine `tool_running` animation complete
- [ ] Marine `streaming` animation complete
- [ ] Marine `awaiting_permission` animation complete
- [ ] Marine `done` animation complete
- [ ] Marine `error` animation complete
- [ ] Marine `spawning` transient complete
- [ ] Marine `deploying` transient complete
- [ ] Marine shipped as `src/lib/commandSprites/Marine.tsx`

### Per-unit progress (sessions 2–16)

For each unit: track variants → direction → animations → ship.

#### Infantry
- [ ] **Engineer** (variants → chosen: ___ → 10 animations → shipped)
- [ ] **Field Tech** (variants → chosen: ___ → 10 animations → shipped)
- [ ] **Recon Scout** (variants → chosen: ___ → 10 animations → shipped)

#### Mechs
- [ ] **Light Walker** (variants → chosen: ___ → 10 animations → shipped)
- [ ] **Assault Mech** (variants → chosen: ___ → 10 animations → shipped)
- [ ] **Siege Walker** (variants → chosen: ___ → 9 animations → shipped — stationary, no walk)
- [ ] **Engineering Walker** (variants → chosen: ___ → 10 animations → shipped)

#### Spacecraft
- [ ] **Starfighter** (variants → chosen: ___ → 10 animations → shipped)
- [ ] **Interceptor** (variants → chosen: ___ → 10 animations → shipped)
- [ ] **Dropship** (variants → chosen: ___ → 10 animations → shipped)
- [ ] **Capital Ship** (variants → chosen: ___ → 10 animations → shipped)

#### Drones & Constructs
- [ ] **Probe Drone** (variants → chosen: ___ → 10 animations → shipped)
- [ ] **Combat Drone** (variants → chosen: ___ → 10 animations → shipped)
- [ ] **Bio-Construct** (variants → chosen: ___ → 10 animations → shipped)
- [ ] **Sentinel Turret** (variants → chosen: ___ → 9 animations → shipped — stationary, no walk)

### Wrap-up

- [ ] `CommandSpritesDemo.tsx` showing all 16 units in all 7 persistent states with trigger-button playback for the 2 transients
- [ ] `index.ts` barrel exporting all 16 unit components
- [ ] `README.md` documenting `UnitProps`, accent palette, state vocabulary, palette-swap pattern, reduced-motion behavior, top-down perspective convention
- [ ] All 16 units meet §10 acceptance criteria
- [ ] No designs trigger §9 guardrails
- [ ] Handoff bundle exported for Claude Code

---

## 14. Wrapper prompts

These are the chat messages you send Claude Design when starting each session. Attach this brief as a file.

### 14.1 Pilot session — Marine

> I've attached a design brief (`COMMAND-SPRITES-DESIGN-BRIEF.md`) for a pixel-art unit roster I'm building for the Command workflow in my app, Meridian. Please read it carefully — especially §0 (How to work this brief), §2 (Visual language, including the top-down 3/4 RTS perspective **and the rendered-feel shading sensibility — SC1-style, not Advance-Wars-style**), §6 (State animations), §7.1 (Marine), §9 (IP guardrails), §12 (References — note which are primary vs secondary), and §13 (Progress tracker).
>
> For this first session, work **only** on the Marine (§7.1). The goal is to pilot the visual and animation vocabulary for the whole 16-unit roster before expanding.
>
> Specifically:
>
> 1. Generate the three direction variants from §7.1 (A: Standard issue, B: Veteran scout, C: Heavy trooper). Render them as static poses **in the top-down 3/4 RTS perspective** described in §2 — like StarCraft or Tiberian Sun, viewed from above and slightly behind. Default facing direction is `S` (screen-down). Side-by-side, labeled A/B/C, at both native 48×48 resolution and at 4× scale. Include a global accent toggle that swaps the team-color zone through all six accents from §4, and test against three backgrounds: pure black, deep blue `#0a1628`, and a Badlands-style dusty terrain swatch.
> 2. Wait for me to pick a direction before animating.
> 3. Once I pick, design all nine animations for the chosen Marine — the seven persistent state animations (§6.1–§6.7) plus the two transient one-shots (§6.8: `spawning` and `deploying`). Output the final component at `src/lib/commandSprites/Marine.tsx`.
> 4. Honor the §3 technical contract — SVG with `<rect>` per pixel, CSS keyframes for animation, `image-rendering: pixelated`, `prefers-reduced-motion` fallback, shadow-anchoring per §8.
> 5. Honor the §9 IP guardrails strictly. When in doubt, push toward functional/industrial and away from "cool."
>
> Do not work on any other units in this session — we're calibrating quality first.
>
> Before ending the session, output the updated `## 13. Progress tracker` section so I can paste it back into the brief for the next session.

### 14.2 Per-unit session

Replace `[UNIT]` and `[SECTION]` with the unit you're working on (e.g., `Engineer` / `§7.2`).

> I've attached the updated design brief. The Marine pilot is complete; §13 reflects the current state.
>
> For this session, work on the `[UNIT]` unit. Follow the same pattern as the Marine:
>
> 1. Generate the direction variants from `[SECTION]` (static top-down 3/4 poses, side-by-side, native + 4× scale, with global accent toggle and test backgrounds).
> 2. Wait for me to pick.
> 3. Design all nine animations for the chosen variant — seven persistent states + two transients. Match the visual family established by the Marine — same shading discipline, same outline treatment, same animation feel, same perspective angle.
> 4. Ship the final component at `src/lib/commandSprites/[UNIT].tsx`.
> 5. Honor the §3 technical contract and §9 IP guardrails.
>
> Do not work on other units in this session.
>
> Before ending the session, output the updated `## 13. Progress tracker` section.

### 14.3 Wrap-up session

> I've attached the final design brief. All 16 units have been designed and shipped — §13 confirms completion.
>
> For this session:
>
> 1. Build `CommandSpritesDemo.tsx` — a single demo page rendering all 16 units in all 7 persistent states, plus a trigger button per unit for each of the 2 transient animations. Background test set: pure black, deep blue `#0a1628`, Badlands-style terrain swatch. Include global controls for accent and reduced-motion.
> 2. Write the `index.ts` barrel exporting all 16 unit components.
> 3. Write `README.md` for `src/lib/commandSprites/` documenting the `UnitProps` interface, the accent palette, the state vocabulary from §6, the palette-swap pattern, the reduced-motion behavior, and the top-down perspective convention.
> 4. Verify each unit against §10 acceptance criteria.
> 5. Prepare the handoff bundle for Claude Code export.
>
> Before ending the session, output the updated `## 13. Progress tracker` with all wrap-up checkboxes completed.

---

## 15. Notes on running these sessions

- **Always attach the latest brief.** Claude Design has no cross-session memory.
- **Don't skip the closing instruction.** The "output the updated §13" line at the end of each prompt is what makes the memory pattern work.
- **Resist scope creep.** If Claude Design offers to also start on the next unit "while it's at it," politely decline. One unit per session, nine animations each, keeps quality high.
- **Iterate inside a session before moving on.** If an animation isn't right, ask for refinements in the same session.
- **Watch for perspective drift.** Every few sessions, check that new units are still in the same top-down 3/4 perspective as the Marine. Pixel art is unforgiving — perspective slipping by even a few degrees across the family will read as inconsistent.
- **Watch for IP drift.** Same vigilance against the §9 guardrails. Early designs sometimes anchor to forbidden silhouettes without anyone noticing.
