# Command — Multi-Agent Tactical Workflow Spec

> Status: **Draft v1.1**. Phases 1–11 & 13 implemented (phase 12 walked back). v1.1 introduces a **fleet-card layout** (per-agent cards always visible, modeled on pokegents) and **multi-terrain** support (Badlands + Space Station). The original full-screen tactical-field layout from v1.0 is preserved in the §15 history.

A new top-level workflow in Meridian that turns Claude Code, Codex, and Gemini sessions into a unified, space-battle-themed multi-agent dashboard. Each agent is a **unit fighting on a planet surface**, rendered as 32-bit pixel art viewed from a **top-down 3/4 RTS perspective** (StarCraft / Tiberian Sun style). Inspired by classic late-90s RTS aesthetics; designed for engineering-leader workflows.

---

## 1. Overview

Command is Meridian's home for long-running, interactive coding agents. Where today's workflows (PR Review, Groom Ticket) are single-shot LangGraph runs that produce a report, Command hosts **persistent interactive agents** — each with its own pixel-art unit identity, role, project, and conversation history — that the user can launch, chat with, switch between, coordinate via agent-to-agent messaging, and archive.

**Core loop:** deploy multiple units to the tactical field, glance at the field to see who is doing what (state is communicated through each unit's own animation), click a unit to open its chat panel on the right, and let units coordinate with each other through a local messaging channel.

**What it is not:** a replacement for the existing LangGraph workflows. PR Review and Groom Ticket continue to live in their own screens for batch analysis. Command is the interactive surface — though it surfaces those workflows as **preset roles** that bake the prompts and skills into freeform agents.

---

## 2. User Experience

### 2.1 Screen layout (v1.1 — fleet-card)

The v1.1 layout is a **fleet-card grid** with a focused-agent panel on the right. Every active unit is visible at once as its own card showing live state + recent activity; the user no longer has to click a sprite to see what an agent is doing.

```
┌────────────────────────────────────────────────────────────────────────┐
│  Command                              [+ Launch] [Archive] [Settings]  │ ← header
├──────────────────────────────────────────┬─────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐  │  ┌──────────────────────┐  │
│  │ MINI     │ │ AGENT    │ │ AGENT    │  │  │ FOCUSED AGENT        │  │
│  │ FIELD    │ │ CARD #1  │ │ CARD #2  │  │  │  [Chat | Files |     │  │
│  │  🪖  ⚙️   │ │ 🪖 Mar.. │ │ ⚙️ Eng.. │  │  │   Commands | Debug]  │  │
│  │  🛰️  🔭   │ │ ●thinking│ │ ●idle    │  │  │                      │  │
│  │   🚀     │ │ msg: ... │ │ msg: ... │  │  │  streaming msgs      │  │
│  └──────────┘ └──────────┘ └──────────┘  │  │  tool calls          │  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐  │  │  diffs               │  │
│  │ AGENT    │ │ AGENT    │ │ AGENT    │  │  │  permission cards    │  │
│  │ CARD #3  │ │ CARD #4  │ │ CARD #5  │  │  │  files / commands    │  │
│  └──────────┘ └──────────┘ └──────────┘  │  └──────────────────────┘  │
│                                          │  [ input box ]              │
├──────────────────────────────────────────┴─────────────────────────────┤
│  Status strip: total units · idle · thinking · blocked                  │ ← footer
└────────────────────────────────────────────────────────────────────────┘
```

**Mini field** (top-left tile of the grid). The tactical field, compressed into a single card-sized tile. Renders the same terrain + unit sprites in their persisted positions, scaled down. Clicking a sprite inside the mini-field selects that agent. Subagent tethers and A2A signal arcs still render here. Double-click the tile to enter **expanded field mode** — the mini-field temporarily replaces the entire card grid for full-resolution viewing (Esc to return).

**Agent cards** (remainder of the grid). One card per active unit. Each card contains:

- **Header**: unit sprite (small, in its current animation state), name, role, backend/model chip
- **Statusline**: current `AgentState` with colored dot, transient indicator (`spawning` / `deploying`), token usage / context % chip (from §16 #6 cost tracking), inbox-pending badge if any
- **Recent activity**: last ~6 transcript entries (compressed — text chunks merged, tool calls one-liner). Auto-scrolls as the agent streams. Click the card to promote it to the focused panel.
- **Parent/child tether glyph** in the corner if the unit has relatives (§5)

Cards are sized uniformly so the grid stays orderly; they reflow responsively (3 columns wide ≥ 1400px, 2 columns 900–1400px, 1 column < 900px — focused panel collapses to overlay at the narrowest breakpoint). Grid order is stable per session (insertion-ordered, draggable in v1.2+ if user demand emerges).

**Focused agent panel** (right). The detailed surface for the currently-selected agent — what was the v1.0 `UnitChatPanel`, now permanent. Carries the full Chat / Files / Commands / Debug tab set, full message history, permission prompts, input box, runtime switcher, breadcrumb when the unit has a parent/child. Resizable (drag handle on the gutter). Collapsible to a thin rail when the user wants the grid full-width.

**Header**: Launch button (new-unit modal), Archive button (historical sessions drawer), Settings (terrain picker among other Command-scoped prefs — see §2.3).

**Footer**: compact status strip — counts by state.

#### Why the layout change

v1.0's single-tactical-field-plus-chat layout requires clicking each unit to see what it's doing. For a single user driving 3–6 agents in parallel, that's friction — context-switch cost on every glance. The fleet-card grid (pokegents-style) makes every agent's recent activity ambient: the user sees who's idle, who's mid-tool-call, who's awaiting permission, and who just streamed something interesting, all without selecting anything. The mini-field preserves the tactical-positioning information (who is next to whom, A2A arcs, parent-child tethers) in a single corner tile.

### 2.2 Key user flows

1. **Launch a unit.** Header → Launch → modal with roster picker (available unit sprites — see the sprite brief; v0 ships 3 Infantry units with the remaining 13 queued as a roster expansion), role (preset dropdown: Implementer / PR Reviewer / Ticket Groomer / Researcher / Custom), project (existing Meridian projects), backend (Claude / Codex / Gemini) + model picker. On confirm, the new unit's card appears in the grid, its sprite plays the `spawning` transient on the mini-field, then settles into `idle`. The new card auto-promotes to the focused panel; focus drops to the input box.
2. **Glance at the fleet.** Cards tile the grid — each shows live state, recent messages, token usage. No clicking required to see what every agent is doing.
3. **Switch focus.** Click any agent card *or* any sprite on the mini-field → focused panel shows that unit's full history. Last-selected unit is remembered per workspace.
4. **Watch units work.** Each sprite animates per state — idle bob, thinking gesture, tool-running action, streaming radio pulse, etc. — both inside its card header and on the mini-field. Subagents spawn as their own first-class sprites adjacent to their parent (§5) and get their own card in the grid.
5. **Unit-to-unit message.** Unit A calls the MCP messaging tool addressing Unit B. A signal arc renders on the mini-field between their positions; both transcripts get the event; B's card surfaces an inbox badge and an inbound-message card in the focused panel when selected.
6. **Expanded field mode.** Double-click the mini-field tile → it grows to fill the card grid for inspection (positions, tethers, decoration). Esc returns to the grid view.
7. **Resume a past session.** Header → Archive → list of historical sessions with sprite + name + role + project + last-active. Click → resumes as a new card in the grid + fresh sprite on the mini-field, full history restored.
8. **Switch runtime mid-session.** Card menu (or focused-panel header) → Switch backend / model. The sprite plays a brief re-deploy animation on the mini-field; underlying session is recreated against the new backend.

### 2.3 Terrain

The tactical field (mini and expanded) renders its own terrain background, separate from Meridian's global background system. Terrain communicates *where* the units are operating — a planet surface, an orbital platform, etc. — and is the visual foundation the StarCraft-style top-down view sits on.

#### 2.3.1 v1.1 ships two terrains

| ID | Style | Background bleed | Tile feel |
|---|---|---|---|
| `badlands` | Dusty rocky planet surface, neutral warm tones (browns, beige, gray-tan), sparse rock/debris decorations | **Opaque** — fills the entire field; Meridian's global space background is hidden | Ground / planetside |
| `space-station` | Modular metal platform plates (StarCraft 2 *Space Platform* tileset reference), cool grays/teals, glowing edge strips, vents, cargo crates, antenna decoration | **Transparent perimeter** — the platform occupies the center as an irregular polygon; Meridian's global space background (stars, JWST imagery, nebula) shows through around the perimeter, selling the "we're in orbit" feel | Orbital |

Both render at the same pixel scale as the units (terrain pixels and unit pixels share a grid). Dark enough to read against light-accented units, light enough to read against dark-accented ones. Optional faint hex or grid overlay (configurable; default off) for tactical legibility.

The Space Station terrain is the visual hook that justifies Meridian's existing app-wide space background even inside the Command screen — instead of hiding it, Command stages the units *on a platform floating in it*. The Badlands terrain remains the default for users who want fully opaque ground.

#### 2.3.2 Terrain registry

Terrains are pluggable. A central registry at `src/lib/commandTerrains/index.ts` maps terrain IDs to definitions:

```ts
interface TerrainDef {
  id: TerrainId;
  label: string;
  // Returns the SVG tile pattern + decoration sprites for the field background.
  Background: React.ComponentType<{ width: number; height: number }>;
  // Footprint controls where units may be positioned. "rectangle" = full bounds (badlands).
  // "polygon" = restricted to the polygon (space-station: keep sprites on-platform, not in the void).
  footprint: { kind: 'rectangle' } | { kind: 'polygon'; vertices: Array<[number, number]> };
  // Whether the global app background should show through outside the footprint.
  bleedThrough: boolean;
}
```

Adding a new terrain is one new file in `src/lib/commandTerrains/` plus an entry in the registry. No core changes.

#### 2.3.3 v1.2+ terrains (tracked, not committed)

- `ice` — cold blues and whites, cracked ice plate decoration
- `lava` — dark with orange glow vents, magma fissures
- `jungle` — alien greens and purples, vegetation sprites
- `urban` — destroyed city / industrial debris

Terrain is selectable per-workspace via Settings → Command → Terrain, defaulting to Badlands. Selection persists with user preferences. The selected terrain renders identically in the mini-field tile and expanded-field mode (§2.1).

**Implementation note.** Terrain is rendered by the `MiniField` / expanded-field component (see §8.2) as a tiled SVG base layer with sparse decoration sprites. Tiles are 32×32, unit sprites are 48×48. Both use `image-rendering: pixelated`. For `space-station`, the terrain SVG is masked to the polygon footprint; pixels outside the mask are transparent, letting the parent `bg-background` (Meridian's space theme) bleed through.

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

**Behavior.** Same as Level 2, plus visual dramatization of the spawn moment. The subagent's sprite plays its `spawning` transient (one-shot, ~1s) as it appears. The parent simultaneously plays its `deploying` transient (one-shot, ~0.6s). A Marine deploys a Probe Drone, the Marine waves overhead while the Drone drops in from off-field; a Capital Ship's bridge flashes while a Starfighter unfolds beside it.

**What's needed beyond Level 2.**

- Per-unit `spawning` and `deploying` transient animations (already in the sprite brief, §6.8).
- Tactical-field choreography: when a spawn event fires, the field places the subagent's spawn position relative to the parent's facing direction, plays the transients in sync, and only registers the subagent as interactable after the transients complete.
- Optional: contextual deployment direction. A parent looking right deploys to its right; the new sprite emerges from that side. Adds polish; not strictly required.

**Why split from Level 2.** Level 2 gives the user the functional value (inspect any subagent independently). Level 3 is fit-and-finish — the experience layer. Splitting them lets us ship interactive subagent inspection without blocking on the choreography work, which is genuinely more involved.

### 5.4 Subagent depth

V1 supports **arbitrary depth** at the data model level (sessions form a tree). Rendering-wise, the tactical field shows at most 2 levels of nesting visibly — a grandchild renders in a smaller adjacent position to its parent. Deeper levels are accessible via the chat panel breadcrumb but don't render distinct sprites (would clutter the field). v1.1 may revisit if heavy-orchestration patterns emerge.

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
├── AgentCardGrid.tsx        ← v1.1; tiles agent cards + mini-field in a responsive grid
├── AgentCard.tsx            ← v1.1; one card per unit (sprite, statusline, recent activity)
├── MiniField.tsx            ← v1.1; renamed/shrunk TacticalField — terrain + sprites + tethers + arcs
├── ExpandedField.tsx        ← v1.1; full-resolution field shown via mini-field double-click
├── UnitInstance.tsx         ← wraps a sprite component with state-driven prop wiring
├── FocusedAgentPanel.tsx    ← v1.1; promoted UnitChatPanel — right pane, always present
├── LaunchUnitModal.tsx      ← roster picker, role, project, backend
├── ArchiveDrawer.tsx        ← historical sessions browser
├── SessionBreadcrumb.tsx    ← parent/child navigation inside chat panel
├── ActivityToast.tsx        ← cross-unit event surfacing
└── (legacy) TacticalField.tsx ← removed in v1.1; logic split into MiniField + ExpandedField

src/lib/commandSprites/
├── Marine.tsx, Engineer.tsx, … (16 unit components, see sprite brief)
├── index.ts                 ← barrel
└── README.md                ← documents UnitProps, palette swap, etc.

src/lib/commandTerrains/                          ← v1.1; new
├── Badlands.tsx             ← opaque planet surface
├── SpaceStation.tsx         ← platform polygon, transparent perimeter, bg-bleed
├── index.ts                 ← TerrainDef registry, TerrainId union
└── README.md                ← contract for adding new terrains
```

`AgentCard` and `MiniField` both render `UnitInstance`. The card uses a small (e.g. 32px) size and pins the sprite to a fixed header position; the mini-field uses the persisted `positionX/Y` per unit. Both subscribe to the same Zustand store, so animation state stays in sync across surfaces.

### 8.3 Zustand store

```ts
type AgentState =
  | 'idle' | 'thinking' | 'tool_running' | 'streaming'
  | 'awaiting_permission' | 'done' | 'error';

type TransientAnimation = 'spawning' | 'deploying';

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
  positionX: number;             // tactical-field coordinates
  positionY: number;
  facing: 'left' | 'right';
  createdAt: number;
  lastActiveAt: number;
}

interface CommandState {
  units: Record<string, Unit>;
  selectedUnitId: string | null;
  archive: ArchiveEntry[];
  // …actions: launchUnit, selectUnit, sendPrompt, fireTransient, etc.
}
```

`positionX/Y` are persisted in `localStorage` so the field layout survives reloads. Session metadata lives in Rust + SQLite.

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
    position_x: f32,
    position_y: f32,
    facing: String,              // "left" | "right"
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
- Uniform `UnitProps` interface: `{ state, transient?, accent, size?, facing? }`
- 7 persistent state animations + 2 transient one-shots (`spawning`, `deploying`)
- SVG-rendered pixel art (one `<rect>` per pixel) for runtime palette swap
- `prefers-reduced-motion` fallback freezes to a representative frame per state
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
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  facing TEXT NOT NULL DEFAULT 'right',
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

Command inherits *some* of Meridian's theming and conditionally lets the rest bleed through:

- **Terrain** — Command renders its own terrain backgrounds via the `src/lib/commandTerrains/` registry (see §2.3). v1.1 ships **Badlands** (opaque, hides the app's global background) and **Space Station** (polygon footprint, lets Meridian's global space background bleed through the perimeter — explicitly intended as a visual handshake with the rest of the app). Additional terrains plug in via the registry pattern.
- **Accent colors** — units get one of the 6 existing Meridian accents at creation via palette swap on their team-color zone (see sprite brief §4). Accent also tints the agent card border, the mini-field positional ring under the unit, and the unit's signal arc / tether color.
- **Pixel rendering** — `image-rendering: pixelated` is applied app-wide within the Command screen for crisp sprite and terrain edges at any DPI.

No new theme primitives needed beyond what the sprite brief and terrain registry define.

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
| **12** | **Subagent Level 3**: `spawning` / `deploying` transients wired, choreography, contextual deployment direction | Spawn moments look dramatized as designed |
| **13** | Internal dogfood + a11y pass + perf pass (20 concurrent units at 60fps) | Internal ready |
| **14** | **v1.1 Terrain registry + Space Station** — extract terrain from the field into `src/lib/commandTerrains/` registry; add the Space Station polygon terrain with bg-bleed; Settings → Command → Terrain picker | Both terrains selectable; Badlands matches current visuals, Space Station shows app background through perimeter |
| **15** | **v1.1 Fleet-card layout** — extract `MiniField` from `TacticalField`, add `AgentCard` + `AgentCardGrid`, promote `UnitChatPanel` → `FocusedAgentPanel`, double-click mini-field → `ExpandedField` mode, responsive breakpoints | All active units visible as cards simultaneously; click card or mini-field sprite to focus; expanded mode for full-resolution field inspection |

Phases 1–4 are the critical path to a usable demo. Phases 5–9 fill in the v1 feature surface. Phases 10–13 are quality and breadth. **Phase 12 was walked back** when auto-spawn detection proved too noisy — see `src/stores/command/listeners.ts` for the breadcrumb. **Phases 14–15 are the v1.1 fleet-card + terrain refresh.**

---

## 16. Open Questions

1. **Gemini CLI ACP support** — needs verification. If absent, decide between deferring Gemini, building a small ACP wrapper, or shipping it via the existing one-shot `gemini -p` adapter with a "limited features" badge on the unit.
2. **External-agent A2A** — when would Meridian want Command's agents to talk to *external* agents (CI/CD, Jira, vendor agents)? If/when this becomes a real product need, evaluate Google's A2A Protocol as the wire format. v1 scope is internal-only via the local MCP server.
3. **Permission UI choreography** — when an agent enters `awaiting_permission`, its sprite shifts visually (`?` glyph above unit). Should the permission card render *only* in the chat panel, or also as a floating callout near the unit on the field? Default: chat panel only. Revisit if discoverability suffers.
4. **Subagent rendering depth** — v1 visibly renders 2 levels of nesting. If users start orchestrating deeper trees, revisit (compact tree view? collapsible subgroups?).
5. **Worktree mode** — should each Command unit automatically get its own git worktree (matching Meridian's existing PR Review worktree pattern), or share a single project worktree? Recommend per-unit worktree to prevent conflicts when multiple implementers run in parallel.
6. ~~**Cost tracking**~~ — **Resolved.** Per-unit token/context/cost chip ships in the focused panel header (and the v1.1 agent card statusline), backed by `usage_update` parsing in `src/stores/command/listeners.ts`. Full detail still lives in the Debug tab + AI Traffic Debug Panel.
7. **Card-grid density at fleet scale** — v1.1 targets 6–10 active cards. Beyond that the grid scrolls; at ~20+ units the per-card recent-activity stream gets noisy. Revisit if real usage trends past 10 concurrent agents (likely options: collapsed "list" mode toggle, group-by-role).
8. **Space Station footprint shape** — v1.1 ships a single polygon footprint for the Space Station terrain. Variants (rectangular, cross-shaped, multi-platform with gaps) could express "different stations" — defer until we have a second visual hook worth carrying.
9. **Mini-field auto-fit vs. fixed scale** — the mini-field tile shows persisted `positionX/Y` at a shrunk scale. If users park units far apart, some may render outside the tile. v1.1 default: auto-fit (recompute scale to include all units); fall back to fixed scale + scrollbars if auto-fit degrades the legibility of close clusters.

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
- ~~Multi-terrain selection~~ — **Reclassified for v1.1**: ships Badlands + Space Station (§2.3). Ice / Lava / Jungle / Urban remain tracked for v1.2+.
- Terrain editor / custom terrain uploads
- Draggable card reordering (cards are insertion-ordered in v1.1; revisit in v1.2 if demand emerges)
- Per-card chat input (cards are read-only summaries; all input goes through the focused panel)
- **Full 16-unit sprite roster** — v0 ships 3 Infantry units (Marine, Engineer, Field Tech). The remaining 13 units across Mechs, Spacecraft, and Drones & Constructs are a roster-expansion track running in parallel with the v1 build; not a v1 blocker. When the roster completes, preset role defaults revert to their natural assignments (PR Reviewer → Probe Drone, Researcher → Recon Scout, etc.) per the §11 v0 note.

---

## 18. References

- `COMMAND-SPRITES-DESIGN-BRIEF.md` — the full sprite + animation design brief (companion document)
- Agent Client Protocol — JSON-RPC standard, implemented by Claude Code CLI and Codex CLI
- Existing Meridian docs: PR Review chunk-aware orchestration, JWST procedural SVG patterns, credentials-at-rest design
