<div align="center">
  <img src="public/meridian-readme.svg" alt="Meridian" width="240" height="240" />
</div>

# Meridian

> ⚠️ **Work in progress — expect rough edges.** Meridian is under active development as a personal tool. Workflows, settings, prompts, and storage formats are still in flux; features may change shape, regress, or break between commits without notice. There's no stable release branch yet — `main` is the only branch and it's where day-to-day iteration happens. Use at your own risk and pin to a known-good commit if you need stability.

A personal productivity desktop application for a senior engineer and scrum master. Meridian combines AI-assisted PR review and ticket grooming with engineering leadership tooling — sprint dashboard, retrospectives, multi-sprint trends, workload balancing, meeting transcription, and cross-meeting search — all drawing from JIRA and Bitbucket as the single source of truth. A separate **Commander** panel runs long-lived ACP-protocol agents (Claude / Gemini / Codex / Qwen) for autonomous workflows like bug-hunting, PR-comment addressing, and queue-based ticket grooming.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Tauri v2](https://tauri.app) (Rust backend, native OS integration) |
| Frontend | React 18 + TypeScript, Zustand for state, Recharts for charts |
| UI components | [shadcn/ui](https://ui.shadcn.com) + Tailwind CSS |
| AI orchestration | TypeScript sidecar (Node) running [LangGraph.js](https://langchain-ai.github.io/langgraphjs/) state machines + [LangChain.js](https://js.langchain.com/) provider adapters |
| LLM providers | Claude (Anthropic), Gemini (Google), GitHub Copilot, OpenAI Codex (ChatGPT), local Ollama |
| Auth modes | API keys, *or* delegate to user-installed CLIs (`claude -p`, `gemini -p`, `copilot -p`, `codex exec`) — the CLI handles its own auth and Meridian never sees credentials |
| Model catalog | Per-provider model lists pulled from [models.dev](https://models.dev/api.json) (same source-of-truth `opencode` uses), cached locally with a 24h TTL, with user-added custom IDs merged on top |
| Commander agents | Long-lived [ACP](https://agentclientprotocol.com) (Agent Client Protocol) wrappers — `@agentclientprotocol/claude-agent-acp`, `gemini --acp`, `@zed-industries/codex-acp`, `qwen --acp` — supervised by Rust with a built-in MCP server for agent-to-agent messaging |
| Speech-to-text | Local Whisper via `whisper-rs` (no audio leaves the machine), with `pyannote`-compatible speaker diarization |
| Search | SQLite FTS5 + Ollama-backed semantic embeddings for cross-meeting RAG |
| Data sources | JIRA REST API, Bitbucket REST API |
| Credential storage | AES-256-GCM encrypted file in the app data directory; key derived from `SHA256(domain ‖ machine UUID)` |

---

## Features

### Engineering Workflows

#### PR Review Assistant
AI-assisted code review across **five lenses**, with chunk-aware orchestration (small PRs go through a single-pass synthesis, large PRs are split into chunks reviewed sequentially and synthesised at the end):

1. **Acceptance Criteria Compliance** — does the diff actually implement the AC?
2. **Security & Vulnerability Analysis** — injection, auth/authz, sensitive data exposure, input validation gaps, cryptographic weaknesses.
3. **Logic Error Analysis** — off-by-one, race conditions, null/undefined assumptions, swallowed exceptions, inverted conditionals.
4. **Testing** — missing tests for non-trivial business logic, gaps in edge-case coverage; for Bug-typed tickets, checks for `@tags <KEY>` annotations on new tests.
5. **General Code Quality** — adherence to codebase patterns, readability, performance, duplicate code.

Findings are categorised as **Blocking / Non-blocking / Nitpick** and cite file + line ranges. A separate **PR Review Chat** workflow lets you interrogate the report — the agent re-reads the worktree on demand and streams replies token-by-token.

#### Groom Ticket
Runs the grooming workflow against any chosen ticket to surface blockers (missing AC, story points, ambiguity, scope clarity, vague titles) before the ticket is picked up. Useful in sprint planning and backlog triage. A separate **Groom Ticket Chat** lets you ask follow-up questions about the analysis with the agent re-reading the worktree on demand.

#### Agent Skills
Two persistent knowledge bases the agents consult on every relevant run:

- **Implementation Standards** — coding style, naming, dos/don'ts for the agents in surviving workflows.
- **Review Standards** — team-specific review criteria for the PR Review and PR Review Chat agents.

Skills are plain editable text under Settings → Agent Skills.

#### Commander
A tactical-field UI that runs long-lived ACP-protocol agents in their own worktrees, with persistent transcripts, an MCP server for agent-to-agent messaging, and a pixel-art unit overlay. Each unit is one autonomous role:

- **Implementer** — enters Claude Code's planning mode before touching code; never modifies without a confirmed plan.
- **Ticket Groomer** — batch-grooms a sprint (or a manual ticket list) by calling `get_next_ticket` MCP tool repeatedly; each per-ticket recommendation lands in the Tickets tab for review.
- **Bug Hunter** — surveys a named feature/area and files structured `submit_bug_report` calls; reports land in the Bugs tab with a "Copy as JIRA" / "Open JIRA" helper for promoting to tickets.
- **Address PR Tasks** — picks up review comments on assigned PRs, addresses them locally (never pushes), and submits a per-comment summary + diff to the My PRs tab.
- **PR Auto-Review** — autonomously reviews assigned PRs end-to-end across the same five lenses as the regular PR Review workflow, files per-finding entries via `submit_pr_review_finding`, and finalises each PR with `submit_pr_review_complete` (recommendation + executive summary). Auto-starts on launch.
- **PR Reviewer** — interactive variant; the user drives the review one PR at a time.
- **Custom** — type your own system prompt.

Each launch picks a backend (Claude / Gemini / Codex / Qwen), a model from a dropdown sourced from the models.dev catalog, an optional MCP server set (Serena, codesight, context7, …), and a project directory. Units run as siblings of the base repo, never inside it.

---

### Engineering Leadership

#### Sprint Dashboard
Real-time sprint health: story points, burndown, blockers, PR cycle times, per-developer capacity bars with AI rebalancing suggestions, an AI-generated health summary, and a "Needs Verification" list of tickets in the QA-ready state. Also the launch point for standup recordings (header record button auto-tags the meeting `standup`).

#### Sprint Retrospectives
Browse completed sprints, view multi-sprint velocity and trend charts, generate AI retrospective summaries that ingest the sprint's tickets *and* any tagged retro meetings into a single narrative, exportable as markdown.

#### Multi-Sprint Trends
Analyse multiple completed sprints together — pre-computed stats table (velocity, completion rate, carry-over, scope changes per sprint) plus AI-driven pattern analysis identifying systemic issues vs one-off events.

#### Workload Classifier
Per-developer capacity utilisation calculated from JIRA assignments and configurable per-team-member overload thresholds. Surfaces over-utilised people on the Sprint Dashboard with AI-suggested rebalancing moves.

---

### Knowledge Capture

#### Meetings
Two ways to capture a meeting:

- **Local Whisper transcription** — one-click via the header record button on any screen. Auto-tagged `standup` from Sprint Dashboard, `retro` from Retrospectives. Speaker diarization runs on the device using a `pyannote`-compatible model (CoreML-accelerated on Apple Silicon).
- **Freeform written notes** — for meetings where recording isn't permitted. Same tagging, timestamping, and AI-summarisation as transcribed meetings.

Either mode is taggable, timestamped, and summarisable on demand. Meeting summaries feed into the Sprint Retrospectives narrative.

#### Cross-Meeting Search & RAG
Hybrid search across every captured meeting:

- **FTS5 keyword search** for exact phrases and tag-scoped queries.
- **Semantic search** powered by Ollama embeddings for concept-level matches.
- **Rank fusion** to combine the two with configurable weighting.

A backfill pipeline indexes meeting segments incrementally; the embedding model and similarity threshold are user-configurable. Search degrades gracefully to keyword-only when Ollama is unavailable.

---

### Personal Productivity

#### Time Tracking
Automatic work-hours tracker driven by macOS lock/unlock events and idle detection (no clicks/keys for N minutes pauses the timer). Live progress toward a daily target, segment timeline, manual pause/resume/add controls, midnight rollover, weekly overtime balance, and per-day totals. Configurable daily target, idle threshold, and pause-reason vocabulary.

---

### Visual & Theming

#### Backgrounds (26 across 6 categories)
A picker in Settings → Theme. The choice is persisted in `localStorage` and an ID-migration system keeps your selection alive across renames and retirements:

- **Meridian** (4) — Meridian, Dusk, Aurora, Forest.
- **Space** (4) — Deep Space (default), Nebula, Cosmos, Starfield.
- **James Webb** (7) — Cosmic Cliffs, Deep Field, Diffraction, Stellar Nursery, Galactic Wisps, Twilight Cliffs, Carina Ridges. Procedural SVG generators authored via [claude.ai/design](https://claude.ai/design) — turbulence-warped masks for ragged dust silhouettes, displacement-mapped gas filters, multi-octave fractalNoise tinted to each scene's spectral palette, JWST-spec 6-spike diffraction patterns on hero stars.
- **Abstract** (5) — Watercolor, Neon, Prism, Geometric, Mesh.
- **Patterns** (5) — Honeycomb, Waves, Circuit, Blueprint, Topographic.
- **Minimal** (2) — Dots, None.

#### Space Effects
Eight ambient flourishes that can be triggered from the developer keyboard shortcuts or surface randomly: pulsar, nova, black hole (with optional gravity well that tugs at neighbouring elements), comet, meteor shower, wormhole, shooting star, and a layered overlay system for composing them.

#### Accent Colours
Six CSS-variable-driven accent colours: slate, blue, violet, green, orange, rose. Switching is instant — no rebuild required.

---

### AI Plumbing

#### Per-Panel Provider Selection
There is **no fixed fallback chain**. Each AI workflow has its own provider/model picker in the header. All supported providers (Claude, Gemini, GitHub Copilot, OpenAI Codex, local Ollama) work for every workflow — pick one per panel, no automatic substitution.

#### CLI Delegation Auth
Meridian's preferred auth path for cloud providers is to delegate to the user's locally-installed CLI:

| Provider | CLI invocation | Sign-in command |
|---|---|---|
| Anthropic Claude | `claude -p` | `claude /login` (Pro/Max subscription or API key) |
| Google Gemini | `gemini -p` | `gemini` (Google account → free Gemini Code Assist tier, or API key) |
| GitHub Copilot | `copilot -p` | `copilot login` (GitHub account → your Copilot plan) |
| OpenAI Codex (ChatGPT) | `codex exec --json --yolo` | `codex login` (ChatGPT Plus/Pro/Team account) |

The CLI handles its own auth in every case and Meridian never sees credentials — it just spawns the binary per call and parses the streamed/buffered response. API keys (`sk-ant-api…`, `AIza…`) remain as a distribution-safe fallback for Anthropic + Gemini; Copilot and Codex are CLI-delegation-only because no public API path for third-party clients exists.

> **Heads-up on Anthropic billing (June 15, 2026):** Agent SDK / `claude -p` usage on Pro/Max subscription plans draws from a **separate $100/month metered pool** (Max 5x rate; Pro is $20, Max 20x is $200), independent of interactive Claude Code rate limits. Once exhausted, overage either bills pay-as-you-go at API rates (if extra usage is enabled) or hard-stops until the next billing cycle. Switching the Anthropic auth path to API key in Settings keeps sidecar workflow usage off that pool. See the [Anthropic announcement](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) for details.

#### Models.dev Catalog
Per-provider model dropdowns (in the Commander Launch modal and every Settings provider card) are populated from [models.dev/api.json](https://models.dev/api.json) — the same catalog `opencode` uses. Fetched once per session, cached in `localStorage` with a 24h TTL, filtered to tool-callable text-out models, sorted newest-first. User-added custom IDs (Gemini, Copilot) merge on top via the existing per-provider preference. Falls back gracefully when the catalog can't be reached.

#### AI Traffic Debug Panel
Opt-in (Settings → AI debug capture). Captures every LLM round-trip — system prompt, messages, response, token usage, latency — into a dockable in-app panel. Useful for prompt inspection, waste analysis, and workflow tuning. Per-call token usage is read from LangChain.js's per-invocation metadata.

#### Crash Reporting
A `session.lock` marker file is written to `<app_data_dir>/crashes/` at startup and deleted on graceful exit. If the marker survives across runs, the next launch toasts you with a "View report" action (opens the report in Finder). Rust panics and unhandled JS errors / promise rejections both write timestamped reports to the same folder; the marker catches everything else (WebView crashes, OOM kills, force quits, power loss). Last 20 reports are kept; older pruned automatically.

---

## Prerequisites

- [Node.js](https://nodejs.org) 20+
- [Rust](https://rustup.rs) (stable toolchain)
- [Tauri CLI v2](https://tauri.app/start/prerequisites/)
- macOS (the credential store derives its encryption key from the machine's `IOPlatformUUID`; ports to other platforms would need an equivalent stable per-machine identifier; idle detection uses `CGEventSource*`; lock-state detection uses `CoreFoundation` session queries)
- [Ollama](https://ollama.com) running locally if you intend to use cross-meeting semantic search

---

## Development

```bash
# Install frontend dependencies
pnpm install

# The Tauri dev server's beforeDevCommand bundles the sidecar before
# starting Vite + Tauri, so just one command:
pnpm tauri dev

# When iterating on src-sidecar/ while tauri dev is running, the
# sidecar process won't pick up changes on its own. Force a rebuild:
pnpm sidecar:rebuild

# Run the test suites (frontend + sidecar)
pnpm test
pnpm --filter src-sidecar test
```

The Vite dev server runs on `http://localhost:1420` and Tauri opens a native window pointed at it.

---

## Building

```bash
pnpm tauri build
```

Artifacts are written to `src-tauri/target/release/bundle/`.

---

## First-Run Setup

On first launch the app routes to an onboarding screen. Provide at minimum one AI provider, plus JIRA and Bitbucket credentials:

| Credential | Where to get it |
|---|---|
| **Anthropic** — API key *or* delegate to Claude Code CLI | [platform.claude.com](https://platform.claude.com) → API Keys, or pick **Install & sign in via terminal** on the Claude Code CLI tab in Settings → Anthropic (Meridian opens your configured terminal app and walks through `npm install -g @anthropic-ai/claude-code` + `claude /login`) |
| **Google Gemini** — API key *or* delegate to gemini-cli | [aistudio.google.com](https://aistudio.google.com) → API key, or pick **Install & sign in via terminal** on the Gemini CLI tab in Settings → Gemini (Meridian opens your configured terminal and walks through `npm install -g @google/gemini-cli` + the CLI's "Sign in with Google" prompt for the free Gemini Code Assist tier) |
| **GitHub Copilot** — CLI delegation only | Pick **Install & sign in via terminal** in Settings → GitHub Copilot. Meridian walks through `npm install -g @github/copilot` + `copilot login` (device-code flow against your GitHub account; your Copilot plan is read from there). No API-key path. |
| **OpenAI Codex (ChatGPT)** — CLI delegation only | Pick **Install & sign in via terminal** in Settings → Codex. Meridian walks through `npm install -g @openai/codex` + `codex login` (OAuth against your ChatGPT Plus/Pro/Team account). No API-key path. |
| **Ollama** | Just install it locally — Meridian defaults to `http://localhost:11434` and accepts custom URLs |
| **JIRA base URL** | Your Atlassian workspace URL, e.g. `https://yourcompany.atlassian.net` |
| **JIRA email** | The email on your Atlassian account |
| **JIRA API token** | [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) |
| **Bitbucket workspace** | Your Bitbucket workspace slug |
| **Bitbucket username** | Your Bitbucket account username |
| **Bitbucket app password** | Bitbucket → Settings → App passwords (repo read + PR read/write) |

You also configure the local repo worktrees the agents read from:

| Setting | Purpose |
|---|---|
| **Repo source path** | Absolute path to the source repo (used in auto-managed-worktree mode) |
| **Implementation worktree** | Worktree the agents read from |
| **PR review worktree** | Separate worktree used by PR Review (avoids branch conflicts) |
| **Grooming worktree** | Worktree the Groom Ticket agents read from |
| **Repo base branch** | Branch the worktrees track |

Auto-managed-worktree mode derives the per-workflow paths from the source-repo path automatically and lazy-creates them on first use; manual mode lets you point each workflow at a worktree you manage yourself.

All credentials are persisted to `credentials.bin` inside the Tauri app data directory (`~/Library/Application Support/<app id>/` on macOS) — encrypted at rest with AES-256-GCM under a key derived from `SHA256("meridian-credential-store-v1:" ‖ <machine UUID>)`. The store is read in the Rust backend only and per-request passed to the sidecar over stdio IPC; credentials are never exposed to the React frontend, never logged, and never written to disk in plaintext. Because the encryption key is bound to the machine's `IOPlatformUUID`, copying `credentials.bin` to another machine yields ciphertext that won't decrypt there.

Credentials and settings can be updated at any time via the **Settings** screen (gear icon, top-right).

---

## Project Structure

```
meridian/
├── src/                         # React frontend
│   ├── components/              # Shared shadcn/ui-based components
│   │   └── command/             # Commander UI (tactical field, unit chat,
│   │                            #   Bugs/My PRs/Reviewed PRs tabs, launch modal)
│   ├── screens/                 # One file per top-level workflow screen
│   │   ├── settings/            # Per-provider settings cards (anthropic, gemini,
│   │   │                        #   copilot, codex, local-llm, …)
│   │   └── onboarding/          # First-run provider-setup wizard
│   ├── stores/                  # Zustand stores; one per long-running screen
│   │   └── command/             # Commander session store + ACP event listeners
│   ├── lib/
│   │   ├── backgrounds/         # 26 ambient backgrounds + JWST generators
│   │   ├── spaceEffects/        # Pulsar/nova/black-hole/etc. flourishes
│   │   ├── tauri/               # Typed Tauri command wrappers
│   │   ├── modelsCatalog.ts     # models.dev fetch + 24h cache + per-provider filter
│   │   ├── crashReporting.ts    # JS error capture + previous-session crash toast
│   │   └── …                    # Theme, mock data, search, time tracking helpers
│   └── providers/               # React context providers
├── src-sidecar/                 # TypeScript sidecar (Node)
│   └── src/
│       ├── workflows/           # One LangGraph StateGraph per workflow
│       ├── models/              # LangChain adapters: API-key (anthropic-direct,
│       │                        #   google-direct, ollama-direct) + CLI delegation
│       │                        #   (anthropic-via-claude-code, gemini-via-cli,
│       │                        #   copilot-via-cli, codex-via-cli)
│       └── tools/               # LangGraph tools + IPC bridge to Rust
├── src-tauri/                   # Rust/Tauri backend (host process)
│   └── src/
│       ├── commands/            # Tauri commands exposed to the frontend
│       ├── command/             # Commander backend: ACP spawn/client, session
│       │                        #   supervisor, MCP loopback server, event bus
│       ├── integrations/        # JIRA, Bitbucket, sidecar process management
│       ├── llms/                # Provider helpers (claude, gemini, copilot, codex,
│       │                        #   local_llm — CLI detection + model defaults)
│       ├── agents/              # Dispatch helpers (LLM calls live in sidecar)
│       ├── storage/             # Credentials, preferences, meeting search index
│       └── crash.rs             # Panic hook + session.lock marker + crash reports
├── docs/                        # Internal architecture notes (incl. SPEC-COMMAND.md)
├── scripts/                     # Debug helpers (JIRA, Bitbucket)
└── public/                      # Static assets
```

---

## Credits

- **Black-hole animation** (`public/bh.mp4`, HEVC-with-alpha) — adapted from a NASA visualisation of light bending around a Schwarzschild black hole.
  Credit: **NASA's Goddard Space Flight Center / Jeremy Schnittman / Scott Noble.**
- **James Webb backgrounds** — procedural SVG generators authored via [claude.ai/design](https://claude.ai/design); inspired by JWST imagery (Carina Cosmic Cliffs, Pillars of Creation, Tarantula Nebula, weic2205a).

## License

Copyright 2026 Isaac Harries.

Licensed under the [Apache License, Version 2.0](LICENSE). You may not use this project except in compliance with the License.
