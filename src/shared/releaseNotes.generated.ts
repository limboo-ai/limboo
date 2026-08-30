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
    version: '1.20.0',
    date: '2026-08-31',
    markdown: `Limboo 1.20.0 makes the agent harness actually run. 1.19.0 repaired its
packaging; this release fixes the three separate reasons a run still could not
start, gives harness conversations memory between prompts, and moves the
harness runtime somewhere it belongs.

### Fixed

- **The harness could not start a run at all — for three independent reasons.**
  Its one-time setup was refused by Limboo's own path guard on its very first
  command, so the install could never begin. No network port was ever handed to
  the agent bridge, which the harness requires and refuses to start without. And
  the method the adapter uses to reach that bridge was missing, so a run that got
  past the first two failed the moment the bridge came up. Each of these was
  enough on its own; all three are fixed, and the setup now completes.
- **Setup failures were retried forever instead of being reported.** A refusal
  that mentioned the network — such as the sandbox network policy blocking the
  download — was mistaken for a dropped connection and retried, though the same
  setting would produce it again immediately. Refusals are now recognised for
  what they are and reported once, with the reason.
- **A failed setup command said nothing useful.** If one of the approved commands
  ran and failed — a large download timing out is enough — it surfaced as a
  generic failed run. It now reports what failed and what the tool itself said to
  do about it, and is not retried: the package manager records the install as
  complete even when part of it failed, so re-running it fails identically.
- **Every prompt started a new conversation, and left a process behind.** Each
  turn opened a fresh harness session without ending the previous one, so the
  agent forgot the turn before and one background process accumulated per prompt.
- **Non-Anthropic harnesses could never authenticate.** They were handed
  Anthropic's credential variable names instead of their own, because the
  credential lookup read the configured harness rather than the one the selected
  model actually runs on.

### Changed

- **The harness keeps its runtime inside Limboo's own data directory.** It used
  to be placed next to your worktree, which is Limboo-owned for a session with a
  worktree — but a session without one is rooted at your repository, so its
  runtime landed beside your project folder. It now always lives under Limboo's
  application data, never in your repository and never next to it. Existing
  installs will re-run the one-time setup once, in the new location.
- **The setup panel says where the commands run.** It listed the two commands and
  nothing else, so copying them into a terminal was the obvious thing to try —
  and it fails, because the lockfile they install from is written into the setup
  directory first. The panel now names that directory and the files placed in it.
  Your existing approval still stands: the commands themselves have not changed.
- **The agent harness packages were updated** (\`@ai-sdk/harness\` 1.0.91,
  \`@ai-sdk/harness-claude-code\` 1.0.94). Every assumption Limboo makes about
  their internals — where the runtime is installed, how the bridge binds, which
  harnesses can be permission-gated — was re-checked against the new versions.`,
  },
  {
    version: '1.19.0',
    date: '2026-08-30',
    markdown: `Limboo 1.19.0 repairs the agent harness, which could not install itself in any
packaged build, and gives workspaces a way out of the app.

### Fixed

- **The harness could never complete its one-time setup.** Packaging stripped
  every \`pnpm-lock.yaml\` in the tree — a rule meant for the project's own
  lockfile that also removed one the harness adapter reads at runtime. Without
  it the adapter could not describe its setup step, so runs died with
  \`ENOENT … not found in app.asar\` and Settings reported the harness needed no
  setup at all. The adapters' bridge assets now ship, and the project's own
  lockfiles are still excluded.
- **A harness that could not describe its setup ran anyway, ungated.** "This
  adapter installs nothing" and "this adapter could not say what it installs"
  were the same value internally, and the second silently skipped the approval
  gate, the sandbox network check and the prerequisite check along with it. They
  are now different states: the run is refused, and Settings says why instead of
  claiming there is nothing to approve.
- **The setup panel contradicted itself.** It described an install that needed
  your approval and, immediately below, said no setup was needed. Five different
  conditions — including a request still in flight and an outright failure —
  collapsed into that one sentence. Each now reports itself, and a failed request
  no longer reads as an absence of work.
- **Removing a workspace left almost everything behind.** Only the workspace's
  own record was deleted; its sessions, memories, search index, checkpoints,
  work-graph nodes and MCP entries stayed in the database permanently, since a
  re-added folder is issued a new id and can never reclaim them. Removal now
  clears all of it in one transaction, after tearing down each session's
  worktree, services and terminals — which is what the confirmation dialog had
  been promising all along. Global, non-workspace data is untouched.

### Added

- **Workspaces can be removed from the title-bar switcher.** Removal existed only
  in the launcher, which appears when no workspace is open — so once you opened
  one there was no way to remove any. Each row in the dropdown now has a remove
  control, with the same confirmation dialog and the same guarantee that your
  project folder on disk is never touched.
- **Missing setup prerequisites are named before you approve, not after a run
  fails.** The check also stopped assuming pnpm: it reads whichever tools the
  adapter's own commands invoke, so an adapter that bootstraps with yarn, bun or
  corepack is checked just as precisely. Limboo still never substitutes one tool
  for another — the commands you approve are the commands that run.
- **Tools installed in a user directory are found again.** An app started from a
  desktop launcher inherits a much smaller \`PATH\` than a shell, so an installed
  pnpm, bun or nvm-managed Node could be reported missing. Setup now also looks
  where those install themselves.

### Changed

- **The title bar shows the workspace name alone.** The initials badge in front
  of it repeated what the name already said. It remains in the launcher and the
  remove dialog, where a workspace has to be picked out of a set at a glance.`,
  },
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
];

/** The notes for one version, or null when this build does not carry them. */
export function releaseNotesFor(version: string): ReleaseNotesEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_NOTES.find((r) => r.version === wanted) ?? null;
}
