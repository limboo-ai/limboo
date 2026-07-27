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
    version: '1.13.0',
    date: '2026-07-28',
    markdown: `The conversation stops being something you only read. Every message now carries
its own actions on hover, and any turn can be rolled back — the workspace returns
to how it was before the agent touched it, including deleting files it created,
with the rollback recorded rather than hidden. Plan Mode also stops saying the
same thing three times.

### Added

- **Actions on every message.** Hovering a message (or reaching it with the
  keyboard) reveals a row of actions: copy, copy as Markdown, quote it into the
  composer, reference it in your next prompt, select its text, view it raw,
  export it, open it as a new session, pin it to memory, regenerate it, or revert
  to it. Copying an answer that is still being written captures everything that
  has arrived so far rather than making you wait.
- **Revert a turn.** Reverting restores the workspace to the checkpoint taken
  before that turn and drops the conversation after it, so the agent's memory and
  your files agree again. You are shown exactly what will change first — files
  restored, files removed, messages dropped — and a safety checkpoint of the
  current state is taken before anything moves. Only the session's own worktree
  is touched, so work running in parallel is unaffected.
- **Live planning progress in the conversation.** While a plan is being written,
  the stream now names what the agent is doing — reading the repository,
  searching, indexing symbols, decomposing the requirements — with each finished
  step settling into a checked line.

### Changed

- **Plan Mode reads once, not three times.** The large plan card is gone from the
  conversation; the stream carries a single line and the approval buttons, and
  the Task panel holds the plan itself. That panel is now just two sections —
  Implementation plan and Live progress — instead of a plan, a duplicate outline
  of the plan, and a checklist of the same tasks. Live progress is always shown
  while work is running, rather than appearing only when the outline failed to
  match.
- **One in-progress indicator everywhere.** The planning placeholder, the plan
  header, and each running task now use the same loader the agent uses while it
  writes, instead of three different spinners and a large completion checkmark.
- **Restoring a checkpoint now truly undoes the work.** Files the agent created
  after the checkpoint used to survive a restore and be left behind; they are
  removed now, and the restore reports how many files it restored and removed.
  Untracked files that already existed are never touched.

### Fixed

- **Checkpoint comparisons could not see new files.** Both the "what changed
  since this checkpoint" view and the restore itself compared against staged
  changes only, so a file the agent created and never staged was invisible —
  the diff under-reported it and a restore left it behind. Both now compare
  against the full working state, including files that were never staged.
- **The selected session no longer has a coloured bar.** It reads by its
  background and a bolder title, matching the tabs elsewhere in the app.

### Removed

- Four Task-panel settings that no longer controlled anything visible ("stream
  tasks as they appear", "auto-expand new tasks", "collapse completed tasks", and
  "show task durations").`,
  },
  {
    version: '1.12.0',
    date: '2026-07-27',
    markdown: `Sessions run in a git worktree, and Limboo puts that worktree inside its own
application data folder. A safety rule meant to keep the agent out of Limboo's
database read the whole folder as off limits — so in a worktree session the
agent was refused the moment it tried to write its first file, in what was
actually its own working directory. Approving a plan could fail for a reason
that was never true, and leave the session unable to try again. The plan card
also stops appearing before there is a plan to read.

### Fixed

- **The agent could not write anything in a worktree session.** Every file it
  tried to create was refused as "Limboo's own app data", because sessions check
  out into a folder that lives inside Limboo's data directory. The rule now
  covers only what it was written to protect — the database, your settings, and
  the encrypted secret store — and the rest of that directory, including the
  worktree the agent works in, is ordinary ground. Cursor runs were blocked by a
  second copy of the same rule and are fixed with it.
- **Commands were refused for mentioning a filename.** Anything containing the
  text \`limboo.db\` was blocked wherever it ran, so a plain search of your own
  source could be denied. Only the real, full path to the database is protected
  now.
- **Approving a plan could fail with "the agent is already working on this
  session".** The plan appears while the run that wrote it is still finishing, so
  a quick click arrived a fraction of a second early and was turned away.
  Approving now waits for that run to finish instead of refusing, and the buttons
  are held until it has.
- **A failed approval left the plan unusable.** The plan was marked as being
  carried out before the work had actually started, so when it did not start,
  the approval buttons never came back and the session could not be recovered.
  The plan is restored when the run fails to begin.

### Changed

- **The plan card waits for the plan.** It used to appear as soon as planning
  started, showing a title and an "Analyzing the repository" line above the
  composer while the agent's actual reasoning streamed past it further up. It now
  appears with the proposal it is asking you to approve. Progress while planning
  reads where the rest of the run does — in the conversation.`,
  },
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
];

/** The notes for one version, or null when this build does not carry them. */
export function releaseNotesFor(version: string): ReleaseNotesEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_NOTES.find((r) => r.version === wanted) ?? null;
}
