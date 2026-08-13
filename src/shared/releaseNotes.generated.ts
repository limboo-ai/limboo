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
    version: '1.18.2',
    date: '2026-08-13',
    markdown: `### Fixed

- **Agent settings now show the selected harness correctly.** Choosing a Cursor
  Composer model marks Cursor as active and Claude Code as available but not
  selected, instead of showing Claude Code copy as though it were the running
  agent. Unknown model ids now display as unknown and stay blocked rather than
  falling back to Claude labels.`,
  },
  {
    version: '1.18.1',
    date: '2026-08-13',
    markdown: `### Fixed

- **Settings workspace tabs crashed on open.** The tab strip rendered the shared
  Settings icon without importing it, so opening Settings as a workspace document
  threw \`ReferenceError: Settings2 is not defined\`. The icon is now wired through
  the same lucide import as the rest of the tab strip.`,
  },
  {
    version: '1.18.0',
    date: '2026-08-13',
    markdown: `Limboo 1.18.0 stabilizes the Cursor fixes from the beta, adds the swappable
harness layer, opens Settings as a workspace tab, and ships the beta update
channel as an opt-in path for future prereleases.

### Fixed

- **Cursor sessions denied every tool call.** The hook runner read the event name
  from a single payload key that the CLI does not always send. With no event name
  it could not identify what was being asked, so it failed closed — which is the
  correct posture, but it meant every read, search, shell command and edit was
  refused, and nothing on screen said why. The event name now travels in the
  runner's own arguments, where Limboo writes it, with five payload spellings as
  fallbacks, and a genuine failure now names the missing key in the timeline
  instead of denying silently.
- **Four more ways a Cursor run could stall.** The permission helper could boot as
  a GUI process instead of a script and then hang for the full ten-minute hook
  timeout on every single tool call; nothing timed out while it waited for input;
  a successful approval could be truncated on its way out and be read as a
  refusal; and the sandbox denied the helper access to its own communication
  socket. Each is fixed, and each failure now reports what happened.
- **"Prompt me for everything" meant "deny everything".** Tightening the approval
  policy withdrew the rule that let Cursor read files at all. Because the only way
  to ask for permission on that path is the hook bridge, a session with hooks
  unavailable was left unable to read or to ask. Reads and inspection commands
  now keep their floor regardless of the policy; the permission gate still runs
  on top of it.
- **A Cursor session could stream as Claude Code.** The model was checked for
  character shape rather than for which provider serves it, and every Cursor
  model id passes that check — so a mis-routed model was handed to the Claude
  integration and ran there, with no error anywhere. Routing now has an explicit
  "unknown" answer, dispatch is exhaustive, and a model nothing claims fails by
  name instead of quietly running somewhere.
- **Commit-message generation always used Claude.** A Cursor-only user pressing
  the button started a Claude run and, with Claude not installed, was told to sign
  in to a product they were not using. It now follows the agent you selected, and
  the button is no longer disabled for Cursor users.
- **Searching Settings missed several controls.** Some settings were never
  registered in the search index, so typing their name found nothing. Fixed for
  the Agent and Runtime categories, with a check that fails the build if it
  happens again.
- **Absolute paths inside your project were treated as escapes.** Cursor's CLI
  writes full paths by default, and a full path to a file inside your own worktree
  was classified as leaving it — so ordinary reads were refused during planning.

### Added

- **Agents can run through a harness layer.** Limboo now drives agents through
  Vercel AI SDK 7's harness abstraction as well as its own integrations, so a new
  agent runtime becomes an adapter rather than a new code path. Pi is available;
  Claude Code runs through it behind an opt-in switch. Everything above the
  adapter — the conversation, permissions, memory, search, the work graph, the
  runtime panel — is unchanged, because they all sit on one seam.
- **A sandbox that runs on your own worktree.** Every shipped sandbox for that
  abstraction is either a cloud service or a private filesystem, and neither
  fits: your repository must not leave the machine, and the agent has to edit the
  actual files that git, the diff viewer and checkpoints are watching. Limboo has
  its own, rooted at the session's worktree, with the same containment rules the
  rest of the app enforces — nothing outside the worktree, and never the app's own
  database, settings or secrets.
- **Settings opens as a workspace tab.** An icon beside the close button promotes
  the dialog into an editor tab, the way a diff opens. Both surfaces render the
  same panels, so nothing drifts. The tab has no Cancel: settings apply as you
  change them, exactly as they already did.
- **An update channel you can choose.** Settings › Updates now offers Stable or
  Beta. A beta is never downloaded in the background — you are shown its release
  notes and decide.

### Changed

- **Settings panels are flat rows.** The Agent and MCP categories wrapped groups
  of settings in bordered panels while every other category used plain labelled
  rows, which made them look like a different application. The boxes are gone.
  Every input, button and select now uses one corner radius.
- **The Agent panel is reorganised.** Providers became Harnesses and now reads as
  one list instead of two hand-built cards. Connection and reliability moved to
  Runtime, where the rest of the supervision settings live. A section that
  contained no settings at all was removed, and the remainder is ordered by the
  decision you are making: which agent, which model, what it may do, what
  contains it.
- **The model hint stopped being wrong.** It named a default the app had not used
  for several versions, because the text was typed by hand next to the value it
  described. It is now derived from that value.

### Security

- **Built-in tools on the harness path are gated by Limboo.** The harness
  abstraction has two separate approval surfaces, and the one Limboo had wired
  covers only tools the host supplies — built-in file writes and shell commands
  are governed by a different setting that defaults to allowing everything. On
  that path an agent could have written files and run commands without Limboo's
  permission gate. Every built-in tool call now suspends the turn and asks, using
  the same authority, the same risk labels, the same dialogs and the same audit
  trail as every other agent.
- **A harness that cannot ask for permission is refused.** Rather than run it with
  weaker enforcement, Limboo declines to start it and says so. This is not
  theoretical: the Codex adapter reports that it cannot request approval for its
  shell tool, so it is registered as unavailable with the reason shown rather than
  offered and then failing.
- **The harness setup step asks first.** Preparing a harness for its first run
  downloads its agent CLI, which is the only time Limboo reaches the network
  outside talking to your agent and fetching contributor avatars. The exact
  commands are read from the adapter and shown to you for approval once, and the
  approval is tied to those commands — if a later version changes them, you are
  asked again. Without approval the run does not start.
- **Credentials are passed through, never stored.** A harness receives an API key
  only if your own environment already has one, from an explicitly named list.
  Nothing is written to settings, accepted over the app's internal channels, put
  on a command line, or logged. A gap in log redaction that could have printed
  those variables is closed.
- **Reads on the harness path cannot be gated, and the setting says so.** The
  underlying runtime allows built-in file reads unconditionally, so
  "auto-approve reads" has no effect there. Rather than leave a control that looks
  like it works, the setting explains the limitation.

### Known limitations

- **The harness path is off by default.** Claude Code and Cursor continue to run
  through their own integrations. Turn the harness on in Settings › Agent ›
  Harnesses if you want to try it; you will be asked to approve its setup step
  first.
- **A harness conversation does not resume.** Each message starts a fresh
  conversation with the underlying runtime. The alternative failed on every second
  message, so this is deliberate until the resume format is handled properly.
- **Codex is unavailable.** Its adapter cannot ask for permission before running
  shell commands. It is listed with that reason rather than hidden.`,
  },
  {
    version: '1.18.0-beta.2',
    date: '2026-08-12',
    markdown: `The first beta. Two bugs that made Cursor sessions unusable are fixed, agents can
now run through a swappable harness layer instead of one hardcoded integration,
and Settings opens as a workspace tab. This build is published for testing ahead
of a stable release — read the warning at the top of these notes before
installing it over a working copy.

### Fixed

- **Cursor sessions denied every tool call.** The hook runner read the event name
  from a single payload key that the CLI does not always send. With no event name
  it could not identify what was being asked, so it failed closed — which is the
  correct posture, but it meant every read, search, shell command and edit was
  refused, and nothing on screen said why. The event name now travels in the
  runner's own arguments, where Limboo writes it, with five payload spellings as
  fallbacks, and a genuine failure now names the missing key in the timeline
  instead of denying silently.
- **Four more ways a Cursor run could stall.** The permission helper could boot as
  a GUI process instead of a script and then hang for the full ten-minute hook
  timeout on every single tool call; nothing timed out while it waited for input;
  a successful approval could be truncated on its way out and be read as a
  refusal; and the sandbox denied the helper access to its own communication
  socket. Each is fixed, and each failure now reports what happened.
- **"Prompt me for everything" meant "deny everything".** Tightening the approval
  policy withdrew the rule that let Cursor read files at all. Because the only way
  to ask for permission on that path is the hook bridge, a session with hooks
  unavailable was left unable to read or to ask. Reads and inspection commands
  now keep their floor regardless of the policy; the permission gate still runs
  on top of it.
- **A Cursor session could stream as Claude Code.** The model was checked for
  character shape rather than for which provider serves it, and every Cursor
  model id passes that check — so a mis-routed model was handed to the Claude
  integration and ran there, with no error anywhere. Routing now has an explicit
  "unknown" answer, dispatch is exhaustive, and a model nothing claims fails by
  name instead of quietly running somewhere.
- **Commit-message generation always used Claude.** A Cursor-only user pressing
  the button started a Claude run and, with Claude not installed, was told to sign
  in to a product they were not using. It now follows the agent you selected, and
  the button is no longer disabled for Cursor users.
- **Searching Settings missed several controls.** Some settings were never
  registered in the search index, so typing their name found nothing. Fixed for
  the Agent and Runtime categories, with a check that fails the build if it
  happens again.
- **Absolute paths inside your project were treated as escapes.** Cursor's CLI
  writes full paths by default, and a full path to a file inside your own worktree
  was classified as leaving it — so ordinary reads were refused during planning.

### Added

- **Agents can run through a harness layer.** Limboo now drives agents through
  Vercel AI SDK 7's harness abstraction as well as its own integrations, so a new
  agent runtime becomes an adapter rather than a new code path. Pi is available;
  Claude Code runs through it behind an opt-in switch. Everything above the
  adapter — the conversation, permissions, memory, search, the work graph, the
  runtime panel — is unchanged, because they all sit on one seam.
- **A sandbox that runs on your own worktree.** Every shipped sandbox for that
  abstraction is either a cloud service or a private filesystem, and neither
  fits: your repository must not leave the machine, and the agent has to edit the
  actual files that git, the diff viewer and checkpoints are watching. Limboo has
  its own, rooted at the session's worktree, with the same containment rules the
  rest of the app enforces — nothing outside the worktree, and never the app's own
  database, settings or secrets.
- **Settings opens as a workspace tab.** An icon beside the close button promotes
  the dialog into an editor tab, the way a diff opens. Both surfaces render the
  same panels, so nothing drifts. The tab has no Cancel: settings apply as you
  change them, exactly as they already did.
- **An update channel you can choose.** Settings › Updates now offers Stable or
  Beta. A beta is never downloaded in the background — you are shown its release
  notes and decide.

### Changed

- **Settings panels are flat rows.** The Agent and MCP categories wrapped groups
  of settings in bordered panels while every other category used plain labelled
  rows, which made them look like a different application. The boxes are gone.
  Every input, button and select now uses one corner radius.
- **The Agent panel is reorganised.** Providers became Harnesses and now reads as
  one list instead of two hand-built cards. Connection and reliability moved to
  Runtime, where the rest of the supervision settings live. A section that
  contained no settings at all was removed, and the remainder is ordered by the
  decision you are making: which agent, which model, what it may do, what
  contains it.
- **The model hint stopped being wrong.** It named a default the app had not used
  for several versions, because the text was typed by hand next to the value it
  described. It is now derived from that value.

### Security

- **Built-in tools on the harness path are gated by Limboo.** The harness
  abstraction has two separate approval surfaces, and the one Limboo had wired
  covers only tools the host supplies — built-in file writes and shell commands
  are governed by a different setting that defaults to allowing everything. On
  that path an agent could have written files and run commands without Limboo's
  permission gate. Every built-in tool call now suspends the turn and asks, using
  the same authority, the same risk labels, the same dialogs and the same audit
  trail as every other agent.
- **A harness that cannot ask for permission is refused.** Rather than run it with
  weaker enforcement, Limboo declines to start it and says so. This is not
  theoretical: the Codex adapter reports that it cannot request approval for its
  shell tool, so it is registered as unavailable with the reason shown rather than
  offered and then failing.
- **The harness setup step asks first.** Preparing a harness for its first run
  downloads its agent CLI, which is the only time Limboo reaches the network
  outside talking to your agent and fetching contributor avatars. The exact
  commands are read from the adapter and shown to you for approval once, and the
  approval is tied to those commands — if a later version changes them, you are
  asked again. Without approval the run does not start.
- **Credentials are passed through, never stored.** A harness receives an API key
  only if your own environment already has one, from an explicitly named list.
  Nothing is written to settings, accepted over the app's internal channels, put
  on a command line, or logged. A gap in log redaction that could have printed
  those variables is closed.
- **Reads on the harness path cannot be gated, and the setting says so.** The
  underlying runtime allows built-in file reads unconditionally, so
  "auto-approve reads" has no effect there. Rather than leave a control that looks
  like it works, the setting explains the limitation.

### Known limitations

- **Beta builds are not released builds.** Features may change or be removed
  before release. Settings and session data move forward but not back, so a build
  made after this one may not read data this one wrote. Keep a stable install for
  work you cannot repeat.
- **The harness path is off by default.** Claude Code and Cursor continue to run
  through their own integrations. Turn the harness on in Settings › Agent ›
  Harnesses if you want to try it; you will be asked to approve its setup step
  first.
- **A harness conversation does not resume.** Each message starts a fresh
  conversation with the underlying runtime. The alternative failed on every second
  message, so this is deliberate until the resume format is handled properly.
- **Codex is unavailable.** Its adapter cannot ask for permission before running
  shell commands. It is listed with that reason rather than hidden.`,
  },
  {
    version: '1.17.0',
    date: '2026-08-01',
    markdown: `Plan Mode now stops. A plan waits for your decision instead of sliding into
implementation, and the plan you are shown is the plan the agent actually wrote —
which, until this release, it very often was not. Git also becomes a platform
service in its own right, so repository work reads as part of the conversation
rather than something that happened in a side panel.

### Added

- **Plan approval is a real stop, not a prompt.** When the agent presents a plan,
  execution halts: no further model calls, no new prompts, no background work,
  and every tool is refused until you decide. Approving continues the same turn
  rather than starting a new one, so the agent keeps everything it had learned
  while planning. Approve, Approve & accept edits, Keep planning, Reject and
  Archive are the only things that move it forward.
- **Keep planning now sends feedback.** Instead of discarding the plan and
  starting over, it hands your notes to the agent, which revises and presents
  again — same conversation, same context.
- **Plans are versioned.** A session has one plan; refinements replace it and the
  previous text moves into History. Two windows on the same session can no longer
  approve different plans, and a plan that changed while you were reading it says
  so rather than acting on the stale copy.
- **A pending plan survives a restart.** Quit with a plan awaiting approval and it
  is still there on relaunch, with its buttons live and implementation still
  locked. Approving after a restart starts a fresh run carrying the plan text,
  because the paused conversation cannot outlive the process.
- **Git is a platform service.** Repository actions post structured entries into
  the conversation carrying the paths, commit and checkpoint behind them, with
  Open Diff, View Commit, Restore Checkpoint and Copy Command on each.
- **Optional GitHub CLI integration.** If \`gh\` is installed and signed in, a
  GitHub sub-tab lists pull requests and issues, and the agent can read them
  through the tools it already has. Limboo stores no GitHub credential —
  authentication stays the CLI's. Posting a comment is gated and shows the exact
  body first.
- **Contributor avatars in history**, fetched in the main process and embedded so
  no page ever requests a remote image. Behind \`git.avatars.enabled\`, which is
  off-limits by default in the sense that turning it on is the thing that tells
  GitHub which repository you are browsing — the setting says so.

### Changed

- **The integrated terminal is its own column** between the conversation and the
  drawer, instead of competing for the drawer with Files and Changes.
- **The Activity and Hooks drawer panels are gone.** The Hook Engine, its audit
  log and every hook setting are untouched — only the two panels and the IPC they
  were the sole consumers of were removed.
- **Switching sessions is now an ordered handover.** Worktree, file watcher, git
  status, search index, memory scope, MCP and the agent are rebound in sequence,
  and a thin ribbon says so while it happens. Switching quickly between sessions
  cancels the stale work rather than letting it finish over the newer session.

### Fixed

- **The plan you approved was usually empty.** Current Claude releases write the
  plan to a file and pass no plan text to the tool Limboo was reading, so almost
  every captured plan was blank — and because the tool was blocked, no plan file
  was produced either. Approving then sent an empty plan, the agent re-derived
  the work from scratch, and the empty plan was filed as completed. Limboo now
  tells the agent where to write its plan and reads it from there, with the
  agent's own copy taking over once the plan is approved.
- **Starting a new plan could silently destroy the one you were reviewing** when
  plan history was turned off. A pending plan is never discarded without being
  filed first, and starting a second plan while one awaits approval is refused.
- **A failed or cancelled planning run reported itself as "rejected"**, which is
  what the app says when a person declines a plan. Those now read as ended, with
  the reason recorded, so declining and crashing no longer look identical.
- **An unrelated prompt could mark a stalled plan complete.** Only the run that
  was actually released to implement a plan can finish it.
- **Live planning progress replayed the previous attempt's steps** after asking
  for a new plan, because it measured from when the plan first existed rather
  than when the current attempt started.
- **Deleting a session left its plan revisions behind** in the database.
- **A machine without git looked like a folder without a repository**, and the app
  offered to initialise one — an action that could never succeed. Limboo now
  detects the missing binary and names the install command for your platform.
- **Settings could be hand-edited into a dead drawer tab or an unbounded panel
  width**; both are now validated and clamped on load.`,
  },
];

/** The notes for one version, or null when this build does not carry them. */
export function releaseNotesFor(version: string): ReleaseNotesEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_NOTES.find((r) => r.version === wanted) ?? null;
}
