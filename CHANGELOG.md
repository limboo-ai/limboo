# Changelog

All notable changes to Limboo are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). See
[docs/operations/versioning.md](docs/operations/versioning.md).

## [Unreleased]

## [1.6.0] - 2026-07-25

Repairs in-app updating, which has never worked on macOS and could fail to
install or restart anywhere; adds code signing and a Microsoft Store channel;
and extends the release to every architecture, including Arch/Manjaro packages
and arm64 builds for all three platforms.

### Fixed

- **"Restart & install" did nothing.** Clicking it could leave the app running on
  the old version, or quit without ever coming back. Four separate causes:
  - The install request was gated on the UI stage being `downloaded`, but the
    hourly poll re-emitted `update-available` for the already-downloaded version
    and moved the stage off it. The click then returned with no log, no error and
    no feedback of any kind. Staged updates are now tracked by version
    independently of the UI stage, polling is suspended while an update is
    staged, and every refusal is logged and surfaced to the user.
  - **The restart lost a race with itself.** `quitAndInstall` spawns the
    replacement process synchronously but defers `app.quit()` to the next tick,
    so the new instance hit `requestSingleInstanceLock()` while the old one still
    held it and quit itself. The lock is now released before the handoff, and
    `second-instance` events are ignored while an update is in flight.
  - **A throwing disposer could keep the app alive.** `before-quit` ran thirteen
    `dispose()` calls with no error containment; one throw aborted the rest and
    was swallowed by the global `uncaughtException` handler, leaving the process
    up with an installer waiting on it. Each disposer is now isolated, and a
    watchdog forces the exit if the process is still running four seconds after
    the handoff.
  - Windows now installs silently (`--updated /S --force-run`). Without `/S` the
    assisted NSIS wizard re-ran from the first page, which reads as "nothing
    happened".
- **macOS auto-update was impossible, and the "Intel" downloads were arm64
  builds.** `scripts/dist.mjs` passed the Forge output *directory* to
  `electron-builder --prepackaged`, but electron-builder treats that value as the
  `.app` bundle path on macOS. The published update zips were rooted at
  `Limboo-darwin-arm64/` instead of `Limboo.app/`, which Squirrel.Mac cannot
  install — they downloaded and checksummed perfectly and then failed, every
  time. The same misconfiguration made electron-builder wrap that one
  single-architecture directory once per architecture listed in
  `electron-builder.yml`, so `Limboo-1.5.1-mac.zip` ("Intel") and
  `Limboo-1.5.1-arm64-mac.zip` were byte-identical. Fixed by pointing
  `--prepackaged` at the bundle on darwin and removing every explicit `arch:`
  list, so the architecture comes only from the CI matrix.
  **Users on v1.5.1 or earlier must download the new `.dmg` once, manually** —
  those builds cannot auto-update to this release.
- **Linux `.deb` / `.rpm` installs never received updates.** Self-update was
  disabled unless `APPIMAGE` was set, though electron-updater has supported
  installing deb, rpm and pacman packages through the system package manager for
  some time. The app now selects its updater explicitly — `APPIMAGE` first, then
  the `package-type` marker — which also fixes AppImages that shipped a stale
  `deb`/`rpm` marker from electron-builder's shared staging directory and so
  routed AppImage users to the wrong updater.

### Added

- **A code-signing pipeline.** Developer ID signing + notarization for macOS
  (hardened runtime + entitlements) — which is also what makes macOS auto-update
  possible at all, since Squirrel.Mac refuses to update an app it cannot verify —
  and Authenticode for Windows, with Azure Trusted Signing wired and dormant
  beside a self-signed route. Note that a self-signed certificate does **not**
  remove the SmartScreen warning; it is documented as such. The whole path is
  opt-in from environment credentials (`scripts/signing.cjs`), so builds without
  them — **including this release** — are unsigned and behave exactly as before.
  Because signing runs in Forge rather than electron-builder — `--prepackaged`
  skips the pack step where electron-builder would sign — the split is documented
  in [code signing](docs/ci/code-signing.md).
- **A Microsoft Store (MSIX) channel**, the only warning-free Windows route that
  does not require buying a certificate. Store builds disable self-update, since
  the Store owns updates there. See
  [microsoft-store.md](docs/operations/microsoft-store.md).
- **Wider platform coverage.** Linux gains `pacman` (Arch/Manjaro) and `tar.gz`
  targets, and every platform now publishes both x64 and arm64. The
  architectures GitLab's SaaS runners cannot build — macOS Intel, arm64 Linux,
  arm64 Windows — are produced by a new tag-triggered
  `release-supplement.yml` workflow that uploads into the same release.
- **Release gates for the failures above.**
  `ci/scripts/verify-artifacts.mjs` asserts the macOS zip root, that no two
  artifacts in an update feed share a hash, that every file a feed references
  exists, and that debug output stays out of the publish set.
  `ci/scripts/verify-signing.mjs` gained a Gatekeeper assessment and enforces the
  Windows `publisherName` invariant.
  `ci/scripts/merge-update-metadata.mjs` merges the per-runner update feeds, so a
  supplementary upload adds an architecture instead of deleting one.
- [auto-update.md](docs/operations/auto-update.md) — the per-platform update
  mechanism and the invariants that must not be broken.
- Documentation subsystem: landing `README`, a structured `docs/` site (getting
  started, concepts, guides, reference, architecture, operations), community-health
  files (`LICENSE`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`, `ROADMAP`,
  `SUPPORT`, `GOVERNANCE`, `AUTHORS`, `CITATION.cff`), and `.github/` automation
  (CI, CodeQL, Dependabot, issue/PR templates).

### Security

- Windows update-signature verification is pinned off
  (`win.verifyUpdateCodeSignature: false`) while the self-signed route is in use,
  and enforced in CI. Left at its default, electron-builder derives
  `publisherName` from the certificate CN and writes it into `app-update.yml`;
  electron-updater would then demand a trusted Authenticode chain that a
  self-signed certificate can never satisfy, breaking every Windows update with
  no recovery short of a manual reinstall.

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

[Unreleased]: https://github.com/limboo-ai/limboo/compare/v1.6.0...HEAD
[1.6.0]: https://github.com/limboo-ai/limboo/compare/v1.5.1...v1.6.0
[1.5.1]: https://github.com/limboo-ai/limboo/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/limboo-ai/limboo/compare/v1.0.0...v1.5.0
[1.0.0]: https://github.com/limboo-ai/limboo/releases/tag/v1.0.0
