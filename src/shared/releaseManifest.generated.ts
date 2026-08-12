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
  },
  {
    "version": "1.14.0",
    "date": "2026-07-29",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.14.0",
    "commit": null,
    "buildNumber": null,
    "summary": "When the agent hands work to a specialist, you can finally watch it happen.\nDelegated work used to arrive as an anonymous pile of tool calls mixed into the\nmain reply; it now reads as one line you can open, follow live, and take apart\nafterwards — without ever leaving the conversation.",
    "sections": [
      {
        "category": "added",
        "title": "Added",
        "items": [
          {
            "lead": "Delegated work reads as one activity",
            "text": "When the agent hands a job to a\n  specialist — exploring the repository, reviewing code, running tests — the\n  conversation shows a single line naming the worker and what it was asked to do,\n  with its progress underneath. The worker's own tool calls no longer scatter\n  through the reply as if the main agent had run them. Opening the line shows how\n  long it took, which model it used, what it read and changed, which tools and\n  connected servers it reached, what it verified, and what it concluded."
          },
          {
            "lead": "Live progress in the worker's own words",
            "text": "While a specialist works, it\n  reports what it is doing in plain language — \"Analyzing authentication module\"\n  — refreshed as it goes. When that is unavailable the progress is worked out\n  from the tools it is using, so there is always something to read."
          },
          {
            "lead": "Open a worker in its own tab",
            "text": "Maximize a delegation and it opens beside\n  your files as a full-width tab: live progress, everything it ran, its notes and\n  its conclusion, following along as it works. Minimizing returns it to the\n  conversation exactly where you left it — same scroll position, same sections\n  open. If the worker pauses for permission while you are watching, you can\n  answer without going back."
          },
          {
            "lead": "Actions on every delegation",
            "text": "Copy the conclusion or the worker's notes,\n  export the whole record as Markdown, jump to it in the work graph, or open any\n  file it changed straight into a diff. Copying while it is still working\n  captures everything that has arrived."
          },
          {
            "lead": "Delegated work in the task list",
            "text": "Specialists running right now appear under\n  the task they belong to, with finished ones collected below it, so a long\n  execution can be followed from the Tasks panel without reading the whole\n  conversation."
          },
          {
            "lead": "Settings for delegated work",
            "text": "Under Agent › Subagents you can turn the\n  inline activity off, stop requesting live progress descriptions, or stop\n  keeping a worker's notes."
          }
        ],
        "markdown": "- **Delegated work reads as one activity.** When the agent hands a job to a\n  specialist — exploring the repository, reviewing code, running tests — the\n  conversation shows a single line naming the worker and what it was asked to do,\n  with its progress underneath. The worker's own tool calls no longer scatter\n  through the reply as if the main agent had run them. Opening the line shows how\n  long it took, which model it used, what it read and changed, which tools and\n  connected servers it reached, what it verified, and what it concluded.\n- **Live progress in the worker's own words.** While a specialist works, it\n  reports what it is doing in plain language — \"Analyzing authentication module\"\n  — refreshed as it goes. When that is unavailable the progress is worked out\n  from the tools it is using, so there is always something to read.\n- **Open a worker in its own tab.** Maximize a delegation and it opens beside\n  your files as a full-width tab: live progress, everything it ran, its notes and\n  its conclusion, following along as it works. Minimizing returns it to the\n  conversation exactly where you left it — same scroll position, same sections\n  open. If the worker pauses for permission while you are watching, you can\n  answer without going back.\n- **Actions on every delegation.** Copy the conclusion or the worker's notes,\n  export the whole record as Markdown, jump to it in the work graph, or open any\n  file it changed straight into a diff. Copying while it is still working\n  captures everything that has arrived.\n- **Delegated work in the task list.** Specialists running right now appear under\n  the task they belong to, with finished ones collected below it, so a long\n  execution can be followed from the Tasks panel without reading the whole\n  conversation.\n- **Settings for delegated work.** Under Agent › Subagents you can turn the\n  inline activity off, stop requesting live progress descriptions, or stop\n  keeping a worker's notes."
      },
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "The plan was dumped into the conversation as raw text",
            "text": "Approving a plan\n  sent it to the agent, and everything sent to the agent is shown — so the whole\n  plan appeared in a chat bubble as unformatted markup, tags and all, sometimes\n  thousands of characters of it. The approval now reads as one line with the plan\n  beneath it, properly formatted and collapsed by default. Nothing is hidden:\n  viewing the message raw still shows exactly what the agent received."
          },
          {
            "lead": "Checklists in plans rendered twice over",
            "text": "Every `- [ ]` item drew a tick box\n  *and* a bullet, on plans that are almost entirely checklists. Ticked items are\n  now also greyed, so a plan reads like a plan."
          },
          {
            "lead": "The Tasks panel could go blank",
            "text": "A specialist that failed or was denied took\n  the whole panel down with it."
          },
          {
            "lead": "Long output was hard to read and hard to escape",
            "text": "A worker's notes and\n  conclusion ran together with everything around them at a size that fought its\n  surroundings, inside a small scrolling box that trapped the page. They are now\n  properly separated, one consistent size, and clipped with a clear way to read\n  the rest."
          },
          {
            "lead": "A worker's tool list could bury everything below it",
            "text": "A specialist that\n  reads thirty files pushed its own conclusion off the screen. Long lists now\n  arrive folded, with the count and anything still running or failed still\n  visible."
          },
          {
            "lead": "Delegated work went unrecognized on current agent versions",
            "text": "The tool that\n  starts a specialist was renamed upstream, and Limboo only recognized the old\n  name — so on any recent version delegated work was recorded as ordinary tool\n  calls and never appeared as delegation at all. Both names are now recognized."
          },
          {
            "lead": "A specialist's work vanished when you sent the next message",
            "text": "A worker still\n  running when you typed again had the rest of its work spill into the new turn\n  as loose tool calls. Its record also now survives restarting the app."
          },
          {
            "lead": "Sessions were named after approving a plan",
            "text": "An untitled session took its\n  name from the approval instead of from what you had asked for."
          }
        ],
        "markdown": "- **The plan was dumped into the conversation as raw text.** Approving a plan\n  sent it to the agent, and everything sent to the agent is shown — so the whole\n  plan appeared in a chat bubble as unformatted markup, tags and all, sometimes\n  thousands of characters of it. The approval now reads as one line with the plan\n  beneath it, properly formatted and collapsed by default. Nothing is hidden:\n  viewing the message raw still shows exactly what the agent received.\n- **Checklists in plans rendered twice over.** Every `- [ ]` item drew a tick box\n  *and* a bullet, on plans that are almost entirely checklists. Ticked items are\n  now also greyed, so a plan reads like a plan.\n- **The Tasks panel could go blank.** A specialist that failed or was denied took\n  the whole panel down with it.\n- **Long output was hard to read and hard to escape.** A worker's notes and\n  conclusion ran together with everything around them at a size that fought its\n  surroundings, inside a small scrolling box that trapped the page. They are now\n  properly separated, one consistent size, and clipped with a clear way to read\n  the rest.\n- **A worker's tool list could bury everything below it.** A specialist that\n  reads thirty files pushed its own conclusion off the screen. Long lists now\n  arrive folded, with the count and anything still running or failed still\n  visible.\n- **Delegated work went unrecognized on current agent versions.** The tool that\n  starts a specialist was renamed upstream, and Limboo only recognized the old\n  name — so on any recent version delegated work was recorded as ordinary tool\n  calls and never appeared as delegation at all. Both names are now recognized.\n- **A specialist's work vanished when you sent the next message.** A worker still\n  running when you typed again had the rest of its work spill into the new turn\n  as loose tool calls. Its record also now survives restarting the app.\n- **Sessions were named after approving a plan.** An untitled session took its\n  name from the approval instead of from what you had asked for."
      },
      {
        "category": "security",
        "title": "Security",
        "items": [
          {
            "lead": "\"Always allow\" no longer grants more than you agreed to",
            "text": "Allowing an action\n  for the session applied to *every* later action, whatever its kind — approving a\n  file read also pre-approved writing files and running commands, and satisfied\n  the guard on secrets like `.env` files and private keys. It now applies only to\n  the kind of action you were actually shown, and access to secrets always asks\n  on its own."
          },
          {
            "lead": "A specialist's notes are treated as untrusted",
            "text": "What a worker writes is\n  stored and shown as text, with a size limit, and is never fed back to the agent\n  as instructions."
          },
          {
            "lead": "Approvals name the worker that asked",
            "text": "A permission request raised inside a\n  delegation says so — and when it cannot be attributed with certainty, it says\n  nothing rather than guessing."
          }
        ],
        "markdown": "- **\"Always allow\" no longer grants more than you agreed to.** Allowing an action\n  for the session applied to *every* later action, whatever its kind — approving a\n  file read also pre-approved writing files and running commands, and satisfied\n  the guard on secrets like `.env` files and private keys. It now applies only to\n  the kind of action you were actually shown, and access to secrets always asks\n  on its own.\n- **A specialist's notes are treated as untrusted.** What a worker writes is\n  stored and shown as text, with a size limit, and is never fed back to the agent\n  as instructions.\n- **Approvals name the worker that asked.** A permission request raised inside a\n  delegation says so — and when it cannot be attributed with certainty, it says\n  nothing rather than guessing."
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
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.14.0",
      "compare": "https://github.com/limboo-ai/limboo/compare/v1.13.2...v1.14.0",
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.14.0",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "When the agent hands work to a specialist, you can finally watch it happen.\nDelegated work used to arrive as an anonymous pile of tool calls mixed into the\nmain reply; it now reads as one line you can open, follow live, and take apart\nafterwards — without ever leaving the conversation.\n\n### Added\n\n- **Delegated work reads as one activity.** When the agent hands a job to a\n  specialist — exploring the repository, reviewing code, running tests — the\n  conversation shows a single line naming the worker and what it was asked to do,\n  with its progress underneath. The worker's own tool calls no longer scatter\n  through the reply as if the main agent had run them. Opening the line shows how\n  long it took, which model it used, what it read and changed, which tools and\n  connected servers it reached, what it verified, and what it concluded.\n- **Live progress in the worker's own words.** While a specialist works, it\n  reports what it is doing in plain language — \"Analyzing authentication module\"\n  — refreshed as it goes. When that is unavailable the progress is worked out\n  from the tools it is using, so there is always something to read.\n- **Open a worker in its own tab.** Maximize a delegation and it opens beside\n  your files as a full-width tab: live progress, everything it ran, its notes and\n  its conclusion, following along as it works. Minimizing returns it to the\n  conversation exactly where you left it — same scroll position, same sections\n  open. If the worker pauses for permission while you are watching, you can\n  answer without going back.\n- **Actions on every delegation.** Copy the conclusion or the worker's notes,\n  export the whole record as Markdown, jump to it in the work graph, or open any\n  file it changed straight into a diff. Copying while it is still working\n  captures everything that has arrived.\n- **Delegated work in the task list.** Specialists running right now appear under\n  the task they belong to, with finished ones collected below it, so a long\n  execution can be followed from the Tasks panel without reading the whole\n  conversation.\n- **Settings for delegated work.** Under Agent › Subagents you can turn the\n  inline activity off, stop requesting live progress descriptions, or stop\n  keeping a worker's notes.\n\n### Fixed\n\n- **The plan was dumped into the conversation as raw text.** Approving a plan\n  sent it to the agent, and everything sent to the agent is shown — so the whole\n  plan appeared in a chat bubble as unformatted markup, tags and all, sometimes\n  thousands of characters of it. The approval now reads as one line with the plan\n  beneath it, properly formatted and collapsed by default. Nothing is hidden:\n  viewing the message raw still shows exactly what the agent received.\n- **Checklists in plans rendered twice over.** Every `- [ ]` item drew a tick box\n  *and* a bullet, on plans that are almost entirely checklists. Ticked items are\n  now also greyed, so a plan reads like a plan.\n- **The Tasks panel could go blank.** A specialist that failed or was denied took\n  the whole panel down with it.\n- **Long output was hard to read and hard to escape.** A worker's notes and\n  conclusion ran together with everything around them at a size that fought its\n  surroundings, inside a small scrolling box that trapped the page. They are now\n  properly separated, one consistent size, and clipped with a clear way to read\n  the rest.\n- **A worker's tool list could bury everything below it.** A specialist that\n  reads thirty files pushed its own conclusion off the screen. Long lists now\n  arrive folded, with the count and anything still running or failed still\n  visible.\n- **Delegated work went unrecognized on current agent versions.** The tool that\n  starts a specialist was renamed upstream, and Limboo only recognized the old\n  name — so on any recent version delegated work was recorded as ordinary tool\n  calls and never appeared as delegation at all. Both names are now recognized.\n- **A specialist's work vanished when you sent the next message.** A worker still\n  running when you typed again had the rest of its work spill into the new turn\n  as loose tool calls. Its record also now survives restarting the app.\n- **Sessions were named after approving a plan.** An untitled session took its\n  name from the approval instead of from what you had asked for.\n\n### Security\n\n- **\"Always allow\" no longer grants more than you agreed to.** Allowing an action\n  for the session applied to *every* later action, whatever its kind — approving a\n  file read also pre-approved writing files and running commands, and satisfied\n  the guard on secrets like `.env` files and private keys. It now applies only to\n  the kind of action you were actually shown, and access to secrets always asks\n  on its own.\n- **A specialist's notes are treated as untrusted.** What a worker writes is\n  stored and shown as text, with a size limit, and is never fed back to the agent\n  as instructions.\n- **Approvals name the worker that asked.** A permission request raised inside a\n  delegation says so — and when it cannot be attributed with certainty, it says\n  nothing rather than guessing."
  },
  {
    "version": "1.13.2",
    "date": "2026-07-28",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.13.2",
    "commit": null,
    "buildNumber": null,
    "summary": "A plan you left waiting can be approved again.",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "Approving a plan after reopening the app did nothing",
            "text": "A plan waiting for\n  your approval was saved, but the conversation that produced it was not — a plan\n  run always ends by interrupting the agent, and an interrupted conversation is\n  cleared so your next message cannot fail on it. Approving afterwards therefore\n  started a fresh conversation and told it to implement a plan it had never seen:\n  the run finished having done nothing, and the plan was filed as complete. The\n  approved plan is now sent with the approval, so it no longer matters whether\n  the earlier conversation survived. This applies to both Claude and Cursor."
          },
          {
            "lead": "Approve was greyed out while Reject still worked",
            "text": "Approve, \"Approve &\n  accept edits\" and \"Keep planning\" are disabled while a run is finishing;\n  Reject is not. A run that ended without reporting back — after reloading the\n  window mid-run, or when a planning run did not fully unwind — left the session\n  looking permanently busy, so the only control that still responded was Reject.\n  A session that claims to be working with nothing running is now corrected on\n  the spot."
          },
          {
            "lead": "Plans could get stuck with no way out",
            "text": "Closing the app while a plan was\n  being written, or while one was being implemented, left it in that state\n  forever — and while a plan is being written the panel hides its whole toolbar,\n  so there was no approve, no reject and no regenerate. Interrupted plans are now\n  settled on startup: one that was never finished is cleared, and one that was\n  part-way through being implemented returns to awaiting approval so you can\n  start it again. Regenerate also stays available while a plan is being written."
          },
          {
            "lead": "Approve could stop responding with no explanation",
            "text": "Clicking Approve blocked\n  further clicks until the whole implementation run finished, so a run that hung\n  left the button silently dead for the rest of the session. It is now released\n  as soon as the run actually starts."
          },
          {
            "lead": "Starting a new plan discarded the one waiting for approval",
            "text": "It was replaced\n  without being recorded, so it was not even in the plan's own History. A pending\n  plan is now saved to History first. Reopening the app restores Plan mode by\n  default, which made this reachable by simply typing."
          },
          {
            "lead": "A failed approval could leave the composer in the wrong mode",
            "text": "After\n  reopening the app it stayed on \"Ask before edits\" even though the plan had been\n  put back and was waiting for approval again. It now returns to Plan."
          }
        ],
        "markdown": "- **Approving a plan after reopening the app did nothing.** A plan waiting for\n  your approval was saved, but the conversation that produced it was not — a plan\n  run always ends by interrupting the agent, and an interrupted conversation is\n  cleared so your next message cannot fail on it. Approving afterwards therefore\n  started a fresh conversation and told it to implement a plan it had never seen:\n  the run finished having done nothing, and the plan was filed as complete. The\n  approved plan is now sent with the approval, so it no longer matters whether\n  the earlier conversation survived. This applies to both Claude and Cursor.\n- **Approve was greyed out while Reject still worked.** Approve, \"Approve &\n  accept edits\" and \"Keep planning\" are disabled while a run is finishing;\n  Reject is not. A run that ended without reporting back — after reloading the\n  window mid-run, or when a planning run did not fully unwind — left the session\n  looking permanently busy, so the only control that still responded was Reject.\n  A session that claims to be working with nothing running is now corrected on\n  the spot.\n- **Plans could get stuck with no way out.** Closing the app while a plan was\n  being written, or while one was being implemented, left it in that state\n  forever — and while a plan is being written the panel hides its whole toolbar,\n  so there was no approve, no reject and no regenerate. Interrupted plans are now\n  settled on startup: one that was never finished is cleared, and one that was\n  part-way through being implemented returns to awaiting approval so you can\n  start it again. Regenerate also stays available while a plan is being written.\n- **Approve could stop responding with no explanation.** Clicking Approve blocked\n  further clicks until the whole implementation run finished, so a run that hung\n  left the button silently dead for the rest of the session. It is now released\n  as soon as the run actually starts.\n- **Starting a new plan discarded the one waiting for approval.** It was replaced\n  without being recorded, so it was not even in the plan's own History. A pending\n  plan is now saved to History first. Reopening the app restores Plan mode by\n  default, which made this reachable by simply typing.\n- **A failed approval could leave the composer in the wrong mode.** After\n  reopening the app it stayed on \"Ask before edits\" even though the plan had been\n  put back and was waiting for approval again. It now returns to Plan."
      },
      {
        "category": "changed",
        "title": "Changed",
        "items": [
          {
            "lead": "The plan approval controls are no longer boxed in",
            "text": "The Approve, \"Approve &\n  accept edits\", \"Keep planning\" and Reject buttons sit directly on the panel\n  instead of inside a tinted card, matching how the same controls already read in\n  the conversation."
          }
        ],
        "markdown": "- **The plan approval controls are no longer boxed in.** The Approve, \"Approve &\n  accept edits\", \"Keep planning\" and Reject buttons sit directly on the panel\n  instead of inside a tinted card, matching how the same controls already read in\n  the conversation."
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
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.13.2",
      "compare": "https://github.com/limboo-ai/limboo/compare/v1.13.1...v1.13.2",
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.13.2",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "A plan you left waiting can be approved again.\n\n### Fixed\n\n- **Approving a plan after reopening the app did nothing.** A plan waiting for\n  your approval was saved, but the conversation that produced it was not — a plan\n  run always ends by interrupting the agent, and an interrupted conversation is\n  cleared so your next message cannot fail on it. Approving afterwards therefore\n  started a fresh conversation and told it to implement a plan it had never seen:\n  the run finished having done nothing, and the plan was filed as complete. The\n  approved plan is now sent with the approval, so it no longer matters whether\n  the earlier conversation survived. This applies to both Claude and Cursor.\n- **Approve was greyed out while Reject still worked.** Approve, \"Approve &\n  accept edits\" and \"Keep planning\" are disabled while a run is finishing;\n  Reject is not. A run that ended without reporting back — after reloading the\n  window mid-run, or when a planning run did not fully unwind — left the session\n  looking permanently busy, so the only control that still responded was Reject.\n  A session that claims to be working with nothing running is now corrected on\n  the spot.\n- **Plans could get stuck with no way out.** Closing the app while a plan was\n  being written, or while one was being implemented, left it in that state\n  forever — and while a plan is being written the panel hides its whole toolbar,\n  so there was no approve, no reject and no regenerate. Interrupted plans are now\n  settled on startup: one that was never finished is cleared, and one that was\n  part-way through being implemented returns to awaiting approval so you can\n  start it again. Regenerate also stays available while a plan is being written.\n- **Approve could stop responding with no explanation.** Clicking Approve blocked\n  further clicks until the whole implementation run finished, so a run that hung\n  left the button silently dead for the rest of the session. It is now released\n  as soon as the run actually starts.\n- **Starting a new plan discarded the one waiting for approval.** It was replaced\n  without being recorded, so it was not even in the plan's own History. A pending\n  plan is now saved to History first. Reopening the app restores Plan mode by\n  default, which made this reachable by simply typing.\n- **A failed approval could leave the composer in the wrong mode.** After\n  reopening the app it stayed on \"Ask before edits\" even though the plan had been\n  put back and was waiting for approval again. It now returns to Plan.\n\n### Changed\n\n- **The plan approval controls are no longer boxed in.** The Approve, \"Approve &\n  accept edits\", \"Keep planning\" and Reject buttons sit directly on the panel\n  instead of inside a tinted card, matching how the same controls already read in\n  the conversation."
  }
];

/** Every released version, newest first. */
export const RELEASE_INDEX: ReleaseIndexEntry[] = [
  {
    "version": "1.18.0-beta.2",
    "date": "2026-08-12",
    "channel": "beta",
    "summary": "The first beta. Two bugs that made Cursor sessions unusable are fixed, agents can\nnow run through a swappable harness layer instead of one hardcoded integration,\nand Settings opens as a workspace tab. This build is published for testing ahead\nof a stable release — read the warning at the top of these notes before\ninstalling it over a working copy.",
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
    "detailed": true
  },
  {
    "version": "1.13.2",
    "date": "2026-07-28",
    "channel": "stable",
    "summary": "A plan you left waiting can be approved again.",
    "detailed": true
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
