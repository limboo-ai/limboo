# Changelog

All notable changes to Limboo are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). See
[docs/operations/versioning.md](docs/operations/versioning.md).

## [Unreleased]

### Added

- Documentation subsystem: landing `README`, a structured `docs/` site (getting
  started, concepts, guides, reference, architecture, operations), community-health
  files (`LICENSE`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`, `ROADMAP`,
  `SUPPORT`, `GOVERNANCE`, `AUTHORS`, `CITATION.cff`), and `.github/` automation
  (CI, CodeQL, Dependabot, issue/PR templates).

### Changed

- **Integrated Terminal** — pinned `node-pty` to the `1.2.0-beta` line,
  Microsoft's in-progress rewrite of the native addon on Node-API
  (`node-addon-api`) instead of NAN. The compiled binary is ABI-stable across
  Node.js *and* Electron major versions, so the per-platform prebuilt bundled
  in the npm package works as-is — no `node-gyp` rebuild, no Visual Studio
  Build Tools requirement, for any Electron version including future ones.
  `forge.config.ts`'s `rebuildConfig.ignoreModules` excludes `node-pty` from
  Electron Forge's native-rebuild pass, since `@electron/rebuild` doesn't know
  the bundled prebuilt is already correct and would otherwise try (and fail
  without the toolchain) to recompile it. No terminal behavior change. (An
  earlier attempt at this used `@homebridge/node-pty-prebuilt-multiarch`, a
  NAN-based fork — verified afterward to have no published prebuilt past
  roughly Electron 29's ABI, so it didn't actually fix the problem; superseded
  by this change.) See [installation](docs/getting-started/installation.md).

## [1.5.1] - 2026-07-25

### Fixed

- **Linux packages could not launch.** `electron-builder.yml` set no
  `linux.executableName`, so electron-builder derived every Linux launcher path
  from the package name (`limboo`, lowercase) while Electron Forge — which owns
  packaging and hands the result over via `--prepackaged` — produced the binary
  as `Limboo`. On a case-sensitive filesystem that mismatch broke all three
  Linux artifacts in v1.5.0: the AppImage's `AppRun` exec'd a non-existent
  `limboo` and failed to start at all, and the deb/rpm shipped a
  `.desktop` entry pointing at `/opt/Limboo/limboo` plus a dangling
  `/usr/bin/limboo` symlink. Windows and macOS were unaffected. The application
  itself was never broken — only the launchers around it.

## [1.5.0] - 2026-07-25

Restores boot after a regression that made the app unlaunchable, and adds
conversation navigation plus visible file reads.

### Fixed

- **The app could not start.** The SQL-injection hardening added in v1.4.2's
  `addColumnIfMissing` validated the column definition against a character
  allowlist that had no `[` or `]`, so the pre-existing `sessions.tags`
  migration (`TEXT NOT NULL DEFAULT '[]'`) threw inside `migrate()` before the
  window opened — on fresh installs as well as existing databases, because the
  check ran ahead of the column-existence guard. `ALTER TABLE … ADD COLUMN` is
  now composed from validated parts (a typed column spec plus SQL-escaped
  literals) instead of a pattern-matched SQL fragment, so the CWE-89 defense is
  kept without guessing at legal defaults. The emitted DDL is unchanged, so no
  data migration is required.
- **Syntax highlighting in packaged builds** — Shiki now runs on its JavaScript
  RegExp engine, which needs neither WASM nor `unsafe-eval` under the production
  CSP; secret files prompt instead of hard-blocking.

### Added

- **Preview Rail** — a Codex-style navigation rail on the right of the
  conversation: one tick per message block, a hover "pyramid" that swells toward
  the pointer, and a floating preview of the destination prompt. Clicking jumps
  to that turn. It appears once a conversation passes three prompts.
- **File reads show their contents** — a `Read` tool row expands into the
  Shiki-highlighted code the model actually saw, with gutter numbers matching the
  real file (offset reads included), instead of surfacing only the path.
- **App-owned MCP platform layer** shared across Claude and Cursor.
- **`Slider`** — a token-styled range control over a native `input[type=range]`,
  keeping pointer, keyboard, and screen-reader behavior; adopted by the
  Appearance and Agent panels.
- **`HelixLoader`** — a pure-CSS strand indicator used for streaming status.

### Changed

- The settings modal is wider (768px → 1024px); its height is unchanged.
- Activity, Console, and Hooks icons moved from the right rail to the title bar,
  with their drawers still opening on the right.
- Opus 5 added to the model catalog and set as the default agent model.
- File paths and commands in tool rows render in the monospace face.

### Security

- **MCP transport hardening** — an over-limit HTTP response now rejects
  immediately instead of hanging or truncating silently; the stdio client drains
  and rejects every in-flight request when a child dies, so a hung process no
  longer pins async frames.
- **Path traversal** — MCP config merges resolve the root before the containment
  check and realpath the deepest existing ancestor, defeating a symlinked parent
  that would redirect the write outside the repository.
- **Prototype pollution** — untrusted on-disk MCP config is rebuilt from a
  sanitized copy with unsafe keys stripped.
- **Sandbox floor corrected** — the OS jail denied the whole `userData` root,
  which contains the session worktree and attachments the agent must use. It now
  denies only the crown jewels (`secrets/`, `limboo.db`, `settings.json`,
  `window-state.json`); `allowWritePaths` entries are screened at both
  persistence and runtime, and Strict mode closes the
  `dangerouslyDisableSandbox` escape hatch.

## [1.0.0]

The first consolidated release. The desktop foundation and platform services are
operational.

### Added

- **Desktop foundation** — multi-process Electron architecture with a typed IPC
  layer, frameless window with custom controls, window-state persistence, persistent
  settings, native menu and context menu, system tray, desktop notifications,
  single-instance lock, CSP and sandbox, main-process logging and global error
  handlers, a React error boundary and loading-screen hydration gate, Zustand
  stores, a command palette and keyboard shortcuts, and the pure-black three-pane
  shell.
- **Workspace Manager** — register, open, switch, and remove workspaces with a
  validation and tech-stack detection pipeline; active-workspace lifecycle.
- **Session Manager** — create, list, switch, duplicate, and trash development
  sessions; per-session transcript and activity persistence.
- **Local Database** — `better-sqlite3` store at `{userData}/limboo.db` with WAL,
  a versioned schema, idempotent migrations, and bound-parameter access.
- **Git Engine** — status, diff, stage, commit, log, branches, tags, blame, fetch,
  init, push, and pull (force-with-lease, never bare force), plus lightweight
  per-session checkpoints stored under a private ref namespace; an ahead/behind pill
  and unpushed badge in the UI.
- **Integrated Terminal** — workspace-scoped `node-pty` sessions with bounded
  scrollback; agent shell commands mirrored into the terminal view.
- **File System Layer** — `chokidar` watch, an indexed directory tree, guarded
  reads, and live git status pushed into the session list.
- **Agent Manager** — orchestration of the `@anthropic-ai/claude-agent-sdk` in plan
  and implement modes, risk-gated tool approvals, workspace path guarding,
  transcript/activity/diagnostics persistence, and SDK session resume.
- **Local Memory System** — durable, provider-independent project knowledge with
  fully offline FTS5 / BM25 retrieval, tiered ranking, auto-capture proposals, and
  prompt injection; a Memory activity tab and settings.
- **Unified streaming timeline** — the conversation rendered as one continuous,
  turn-grouped event stream of messages, tool calls, and status markers.

[Unreleased]: https://github.com/BotCoder254/limboo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/BotCoder254/limboo/releases/tag/v1.0.0
