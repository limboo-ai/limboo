/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Written by `npm run gen:notes` (scripts/gen-release-notes.mjs) from
 * CHANGELOG.md, which is the single source of truth for release notes: the same
 * text becomes the GitHub release body, the in-app release document, and the
 * changelog itself. Re-run the script after editing CHANGELOG.md.
 *
 * Contains the 5 most recent released sections.
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
    version: '1.11.0',
    date: '2026-07-27',
    markdown: `1.10.0 set out to stop Plan and Ask blocking the MCP servers you had connected.
It gave every server a **Plan & Ask access** setting and then defaulted it to
"only the tools this server declares read-only" — but declaring that is optional,
and most servers declare nothing. So most servers stayed blocked, and the refusal
sent you to a control buried inside a per-server edit form that search could not
find. An un-annotated tool now asks you, in the run, with a button. Opening the
Tasks drawer also stopped crashing, and a finished plan no longer sits above the
composer forever.

### Fixed

- **The Tasks drawer crashed on any plan with a finished or not-yet-started
  step.** A missing icon reference threw as the step was drawn, taking the whole
  drawer down with it. Only steps that were running or had failed escaped it,
  which is why it survived 1.10.0.
- **Most MCP servers were still blocked in Plan and Ask.** Read-only annotations
  are optional in the MCP protocol and few servers ship them, so the default
  setting allowed nothing at all — the same dead end 1.10.0 meant to close, one
  layer further in. A tool from a known, connected server that has simply not
  declared itself read-only now **asks for approval during the run**, the same
  way any other command does, instead of being refused with a pointer to
  Settings. Blocked still means blocked, with no prompt.
- **Limboo's own memory and search tools were unusable while planning.** They are
  the tools the agent uses to recall what it learned about your project and to
  find its way around it, and they were left out of the permissions a planning
  run is given — so every plan started with less about your project than it had
  available.
- **The plan card stayed above the composer forever.** A plan record is never
  deleted, so once a session had run one, a card for it sat pinned over the
  composer for the life of that session — collapsing, once it was approved or
  rejected, to a header with nothing under it. It now shows while a plan is being
  written, while it waits for you, and while it is being carried out, and goes
  away when it is done. Finished plans stay in the Tasks drawer.

### Added

- **A default Plan & Ask access for new servers**, under Settings › MCP, beside
  Default trust — so a fleet of read-only servers is a decision made once rather
  than per server. Changing it never rewrites servers already configured.
- **Plan & Ask access is findable.** It is now in settings search under *plan*,
  *ask*, *read-only*, *approve* and *blocked* — searching any of those used to
  land on the unrelated Plan & Tasks section — and each server states its current
  access in words on its own row, instead of only inside Edit.

### Changed

- **A server marked Trusted is still asked about in Plan and Ask** when it has
  not declared a tool read-only. Trust decides whether a permitted tool is
  silent, never whether a read-only mode is a read-only mode.
- **Settings no longer offers "Archive on completion".** The switch had never
  been connected to anything, and with finished plans now hidden by rule it would
  read as the control for that.`,
  },
  {
    version: '1.10.0',
    date: '2026-07-27',
    markdown: `Plan and Ask are read-only modes, and they enforced that by refusing anything
they could not prove safe. Because nothing could prove a third-party tool safe,
both modes blocked every MCP server you had connected — and the agent's own
research subagents — in every project, with no prompt and no way to allow them.
Read-only now means read-only rather than unusable. The plan itself also leaves
the side drawer and appears in the conversation, where the work is.

### Fixed

- **Connected MCP tools were blocked while planning, with no way through.** A
  tool from a server you added yourself — a database browser, a deployment
  client — was refused in Plan and Ask even when it only reads, and the refusal
  offered no way to permit it. Servers now carry a **Plan & Ask access** setting,
  and read-only tools work in both modes.
- **The agent could not delegate research while planning.** Spawning a subagent
  was treated as a mutating command and blocked outright, so planning a large
  change could not fan out to explore the codebase first — in any project. A
  subagent performs no work of its own, and everything it goes on to do is
  checked by the same permission gate under the same mode, so it can still only
  read while a plan is being written.
- **A Plan or Ask run using Cursor could fail before it started.** A missing
  default in the permission configuration threw as the run was assembled.
- **Cursor mislabelled MCP tool calls.** Tool names arriving from Cursor's hooks
  were reformatted before they were recognized, so a server's tools were shown
  under a mangled name and were never matched against that server's own
  permissions.
- **Editing an MCP server discarded everything known about its tools.** Saving an
  unrelated field — a rename, a timeout — cleared the cached tool list until the
  next successful health probe, which also meant a server briefly lost the
  read-only information its permissions depend on.
- **A blocked tool now says what to change.** Every denial pointed at the same
  setting, even when the setting was already correct and the real cause was a
  server that was unknown, belonged to another project, or was not trusted.

### Added

- **Plan & Ask access, per MCP server.** Three choices: *Blocked* (nothing runs
  in the read-only modes), *Read-only tools* (only the tools that server declares
  read-only), or *Whole server* (you vouch for it). A server that declares
  nothing says so in its settings rather than silently allowing nothing, and
  tools it does declare read-only are marked in its tool list.
- **The plan appears in the conversation.** It used to live only in the narrow
  Tasks drawer, so a long plan read as raw Markdown next to the work it
  describes. It now renders as text at full width in the stream, with copy, a
  Markdown view, collapse, and a control that opens the full panel. Approving no
  longer means leaving the conversation to find the button.

### Changed

- **A run's MCP servers come from its own project.** They were resolved from
  whichever project happened to be open, so switching or closing a project while
  the agent was working changed which servers it was allowed to use mid-run — a
  trusted server would start asking for approval, and a permitted one could be
  refused. The set is now fixed when the run starts, from the session's own
  project.

### Security

- **A server's claim to be read-only is not taken on faith.** Servers may declare
  which of their tools only read. Following the Model Context Protocol's own
  guidance, that declaration is honored only for servers you have marked trusted;
  for anything else it is shown as information and the tool still asks. Choosing
  *Whole server* is recorded as your assertion, not the server's.
- **Permitting a tool while planning never widens it elsewhere.** The read-only
  allowance applies to Plan and Ask alone; in the normal modes every one of these
  tools still asks exactly as before, and the workspace, app-data and
  sensitive-file guards run ahead of it unchanged.
- **A subagent that asks to run outside the sandbox is refused while planning**
  and recorded in the timeline, alongside the existing audit for shell commands
  that do the same.`,
  },
  {
    version: '1.9.0',
    date: '2026-07-27',
    markdown: `Fixes the Linux updater, which could never finish. On Arch and Manjaro the
published package declared dependencies that no longer exist, so \`pacman -U\`
failed every single time — after the user had already typed their password. The
release document also drops its badges and coloured glyphs, and contributors now
appear with their real profile picture and name.

### Fixed

- **The \`.pacman\` package could never install.** electron-builder's default
  dependency list for that target still names \`http-parser\` (dropped from Arch)
  and \`libappindicator-gtk3\` (AUR-only), so every self-update ended in
  \`cannot resolve "http-parser"\` and the app stayed on the old version.
  \`pacman.depends\` is now declared explicitly and every entry is verified present
  in core/extra.
- **"Restart & install" froze the app, prompted twice, then killed it.**
  electron-updater runs the system package manager with a synchronous,
  shell-quoted spawn, which blocks the main process for the entire
  authorization — nineteen seconds in the reported case — and then fires a
  *second* password prompt (\`pacman -Sy\`) when the first attempt fails. Limboo
  now owns the privileged install: argv-only, asynchronous, one prompt, no
  retry that re-prompts, and the window stays responsive throughout.
- **A refused install no longer force-quits the app.** The four-second quit
  watchdog fired unconditionally, so an install the package manager had already
  rejected still terminated the app — the update appeared to do nothing except
  close the window. The watchdog is now armed only once the installer handoff is
  confirmed.
- **An install that fails now says so.** electron-updater reports this class of
  failure on an event rather than by throwing, so \`install()\` returned success
  and the UI stayed silent. The real error is captured and surfaced.
- **Quitting Limboo no longer asks for your password.** \`autoInstallOnAppQuit\`
  re-ran the whole privileged install on every ordinary quit, blocking shutdown
  behind a polkit dialog. It is disabled for the Linux package formats.
- **The Linux updater can no longer pick the wrong package manager.** The
  \`package-type\` marker baked into the build is cross-checked against the tooling
  actually present on the machine, so a stale marker cannot select a package
  manager that is not installed.
- **"Keep running in tray" finally does something.** The setting had shipped
  since the first release with no main-process consumer at all: nothing could
  veto a window close, so closing always quit the app and the tray icon vanished
  with it. Closing now hides to the tray, the tray can restore or recreate the
  window, and a one-time notification says where the app went. If the tray icon
  could not be created, closing still quits — being left with no window *and* no
  icon is worse than not having the feature.

### Added

- **Contributors show their real profile picture and name.** Resolved at build
  time through the forge's own commit-email-to-account mapping and embedded in
  the release manifest, so the picture ships inside the build that describes it.
  Anyone the lookup cannot resolve keeps their initials.
- **When an update cannot install itself, Limboo hands you the command that
  will.** The exact \`sudo pacman -U …\` (or \`dpkg\`/\`dnf\`) line for the file
  already downloaded, copyable from the update ribbon.

### Changed

- **The release document has no badges and no decorative icons.** Status reads as
  words — "Stable", "Running now", "Windows: self-signed" — and every section is
  identified by its name alone. The category glyphs are gone, and so is the
  colour coding: what matters most is simply listed first, which survives a
  screenshot, colour-blindness, and the Markdown export in a way a red triangle
  does not.
- **The update ribbon reports the whole install.** It now has a real "Installing"
  state that cannot be dismissed mid-flight, a determinate progress bar, and a
  restart button with proper pressed, focused, disabled and busy states.
- **Prerelease rows in the release history print their channel correctly.** The
  list showed a lowercase \`beta\` where the header showed \`Beta\`; both now read
  from one table.

### Security

- **Embedded avatars are screened before they are displayed.** The build-time
  fetch is HTTPS-only and host-allowlisted, follows redirects manually so every
  hop is re-checked, caps the response while streaming, and identifies images by
  their magic bytes rather than a declared content type. The renderer re-screens
  the value before it reaches an image tag, rejecting anything that is not a
  base64 raster data URI — a manifest is data even when the file it arrived in is
  ours. Contributor email addresses remain lookup keys and are never written into
  the manifest.
- **The privileged Linux install passes no shell.** The package manager is
  invoked with an argument vector rather than a quoted \`/bin/bash -c\` string.`,
  },
  {
    version: '1.8.0',
    date: '2026-07-26',
    markdown: `Turns an update from a maintenance task into a workspace document. The release
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
  assets with sizes; and a verification block carrying the \`sha256sum -c\` and
  \`gh attestation verify\` commands. A release-history list browses every version
  the changelog knows and can diff any two bundled releases category by category.
- **A published release manifest.** Every release now ships
  \`release-manifest.json\` — the same structured notes the app carries, plus every
  artifact's size and SHA-256 and the signing posture per platform. It is written
  before \`SHA256SUMS\` so the checksum manifest covers it, and
  \`ci/scripts/check-release-manifest.mjs\` proves the two describe the same
  downloads before anything is published.
- **Release notes are searchable and agent-reachable.** They federate into Global
  Search as a \`release\` source, and the agent can answer "what changed in 1.7.0?"
  through read-only \`list_releases\` / \`release_notes\` tools on the existing
  \`limboo_search\` server. Both providers get them from one implementation.
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
- **\`npm run gen:notes\` generates the manifest too**, and CI enforces that both
  generated modules stay in sync with \`CHANGELOG.md\` (\`gen:notes --check\`).
  Keeping them in sync was a checklist item with nothing behind it, so a
  changelog edit could ship with stale in-app notes and nobody would find out
  until after the release.

### Fixed

- **The release notes could reappear on every launch.** With no session selected
  the notes render inline rather than as a tab, and acknowledgement is a tab
  being closed — so nothing ever marked the version seen. That path now has its
  own dismissal.
- **The tab's document id was spelled by hand** in one place instead of derived
  through \`documentId()\`, which exists precisely so the format cannot drift. A
  mismatch there would have left the tab looking permanently closed, silently
  reopening it forever.

### Security

- **Release metadata is compiled into the build, never fetched.** There is no
  network path to widen and nothing to verify at runtime, which is also the only
  design that works under the production CSP (\`connect-src 'self'\`). Contributor
  avatars are drawn locally from initials rather than loaded from a forge.
- **Every manifest URL is screened before it becomes a link** — https only, no
  embedded credentials, and the host must be a forge host or a subdomain of one,
  matched on a dot boundary so \`evil-github.com\` cannot pass. Unscreened URLs
  render as plain text.
- **The document never claims verification it cannot perform.** A build cannot
  contain the hash of an installer produced from it, so asset digests live only
  in the published manifest; the app shows where they are and how to check them
  instead of printing a digest it cannot stand behind. Facts about the running
  process are shown separately from claims about the published artifact.
- **Markdown rendering is unchanged and still sanitized** (\`rehype-sanitize\`, no
  raw HTML), the document performs no writes, and the export handler bounds its
  input and owns its own path.`,
  },
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
];

/** The notes for one version, or null when this build does not carry them. */
export function releaseNotesFor(version: string): ReleaseNotesEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_NOTES.find((r) => r.version === wanted) ?? null;
}
