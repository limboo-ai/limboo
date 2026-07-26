/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Written by `npm run gen:notes` (scripts/gen-release-notes.mjs) from
 * CHANGELOG.md, which is the single source of truth for release notes: the same
 * text becomes the GitHub release body, this in-app "What's New" tab, and the
 * changelog itself. Re-run the script after editing CHANGELOG.md.
 *
 * Contains the 3 most recent released sections.
 */

/** One release's notes, as authored in CHANGELOG.md. */
export interface ReleaseNotesEntry {
  /** Semantic version, without a leading `v`. */
  version: string;
  /** ISO release date, or null for a section written without one. */
  date: string | null;
  /** The section body as Markdown — headings and bullets, no version heading. */
  markdown: string;
}

/** Newest first. */
export const RELEASE_NOTES: ReleaseNotesEntry[] = [
  {
    version: '1.7.0',
    date: '2026-07-26',
    markdown: `Adds the **Work Graph** — a typed, queryable graph of what a session actually
did, built from both coding agents' event streams and owned entirely by Limboo —
along with a document-oriented workspace where diffs open as first-class tabs,
and an in-app **What's New** tab so an update can finally tell you what changed.

### Added

- **The Work Graph (DAWG).** Every session's execution is recorded as a Directed
  Acyclic Work Graph — objectives, plans, tasks, subagents, investigations,
  searches, memory lookups, MCP calls, commands, files, commits, approvals and
  results — connected by nine typed relationships (\`follows\`, \`contains\`,
  \`generated\`, \`depends-on\`, \`implemented-in\`, \`verified-by\`, \`blocked-by\`,
  \`reviewed-by\`, \`produced-artifact\`). Neither Claude nor Cursor exposes a work
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
  per-document view state. \`ChangesNavigator\` unifies file browsing across the Git
  panel and Changes; \`DiffEditor\` adds syntax highlighting and word-level diffs.
- **A "What's New" tab.** When Limboo starts on a version it has not shown you
  before, the release notes for *that* version open as a workspace tab. Closing it
  is remembered until the next update. It is available any time from the command
  palette, and — like Claude Code's own \`/release-notes\` — it is display-only and
  never enters the agent's context.

### Fixed

- **The work graph silently discarded whole batches of its own data.** A node
  whose payload exceeded the size cap was skipped, but the edges pointing at it
  were still written. \`INSERT OR IGNORE\` does not suppress a FOREIGN KEY
  violation, so the failing edge aborted the entire transaction and took every
  other node and edge in that flush with it — behind a single \`logger.warn\`.
  Oversized nodes are now shrunk rather than dropped, every edge's endpoints are
  proven to exist before insert, and persistent failures surface as a banner in
  the panel instead of an innocent-looking empty graph.
- **Orphan cleanup deleted real work.** It removed any node with no edge, which is
  the normal state of a terminal opened outside a run, a commit made with no agent
  active, or a service started before the first prompt. Those kinds are now exempt.
- **Commits could be attributed to the wrong session, or lost entirely.** An
  unattributable commit was still recorded as "seen", so it was dropped
  permanently at the exact moment its session next became active. It is now only
  marked seen once it has been attributed. Separately, a \`git pull\` bringing in
  upstream commits claimed the current run had implemented its files in every one
  of them; that fan-out is now limited to commits made after the run started.
- **Subagent work was spliced into the main timeline.** The \`contains\`
  relationship was defined, drawn by the layouter and listed in the legend, but
  nothing ever emitted it. Subagent nesting now rides the Agent SDK's
  \`parent_tool_use_id\`, so a subagent's steps sit inside the node that spawned
  them. (Cursor's print mode has no subagents, so the branch simply never forks
  there.)
- **Permission decisions were never recorded.** Approval nodes were inferred by
  string-matching a log line's \`"Blocked…"\` prefix, which could not see the answer
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
    in this build" and passed. It matched on a \`-mac.zip\` filename suffix, and
    the packaging fix in 1.6.0 renamed the artifacts to \`-<arch>.zip\`. The zip
    list now comes from \`latest-mac.yml\`, which is naming-independent and
    authoritative, and a macOS feed with no matching zip is a failure rather than
    a skip — a build can no longer opt out of its own regression gate.
  - \`SHA256SUMS\` listed \`limboo-package.cyclonedx.json\`, a side-file the SBOM
    action writes but the upload globs exclude, so \`sha256sum -c SHA256SUMS\`
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
  covers credential-bearing URLs (\`https://user:token@host\` — a remote typed into
  a terminal became a node title verbatim), GitHub, AWS and Slack tokens, PEM
  private-key blocks, JWTs, and generic \`secret=\`-shaped assignments. Redaction
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
  table scans.`,
  },
  {
    version: '1.6.0',
    date: '2026-07-25',
    markdown: `Repairs in-app updating, which has never worked on macOS and could fail to
install or restart anywhere; adds code signing and a Microsoft Store channel;
and extends the release to every architecture, including Arch/Manjaro packages
and arm64 builds for all three platforms.

### Fixed

- **"Restart & install" did nothing.** Clicking it could leave the app running on
  the old version, or quit without ever coming back. Four separate causes:
  - The install request was gated on the UI stage being \`downloaded\`, but the
    hourly poll re-emitted \`update-available\` for the already-downloaded version
    and moved the stage off it. The click then returned with no log, no error and
    no feedback of any kind. Staged updates are now tracked by version
    independently of the UI stage, polling is suspended while an update is
    staged, and every refusal is logged and surfaced to the user.
  - **The restart lost a race with itself.** \`quitAndInstall\` spawns the
    replacement process synchronously but defers \`app.quit()\` to the next tick,
    so the new instance hit \`requestSingleInstanceLock()\` while the old one still
    held it and quit itself. The lock is now released before the handoff, and
    \`second-instance\` events are ignored while an update is in flight.
  - **A throwing disposer could keep the app alive.** \`before-quit\` ran thirteen
    \`dispose()\` calls with no error containment; one throw aborted the rest and
    was swallowed by the global \`uncaughtException\` handler, leaving the process
    up with an installer waiting on it. Each disposer is now isolated, and a
    watchdog forces the exit if the process is still running four seconds after
    the handoff.
  - Windows now installs silently (\`--updated /S --force-run\`). Without \`/S\` the
    assisted NSIS wizard re-ran from the first page, which reads as "nothing
    happened".
- **macOS auto-update was impossible, and the "Intel" downloads were arm64
  builds.** \`scripts/dist.mjs\` passed the Forge output *directory* to
  \`electron-builder --prepackaged\`, but electron-builder treats that value as the
  \`.app\` bundle path on macOS. The published update zips were rooted at
  \`Limboo-darwin-arm64/\` instead of \`Limboo.app/\`, which Squirrel.Mac cannot
  install — they downloaded and checksummed perfectly and then failed, every
  time. The same misconfiguration made electron-builder wrap that one
  single-architecture directory once per architecture listed in
  \`electron-builder.yml\`, so \`Limboo-1.5.1-mac.zip\` ("Intel") and
  \`Limboo-1.5.1-arm64-mac.zip\` were byte-identical. Fixed by pointing
  \`--prepackaged\` at the bundle on darwin and removing every explicit \`arch:\`
  list, so the architecture comes only from the CI matrix.
  **Users on v1.5.1 or earlier must download the new \`.dmg\` once, manually** —
  those builds cannot auto-update to this release.
- **Linux \`.deb\` / \`.rpm\` installs never received updates.** Self-update was
  disabled unless \`APPIMAGE\` was set, though electron-updater has supported
  installing deb, rpm and pacman packages through the system package manager for
  some time. The app now selects its updater explicitly — \`APPIMAGE\` first, then
  the \`package-type\` marker — which also fixes AppImages that shipped a stale
  \`deb\`/\`rpm\` marker from electron-builder's shared staging directory and so
  routed AppImage users to the wrong updater.

### Added

- **A code-signing pipeline.** Developer ID signing + notarization for macOS
  (hardened runtime + entitlements) — which is also what makes macOS auto-update
  possible at all, since Squirrel.Mac refuses to update an app it cannot verify —
  and Authenticode for Windows, with Azure Trusted Signing wired and dormant
  beside a self-signed route. Note that a self-signed certificate does **not**
  remove the SmartScreen warning; it is documented as such. The whole path is
  opt-in from environment credentials (\`scripts/signing.cjs\`), so builds without
  them — **including this release** — are unsigned and behave exactly as before.
  Because signing runs in Forge rather than electron-builder — \`--prepackaged\`
  skips the pack step where electron-builder would sign — the split is documented
  in [code signing](docs/ci/code-signing.md).
- **A Microsoft Store (MSIX) channel**, the only warning-free Windows route that
  does not require buying a certificate. Store builds disable self-update, since
  the Store owns updates there. See
  [microsoft-store.md](docs/operations/microsoft-store.md).
- **Wider platform coverage.** Linux gains \`pacman\` (Arch/Manjaro) and \`tar.gz\`
  targets, and every platform now publishes both x64 and arm64. The
  architectures GitLab's SaaS runners cannot build — macOS Intel, arm64 Linux,
  arm64 Windows — are produced by a new tag-triggered
  \`release-supplement.yml\` workflow that uploads into the same release.
- **Release gates for the failures above.**
  \`ci/scripts/verify-artifacts.mjs\` asserts the macOS zip root, that no two
  artifacts in an update feed share a hash, that every file a feed references
  exists, and that debug output stays out of the publish set.
  \`ci/scripts/verify-signing.mjs\` gained a Gatekeeper assessment and enforces the
  Windows \`publisherName\` invariant.
  \`ci/scripts/merge-update-metadata.mjs\` merges the per-runner update feeds, so a
  supplementary upload adds an architecture instead of deleting one.
- [auto-update.md](docs/operations/auto-update.md) — the per-platform update
  mechanism and the invariants that must not be broken.
- Documentation subsystem: landing \`README\`, a structured \`docs/\` site (getting
  started, concepts, guides, reference, architecture, operations), community-health
  files (\`LICENSE\`, \`CONTRIBUTING\`, \`CODE_OF_CONDUCT\`, \`SECURITY\`, \`ROADMAP\`,
  \`SUPPORT\`, \`GOVERNANCE\`, \`AUTHORS\`, \`CITATION.cff\`), and \`.github/\` automation
  (CI, CodeQL, Dependabot, issue/PR templates).

### Security

- Windows update-signature verification is pinned off
  (\`win.verifyUpdateCodeSignature: false\`) while the self-signed route is in use,
  and enforced in CI. Left at its default, electron-builder derives
  \`publisherName\` from the certificate CN and writes it into \`app-update.yml\`;
  electron-updater would then demand a trusted Authenticode chain that a
  self-signed certificate can never satisfy, breaking every Windows update with
  no recovery short of a manual reinstall.

### Changed

- **Integrated Terminal** — pinned \`node-pty\` to the \`1.2.0-beta\` line,
  Microsoft's in-progress rewrite of the native addon on Node-API
  (\`node-addon-api\`) instead of NAN. The compiled binary is ABI-stable across
  Node.js *and* Electron major versions, so the per-platform prebuilt bundled
  in the npm package works as-is — no \`node-gyp\` rebuild, no Visual Studio
  Build Tools requirement, for any Electron version including future ones.
  \`forge.config.ts\`'s \`rebuildConfig.ignoreModules\` excludes \`node-pty\` from
  Electron Forge's native-rebuild pass, since \`@electron/rebuild\` doesn't know
  the bundled prebuilt is already correct and would otherwise try (and fail
  without the toolchain) to recompile it. No terminal behavior change. (An
  earlier attempt at this used \`@homebridge/node-pty-prebuilt-multiarch\`, a
  NAN-based fork — verified afterward to have no published prebuilt past
  roughly Electron 29's ABI, so it didn't actually fix the problem; superseded
  by this change.) See [installation](docs/getting-started/installation.md).`,
  },
  {
    version: '1.5.1',
    date: '2026-07-25',
    markdown: `### Fixed

- **Linux packages could not launch.** \`electron-builder.yml\` set no
  \`linux.executableName\`, so electron-builder derived every Linux launcher path
  from the package name (\`limboo\`, lowercase) while Electron Forge — which owns
  packaging and hands the result over via \`--prepackaged\` — produced the binary
  as \`Limboo\`. On a case-sensitive filesystem that mismatch broke all three
  Linux artifacts in v1.5.0: the AppImage's \`AppRun\` exec'd a non-existent
  \`limboo\` and failed to start at all, and the deb/rpm shipped a
  \`.desktop\` entry pointing at \`/opt/Limboo/limboo\` plus a dangling
  \`/usr/bin/limboo\` symlink. Windows and macOS were unaffected. The application
  itself was never broken — only the launchers around it.`,
  },
];

/** The notes for one version, or null when this build does not carry them. */
export function releaseNotesFor(version: string): ReleaseNotesEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_NOTES.find((r) => r.version === wanted) ?? null;
}
