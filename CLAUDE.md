# Meridian — Development Reference

## Overview

Meridian is a personal productivity desktop app for a senior engineer and scrum master.
It provides engineering leadership tooling: sprint dashboard, retrospectives, sprint
trends, workload balancer, ticket grooming/quality assessment, PR review assistant,
address-PR-comments workflow, meeting transcription, and time tracking. Built on
Tauri + React + TypeScript with a TypeScript sidecar that owns all LLM provider
integration via hand-rolled adapters over each vendor's official SDK or CLI.
Data sources: JIRA API and Bitbucket API. Built for individual use — not
distributed. Meridian focuses on engineering-leadership surfaces no general AI
tool covers; the **Commander** screen is the home for code-level agent work.

---

## Core Philosophy

- Each agent has a single, focused responsibility
- Human remains in the loop at human checkpoints — agents present findings and wait
  for explicit user approval before any side effects (writing files, posting comments)
- The user can converse with the agent at any step: ask questions, provide
  clarifications, correct misunderstandings, or abort
- Data from JIRA and Bitbucket is the source of truth for all metrics — no manual input
- Code is never written before the user agrees to a change
- LLM-neutral UI copy: say "AI", not "Claude" — the app supports multiple providers

---

## Tech Stack

- **Tauri** — desktop shell (Rust backend, no browser tab required)
- **React + TypeScript** — frontend
- **shadcn/ui + Tailwind CSS** — component library and styling
- **TypeScript sidecar (Node)** — owns all workflow orchestration and LLM provider
  integration as plain async runners (no LangGraph / LangChain — both removed
  2026-04); the Rust backend never makes LLM HTTP calls directly and holds no
  workflow state
- **LLM provider adapters** — hand-rolled per-provider clients in
  `src-sidecar/src/models/` using each vendor's official SDK or CLI:
  `@anthropic-ai/sdk`, `@google/generative-ai`, `openai`, plus CLI-delegation
  wrappers (`claude -p`, `gemini -p`, `codex exec`, `copilot -p`) and an
  Ollama HTTP client. Every adapter implements the same minimal `ChatModel`
  interface (single `stream(messages, options)` method).
- **Zod** — schema validation for every structured-output handoff
- **JIRA API + Bitbucket API** — data sources

---

## Repo Layout

```
src/                    React frontend
  screens/              one file per top-level workflow screen
  stores/               Zustand stores; one per long-running screen
  components/           shadcn/ui-based shared components
  lib/tauri/            typed Tauri command wrappers — one file per domain
                        (core, jira, bitbucket, meetings, pr-review, …)
  lib/preferences.ts    typed wrapper around the prefs store; per-feature
                        keys live alongside in lib/appPreferences.ts
  lib/ideLauncher.ts    spawns the user's configured IDE on a file path
                        (used from Commander's bug + PR-review tabs)

src-tauri/              Rust backend (Tauri host process)
  src/commands/         Tauri command modules — one file per domain
  src/integrations/     sidecar IPC bridge, Bitbucket/JIRA HTTP clients
  src/llms/             provider helpers (model catalogue, CLI detection, ping)
  src/agents/dispatch.rs only — config/override resolution, no LLM calls
  src/storage/          keychain credentials + plain-JSON preferences
  target/debug/bundle.cjs  ← runtime sidecar bundle (copied from src-sidecar/dist)

src-sidecar/            TypeScript sidecar (Node, supervised by Rust)
  src/workflows/        one file per workflow + registry/ (the dispatch table)
  src/models/           hand-rolled provider adapters (Anthropic, Google, OpenAI,
                        Ollama direct; claude/gemini/codex/copilot CLI delegations)
  src/lib/              shared utilities (partial-JSON parser, etc.)
  src/protocol.ts       inbound/outbound message shapes — mirror in
                        src-tauri/src/integrations/sidecar.rs

docs/                   supplementary architecture docs
```

---

## Dev Workflow

- **Run the app**: `pnpm tauri dev` (from repo root). The Tauri config's
  `beforeDevCommand` runs `pnpm sidecar:bundle` first, so the sidecar bundle is
  always rebuilt before vite + Tauri start. Vite serves the frontend with HMR;
  Tauri rebuilds Rust on file change and restarts the app, which kills the
  supervised sidecar so the next IPC request spawns a fresh one.
- **Run tests**: `pnpm test` at repo root for the React layer, `pnpm test`
  inside `src-sidecar/` for sidecar units. **New code should land with tests.**
  Default to writing unit tests for: pure functions (op application,
  classifiers, reducers), schema validators (Zod parsing edge cases including
  rejection paths), routing logic (chunk-vs-single-pass selection, registry
  dispatch), and any code with non-obvious branching. Tests live next to the
  source as `*.test.ts` / `*.test.tsx`.
- **Mid-session sidecar refresh**: when you edit `src-sidecar/` source while
  `tauri dev` is already running, the in-memory sidecar process won't pick up
  the change on its own. Run `pnpm sidecar:rebuild` from the repo root — it
  bundles, copies to the runtime path, and kills the long-lived child process
  so the next IPC request spawns a fresh one with the new code.
- **Tauri command additions** must be wired in *three* places: the `pub use`
  re-export in `src-tauri/src/commands/mod.rs`, the import block in
  `src-tauri/src/lib.rs`, and the handler list inside
  `tauri::generate_handler![ … ]`. Skipping any one yields a runtime "command
  not found" rather than a compile error.

---

## MCP servers used while developing Meridian

Two MCP servers, registered together by `pnpm mcp:connect`:

### meridian-screenshot (local, `tools/screenshot-mcp/`)
Two tools:
- **`screenshot`** — captures the running Meridian window. Optional
  `navigateTo: <screen-id>` to jump screens + capture in one
  round-trip.
- **`navigate`** — switches Meridian's main window to a given screen
  by id. Driven by a tiny HTTP server inside the Tauri app on
  `127.0.0.1:31415` (`src-tauri/src/control_server.rs`).

Renders against the real Tauri WKWebView window, so Tauri commands
(`invoke()` for JIRA, Bitbucket, etc.) run for real and native chrome
is included. Valid screen ids: `landing`, `onboarding`, `settings`,
`agent-skills`, `review-pr`, `sprint-dashboard`, `retrospectives`,
`ticket-quality`, `meetings`, `time-tracking`, `command`.

### chrome-devtools (npm `chrome-devtools-mcp`)
Full Chromium devtools surface: DOM, computed CSS, console, network
waterfall. Targets Chromium against the vite dev URL (typically
`http://localhost:1420` or whatever `pnpm tauri dev` exposes), NOT
the live Tauri window — anything Rust-backed will error there. Pair
with `screenshot` when "this looks off" needs to be answered by
"and here's *why*" (computed style, layout, console error).

Two navigation hooks make the in-browser app reachable past
Onboarding (otherwise the credential bootstrap strands you there
because `invoke` is undefined):

- `evaluate_script(() => window.__meridianNavigate('sprint-dashboard'))`
  jumps to a screen.
- `http://localhost:1420/#sprint-dashboard` does the same via URL
  hash and survives reloads.

Mock mode is auto-enabled the first time the app loads outside a
Tauri runtime, so the JIRA/Bitbucket-backed screens render with
canned data instead of erroring. See `App.tsx` for the wiring and
`src/lib/tauri/core.ts` for the mock-mode toggles.

### When to use which

- **UI changed**: call `screenshot` (with `navigateTo`) to verify.
- **Something looks wrong and you can't tell why**: open
  chrome-devtools against the vite URL, inspect computed styles /
  console / network.
- **API behaviour or signature in doubt**: ask context7 first.

Skip gracefully if either isn't listed — the user may not have run
`pnpm mcp:connect`, Meridian may not be running, or the vite dev
URL may not be up.

---

## Code intelligence MCP servers

Three MCP servers go beyond the dev MCPs above — they're general
code-intelligence tools, useful for any task. All are registered
at user scope (not via `pnpm mcp:connect`), so they're always
available.

### serena (semantic LSP)
On the first turn of every session, call `initial_instructions`
before any read/edit. After that, prefer Serena's symbolic tools
over `Read`/`Edit` for any code file:
- `get_symbols_overview` / `find_symbol` for understanding a file
- `find_referencing_symbols` before renaming or changing signatures
- `replace_symbol_body` / `insert_after_symbol` / `insert_before_symbol`
  / `replace_content` for edits — Serena's editing tools refuse to
  edit symbols you haven't read, so always traverse with a Serena
  read before a Serena write
- Treat `Read`/`Grep` as discovery-only — never as the read step.

Serena carries project memories (`list_memories` / `read_memory`)
that describe Meridian's structure, conventions, suggested
commands, and a task-completion checklist. Read the relevant
memory whenever a task hits its scope rather than re-deriving from
files. The `.claude/settings.json` hooks (committed) keep Serena's
session reminder injected and auto-approve its MCP calls.

### Serena vs the official LSP plugins
Both Serena and the four `*-lsp@claude-plugins-official` plugins
expose LSP-backed code intelligence. They spawn separate language-
server processes (≈2× memory for `rust-analyzer` + `tsserver` on
this repo), but they're not redundant in capability:

- **Default to Serena** for any non-trivial code work — it's the
  only path with symbolic *editing* tools (`replace_symbol_body`,
  `insert_after_symbol`, `safe_delete_symbol`), `find_referencing_symbols`,
  and per-project memories. Its session hook is also already wired
  to remind/auto-approve, so the friction is already paid.
- **The built-in `LSP` tool** is the cheap fallback for a one-shot
  lookup when Serena's manual flow (`get_symbols_overview` →
  `find_symbol` → `include_body`) would be more ceremony than the
  question deserves — e.g. a single `hover` for a type, or a quick
  `goToDefinition` while skimming.

When in doubt, reach for Serena. The LSP plugin is the snack;
Serena is the meal.

### codesight (project shape map)
Before diving into unfamiliar areas of the repo, call
`codesight_get_summary` for a ~500-token stack overview, or
`codesight_get_blast_radius` to gauge change scope. Useful for
the first prompt of a workflow, not for every step. Other tools
(`codesight_get_routes`, `codesight_get_schema`,
`codesight_get_hot_files`) drill into specific dimensions.

Codesight is mostly read-only — it doesn't edit code, only
describes structure. Pair it with Serena for the actual work.

### context7 (live library docs)
Pulls up-to-date docs for the libraries Meridian touches — Tauri
2.10, React 18, `@modelcontextprotocol/sdk`, Zod, etc. — without
burning WebFetch round-trips. Reach for it whenever an API call's
behaviour or signature is in doubt. User-scope plugin
(`context7@claude-plugins-official`), so it's available regardless
of whether Meridian is open or `pnpm mcp:connect` has been run.

---

## Layer Responsibilities

Three layers, with strict boundaries:

### React frontend (`src/`)
- UI only. Renders state; emits user intent via Tauri commands.
- **Never** holds credentials, calls LLM providers, or touches the filesystem.

### Rust backend (`src-tauri/`)
- Owns: credentials (keychain), settings store, JIRA/Bitbucket API calls, repo
  worktree tools, sidecar process supervision.
- Triggers workflow runs over IPC and surfaces sidecar progress and final
  results to the frontend.
- Does **not** own prompt assembly or workflow logic — those live in the sidecar.
- Sandboxes filesystem operations (frontend-invoked repo commands) to the
  configured worktree path. The sidecar itself no longer makes filesystem
  callbacks — tool use happens inside the CLI when delegated providers
  (Claude Code, Gemini CLI, Copilot CLI, Codex CLI) are spawned with
  `cwd=worktreePath`.

### TypeScript sidecar (`src-sidecar/`)
- Owns: workflow orchestration as plain async runners. Most workflows are
  one-shot; PR Review is a chunk-aware async function (single-pass for small
  PRs, multi-chunk + synthesis for large ones). Workflow IDs are routed to
  runners by `src-sidecar/src/workflows/registry/runners/index.ts` — adding
  a new workflow means writing the runner and adding one line there.
- Owns: all LLM provider integration via hand-rolled adapters in `src/models/`;
  structured-output validation (Zod); streaming; per-call token-usage tracking.
- Tool use is not bound at the sidecar level — CLI-delegation providers carry
  their own built-in tools (file read/glob/grep, etc.) and run them inside the
  user's worktree via `cwd=worktreePath`; API-key providers get tool-less chats
  with codebase context pre-baked into the prompt.
- Receives credentials per-request from Rust over stdio IPC; never caches them
  across calls, never logs them.
- A single Node process supervised by Rust; restarted on crash.

---

## Provider Model

### Supported providers

| Provider | Auth |
|---|---|
| **Anthropic** (Claude) | API key, or delegate to locally-installed `claude` CLI |
| **Google** (Gemini) | API key, or delegate to locally-installed `gemini` CLI |
| **OpenAI** (Codex/ChatGPT) | API key, or delegate to locally-installed `codex` CLI |
| **GitHub Copilot** | Delegate to locally-installed `copilot` CLI (no direct-API path) |
| **Ollama** (local, e.g. Qwen3) | None (local) |

Every adapter implements the same minimal `ChatModel` interface (a single
`stream(messages, options)` method), so the architecture is uniform regardless
of which provider/model the user picks. For Anthropic, Gemini, Codex, and
Copilot the "delegate to CLI" path spawns the user's locally-installed
`claude -p` / `gemini -p` / `codex exec` / `copilot -p` per call — the CLI
owns its own auth and Meridian never sees credentials.

### Default and model-quality variance

What varies between providers is *quality* on long, multi-step agent loops, not
capability. As a rule of thumb:

- **Claude** is the recommended default for chat-style workflows (PR review
  chat, grooming chat) — best multi-step reasoning and tool-calling
  reliability in practice.
- **Gemini** is reliable for one-shot workflows.
- **Ollama** quality depends heavily on the chosen model — Qwen3 handles
  tool-calling well; smaller models may not. Treat it primarily as a
  token-budget fallback.

The per-panel provider/model picker exposes all providers for all workflows.
Each panel's selection is hard-bound — there's no automatic fallback chain.
The cloud model list comes from the [models.dev](https://models.dev) catalog
(the same source `opencode` uses) so it stays in sync with vendor offerings
without a hand-maintained table; Ollama enumerates locally instead.

---

## Workflows

1. **Commander** — multi-agent tactical field. Launch Claude, Gemini, Codex,
   Copilot, or Qwen units, watch them work, and let them message each other.
   Each unit has a focused role (groomer, PR reviewer, bug-report writer,
   implementer, etc.) and the field aggregates "needs review" attention across
   units onto the landing page.
2. **PR Review Assistant** — AI-assisted review of assigned PRs across 5 lenses
   (see below). Chunk-aware async function with single-pass and multi-chunk paths.
3. **Sprint Dashboard** — real-time sprint health, blockers, team performance,
   and team workload with AI rebalancing suggestions. Also the launch point for
   standup recordings (header record button auto-tags the meeting `standup`).
4. **Sprint Retrospectives** — completed sprint analysis, trend charts, AI summary.
5. **Multi-Sprint Trends** — analysis across multiple completed sprints;
   pre-computed stats table + AI-driven pattern analysis.
6. **Groom Ticket** — runs the grooming workflow against any chosen ticket to
   surface blockers (missing AC, story points, ambiguity, scope clarity, vague
   titles). Useful in sprint planning and backlog triage.
7. **Meetings** — local whisper transcription _or_ freeform notes (when
   recording is not allowed); both are tagged, timestamped, and AI-summarisable,
   and feed into Sprint Retrospectives. Start a recording from any screen via
   the header record button (auto-tags `standup` from Sprint Dashboard, `retro`
   from Retrospectives); notes are created from the Meetings screen via the
   split-button dropdown, which remembers the last mode chosen. Cross-meetings
   chat lets the user ask questions across multiple past meetings.
8. **Time Tracking** — automatic work-hours tracker; pauses on screen lock or
   idle, banks overtime for later in the week.

---

## Commander

A "tactical field" for running multiple AI agents in parallel. Each unit is
backed by a CLI-delegation provider (`claude`, `gemini`, `codex`, `copilot`,
or local Ollama via `qwen`) running in a per-unit git worktree. Units have a
**role** (groomer, implementer, PR reviewer, bug-report writer, …) — the role
selects the system prompt, the toolset, and the default skill set. Roles and
their skill bundles are user-editable in Settings.

Each role can be configured with its own **MCP server set** — when the unit
spawns, Meridian writes a temporary MCP config that lists only the servers
that role has enabled. This keeps tool surface area small and per-role.

Units run in the background; the landing-page badge aggregates "needs review"
attention (grooming proposals pending, bug reports unpushed, PR reviews
awaiting verdict) across every unit so the user knows when to look. Bug- and
PR-review tabs use `lib/ideLauncher.ts` to open the relevant file in the
user's configured IDE on click.

---

## PR Review: Analysis Lenses

**Architecture**: chunk-aware async function. Small PRs go through a single
synthesis call; large PRs are split into chunks (at `diff --git` boundaries)
and reviewed sequentially, then a synthesis call combines per-chunk findings
into the final report. The path is chosen by chunk count, not a state graph.

The PR Review Assistant analyses every diff across five lenses. Each finding
must be categorised as Blocking / Non-blocking / Nitpick. Security and logic
findings default to Blocking; testing findings default to Non-blocking unless
safety-critical or tests were explicitly promised.

1. **Acceptance Criteria Compliance** — does the implementation address all AC?
   Does the PR description match what was actually built? If criteria are blank
   or not provided, return zero findings for this lens.
2. **Security & Vulnerability Analysis** — injection (SQL, XSS, path traversal,
   command), auth/authz issues, sensitive data exposure, insecure dependencies,
   input validation gaps, cryptographic weaknesses. Each finding must cite the
   specific file and line range. Never flag test/spec files.
3. **Logic Error Analysis** — off-by-one errors, race conditions, null/undefined
   assumptions, swallowed exceptions, inverted conditionals, unexpected state
   mutations. Each finding must cite the specific file and line range.
4. **Testing** — missing tests for non-trivial business logic, gaps in
   edge-case coverage, weak assertions. Skip config/build/asset files
   (json/yaml/toml, Dockerfile, lockfiles, css/svg/md, generated files,
   type-only definitions). For Bug-typed tickets, check that new/modified unit
   tests carry a `@tags <KEY>` annotation.
5. **General Code Quality** — adherence to codebase patterns, readability,
   performance, duplicate/redundant code (must cite two distinct line labels).
   Do not flag test framework function choice (test/it/describe/expect) as
   inconsistency.

A separate **PR Review chat** workflow (`pr_review_chat`) supports interactive
follow-up after the report — under CLI-delegation providers the chat agent
re-reads the worktree via the CLI's built-in tools; under API-key providers it
answers from the already-baked-in diff + report. Replies stream token-by-token
to the frontend either way.

---

## Codebase Access (Worktree)

Workflows that need codebase access (Groom Ticket file probe, PR Review)
operate against a **local git worktree**, not the Bitbucket API.

**Configuration** (in Meridian's settings store):
- `repo_worktree_path` — absolute path to the worktree (e.g.
  `/Users/you/REPOS/MyRepo-meridian`)
- `repo_base_branch` — branch the worktree tracks (default: `develop`)
- `pr_review_worktree_path` — separate worktree for PR review (optional)

**Tool use** — handled by the chosen provider, not by sidecar-bound tools:
- **CLI-delegation providers** (Claude Code, Gemini CLI, Copilot CLI, Codex
  CLI) are spawned with `cwd=worktreePath` and use their own built-in file
  tools (read, glob, grep, edit) inside the user's repo.
- **API-key providers** get tool-less chats; the relevant codebase context is
  pre-baked into the prompt (PR diff, grooming file-probe results, etc.).

The Rust backend still exposes worktree-scoped repo commands in
`src-tauri/src/commands/repo/` — `glob`, `grep`, `read`, `write`, `exec`,
`get_repo_diff` — but these are invoked directly by the React frontend (e.g.
the Grooming file probe), not as sidecar tool callbacks. All commands are
sandboxed to the active worktree path.

---

## Credential & Security Rules

- All credentials stored via **Tauri's secure OS keychain** — never written to
  disk in plaintext.
- Credentials are **never passed to the React frontend** — read in the Rust
  backend only.
- Credentials are passed to the sidecar **per-request over stdio IPC** — the
  sidecar never caches them across calls and never logs them.
- No credential ever appears in a Tauri command response to the frontend.
- Never use environment variables for credentials — all entered via the UI
  settings screen.
- Never expose raw credential values in logs or error messages.

**Credentials in use**: Anthropic API key (or `claude` CLI delegation — no
credential stored), Google AI Studio API key (or `gemini` CLI delegation —
no credential stored), OpenAI API key (or `codex` CLI delegation — no
credential stored), GitHub Copilot via `copilot` CLI delegation only (no
credential stored), Ollama base URL (no auth), JIRA Base URL + Email + API
Token, Bitbucket Workspace + Username + App Password.

**Claude.ai / Gemini Code Assist subscriptions are preserved via CLI
delegation**. Users sign in once with `claude /login` (or `gemini`,
`codex login`, `copilot login`) against their local CLI; Meridian's
`ClaudeCodeChatModel` / `GeminiCliChatModel` / `CodexCliChatModel` /
`CopilotCliChatModel` adapters spawn the binary per call and the CLI handles
subscription auth locally.

---

## General Guidelines

- **TypeScript throughout** the frontend and sidecar; **Rust** for backend, IPC,
  filesystem, and credential boundaries.
- **Structured outputs (JSON)** for all workflow handoffs, validated with Zod
  schemas in the sidecar.
- **shadcn/ui components** for all UI — do not build custom components where
  shadcn/ui has a suitable option.
- **Consistent Tailwind theme** via CSS variables — do not hardcode colours.
- **LLM-neutral UI copy** — say "AI", not "Claude". The app supports multiple providers.
- **Token-usage tracking** — each adapter surfaces
  `{ inputTokens, outputTokens }` (plus Anthropic's `cacheCreation` /
  `cacheRead`) on the terminal stream chunk; the sidecar emits the totals
  alongside each workflow result.
- **No LLM calls from the frontend or Rust backend** — every model call goes
  through the sidecar.
- **Workflow logic lives in the sidecar** — Rust orchestration is reduced to
  triggering runs and ferrying results.
