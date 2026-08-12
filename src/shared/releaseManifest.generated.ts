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
  },
  {
    "version": "1.17.0",
    "date": "2026-08-01",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.17.0",
    "commit": null,
    "buildNumber": null,
    "summary": "Plan Mode now stops. A plan waits for your decision instead of sliding into\nimplementation, and the plan you are shown is the plan the agent actually wrote —\nwhich, until this release, it very often was not. Git also becomes a platform\nservice in its own right, so repository work reads as part of the conversation\nrather than something that happened in a side panel.",
    "sections": [
      {
        "category": "added",
        "title": "Added",
        "items": [
          {
            "lead": "Plan approval is a real stop, not a prompt",
            "text": "When the agent presents a plan,\n  execution halts: no further model calls, no new prompts, no background work,\n  and every tool is refused until you decide. Approving continues the same turn\n  rather than starting a new one, so the agent keeps everything it had learned\n  while planning. Approve, Approve & accept edits, Keep planning, Reject and\n  Archive are the only things that move it forward."
          },
          {
            "lead": "Keep planning now sends feedback",
            "text": "Instead of discarding the plan and\n  starting over, it hands your notes to the agent, which revises and presents\n  again — same conversation, same context."
          },
          {
            "lead": "Plans are versioned",
            "text": "A session has one plan; refinements replace it and the\n  previous text moves into History. Two windows on the same session can no longer\n  approve different plans, and a plan that changed while you were reading it says\n  so rather than acting on the stale copy."
          },
          {
            "lead": "A pending plan survives a restart",
            "text": "Quit with a plan awaiting approval and it\n  is still there on relaunch, with its buttons live and implementation still\n  locked. Approving after a restart starts a fresh run carrying the plan text,\n  because the paused conversation cannot outlive the process."
          },
          {
            "lead": "Git is a platform service",
            "text": "Repository actions post structured entries into\n  the conversation carrying the paths, commit and checkpoint behind them, with\n  Open Diff, View Commit, Restore Checkpoint and Copy Command on each."
          },
          {
            "lead": "Optional GitHub CLI integration",
            "text": "If `gh` is installed and signed in, a\n  GitHub sub-tab lists pull requests and issues, and the agent can read them\n  through the tools it already has. Limboo stores no GitHub credential —\n  authentication stays the CLI's. Posting a comment is gated and shows the exact\n  body first."
          },
          {
            "lead": "Contributor avatars in history",
            "text": ", fetched in the main process and embedded so\n  no page ever requests a remote image. Behind `git.avatars.enabled`, which is\n  off-limits by default in the sense that turning it on is the thing that tells\n  GitHub which repository you are browsing — the setting says so."
          }
        ],
        "markdown": "- **Plan approval is a real stop, not a prompt.** When the agent presents a plan,\n  execution halts: no further model calls, no new prompts, no background work,\n  and every tool is refused until you decide. Approving continues the same turn\n  rather than starting a new one, so the agent keeps everything it had learned\n  while planning. Approve, Approve & accept edits, Keep planning, Reject and\n  Archive are the only things that move it forward.\n- **Keep planning now sends feedback.** Instead of discarding the plan and\n  starting over, it hands your notes to the agent, which revises and presents\n  again — same conversation, same context.\n- **Plans are versioned.** A session has one plan; refinements replace it and the\n  previous text moves into History. Two windows on the same session can no longer\n  approve different plans, and a plan that changed while you were reading it says\n  so rather than acting on the stale copy.\n- **A pending plan survives a restart.** Quit with a plan awaiting approval and it\n  is still there on relaunch, with its buttons live and implementation still\n  locked. Approving after a restart starts a fresh run carrying the plan text,\n  because the paused conversation cannot outlive the process.\n- **Git is a platform service.** Repository actions post structured entries into\n  the conversation carrying the paths, commit and checkpoint behind them, with\n  Open Diff, View Commit, Restore Checkpoint and Copy Command on each.\n- **Optional GitHub CLI integration.** If `gh` is installed and signed in, a\n  GitHub sub-tab lists pull requests and issues, and the agent can read them\n  through the tools it already has. Limboo stores no GitHub credential —\n  authentication stays the CLI's. Posting a comment is gated and shows the exact\n  body first.\n- **Contributor avatars in history**, fetched in the main process and embedded so\n  no page ever requests a remote image. Behind `git.avatars.enabled`, which is\n  off-limits by default in the sense that turning it on is the thing that tells\n  GitHub which repository you are browsing — the setting says so."
      },
      {
        "category": "changed",
        "title": "Changed",
        "items": [
          {
            "lead": "The integrated terminal is its own column",
            "text": "between the conversation and the\n  drawer, instead of competing for the drawer with Files and Changes."
          },
          {
            "lead": "The Activity and Hooks drawer panels are gone",
            "text": "The Hook Engine, its audit\n  log and every hook setting are untouched — only the two panels and the IPC they\n  were the sole consumers of were removed."
          },
          {
            "lead": "Switching sessions is now an ordered handover",
            "text": "Worktree, file watcher, git\n  status, search index, memory scope, MCP and the agent are rebound in sequence,\n  and a thin ribbon says so while it happens. Switching quickly between sessions\n  cancels the stale work rather than letting it finish over the newer session."
          }
        ],
        "markdown": "- **The integrated terminal is its own column** between the conversation and the\n  drawer, instead of competing for the drawer with Files and Changes.\n- **The Activity and Hooks drawer panels are gone.** The Hook Engine, its audit\n  log and every hook setting are untouched — only the two panels and the IPC they\n  were the sole consumers of were removed.\n- **Switching sessions is now an ordered handover.** Worktree, file watcher, git\n  status, search index, memory scope, MCP and the agent are rebound in sequence,\n  and a thin ribbon says so while it happens. Switching quickly between sessions\n  cancels the stale work rather than letting it finish over the newer session."
      },
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "The plan you approved was usually empty",
            "text": "Current Claude releases write the\n  plan to a file and pass no plan text to the tool Limboo was reading, so almost\n  every captured plan was blank — and because the tool was blocked, no plan file\n  was produced either. Approving then sent an empty plan, the agent re-derived\n  the work from scratch, and the empty plan was filed as completed. Limboo now\n  tells the agent where to write its plan and reads it from there, with the\n  agent's own copy taking over once the plan is approved."
          },
          {
            "lead": "Starting a new plan could silently destroy the one you were reviewing",
            "text": "when\n  plan history was turned off. A pending plan is never discarded without being\n  filed first, and starting a second plan while one awaits approval is refused."
          },
          {
            "lead": "A failed or cancelled planning run reported itself as \"rejected\"",
            "text": ", which is\n  what the app says when a person declines a plan. Those now read as ended, with\n  the reason recorded, so declining and crashing no longer look identical."
          },
          {
            "lead": "An unrelated prompt could mark a stalled plan complete",
            "text": "Only the run that\n  was actually released to implement a plan can finish it."
          },
          {
            "lead": "Live planning progress replayed the previous attempt's steps",
            "text": "after asking\n  for a new plan, because it measured from when the plan first existed rather\n  than when the current attempt started."
          },
          {
            "lead": "Deleting a session left its plan revisions behind",
            "text": "in the database."
          },
          {
            "lead": "A machine without git looked like a folder without a repository",
            "text": ", and the app\n  offered to initialise one — an action that could never succeed. Limboo now\n  detects the missing binary and names the install command for your platform."
          },
          {
            "lead": "Settings could be hand-edited into a dead drawer tab or an unbounded panel\n  width",
            "text": "; both are now validated and clamped on load."
          }
        ],
        "markdown": "- **The plan you approved was usually empty.** Current Claude releases write the\n  plan to a file and pass no plan text to the tool Limboo was reading, so almost\n  every captured plan was blank — and because the tool was blocked, no plan file\n  was produced either. Approving then sent an empty plan, the agent re-derived\n  the work from scratch, and the empty plan was filed as completed. Limboo now\n  tells the agent where to write its plan and reads it from there, with the\n  agent's own copy taking over once the plan is approved.\n- **Starting a new plan could silently destroy the one you were reviewing** when\n  plan history was turned off. A pending plan is never discarded without being\n  filed first, and starting a second plan while one awaits approval is refused.\n- **A failed or cancelled planning run reported itself as \"rejected\"**, which is\n  what the app says when a person declines a plan. Those now read as ended, with\n  the reason recorded, so declining and crashing no longer look identical.\n- **An unrelated prompt could mark a stalled plan complete.** Only the run that\n  was actually released to implement a plan can finish it.\n- **Live planning progress replayed the previous attempt's steps** after asking\n  for a new plan, because it measured from when the plan first existed rather\n  than when the current attempt started.\n- **Deleting a session left its plan revisions behind** in the database.\n- **A machine without git looked like a folder without a repository**, and the app\n  offered to initialise one — an action that could never succeed. Limboo now\n  detects the missing binary and names the install command for your platform.\n- **Settings could be hand-edited into a dead drawer tab or an unbounded panel\n  width**; both are now validated and clamped on load."
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
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.17.0",
      "compare": null,
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.17.0",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "Plan Mode now stops. A plan waits for your decision instead of sliding into\nimplementation, and the plan you are shown is the plan the agent actually wrote —\nwhich, until this release, it very often was not. Git also becomes a platform\nservice in its own right, so repository work reads as part of the conversation\nrather than something that happened in a side panel.\n\n### Added\n\n- **Plan approval is a real stop, not a prompt.** When the agent presents a plan,\n  execution halts: no further model calls, no new prompts, no background work,\n  and every tool is refused until you decide. Approving continues the same turn\n  rather than starting a new one, so the agent keeps everything it had learned\n  while planning. Approve, Approve & accept edits, Keep planning, Reject and\n  Archive are the only things that move it forward.\n- **Keep planning now sends feedback.** Instead of discarding the plan and\n  starting over, it hands your notes to the agent, which revises and presents\n  again — same conversation, same context.\n- **Plans are versioned.** A session has one plan; refinements replace it and the\n  previous text moves into History. Two windows on the same session can no longer\n  approve different plans, and a plan that changed while you were reading it says\n  so rather than acting on the stale copy.\n- **A pending plan survives a restart.** Quit with a plan awaiting approval and it\n  is still there on relaunch, with its buttons live and implementation still\n  locked. Approving after a restart starts a fresh run carrying the plan text,\n  because the paused conversation cannot outlive the process.\n- **Git is a platform service.** Repository actions post structured entries into\n  the conversation carrying the paths, commit and checkpoint behind them, with\n  Open Diff, View Commit, Restore Checkpoint and Copy Command on each.\n- **Optional GitHub CLI integration.** If `gh` is installed and signed in, a\n  GitHub sub-tab lists pull requests and issues, and the agent can read them\n  through the tools it already has. Limboo stores no GitHub credential —\n  authentication stays the CLI's. Posting a comment is gated and shows the exact\n  body first.\n- **Contributor avatars in history**, fetched in the main process and embedded so\n  no page ever requests a remote image. Behind `git.avatars.enabled`, which is\n  off-limits by default in the sense that turning it on is the thing that tells\n  GitHub which repository you are browsing — the setting says so.\n\n### Changed\n\n- **The integrated terminal is its own column** between the conversation and the\n  drawer, instead of competing for the drawer with Files and Changes.\n- **The Activity and Hooks drawer panels are gone.** The Hook Engine, its audit\n  log and every hook setting are untouched — only the two panels and the IPC they\n  were the sole consumers of were removed.\n- **Switching sessions is now an ordered handover.** Worktree, file watcher, git\n  status, search index, memory scope, MCP and the agent are rebound in sequence,\n  and a thin ribbon says so while it happens. Switching quickly between sessions\n  cancels the stale work rather than letting it finish over the newer session.\n\n### Fixed\n\n- **The plan you approved was usually empty.** Current Claude releases write the\n  plan to a file and pass no plan text to the tool Limboo was reading, so almost\n  every captured plan was blank — and because the tool was blocked, no plan file\n  was produced either. Approving then sent an empty plan, the agent re-derived\n  the work from scratch, and the empty plan was filed as completed. Limboo now\n  tells the agent where to write its plan and reads it from there, with the\n  agent's own copy taking over once the plan is approved.\n- **Starting a new plan could silently destroy the one you were reviewing** when\n  plan history was turned off. A pending plan is never discarded without being\n  filed first, and starting a second plan while one awaits approval is refused.\n- **A failed or cancelled planning run reported itself as \"rejected\"**, which is\n  what the app says when a person declines a plan. Those now read as ended, with\n  the reason recorded, so declining and crashing no longer look identical.\n- **An unrelated prompt could mark a stalled plan complete.** Only the run that\n  was actually released to implement a plan can finish it.\n- **Live planning progress replayed the previous attempt's steps** after asking\n  for a new plan, because it measured from when the plan first existed rather\n  than when the current attempt started.\n- **Deleting a session left its plan revisions behind** in the database.\n- **A machine without git looked like a folder without a repository**, and the app\n  offered to initialise one — an action that could never succeed. Limboo now\n  detects the missing binary and names the install command for your platform.\n- **Settings could be hand-edited into a dead drawer tab or an unbounded panel\n  width**; both are now validated and clamped on load."
  },
  {
    "version": "1.16.0",
    "date": "2026-07-30",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.16.0",
    "commit": null,
    "buildNumber": null,
    "summary": "A tighter follow-up to the runtime ring. The panel it opens now answers one\nquestion instead of four, and the conversation beneath it reads as one reply\nagain rather than a stack of cards.",
    "sections": [
      {
        "category": "changed",
        "title": "Changed",
        "items": [
          {
            "lead": "The runtime panel is the context window, and nothing else",
            "text": "It opened with\n  four collapsible sections, and three of them earned their space only\n  occasionally: request usage and long-term usage said \"not reported\" on any\n  agent that does not publish quotas, and execution detail was a nineteen-row\n  list behind a header that was folded shut by default. Together they pushed the\n  panel past the height it is allowed inside the workspace, where the bottom of\n  it was cut off rather than scrollable. The context breakdown is now the whole\n  panel — no section headers, no folding, no order to remember, and nothing\n  clipped."
          },
          {
            "lead": "Settings match what the panel now shows",
            "text": "Show estimated cost, the quota\n  warning threshold, show usage history and the section ordering controls are\n  gone rather than left on screen doing nothing, and \"Ring measures\" now offers\n  the two context options it can actually draw. If you had it set to quota, it\n  falls back on its own."
          },
          {
            "lead": "Nothing stopped being measured",
            "text": "Quota windows, usage samples and run\n  rollups are still collected and still stored. The Work Graph's Stats tab and\n  the JSON and CSV exports carry every field they did before — only the hover\n  panel got smaller."
          }
        ],
        "markdown": "- **The runtime panel is the context window, and nothing else.** It opened with\n  four collapsible sections, and three of them earned their space only\n  occasionally: request usage and long-term usage said \"not reported\" on any\n  agent that does not publish quotas, and execution detail was a nineteen-row\n  list behind a header that was folded shut by default. Together they pushed the\n  panel past the height it is allowed inside the workspace, where the bottom of\n  it was cut off rather than scrollable. The context breakdown is now the whole\n  panel — no section headers, no folding, no order to remember, and nothing\n  clipped.\n- **Settings match what the panel now shows.** Show estimated cost, the quota\n  warning threshold, show usage history and the section ordering controls are\n  gone rather than left on screen doing nothing, and \"Ring measures\" now offers\n  the two context options it can actually draw. If you had it set to quota, it\n  falls back on its own.\n- **Nothing stopped being measured.** Quota windows, usage samples and run\n  rollups are still collected and still stored. The Work Graph's Stats tab and\n  the JSON and CSV exports carry every field they did before — only the hover\n  panel got smaller."
      },
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "A reply broken up by tool calls sprouted a toolbar per fragment",
            "text": "Message\n  actions rendered on every block of an answer rather than once for the\n  exchange, so a reply interrupted three times showed three sets of buttons.\n  Actions now sit with the message you sent, which is the one stable anchor a\n  turn has."
          },
          {
            "lead": "The conversation read as a stack of cards",
            "text": "Hidden toolbars still occupied\n  their full height, and consecutive parts of a single answer sat about forty\n  pixels apart. An answer now reads as one continuous reply, with the wider\n  spacing kept for the boundary between exchanges."
          },
          {
            "lead": "Exporting from a message gave you the question without the answer",
            "text": "Export\n  now covers the whole exchange — what you asked, what came back, and what was\n  run in between. Copy and Copy as Markdown are unchanged and still copy the one\n  message, as their labels say."
          }
        ],
        "markdown": "- **A reply broken up by tool calls sprouted a toolbar per fragment.** Message\n  actions rendered on every block of an answer rather than once for the\n  exchange, so a reply interrupted three times showed three sets of buttons.\n  Actions now sit with the message you sent, which is the one stable anchor a\n  turn has.\n- **The conversation read as a stack of cards.** Hidden toolbars still occupied\n  their full height, and consecutive parts of a single answer sat about forty\n  pixels apart. An answer now reads as one continuous reply, with the wider\n  spacing kept for the boundary between exchanges.\n- **Exporting from a message gave you the question without the answer.** Export\n  now covers the whole exchange — what you asked, what came back, and what was\n  run in between. Copy and Copy as Markdown are unchanged and still copy the one\n  message, as their labels say."
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
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.16.0",
      "compare": "https://github.com/limboo-ai/limboo/compare/v1.15.0...v1.16.0",
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.16.0",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "A tighter follow-up to the runtime ring. The panel it opens now answers one\nquestion instead of four, and the conversation beneath it reads as one reply\nagain rather than a stack of cards.\n\n### Changed\n\n- **The runtime panel is the context window, and nothing else.** It opened with\n  four collapsible sections, and three of them earned their space only\n  occasionally: request usage and long-term usage said \"not reported\" on any\n  agent that does not publish quotas, and execution detail was a nineteen-row\n  list behind a header that was folded shut by default. Together they pushed the\n  panel past the height it is allowed inside the workspace, where the bottom of\n  it was cut off rather than scrollable. The context breakdown is now the whole\n  panel — no section headers, no folding, no order to remember, and nothing\n  clipped.\n- **Settings match what the panel now shows.** Show estimated cost, the quota\n  warning threshold, show usage history and the section ordering controls are\n  gone rather than left on screen doing nothing, and \"Ring measures\" now offers\n  the two context options it can actually draw. If you had it set to quota, it\n  falls back on its own.\n- **Nothing stopped being measured.** Quota windows, usage samples and run\n  rollups are still collected and still stored. The Work Graph's Stats tab and\n  the JSON and CSV exports carry every field they did before — only the hover\n  panel got smaller.\n\n### Fixed\n\n- **A reply broken up by tool calls sprouted a toolbar per fragment.** Message\n  actions rendered on every block of an answer rather than once for the\n  exchange, so a reply interrupted three times showed three sets of buttons.\n  Actions now sit with the message you sent, which is the one stable anchor a\n  turn has.\n- **The conversation read as a stack of cards.** Hidden toolbars still occupied\n  their full height, and consecutive parts of a single answer sat about forty\n  pixels apart. An answer now reads as one continuous reply, with the wider\n  spacing kept for the boundary between exchanges.\n- **Exporting from a message gave you the question without the answer.** Export\n  now covers the whole exchange — what you asked, what came back, and what was\n  run in between. Copy and Copy as Markdown are unchanged and still copy the one\n  message, as their labels say."
  },
  {
    "version": "1.15.0",
    "date": "2026-07-29",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.15.0",
    "commit": null,
    "buildNumber": null,
    "summary": "You can now see what a long session is actually costing you. A small ring beside\nthe composer status fills as the conversation consumes the model's context\nwindow, and hovering it opens a live breakdown of where that context went —\nwhich is the difference between noticing you are running out and finding out\nwhen the agent starts forgetting.",
    "sections": [
      {
        "category": "added",
        "title": "Added",
        "items": [
          {
            "lead": "A live runtime ring beside the agent status",
            "text": "It fills as the context\n  window fills, turns amber and then red as it runs low, and breathes while the\n  agent is working. It is there from the moment a session opens — before\n  anything has been measured it shows as unmeasured rather than as empty, which\n  are different things."
          },
          {
            "lead": "Hover it for the full picture",
            "text": "A floating panel shows how much of the\n  context window is used and left, how much is reserved for the reply, roughly\n  how many more exchanges fit before the conversation has to be compressed, and\n  when compression last happened."
          },
          {
            "lead": "See what filled the context",
            "text": "A single bar splits the window into who took\n  what: your conversation, results from tools, answers from connected servers,\n  recalled memories, retrieved project context, the repository delta, and staged\n  attachments. Hovering any band names the part of Limboo responsible for it."
          },
          {
            "lead": "Nothing is guessed at",
            "text": "The total, the window size and the reservation are\n  measured by the provider. The split beneath them is Limboo counting what it\n  composed, and is marked with a `~` everywhere it appears. When those estimates\n  would exceed what was actually measured — after a compression, or on a resumed\n  conversation — the split is dropped rather than quietly rescaled to fit."
          },
          {
            "lead": "Rate limits before they stop you",
            "text": "Rolling usage windows now come from the\n  provider's own updates as they arrive, with how much is consumed, when it\n  resets, and whether you are drawing on overage. Until now Limboo learned about\n  a limit by reading the error after you had already hit it."
          },
          {
            "lead": "Usage over time",
            "text": "Long-running windows keep a local trend so you can see a\n  week's consumption building rather than only today's number."
          },
          {
            "lead": "Execution detail on demand",
            "text": "Active model, mode, time to first token,\n  generation speed, run duration, cache reads, an estimated cost, retries, the\n  worktree, connected servers, index status and attachment count."
          },
          {
            "lead": "It says what a provider cannot tell it",
            "text": "Cursor's command-line interface\n  reports no token counts and no quotas, so those sections say exactly that,\n  naming the limitation instead of showing a zero that reads as \"nothing used\".\n  Every metric is something the running agent declares it can measure, so a\n  future agent lights up whatever it supports with no change to the interface."
          },
          {
            "lead": "Run costs in the work graph",
            "text": "A new Stats tab lists each run with its shape\n  and its cost side by side — nodes, tools, errors, duration, tokens, peak\n  context and estimated spend."
          },
          {
            "lead": "More ways to export a work graph",
            "text": "NDJSON, GraphML and PlantUML join the\n  existing formats, you can export just the selected part of a graph rather than\n  the whole session, optionally include run costs, and export every session at\n  once into a folder you pick."
          },
          {
            "lead": "Settings under Agent › Runtime Indicators",
            "text": "Turn the whole thing off, or\n  tune the ring's size, thickness, position and what it measures; choose\n  percentages or token counts; reorder or collapse panel sections; set the\n  thresholds that turn it amber, red, or raise a notification; and control how\n  long usage history is kept."
          }
        ],
        "markdown": "- **A live runtime ring beside the agent status.** It fills as the context\n  window fills, turns amber and then red as it runs low, and breathes while the\n  agent is working. It is there from the moment a session opens — before\n  anything has been measured it shows as unmeasured rather than as empty, which\n  are different things.\n- **Hover it for the full picture.** A floating panel shows how much of the\n  context window is used and left, how much is reserved for the reply, roughly\n  how many more exchanges fit before the conversation has to be compressed, and\n  when compression last happened.\n- **See what filled the context.** A single bar splits the window into who took\n  what: your conversation, results from tools, answers from connected servers,\n  recalled memories, retrieved project context, the repository delta, and staged\n  attachments. Hovering any band names the part of Limboo responsible for it.\n- **Nothing is guessed at.** The total, the window size and the reservation are\n  measured by the provider. The split beneath them is Limboo counting what it\n  composed, and is marked with a `~` everywhere it appears. When those estimates\n  would exceed what was actually measured — after a compression, or on a resumed\n  conversation — the split is dropped rather than quietly rescaled to fit.\n- **Rate limits before they stop you.** Rolling usage windows now come from the\n  provider's own updates as they arrive, with how much is consumed, when it\n  resets, and whether you are drawing on overage. Until now Limboo learned about\n  a limit by reading the error after you had already hit it.\n- **Usage over time.** Long-running windows keep a local trend so you can see a\n  week's consumption building rather than only today's number.\n- **Execution detail on demand.** Active model, mode, time to first token,\n  generation speed, run duration, cache reads, an estimated cost, retries, the\n  worktree, connected servers, index status and attachment count.\n- **It says what a provider cannot tell it.** Cursor's command-line interface\n  reports no token counts and no quotas, so those sections say exactly that,\n  naming the limitation instead of showing a zero that reads as \"nothing used\".\n  Every metric is something the running agent declares it can measure, so a\n  future agent lights up whatever it supports with no change to the interface.\n- **Run costs in the work graph.** A new Stats tab lists each run with its shape\n  and its cost side by side — nodes, tools, errors, duration, tokens, peak\n  context and estimated spend.\n- **More ways to export a work graph.** NDJSON, GraphML and PlantUML join the\n  existing formats, you can export just the selected part of a graph rather than\n  the whole session, optionally include run costs, and export every session at\n  once into a folder you pick.\n- **Settings under Agent › Runtime Indicators.** Turn the whole thing off, or\n  tune the ring's size, thickness, position and what it measures; choose\n  percentages or token counts; reorder or collapse panel sections; set the\n  thresholds that turn it amber, red, or raise a notification; and control how\n  long usage history is kept."
      },
      {
        "category": "security",
        "title": "Security",
        "items": [
          {
            "lead": "Nothing that identifies your machine leaves the main process",
            "text": "Worktree\n  paths are reduced to a name rather than a full path to your home directory,\n  the provider's conversation id is shown truncated with no way to reveal the\n  rest, and the one place a raw error message is surfaced has secrets and paths\n  stripped from it first."
          },
          {
            "lead": "Stored usage cannot contain your work",
            "text": "The tables behind the history have\n  no column that can hold a prompt, a message, a file path or a tool input, so\n  an export cannot leak them — and exports are assembled field by field rather\n  than dumped wholesale. Turning off \"Store usage history\" genuinely stops all\n  writing, for deployments that forbid keeping it."
          },
          {
            "lead": "No new network access",
            "text": "Every number comes from the stream Limboo already\n  receives to display the conversation. Nothing is polled and nothing is sent."
          }
        ],
        "markdown": "- **Nothing that identifies your machine leaves the main process.** Worktree\n  paths are reduced to a name rather than a full path to your home directory,\n  the provider's conversation id is shown truncated with no way to reveal the\n  rest, and the one place a raw error message is surfaced has secrets and paths\n  stripped from it first.\n- **Stored usage cannot contain your work.** The tables behind the history have\n  no column that can hold a prompt, a message, a file path or a tool input, so\n  an export cannot leak them — and exports are assembled field by field rather\n  than dumped wholesale. Turning off \"Store usage history\" genuinely stops all\n  writing, for deployments that forbid keeping it.\n- **No new network access.** Every number comes from the stream Limboo already\n  receives to display the conversation. Nothing is polled and nothing is sent."
      },
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "The work graph panel crashed the drawer",
            "text": "Opening it threw immediately and\n  took the surrounding panel down with it."
          },
          {
            "lead": "Threshold sliders were unusable",
            "text": "Ring size, thickness and every warning\n  threshold were squeezed into a sliver at the edge of their row, so touching\n  one snapped it to its lowest value. They now use the same full-width slider as\n  the rest of settings."
          },
          {
            "lead": "The runtime panel could be cut off",
            "text": "It was allowed to grow taller than the\n  workspace it opens inside, which clipped the bottom of it on shorter windows.\n  It is now capped, with only the context section open by default."
          },
          {
            "lead": "Injected memory and context counts were wrong",
            "text": "The panel reported the\n  configured maximum rather than how many were actually recalled."
          },
          {
            "lead": "Runtime updates could keep running after you closed the window",
            "text": "Closing or\n  reloading a window while the panel was open left Limboo updating at full rate\n  for a window that no longer existed."
          },
          {
            "lead": "Negative values were mangled in exported spreadsheets",
            "text": "A guard against\n  spreadsheet formula injection was also catching negative numbers and turning\n  them into text."
          }
        ],
        "markdown": "- **The work graph panel crashed the drawer.** Opening it threw immediately and\n  took the surrounding panel down with it.\n- **Threshold sliders were unusable.** Ring size, thickness and every warning\n  threshold were squeezed into a sliver at the edge of their row, so touching\n  one snapped it to its lowest value. They now use the same full-width slider as\n  the rest of settings.\n- **The runtime panel could be cut off.** It was allowed to grow taller than the\n  workspace it opens inside, which clipped the bottom of it on shorter windows.\n  It is now capped, with only the context section open by default.\n- **Injected memory and context counts were wrong.** The panel reported the\n  configured maximum rather than how many were actually recalled.\n- **Runtime updates could keep running after you closed the window.** Closing or\n  reloading a window while the panel was open left Limboo updating at full rate\n  for a window that no longer existed.\n- **Negative values were mangled in exported spreadsheets.** A guard against\n  spreadsheet formula injection was also catching negative numbers and turning\n  them into text."
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
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.15.0",
      "compare": "https://github.com/limboo-ai/limboo/compare/v1.14.0...v1.15.0",
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.15.0",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "You can now see what a long session is actually costing you. A small ring beside\nthe composer status fills as the conversation consumes the model's context\nwindow, and hovering it opens a live breakdown of where that context went —\nwhich is the difference between noticing you are running out and finding out\nwhen the agent starts forgetting.\n\n### Added\n\n- **A live runtime ring beside the agent status.** It fills as the context\n  window fills, turns amber and then red as it runs low, and breathes while the\n  agent is working. It is there from the moment a session opens — before\n  anything has been measured it shows as unmeasured rather than as empty, which\n  are different things.\n- **Hover it for the full picture.** A floating panel shows how much of the\n  context window is used and left, how much is reserved for the reply, roughly\n  how many more exchanges fit before the conversation has to be compressed, and\n  when compression last happened.\n- **See what filled the context.** A single bar splits the window into who took\n  what: your conversation, results from tools, answers from connected servers,\n  recalled memories, retrieved project context, the repository delta, and staged\n  attachments. Hovering any band names the part of Limboo responsible for it.\n- **Nothing is guessed at.** The total, the window size and the reservation are\n  measured by the provider. The split beneath them is Limboo counting what it\n  composed, and is marked with a `~` everywhere it appears. When those estimates\n  would exceed what was actually measured — after a compression, or on a resumed\n  conversation — the split is dropped rather than quietly rescaled to fit.\n- **Rate limits before they stop you.** Rolling usage windows now come from the\n  provider's own updates as they arrive, with how much is consumed, when it\n  resets, and whether you are drawing on overage. Until now Limboo learned about\n  a limit by reading the error after you had already hit it.\n- **Usage over time.** Long-running windows keep a local trend so you can see a\n  week's consumption building rather than only today's number.\n- **Execution detail on demand.** Active model, mode, time to first token,\n  generation speed, run duration, cache reads, an estimated cost, retries, the\n  worktree, connected servers, index status and attachment count.\n- **It says what a provider cannot tell it.** Cursor's command-line interface\n  reports no token counts and no quotas, so those sections say exactly that,\n  naming the limitation instead of showing a zero that reads as \"nothing used\".\n  Every metric is something the running agent declares it can measure, so a\n  future agent lights up whatever it supports with no change to the interface.\n- **Run costs in the work graph.** A new Stats tab lists each run with its shape\n  and its cost side by side — nodes, tools, errors, duration, tokens, peak\n  context and estimated spend.\n- **More ways to export a work graph.** NDJSON, GraphML and PlantUML join the\n  existing formats, you can export just the selected part of a graph rather than\n  the whole session, optionally include run costs, and export every session at\n  once into a folder you pick.\n- **Settings under Agent › Runtime Indicators.** Turn the whole thing off, or\n  tune the ring's size, thickness, position and what it measures; choose\n  percentages or token counts; reorder or collapse panel sections; set the\n  thresholds that turn it amber, red, or raise a notification; and control how\n  long usage history is kept.\n\n### Security\n\n- **Nothing that identifies your machine leaves the main process.** Worktree\n  paths are reduced to a name rather than a full path to your home directory,\n  the provider's conversation id is shown truncated with no way to reveal the\n  rest, and the one place a raw error message is surfaced has secrets and paths\n  stripped from it first.\n- **Stored usage cannot contain your work.** The tables behind the history have\n  no column that can hold a prompt, a message, a file path or a tool input, so\n  an export cannot leak them — and exports are assembled field by field rather\n  than dumped wholesale. Turning off \"Store usage history\" genuinely stops all\n  writing, for deployments that forbid keeping it.\n- **No new network access.** Every number comes from the stream Limboo already\n  receives to display the conversation. Nothing is polled and nothing is sent.\n\n### Fixed\n\n- **The work graph panel crashed the drawer.** Opening it threw immediately and\n  took the surrounding panel down with it.\n- **Threshold sliders were unusable.** Ring size, thickness and every warning\n  threshold were squeezed into a sliver at the edge of their row, so touching\n  one snapped it to its lowest value. They now use the same full-width slider as\n  the rest of settings.\n- **The runtime panel could be cut off.** It was allowed to grow taller than the\n  workspace it opens inside, which clipped the bottom of it on shorter windows.\n  It is now capped, with only the context section open by default.\n- **Injected memory and context counts were wrong.** The panel reported the\n  configured maximum rather than how many were actually recalled.\n- **Runtime updates could keep running after you closed the window.** Closing or\n  reloading a window while the panel was open left Limboo updating at full rate\n  for a window that no longer existed.\n- **Negative values were mangled in exported spreadsheets.** A guard against\n  spreadsheet formula injection was also catching negative numbers and turning\n  them into text."
  }
];

/** Every released version, newest first. */
export const RELEASE_INDEX: ReleaseIndexEntry[] = [
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
    "detailed": true
  },
  {
    "version": "1.16.0",
    "date": "2026-07-30",
    "channel": "stable",
    "summary": "A tighter follow-up to the runtime ring. The panel it opens now answers one\nquestion instead of four, and the conversation beneath it reads as one reply\nagain rather than a stack of cards.",
    "detailed": true
  },
  {
    "version": "1.15.0",
    "date": "2026-07-29",
    "channel": "stable",
    "summary": "You can now see what a long session is actually costing you. A small ring beside\nthe composer status fills as the conversation consumes the model's context\nwindow, and hovering it opens a live breakdown of where that context went —\nwhich is the difference between noticing you are running out and finding out\nwhen the agent starts forgetting.",
    "detailed": true
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
