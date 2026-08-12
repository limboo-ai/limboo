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
  {
    version: '1.16.0',
    date: '2026-07-30',
    markdown: `A tighter follow-up to the runtime ring. The panel it opens now answers one
question instead of four, and the conversation beneath it reads as one reply
again rather than a stack of cards.

### Changed

- **The runtime panel is the context window, and nothing else.** It opened with
  four collapsible sections, and three of them earned their space only
  occasionally: request usage and long-term usage said "not reported" on any
  agent that does not publish quotas, and execution detail was a nineteen-row
  list behind a header that was folded shut by default. Together they pushed the
  panel past the height it is allowed inside the workspace, where the bottom of
  it was cut off rather than scrollable. The context breakdown is now the whole
  panel — no section headers, no folding, no order to remember, and nothing
  clipped.
- **Settings match what the panel now shows.** Show estimated cost, the quota
  warning threshold, show usage history and the section ordering controls are
  gone rather than left on screen doing nothing, and "Ring measures" now offers
  the two context options it can actually draw. If you had it set to quota, it
  falls back on its own.
- **Nothing stopped being measured.** Quota windows, usage samples and run
  rollups are still collected and still stored. The Work Graph's Stats tab and
  the JSON and CSV exports carry every field they did before — only the hover
  panel got smaller.

### Fixed

- **A reply broken up by tool calls sprouted a toolbar per fragment.** Message
  actions rendered on every block of an answer rather than once for the
  exchange, so a reply interrupted three times showed three sets of buttons.
  Actions now sit with the message you sent, which is the one stable anchor a
  turn has.
- **The conversation read as a stack of cards.** Hidden toolbars still occupied
  their full height, and consecutive parts of a single answer sat about forty
  pixels apart. An answer now reads as one continuous reply, with the wider
  spacing kept for the boundary between exchanges.
- **Exporting from a message gave you the question without the answer.** Export
  now covers the whole exchange — what you asked, what came back, and what was
  run in between. Copy and Copy as Markdown are unchanged and still copy the one
  message, as their labels say.`,
  },
  {
    version: '1.15.0',
    date: '2026-07-29',
    markdown: `You can now see what a long session is actually costing you. A small ring beside
the composer status fills as the conversation consumes the model's context
window, and hovering it opens a live breakdown of where that context went —
which is the difference between noticing you are running out and finding out
when the agent starts forgetting.

### Added

- **A live runtime ring beside the agent status.** It fills as the context
  window fills, turns amber and then red as it runs low, and breathes while the
  agent is working. It is there from the moment a session opens — before
  anything has been measured it shows as unmeasured rather than as empty, which
  are different things.
- **Hover it for the full picture.** A floating panel shows how much of the
  context window is used and left, how much is reserved for the reply, roughly
  how many more exchanges fit before the conversation has to be compressed, and
  when compression last happened.
- **See what filled the context.** A single bar splits the window into who took
  what: your conversation, results from tools, answers from connected servers,
  recalled memories, retrieved project context, the repository delta, and staged
  attachments. Hovering any band names the part of Limboo responsible for it.
- **Nothing is guessed at.** The total, the window size and the reservation are
  measured by the provider. The split beneath them is Limboo counting what it
  composed, and is marked with a \`~\` everywhere it appears. When those estimates
  would exceed what was actually measured — after a compression, or on a resumed
  conversation — the split is dropped rather than quietly rescaled to fit.
- **Rate limits before they stop you.** Rolling usage windows now come from the
  provider's own updates as they arrive, with how much is consumed, when it
  resets, and whether you are drawing on overage. Until now Limboo learned about
  a limit by reading the error after you had already hit it.
- **Usage over time.** Long-running windows keep a local trend so you can see a
  week's consumption building rather than only today's number.
- **Execution detail on demand.** Active model, mode, time to first token,
  generation speed, run duration, cache reads, an estimated cost, retries, the
  worktree, connected servers, index status and attachment count.
- **It says what a provider cannot tell it.** Cursor's command-line interface
  reports no token counts and no quotas, so those sections say exactly that,
  naming the limitation instead of showing a zero that reads as "nothing used".
  Every metric is something the running agent declares it can measure, so a
  future agent lights up whatever it supports with no change to the interface.
- **Run costs in the work graph.** A new Stats tab lists each run with its shape
  and its cost side by side — nodes, tools, errors, duration, tokens, peak
  context and estimated spend.
- **More ways to export a work graph.** NDJSON, GraphML and PlantUML join the
  existing formats, you can export just the selected part of a graph rather than
  the whole session, optionally include run costs, and export every session at
  once into a folder you pick.
- **Settings under Agent › Runtime Indicators.** Turn the whole thing off, or
  tune the ring's size, thickness, position and what it measures; choose
  percentages or token counts; reorder or collapse panel sections; set the
  thresholds that turn it amber, red, or raise a notification; and control how
  long usage history is kept.

### Security

- **Nothing that identifies your machine leaves the main process.** Worktree
  paths are reduced to a name rather than a full path to your home directory,
  the provider's conversation id is shown truncated with no way to reveal the
  rest, and the one place a raw error message is surfaced has secrets and paths
  stripped from it first.
- **Stored usage cannot contain your work.** The tables behind the history have
  no column that can hold a prompt, a message, a file path or a tool input, so
  an export cannot leak them — and exports are assembled field by field rather
  than dumped wholesale. Turning off "Store usage history" genuinely stops all
  writing, for deployments that forbid keeping it.
- **No new network access.** Every number comes from the stream Limboo already
  receives to display the conversation. Nothing is polled and nothing is sent.

### Fixed

- **The work graph panel crashed the drawer.** Opening it threw immediately and
  took the surrounding panel down with it.
- **Threshold sliders were unusable.** Ring size, thickness and every warning
  threshold were squeezed into a sliver at the edge of their row, so touching
  one snapped it to its lowest value. They now use the same full-width slider as
  the rest of settings.
- **The runtime panel could be cut off.** It was allowed to grow taller than the
  workspace it opens inside, which clipped the bottom of it on shorter windows.
  It is now capped, with only the context section open by default.
- **Injected memory and context counts were wrong.** The panel reported the
  configured maximum rather than how many were actually recalled.
- **Runtime updates could keep running after you closed the window.** Closing or
  reloading a window while the panel was open left Limboo updating at full rate
  for a window that no longer existed.
- **Negative values were mangled in exported spreadsheets.** A guard against
  spreadsheet formula injection was also catching negative numbers and turning
  them into text.`,
  },
];

/** The notes for one version, or null when this build does not carry them. */
export function releaseNotesFor(version: string): ReleaseNotesEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_NOTES.find((r) => r.version === wanted) ?? null;
}
