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
      "compare": null,
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
      "compare": null,
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
  },
  {
    "version": "1.9.0",
    "date": "2026-07-27",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.9.0",
    "commit": null,
    "buildNumber": null,
    "summary": "Fixes the Linux updater, which could never finish. On Arch and Manjaro the\npublished package declared dependencies that no longer exist, so `pacman -U`\nfailed every single time — after the user had already typed their password. The\nrelease document also drops its badges and coloured glyphs, and contributors now\nappear with their real profile picture and name.",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "The `.pacman` package could never install",
            "text": "electron-builder's default\n  dependency list for that target still names `http-parser` (dropped from Arch)\n  and `libappindicator-gtk3` (AUR-only), so every self-update ended in\n  `cannot resolve \"http-parser\"` and the app stayed on the old version.\n  `pacman.depends` is now declared explicitly and every entry is verified present\n  in core/extra."
          },
          {
            "lead": "\"Restart & install\" froze the app, prompted twice, then killed it",
            "text": "electron-updater runs the system package manager with a synchronous,\n  shell-quoted spawn, which blocks the main process for the entire\n  authorization — nineteen seconds in the reported case — and then fires a\n  *second* password prompt (`pacman -Sy`) when the first attempt fails. Limboo\n  now owns the privileged install: argv-only, asynchronous, one prompt, no\n  retry that re-prompts, and the window stays responsive throughout."
          },
          {
            "lead": "A refused install no longer force-quits the app",
            "text": "The four-second quit\n  watchdog fired unconditionally, so an install the package manager had already\n  rejected still terminated the app — the update appeared to do nothing except\n  close the window. The watchdog is now armed only once the installer handoff is\n  confirmed."
          },
          {
            "lead": "An install that fails now says so",
            "text": "electron-updater reports this class of\n  failure on an event rather than by throwing, so `install()` returned success\n  and the UI stayed silent. The real error is captured and surfaced."
          },
          {
            "lead": "Quitting Limboo no longer asks for your password",
            "text": "`autoInstallOnAppQuit`\n  re-ran the whole privileged install on every ordinary quit, blocking shutdown\n  behind a polkit dialog. It is disabled for the Linux package formats."
          },
          {
            "lead": "The Linux updater can no longer pick the wrong package manager",
            "text": "The\n  `package-type` marker baked into the build is cross-checked against the tooling\n  actually present on the machine, so a stale marker cannot select a package\n  manager that is not installed."
          },
          {
            "lead": "\"Keep running in tray\" finally does something",
            "text": "The setting had shipped\n  since the first release with no main-process consumer at all: nothing could\n  veto a window close, so closing always quit the app and the tray icon vanished\n  with it. Closing now hides to the tray, the tray can restore or recreate the\n  window, and a one-time notification says where the app went. If the tray icon\n  could not be created, closing still quits — being left with no window *and* no\n  icon is worse than not having the feature."
          }
        ],
        "markdown": "- **The `.pacman` package could never install.** electron-builder's default\n  dependency list for that target still names `http-parser` (dropped from Arch)\n  and `libappindicator-gtk3` (AUR-only), so every self-update ended in\n  `cannot resolve \"http-parser\"` and the app stayed on the old version.\n  `pacman.depends` is now declared explicitly and every entry is verified present\n  in core/extra.\n- **\"Restart & install\" froze the app, prompted twice, then killed it.**\n  electron-updater runs the system package manager with a synchronous,\n  shell-quoted spawn, which blocks the main process for the entire\n  authorization — nineteen seconds in the reported case — and then fires a\n  *second* password prompt (`pacman -Sy`) when the first attempt fails. Limboo\n  now owns the privileged install: argv-only, asynchronous, one prompt, no\n  retry that re-prompts, and the window stays responsive throughout.\n- **A refused install no longer force-quits the app.** The four-second quit\n  watchdog fired unconditionally, so an install the package manager had already\n  rejected still terminated the app — the update appeared to do nothing except\n  close the window. The watchdog is now armed only once the installer handoff is\n  confirmed.\n- **An install that fails now says so.** electron-updater reports this class of\n  failure on an event rather than by throwing, so `install()` returned success\n  and the UI stayed silent. The real error is captured and surfaced.\n- **Quitting Limboo no longer asks for your password.** `autoInstallOnAppQuit`\n  re-ran the whole privileged install on every ordinary quit, blocking shutdown\n  behind a polkit dialog. It is disabled for the Linux package formats.\n- **The Linux updater can no longer pick the wrong package manager.** The\n  `package-type` marker baked into the build is cross-checked against the tooling\n  actually present on the machine, so a stale marker cannot select a package\n  manager that is not installed.\n- **\"Keep running in tray\" finally does something.** The setting had shipped\n  since the first release with no main-process consumer at all: nothing could\n  veto a window close, so closing always quit the app and the tray icon vanished\n  with it. Closing now hides to the tray, the tray can restore or recreate the\n  window, and a one-time notification says where the app went. If the tray icon\n  could not be created, closing still quits — being left with no window *and* no\n  icon is worse than not having the feature."
      },
      {
        "category": "added",
        "title": "Added",
        "items": [
          {
            "lead": "Contributors show their real profile picture and name",
            "text": "Resolved at build\n  time through the forge's own commit-email-to-account mapping and embedded in\n  the release manifest, so the picture ships inside the build that describes it.\n  Anyone the lookup cannot resolve keeps their initials."
          },
          {
            "lead": "When an update cannot install itself, Limboo hands you the command that\n  will",
            "text": "The exact `sudo pacman -U …` (or `dpkg`/`dnf`) line for the file\n  already downloaded, copyable from the update ribbon."
          }
        ],
        "markdown": "- **Contributors show their real profile picture and name.** Resolved at build\n  time through the forge's own commit-email-to-account mapping and embedded in\n  the release manifest, so the picture ships inside the build that describes it.\n  Anyone the lookup cannot resolve keeps their initials.\n- **When an update cannot install itself, Limboo hands you the command that\n  will.** The exact `sudo pacman -U …` (or `dpkg`/`dnf`) line for the file\n  already downloaded, copyable from the update ribbon."
      },
      {
        "category": "changed",
        "title": "Changed",
        "items": [
          {
            "lead": "The release document has no badges and no decorative icons",
            "text": "Status reads as\n  words — \"Stable\", \"Running now\", \"Windows: self-signed\" — and every section is\n  identified by its name alone. The category glyphs are gone, and so is the\n  colour coding: what matters most is simply listed first, which survives a\n  screenshot, colour-blindness, and the Markdown export in a way a red triangle\n  does not."
          },
          {
            "lead": "The update ribbon reports the whole install",
            "text": "It now has a real \"Installing\"\n  state that cannot be dismissed mid-flight, a determinate progress bar, and a\n  restart button with proper pressed, focused, disabled and busy states."
          },
          {
            "lead": "Prerelease rows in the release history print their channel correctly",
            "text": "The\n  list showed a lowercase `beta` where the header showed `Beta`; both now read\n  from one table."
          }
        ],
        "markdown": "- **The release document has no badges and no decorative icons.** Status reads as\n  words — \"Stable\", \"Running now\", \"Windows: self-signed\" — and every section is\n  identified by its name alone. The category glyphs are gone, and so is the\n  colour coding: what matters most is simply listed first, which survives a\n  screenshot, colour-blindness, and the Markdown export in a way a red triangle\n  does not.\n- **The update ribbon reports the whole install.** It now has a real \"Installing\"\n  state that cannot be dismissed mid-flight, a determinate progress bar, and a\n  restart button with proper pressed, focused, disabled and busy states.\n- **Prerelease rows in the release history print their channel correctly.** The\n  list showed a lowercase `beta` where the header showed `Beta`; both now read\n  from one table."
      },
      {
        "category": "security",
        "title": "Security",
        "items": [
          {
            "lead": "Embedded avatars are screened before they are displayed",
            "text": "The build-time\n  fetch is HTTPS-only and host-allowlisted, follows redirects manually so every\n  hop is re-checked, caps the response while streaming, and identifies images by\n  their magic bytes rather than a declared content type. The renderer re-screens\n  the value before it reaches an image tag, rejecting anything that is not a\n  base64 raster data URI — a manifest is data even when the file it arrived in is\n  ours. Contributor email addresses remain lookup keys and are never written into\n  the manifest."
          },
          {
            "lead": "The privileged Linux install passes no shell",
            "text": "The package manager is\n  invoked with an argument vector rather than a quoted `/bin/bash -c` string."
          }
        ],
        "markdown": "- **Embedded avatars are screened before they are displayed.** The build-time\n  fetch is HTTPS-only and host-allowlisted, follows redirects manually so every\n  hop is re-checked, caps the response while streaming, and identifies images by\n  their magic bytes rather than a declared content type. The renderer re-screens\n  the value before it reaches an image tag, rejecting anything that is not a\n  base64 raster data URI — a manifest is data even when the file it arrived in is\n  ours. Contributor email addresses remain lookup keys and are never written into\n  the manifest.\n- **The privileged Linux install passes no shell.** The package manager is\n  invoked with an argument vector rather than a quoted `/bin/bash -c` string."
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
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.9.0",
      "compare": "https://github.com/limboo-ai/limboo/compare/v1.8.0...v1.9.0",
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.9.0",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "Fixes the Linux updater, which could never finish. On Arch and Manjaro the\npublished package declared dependencies that no longer exist, so `pacman -U`\nfailed every single time — after the user had already typed their password. The\nrelease document also drops its badges and coloured glyphs, and contributors now\nappear with their real profile picture and name.\n\n### Fixed\n\n- **The `.pacman` package could never install.** electron-builder's default\n  dependency list for that target still names `http-parser` (dropped from Arch)\n  and `libappindicator-gtk3` (AUR-only), so every self-update ended in\n  `cannot resolve \"http-parser\"` and the app stayed on the old version.\n  `pacman.depends` is now declared explicitly and every entry is verified present\n  in core/extra.\n- **\"Restart & install\" froze the app, prompted twice, then killed it.**\n  electron-updater runs the system package manager with a synchronous,\n  shell-quoted spawn, which blocks the main process for the entire\n  authorization — nineteen seconds in the reported case — and then fires a\n  *second* password prompt (`pacman -Sy`) when the first attempt fails. Limboo\n  now owns the privileged install: argv-only, asynchronous, one prompt, no\n  retry that re-prompts, and the window stays responsive throughout.\n- **A refused install no longer force-quits the app.** The four-second quit\n  watchdog fired unconditionally, so an install the package manager had already\n  rejected still terminated the app — the update appeared to do nothing except\n  close the window. The watchdog is now armed only once the installer handoff is\n  confirmed.\n- **An install that fails now says so.** electron-updater reports this class of\n  failure on an event rather than by throwing, so `install()` returned success\n  and the UI stayed silent. The real error is captured and surfaced.\n- **Quitting Limboo no longer asks for your password.** `autoInstallOnAppQuit`\n  re-ran the whole privileged install on every ordinary quit, blocking shutdown\n  behind a polkit dialog. It is disabled for the Linux package formats.\n- **The Linux updater can no longer pick the wrong package manager.** The\n  `package-type` marker baked into the build is cross-checked against the tooling\n  actually present on the machine, so a stale marker cannot select a package\n  manager that is not installed.\n- **\"Keep running in tray\" finally does something.** The setting had shipped\n  since the first release with no main-process consumer at all: nothing could\n  veto a window close, so closing always quit the app and the tray icon vanished\n  with it. Closing now hides to the tray, the tray can restore or recreate the\n  window, and a one-time notification says where the app went. If the tray icon\n  could not be created, closing still quits — being left with no window *and* no\n  icon is worse than not having the feature.\n\n### Added\n\n- **Contributors show their real profile picture and name.** Resolved at build\n  time through the forge's own commit-email-to-account mapping and embedded in\n  the release manifest, so the picture ships inside the build that describes it.\n  Anyone the lookup cannot resolve keeps their initials.\n- **When an update cannot install itself, Limboo hands you the command that\n  will.** The exact `sudo pacman -U …` (or `dpkg`/`dnf`) line for the file\n  already downloaded, copyable from the update ribbon.\n\n### Changed\n\n- **The release document has no badges and no decorative icons.** Status reads as\n  words — \"Stable\", \"Running now\", \"Windows: self-signed\" — and every section is\n  identified by its name alone. The category glyphs are gone, and so is the\n  colour coding: what matters most is simply listed first, which survives a\n  screenshot, colour-blindness, and the Markdown export in a way a red triangle\n  does not.\n- **The update ribbon reports the whole install.** It now has a real \"Installing\"\n  state that cannot be dismissed mid-flight, a determinate progress bar, and a\n  restart button with proper pressed, focused, disabled and busy states.\n- **Prerelease rows in the release history print their channel correctly.** The\n  list showed a lowercase `beta` where the header showed `Beta`; both now read\n  from one table.\n\n### Security\n\n- **Embedded avatars are screened before they are displayed.** The build-time\n  fetch is HTTPS-only and host-allowlisted, follows redirects manually so every\n  hop is re-checked, caps the response while streaming, and identifies images by\n  their magic bytes rather than a declared content type. The renderer re-screens\n  the value before it reaches an image tag, rejecting anything that is not a\n  base64 raster data URI — a manifest is data even when the file it arrived in is\n  ours. Contributor email addresses remain lookup keys and are never written into\n  the manifest.\n- **The privileged Linux install passes no shell.** The package manager is\n  invoked with an argument vector rather than a quoted `/bin/bash -c` string."
  },
  {
    "version": "1.8.0",
    "date": "2026-07-26",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.8.0",
    "commit": null,
    "buildNumber": null,
    "summary": "Turns an update from a maintenance task into a workspace document. The release\nnotes added in 1.7.0 were one blob of Markdown; they are now a structured release\ndashboard driven by a real release manifest that the CI pipeline publishes\nalongside the binaries — so the release page, the changelog and the app all\ndescribe a release from the same file.",
    "sections": [
      {
        "category": "added",
        "title": "Added",
        "items": [
          {
            "lead": "A structured release document",
            "text": "The What's New tab becomes a full release\n  view: version, codename, channel, git tag, commit, build number, platform and\n  Electron versions; every changelog section as its own collapsible, copyable,\n  filterable card ordered by consequence (breaking and security first);\n  contributors with commit counts; merged pull requests and branches; published\n  assets with sizes; and a verification block carrying the `sha256sum -c` and\n  `gh attestation verify` commands. A release-history list browses every version\n  the changelog knows and can diff any two bundled releases category by category."
          },
          {
            "lead": "A published release manifest",
            "text": "Every release now ships\n  `release-manifest.json` — the same structured notes the app carries, plus every\n  artifact's size and SHA-256 and the signing posture per platform. It is written\n  before `SHA256SUMS` so the checksum manifest covers it, and\n  `ci/scripts/check-release-manifest.mjs` proves the two describe the same\n  downloads before anything is published."
          },
          {
            "lead": "Release notes are searchable and agent-reachable",
            "text": "They federate into Global\n  Search as a `release` source, and the agent can answer \"what changed in 1.7.0?\"\n  through read-only `list_releases` / `release_notes` tools on the existing\n  `limboo_search` server. Both providers get them from one implementation.\n  Nothing is injected into a system prompt — Claude Code shipped a fix for\n  exactly that bug, where its release-notes view leaked the whole changelog into\n  every subsequent request."
          },
          {
            "lead": "Export and copy",
            "text": "A release can be copied as Markdown or written to a file\n  from the document or the command palette. Main owns the save dialog; the\n  renderer never supplies a path."
          }
        ],
        "markdown": "- **A structured release document.** The What's New tab becomes a full release\n  view: version, codename, channel, git tag, commit, build number, platform and\n  Electron versions; every changelog section as its own collapsible, copyable,\n  filterable card ordered by consequence (breaking and security first);\n  contributors with commit counts; merged pull requests and branches; published\n  assets with sizes; and a verification block carrying the `sha256sum -c` and\n  `gh attestation verify` commands. A release-history list browses every version\n  the changelog knows and can diff any two bundled releases category by category.\n- **A published release manifest.** Every release now ships\n  `release-manifest.json` — the same structured notes the app carries, plus every\n  artifact's size and SHA-256 and the signing posture per platform. It is written\n  before `SHA256SUMS` so the checksum manifest covers it, and\n  `ci/scripts/check-release-manifest.mjs` proves the two describe the same\n  downloads before anything is published.\n- **Release notes are searchable and agent-reachable.** They federate into Global\n  Search as a `release` source, and the agent can answer \"what changed in 1.7.0?\"\n  through read-only `list_releases` / `release_notes` tools on the existing\n  `limboo_search` server. Both providers get them from one implementation.\n  Nothing is injected into a system prompt — Claude Code shipped a fix for\n  exactly that bug, where its release-notes view leaked the whole changelog into\n  every subsequent request.\n- **Export and copy.** A release can be copied as Markdown or written to a file\n  from the document or the command palette. Main owns the save dialog; the\n  renderer never supplies a path."
      },
      {
        "category": "changed",
        "title": "Changed",
        "items": [
          {
            "lead": "A release tab is its label",
            "text": "It carries no icon — every other tab in the\n  strip names an object you could point at on disk, and this one names a version,\n  so the version is the identity."
          },
          {
            "lead": "The accent underline is gone from the document and worktree tab strips",
            "text": "An\n  active tab is marked by its raised seat and a heavier label instead. A 2px\n  accent bar under a tab that already sits on a plate says the same thing twice,\n  and on pure black it reads as a second element rather than an emphasis of the\n  first. Worktree tabs also gained the focus ring they were missing."
          },
          {
            "lead": "`npm run gen:notes` generates the manifest too",
            "text": ", and CI enforces that both\n  generated modules stay in sync with `CHANGELOG.md` (`gen:notes --check`).\n  Keeping them in sync was a checklist item with nothing behind it, so a\n  changelog edit could ship with stale in-app notes and nobody would find out\n  until after the release."
          }
        ],
        "markdown": "- **A release tab is its label.** It carries no icon — every other tab in the\n  strip names an object you could point at on disk, and this one names a version,\n  so the version is the identity.\n- **The accent underline is gone from the document and worktree tab strips.** An\n  active tab is marked by its raised seat and a heavier label instead. A 2px\n  accent bar under a tab that already sits on a plate says the same thing twice,\n  and on pure black it reads as a second element rather than an emphasis of the\n  first. Worktree tabs also gained the focus ring they were missing.\n- **`npm run gen:notes` generates the manifest too**, and CI enforces that both\n  generated modules stay in sync with `CHANGELOG.md` (`gen:notes --check`).\n  Keeping them in sync was a checklist item with nothing behind it, so a\n  changelog edit could ship with stale in-app notes and nobody would find out\n  until after the release."
      },
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "The release notes could reappear on every launch",
            "text": "With no session selected\n  the notes render inline rather than as a tab, and acknowledgement is a tab\n  being closed — so nothing ever marked the version seen. That path now has its\n  own dismissal."
          },
          {
            "lead": "The tab's document id was spelled by hand",
            "text": "in one place instead of derived\n  through `documentId()`, which exists precisely so the format cannot drift. A\n  mismatch there would have left the tab looking permanently closed, silently\n  reopening it forever."
          }
        ],
        "markdown": "- **The release notes could reappear on every launch.** With no session selected\n  the notes render inline rather than as a tab, and acknowledgement is a tab\n  being closed — so nothing ever marked the version seen. That path now has its\n  own dismissal.\n- **The tab's document id was spelled by hand** in one place instead of derived\n  through `documentId()`, which exists precisely so the format cannot drift. A\n  mismatch there would have left the tab looking permanently closed, silently\n  reopening it forever."
      },
      {
        "category": "security",
        "title": "Security",
        "items": [
          {
            "lead": "Release metadata is compiled into the build, never fetched",
            "text": "There is no\n  network path to widen and nothing to verify at runtime, which is also the only\n  design that works under the production CSP (`connect-src 'self'`). Contributor\n  avatars are drawn locally from initials rather than loaded from a forge."
          },
          {
            "lead": "Every manifest URL is screened before it becomes a link",
            "text": "— https only, no\n  embedded credentials, and the host must be a forge host or a subdomain of one,\n  matched on a dot boundary so `evil-github.com` cannot pass. Unscreened URLs\n  render as plain text."
          },
          {
            "lead": "The document never claims verification it cannot perform",
            "text": "A build cannot\n  contain the hash of an installer produced from it, so asset digests live only\n  in the published manifest; the app shows where they are and how to check them\n  instead of printing a digest it cannot stand behind. Facts about the running\n  process are shown separately from claims about the published artifact."
          },
          {
            "lead": "Markdown rendering is unchanged and still sanitized",
            "text": "(`rehype-sanitize`, no\n  raw HTML), the document performs no writes, and the export handler bounds its\n  input and owns its own path."
          }
        ],
        "markdown": "- **Release metadata is compiled into the build, never fetched.** There is no\n  network path to widen and nothing to verify at runtime, which is also the only\n  design that works under the production CSP (`connect-src 'self'`). Contributor\n  avatars are drawn locally from initials rather than loaded from a forge.\n- **Every manifest URL is screened before it becomes a link** — https only, no\n  embedded credentials, and the host must be a forge host or a subdomain of one,\n  matched on a dot boundary so `evil-github.com` cannot pass. Unscreened URLs\n  render as plain text.\n- **The document never claims verification it cannot perform.** A build cannot\n  contain the hash of an installer produced from it, so asset digests live only\n  in the published manifest; the app shows where they are and how to check them\n  instead of printing a digest it cannot stand behind. Facts about the running\n  process are shown separately from claims about the published artifact.\n- **Markdown rendering is unchanged and still sanitized** (`rehype-sanitize`, no\n  raw HTML), the document performs no writes, and the export handler bounds its\n  input and owns its own path."
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
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.8.0",
      "compare": "https://github.com/limboo-ai/limboo/compare/v1.7.0...v1.8.0",
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.8.0",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "Turns an update from a maintenance task into a workspace document. The release\nnotes added in 1.7.0 were one blob of Markdown; they are now a structured release\ndashboard driven by a real release manifest that the CI pipeline publishes\nalongside the binaries — so the release page, the changelog and the app all\ndescribe a release from the same file.\n\n### Added\n\n- **A structured release document.** The What's New tab becomes a full release\n  view: version, codename, channel, git tag, commit, build number, platform and\n  Electron versions; every changelog section as its own collapsible, copyable,\n  filterable card ordered by consequence (breaking and security first);\n  contributors with commit counts; merged pull requests and branches; published\n  assets with sizes; and a verification block carrying the `sha256sum -c` and\n  `gh attestation verify` commands. A release-history list browses every version\n  the changelog knows and can diff any two bundled releases category by category.\n- **A published release manifest.** Every release now ships\n  `release-manifest.json` — the same structured notes the app carries, plus every\n  artifact's size and SHA-256 and the signing posture per platform. It is written\n  before `SHA256SUMS` so the checksum manifest covers it, and\n  `ci/scripts/check-release-manifest.mjs` proves the two describe the same\n  downloads before anything is published.\n- **Release notes are searchable and agent-reachable.** They federate into Global\n  Search as a `release` source, and the agent can answer \"what changed in 1.7.0?\"\n  through read-only `list_releases` / `release_notes` tools on the existing\n  `limboo_search` server. Both providers get them from one implementation.\n  Nothing is injected into a system prompt — Claude Code shipped a fix for\n  exactly that bug, where its release-notes view leaked the whole changelog into\n  every subsequent request.\n- **Export and copy.** A release can be copied as Markdown or written to a file\n  from the document or the command palette. Main owns the save dialog; the\n  renderer never supplies a path.\n\n### Changed\n\n- **A release tab is its label.** It carries no icon — every other tab in the\n  strip names an object you could point at on disk, and this one names a version,\n  so the version is the identity.\n- **The accent underline is gone from the document and worktree tab strips.** An\n  active tab is marked by its raised seat and a heavier label instead. A 2px\n  accent bar under a tab that already sits on a plate says the same thing twice,\n  and on pure black it reads as a second element rather than an emphasis of the\n  first. Worktree tabs also gained the focus ring they were missing.\n- **`npm run gen:notes` generates the manifest too**, and CI enforces that both\n  generated modules stay in sync with `CHANGELOG.md` (`gen:notes --check`).\n  Keeping them in sync was a checklist item with nothing behind it, so a\n  changelog edit could ship with stale in-app notes and nobody would find out\n  until after the release.\n\n### Fixed\n\n- **The release notes could reappear on every launch.** With no session selected\n  the notes render inline rather than as a tab, and acknowledgement is a tab\n  being closed — so nothing ever marked the version seen. That path now has its\n  own dismissal.\n- **The tab's document id was spelled by hand** in one place instead of derived\n  through `documentId()`, which exists precisely so the format cannot drift. A\n  mismatch there would have left the tab looking permanently closed, silently\n  reopening it forever.\n\n### Security\n\n- **Release metadata is compiled into the build, never fetched.** There is no\n  network path to widen and nothing to verify at runtime, which is also the only\n  design that works under the production CSP (`connect-src 'self'`). Contributor\n  avatars are drawn locally from initials rather than loaded from a forge.\n- **Every manifest URL is screened before it becomes a link** — https only, no\n  embedded credentials, and the host must be a forge host or a subdomain of one,\n  matched on a dot boundary so `evil-github.com` cannot pass. Unscreened URLs\n  render as plain text.\n- **The document never claims verification it cannot perform.** A build cannot\n  contain the hash of an installer produced from it, so asset digests live only\n  in the published manifest; the app shows where they are and how to check them\n  instead of printing a digest it cannot stand behind. Facts about the running\n  process are shown separately from claims about the published artifact.\n- **Markdown rendering is unchanged and still sanitized** (`rehype-sanitize`, no\n  raw HTML), the document performs no writes, and the export handler bounds its\n  input and owns its own path."
  }
];

/** Every released version, newest first. */
export const RELEASE_INDEX: ReleaseIndexEntry[] = [
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
    "detailed": true
  },
  {
    "version": "1.8.0",
    "date": "2026-07-26",
    "channel": "stable",
    "summary": "Turns an update from a maintenance task into a workspace document. The release\nnotes added in 1.7.0 were one blob of Markdown; they are now a structured release\ndashboard driven by a real release manifest that the CI pipeline publishes\nalongside the binaries — so the release page, the changelog and the app all\ndescribe a release from the same file.",
    "detailed": true
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
