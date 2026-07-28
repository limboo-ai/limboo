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
  {
    version: '1.13.1',
    date: '2026-07-28',
    markdown: `Stopping the agent mid-task no longer breaks your next message.

### Fixed

- **A run stopped while a tool was working would break the following message.**
  Pressing Stop while the agent was reading a file or running a command left the
  provider's own conversation ending on a request it never got an answer to — a
  shape it rejects every time it is replayed. The next thing you sent failed
  before the agent ever saw it, with a line of internal diagnostic text
  (\`[ede_diagnostic] … stop_reason=tool_use\`) shown as the error. Stopping now
  clears that conversation as it happens, so the next message starts clean. Your
  transcript, activity and checkpoints are untouched and still shown.
- **The automatic recovery for it rarely ran.** The same failure reaches the app
  in two different forms depending on how the underlying process ends, and only
  one of them was recognised — which is why the error appeared to come and go at
  random. Both forms are now read from the provider's structured result rather
  than by matching English text, so recovery is consistent. Recovery also no
  longer requires a stored conversation to exist, so the first message in a
  session can recover too.
- **Internal diagnostics are no longer shown as the error.** An interrupted turn
  now reads "The previous turn was interrupted before it finished — retrying."
  The same applies to other run-ending conditions that previously surfaced raw
  provider text: reaching the turn limit, an oversized prompt, an image that
  could not be read, and a run stopped by a configured hook. Full diagnostics
  remain in Settings › Agent › Diagnostics and the log file.
- **Tool chips could spin forever.** A tool interrupted before it reported back
  stayed marked as running for the rest of the session. Interrupted tools are now
  settled when the run ends.
- **Answering a clarification could hang after Stop.** Stopping a run released
  pending permission prompts but not pending clarification questions.

Cursor sessions get the same handling: both providers share one classifier, so an
interrupted turn behaves and reads identically whichever agent is running.`,
  },
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
];

/** The notes for one version, or null when this build does not carry them. */
export function releaseNotesFor(version: string): ReleaseNotesEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_NOTES.find((r) => r.version === wanted) ?? null;
}
