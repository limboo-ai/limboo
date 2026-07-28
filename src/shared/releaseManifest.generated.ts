/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Written by `npm run gen:notes` (scripts/gen-release-notes.mjs) from
 * CHANGELOG.md. Types live in `./release`; this file carries only data.
 *
 * `RELEASE_MANIFESTS` holds the 5 most recent releases in full.
 * `RELEASE_INDEX` lists EVERY released version, so the release document can
 * show a complete history without the changelog becoming app payload.
 *
 * Git-derived fields (commit, buildNumber, contributors, pullRequests,
 * mergedBranches, stats) are null/empty here and are stamped in at package time
 * by `ci/scripts/embed-release-manifest.mjs`, the same way
 * `apply-tag-version.mjs` stamps the version — a laptop has no tag to read them
 * from. That step also resolves each contributor to their forge account and
 * embeds the profile picture as a `data:` URI, which is why the app can show
 * real avatars under a CSP that forbids it from fetching one.
 * Asset digests and signing status appear only in the PUBLISHED manifest
 * (`dist/release-manifest.json`): a build cannot contain the hash of an
 * installer that does not exist until after it is built.
 */
import type { ReleaseIndexEntry, ReleaseManifestEntry } from './release';

/** Newest first. */
export const RELEASE_MANIFESTS: ReleaseManifestEntry[] = [
  {
    "version": "1.13.1",
    "date": "2026-07-28",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.13.1",
    "commit": null,
    "buildNumber": null,
    "summary": "Stopping the agent mid-task no longer breaks your next message.",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "A run stopped while a tool was working would break the following message",
            "text": "Pressing Stop while the agent was reading a file or running a command left the\n  provider's own conversation ending on a request it never got an answer to — a\n  shape it rejects every time it is replayed. The next thing you sent failed\n  before the agent ever saw it, with a line of internal diagnostic text\n  (`[ede_diagnostic] … stop_reason=tool_use`) shown as the error. Stopping now\n  clears that conversation as it happens, so the next message starts clean. Your\n  transcript, activity and checkpoints are untouched and still shown."
          },
          {
            "lead": "The automatic recovery for it rarely ran",
            "text": "The same failure reaches the app\n  in two different forms depending on how the underlying process ends, and only\n  one of them was recognised — which is why the error appeared to come and go at\n  random. Both forms are now read from the provider's structured result rather\n  than by matching English text, so recovery is consistent. Recovery also no\n  longer requires a stored conversation to exist, so the first message in a\n  session can recover too."
          },
          {
            "lead": "Internal diagnostics are no longer shown as the error",
            "text": "An interrupted turn\n  now reads \"The previous turn was interrupted before it finished — retrying.\"\n  The same applies to other run-ending conditions that previously surfaced raw\n  provider text: reaching the turn limit, an oversized prompt, an image that\n  could not be read, and a run stopped by a configured hook. Full diagnostics\n  remain in Settings › Agent › Diagnostics and the log file."
          },
          {
            "lead": "Tool chips could spin forever",
            "text": "A tool interrupted before it reported back\n  stayed marked as running for the rest of the session. Interrupted tools are now\n  settled when the run ends."
          },
          {
            "lead": "Answering a clarification could hang after Stop",
            "text": "Stopping a run released\n  pending permission prompts but not pending clarification questions.\n\nCursor sessions get the same handling: both providers share one classifier, so an\ninterrupted turn behaves and reads identically whichever agent is running."
          }
        ],
        "markdown": "- **A run stopped while a tool was working would break the following message.**\n  Pressing Stop while the agent was reading a file or running a command left the\n  provider's own conversation ending on a request it never got an answer to — a\n  shape it rejects every time it is replayed. The next thing you sent failed\n  before the agent ever saw it, with a line of internal diagnostic text\n  (`[ede_diagnostic] … stop_reason=tool_use`) shown as the error. Stopping now\n  clears that conversation as it happens, so the next message starts clean. Your\n  transcript, activity and checkpoints are untouched and still shown.\n- **The automatic recovery for it rarely ran.** The same failure reaches the app\n  in two different forms depending on how the underlying process ends, and only\n  one of them was recognised — which is why the error appeared to come and go at\n  random. Both forms are now read from the provider's structured result rather\n  than by matching English text, so recovery is consistent. Recovery also no\n  longer requires a stored conversation to exist, so the first message in a\n  session can recover too.\n- **Internal diagnostics are no longer shown as the error.** An interrupted turn\n  now reads \"The previous turn was interrupted before it finished — retrying.\"\n  The same applies to other run-ending conditions that previously surfaced raw\n  provider text: reaching the turn limit, an oversized prompt, an image that\n  could not be read, and a run stopped by a configured hook. Full diagnostics\n  remain in Settings › Agent › Diagnostics and the log file.\n- **Tool chips could spin forever.** A tool interrupted before it reported back\n  stayed marked as running for the rest of the session. Interrupted tools are now\n  settled when the run ends.\n- **Answering a clarification could hang after Stop.** Stopping a run released\n  pending permission prompts but not pending clarification questions.\n\nCursor sessions get the same handling: both providers share one classifier, so an\ninterrupted turn behaves and reads identically whichever agent is running."
      }
    ],
    "contributors": [],
    "pullRequests": [],
    "mergedBranches": [],
    "assets": [],
    "signing": [],
    "stats": {
      "commits": null,
      "filesChanged": null,
      "additions": null,
      "deletions": null
    },
    "links": {
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.13.1",
      "compare": "https://github.com/limboo-ai/limboo/compare/v1.13.0...v1.13.1",
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.13.1",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "Stopping the agent mid-task no longer breaks your next message.\n\n### Fixed\n\n- **A run stopped while a tool was working would break the following message.**\n  Pressing Stop while the agent was reading a file or running a command left the\n  provider's own conversation ending on a request it never got an answer to — a\n  shape it rejects every time it is replayed. The next thing you sent failed\n  before the agent ever saw it, with a line of internal diagnostic text\n  (`[ede_diagnostic] … stop_reason=tool_use`) shown as the error. Stopping now\n  clears that conversation as it happens, so the next message starts clean. Your\n  transcript, activity and checkpoints are untouched and still shown.\n- **The automatic recovery for it rarely ran.** The same failure reaches the app\n  in two different forms depending on how the underlying process ends, and only\n  one of them was recognised — which is why the error appeared to come and go at\n  random. Both forms are now read from the provider's structured result rather\n  than by matching English text, so recovery is consistent. Recovery also no\n  longer requires a stored conversation to exist, so the first message in a\n  session can recover too.\n- **Internal diagnostics are no longer shown as the error.** An interrupted turn\n  now reads \"The previous turn was interrupted before it finished — retrying.\"\n  The same applies to other run-ending conditions that previously surfaced raw\n  provider text: reaching the turn limit, an oversized prompt, an image that\n  could not be read, and a run stopped by a configured hook. Full diagnostics\n  remain in Settings › Agent › Diagnostics and the log file.\n- **Tool chips could spin forever.** A tool interrupted before it reported back\n  stayed marked as running for the rest of the session. Interrupted tools are now\n  settled when the run ends.\n- **Answering a clarification could hang after Stop.** Stopping a run released\n  pending permission prompts but not pending clarification questions.\n\nCursor sessions get the same handling: both providers share one classifier, so an\ninterrupted turn behaves and reads identically whichever agent is running."
  },
  {
    "version": "1.13.0",
    "date": "2026-07-28",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.13.0",
    "commit": null,
    "buildNumber": null,
    "summary": "The conversation stops being something you only read. Every message now carries\nits own actions on hover, and any turn can be rolled back — the workspace returns\nto how it was before the agent touched it, including deleting files it created,\nwith the rollback recorded rather than hidden. Plan Mode also stops saying the\nsame thing three times.",
    "sections": [
      {
        "category": "added",
        "title": "Added",
        "items": [
          {
            "lead": "Actions on every message",
            "text": "Hovering a message (or reaching it with the\n  keyboard) reveals a row of actions: copy, copy as Markdown, quote it into the\n  composer, reference it in your next prompt, select its text, view it raw,\n  export it, open it as a new session, pin it to memory, regenerate it, or revert\n  to it. Copying an answer that is still being written captures everything that\n  has arrived so far rather than making you wait."
          },
          {
            "lead": "Revert a turn",
            "text": "Reverting restores the workspace to the checkpoint taken\n  before that turn and drops the conversation after it, so the agent's memory and\n  your files agree again. You are shown exactly what will change first — files\n  restored, files removed, messages dropped — and a safety checkpoint of the\n  current state is taken before anything moves. Only the session's own worktree\n  is touched, so work running in parallel is unaffected."
          },
          {
            "lead": "Live planning progress in the conversation",
            "text": "While a plan is being written,\n  the stream now names what the agent is doing — reading the repository,\n  searching, indexing symbols, decomposing the requirements — with each finished\n  step settling into a checked line."
          }
        ],
        "markdown": "- **Actions on every message.** Hovering a message (or reaching it with the\n  keyboard) reveals a row of actions: copy, copy as Markdown, quote it into the\n  composer, reference it in your next prompt, select its text, view it raw,\n  export it, open it as a new session, pin it to memory, regenerate it, or revert\n  to it. Copying an answer that is still being written captures everything that\n  has arrived so far rather than making you wait.\n- **Revert a turn.** Reverting restores the workspace to the checkpoint taken\n  before that turn and drops the conversation after it, so the agent's memory and\n  your files agree again. You are shown exactly what will change first — files\n  restored, files removed, messages dropped — and a safety checkpoint of the\n  current state is taken before anything moves. Only the session's own worktree\n  is touched, so work running in parallel is unaffected.\n- **Live planning progress in the conversation.** While a plan is being written,\n  the stream now names what the agent is doing — reading the repository,\n  searching, indexing symbols, decomposing the requirements — with each finished\n  step settling into a checked line."
      },
      {
        "category": "changed",
        "title": "Changed",
        "items": [
          {
            "lead": "Plan Mode reads once, not three times",
            "text": "The large plan card is gone from the\n  conversation; the stream carries a single line and the approval buttons, and\n  the Task panel holds the plan itself. That panel is now just two sections —\n  Implementation plan and Live progress — instead of a plan, a duplicate outline\n  of the plan, and a checklist of the same tasks. Live progress is always shown\n  while work is running, rather than appearing only when the outline failed to\n  match."
          },
          {
            "lead": "One in-progress indicator everywhere",
            "text": "The planning placeholder, the plan\n  header, and each running task now use the same loader the agent uses while it\n  writes, instead of three different spinners and a large completion checkmark."
          },
          {
            "lead": "Restoring a checkpoint now truly undoes the work",
            "text": "Files the agent created\n  after the checkpoint used to survive a restore and be left behind; they are\n  removed now, and the restore reports how many files it restored and removed.\n  Untracked files that already existed are never touched."
          }
        ],
        "markdown": "- **Plan Mode reads once, not three times.** The large plan card is gone from the\n  conversation; the stream carries a single line and the approval buttons, and\n  the Task panel holds the plan itself. That panel is now just two sections —\n  Implementation plan and Live progress — instead of a plan, a duplicate outline\n  of the plan, and a checklist of the same tasks. Live progress is always shown\n  while work is running, rather than appearing only when the outline failed to\n  match.\n- **One in-progress indicator everywhere.** The planning placeholder, the plan\n  header, and each running task now use the same loader the agent uses while it\n  writes, instead of three different spinners and a large completion checkmark.\n- **Restoring a checkpoint now truly undoes the work.** Files the agent created\n  after the checkpoint used to survive a restore and be left behind; they are\n  removed now, and the restore reports how many files it restored and removed.\n  Untracked files that already existed are never touched."
      },
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "Checkpoint comparisons could not see new files",
            "text": "Both the \"what changed\n  since this checkpoint\" view and the restore itself compared against staged\n  changes only, so a file the agent created and never staged was invisible —\n  the diff under-reported it and a restore left it behind. Both now compare\n  against the full working state, including files that were never staged."
          },
          {
            "lead": "The selected session no longer has a coloured bar",
            "text": "It reads by its\n  background and a bolder title, matching the tabs elsewhere in the app."
          }
        ],
        "markdown": "- **Checkpoint comparisons could not see new files.** Both the \"what changed\n  since this checkpoint\" view and the restore itself compared against staged\n  changes only, so a file the agent created and never staged was invisible —\n  the diff under-reported it and a restore left it behind. Both now compare\n  against the full working state, including files that were never staged.\n- **The selected session no longer has a coloured bar.** It reads by its\n  background and a bolder title, matching the tabs elsewhere in the app."
      },
      {
        "category": "removed",
        "title": "Removed",
        "items": [
          {
            "lead": null,
            "text": "Four Task-panel settings that no longer controlled anything visible (\"stream\n  tasks as they appear\", \"auto-expand new tasks\", \"collapse completed tasks\", and\n  \"show task durations\")."
          }
        ],
        "markdown": "- Four Task-panel settings that no longer controlled anything visible (\"stream\n  tasks as they appear\", \"auto-expand new tasks\", \"collapse completed tasks\", and\n  \"show task durations\")."
      }
    ],
    "contributors": [],
    "pullRequests": [],
    "mergedBranches": [],
    "assets": [],
    "signing": [],
    "stats": {
      "commits": null,
      "filesChanged": null,
      "additions": null,
      "deletions": null
    },
    "links": {
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.13.0",
      "compare": "https://github.com/limboo-ai/limboo/compare/v1.12.0...v1.13.0",
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.13.0",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "The conversation stops being something you only read. Every message now carries\nits own actions on hover, and any turn can be rolled back — the workspace returns\nto how it was before the agent touched it, including deleting files it created,\nwith the rollback recorded rather than hidden. Plan Mode also stops saying the\nsame thing three times.\n\n### Added\n\n- **Actions on every message.** Hovering a message (or reaching it with the\n  keyboard) reveals a row of actions: copy, copy as Markdown, quote it into the\n  composer, reference it in your next prompt, select its text, view it raw,\n  export it, open it as a new session, pin it to memory, regenerate it, or revert\n  to it. Copying an answer that is still being written captures everything that\n  has arrived so far rather than making you wait.\n- **Revert a turn.** Reverting restores the workspace to the checkpoint taken\n  before that turn and drops the conversation after it, so the agent's memory and\n  your files agree again. You are shown exactly what will change first — files\n  restored, files removed, messages dropped — and a safety checkpoint of the\n  current state is taken before anything moves. Only the session's own worktree\n  is touched, so work running in parallel is unaffected.\n- **Live planning progress in the conversation.** While a plan is being written,\n  the stream now names what the agent is doing — reading the repository,\n  searching, indexing symbols, decomposing the requirements — with each finished\n  step settling into a checked line.\n\n### Changed\n\n- **Plan Mode reads once, not three times.** The large plan card is gone from the\n  conversation; the stream carries a single line and the approval buttons, and\n  the Task panel holds the plan itself. That panel is now just two sections —\n  Implementation plan and Live progress — instead of a plan, a duplicate outline\n  of the plan, and a checklist of the same tasks. Live progress is always shown\n  while work is running, rather than appearing only when the outline failed to\n  match.\n- **One in-progress indicator everywhere.** The planning placeholder, the plan\n  header, and each running task now use the same loader the agent uses while it\n  writes, instead of three different spinners and a large completion checkmark.\n- **Restoring a checkpoint now truly undoes the work.** Files the agent created\n  after the checkpoint used to survive a restore and be left behind; they are\n  removed now, and the restore reports how many files it restored and removed.\n  Untracked files that already existed are never touched.\n\n### Fixed\n\n- **Checkpoint comparisons could not see new files.** Both the \"what changed\n  since this checkpoint\" view and the restore itself compared against staged\n  changes only, so a file the agent created and never staged was invisible —\n  the diff under-reported it and a restore left it behind. Both now compare\n  against the full working state, including files that were never staged.\n- **The selected session no longer has a coloured bar.** It reads by its\n  background and a bolder title, matching the tabs elsewhere in the app.\n\n### Removed\n\n- Four Task-panel settings that no longer controlled anything visible (\"stream\n  tasks as they appear\", \"auto-expand new tasks\", \"collapse completed tasks\", and\n  \"show task durations\")."
  },
  {
    "version": "1.12.0",
    "date": "2026-07-27",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.12.0",
    "commit": null,
    "buildNumber": null,
    "summary": "Sessions run in a git worktree, and Limboo puts that worktree inside its own\napplication data folder. A safety rule meant to keep the agent out of Limboo's\ndatabase read the whole folder as off limits — so in a worktree session the\nagent was refused the moment it tried to write its first file, in what was\nactually its own working directory. Approving a plan could fail for a reason\nthat was never true, and leave the session unable to try again. The plan card\nalso stops appearing before there is a plan to read.",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "The agent could not write anything in a worktree session",
            "text": "Every file it\n  tried to create was refused as \"Limboo's own app data\", because sessions check\n  out into a folder that lives inside Limboo's data directory. The rule now\n  covers only what it was written to protect — the database, your settings, and\n  the encrypted secret store — and the rest of that directory, including the\n  worktree the agent works in, is ordinary ground. Cursor runs were blocked by a\n  second copy of the same rule and are fixed with it."
          },
          {
            "lead": "Commands were refused for mentioning a filename",
            "text": "Anything containing the\n  text `limboo.db` was blocked wherever it ran, so a plain search of your own\n  source could be denied. Only the real, full path to the database is protected\n  now."
          },
          {
            "lead": "Approving a plan could fail with \"the agent is already working on this\n  session\"",
            "text": "The plan appears while the run that wrote it is still finishing, so\n  a quick click arrived a fraction of a second early and was turned away.\n  Approving now waits for that run to finish instead of refusing, and the buttons\n  are held until it has."
          },
          {
            "lead": "A failed approval left the plan unusable",
            "text": "The plan was marked as being\n  carried out before the work had actually started, so when it did not start,\n  the approval buttons never came back and the session could not be recovered.\n  The plan is restored when the run fails to begin."
          }
        ],
        "markdown": "- **The agent could not write anything in a worktree session.** Every file it\n  tried to create was refused as \"Limboo's own app data\", because sessions check\n  out into a folder that lives inside Limboo's data directory. The rule now\n  covers only what it was written to protect — the database, your settings, and\n  the encrypted secret store — and the rest of that directory, including the\n  worktree the agent works in, is ordinary ground. Cursor runs were blocked by a\n  second copy of the same rule and are fixed with it.\n- **Commands were refused for mentioning a filename.** Anything containing the\n  text `limboo.db` was blocked wherever it ran, so a plain search of your own\n  source could be denied. Only the real, full path to the database is protected\n  now.\n- **Approving a plan could fail with \"the agent is already working on this\n  session\".** The plan appears while the run that wrote it is still finishing, so\n  a quick click arrived a fraction of a second early and was turned away.\n  Approving now waits for that run to finish instead of refusing, and the buttons\n  are held until it has.\n- **A failed approval left the plan unusable.** The plan was marked as being\n  carried out before the work had actually started, so when it did not start,\n  the approval buttons never came back and the session could not be recovered.\n  The plan is restored when the run fails to begin."
      },
      {
        "category": "changed",
        "title": "Changed",
        "items": [
          {
            "lead": "The plan card waits for the plan",
            "text": "It used to appear as soon as planning\n  started, showing a title and an \"Analyzing the repository\" line above the\n  composer while the agent's actual reasoning streamed past it further up. It now\n  appears with the proposal it is asking you to approve. Progress while planning\n  reads where the rest of the run does — in the conversation."
          }
        ],
        "markdown": "- **The plan card waits for the plan.** It used to appear as soon as planning\n  started, showing a title and an \"Analyzing the repository\" line above the\n  composer while the agent's actual reasoning streamed past it further up. It now\n  appears with the proposal it is asking you to approve. Progress while planning\n  reads where the rest of the run does — in the conversation."
      }
    ],
    "contributors": [],
    "pullRequests": [],
    "mergedBranches": [],
    "assets": [],
    "signing": [],
    "stats": {
      "commits": null,
      "filesChanged": null,
      "additions": null,
      "deletions": null
    },
    "links": {
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.12.0",
      "compare": "https://github.com/limboo-ai/limboo/compare/v1.11.0...v1.12.0",
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.12.0",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "Sessions run in a git worktree, and Limboo puts that worktree inside its own\napplication data folder. A safety rule meant to keep the agent out of Limboo's\ndatabase read the whole folder as off limits — so in a worktree session the\nagent was refused the moment it tried to write its first file, in what was\nactually its own working directory. Approving a plan could fail for a reason\nthat was never true, and leave the session unable to try again. The plan card\nalso stops appearing before there is a plan to read.\n\n### Fixed\n\n- **The agent could not write anything in a worktree session.** Every file it\n  tried to create was refused as \"Limboo's own app data\", because sessions check\n  out into a folder that lives inside Limboo's data directory. The rule now\n  covers only what it was written to protect — the database, your settings, and\n  the encrypted secret store — and the rest of that directory, including the\n  worktree the agent works in, is ordinary ground. Cursor runs were blocked by a\n  second copy of the same rule and are fixed with it.\n- **Commands were refused for mentioning a filename.** Anything containing the\n  text `limboo.db` was blocked wherever it ran, so a plain search of your own\n  source could be denied. Only the real, full path to the database is protected\n  now.\n- **Approving a plan could fail with \"the agent is already working on this\n  session\".** The plan appears while the run that wrote it is still finishing, so\n  a quick click arrived a fraction of a second early and was turned away.\n  Approving now waits for that run to finish instead of refusing, and the buttons\n  are held until it has.\n- **A failed approval left the plan unusable.** The plan was marked as being\n  carried out before the work had actually started, so when it did not start,\n  the approval buttons never came back and the session could not be recovered.\n  The plan is restored when the run fails to begin.\n\n### Changed\n\n- **The plan card waits for the plan.** It used to appear as soon as planning\n  started, showing a title and an \"Analyzing the repository\" line above the\n  composer while the agent's actual reasoning streamed past it further up. It now\n  appears with the proposal it is asking you to approve. Progress while planning\n  reads where the rest of the run does — in the conversation."
  },
  {
    "version": "1.11.0",
    "date": "2026-07-27",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.11.0",
    "commit": null,
    "buildNumber": null,
    "summary": "1.10.0 set out to stop Plan and Ask blocking the MCP servers you had connected.\nIt gave every server a **Plan & Ask access** setting and then defaulted it to\n\"only the tools this server declares read-only\" — but declaring that is optional,\nand most servers declare nothing. So most servers stayed blocked, and the refusal\nsent you to a control buried inside a per-server edit form that search could not\nfind. An un-annotated tool now asks you, in the run, with a button. Opening the\nTasks drawer also stopped crashing, and a finished plan no longer sits above the\ncomposer forever.",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "The Tasks drawer crashed on any plan with a finished or not-yet-started\n  step",
            "text": "A missing icon reference threw as the step was drawn, taking the whole\n  drawer down with it. Only steps that were running or had failed escaped it,\n  which is why it survived 1.10.0."
          },
          {
            "lead": "Most MCP servers were still blocked in Plan and Ask",
            "text": "Read-only annotations\n  are optional in the MCP protocol and few servers ship them, so the default\n  setting allowed nothing at all — the same dead end 1.10.0 meant to close, one\n  layer further in. A tool from a known, connected server that has simply not\n  declared itself read-only now **asks for approval during the run**, the same\n  way any other command does, instead of being refused with a pointer to\n  Settings. Blocked still means blocked, with no prompt."
          },
          {
            "lead": "Limboo's own memory and search tools were unusable while planning",
            "text": "They are\n  the tools the agent uses to recall what it learned about your project and to\n  find its way around it, and they were left out of the permissions a planning\n  run is given — so every plan started with less about your project than it had\n  available."
          },
          {
            "lead": "The plan card stayed above the composer forever",
            "text": "A plan record is never\n  deleted, so once a session had run one, a card for it sat pinned over the\n  composer for the life of that session — collapsing, once it was approved or\n  rejected, to a header with nothing under it. It now shows while a plan is being\n  written, while it waits for you, and while it is being carried out, and goes\n  away when it is done. Finished plans stay in the Tasks drawer."
          }
        ],
        "markdown": "- **The Tasks drawer crashed on any plan with a finished or not-yet-started\n  step.** A missing icon reference threw as the step was drawn, taking the whole\n  drawer down with it. Only steps that were running or had failed escaped it,\n  which is why it survived 1.10.0.\n- **Most MCP servers were still blocked in Plan and Ask.** Read-only annotations\n  are optional in the MCP protocol and few servers ship them, so the default\n  setting allowed nothing at all — the same dead end 1.10.0 meant to close, one\n  layer further in. A tool from a known, connected server that has simply not\n  declared itself read-only now **asks for approval during the run**, the same\n  way any other command does, instead of being refused with a pointer to\n  Settings. Blocked still means blocked, with no prompt.\n- **Limboo's own memory and search tools were unusable while planning.** They are\n  the tools the agent uses to recall what it learned about your project and to\n  find its way around it, and they were left out of the permissions a planning\n  run is given — so every plan started with less about your project than it had\n  available.\n- **The plan card stayed above the composer forever.** A plan record is never\n  deleted, so once a session had run one, a card for it sat pinned over the\n  composer for the life of that session — collapsing, once it was approved or\n  rejected, to a header with nothing under it. It now shows while a plan is being\n  written, while it waits for you, and while it is being carried out, and goes\n  away when it is done. Finished plans stay in the Tasks drawer."
      },
      {
        "category": "added",
        "title": "Added",
        "items": [
          {
            "lead": "A default Plan & Ask access for new servers",
            "text": ", under Settings › MCP, beside\n  Default trust — so a fleet of read-only servers is a decision made once rather\n  than per server. Changing it never rewrites servers already configured."
          },
          {
            "lead": "Plan & Ask access is findable",
            "text": "It is now in settings search under *plan*,\n  *ask*, *read-only*, *approve* and *blocked* — searching any of those used to\n  land on the unrelated Plan & Tasks section — and each server states its current\n  access in words on its own row, instead of only inside Edit."
          }
        ],
        "markdown": "- **A default Plan & Ask access for new servers**, under Settings › MCP, beside\n  Default trust — so a fleet of read-only servers is a decision made once rather\n  than per server. Changing it never rewrites servers already configured.\n- **Plan & Ask access is findable.** It is now in settings search under *plan*,\n  *ask*, *read-only*, *approve* and *blocked* — searching any of those used to\n  land on the unrelated Plan & Tasks section — and each server states its current\n  access in words on its own row, instead of only inside Edit."
      },
      {
        "category": "changed",
        "title": "Changed",
        "items": [
          {
            "lead": "A server marked Trusted is still asked about in Plan and Ask",
            "text": "when it has\n  not declared a tool read-only. Trust decides whether a permitted tool is\n  silent, never whether a read-only mode is a read-only mode."
          },
          {
            "lead": "Settings no longer offers \"Archive on completion\"",
            "text": "The switch had never\n  been connected to anything, and with finished plans now hidden by rule it would\n  read as the control for that."
          }
        ],
        "markdown": "- **A server marked Trusted is still asked about in Plan and Ask** when it has\n  not declared a tool read-only. Trust decides whether a permitted tool is\n  silent, never whether a read-only mode is a read-only mode.\n- **Settings no longer offers \"Archive on completion\".** The switch had never\n  been connected to anything, and with finished plans now hidden by rule it would\n  read as the control for that."
      }
    ],
    "contributors": [],
    "pullRequests": [],
    "mergedBranches": [],
    "assets": [],
    "signing": [],
    "stats": {
      "commits": null,
      "filesChanged": null,
      "additions": null,
      "deletions": null
    },
    "links": {
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.11.0",
      "compare": "https://github.com/limboo-ai/limboo/compare/v1.10.0...v1.11.0",
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.11.0",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "1.10.0 set out to stop Plan and Ask blocking the MCP servers you had connected.\nIt gave every server a **Plan & Ask access** setting and then defaulted it to\n\"only the tools this server declares read-only\" — but declaring that is optional,\nand most servers declare nothing. So most servers stayed blocked, and the refusal\nsent you to a control buried inside a per-server edit form that search could not\nfind. An un-annotated tool now asks you, in the run, with a button. Opening the\nTasks drawer also stopped crashing, and a finished plan no longer sits above the\ncomposer forever.\n\n### Fixed\n\n- **The Tasks drawer crashed on any plan with a finished or not-yet-started\n  step.** A missing icon reference threw as the step was drawn, taking the whole\n  drawer down with it. Only steps that were running or had failed escaped it,\n  which is why it survived 1.10.0.\n- **Most MCP servers were still blocked in Plan and Ask.** Read-only annotations\n  are optional in the MCP protocol and few servers ship them, so the default\n  setting allowed nothing at all — the same dead end 1.10.0 meant to close, one\n  layer further in. A tool from a known, connected server that has simply not\n  declared itself read-only now **asks for approval during the run**, the same\n  way any other command does, instead of being refused with a pointer to\n  Settings. Blocked still means blocked, with no prompt.\n- **Limboo's own memory and search tools were unusable while planning.** They are\n  the tools the agent uses to recall what it learned about your project and to\n  find its way around it, and they were left out of the permissions a planning\n  run is given — so every plan started with less about your project than it had\n  available.\n- **The plan card stayed above the composer forever.** A plan record is never\n  deleted, so once a session had run one, a card for it sat pinned over the\n  composer for the life of that session — collapsing, once it was approved or\n  rejected, to a header with nothing under it. It now shows while a plan is being\n  written, while it waits for you, and while it is being carried out, and goes\n  away when it is done. Finished plans stay in the Tasks drawer.\n\n### Added\n\n- **A default Plan & Ask access for new servers**, under Settings › MCP, beside\n  Default trust — so a fleet of read-only servers is a decision made once rather\n  than per server. Changing it never rewrites servers already configured.\n- **Plan & Ask access is findable.** It is now in settings search under *plan*,\n  *ask*, *read-only*, *approve* and *blocked* — searching any of those used to\n  land on the unrelated Plan & Tasks section — and each server states its current\n  access in words on its own row, instead of only inside Edit.\n\n### Changed\n\n- **A server marked Trusted is still asked about in Plan and Ask** when it has\n  not declared a tool read-only. Trust decides whether a permitted tool is\n  silent, never whether a read-only mode is a read-only mode.\n- **Settings no longer offers \"Archive on completion\".** The switch had never\n  been connected to anything, and with finished plans now hidden by rule it would\n  read as the control for that."
  },
  {
    "version": "1.10.0",
    "date": "2026-07-27",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.10.0",
    "commit": null,
    "buildNumber": null,
    "summary": "Plan and Ask are read-only modes, and they enforced that by refusing anything\nthey could not prove safe. Because nothing could prove a third-party tool safe,\nboth modes blocked every MCP server you had connected — and the agent's own\nresearch subagents — in every project, with no prompt and no way to allow them.\nRead-only now means read-only rather than unusable. The plan itself also leaves\nthe side drawer and appears in the conversation, where the work is.",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "Connected MCP tools were blocked while planning, with no way through",
            "text": "A\n  tool from a server you added yourself — a database browser, a deployment\n  client — was refused in Plan and Ask even when it only reads, and the refusal\n  offered no way to permit it. Servers now carry a **Plan & Ask access** setting,\n  and read-only tools work in both modes."
          },
          {
            "lead": "The agent could not delegate research while planning",
            "text": "Spawning a subagent\n  was treated as a mutating command and blocked outright, so planning a large\n  change could not fan out to explore the codebase first — in any project. A\n  subagent performs no work of its own, and everything it goes on to do is\n  checked by the same permission gate under the same mode, so it can still only\n  read while a plan is being written."
          },
          {
            "lead": "A Plan or Ask run using Cursor could fail before it started",
            "text": "A missing\n  default in the permission configuration threw as the run was assembled."
          },
          {
            "lead": "Cursor mislabelled MCP tool calls",
            "text": "Tool names arriving from Cursor's hooks\n  were reformatted before they were recognized, so a server's tools were shown\n  under a mangled name and were never matched against that server's own\n  permissions."
          },
          {
            "lead": "Editing an MCP server discarded everything known about its tools",
            "text": "Saving an\n  unrelated field — a rename, a timeout — cleared the cached tool list until the\n  next successful health probe, which also meant a server briefly lost the\n  read-only information its permissions depend on."
          },
          {
            "lead": "A blocked tool now says what to change",
            "text": "Every denial pointed at the same\n  setting, even when the setting was already correct and the real cause was a\n  server that was unknown, belonged to another project, or was not trusted."
          }
        ],
        "markdown": "- **Connected MCP tools were blocked while planning, with no way through.** A\n  tool from a server you added yourself — a database browser, a deployment\n  client — was refused in Plan and Ask even when it only reads, and the refusal\n  offered no way to permit it. Servers now carry a **Plan & Ask access** setting,\n  and read-only tools work in both modes.\n- **The agent could not delegate research while planning.** Spawning a subagent\n  was treated as a mutating command and blocked outright, so planning a large\n  change could not fan out to explore the codebase first — in any project. A\n  subagent performs no work of its own, and everything it goes on to do is\n  checked by the same permission gate under the same mode, so it can still only\n  read while a plan is being written.\n- **A Plan or Ask run using Cursor could fail before it started.** A missing\n  default in the permission configuration threw as the run was assembled.\n- **Cursor mislabelled MCP tool calls.** Tool names arriving from Cursor's hooks\n  were reformatted before they were recognized, so a server's tools were shown\n  under a mangled name and were never matched against that server's own\n  permissions.\n- **Editing an MCP server discarded everything known about its tools.** Saving an\n  unrelated field — a rename, a timeout — cleared the cached tool list until the\n  next successful health probe, which also meant a server briefly lost the\n  read-only information its permissions depend on.\n- **A blocked tool now says what to change.** Every denial pointed at the same\n  setting, even when the setting was already correct and the real cause was a\n  server that was unknown, belonged to another project, or was not trusted."
      },
      {
        "category": "added",
        "title": "Added",
        "items": [
          {
            "lead": "Plan & Ask access, per MCP server",
            "text": "Three choices: *Blocked* (nothing runs\n  in the read-only modes), *Read-only tools* (only the tools that server declares\n  read-only), or *Whole server* (you vouch for it). A server that declares\n  nothing says so in its settings rather than silently allowing nothing, and\n  tools it does declare read-only are marked in its tool list."
          },
          {
            "lead": "The plan appears in the conversation",
            "text": "It used to live only in the narrow\n  Tasks drawer, so a long plan read as raw Markdown next to the work it\n  describes. It now renders as text at full width in the stream, with copy, a\n  Markdown view, collapse, and a control that opens the full panel. Approving no\n  longer means leaving the conversation to find the button."
          }
        ],
        "markdown": "- **Plan & Ask access, per MCP server.** Three choices: *Blocked* (nothing runs\n  in the read-only modes), *Read-only tools* (only the tools that server declares\n  read-only), or *Whole server* (you vouch for it). A server that declares\n  nothing says so in its settings rather than silently allowing nothing, and\n  tools it does declare read-only are marked in its tool list.\n- **The plan appears in the conversation.** It used to live only in the narrow\n  Tasks drawer, so a long plan read as raw Markdown next to the work it\n  describes. It now renders as text at full width in the stream, with copy, a\n  Markdown view, collapse, and a control that opens the full panel. Approving no\n  longer means leaving the conversation to find the button."
      },
      {
        "category": "changed",
        "title": "Changed",
        "items": [
          {
            "lead": "A run's MCP servers come from its own project",
            "text": "They were resolved from\n  whichever project happened to be open, so switching or closing a project while\n  the agent was working changed which servers it was allowed to use mid-run — a\n  trusted server would start asking for approval, and a permitted one could be\n  refused. The set is now fixed when the run starts, from the session's own\n  project."
          }
        ],
        "markdown": "- **A run's MCP servers come from its own project.** They were resolved from\n  whichever project happened to be open, so switching or closing a project while\n  the agent was working changed which servers it was allowed to use mid-run — a\n  trusted server would start asking for approval, and a permitted one could be\n  refused. The set is now fixed when the run starts, from the session's own\n  project."
      },
      {
        "category": "security",
        "title": "Security",
        "items": [
          {
            "lead": "A server's claim to be read-only is not taken on faith",
            "text": "Servers may declare\n  which of their tools only read. Following the Model Context Protocol's own\n  guidance, that declaration is honored only for servers you have marked trusted;\n  for anything else it is shown as information and the tool still asks. Choosing\n  *Whole server* is recorded as your assertion, not the server's."
          },
          {
            "lead": "Permitting a tool while planning never widens it elsewhere",
            "text": "The read-only\n  allowance applies to Plan and Ask alone; in the normal modes every one of these\n  tools still asks exactly as before, and the workspace, app-data and\n  sensitive-file guards run ahead of it unchanged."
          },
          {
            "lead": "A subagent that asks to run outside the sandbox is refused while planning",
            "text": "and recorded in the timeline, alongside the existing audit for shell commands\n  that do the same."
          }
        ],
        "markdown": "- **A server's claim to be read-only is not taken on faith.** Servers may declare\n  which of their tools only read. Following the Model Context Protocol's own\n  guidance, that declaration is honored only for servers you have marked trusted;\n  for anything else it is shown as information and the tool still asks. Choosing\n  *Whole server* is recorded as your assertion, not the server's.\n- **Permitting a tool while planning never widens it elsewhere.** The read-only\n  allowance applies to Plan and Ask alone; in the normal modes every one of these\n  tools still asks exactly as before, and the workspace, app-data and\n  sensitive-file guards run ahead of it unchanged.\n- **A subagent that asks to run outside the sandbox is refused while planning**\n  and recorded in the timeline, alongside the existing audit for shell commands\n  that do the same."
      }
    ],
    "contributors": [],
    "pullRequests": [],
    "mergedBranches": [],
    "assets": [],
    "signing": [],
    "stats": {
      "commits": null,
      "filesChanged": null,
      "additions": null,
      "deletions": null
    },
    "links": {
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.10.0",
      "compare": "https://github.com/limboo-ai/limboo/compare/v1.9.0...v1.10.0",
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.10.0",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "Plan and Ask are read-only modes, and they enforced that by refusing anything\nthey could not prove safe. Because nothing could prove a third-party tool safe,\nboth modes blocked every MCP server you had connected — and the agent's own\nresearch subagents — in every project, with no prompt and no way to allow them.\nRead-only now means read-only rather than unusable. The plan itself also leaves\nthe side drawer and appears in the conversation, where the work is.\n\n### Fixed\n\n- **Connected MCP tools were blocked while planning, with no way through.** A\n  tool from a server you added yourself — a database browser, a deployment\n  client — was refused in Plan and Ask even when it only reads, and the refusal\n  offered no way to permit it. Servers now carry a **Plan & Ask access** setting,\n  and read-only tools work in both modes.\n- **The agent could not delegate research while planning.** Spawning a subagent\n  was treated as a mutating command and blocked outright, so planning a large\n  change could not fan out to explore the codebase first — in any project. A\n  subagent performs no work of its own, and everything it goes on to do is\n  checked by the same permission gate under the same mode, so it can still only\n  read while a plan is being written.\n- **A Plan or Ask run using Cursor could fail before it started.** A missing\n  default in the permission configuration threw as the run was assembled.\n- **Cursor mislabelled MCP tool calls.** Tool names arriving from Cursor's hooks\n  were reformatted before they were recognized, so a server's tools were shown\n  under a mangled name and were never matched against that server's own\n  permissions.\n- **Editing an MCP server discarded everything known about its tools.** Saving an\n  unrelated field — a rename, a timeout — cleared the cached tool list until the\n  next successful health probe, which also meant a server briefly lost the\n  read-only information its permissions depend on.\n- **A blocked tool now says what to change.** Every denial pointed at the same\n  setting, even when the setting was already correct and the real cause was a\n  server that was unknown, belonged to another project, or was not trusted.\n\n### Added\n\n- **Plan & Ask access, per MCP server.** Three choices: *Blocked* (nothing runs\n  in the read-only modes), *Read-only tools* (only the tools that server declares\n  read-only), or *Whole server* (you vouch for it). A server that declares\n  nothing says so in its settings rather than silently allowing nothing, and\n  tools it does declare read-only are marked in its tool list.\n- **The plan appears in the conversation.** It used to live only in the narrow\n  Tasks drawer, so a long plan read as raw Markdown next to the work it\n  describes. It now renders as text at full width in the stream, with copy, a\n  Markdown view, collapse, and a control that opens the full panel. Approving no\n  longer means leaving the conversation to find the button.\n\n### Changed\n\n- **A run's MCP servers come from its own project.** They were resolved from\n  whichever project happened to be open, so switching or closing a project while\n  the agent was working changed which servers it was allowed to use mid-run — a\n  trusted server would start asking for approval, and a permitted one could be\n  refused. The set is now fixed when the run starts, from the session's own\n  project.\n\n### Security\n\n- **A server's claim to be read-only is not taken on faith.** Servers may declare\n  which of their tools only read. Following the Model Context Protocol's own\n  guidance, that declaration is honored only for servers you have marked trusted;\n  for anything else it is shown as information and the tool still asks. Choosing\n  *Whole server* is recorded as your assertion, not the server's.\n- **Permitting a tool while planning never widens it elsewhere.** The read-only\n  allowance applies to Plan and Ask alone; in the normal modes every one of these\n  tools still asks exactly as before, and the workspace, app-data and\n  sensitive-file guards run ahead of it unchanged.\n- **A subagent that asks to run outside the sandbox is refused while planning**\n  and recorded in the timeline, alongside the existing audit for shell commands\n  that do the same."
  }
];

/** Every released version, newest first. */
export const RELEASE_INDEX: ReleaseIndexEntry[] = [
  {
    "version": "1.13.1",
    "date": "2026-07-28",
    "channel": "stable",
    "summary": "Stopping the agent mid-task no longer breaks your next message.",
    "detailed": true
  },
  {
    "version": "1.13.0",
    "date": "2026-07-28",
    "channel": "stable",
    "summary": "The conversation stops being something you only read. Every message now carries\nits own actions on hover, and any turn can be rolled back — the workspace returns\nto how it was before the agent touched it, including deleting files it created,\nwith the rollback recorded rather than hidden. Plan Mode also stops saying the\nsame thing three times.",
    "detailed": true
  },
  {
    "version": "1.12.0",
    "date": "2026-07-27",
    "channel": "stable",
    "summary": "Sessions run in a git worktree, and Limboo puts that worktree inside its own\napplication data folder. A safety rule meant to keep the agent out of Limboo's\ndatabase read the whole folder as off limits — so in a worktree session the\nagent was refused the moment it tried to write its first file, in what was\nactually its own working directory. Approving a plan could fail for a reason\nthat was never true, and leave the session unable to try again. The plan card\nalso stops appearing before there is a plan to read.",
    "detailed": true
  },
  {
    "version": "1.11.0",
    "date": "2026-07-27",
    "channel": "stable",
    "summary": "1.10.0 set out to stop Plan and Ask blocking the MCP servers you had connected.\nIt gave every server a **Plan & Ask access** setting and then defaulted it to\n\"only the tools this server declares read-only\" — but declaring that is optional,\nand most servers declare nothing. So most servers stayed blocked, and the refusal\nsent you to a control buried inside a per-server edit form that search could not\nfind. An un-annotated tool now asks you, in the run, with a button. Opening the\nTasks drawer also stopped crashing, and a finished plan no longer sits above the\ncomposer forever.",
    "detailed": true
  },
  {
    "version": "1.10.0",
    "date": "2026-07-27",
    "channel": "stable",
    "summary": "Plan and Ask are read-only modes, and they enforced that by refusing anything\nthey could not prove safe. Because nothing could prove a third-party tool safe,\nboth modes blocked every MCP server you had connected — and the agent's own\nresearch subagents — in every project, with no prompt and no way to allow them.\nRead-only now means read-only rather than unusable. The plan itself also leaves\nthe side drawer and appears in the conversation, where the work is.",
    "detailed": true
  },
  {
    "version": "1.9.0",
    "date": "2026-07-27",
    "channel": "stable",
    "summary": "Fixes the Linux updater, which could never finish. On Arch and Manjaro the\npublished package declared dependencies that no longer exist, so `pacman -U`\nfailed every single time — after the user had already typed their password. The\nrelease document also drops its badges and coloured glyphs, and contributors now\nappear with their real profile picture and name.",
    "detailed": false
  },
  {
    "version": "1.8.0",
    "date": "2026-07-26",
    "channel": "stable",
    "summary": "Turns an update from a maintenance task into a workspace document. The release\nnotes added in 1.7.0 were one blob of Markdown; they are now a structured release\ndashboard driven by a real release manifest that the CI pipeline publishes\nalongside the binaries — so the release page, the changelog and the app all\ndescribe a release from the same file.",
    "detailed": false
  },
  {
    "version": "1.7.0",
    "date": "2026-07-26",
    "channel": "stable",
    "summary": "Adds the **Work Graph** — a typed, queryable graph of what a session actually\ndid, built from both coding agents' event streams and owned entirely by Limboo —\nalong with a document-oriented workspace where diffs open as first-class tabs,\nand an in-app **What's New** tab so an update can finally tell you what changed.",
    "detailed": false
  },
  {
    "version": "1.6.0",
    "date": "2026-07-25",
    "channel": "stable",
    "summary": "Repairs in-app updating, which has never worked on macOS and could fail to\ninstall or restart anywhere; adds code signing and a Microsoft Store channel;\nand extends the release to every architecture, including Arch/Manjaro packages\nand arm64 builds for all three platforms.",
    "detailed": false
  },
  {
    "version": "1.5.1",
    "date": "2026-07-25",
    "channel": "stable",
    "summary": "",
    "detailed": false
  },
  {
    "version": "1.5.0",
    "date": "2026-07-25",
    "channel": "stable",
    "summary": "Restores boot after a regression that made the app unlaunchable, and adds\nconversation navigation plus visible file reads.",
    "detailed": false
  },
  {
    "version": "1.0.0",
    "date": null,
    "channel": "stable",
    "summary": "The first consolidated release. The desktop foundation and platform services are\noperational.",
    "detailed": false
  }
];

/** The full manifest for one version, or null when this build does not carry it. */
export function releaseManifestFor(version: string): ReleaseManifestEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_MANIFESTS.find((r) => r.version === wanted) ?? null;
}

/** The index entry for one version, or null when the changelog has no section. */
export function releaseIndexFor(version: string): ReleaseIndexEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_INDEX.find((r) => r.version === wanted) ?? null;
}
