# Command — Multi-Agent Tactical Workflow Spec

> Status: **Draft v1.0**. Pre-implementation. Architectural decisions locked; sprite roster and role prompts open for iteration.

A new top-level workflow in Meridian that turns Claude Code, Codex, and Gemini sessions into a unified, space-battle-themed multi-agent dashboard. Each agent is a **unit fighting on a planet surface**, rendered as 32-bit pixel art viewed from a **top-down 3/4 RTS perspective** (StarCraft / Tiberian Sun style). Inspired by classic late-90s RTS aesthetics; designed for engineering-leader workflows.

---

## 1. Overview

Command is Meridian's home for long-running, interactive coding agents. Where today's workflows (PR Review, Groom Ticket) are single-shot LangGraph runs that produce a report, Command hosts **persistent interactive agents** — each with its own pixel-art unit identity, role, project, and conversation history — that the user can launch, chat with, switch between, coordinate via agent-to-agent messaging, and archive.

**Core loop:** deploy multiple units to the tactical field, glance at the field to see who is doing what (state is communicated through each unit's own animation), click a unit to open its chat panel on the right, and let units coordinate with each other through a local messaging channel.

**What it is not:** a replacement for the existing LangGraph workflows. PR Review and Groom Ticket continue to live in their own screens for batch analysis. Command is the interactive surface — though it surfaces those workflows as **preset roles** that bake the prompts and skills into freeform agents.

---

## 2. User Experience

### 2.1 Screen layout

Three panes:

```
┌───────────────────────────────────────────────────────────────┐
│  Command                                [+ Launch] [Archive]  │ ← header
├──────────────────────────────────────────┬────────────────────┤
│                                          │                    │
│             TACTICAL FIELD               │   UNIT CHAT        │
│   (animated canvas, units as sprites)    │   (selected unit)  │
│                                          │                    │
│     🪖     🛰️                            │   • streaming msgs │
│         🚀          ⚙️                   │   • tool calls     │
│              🔭                          │   • diffs          │
│                                          │   • permissions    │
│                                          │   • input box      │
├──────────────────────────────────────────┴────────────────────┤
│  Status strip: total units · idle · thinking · blocked        │ ← footer
└───────────────────────────────────────────────────────────────┘
```

- **Tactical field** fills the left/center. The field renders a top-down view of a planet surface — a **Command-specific terrain background, independent of Meridian's space-themed global background system** (which targets the rest of the app). v1 ships a single terrain (see §2.3); future terrains tracked as v1.1+. Units render over the terrain as pixel-art sprites viewed from a top-down 3/4 perspective, each casting a soft shadow on the ground beneath as the positional anchor. Units idle-wander slightly during downtime (see §2.4) so the field reads as a living battle scene rather than a static dashboard.
- **Chat panel** (right) is collapsible. Selected unit shows full conversation, streaming output, tool calls (collapsible), diffs (collapsible), inline permission prompts, files-touched list, commands-run list. Empty state when no unit is selected. When the selected unit has a parent or children (§5), an in-panel breadcrumb lets the user jump between related sessions.
- **Header** holds the Launch button (opens new-unit modal) and the Archive button (opens the historical sessions drawer).
- **Footer** is a compact status strip — counts by state.

### 2.2 Key user flows

1. **Launch a unit.** Header → Launch → modal with roster picker (available unit sprites — see the sprite brief; v0 ships 3 Infantry units with the remaining 13 queued as a roster expansion), role (preset dropdown: Implementer / PR Reviewer / Ticket Groomer / Researcher / Custom), project (existing Meridian projects), backend (Claude / Codex / Gemini) + model picker. On confirm, the new unit's `spawning` transient plays at a chosen field position, then settles into `idle`. Focus drops to the chat panel input.
2. **Switch between units.** Click any sprite on the field → chat panel shows that unit's history. Last-selected unit is remembered per workspace.
3. **Watch units work.** Each sprite animates per state — idle bob, thinking gesture, tool-running action, streaming radio pulse, etc. Subagents spawn as their own first-class sprites adjacent to their parent (§5).
4. **Unit-to-unit message.** Unit A calls the MCP messaging tool addressing Unit B. A signal arc renders between their positions; both transcripts get the event; B's chat panel surfaces an inbound-message card.
5. **Resume a past session.** Header → Archive → list of historical sessions with sprite + name + role + project + last-active. Click → resumes as a fresh sprite on the field, full history restored.
6. **Switch runtime mid-session.** Right-click sprite → Switch backend / model. The sprite plays a brief re-deploy animation; underlying session is recreated against the new backend.

### 2.3 Terrain

The tactical field renders its own planet-surface terrain background, separate from Meridian's global background system. This is the *ground* the units stand on, not space. It's what sells the StarCraft-style top-down view.

**v1: single terrain — `Badlands`.**

- Dusty rocky planet surface, neutral warm tones (browns, beige, gray-tan)
- Subtle parallax-friendly base layer + sparse rock/debris decoration sprites
- Pixel art at the same scale as the units (so terrain pixels and unit pixels share a grid)
- Dark enough to read against light-accented units, light enough to read against dark-accented ones
- Optional faint hex or grid overlay (configurable; default off) for tactical legibility

Chosen because Badlands is StarCraft's most iconic and neutral tileset — works as a foundation that doesn't bias the visual mood toward any single theme (no ice-cold, no lava-hot, no jungle-busy). Sprite accents read against it cleanly across all six colors.

**v1.1+ terrains** (tracked, not committed):

- `Ice` — cold blues and whites, cracked ice plate decoration
- `Lava` — dark with orange glow vents, magma fissures
- `Jungle` — alien greens and purples, vegetation sprites
- `Urban` — destroyed city / industrial debris

Terrain is selectable per-workspace, defaulting to Badlands. Persists with user preferences. Design of additional terrains is a separate Claude Design brief, not part of the sprite roster work.

**Implementation note.** The terrain is rendered by the `TacticalField` component (see §8.2) as a tiled base layer with sparse decoration sprites. Tiles are 32×32, sprites are 48×48. Both use `image-rendering: pixelated`.

### 2.4 Unit Movement — cosmetic idle wander

Units occasionally wander a few pixels in random directions while in `idle` state. This is **purely cosmetic** — there is no pathfinding, no autonomous behavior, no semantic meaning to where a unit moves. The point is liveliness: a battle scene where nobody moves doesn't read as a battle scene. Tiny shifts of position and facing make the field feel alive.

**Wander mechanics:**

- Each unit is placed at an **anchor point** at launch (auto-assigned by the system on a non-colliding grid). The anchor is fixed for the unit's lifetime.
- During `idle`, the unit may pick a random destination within ~30px of its anchor every 15–45 seconds (interval randomized per unit).
- The unit walks slowly to the destination using its `walk` animation (see §10) — takes 2–3 seconds per move, distance 5–15px.
- The unit's facing rotates to match its walk direction. When stopped, facing stays where it was.
- Wander cancels on state change. If the unit enters `thinking`, `tool_running`, etc., it stops walking and plays the new state animation in place. When it returns to `idle`, wander resumes.
- Soft collision: if a chosen destination would overlap another unit (within ~40px of another unit's current position), the unit picks a different destination. No pushing, no pathfinding around — just don't go there.
- If a unit drifts toward the edge of its anchor radius, its next wander pick biases back toward the anchor. Units don't drift across the field over time.

**Stationary units.** One unit in the roster has a `canWander: false` flag and never moves:

- **Sentinel Turret** — anchored gun emplacement, no legs. By design.

This unit skips the `walk` animation in the sprite library and never triggers wander. It still rotates facing (the barrel/scope) during certain states, but its body position is fixed.

The Siege Walker, despite its "heavy artillery" role, is implemented as a wandering unit (`canWander: true`) — it has a `walk` animation in the asset library and can reposition during idle wander. Its locomotion is slower and more deliberate than the Infantry units' (visually heavier gait), but it does walk.

**Direction model.** All units (including stationary ones for state animations) support **8 facing directions**: N, NE, E, SE, S, SW, W, NW. The unit's current facing is independent of its state — any state animation can play in any direction. PixelLab generates all 8 directions natively at character creation; no SVG rotation needed.

**Card thumbnails.** Anywhere a unit appears in UI chrome (launch modal roster picker, chat panel unit identifier, archive drawer thumbnails), it renders in **S-facing direction only**, regardless of its current field facing. Cards play the animated `idle` loop S-facing as the canonical view. This keeps the UI predictable — a user identifying a unit type from a list doesn't have to mentally rotate it.

---

## 3. Architecture

### 3.1 High-level component diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend                           │
│   src/screens/Command.tsx                                   │
│   src/components/command/*                                  │
│   src/lib/commandSprites/*       (per-unit sprite components)│
│   src/stores/commandStore.ts                                │
└──────────────────────────────┬──────────────────────────────┘
                               │ Tauri commands + events
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Rust Backend (Tauri)                      │
│   src-tauri/src/command/                                    │
│     - mod.rs           (Tauri command entry points)         │
│     - sessions.rs      (registry, parent/child lifecycle)   │
│     - acp_client.rs    (JSON-RPC over stdio)                │
│     - acp_spawn.rs     (per-backend launch config)          │
│     - storage.rs       (SQLite tables)                      │
│     - mcp_messaging.rs (A2A message server, loopback)       │
│     - events.rs        (Tauri event emission)               │
└──────────────────────────────┬──────────────────────────────┘
                               │ stdio (ACP / JSON-RPC)
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
       ┌─────────┐        ┌─────────┐        ┌─────────┐
       │ claude  │        │  codex  │        │ gemini  │
       │  CLI    │        │   CLI   │        │   CLI   │
       │ (ACP)   │        │  (ACP)  │        │  (ACP*) │
       └─────────┘        └─────────┘        └─────────┘
```

`* Gemini CLI ACP support to be verified — see §16.`

### 3.2 Process topology

- Rust host process owns SQLite, the MCP messaging server (loopback only), and the lifecycle of all child CLI subprocesses.
- The TypeScript sidecar is **not used** for Command sessions. ACP is a standardized JSON-RPC protocol over stdio; wrapping the CLI subprocesses directly in Rust is simpler, avoids a sidecar hop, and gives Rust direct control over per-process limits. The existing sidecar continues to host LangGraph workflows (PR Review, Groom Ticket) as before.
- One subprocess per unit. Subprocesses are restarted on backend/model switch.
- Stdio is wrapped with a structured JSON-RPC reader/writer; events stream back to the frontend via Tauri's event system (`emit("command:session:update", ...)`).

---

## 4. ACP Integration

ACP (Agent Client Protocol) is a JSON-RPC protocol that standardizes how a UI talks to an agent runtime. Both Claude Code CLI and Codex CLI implement it. Key methods Command will use:

- `initialize` — handshake, capability exchange.
- `session/new` — create a session in a working directory.
- `session/prompt` — send a user message; the agent streams back.
- `session/cancel` — interrupt the current turn.
- `session/load` — restore a saved session.

Streaming notifications (server → client):

- `session/update` — text deltas, tool-call start/end, agent state changes.
- `session/request_permission` — agent needs approval (read file, run command, etc.).

A single ACP client implementation in Rust, with per-backend launch configs:

```rust
enum BackendKind { ClaudeAcp, CodexAcp, GeminiAcp }

struct AcpLaunchConfig {
    binary: String,           // "claude" | "codex" | "gemini"
    args: Vec<String>,        // backend-specific flags to enable ACP mode
    env: HashMap<String, String>,
    cwd: PathBuf,             // project working directory
}
```

Each backend's launch config is read from `~/.meridian/command/backends.json` — per-model API key / endpoint overrides supported.

**Gemini caveat.** Gemini CLI's ACP support needs verification. If unavailable, options are (a) drop Gemini from v1, (b) keep Gemini via the existing `gemini -p` one-shot adapter as a degraded mode, or (c) build a small ACP-shaped wrapper. Recommend (a) and revisit for v1.1. Tracked in §16.

---

## 5. Subagent Lifecycle — Three-Level Rollout

When a parent unit calls the Task tool (or equivalent on Codex/Gemini), it spawns a subagent. Command supports three fidelity levels for how subagents surface visually. **v1 targets Level 2.** Level 3 is queued for v1.1. Level 1 is documented as a fallback in case Level 2's session-model work slips.

### 5.1 Level 1 — Sprite indicator only (fallback)

**Behavior.** Subagents are nested *inside* the parent session. The parent unit gets a small companion sprite hovering nearby (mini-drone, satellite, etc.) for as long as a subagent is active. Clicking the parent shows its transcript, which includes inline subagent activity as nested blocks.

**What's needed.** Per-unit companion sprite (~12×12 px), one shared design across the roster or per-parent-type variants. This is *not* in the current sprite brief — the brief targets Level 2 — but is straightforward to add later if needed.

**Why it's a fallback.** The user cannot inspect a subagent's stream independently. For long-running subagents this is frustrating. Acceptable for v0 demos; not for v1 ship.

### 5.2 Level 2 — First-class subagent sessions (v1 target)

**Behavior.** When the parent spawns a subagent, the Rust session manager creates a **new, first-class session** parented to the spawning session. The new session gets its own sprite on the tactical field, positioned adjacent to its parent, with a visual tether (a thin pixel-art line, signal beam, or gravitational pull cue drawn by the tactical-field canvas). The subagent has all 7 persistent states like any other unit and its own chat panel routing.

**Visual relationship.**

- The tether is rendered by the tactical-field canvas, not by either unit's sprite component. This keeps the unit components simple — they don't need to know about their relatives.
- Position: subagents spawn within ~80px of their parent and remain bound (drift slightly, never wander).
- Selecting the parent or the subagent in the chat panel shows that session's stream; an in-panel breadcrumb lets the user navigate between related sessions.

**Data model.** Sessions gain a `parent_id` field (already in §7). The session registry tracks the tree; the frontend's Zustand store maintains derived `children: SessionId[]` lookups for fast rendering.

**Lifecycle.**

- Subagent's session is created when the parent invokes Task; ACP `session/new` is called against the same backend with a child-session marker.
- When the subagent finishes, its sprite enters `done`, then either fades from the field after a delay or persists (configurable; v1 default: fade after 30s of `done`).
- Killing the parent kills all children.

**What's needed beyond v0.** New Rust commands (`session_spawn_child`, `session_get_tree`), new Tauri events (`command:subagent:created`, `command:subagent:terminated`), tactical-field tether rendering, chat panel breadcrumb. Sprites need *no* new animations for this level.

### 5.3 Level 3 — Spawn / deploy animations (v1.1)

**Behavior.** Same as Level 2, plus visual dramatization of the spawn moment. The subagent's sprite plays its `spawning` transient (one-shot, ~1s) as it appears, optionally preceded by a dropship descent (see §5.5). The parent simultaneously plays its `deploying` transient (one-shot, ~0.6s). A Marine deploys a Probe Drone, the Marine waves overhead while the Drone drops in from off-field; a Capital Ship's bridge flashes while a Starfighter unfolds beside it.

**What's needed beyond Level 2.**

- Per-unit `spawning` and `deploying` transient animations (already in the sprite brief, §6.8).
- Tactical-field choreography: when a spawn event fires, the field places the subagent's spawn position relative to the parent's facing direction, plays the transients in sync, and only registers the subagent as interactable after the transients complete.
- Optional: contextual deployment direction. A parent looking right deploys to its right; the new sprite emerges from that side. Adds polish; not strictly required.
- Dropship delivery system (see §5.5) for infantry, mech, and turret unit classes.

**Why split from Level 2.** Level 2 gives the user the functional value (inspect any subagent independently). Level 3 is fit-and-finish — the experience layer. Splitting them lets us ship interactive subagent inspection without blocking on the choreography work, which is genuinely more involved.

### 5.4 Subagent depth

V1 supports **arbitrary depth** at the data model level (sessions form a tree). Rendering-wise, the tactical field shows at most 2 levels of nesting visibly — a grandchild renders in a smaller adjacent position to its parent. Deeper levels are accessible via the chat panel breadcrumb but don't render distinct sprites (would clutter the field). v1.1 may revisit if heavy-orchestration patterns emerge.

### 5.5 Dropship delivery (v1.1)

All units arrive via a **spawn dropship** — a static dropship sprite that descends from above the tactical field, drops the unit near the ground, then ascends back out of frame. This dramatizes unit arrival as a coordinated military operation rather than units simply popping into existence.

**The dropship sprite** is a single static asset, not an animated character. Animation comes from the rendering layer translating its position over the spawn sequence — PixelLab generation of internal dropship animations (engine pulses, door opens, ramp deploys) was attempted but per-direction consistency on those small details proved unreliable. The dropship sprite is rendered facing south (toward viewer) regardless of where the receiving unit is facing; the dropship is a delivery vehicle, not a unit with its own facing logic.

**Spawn sequence.**

| Phase | Duration | Behavior |
|---|---|---|
| **A — Descent** | ~0.5s | Dropship enters frame from above, translates downward to a position ~20px above the spawn anchor on the ground. |
| **B — Drop** | ~0.7s | Dropship holds briefly above the spawn anchor. The receiving unit's `spawning` animation plays — unit appears below the dropship and drops to the ground anchor, landing in crouch then rising to idle. |
| **C — Ascent** | ~0.5s | Dropship translates upward and exits the top of frame. Unit remains in standard idle stance at the spawn anchor. |

Total spawn duration: ~1.7 seconds (vs the bare `spawning` animation's ~0.7s).

**Universal coverage.** Every unit in the v0/v1 roster (all ground units — Infantry, Mechs, and any other ground-class units added later) uses dropship delivery for `spawning`. No per-class exceptions. If future roster additions include flying units (spacecraft, drones), this section will need updating to define which units bypass the dropship — but currently no such units exist in the active roster.

**Visual layering.** The dropship renders above the unit on the z-axis during the spawn sequence (dropship is in the air, unit is on the ground). z-order priority during spawn: terrain → unit → dropship. After ascent (phase C complete), the dropship is removed from the render tree entirely.

**Overlap policy.** Multiple dropships may visually overlap if multiple units spawn at nearby anchors within the same 1.7s window. Overlapping is allowed — dropships are transient and the visual chaos is acceptable for the brief duration. No queueing or staggering needed.

**Dropship asset.** Single sprite at `src/lib/commandSprites/SpawnDropship.tsx` (or as a static asset under `src/lib/commandSprites/SpawnDropship/`). Rendered with appropriate scale (approximately 1.5× the size of an infantry unit), facing south, with cyan engine glow and orange accent markings (see sprite brief for visual specification).

**Disambiguation from the `Dropship` unit.** The roster's Spacecraft category includes a `Dropship` unit (§7.11 in the brief) — a user-deployable transport intended to operate as a regular unit when that category ships. The spawn dropship in this section is a different asset: a non-interactive visual prop used only during unit arrival. When both exist, they should be visually distinct to prevent user confusion — the spawn dropship is larger, has orange accent markings, and never persists on the field; the `Dropship` unit follows standard roster color conventions and is a controllable unit.

---

## 6. Agent-to-Agent Messaging

Command implements **local agent-to-agent (A2A) messaging** through an MCP server hosted in the Rust backend. The protocol is intentionally minimal — agents on the same machine, in the same Meridian instance, with a single user as commander.

**Note on Google's A2A Protocol.** Google launched a formal "Agent2Agent Protocol" in April 2025 for *cross-vendor* agent collaboration over HTTP. That standard is out of scope for v1 — Command's agents are all local, all spawned by the user, all visible in one dashboard. MCP-based messaging is right-sized. A2A Protocol becomes interesting only if Meridian's agents need to talk to *external* agents (CI/CD agents, vendor-provided Jira agents, etc.). Tracked as a v2+ open question in §16.

### 6.1 The MCP server

A new MCP server, hosted in the Rust backend, bound to `127.0.0.1` only, auto-registered with every Command-launched session via ACP's `session/new` MCP config. Exposes a single tool:

```jsonc
{
  "name": "send_message",
  "description": "Send a message to another agent on this Command field. Recipient can read it on their next turn.",
  "input": {
    "to": "agent-id-or-name",
    "subject": "string (optional)",
    "body": "string",
    "attachments": ["optional file paths"]
  }
}
```

### 6.2 Message routing

When an agent calls `send_message`:

1. Rust resolves the recipient (by session ID or unique name).
2. Routes the message into the recipient's inbound message queue (read by the recipient on its next turn via a system-injected context block).
3. Emits a `command:a2a:message` event to the frontend with sender, recipient, subject, body.
4. The tactical-field canvas draws a brief signal arc from sender's position to recipient's position (rendered by the field, not by either unit).
5. Both sessions' transcripts log the event.
6. The recipient's chat panel (if open) surfaces an inbound-message card the agent can choose to read or ignore.

### 6.3 Discoverability

Each agent can call a sibling tool, `list_agents`, returning the names + roles + status of other agents on the field. This is the v1 discovery story — simple, local, ambient. No need for Google A2A's Agent Cards in this scope.

### 6.4 Visual: signal arc

The signal arc rendered by the tactical field is a small pixel-art element — a thin accent-tinted line with a traveling brightness peak — drawn between sender and recipient positions. ~1.5 seconds. Fades on arrival. The arc is one of very few field-level visual elements that exists outside the per-unit sprite components (along with subagent tethers and grid lines). It's not a state effect; it's a transient relationship event.

---

## 7. Rust Backend Additions

### 7.1 New Tauri commands

| Command | Purpose |
|---|---|
| `command_list_units` | All active + archived sessions, with parent/child links |
| `command_launch_unit` | Spawn a new ACP session with config |
| `command_send_prompt` | Forward user input to a session |
| `command_cancel_turn` | Cancel current agent turn |
| `command_kill_unit` | Terminate session + process (cascades to children) |
| `command_resume_session` | Restore archived session |
| `command_switch_runtime` | Restart with new backend/model |
| `command_list_archive` | Browse historical sessions |
| `command_search_archive` | FTS over chat history |
| `command_grant_permission` | Approve/deny permission request |
| `command_list_files` | Files touched in a session |
| `command_list_commands` | Commands run in a session |
| `command_get_session_tree` | Return parent/child tree rooted at a session (Level 2 support) |

### 7.2 Module structure

```
src-tauri/src/command/
├── mod.rs              ← Tauri command entry points
├── sessions.rs         ← Session registry, tree management, lifecycle
├── acp_client.rs       ← Generic ACP JSON-RPC client over stdio
├── acp_spawn.rs        ← Per-backend subprocess launch config
├── events.rs           ← Tauri event emission, serializable payloads
├── storage.rs          ← SQLite schema, queries
├── mcp_messaging.rs    ← A2A messaging MCP server (loopback)
└── permissions.rs      ← Permission request routing + persistence
```

---

## 8. Frontend Architecture

### 8.1 New screen

`src/screens/Command.tsx` — follows Meridian's one-file-per-screen convention.

### 8.2 Component tree

```
src/components/command/
├── TacticalField.tsx        ← canvas + unit positioning, layout, tethers, signal arcs
├── UnitInstance.tsx         ← wraps a sprite component with state-driven prop wiring
├── UnitChatPanel.tsx        ← right pane; reuses chat patterns from PR Review Chat
├── LaunchUnitModal.tsx      ← roster picker, role, project, backend
├── ArchiveDrawer.tsx        ← historical sessions browser
├── SessionBreadcrumb.tsx    ← parent/child navigation inside chat panel
└── ActivityToast.tsx        ← cross-unit event surfacing

src/lib/commandSprites/
├── Marine.tsx, Engineer.tsx, … (16 unit components, see sprite brief)
├── index.ts                 ← barrel
└── README.md                ← documents UnitProps, palette swap, etc.
```

### 8.3 Zustand store

```ts
type AgentState =
  | 'idle' | 'thinking' | 'tool_running' | 'streaming'
  | 'awaiting_permission' | 'done' | 'error';

type TransientAnimation = 'spawning' | 'deploying';

type Facing = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

interface Unit {
  id: string;
  name: string;
  spriteId: SpriteId;          // one of the 16 unit types
  role: RoleId;
  projectId: string;
  backend: BackendKind;
  modelId: string;
  state: AgentState;
  transient?: TransientAnimation;  // one-shot, cleared by component on completion
  parentId?: string;
  childIds: string[];            // derived; maintained by store
  accent: AccentColor;
  contextUsage: number;          // 0..1
  lastMessage?: ChatMessage;
  anchorX: number;               // fixed at launch (auto-assigned), never changes
  anchorY: number;
  positionX: number;             // current live position, drifts within ~30px of anchor during wander
  positionY: number;
  facing: Facing;                // 8 compass directions, rotates during wander
  canWander: boolean;            // derived from spriteId (Sentinel Turret = false; all other units = true)
  isWandering: boolean;          // true while a wander move is in progress
  createdAt: number;
  lastActiveAt: number;
}

interface CommandState {
  units: Record<string, Unit>;
  selectedUnitId: string | null;
  archive: ArchiveEntry[];
  // …actions: launchUnit, selectUnit, sendPrompt, fireTransient, tickWander, etc.
}
```

`anchorX/Y` are persisted in `localStorage` so field layout survives reloads. `positionX/Y` and `facing` are also persisted so a unit that wandered before reload doesn't snap back to anchor — it picks up where it left off. Session metadata lives in Rust + SQLite. Wander updates happen entirely client-side (no Rust round-trip needed for cosmetic motion) on a `requestAnimationFrame` loop in the `TacticalField` component.

---

## 9. Data Model

### 9.1 Session record (Rust + SQLite)

```rust
struct SessionRecord {
    id: Uuid,
    name: String,
    sprite_id: String,           // one of the 16
    role_id: String,
    project_id: String,
    backend: String,             // "claude-acp" | "codex-acp" | "gemini-acp"
    model_id: String,
    accent: String,
    state: SessionState,
    parent_id: Option<Uuid>,     // Level 2 hierarchy
    anchor_x: f32,               // fixed placement at launch
    anchor_y: f32,
    position_x: f32,             // current live position (anchor + wander offset)
    position_y: f32,
    facing: String,              // "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW"
    created_at: i64,
    last_active_at: i64,
    archived: bool,
}
```

### 9.2 Chat message record

```rust
struct ChatMessage {
    id: Uuid,
    session_id: Uuid,
    seq: u64,
    role: MessageRole,           // User | Assistant | System | Tool | InboundA2A
    content_blocks: Vec<ContentBlock>,  // Text | ToolUse | ToolResult | Diff | Permission | A2AMessage
    created_at: i64,
}
```

ACP backends normalize into the same structure — adapters handle the per-backend translation.

---

## 10. Sprite & Animation Library

See [`COMMAND-SPRITES-DESIGN-BRIEF.md`](COMMAND-SPRITES-DESIGN-BRIEF.md) for the full design brief. Summary of what the codebase receives:

- **v0 ships 3 React components** at `src/lib/commandSprites/`: `Marine.tsx`, `Engineer.tsx`, `FieldTech.tsx` (the three Infantry units). The remaining 13 units across Mechs, Spacecraft, and Drones & Constructs are tracked as a roster expansion deliverable (see brief §13); 16 total when complete.
- **Spawn dropship asset** at `src/lib/commandSprites/SpawnDropship.tsx` (or static asset folder) — a single static sprite used as a visual prop during all unit spawn sequences (see §5.5). Not a unit, not interactive, no animations of its own. Position-translated by the rendering layer during spawn events.
- Uniform `UnitProps` interface: `{ state, transient?, accent, size?, facing }` — `facing` is one of 8 compass directions (N/NE/E/SE/S/SW/W/NW).
- **10 animations per wandering unit:** 7 persistent state animations (idle, thinking, tool_running, streaming, awaiting_permission, done, error) + 2 transient one-shots (spawning, deploying) + 1 locomotion loop (walk, used during cosmetic wander per §2.4).
- **9 animations for stationary units** (Sentinel Turret) — same as above but without `walk`. This unit never wanders and has no need for a locomotion loop.
- Each animation generated in all 8 directions. PixelLab handles rotation natively at character creation; no SVG transforms needed at runtime.
- SVG-rendered pixel art (one `<rect>` per pixel) for runtime palette swap
- `prefers-reduced-motion` fallback freezes to a representative frame per state, *and* disables wander (units stand still at anchor)
- Barrel `index.ts`, `README.md`, demo page

The library is **independent of `src/lib/spaceEffects/`** (used elsewhere in Meridian for procedural backgrounds). Command's sprite animations and `spaceEffects` do not compose — sprites carry their own state, no effects layer.

---

## 11. Preset Roles

Roles bake system prompt + skills + project defaults at launch. They run as **pure ACP agents** — no LangGraph involvement. The existing LangGraph workflows continue to live in their own screens for batch analysis.

Role files live as JSON in `~/.meridian/command/roles/` (one file per role), editable in the Command Settings tab.

**v0 sprite availability note.** The sprite roster ships incrementally. v0 includes 3 units (Marine, Engineer, Field Tech); the remaining 13 are queued. The default sprite assignments below reflect what's available at v0; they'll be revisited when the full roster lands — for example, PR Reviewer's natural default is Probe Drone (the original watchful-observer choice), Researcher's is Recon Scout, etc.

### 11.1 PR Reviewer

```yaml
title: PR Reviewer
default_sprite: field-tech    # v0; reverts to probe-drone when full roster lands
default_backend: claude-acp
default_model: opus-4-7
system_prompt: |
  You are a code reviewer operating on the user's worktree. Review changes
  across five lenses:
    1. Acceptance Criteria Compliance
    2. Security & Vulnerability Analysis
    3. Logic Error Analysis
    4. Testing (missing tests, edge-case gaps, @tags annotations on Bug tickets)
    5. General Code Quality
  Categorize every finding as Blocking, Non-blocking, or Nitpick.
  Cite file + line ranges for each. Re-read the worktree on demand for follow-up questions.
skills:
  - review-standards
  - implementation-standards
```

### 11.2 Ticket Groomer

```yaml
title: Ticket Groomer
default_sprite: engineer    # v0; original assignment was field-tech, reassigned to engineer for v0 to spread the 3 available units across the 4 preset roles
default_backend: claude-acp
default_model: sonnet-4-6
system_prompt: |
  You are a JIRA grooming agent. For the given ticket, surface blockers before
  pickup: missing acceptance criteria, missing story points, ambiguity, scope
  clarity issues, vague titles. Re-read the worktree on demand to ground your
  recommendations in actual code.
skills:
  - implementation-standards
```

### 11.3 Additional v1 presets

- **Implementer** — freeform engineering, no opinionated prompt; default sprite **Marine**.
- **Researcher** — read-only role with web/MCP tools, no write permissions; default sprite **Field Tech** at v0 (analytical observation fits the role well); reverts to Recon Scout when the full roster lands.
- **Custom** — user supplies their own prompt + skills; user picks sprite from the available roster.

---

## 12. Storage Schema

New tables under the existing encrypted SQLite database:

```sql
CREATE TABLE command_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sprite_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  backend TEXT NOT NULL,
  model_id TEXT NOT NULL,
  accent TEXT NOT NULL,
  state TEXT NOT NULL,
  parent_id TEXT,
  anchor_x REAL NOT NULL,
  anchor_y REAL NOT NULL,
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  facing TEXT NOT NULL DEFAULT 'S',
  created_at INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (parent_id) REFERENCES command_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_command_sessions_parent ON command_sessions(parent_id);

CREATE TABLE command_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES command_sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE command_a2a_messages (
  id TEXT PRIMARY KEY,
  from_session_id TEXT NOT NULL,
  to_session_id TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE command_files (
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  first_touched_at INTEGER NOT NULL,
  last_touched_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, path)
);

CREATE TABLE command_commands (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  command TEXT NOT NULL,
  exit_code INTEGER,
  created_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE command_messages_fts USING fts5(
  body, content='command_messages', content_rowid='rowid'
);
```

`ON DELETE CASCADE` on `parent_id` is what implements "killing the parent kills all children" at the storage level. FTS5 powers Archive search.

---

## 13. Onboarding Updates

First-run onboarding gains a new section: **Codex backend**. Existing structure (API key OR CLI delegation, "Install & sign in via terminal" button) is reused.

| Credential | Where to get it |
|---|---|
| **OpenAI** — API key *or* delegate to Codex CLI | platform.openai.com → API keys, or pick **Install & sign in via terminal** for `npm install -g @openai/codex` + `codex login` |

Onboarding is non-blocking for Command: it can be launched with only Claude or only Codex configured; backend pickers only show configured options.

---

## 14. Theming Integration

Command inherits *some* of Meridian's theming but owns its own background system:

- **Terrain** — Command renders its own planet-surface terrain backgrounds (see §2.3), independent of Meridian's global background system. v1 ships Badlands; multi-terrain selection is tracked for v1.1+.
- **Accent colors** — units get one of the 6 existing Meridian accents at creation via palette swap on their team-color zone (see sprite brief §4). This is the only piece of Meridian's theme that Command inherits directly.
- **Pixel rendering** — `image-rendering: pixelated` is applied app-wide within the Command screen for crisp sprite and terrain edges at any DPI.

No new theme primitives needed beyond what the sprite brief and terrain spec define.

---

## 15. Phased Build Order

| Phase | Scope | Done when |
|---|---|---|
| **0** | Spec review + ACP capability verification for all three backends | Backend matrix decided |
| **1** | ACP foundation: Rust `acp_client.rs`, `acp_spawn.rs`, basic Claude-Code spawn with stdio piping and message echo through Tauri events | Manual test: launch a Claude session from a CLI command, prompt it, see streaming response in dev tools |
| **2** | Command screen scaffold: tactical-field canvas, single hardcoded Marine sprite (from the brief), basic chat panel reading from one in-memory session | Visible "skeleton" Command screen at `/command` |
| **3** | Sprite library v0 — three Infantry units (Marine, Engineer, Field Tech) integrated, Zustand store + Tauri event integration wiring sprite state to ACP `session/update` events | Real sessions render with state-correct sprite animations using the three available units |
| **4** | Launch-unit modal, role file system, **PR Reviewer** + **Ticket Groomer** + **Implementer** + **Researcher** presets | User can launch any preset from the UI |
| **5** | Codex backend adapter + onboarding | Codex agents launch and stream identically to Claude |
| **6** | Storage: SQLite tables, message persistence, session resume | Sessions survive app restart |
| **7** | Archive drawer + FTS search | User can search and resume past sessions |
| **8** | **Subagent Level 2**: session tree, child spawn, tactical-field tethers, chat panel breadcrumb | Subagent spawned by parent appears as own unit with own chat stream |
| **9** | A2A messaging MCP server + signal-arc rendering | Two units can message each other end-to-end |
| **10** | Files/commands tabs, runtime switching, polish | Feature complete for v1 |
| **11** | Gemini backend (if ACP-capable) or deferred to v1.1 | Decision documented |
| **12** | **Subagent Level 3**: `spawning` / `deploying` transients wired, choreography, contextual deployment direction, dropship delivery system (see §5.5 — descent + drop + ascent over ~1.7s, position-translated by rendering layer) | Spawn moments look dramatized as designed, dropship descends during every unit arrival |
| **13** | **Cosmetic wander system**: anchor/position separation, walk animation playback during idle, 8-direction facing rotation, soft collision avoidance, `prefers-reduced-motion` opt-out (see §2.4). Stationary units (Sentinel Turret) skip wander but still rotate facing during state animations. | Units idle-wander naturally on the field at 60fps with 20 concurrent units |
| **14** | Internal dogfood + a11y pass + perf pass (20 concurrent units at 60fps) | Internal ready |

Phases 1–4 are the critical path to a usable demo. Phases 5–9 fill in the v1 feature surface. Phases 10–14 are quality and breadth. Phase 12 (subagent Level 3) and Phase 13 (cosmetic wander) sit late deliberately — both are polish on a working dashboard, not blockers.

---

## 16. Open Questions

1. **Gemini CLI ACP support** — needs verification. If absent, decide between deferring Gemini, building a small ACP wrapper, or shipping it via the existing one-shot `gemini -p` adapter with a "limited features" badge on the unit.
2. **External-agent A2A** — when would Meridian want Command's agents to talk to *external* agents (CI/CD, Jira, vendor agents)? If/when this becomes a real product need, evaluate Google's A2A Protocol as the wire format. v1 scope is internal-only via the local MCP server.
3. **Permission UI choreography** — when an agent enters `awaiting_permission`, its sprite shifts visually (`?` glyph above unit). Should the permission card render *only* in the chat panel, or also as a floating callout near the unit on the field? Default: chat panel only. Revisit if discoverability suffers.
4. **Subagent rendering depth** — v1 visibly renders 2 levels of nesting. If users start orchestrating deeper trees, revisit (compact tree view? collapsible subgroups?).
5. **Worktree mode** — should each Command unit automatically get its own git worktree (matching Meridian's existing PR Review worktree pattern), or share a single project worktree? Recommend per-unit worktree to prevent conflicts when multiple implementers run in parallel.
6. **Cost tracking** — ACP exposes token usage in `session/update`. Should the chat panel surface per-turn cost inline, or leave it to the existing AI Traffic Debug Panel? Recommend inline summary, full detail in Debug Panel.

---

## 17. Out of Scope for v1

- Remote / cloud-hosted agents (Command is local-only)
- Multi-user collaboration / shared sessions
- Mobile / web companion view
- Cross-machine session sync
- Voice input to agents
- A formal plugin API for third-party sprite packs
- Light mode (dark-mode-only in v1)
- Damage / health states beyond `error`
- Faction variants per unit (single-team in v1; accent is the only per-instance differentiator)
- Multi-terrain selection (single Badlands terrain in v1; alternate terrains like Ice / Lava / Jungle / Urban tracked for v1.1+ — see §2.3)
- Terrain editor / custom terrain uploads
- **Full 16-unit sprite roster** — v0 ships 3 Infantry units (Marine, Engineer, Field Tech). The remaining 13 units across Mechs, Spacecraft, and Drones & Constructs are a roster-expansion track running in parallel with the v1 build; not a v1 blocker. When the roster completes, preset role defaults revert to their natural assignments (PR Reviewer → Probe Drone, Researcher → Recon Scout, etc.) per the §11 v0 note.

---

## 18. References

- `COMMAND-SPRITES-DESIGN-BRIEF.md` — the full sprite + animation design brief (companion document)
- Agent Client Protocol — JSON-RPC standard, implemented by Claude Code CLI and Codex CLI
- Existing Meridian docs: PR Review chunk-aware orchestration, JWST procedural SVG patterns, credentials-at-rest design
