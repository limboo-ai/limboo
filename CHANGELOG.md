# Changelog

All notable changes to Limboo are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). See
[docs/operations/versioning.md](docs/operations/versioning.md).

## [Unreleased]

## [1.16.0] - 2026-07-30

A tighter follow-up to the runtime ring. The panel it opens now answers one
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
  message, as their labels say.

## [1.15.0] - 2026-07-29

You can now see what a long session is actually costing you. A small ring beside
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
  composed, and is marked with a `~` everywhere it appears. When those estimates
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
  them into text.

## [1.14.0] - 2026-07-29

When the agent hands work to a specialist, you can finally watch it happen.
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
- **Checklists in plans rendered twice over.** Every `- [ ]` item drew a tick box
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
  the guard on secrets like `.env` files and private keys. It now applies only to
  the kind of action you were actually shown, and access to secrets always asks
  on its own.
- **A specialist's notes are treated as untrusted.** What a worker writes is
  stored and shown as text, with a size limit, and is never fed back to the agent
  as instructions.
- **Approvals name the worker that asked.** A permission request raised inside a
  delegation says so — and when it cannot be attributed with certainty, it says
  nothing rather than guessing.

## [1.13.2] - 2026-07-28

A plan you left waiting can be approved again.

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
  the conversation.

## [1.13.1] - 2026-07-28

Stopping the agent mid-task no longer breaks your next message.

### Fixed

- **A run stopped while a tool was working would break the following message.**
  Pressing Stop while the agent was reading a file or running a command left the
  provider's own conversation ending on a request it never got an answer to — a
  shape it rejects every time it is replayed. The next thing you sent failed
  before the agent ever saw it, with a line of internal diagnostic text
  (`[ede_diagnostic] … stop_reason=tool_use`) shown as the error. Stopping now
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
interrupted turn behaves and reads identically whichever agent is running.

## [1.13.0] - 2026-07-28

The conversation stops being something you only read. Every message now carries
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
  "show task durations").

## [1.12.0] - 2026-07-27

Sessions run in a git worktree, and Limboo puts that worktree inside its own
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
  text `limboo.db` was blocked wherever it ran, so a plain search of your own
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
  reads where the rest of the run does — in the conversation.

## [1.11.0] - 2026-07-27

1.10.0 set out to stop Plan and Ask blocking the MCP servers you had connected.
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
  read as the control for that.

## [1.10.0] - 2026-07-27

Plan and Ask are read-only modes, and they enforced that by refusing anything
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
  that do the same.

## [1.9.0] - 2026-07-27

Fixes the Linux updater, which could never finish. On Arch and Manjaro the
published package declared dependencies that no longer exist, so `pacman -U`
failed every single time — after the user had already typed their password. The
release document also drops its badges and coloured glyphs, and contributors now
appear with their real profile picture and name.

### Fixed

- **The `.pacman` package could never install.** electron-builder's default
  dependency list for that target still names `http-parser` (dropped from Arch)
  and `libappindicator-gtk3` (AUR-only), so every self-update ended in
  `cannot resolve "http-parser"` and the app stayed on the old version.
  `pacman.depends` is now declared explicitly and every entry is verified present
  in core/extra.
- **"Restart & install" froze the app, prompted twice, then killed it.**
  electron-updater runs the system package manager with a synchronous,
  shell-quoted spawn, which blocks the main process for the entire
  authorization — nineteen seconds in the reported case — and then fires a
  *second* password prompt (`pacman -Sy`) when the first attempt fails. Limboo
  now owns the privileged install: argv-only, asynchronous, one prompt, no
  retry that re-prompts, and the window stays responsive throughout.
- **A refused install no longer force-quits the app.** The four-second quit
  watchdog fired unconditionally, so an install the package manager had already
  rejected still terminated the app — the update appeared to do nothing except
  close the window. The watchdog is now armed only once the installer handoff is
  confirmed.
- **An install that fails now says so.** electron-updater reports this class of
  failure on an event rather than by throwing, so `install()` returned success
  and the UI stayed silent. The real error is captured and surfaced.
- **Quitting Limboo no longer asks for your password.** `autoInstallOnAppQuit`
  re-ran the whole privileged install on every ordinary quit, blocking shutdown
  behind a polkit dialog. It is disabled for the Linux package formats.
- **The Linux updater can no longer pick the wrong package manager.** The
  `package-type` marker baked into the build is cross-checked against the tooling
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
  will.** The exact `sudo pacman -U …` (or `dpkg`/`dnf`) line for the file
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
  list showed a lowercase `beta` where the header showed `Beta`; both now read
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
  invoked with an argument vector rather than a quoted `/bin/bash -c` string.

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

[Unreleased]: https://github.com/limboo-ai/limboo/compare/v1.16.0...HEAD
[1.16.0]: https://github.com/limboo-ai/limboo/compare/v1.15.0...v1.16.0
[1.15.0]: https://github.com/limboo-ai/limboo/compare/v1.14.0...v1.15.0
[1.14.0]: https://github.com/limboo-ai/limboo/compare/v1.13.2...v1.14.0
[1.13.2]: https://github.com/limboo-ai/limboo/compare/v1.13.1...v1.13.2
[1.13.1]: https://github.com/limboo-ai/limboo/compare/v1.13.0...v1.13.1
[1.13.0]: https://github.com/limboo-ai/limboo/compare/v1.12.0...v1.13.0
[1.12.0]: https://github.com/limboo-ai/limboo/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/limboo-ai/limboo/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/limboo-ai/limboo/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/limboo-ai/limboo/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/limboo-ai/limboo/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/limboo-ai/limboo/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/limboo-ai/limboo/compare/v1.5.1...v1.6.0
[1.5.1]: https://github.com/limboo-ai/limboo/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/limboo-ai/limboo/compare/v1.0.0...v1.5.0
[1.0.0]: https://github.com/limboo-ai/limboo/releases/tag/v1.0.0
