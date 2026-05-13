# Meridian — Development Reference

## Overview

Meridian is a personal productivity desktop app for a senior engineer and scrum master.
It provides engineering leadership tooling: sprint dashboard, retrospectives, sprint
trends, workload balancer, ticket grooming/quality assessment, PR review assistant,
address-PR-comments workflow, meeting transcription, and time tracking. Built on
Tauri + React + TypeScript with a TypeScript sidecar that owns all LLM provider
integration via LangChain.js + LangGraph.js. Data sources: JIRA API and Bitbucket
API. Built for individual use — not distributed.

The implementation pipeline (an end-to-end ticket-to-PR workflow) was removed
2026-05-10 — Claude Code does that job better; Meridian focuses on the engineering
leadership surfaces that no general AI tool covers.

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
- **TypeScript sidecar (Node) + LangGraph.js** — owns all workflow orchestration and
  LLM provider integration; the Rust backend never makes LLM HTTP calls directly and
  holds no workflow state
- **LangChain.js model adapters** — `@langchain/anthropic`, `@langchain/google-genai`,
  `@langchain/ollama`
- **Zod** — schema validation for every structured-output handoff
- **JIRA API + Bitbucket API** — data sources

---

## Repo Layout

```
src/                    React frontend
  screens/              one file per top-level workflow screen
  stores/               Zustand stores; one per long-running screen
  components/           shadcn/ui-based shared components
  lib/tauri.ts          single source of truth for Tauri command wrappers + types
  lib/preferences.ts    typed wrapper around the prefs store

src-tauri/              Rust backend (Tauri host process)
  src/commands/         Tauri command modules — one file per domain
  src/integrations/     sidecar IPC bridge, Bitbucket/JIRA HTTP clients
  src/llms/             provider helpers (model catalogue, CLI detection, ping)
  src/agents/dispatch.rs only — config/override resolution, no LLM calls
  src/storage/          keychain credentials + plain-JSON preferences
  target/debug/bundle.cjs  ← runtime sidecar bundle (copied from src-sidecar/dist)

src-sidecar/            TypeScript sidecar (Node, supervised by Rust)
  src/workflows/        one file per workflow + registry/ (the entrypoint)
  src/models/           LangChain model adapters
  src/tools/            repo-tools.ts (LangGraph tools) + bridge.ts (IPC promise registry)
  src/protocol.ts       inbound/outbound message shapes — mirror in src-tauri/src/integrations/sidecar.rs

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
  rejection paths), routing logic (LangGraph conditional edges), and any code
  with non-obvious branching. Tests live next to the source as `*.test.ts` /
  `*.test.tsx`.
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
`ticket-quality`, `meetings`, `time-tracking`.

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
- Sandboxes all filesystem operations to the configured worktree path.
- Executes tool callbacks invoked by the sidecar (read/write file, glob, grep,
  exec) — the sidecar never touches the filesystem directly.

### TypeScript sidecar (`src-sidecar/`)
- Owns: workflow orchestration. Most workflows are one-shot (a thin runner
  around the shared scaffold); PR Review uses a chunk-aware `StateGraph`.
- Owns: all LLM provider integration via LangChain.js model adapters; tool-call
  loops; structured-output validation (Zod); streaming; per-call token-usage
  tracking.
- Receives credentials per-request from Rust over stdio IPC; never caches them
  across calls, never logs them.
- A single Node process supervised by Rust; restarted on crash.

---

## Provider Model

### Supported providers

| Provider | Auth |
|---|---|
| **Anthropic** (Claude) | API key, or delegate to locally-installed Claude Code CLI |
| **Google** (Gemini) | API key, or delegate to locally-installed `@google/gemini-cli` |
| **Ollama** (local, e.g. Qwen3) | None (local) |

LangChain.js model adapters normalise structured tool-calling across providers,
so the architecture is uniform regardless of which provider/model the user
picks. For Anthropic and Gemini the "delegate to CLI" path spawns the user's
locally-installed `claude -p` or `gemini -p` per call — the CLI owns its own
auth and Meridian never sees credentials. This is the auth model since the
2026-05-10 pivot; the previous OAuth-impersonation paths were removed because
they violated Anthropic's and Gemini's TOS for third-party clients.

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

### Auth posture (TOS)

The CLI delegation paths (Claude Code, gemini-cli) are the sanctioned headless-
mode patterns documented by each vendor — Meridian shells out to the user's
own install and never sees credentials. API-key auth (Anthropic Console
`sk-ant-api…`, Google AI Studio `AIza…`) is the distribution-safe fallback.
Both are clean from a TOS perspective. The previous OAuth-impersonation paths
(Anthropic Claude Code billing-header envelope, Gemini CodeAssist v1internal
endpoint) were deleted 2026-05-10 — see
`/Users/isaac/.claude/projects/-Users-isaac-REPOS-Meridian/memory/project_oauth_tos_and_alternatives.md`
for the verified TOS picture per provider. GitHub Copilot support was dropped
in the same pivot (no third-party path exists; the user uses Copilot directly
in VS Code at work).

---

## Workflows

1. **PR Review Assistant** — AI-assisted review of assigned PRs across 5 lenses
   (see below). Chunk-aware StateGraph with single-pass and multi-chunk paths.
2. **Sprint Dashboard** — real-time sprint health, blockers, team performance,
   and team workload with AI rebalancing suggestions. Also the launch point for
   standup recordings (header record button auto-tags the meeting `standup`).
3. **Sprint Retrospectives** — completed sprint analysis, trend charts, AI summary.
4. **Multi-Sprint Trends** — analysis across multiple completed sprints;
   pre-computed stats table + AI-driven pattern analysis.
5. **Groom Ticket** — runs the grooming workflow against any chosen ticket to
   surface blockers (missing AC, story points, ambiguity, scope clarity, vague
   titles). Useful in sprint planning and backlog triage.
4. **Meetings** — local whisper transcription _or_ freeform notes (when
   recording is not allowed); both are tagged, timestamped, and AI-summarisable,
   and feed into Sprint Retrospectives. Start a recording from any screen via
   the header record button (auto-tags `standup` from Sprint Dashboard, `retro`
   from Retrospectives); notes are created from the Meetings screen via the
   split-button dropdown, which remembers the last mode chosen.
5. **Time Tracking** — automatic work-hours tracker; pauses on screen lock or
   idle, banks overtime for later in the week.

---

## PR Review: Analysis Lenses

**Architecture**: chunk-aware. Small PRs go through a single `single_pass`
synthesis node; large PRs are split by the `prepare` node into chunks and
reviewed sequentially in `chunk_review`, then the `synthesis` node combines
per-chunk findings into the final report. Both paths are nodes in the same
`StateGraph` chosen by a conditional edge.

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
follow-up after the report — the chat agent can re-read the worktree via the
same tool callbacks and stream replies token-by-token to the frontend.

---

## Codebase Access (Worktree)

Workflows that need codebase access (Groom Ticket file probe, PR Review)
operate against a **local git worktree**, not the Bitbucket API.

**Configuration** (in Meridian's settings store):
- `repo_worktree_path` — absolute path to the worktree (e.g.
  `/Users/you/REPOS/MyRepo-meridian`)
- `repo_base_branch` — branch the worktree tracks (default: `develop`)
- `pr_review_worktree_path` — separate worktree for PR review (optional)

**Agent tools** — defined as LangGraph tools in the sidecar, executed by
callback into the Rust backend over IPC, sandboxed to the active worktree:
- `glob_repo_files(pattern)`
- `grep_repo_files(pattern, path?)`
- `read_repo_file(path)`
- `write_repo_file(path, content)`
- `get_repo_diff()` — used by the PR Review workflow. Diffs against
  `repo_base_branch` configured in settings.

A separate `exec_in_worktree(command, timeoutSecs?)` IPC callback runs an
arbitrary shell command inside the worktree.

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

**Credentials in use**: Anthropic API key (or Claude Code CLI delegation —
no credential stored), JIRA Base URL + Email + API Token, Bitbucket Workspace
+ Username + App Password, Google AI Studio API key (or gemini-cli delegation
— no credential stored), Ollama base URL (no auth).

**Claude.ai subscription support is preserved via CLI delegation**. Users sign
in once with `claude /login` against their Claude Code install; Meridian's
`ClaudeCodeChatModel` adapter spawns `claude -p` per call and the CLI handles
the subscription auth locally. Same shape for Gemini Code Assist (free
personal tier) — users sign in once via `gemini` and Meridian's
`GeminiCliChatModel` adapter spawns `gemini -p` per call. The previous custom
OAuth adapters (`anthropic-oauth.ts`, `gemini-codeassist.ts`) that rewrote
request bodies into first-party billing-header envelopes were deleted
2026-05-10 in favour of these delegation adapters.

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
- **Token-usage tracking** — LangChain.js model calls return usage metadata per
  invocation; the sidecar emits `{ inputTokens, outputTokens }` alongside each
  workflow result.
- **No LLM calls from the frontend or Rust backend** — every model call goes
  through the sidecar.
- **Workflow logic lives in the sidecar** — Rust orchestration is reduced to
  triggering runs and ferrying results.
