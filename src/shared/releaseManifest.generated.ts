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
    "version": "1.19.0",
    "date": "2026-08-30",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.19.0",
    "commit": null,
    "buildNumber": null,
    "summary": "Limboo 1.19.0 repairs the agent harness, which could not install itself in any\npackaged build, and gives workspaces a way out of the app.",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "The harness could never complete its one-time setup",
            "text": "Packaging stripped\n  every `pnpm-lock.yaml` in the tree — a rule meant for the project's own\n  lockfile that also removed one the harness adapter reads at runtime. Without\n  it the adapter could not describe its setup step, so runs died with\n  `ENOENT … not found in app.asar` and Settings reported the harness needed no\n  setup at all. The adapters' bridge assets now ship, and the project's own\n  lockfiles are still excluded."
          },
          {
            "lead": "A harness that could not describe its setup ran anyway, ungated",
            "text": "\"This\n  adapter installs nothing\" and \"this adapter could not say what it installs\"\n  were the same value internally, and the second silently skipped the approval\n  gate, the sandbox network check and the prerequisite check along with it. They\n  are now different states: the run is refused, and Settings says why instead of\n  claiming there is nothing to approve."
          },
          {
            "lead": "The setup panel contradicted itself",
            "text": "It described an install that needed\n  your approval and, immediately below, said no setup was needed. Five different\n  conditions — including a request still in flight and an outright failure —\n  collapsed into that one sentence. Each now reports itself, and a failed request\n  no longer reads as an absence of work."
          },
          {
            "lead": "Removing a workspace left almost everything behind",
            "text": "Only the workspace's\n  own record was deleted; its sessions, memories, search index, checkpoints,\n  work-graph nodes and MCP entries stayed in the database permanently, since a\n  re-added folder is issued a new id and can never reclaim them. Removal now\n  clears all of it in one transaction, after tearing down each session's\n  worktree, services and terminals — which is what the confirmation dialog had\n  been promising all along. Global, non-workspace data is untouched."
          }
        ],
        "markdown": "- **The harness could never complete its one-time setup.** Packaging stripped\n  every `pnpm-lock.yaml` in the tree — a rule meant for the project's own\n  lockfile that also removed one the harness adapter reads at runtime. Without\n  it the adapter could not describe its setup step, so runs died with\n  `ENOENT … not found in app.asar` and Settings reported the harness needed no\n  setup at all. The adapters' bridge assets now ship, and the project's own\n  lockfiles are still excluded.\n- **A harness that could not describe its setup ran anyway, ungated.** \"This\n  adapter installs nothing\" and \"this adapter could not say what it installs\"\n  were the same value internally, and the second silently skipped the approval\n  gate, the sandbox network check and the prerequisite check along with it. They\n  are now different states: the run is refused, and Settings says why instead of\n  claiming there is nothing to approve.\n- **The setup panel contradicted itself.** It described an install that needed\n  your approval and, immediately below, said no setup was needed. Five different\n  conditions — including a request still in flight and an outright failure —\n  collapsed into that one sentence. Each now reports itself, and a failed request\n  no longer reads as an absence of work.\n- **Removing a workspace left almost everything behind.** Only the workspace's\n  own record was deleted; its sessions, memories, search index, checkpoints,\n  work-graph nodes and MCP entries stayed in the database permanently, since a\n  re-added folder is issued a new id and can never reclaim them. Removal now\n  clears all of it in one transaction, after tearing down each session's\n  worktree, services and terminals — which is what the confirmation dialog had\n  been promising all along. Global, non-workspace data is untouched."
      },
      {
        "category": "added",
        "title": "Added",
        "items": [
          {
            "lead": "Workspaces can be removed from the title-bar switcher",
            "text": "Removal existed only\n  in the launcher, which appears when no workspace is open — so once you opened\n  one there was no way to remove any. Each row in the dropdown now has a remove\n  control, with the same confirmation dialog and the same guarantee that your\n  project folder on disk is never touched."
          },
          {
            "lead": "Missing setup prerequisites are named before you approve, not after a run\n  fails",
            "text": "The check also stopped assuming pnpm: it reads whichever tools the\n  adapter's own commands invoke, so an adapter that bootstraps with yarn, bun or\n  corepack is checked just as precisely. Limboo still never substitutes one tool\n  for another — the commands you approve are the commands that run."
          },
          {
            "lead": "Tools installed in a user directory are found again",
            "text": "An app started from a\n  desktop launcher inherits a much smaller `PATH` than a shell, so an installed\n  pnpm, bun or nvm-managed Node could be reported missing. Setup now also looks\n  where those install themselves."
          }
        ],
        "markdown": "- **Workspaces can be removed from the title-bar switcher.** Removal existed only\n  in the launcher, which appears when no workspace is open — so once you opened\n  one there was no way to remove any. Each row in the dropdown now has a remove\n  control, with the same confirmation dialog and the same guarantee that your\n  project folder on disk is never touched.\n- **Missing setup prerequisites are named before you approve, not after a run\n  fails.** The check also stopped assuming pnpm: it reads whichever tools the\n  adapter's own commands invoke, so an adapter that bootstraps with yarn, bun or\n  corepack is checked just as precisely. Limboo still never substitutes one tool\n  for another — the commands you approve are the commands that run.\n- **Tools installed in a user directory are found again.** An app started from a\n  desktop launcher inherits a much smaller `PATH` than a shell, so an installed\n  pnpm, bun or nvm-managed Node could be reported missing. Setup now also looks\n  where those install themselves."
      },
      {
        "category": "changed",
        "title": "Changed",
        "items": [
          {
            "lead": "The title bar shows the workspace name alone",
            "text": "The initials badge in front\n  of it repeated what the name already said. It remains in the launcher and the\n  remove dialog, where a workspace has to be picked out of a set at a glance."
          }
        ],
        "markdown": "- **The title bar shows the workspace name alone.** The initials badge in front\n  of it repeated what the name already said. It remains in the launcher and the\n  remove dialog, where a workspace has to be picked out of a set at a glance."
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
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.19.0",
      "compare": null,
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.19.0",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "Limboo 1.19.0 repairs the agent harness, which could not install itself in any\npackaged build, and gives workspaces a way out of the app.\n\n### Fixed\n\n- **The harness could never complete its one-time setup.** Packaging stripped\n  every `pnpm-lock.yaml` in the tree — a rule meant for the project's own\n  lockfile that also removed one the harness adapter reads at runtime. Without\n  it the adapter could not describe its setup step, so runs died with\n  `ENOENT … not found in app.asar` and Settings reported the harness needed no\n  setup at all. The adapters' bridge assets now ship, and the project's own\n  lockfiles are still excluded.\n- **A harness that could not describe its setup ran anyway, ungated.** \"This\n  adapter installs nothing\" and \"this adapter could not say what it installs\"\n  were the same value internally, and the second silently skipped the approval\n  gate, the sandbox network check and the prerequisite check along with it. They\n  are now different states: the run is refused, and Settings says why instead of\n  claiming there is nothing to approve.\n- **The setup panel contradicted itself.** It described an install that needed\n  your approval and, immediately below, said no setup was needed. Five different\n  conditions — including a request still in flight and an outright failure —\n  collapsed into that one sentence. Each now reports itself, and a failed request\n  no longer reads as an absence of work.\n- **Removing a workspace left almost everything behind.** Only the workspace's\n  own record was deleted; its sessions, memories, search index, checkpoints,\n  work-graph nodes and MCP entries stayed in the database permanently, since a\n  re-added folder is issued a new id and can never reclaim them. Removal now\n  clears all of it in one transaction, after tearing down each session's\n  worktree, services and terminals — which is what the confirmation dialog had\n  been promising all along. Global, non-workspace data is untouched.\n\n### Added\n\n- **Workspaces can be removed from the title-bar switcher.** Removal existed only\n  in the launcher, which appears when no workspace is open — so once you opened\n  one there was no way to remove any. Each row in the dropdown now has a remove\n  control, with the same confirmation dialog and the same guarantee that your\n  project folder on disk is never touched.\n- **Missing setup prerequisites are named before you approve, not after a run\n  fails.** The check also stopped assuming pnpm: it reads whichever tools the\n  adapter's own commands invoke, so an adapter that bootstraps with yarn, bun or\n  corepack is checked just as precisely. Limboo still never substitutes one tool\n  for another — the commands you approve are the commands that run.\n- **Tools installed in a user directory are found again.** An app started from a\n  desktop launcher inherits a much smaller `PATH` than a shell, so an installed\n  pnpm, bun or nvm-managed Node could be reported missing. Setup now also looks\n  where those install themselves.\n\n### Changed\n\n- **The title bar shows the workspace name alone.** The initials badge in front\n  of it repeated what the name already said. It remains in the launcher and the\n  remove dialog, where a workspace has to be picked out of a set at a glance."
  },
  {
    "version": "1.18.2",
    "date": "2026-08-13",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.18.2",
    "commit": null,
    "buildNumber": null,
    "summary": "",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "Agent settings now show the selected harness correctly",
            "text": "Choosing a Cursor\n  Composer model marks Cursor as active and Claude Code as available but not\n  selected, instead of showing Claude Code copy as though it were the running\n  agent. Unknown model ids now display as unknown and stay blocked rather than\n  falling back to Claude labels."
          }
        ],
        "markdown": "- **Agent settings now show the selected harness correctly.** Choosing a Cursor\n  Composer model marks Cursor as active and Claude Code as available but not\n  selected, instead of showing Claude Code copy as though it were the running\n  agent. Unknown model ids now display as unknown and stay blocked rather than\n  falling back to Claude labels."
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
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.18.2",
      "compare": null,
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.18.2",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "### Fixed\n\n- **Agent settings now show the selected harness correctly.** Choosing a Cursor\n  Composer model marks Cursor as active and Claude Code as available but not\n  selected, instead of showing Claude Code copy as though it were the running\n  agent. Unknown model ids now display as unknown and stay blocked rather than\n  falling back to Claude labels."
  },
  {
    "version": "1.18.1",
    "date": "2026-08-13",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.18.1",
    "commit": null,
    "buildNumber": null,
    "summary": "",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "Settings workspace tabs crashed on open",
            "text": "The tab strip rendered the shared\n  Settings icon without importing it, so opening Settings as a workspace document\n  threw `ReferenceError: Settings2 is not defined`. The icon is now wired through\n  the same lucide import as the rest of the tab strip."
          }
        ],
        "markdown": "- **Settings workspace tabs crashed on open.** The tab strip rendered the shared\n  Settings icon without importing it, so opening Settings as a workspace document\n  threw `ReferenceError: Settings2 is not defined`. The icon is now wired through\n  the same lucide import as the rest of the tab strip."
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
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.18.1",
      "compare": null,
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.18.1",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "### Fixed\n\n- **Settings workspace tabs crashed on open.** The tab strip rendered the shared\n  Settings icon without importing it, so opening Settings as a workspace document\n  threw `ReferenceError: Settings2 is not defined`. The icon is now wired through\n  the same lucide import as the rest of the tab strip."
  },
  {
    "version": "1.18.0",
    "date": "2026-08-13",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.18.0",
    "commit": null,
    "buildNumber": null,
    "summary": "Limboo 1.18.0 stabilizes the Cursor fixes from the beta, adds the swappable\nharness layer, opens Settings as a workspace tab, and ships the beta update\nchannel as an opt-in path for future prereleases.",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "Cursor sessions denied every tool call",
            "text": "The hook runner read the event name\n  from a single payload key that the CLI does not always send. With no event name\n  it could not identify what was being asked, so it failed closed — which is the\n  correct posture, but it meant every read, search, shell command and edit was\n  refused, and nothing on screen said why. The event name now travels in the\n  runner's own arguments, where Limboo writes it, with five payload spellings as\n  fallbacks, and a genuine failure now names the missing key in the timeline\n  instead of denying silently."
          },
          {
            "lead": "Four more ways a Cursor run could stall",
            "text": "The permission helper could boot as\n  a GUI process instead of a script and then hang for the full ten-minute hook\n  timeout on every single tool call; nothing timed out while it waited for input;\n  a successful approval could be truncated on its way out and be read as a\n  refusal; and the sandbox denied the helper access to its own communication\n  socket. Each is fixed, and each failure now reports what happened."
          },
          {
            "lead": "\"Prompt me for everything\" meant \"deny everything\"",
            "text": "Tightening the approval\n  policy withdrew the rule that let Cursor read files at all. Because the only way\n  to ask for permission on that path is the hook bridge, a session with hooks\n  unavailable was left unable to read or to ask. Reads and inspection commands\n  now keep their floor regardless of the policy; the permission gate still runs\n  on top of it."
          },
          {
            "lead": "A Cursor session could stream as Claude Code",
            "text": "The model was checked for\n  character shape rather than for which provider serves it, and every Cursor\n  model id passes that check — so a mis-routed model was handed to the Claude\n  integration and ran there, with no error anywhere. Routing now has an explicit\n  \"unknown\" answer, dispatch is exhaustive, and a model nothing claims fails by\n  name instead of quietly running somewhere."
          },
          {
            "lead": "Commit-message generation always used Claude",
            "text": "A Cursor-only user pressing\n  the button started a Claude run and, with Claude not installed, was told to sign\n  in to a product they were not using. It now follows the agent you selected, and\n  the button is no longer disabled for Cursor users."
          },
          {
            "lead": "Searching Settings missed several controls",
            "text": "Some settings were never\n  registered in the search index, so typing their name found nothing. Fixed for\n  the Agent and Runtime categories, with a check that fails the build if it\n  happens again."
          },
          {
            "lead": "Absolute paths inside your project were treated as escapes",
            "text": "Cursor's CLI\n  writes full paths by default, and a full path to a file inside your own worktree\n  was classified as leaving it — so ordinary reads were refused during planning."
          }
        ],
        "markdown": "- **Cursor sessions denied every tool call.** The hook runner read the event name\n  from a single payload key that the CLI does not always send. With no event name\n  it could not identify what was being asked, so it failed closed — which is the\n  correct posture, but it meant every read, search, shell command and edit was\n  refused, and nothing on screen said why. The event name now travels in the\n  runner's own arguments, where Limboo writes it, with five payload spellings as\n  fallbacks, and a genuine failure now names the missing key in the timeline\n  instead of denying silently.\n- **Four more ways a Cursor run could stall.** The permission helper could boot as\n  a GUI process instead of a script and then hang for the full ten-minute hook\n  timeout on every single tool call; nothing timed out while it waited for input;\n  a successful approval could be truncated on its way out and be read as a\n  refusal; and the sandbox denied the helper access to its own communication\n  socket. Each is fixed, and each failure now reports what happened.\n- **\"Prompt me for everything\" meant \"deny everything\".** Tightening the approval\n  policy withdrew the rule that let Cursor read files at all. Because the only way\n  to ask for permission on that path is the hook bridge, a session with hooks\n  unavailable was left unable to read or to ask. Reads and inspection commands\n  now keep their floor regardless of the policy; the permission gate still runs\n  on top of it.\n- **A Cursor session could stream as Claude Code.** The model was checked for\n  character shape rather than for which provider serves it, and every Cursor\n  model id passes that check — so a mis-routed model was handed to the Claude\n  integration and ran there, with no error anywhere. Routing now has an explicit\n  \"unknown\" answer, dispatch is exhaustive, and a model nothing claims fails by\n  name instead of quietly running somewhere.\n- **Commit-message generation always used Claude.** A Cursor-only user pressing\n  the button started a Claude run and, with Claude not installed, was told to sign\n  in to a product they were not using. It now follows the agent you selected, and\n  the button is no longer disabled for Cursor users.\n- **Searching Settings missed several controls.** Some settings were never\n  registered in the search index, so typing their name found nothing. Fixed for\n  the Agent and Runtime categories, with a check that fails the build if it\n  happens again.\n- **Absolute paths inside your project were treated as escapes.** Cursor's CLI\n  writes full paths by default, and a full path to a file inside your own worktree\n  was classified as leaving it — so ordinary reads were refused during planning."
      },
      {
        "category": "added",
        "title": "Added",
        "items": [
          {
            "lead": "Agents can run through a harness layer",
            "text": "Limboo now drives agents through\n  Vercel AI SDK 7's harness abstraction as well as its own integrations, so a new\n  agent runtime becomes an adapter rather than a new code path. Pi is available;\n  Claude Code runs through it behind an opt-in switch. Everything above the\n  adapter — the conversation, permissions, memory, search, the work graph, the\n  runtime panel — is unchanged, because they all sit on one seam."
          },
          {
            "lead": "A sandbox that runs on your own worktree",
            "text": "Every shipped sandbox for that\n  abstraction is either a cloud service or a private filesystem, and neither\n  fits: your repository must not leave the machine, and the agent has to edit the\n  actual files that git, the diff viewer and checkpoints are watching. Limboo has\n  its own, rooted at the session's worktree, with the same containment rules the\n  rest of the app enforces — nothing outside the worktree, and never the app's own\n  database, settings or secrets."
          },
          {
            "lead": "Settings opens as a workspace tab",
            "text": "An icon beside the close button promotes\n  the dialog into an editor tab, the way a diff opens. Both surfaces render the\n  same panels, so nothing drifts. The tab has no Cancel: settings apply as you\n  change them, exactly as they already did."
          },
          {
            "lead": "An update channel you can choose",
            "text": "Settings › Updates now offers Stable or\n  Beta. A beta is never downloaded in the background — you are shown its release\n  notes and decide."
          }
        ],
        "markdown": "- **Agents can run through a harness layer.** Limboo now drives agents through\n  Vercel AI SDK 7's harness abstraction as well as its own integrations, so a new\n  agent runtime becomes an adapter rather than a new code path. Pi is available;\n  Claude Code runs through it behind an opt-in switch. Everything above the\n  adapter — the conversation, permissions, memory, search, the work graph, the\n  runtime panel — is unchanged, because they all sit on one seam.\n- **A sandbox that runs on your own worktree.** Every shipped sandbox for that\n  abstraction is either a cloud service or a private filesystem, and neither\n  fits: your repository must not leave the machine, and the agent has to edit the\n  actual files that git, the diff viewer and checkpoints are watching. Limboo has\n  its own, rooted at the session's worktree, with the same containment rules the\n  rest of the app enforces — nothing outside the worktree, and never the app's own\n  database, settings or secrets.\n- **Settings opens as a workspace tab.** An icon beside the close button promotes\n  the dialog into an editor tab, the way a diff opens. Both surfaces render the\n  same panels, so nothing drifts. The tab has no Cancel: settings apply as you\n  change them, exactly as they already did.\n- **An update channel you can choose.** Settings › Updates now offers Stable or\n  Beta. A beta is never downloaded in the background — you are shown its release\n  notes and decide."
      },
      {
        "category": "changed",
        "title": "Changed",
        "items": [
          {
            "lead": "Settings panels are flat rows",
            "text": "The Agent and MCP categories wrapped groups\n  of settings in bordered panels while every other category used plain labelled\n  rows, which made them look like a different application. The boxes are gone.\n  Every input, button and select now uses one corner radius."
          },
          {
            "lead": "The Agent panel is reorganised",
            "text": "Providers became Harnesses and now reads as\n  one list instead of two hand-built cards. Connection and reliability moved to\n  Runtime, where the rest of the supervision settings live. A section that\n  contained no settings at all was removed, and the remainder is ordered by the\n  decision you are making: which agent, which model, what it may do, what\n  contains it."
          },
          {
            "lead": "The model hint stopped being wrong",
            "text": "It named a default the app had not used\n  for several versions, because the text was typed by hand next to the value it\n  described. It is now derived from that value."
          }
        ],
        "markdown": "- **Settings panels are flat rows.** The Agent and MCP categories wrapped groups\n  of settings in bordered panels while every other category used plain labelled\n  rows, which made them look like a different application. The boxes are gone.\n  Every input, button and select now uses one corner radius.\n- **The Agent panel is reorganised.** Providers became Harnesses and now reads as\n  one list instead of two hand-built cards. Connection and reliability moved to\n  Runtime, where the rest of the supervision settings live. A section that\n  contained no settings at all was removed, and the remainder is ordered by the\n  decision you are making: which agent, which model, what it may do, what\n  contains it.\n- **The model hint stopped being wrong.** It named a default the app had not used\n  for several versions, because the text was typed by hand next to the value it\n  described. It is now derived from that value."
      },
      {
        "category": "security",
        "title": "Security",
        "items": [
          {
            "lead": "Built-in tools on the harness path are gated by Limboo",
            "text": "The harness\n  abstraction has two separate approval surfaces, and the one Limboo had wired\n  covers only tools the host supplies — built-in file writes and shell commands\n  are governed by a different setting that defaults to allowing everything. On\n  that path an agent could have written files and run commands without Limboo's\n  permission gate. Every built-in tool call now suspends the turn and asks, using\n  the same authority, the same risk labels, the same dialogs and the same audit\n  trail as every other agent."
          },
          {
            "lead": "A harness that cannot ask for permission is refused",
            "text": "Rather than run it with\n  weaker enforcement, Limboo declines to start it and says so. This is not\n  theoretical: the Codex adapter reports that it cannot request approval for its\n  shell tool, so it is registered as unavailable with the reason shown rather than\n  offered and then failing."
          },
          {
            "lead": "The harness setup step asks first",
            "text": "Preparing a harness for its first run\n  downloads its agent CLI, which is the only time Limboo reaches the network\n  outside talking to your agent and fetching contributor avatars. The exact\n  commands are read from the adapter and shown to you for approval once, and the\n  approval is tied to those commands — if a later version changes them, you are\n  asked again. Without approval the run does not start."
          },
          {
            "lead": "Credentials are passed through, never stored",
            "text": "A harness receives an API key\n  only if your own environment already has one, from an explicitly named list.\n  Nothing is written to settings, accepted over the app's internal channels, put\n  on a command line, or logged. A gap in log redaction that could have printed\n  those variables is closed."
          },
          {
            "lead": "Reads on the harness path cannot be gated, and the setting says so",
            "text": "The\n  underlying runtime allows built-in file reads unconditionally, so\n  \"auto-approve reads\" has no effect there. Rather than leave a control that looks\n  like it works, the setting explains the limitation."
          }
        ],
        "markdown": "- **Built-in tools on the harness path are gated by Limboo.** The harness\n  abstraction has two separate approval surfaces, and the one Limboo had wired\n  covers only tools the host supplies — built-in file writes and shell commands\n  are governed by a different setting that defaults to allowing everything. On\n  that path an agent could have written files and run commands without Limboo's\n  permission gate. Every built-in tool call now suspends the turn and asks, using\n  the same authority, the same risk labels, the same dialogs and the same audit\n  trail as every other agent.\n- **A harness that cannot ask for permission is refused.** Rather than run it with\n  weaker enforcement, Limboo declines to start it and says so. This is not\n  theoretical: the Codex adapter reports that it cannot request approval for its\n  shell tool, so it is registered as unavailable with the reason shown rather than\n  offered and then failing.\n- **The harness setup step asks first.** Preparing a harness for its first run\n  downloads its agent CLI, which is the only time Limboo reaches the network\n  outside talking to your agent and fetching contributor avatars. The exact\n  commands are read from the adapter and shown to you for approval once, and the\n  approval is tied to those commands — if a later version changes them, you are\n  asked again. Without approval the run does not start.\n- **Credentials are passed through, never stored.** A harness receives an API key\n  only if your own environment already has one, from an explicitly named list.\n  Nothing is written to settings, accepted over the app's internal channels, put\n  on a command line, or logged. A gap in log redaction that could have printed\n  those variables is closed.\n- **Reads on the harness path cannot be gated, and the setting says so.** The\n  underlying runtime allows built-in file reads unconditionally, so\n  \"auto-approve reads\" has no effect there. Rather than leave a control that looks\n  like it works, the setting explains the limitation."
      },
      {
        "category": "known-issues",
        "title": "Known limitations",
        "items": [
          {
            "lead": "The harness path is off by default",
            "text": "Claude Code and Cursor continue to run\n  through their own integrations. Turn the harness on in Settings › Agent ›\n  Harnesses if you want to try it; you will be asked to approve its setup step\n  first."
          },
          {
            "lead": "A harness conversation does not resume",
            "text": "Each message starts a fresh\n  conversation with the underlying runtime. The alternative failed on every second\n  message, so this is deliberate until the resume format is handled properly."
          },
          {
            "lead": "Codex is unavailable",
            "text": "Its adapter cannot ask for permission before running\n  shell commands. It is listed with that reason rather than hidden."
          }
        ],
        "markdown": "- **The harness path is off by default.** Claude Code and Cursor continue to run\n  through their own integrations. Turn the harness on in Settings › Agent ›\n  Harnesses if you want to try it; you will be asked to approve its setup step\n  first.\n- **A harness conversation does not resume.** Each message starts a fresh\n  conversation with the underlying runtime. The alternative failed on every second\n  message, so this is deliberate until the resume format is handled properly.\n- **Codex is unavailable.** Its adapter cannot ask for permission before running\n  shell commands. It is listed with that reason rather than hidden."
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
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.18.0",
      "compare": null,
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.18.0",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "Limboo 1.18.0 stabilizes the Cursor fixes from the beta, adds the swappable\nharness layer, opens Settings as a workspace tab, and ships the beta update\nchannel as an opt-in path for future prereleases.\n\n### Fixed\n\n- **Cursor sessions denied every tool call.** The hook runner read the event name\n  from a single payload key that the CLI does not always send. With no event name\n  it could not identify what was being asked, so it failed closed — which is the\n  correct posture, but it meant every read, search, shell command and edit was\n  refused, and nothing on screen said why. The event name now travels in the\n  runner's own arguments, where Limboo writes it, with five payload spellings as\n  fallbacks, and a genuine failure now names the missing key in the timeline\n  instead of denying silently.\n- **Four more ways a Cursor run could stall.** The permission helper could boot as\n  a GUI process instead of a script and then hang for the full ten-minute hook\n  timeout on every single tool call; nothing timed out while it waited for input;\n  a successful approval could be truncated on its way out and be read as a\n  refusal; and the sandbox denied the helper access to its own communication\n  socket. Each is fixed, and each failure now reports what happened.\n- **\"Prompt me for everything\" meant \"deny everything\".** Tightening the approval\n  policy withdrew the rule that let Cursor read files at all. Because the only way\n  to ask for permission on that path is the hook bridge, a session with hooks\n  unavailable was left unable to read or to ask. Reads and inspection commands\n  now keep their floor regardless of the policy; the permission gate still runs\n  on top of it.\n- **A Cursor session could stream as Claude Code.** The model was checked for\n  character shape rather than for which provider serves it, and every Cursor\n  model id passes that check — so a mis-routed model was handed to the Claude\n  integration and ran there, with no error anywhere. Routing now has an explicit\n  \"unknown\" answer, dispatch is exhaustive, and a model nothing claims fails by\n  name instead of quietly running somewhere.\n- **Commit-message generation always used Claude.** A Cursor-only user pressing\n  the button started a Claude run and, with Claude not installed, was told to sign\n  in to a product they were not using. It now follows the agent you selected, and\n  the button is no longer disabled for Cursor users.\n- **Searching Settings missed several controls.** Some settings were never\n  registered in the search index, so typing their name found nothing. Fixed for\n  the Agent and Runtime categories, with a check that fails the build if it\n  happens again.\n- **Absolute paths inside your project were treated as escapes.** Cursor's CLI\n  writes full paths by default, and a full path to a file inside your own worktree\n  was classified as leaving it — so ordinary reads were refused during planning.\n\n### Added\n\n- **Agents can run through a harness layer.** Limboo now drives agents through\n  Vercel AI SDK 7's harness abstraction as well as its own integrations, so a new\n  agent runtime becomes an adapter rather than a new code path. Pi is available;\n  Claude Code runs through it behind an opt-in switch. Everything above the\n  adapter — the conversation, permissions, memory, search, the work graph, the\n  runtime panel — is unchanged, because they all sit on one seam.\n- **A sandbox that runs on your own worktree.** Every shipped sandbox for that\n  abstraction is either a cloud service or a private filesystem, and neither\n  fits: your repository must not leave the machine, and the agent has to edit the\n  actual files that git, the diff viewer and checkpoints are watching. Limboo has\n  its own, rooted at the session's worktree, with the same containment rules the\n  rest of the app enforces — nothing outside the worktree, and never the app's own\n  database, settings or secrets.\n- **Settings opens as a workspace tab.** An icon beside the close button promotes\n  the dialog into an editor tab, the way a diff opens. Both surfaces render the\n  same panels, so nothing drifts. The tab has no Cancel: settings apply as you\n  change them, exactly as they already did.\n- **An update channel you can choose.** Settings › Updates now offers Stable or\n  Beta. A beta is never downloaded in the background — you are shown its release\n  notes and decide.\n\n### Changed\n\n- **Settings panels are flat rows.** The Agent and MCP categories wrapped groups\n  of settings in bordered panels while every other category used plain labelled\n  rows, which made them look like a different application. The boxes are gone.\n  Every input, button and select now uses one corner radius.\n- **The Agent panel is reorganised.** Providers became Harnesses and now reads as\n  one list instead of two hand-built cards. Connection and reliability moved to\n  Runtime, where the rest of the supervision settings live. A section that\n  contained no settings at all was removed, and the remainder is ordered by the\n  decision you are making: which agent, which model, what it may do, what\n  contains it.\n- **The model hint stopped being wrong.** It named a default the app had not used\n  for several versions, because the text was typed by hand next to the value it\n  described. It is now derived from that value.\n\n### Security\n\n- **Built-in tools on the harness path are gated by Limboo.** The harness\n  abstraction has two separate approval surfaces, and the one Limboo had wired\n  covers only tools the host supplies — built-in file writes and shell commands\n  are governed by a different setting that defaults to allowing everything. On\n  that path an agent could have written files and run commands without Limboo's\n  permission gate. Every built-in tool call now suspends the turn and asks, using\n  the same authority, the same risk labels, the same dialogs and the same audit\n  trail as every other agent.\n- **A harness that cannot ask for permission is refused.** Rather than run it with\n  weaker enforcement, Limboo declines to start it and says so. This is not\n  theoretical: the Codex adapter reports that it cannot request approval for its\n  shell tool, so it is registered as unavailable with the reason shown rather than\n  offered and then failing.\n- **The harness setup step asks first.** Preparing a harness for its first run\n  downloads its agent CLI, which is the only time Limboo reaches the network\n  outside talking to your agent and fetching contributor avatars. The exact\n  commands are read from the adapter and shown to you for approval once, and the\n  approval is tied to those commands — if a later version changes them, you are\n  asked again. Without approval the run does not start.\n- **Credentials are passed through, never stored.** A harness receives an API key\n  only if your own environment already has one, from an explicitly named list.\n  Nothing is written to settings, accepted over the app's internal channels, put\n  on a command line, or logged. A gap in log redaction that could have printed\n  those variables is closed.\n- **Reads on the harness path cannot be gated, and the setting says so.** The\n  underlying runtime allows built-in file reads unconditionally, so\n  \"auto-approve reads\" has no effect there. Rather than leave a control that looks\n  like it works, the setting explains the limitation.\n\n### Known limitations\n\n- **The harness path is off by default.** Claude Code and Cursor continue to run\n  through their own integrations. Turn the harness on in Settings › Agent ›\n  Harnesses if you want to try it; you will be asked to approve its setup step\n  first.\n- **A harness conversation does not resume.** Each message starts a fresh\n  conversation with the underlying runtime. The alternative failed on every second\n  message, so this is deliberate until the resume format is handled properly.\n- **Codex is unavailable.** Its adapter cannot ask for permission before running\n  shell commands. It is listed with that reason rather than hidden."
  },
  {
    "version": "1.18.0-beta.2",
    "date": "2026-08-12",
    "channel": "beta",
    "codename": null,
    "gitTag": "v1.18.0-beta.2",
    "commit": null,
    "buildNumber": null,
    "summary": "The first beta. Two bugs that made Cursor sessions unusable are fixed, agents can\nnow run through a swappable harness layer instead of one hardcoded integration,\nand Settings opens as a workspace tab. This build is published for testing ahead\nof a stable release — read the warning at the top of these notes before\ninstalling it over a working copy.",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "Cursor sessions denied every tool call",
            "text": "The hook runner read the event name\n  from a single payload key that the CLI does not always send. With no event name\n  it could not identify what was being asked, so it failed closed — which is the\n  correct posture, but it meant every read, search, shell command and edit was\n  refused, and nothing on screen said why. The event name now travels in the\n  runner's own arguments, where Limboo writes it, with five payload spellings as\n  fallbacks, and a genuine failure now names the missing key in the timeline\n  instead of denying silently."
          },
          {
            "lead": "Four more ways a Cursor run could stall",
            "text": "The permission helper could boot as\n  a GUI process instead of a script and then hang for the full ten-minute hook\n  timeout on every single tool call; nothing timed out while it waited for input;\n  a successful approval could be truncated on its way out and be read as a\n  refusal; and the sandbox denied the helper access to its own communication\n  socket. Each is fixed, and each failure now reports what happened."
          },
          {
            "lead": "\"Prompt me for everything\" meant \"deny everything\"",
            "text": "Tightening the approval\n  policy withdrew the rule that let Cursor read files at all. Because the only way\n  to ask for permission on that path is the hook bridge, a session with hooks\n  unavailable was left unable to read or to ask. Reads and inspection commands\n  now keep their floor regardless of the policy; the permission gate still runs\n  on top of it."
          },
          {
            "lead": "A Cursor session could stream as Claude Code",
            "text": "The model was checked for\n  character shape rather than for which provider serves it, and every Cursor\n  model id passes that check — so a mis-routed model was handed to the Claude\n  integration and ran there, with no error anywhere. Routing now has an explicit\n  \"unknown\" answer, dispatch is exhaustive, and a model nothing claims fails by\n  name instead of quietly running somewhere."
          },
          {
            "lead": "Commit-message generation always used Claude",
            "text": "A Cursor-only user pressing\n  the button started a Claude run and, with Claude not installed, was told to sign\n  in to a product they were not using. It now follows the agent you selected, and\n  the button is no longer disabled for Cursor users."
          },
          {
            "lead": "Searching Settings missed several controls",
            "text": "Some settings were never\n  registered in the search index, so typing their name found nothing. Fixed for\n  the Agent and Runtime categories, with a check that fails the build if it\n  happens again."
          },
          {
            "lead": "Absolute paths inside your project were treated as escapes",
            "text": "Cursor's CLI\n  writes full paths by default, and a full path to a file inside your own worktree\n  was classified as leaving it — so ordinary reads were refused during planning."
          }
        ],
        "markdown": "- **Cursor sessions denied every tool call.** The hook runner read the event name\n  from a single payload key that the CLI does not always send. With no event name\n  it could not identify what was being asked, so it failed closed — which is the\n  correct posture, but it meant every read, search, shell command and edit was\n  refused, and nothing on screen said why. The event name now travels in the\n  runner's own arguments, where Limboo writes it, with five payload spellings as\n  fallbacks, and a genuine failure now names the missing key in the timeline\n  instead of denying silently.\n- **Four more ways a Cursor run could stall.** The permission helper could boot as\n  a GUI process instead of a script and then hang for the full ten-minute hook\n  timeout on every single tool call; nothing timed out while it waited for input;\n  a successful approval could be truncated on its way out and be read as a\n  refusal; and the sandbox denied the helper access to its own communication\n  socket. Each is fixed, and each failure now reports what happened.\n- **\"Prompt me for everything\" meant \"deny everything\".** Tightening the approval\n  policy withdrew the rule that let Cursor read files at all. Because the only way\n  to ask for permission on that path is the hook bridge, a session with hooks\n  unavailable was left unable to read or to ask. Reads and inspection commands\n  now keep their floor regardless of the policy; the permission gate still runs\n  on top of it.\n- **A Cursor session could stream as Claude Code.** The model was checked for\n  character shape rather than for which provider serves it, and every Cursor\n  model id passes that check — so a mis-routed model was handed to the Claude\n  integration and ran there, with no error anywhere. Routing now has an explicit\n  \"unknown\" answer, dispatch is exhaustive, and a model nothing claims fails by\n  name instead of quietly running somewhere.\n- **Commit-message generation always used Claude.** A Cursor-only user pressing\n  the button started a Claude run and, with Claude not installed, was told to sign\n  in to a product they were not using. It now follows the agent you selected, and\n  the button is no longer disabled for Cursor users.\n- **Searching Settings missed several controls.** Some settings were never\n  registered in the search index, so typing their name found nothing. Fixed for\n  the Agent and Runtime categories, with a check that fails the build if it\n  happens again.\n- **Absolute paths inside your project were treated as escapes.** Cursor's CLI\n  writes full paths by default, and a full path to a file inside your own worktree\n  was classified as leaving it — so ordinary reads were refused during planning."
      },
      {
        "category": "added",
        "title": "Added",
        "items": [
          {
            "lead": "Agents can run through a harness layer",
            "text": "Limboo now drives agents through\n  Vercel AI SDK 7's harness abstraction as well as its own integrations, so a new\n  agent runtime becomes an adapter rather than a new code path. Pi is available;\n  Claude Code runs through it behind an opt-in switch. Everything above the\n  adapter — the conversation, permissions, memory, search, the work graph, the\n  runtime panel — is unchanged, because they all sit on one seam."
          },
          {
            "lead": "A sandbox that runs on your own worktree",
            "text": "Every shipped sandbox for that\n  abstraction is either a cloud service or a private filesystem, and neither\n  fits: your repository must not leave the machine, and the agent has to edit the\n  actual files that git, the diff viewer and checkpoints are watching. Limboo has\n  its own, rooted at the session's worktree, with the same containment rules the\n  rest of the app enforces — nothing outside the worktree, and never the app's own\n  database, settings or secrets."
          },
          {
            "lead": "Settings opens as a workspace tab",
            "text": "An icon beside the close button promotes\n  the dialog into an editor tab, the way a diff opens. Both surfaces render the\n  same panels, so nothing drifts. The tab has no Cancel: settings apply as you\n  change them, exactly as they already did."
          },
          {
            "lead": "An update channel you can choose",
            "text": "Settings › Updates now offers Stable or\n  Beta. A beta is never downloaded in the background — you are shown its release\n  notes and decide."
          }
        ],
        "markdown": "- **Agents can run through a harness layer.** Limboo now drives agents through\n  Vercel AI SDK 7's harness abstraction as well as its own integrations, so a new\n  agent runtime becomes an adapter rather than a new code path. Pi is available;\n  Claude Code runs through it behind an opt-in switch. Everything above the\n  adapter — the conversation, permissions, memory, search, the work graph, the\n  runtime panel — is unchanged, because they all sit on one seam.\n- **A sandbox that runs on your own worktree.** Every shipped sandbox for that\n  abstraction is either a cloud service or a private filesystem, and neither\n  fits: your repository must not leave the machine, and the agent has to edit the\n  actual files that git, the diff viewer and checkpoints are watching. Limboo has\n  its own, rooted at the session's worktree, with the same containment rules the\n  rest of the app enforces — nothing outside the worktree, and never the app's own\n  database, settings or secrets.\n- **Settings opens as a workspace tab.** An icon beside the close button promotes\n  the dialog into an editor tab, the way a diff opens. Both surfaces render the\n  same panels, so nothing drifts. The tab has no Cancel: settings apply as you\n  change them, exactly as they already did.\n- **An update channel you can choose.** Settings › Updates now offers Stable or\n  Beta. A beta is never downloaded in the background — you are shown its release\n  notes and decide."
      },
      {
        "category": "changed",
        "title": "Changed",
        "items": [
          {
            "lead": "Settings panels are flat rows",
            "text": "The Agent and MCP categories wrapped groups\n  of settings in bordered panels while every other category used plain labelled\n  rows, which made them look like a different application. The boxes are gone.\n  Every input, button and select now uses one corner radius."
          },
          {
            "lead": "The Agent panel is reorganised",
            "text": "Providers became Harnesses and now reads as\n  one list instead of two hand-built cards. Connection and reliability moved to\n  Runtime, where the rest of the supervision settings live. A section that\n  contained no settings at all was removed, and the remainder is ordered by the\n  decision you are making: which agent, which model, what it may do, what\n  contains it."
          },
          {
            "lead": "The model hint stopped being wrong",
            "text": "It named a default the app had not used\n  for several versions, because the text was typed by hand next to the value it\n  described. It is now derived from that value."
          }
        ],
        "markdown": "- **Settings panels are flat rows.** The Agent and MCP categories wrapped groups\n  of settings in bordered panels while every other category used plain labelled\n  rows, which made them look like a different application. The boxes are gone.\n  Every input, button and select now uses one corner radius.\n- **The Agent panel is reorganised.** Providers became Harnesses and now reads as\n  one list instead of two hand-built cards. Connection and reliability moved to\n  Runtime, where the rest of the supervision settings live. A section that\n  contained no settings at all was removed, and the remainder is ordered by the\n  decision you are making: which agent, which model, what it may do, what\n  contains it.\n- **The model hint stopped being wrong.** It named a default the app had not used\n  for several versions, because the text was typed by hand next to the value it\n  described. It is now derived from that value."
      },
      {
        "category": "security",
        "title": "Security",
        "items": [
          {
            "lead": "Built-in tools on the harness path are gated by Limboo",
            "text": "The harness\n  abstraction has two separate approval surfaces, and the one Limboo had wired\n  covers only tools the host supplies — built-in file writes and shell commands\n  are governed by a different setting that defaults to allowing everything. On\n  that path an agent could have written files and run commands without Limboo's\n  permission gate. Every built-in tool call now suspends the turn and asks, using\n  the same authority, the same risk labels, the same dialogs and the same audit\n  trail as every other agent."
          },
          {
            "lead": "A harness that cannot ask for permission is refused",
            "text": "Rather than run it with\n  weaker enforcement, Limboo declines to start it and says so. This is not\n  theoretical: the Codex adapter reports that it cannot request approval for its\n  shell tool, so it is registered as unavailable with the reason shown rather than\n  offered and then failing."
          },
          {
            "lead": "The harness setup step asks first",
            "text": "Preparing a harness for its first run\n  downloads its agent CLI, which is the only time Limboo reaches the network\n  outside talking to your agent and fetching contributor avatars. The exact\n  commands are read from the adapter and shown to you for approval once, and the\n  approval is tied to those commands — if a later version changes them, you are\n  asked again. Without approval the run does not start."
          },
          {
            "lead": "Credentials are passed through, never stored",
            "text": "A harness receives an API key\n  only if your own environment already has one, from an explicitly named list.\n  Nothing is written to settings, accepted over the app's internal channels, put\n  on a command line, or logged. A gap in log redaction that could have printed\n  those variables is closed."
          },
          {
            "lead": "Reads on the harness path cannot be gated, and the setting says so",
            "text": "The\n  underlying runtime allows built-in file reads unconditionally, so\n  \"auto-approve reads\" has no effect there. Rather than leave a control that looks\n  like it works, the setting explains the limitation."
          }
        ],
        "markdown": "- **Built-in tools on the harness path are gated by Limboo.** The harness\n  abstraction has two separate approval surfaces, and the one Limboo had wired\n  covers only tools the host supplies — built-in file writes and shell commands\n  are governed by a different setting that defaults to allowing everything. On\n  that path an agent could have written files and run commands without Limboo's\n  permission gate. Every built-in tool call now suspends the turn and asks, using\n  the same authority, the same risk labels, the same dialogs and the same audit\n  trail as every other agent.\n- **A harness that cannot ask for permission is refused.** Rather than run it with\n  weaker enforcement, Limboo declines to start it and says so. This is not\n  theoretical: the Codex adapter reports that it cannot request approval for its\n  shell tool, so it is registered as unavailable with the reason shown rather than\n  offered and then failing.\n- **The harness setup step asks first.** Preparing a harness for its first run\n  downloads its agent CLI, which is the only time Limboo reaches the network\n  outside talking to your agent and fetching contributor avatars. The exact\n  commands are read from the adapter and shown to you for approval once, and the\n  approval is tied to those commands — if a later version changes them, you are\n  asked again. Without approval the run does not start.\n- **Credentials are passed through, never stored.** A harness receives an API key\n  only if your own environment already has one, from an explicitly named list.\n  Nothing is written to settings, accepted over the app's internal channels, put\n  on a command line, or logged. A gap in log redaction that could have printed\n  those variables is closed.\n- **Reads on the harness path cannot be gated, and the setting says so.** The\n  underlying runtime allows built-in file reads unconditionally, so\n  \"auto-approve reads\" has no effect there. Rather than leave a control that looks\n  like it works, the setting explains the limitation."
      },
      {
        "category": "known-issues",
        "title": "Known limitations",
        "items": [
          {
            "lead": "Beta builds are not released builds",
            "text": "Features may change or be removed\n  before release. Settings and session data move forward but not back, so a build\n  made after this one may not read data this one wrote. Keep a stable install for\n  work you cannot repeat."
          },
          {
            "lead": "The harness path is off by default",
            "text": "Claude Code and Cursor continue to run\n  through their own integrations. Turn the harness on in Settings › Agent ›\n  Harnesses if you want to try it; you will be asked to approve its setup step\n  first."
          },
          {
            "lead": "A harness conversation does not resume",
            "text": "Each message starts a fresh\n  conversation with the underlying runtime. The alternative failed on every second\n  message, so this is deliberate until the resume format is handled properly."
          },
          {
            "lead": "Codex is unavailable",
            "text": "Its adapter cannot ask for permission before running\n  shell commands. It is listed with that reason rather than hidden."
          }
        ],
        "markdown": "- **Beta builds are not released builds.** Features may change or be removed\n  before release. Settings and session data move forward but not back, so a build\n  made after this one may not read data this one wrote. Keep a stable install for\n  work you cannot repeat.\n- **The harness path is off by default.** Claude Code and Cursor continue to run\n  through their own integrations. Turn the harness on in Settings › Agent ›\n  Harnesses if you want to try it; you will be asked to approve its setup step\n  first.\n- **A harness conversation does not resume.** Each message starts a fresh\n  conversation with the underlying runtime. The alternative failed on every second\n  message, so this is deliberate until the resume format is handled properly.\n- **Codex is unavailable.** Its adapter cannot ask for permission before running\n  shell commands. It is listed with that reason rather than hidden."
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
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.18.0-beta.2",
      "compare": null,
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.18.0-beta.2",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "The first beta. Two bugs that made Cursor sessions unusable are fixed, agents can\nnow run through a swappable harness layer instead of one hardcoded integration,\nand Settings opens as a workspace tab. This build is published for testing ahead\nof a stable release — read the warning at the top of these notes before\ninstalling it over a working copy.\n\n### Fixed\n\n- **Cursor sessions denied every tool call.** The hook runner read the event name\n  from a single payload key that the CLI does not always send. With no event name\n  it could not identify what was being asked, so it failed closed — which is the\n  correct posture, but it meant every read, search, shell command and edit was\n  refused, and nothing on screen said why. The event name now travels in the\n  runner's own arguments, where Limboo writes it, with five payload spellings as\n  fallbacks, and a genuine failure now names the missing key in the timeline\n  instead of denying silently.\n- **Four more ways a Cursor run could stall.** The permission helper could boot as\n  a GUI process instead of a script and then hang for the full ten-minute hook\n  timeout on every single tool call; nothing timed out while it waited for input;\n  a successful approval could be truncated on its way out and be read as a\n  refusal; and the sandbox denied the helper access to its own communication\n  socket. Each is fixed, and each failure now reports what happened.\n- **\"Prompt me for everything\" meant \"deny everything\".** Tightening the approval\n  policy withdrew the rule that let Cursor read files at all. Because the only way\n  to ask for permission on that path is the hook bridge, a session with hooks\n  unavailable was left unable to read or to ask. Reads and inspection commands\n  now keep their floor regardless of the policy; the permission gate still runs\n  on top of it.\n- **A Cursor session could stream as Claude Code.** The model was checked for\n  character shape rather than for which provider serves it, and every Cursor\n  model id passes that check — so a mis-routed model was handed to the Claude\n  integration and ran there, with no error anywhere. Routing now has an explicit\n  \"unknown\" answer, dispatch is exhaustive, and a model nothing claims fails by\n  name instead of quietly running somewhere.\n- **Commit-message generation always used Claude.** A Cursor-only user pressing\n  the button started a Claude run and, with Claude not installed, was told to sign\n  in to a product they were not using. It now follows the agent you selected, and\n  the button is no longer disabled for Cursor users.\n- **Searching Settings missed several controls.** Some settings were never\n  registered in the search index, so typing their name found nothing. Fixed for\n  the Agent and Runtime categories, with a check that fails the build if it\n  happens again.\n- **Absolute paths inside your project were treated as escapes.** Cursor's CLI\n  writes full paths by default, and a full path to a file inside your own worktree\n  was classified as leaving it — so ordinary reads were refused during planning.\n\n### Added\n\n- **Agents can run through a harness layer.** Limboo now drives agents through\n  Vercel AI SDK 7's harness abstraction as well as its own integrations, so a new\n  agent runtime becomes an adapter rather than a new code path. Pi is available;\n  Claude Code runs through it behind an opt-in switch. Everything above the\n  adapter — the conversation, permissions, memory, search, the work graph, the\n  runtime panel — is unchanged, because they all sit on one seam.\n- **A sandbox that runs on your own worktree.** Every shipped sandbox for that\n  abstraction is either a cloud service or a private filesystem, and neither\n  fits: your repository must not leave the machine, and the agent has to edit the\n  actual files that git, the diff viewer and checkpoints are watching. Limboo has\n  its own, rooted at the session's worktree, with the same containment rules the\n  rest of the app enforces — nothing outside the worktree, and never the app's own\n  database, settings or secrets.\n- **Settings opens as a workspace tab.** An icon beside the close button promotes\n  the dialog into an editor tab, the way a diff opens. Both surfaces render the\n  same panels, so nothing drifts. The tab has no Cancel: settings apply as you\n  change them, exactly as they already did.\n- **An update channel you can choose.** Settings › Updates now offers Stable or\n  Beta. A beta is never downloaded in the background — you are shown its release\n  notes and decide.\n\n### Changed\n\n- **Settings panels are flat rows.** The Agent and MCP categories wrapped groups\n  of settings in bordered panels while every other category used plain labelled\n  rows, which made them look like a different application. The boxes are gone.\n  Every input, button and select now uses one corner radius.\n- **The Agent panel is reorganised.** Providers became Harnesses and now reads as\n  one list instead of two hand-built cards. Connection and reliability moved to\n  Runtime, where the rest of the supervision settings live. A section that\n  contained no settings at all was removed, and the remainder is ordered by the\n  decision you are making: which agent, which model, what it may do, what\n  contains it.\n- **The model hint stopped being wrong.** It named a default the app had not used\n  for several versions, because the text was typed by hand next to the value it\n  described. It is now derived from that value.\n\n### Security\n\n- **Built-in tools on the harness path are gated by Limboo.** The harness\n  abstraction has two separate approval surfaces, and the one Limboo had wired\n  covers only tools the host supplies — built-in file writes and shell commands\n  are governed by a different setting that defaults to allowing everything. On\n  that path an agent could have written files and run commands without Limboo's\n  permission gate. Every built-in tool call now suspends the turn and asks, using\n  the same authority, the same risk labels, the same dialogs and the same audit\n  trail as every other agent.\n- **A harness that cannot ask for permission is refused.** Rather than run it with\n  weaker enforcement, Limboo declines to start it and says so. This is not\n  theoretical: the Codex adapter reports that it cannot request approval for its\n  shell tool, so it is registered as unavailable with the reason shown rather than\n  offered and then failing.\n- **The harness setup step asks first.** Preparing a harness for its first run\n  downloads its agent CLI, which is the only time Limboo reaches the network\n  outside talking to your agent and fetching contributor avatars. The exact\n  commands are read from the adapter and shown to you for approval once, and the\n  approval is tied to those commands — if a later version changes them, you are\n  asked again. Without approval the run does not start.\n- **Credentials are passed through, never stored.** A harness receives an API key\n  only if your own environment already has one, from an explicitly named list.\n  Nothing is written to settings, accepted over the app's internal channels, put\n  on a command line, or logged. A gap in log redaction that could have printed\n  those variables is closed.\n- **Reads on the harness path cannot be gated, and the setting says so.** The\n  underlying runtime allows built-in file reads unconditionally, so\n  \"auto-approve reads\" has no effect there. Rather than leave a control that looks\n  like it works, the setting explains the limitation.\n\n### Known limitations\n\n- **Beta builds are not released builds.** Features may change or be removed\n  before release. Settings and session data move forward but not back, so a build\n  made after this one may not read data this one wrote. Keep a stable install for\n  work you cannot repeat.\n- **The harness path is off by default.** Claude Code and Cursor continue to run\n  through their own integrations. Turn the harness on in Settings › Agent ›\n  Harnesses if you want to try it; you will be asked to approve its setup step\n  first.\n- **A harness conversation does not resume.** Each message starts a fresh\n  conversation with the underlying runtime. The alternative failed on every second\n  message, so this is deliberate until the resume format is handled properly.\n- **Codex is unavailable.** Its adapter cannot ask for permission before running\n  shell commands. It is listed with that reason rather than hidden."
  }
];

/** Every released version, newest first. */
export const RELEASE_INDEX: ReleaseIndexEntry[] = [
  {
    "version": "1.19.0",
    "date": "2026-08-30",
    "channel": "stable",
    "summary": "Limboo 1.19.0 repairs the agent harness, which could not install itself in any\npackaged build, and gives workspaces a way out of the app.",
    "detailed": true
  },
  {
    "version": "1.18.2",
    "date": "2026-08-13",
    "channel": "stable",
    "summary": "",
    "detailed": true
  },
  {
    "version": "1.18.1",
    "date": "2026-08-13",
    "channel": "stable",
    "summary": "",
    "detailed": true
  },
  {
    "version": "1.18.0",
    "date": "2026-08-13",
    "channel": "stable",
    "summary": "Limboo 1.18.0 stabilizes the Cursor fixes from the beta, adds the swappable\nharness layer, opens Settings as a workspace tab, and ships the beta update\nchannel as an opt-in path for future prereleases.",
    "detailed": true
  },
  {
    "version": "1.18.0-beta.2",
    "date": "2026-08-12",
    "channel": "beta",
    "summary": "The first beta. Two bugs that made Cursor sessions unusable are fixed, agents can\nnow run through a swappable harness layer instead of one hardcoded integration,\nand Settings opens as a workspace tab. This build is published for testing ahead\nof a stable release — read the warning at the top of these notes before\ninstalling it over a working copy.",
    "detailed": true
  },
  {
    "version": "1.17.0",
    "date": "2026-08-01",
    "channel": "stable",
    "summary": "Plan Mode now stops. A plan waits for your decision instead of sliding into\nimplementation, and the plan you are shown is the plan the agent actually wrote —\nwhich, until this release, it very often was not. Git also becomes a platform\nservice in its own right, so repository work reads as part of the conversation\nrather than something that happened in a side panel.",
    "detailed": false
  },
  {
    "version": "1.16.0",
    "date": "2026-07-30",
    "channel": "stable",
    "summary": "A tighter follow-up to the runtime ring. The panel it opens now answers one\nquestion instead of four, and the conversation beneath it reads as one reply\nagain rather than a stack of cards.",
    "detailed": false
  },
  {
    "version": "1.15.0",
    "date": "2026-07-29",
    "channel": "stable",
    "summary": "You can now see what a long session is actually costing you. A small ring beside\nthe composer status fills as the conversation consumes the model's context\nwindow, and hovering it opens a live breakdown of where that context went —\nwhich is the difference between noticing you are running out and finding out\nwhen the agent starts forgetting.",
    "detailed": false
  },
  {
    "version": "1.14.0",
    "date": "2026-07-29",
    "channel": "stable",
    "summary": "When the agent hands work to a specialist, you can finally watch it happen.\nDelegated work used to arrive as an anonymous pile of tool calls mixed into the\nmain reply; it now reads as one line you can open, follow live, and take apart\nafterwards — without ever leaving the conversation.",
    "detailed": false
  },
  {
    "version": "1.13.2",
    "date": "2026-07-28",
    "channel": "stable",
    "summary": "A plan you left waiting can be approved again.",
    "detailed": false
  },
  {
    "version": "1.13.1",
    "date": "2026-07-28",
    "channel": "stable",
    "summary": "Stopping the agent mid-task no longer breaks your next message.",
    "detailed": false
  },
  {
    "version": "1.13.0",
    "date": "2026-07-28",
    "channel": "stable",
    "summary": "The conversation stops being something you only read. Every message now carries\nits own actions on hover, and any turn can be rolled back — the workspace returns\nto how it was before the agent touched it, including deleting files it created,\nwith the rollback recorded rather than hidden. Plan Mode also stops saying the\nsame thing three times.",
    "detailed": false
  },
  {
    "version": "1.12.0",
    "date": "2026-07-27",
    "channel": "stable",
    "summary": "Sessions run in a git worktree, and Limboo puts that worktree inside its own\napplication data folder. A safety rule meant to keep the agent out of Limboo's\ndatabase read the whole folder as off limits — so in a worktree session the\nagent was refused the moment it tried to write its first file, in what was\nactually its own working directory. Approving a plan could fail for a reason\nthat was never true, and leave the session unable to try again. The plan card\nalso stops appearing before there is a plan to read.",
    "detailed": false
  },
  {
    "version": "1.11.0",
    "date": "2026-07-27",
    "channel": "stable",
    "summary": "1.10.0 set out to stop Plan and Ask blocking the MCP servers you had connected.\nIt gave every server a **Plan & Ask access** setting and then defaulted it to\n\"only the tools this server declares read-only\" — but declaring that is optional,\nand most servers declare nothing. So most servers stayed blocked, and the refusal\nsent you to a control buried inside a per-server edit form that search could not\nfind. An un-annotated tool now asks you, in the run, with a button. Opening the\nTasks drawer also stopped crashing, and a finished plan no longer sits above the\ncomposer forever.",
    "detailed": false
  },
  {
    "version": "1.10.0",
    "date": "2026-07-27",
    "channel": "stable",
    "summary": "Plan and Ask are read-only modes, and they enforced that by refusing anything\nthey could not prove safe. Because nothing could prove a third-party tool safe,\nboth modes blocked every MCP server you had connected — and the agent's own\nresearch subagents — in every project, with no prompt and no way to allow them.\nRead-only now means read-only rather than unusable. The plan itself also leaves\nthe side drawer and appears in the conversation, where the work is.",
    "detailed": false
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
