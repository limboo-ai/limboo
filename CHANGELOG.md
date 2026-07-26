# Changelog

All notable changes to Limboo are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). See
[docs/operations/versioning.md](docs/operations/versioning.md).

## [Unreleased]

## [1.8.0] - 2026-07-26

Turns an update from a maintenance task into a workspace document. The release
notes added in 1.7.0 were one blob of Markdown; they are now a structured release
dashboard driven by a real release manifest that the CI pipeline publishes
alongside the binaries — so the release page, the changelog and the app all
describe a release from the same file.

### Added

- **A structured release document.** The What's New tab becomes a full release
  view: version, codename, channel, git tag, commit, build number, platform and
  Electron versions; every changelog section as its own collapsible, copyable,
  filterable card ordered by consequence (breaking and security first);
  contributors with commit counts; merged pull requests and branches; published
  assets with sizes; and a verification block carrying the `sha256sum -c` and
  `gh attestation verify` commands. A release-history list browses every version
  the changelog knows and can diff any two bundled releases category by category.
- **A published release manifest.** Every release now ships
  `release-manifest.json` — the same structured notes the app carries, plus every
  artifact's size and SHA-256 and the signing posture per platform. It is written
  before `SHA256SUMS` so the checksum manifest covers it, and
  `ci/scripts/check-release-manifest.mjs` proves the two describe the same
  downloads before anything is published.
- **Release notes are searchable and agent-reachable.** They federate into Global
  Search as a `release` source, and the agent can answer "what changed in 1.7.0?"
  through read-only `list_releases` / `release_notes` tools on the existing
  `limboo_search` server. Both providers get them from one implementation.
  Nothing is injected into a system prompt — Claude Code shipped a fix for
  exactly that bug, where its release-notes view leaked the whole changelog into
  every subsequent request.
- **Export and copy.** A release can be copied as Markdown or written to a file
  from the document or the command palette. Main owns the save dialog; the
  renderer never supplies a path.

### Changed

- **A release tab is its label.** It carries no icon — every other tab in the
  strip names an object you could point at on disk, and this one names a version,
  so the version is the identity.
- **The accent underline is gone from the document and worktree tab strips.** An
  active tab is marked by its raised seat and a heavier label instead. A 2px
  accent bar under a tab that already sits on a plate says the same thing twice,
  and on pure black it reads as a second element rather than an emphasis of the
  first. Worktree tabs also gained the focus ring they were missing.
- **`npm run gen:notes` generates the manifest too**, and CI enforces that both
  generated modules stay in sync with `CHANGELOG.md` (`gen:notes --check`).
  Keeping them in sync was a checklist item with nothing behind it, so a
  changelog edit could ship with stale in-app notes and nobody would find out
  until after the release.

### Fixed

- **The release notes could reappear on every launch.** With no session selected
  the notes render inline rather than as a tab, and acknowledgement is a tab
  being closed — so nothing ever marked the version seen. That path now has its
  own dismissal.
- **The tab's document id was spelled by hand** in one place instead of derived
  through `documentId()`, which exists precisely so the format cannot drift. A
  mismatch there would have left the tab looking permanently closed, silently
  reopening it forever.

### Security

- **Release metadata is compiled into the build, never fetched.** There is no
  network path to widen and nothing to verify at runtime, which is also the only
  design that works under the production CSP (`connect-src 'self'`). Contributor
  avatars are drawn locally from initials rather than loaded from a forge.
- **Every manifest URL is screened before it becomes a link** — https only, no
  embedded credentials, and the host must be a forge host or a subdomain of one,
  matched on a dot boundary so `evil-github.com` cannot pass. Unscreened URLs
  render as plain text.
- **The document never claims verification it cannot perform.** A build cannot
  contain the hash of an installer produced from it, so asset digests live only
  in the published manifest; the app shows where they are and how to check them
  instead of printing a digest it cannot stand behind. Facts about the running
  process are shown separately from claims about the published artifact.
- **Markdown rendering is unchanged and still sanitized** (`rehype-sanitize`, no
  raw HTML), the document performs no writes, and the export handler bounds its
  input and owns its own path.

## [1.7.0] - 2026-07-26

Adds the **Work Graph** — a typed, queryable graph of what a session actually
did, built from both coding agents' event streams and owned entirely by Limboo —
along with a document-oriented workspace where diffs open as first-class tabs,
and an in-app **What's New** tab so an update can finally tell you what changed.

### Added

- **The Work Graph (DAWG).** Every session's execution is recorded as a Directed
  Acyclic Work Graph — objectives, plans, tasks, subagents, investigations,
  searches, memory lookups, MCP calls, commands, files, commits, approvals and
  results — connected by nine typed relationships (`follows`, `contains`,
  `generated`, `depends-on`, `implemented-in`, `verified-by`, `blocked-by`,
  `reviewed-by`, `produced-artifact`). Neither Claude nor Cursor exposes a work
  graph; both are conversation-driven. This is Limboo's own layer, derived from
  the structured events they *do* emit, so it records both agents identically and
  every future adapter contributes nodes for free. It is deliberately shaped like
  a git history — vertical execution lanes, one node per row, commits in a
  right-hand gutter — rather than a free-floating node diagram, because that is
  the mental model developers already have. Layout runs in a Web Worker and rows
  virtualize, so a long session stays responsive.
- **Structural search over the graph.** Queries traverse *shape*, not just text:
  an FTS5 seed set (free text, node kinds, statuses, time range) expanded by a
  bounded closure over the edge table. "Every task blocked by X" is a traversal,
  not a transcript scroll.
- **Eight export formats.** JSON, Markdown, Mermaid, Graphviz DOT, CSV and a
  self-contained HTML report are rendered from the stored graph; SVG and PNG are
  rendered from the layout. Exports go to the clipboard or to a file you pick.
- **A document-oriented workspace.** Diffs promote out of the Changes panel into
  first-class tabs with their own icons, pinning, reordering, close/reopen and
  per-document view state. `ChangesNavigator` unifies file browsing across the Git
  panel and Changes; `DiffEditor` adds syntax highlighting and word-level diffs.
- **A "What's New" tab.** When Limboo starts on a version it has not shown you
  before, the release notes for *that* version open as a workspace tab. Closing it
  is remembered until the next update. It is available any time from the command
  palette, and — like Claude Code's own `/release-notes` — it is display-only and
  never enters the agent's context.

### Fixed

- **The work graph silently discarded whole batches of its own data.** A node
  whose payload exceeded the size cap was skipped, but the edges pointing at it
  were still written. `INSERT OR IGNORE` does not suppress a FOREIGN KEY
  violation, so the failing edge aborted the entire transaction and took every
  other node and edge in that flush with it — behind a single `logger.warn`.
  Oversized nodes are now shrunk rather than dropped, every edge's endpoints are
  proven to exist before insert, and persistent failures surface as a banner in
  the panel instead of an innocent-looking empty graph.
- **Orphan cleanup deleted real work.** It removed any node with no edge, which is
  the normal state of a terminal opened outside a run, a commit made with no agent
  active, or a service started before the first prompt. Those kinds are now exempt.
- **Commits could be attributed to the wrong session, or lost entirely.** An
  unattributable commit was still recorded as "seen", so it was dropped
  permanently at the exact moment its session next became active. It is now only
  marked seen once it has been attributed. Separately, a `git pull` bringing in
  upstream commits claimed the current run had implemented its files in every one
  of them; that fan-out is now limited to commits made after the run started.
- **Subagent work was spliced into the main timeline.** The `contains`
  relationship was defined, drawn by the layouter and listed in the legend, but
  nothing ever emitted it. Subagent nesting now rides the Agent SDK's
  `parent_tool_use_id`, so a subagent's steps sit inside the node that spawned
  them. (Cursor's print mode has no subagents, so the branch simply never forks
  there.)
- **Permission decisions were never recorded.** Approval nodes were inferred by
  string-matching a log line's `"Blocked…"` prefix, which could not see the answer
  the user actually gave. They now come from the one decision gate both providers
  call, carrying the real decision, tool and risk.
- **Nodes were labelled with the wrong agent.** Provider and mode were read from
  current settings at write time rather than captured per run, so switching models
  mid-session silently relabelled a run's history.
- **Two release gates were not actually verifying anything.** Both were found by
  checking the published v1.6.0 artifacts by hand rather than trusting a green
  pipeline:
  - The Squirrel.Mac layout check — the gate that exists to catch the defect that
    made every macOS update in v1.5.x impossible — reported "no macOS update zips
    in this build" and passed. It matched on a `-mac.zip` filename suffix, and
    the packaging fix in 1.6.0 renamed the artifacts to `-<arch>.zip`. The zip
    list now comes from `latest-mac.yml`, which is naming-independent and
    authoritative, and a macOS feed with no matching zip is a failure rather than
    a skip — a build can no longer opt out of its own regression gate.
  - `SHA256SUMS` listed `limboo-package.cyclonedx.json`, a side-file the SBOM
    action writes but the upload globs exclude, so `sha256sum -c SHA256SUMS`
    exited non-zero on an otherwise correct release — discrediting the one
    verification command the README and release notes give users. It is excluded
    from the publish set, and a new check fails the build if the manifest names
    anything that is not being published. (The v1.6.0 manifest was corrected in
    place; its remaining hashes were always valid.)

### Changed

- **Release notes now come from this file.** The GitHub release body was
  generated from commit subjects while the changelog was written by hand, so the
  two said different things about the same release and nothing connected them.
  The notes generator now reads the section for the tag being released and falls
  back to the previous commit-subject behaviour only when there isn't one — which
  also means the notes shown inside the app, the notes on the release page, and
  this file are the same text by construction.
- **An active icon is marked by its own color, not a filled block behind it.** In
  the activity rail, the title-bar tab strip and the settings navigation, the
  background plate is gone and the glyph takes the accent color. On a pure-black
  canvas the plate read as a second element competing with the icon it sat
  behind. Hover still shows it, where it is feedback rather than state.

### Security

- **The graph's secret redactor missed the case its own guide calls out.** It is
  shared with the Hook Engine, so a gap in it was a gap in two subsystems. It now
  covers credential-bearing URLs (`https://user:token@host` — a remote typed into
  a terminal became a node title verbatim), GitHub, AWS and Slack tokens, PEM
  private-key blocks, JWTs, and generic `secret=`-shaped assignments. Redaction
  also runs recursively over a node's whole metadata on the single path into the
  database, rather than only over its title and detail, so a future field is
  covered without having to opt in.
- **Export writes to disk without the renderer ever naming a path.** Saving a
  graph sends only a session id and a format; the main process opens the save
  dialog and writes wherever you chose. There is no renderer-supplied path, and
  therefore no traversal surface to defend.
- **Query inputs are bounded before they are examined.** Array arguments are
  capped before filtering (an oversized array was previously walked in full),
  export results are byte-capped, and edge reads are limited instead of unbounded
  table scans.

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

[Unreleased]: https://github.com/limboo-ai/limboo/compare/v1.8.0...HEAD
[1.8.0]: https://github.com/limboo-ai/limboo/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/limboo-ai/limboo/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/limboo-ai/limboo/compare/v1.5.1...v1.6.0
[1.5.1]: https://github.com/limboo-ai/limboo/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/limboo-ai/limboo/compare/v1.0.0...v1.5.0
[1.0.0]: https://github.com/limboo-ai/limboo/releases/tag/v1.0.0
