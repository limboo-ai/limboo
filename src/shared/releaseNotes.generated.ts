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
  {
    version: '1.14.0',
    date: '2026-07-29',
    markdown: `When the agent hands work to a specialist, you can finally watch it happen.
Delegated work used to arrive as an anonymous pile of tool calls mixed into the
main reply; it now reads as one line you can open, follow live, and take apart
afterwards — without ever leaving the conversation.

### Added

- **Delegated work reads as one activity.** When the agent hands a job to a
  specialist — exploring the repository, reviewing code, running tests — the
  conversation shows a single line naming the worker and what it was asked to do,
  with its progress underneath. The worker's own tool calls no longer scatter
  through the reply as if the main agent had run them. Opening the line shows how
  long it took, which model it used, what it read and changed, which tools and
  connected servers it reached, what it verified, and what it concluded.
- **Live progress in the worker's own words.** While a specialist works, it
  reports what it is doing in plain language — "Analyzing authentication module"
  — refreshed as it goes. When that is unavailable the progress is worked out
  from the tools it is using, so there is always something to read.
- **Open a worker in its own tab.** Maximize a delegation and it opens beside
  your files as a full-width tab: live progress, everything it ran, its notes and
  its conclusion, following along as it works. Minimizing returns it to the
  conversation exactly where you left it — same scroll position, same sections
  open. If the worker pauses for permission while you are watching, you can
  answer without going back.
- **Actions on every delegation.** Copy the conclusion or the worker's notes,
  export the whole record as Markdown, jump to it in the work graph, or open any
  file it changed straight into a diff. Copying while it is still working
  captures everything that has arrived.
- **Delegated work in the task list.** Specialists running right now appear under
  the task they belong to, with finished ones collected below it, so a long
  execution can be followed from the Tasks panel without reading the whole
  conversation.
- **Settings for delegated work.** Under Agent › Subagents you can turn the
  inline activity off, stop requesting live progress descriptions, or stop
  keeping a worker's notes.

### Fixed

- **The plan was dumped into the conversation as raw text.** Approving a plan
  sent it to the agent, and everything sent to the agent is shown — so the whole
  plan appeared in a chat bubble as unformatted markup, tags and all, sometimes
  thousands of characters of it. The approval now reads as one line with the plan
  beneath it, properly formatted and collapsed by default. Nothing is hidden:
  viewing the message raw still shows exactly what the agent received.
- **Checklists in plans rendered twice over.** Every \`- [ ]\` item drew a tick box
  *and* a bullet, on plans that are almost entirely checklists. Ticked items are
  now also greyed, so a plan reads like a plan.
- **The Tasks panel could go blank.** A specialist that failed or was denied took
  the whole panel down with it.
- **Long output was hard to read and hard to escape.** A worker's notes and
  conclusion ran together with everything around them at a size that fought its
  surroundings, inside a small scrolling box that trapped the page. They are now
  properly separated, one consistent size, and clipped with a clear way to read
  the rest.
- **A worker's tool list could bury everything below it.** A specialist that
  reads thirty files pushed its own conclusion off the screen. Long lists now
  arrive folded, with the count and anything still running or failed still
  visible.
- **Delegated work went unrecognized on current agent versions.** The tool that
  starts a specialist was renamed upstream, and Limboo only recognized the old
  name — so on any recent version delegated work was recorded as ordinary tool
  calls and never appeared as delegation at all. Both names are now recognized.
- **A specialist's work vanished when you sent the next message.** A worker still
  running when you typed again had the rest of its work spill into the new turn
  as loose tool calls. Its record also now survives restarting the app.
- **Sessions were named after approving a plan.** An untitled session took its
  name from the approval instead of from what you had asked for.

### Security

- **"Always allow" no longer grants more than you agreed to.** Allowing an action
  for the session applied to *every* later action, whatever its kind — approving a
  file read also pre-approved writing files and running commands, and satisfied
  the guard on secrets like \`.env\` files and private keys. It now applies only to
  the kind of action you were actually shown, and access to secrets always asks
  on its own.
- **A specialist's notes are treated as untrusted.** What a worker writes is
  stored and shown as text, with a size limit, and is never fed back to the agent
  as instructions.
- **Approvals name the worker that asked.** A permission request raised inside a
  delegation says so — and when it cannot be attributed with certainty, it says
  nothing rather than guessing.`,
  },
  {
    version: '1.13.2',
    date: '2026-07-28',
    markdown: `A plan you left waiting can be approved again.

### Fixed

- **Approving a plan after reopening the app did nothing.** A plan waiting for
  your approval was saved, but the conversation that produced it was not — a plan
  run always ends by interrupting the agent, and an interrupted conversation is
  cleared so your next message cannot fail on it. Approving afterwards therefore
  started a fresh conversation and told it to implement a plan it had never seen:
  the run finished having done nothing, and the plan was filed as complete. The
  approved plan is now sent with the approval, so it no longer matters whether
  the earlier conversation survived. This applies to both Claude and Cursor.
- **Approve was greyed out while Reject still worked.** Approve, "Approve &
  accept edits" and "Keep planning" are disabled while a run is finishing;
  Reject is not. A run that ended without reporting back — after reloading the
  window mid-run, or when a planning run did not fully unwind — left the session
  looking permanently busy, so the only control that still responded was Reject.
  A session that claims to be working with nothing running is now corrected on
  the spot.
- **Plans could get stuck with no way out.** Closing the app while a plan was
  being written, or while one was being implemented, left it in that state
  forever — and while a plan is being written the panel hides its whole toolbar,
  so there was no approve, no reject and no regenerate. Interrupted plans are now
  settled on startup: one that was never finished is cleared, and one that was
  part-way through being implemented returns to awaiting approval so you can
  start it again. Regenerate also stays available while a plan is being written.
- **Approve could stop responding with no explanation.** Clicking Approve blocked
  further clicks until the whole implementation run finished, so a run that hung
  left the button silently dead for the rest of the session. It is now released
  as soon as the run actually starts.
- **Starting a new plan discarded the one waiting for approval.** It was replaced
  without being recorded, so it was not even in the plan's own History. A pending
  plan is now saved to History first. Reopening the app restores Plan mode by
  default, which made this reachable by simply typing.
- **A failed approval could leave the composer in the wrong mode.** After
  reopening the app it stayed on "Ask before edits" even though the plan had been
  put back and was waiting for approval again. It now returns to Plan.

### Changed

- **The plan approval controls are no longer boxed in.** The Approve, "Approve &
  accept edits", "Keep planning" and Reject buttons sit directly on the panel
  instead of inside a tinted card, matching how the same controls already read in
  the conversation.`,
  },
];

/** The notes for one version, or null when this build does not carry them. */
export function releaseNotesFor(version: string): ReleaseNotesEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_NOTES.find((r) => r.version === wanted) ?? null;
}
