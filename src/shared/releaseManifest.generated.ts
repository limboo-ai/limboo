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
  },
  {
    "version": "1.7.0",
    "date": "2026-07-26",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.7.0",
    "commit": null,
    "buildNumber": null,
    "summary": "Adds the **Work Graph** — a typed, queryable graph of what a session actually\ndid, built from both coding agents' event streams and owned entirely by Limboo —\nalong with a document-oriented workspace where diffs open as first-class tabs,\nand an in-app **What's New** tab so an update can finally tell you what changed.",
    "sections": [
      {
        "category": "added",
        "title": "Added",
        "items": [
          {
            "lead": "The Work Graph (DAWG)",
            "text": "Every session's execution is recorded as a Directed\n  Acyclic Work Graph — objectives, plans, tasks, subagents, investigations,\n  searches, memory lookups, MCP calls, commands, files, commits, approvals and\n  results — connected by nine typed relationships (`follows`, `contains`,\n  `generated`, `depends-on`, `implemented-in`, `verified-by`, `blocked-by`,\n  `reviewed-by`, `produced-artifact`). Neither Claude nor Cursor exposes a work\n  graph; both are conversation-driven. This is Limboo's own layer, derived from\n  the structured events they *do* emit, so it records both agents identically and\n  every future adapter contributes nodes for free. It is deliberately shaped like\n  a git history — vertical execution lanes, one node per row, commits in a\n  right-hand gutter — rather than a free-floating node diagram, because that is\n  the mental model developers already have. Layout runs in a Web Worker and rows\n  virtualize, so a long session stays responsive."
          },
          {
            "lead": "Structural search over the graph",
            "text": "Queries traverse *shape*, not just text:\n  an FTS5 seed set (free text, node kinds, statuses, time range) expanded by a\n  bounded closure over the edge table. \"Every task blocked by X\" is a traversal,\n  not a transcript scroll."
          },
          {
            "lead": "Eight export formats",
            "text": "JSON, Markdown, Mermaid, Graphviz DOT, CSV and a\n  self-contained HTML report are rendered from the stored graph; SVG and PNG are\n  rendered from the layout. Exports go to the clipboard or to a file you pick."
          },
          {
            "lead": "A document-oriented workspace",
            "text": "Diffs promote out of the Changes panel into\n  first-class tabs with their own icons, pinning, reordering, close/reopen and\n  per-document view state. `ChangesNavigator` unifies file browsing across the Git\n  panel and Changes; `DiffEditor` adds syntax highlighting and word-level diffs."
          },
          {
            "lead": "A \"What's New\" tab",
            "text": "When Limboo starts on a version it has not shown you\n  before, the release notes for *that* version open as a workspace tab. Closing it\n  is remembered until the next update. It is available any time from the command\n  palette, and — like Claude Code's own `/release-notes` — it is display-only and\n  never enters the agent's context."
          }
        ],
        "markdown": "- **The Work Graph (DAWG).** Every session's execution is recorded as a Directed\n  Acyclic Work Graph — objectives, plans, tasks, subagents, investigations,\n  searches, memory lookups, MCP calls, commands, files, commits, approvals and\n  results — connected by nine typed relationships (`follows`, `contains`,\n  `generated`, `depends-on`, `implemented-in`, `verified-by`, `blocked-by`,\n  `reviewed-by`, `produced-artifact`). Neither Claude nor Cursor exposes a work\n  graph; both are conversation-driven. This is Limboo's own layer, derived from\n  the structured events they *do* emit, so it records both agents identically and\n  every future adapter contributes nodes for free. It is deliberately shaped like\n  a git history — vertical execution lanes, one node per row, commits in a\n  right-hand gutter — rather than a free-floating node diagram, because that is\n  the mental model developers already have. Layout runs in a Web Worker and rows\n  virtualize, so a long session stays responsive.\n- **Structural search over the graph.** Queries traverse *shape*, not just text:\n  an FTS5 seed set (free text, node kinds, statuses, time range) expanded by a\n  bounded closure over the edge table. \"Every task blocked by X\" is a traversal,\n  not a transcript scroll.\n- **Eight export formats.** JSON, Markdown, Mermaid, Graphviz DOT, CSV and a\n  self-contained HTML report are rendered from the stored graph; SVG and PNG are\n  rendered from the layout. Exports go to the clipboard or to a file you pick.\n- **A document-oriented workspace.** Diffs promote out of the Changes panel into\n  first-class tabs with their own icons, pinning, reordering, close/reopen and\n  per-document view state. `ChangesNavigator` unifies file browsing across the Git\n  panel and Changes; `DiffEditor` adds syntax highlighting and word-level diffs.\n- **A \"What's New\" tab.** When Limboo starts on a version it has not shown you\n  before, the release notes for *that* version open as a workspace tab. Closing it\n  is remembered until the next update. It is available any time from the command\n  palette, and — like Claude Code's own `/release-notes` — it is display-only and\n  never enters the agent's context."
      },
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "The work graph silently discarded whole batches of its own data",
            "text": "A node\n  whose payload exceeded the size cap was skipped, but the edges pointing at it\n  were still written. `INSERT OR IGNORE` does not suppress a FOREIGN KEY\n  violation, so the failing edge aborted the entire transaction and took every\n  other node and edge in that flush with it — behind a single `logger.warn`.\n  Oversized nodes are now shrunk rather than dropped, every edge's endpoints are\n  proven to exist before insert, and persistent failures surface as a banner in\n  the panel instead of an innocent-looking empty graph."
          },
          {
            "lead": "Orphan cleanup deleted real work",
            "text": "It removed any node with no edge, which is\n  the normal state of a terminal opened outside a run, a commit made with no agent\n  active, or a service started before the first prompt. Those kinds are now exempt."
          },
          {
            "lead": "Commits could be attributed to the wrong session, or lost entirely",
            "text": "An\n  unattributable commit was still recorded as \"seen\", so it was dropped\n  permanently at the exact moment its session next became active. It is now only\n  marked seen once it has been attributed. Separately, a `git pull` bringing in\n  upstream commits claimed the current run had implemented its files in every one\n  of them; that fan-out is now limited to commits made after the run started."
          },
          {
            "lead": "Subagent work was spliced into the main timeline",
            "text": "The `contains`\n  relationship was defined, drawn by the layouter and listed in the legend, but\n  nothing ever emitted it. Subagent nesting now rides the Agent SDK's\n  `parent_tool_use_id`, so a subagent's steps sit inside the node that spawned\n  them. (Cursor's print mode has no subagents, so the branch simply never forks\n  there.)"
          },
          {
            "lead": "Permission decisions were never recorded",
            "text": "Approval nodes were inferred by\n  string-matching a log line's `\"Blocked…\"` prefix, which could not see the answer\n  the user actually gave. They now come from the one decision gate both providers\n  call, carrying the real decision, tool and risk."
          },
          {
            "lead": "Nodes were labelled with the wrong agent",
            "text": "Provider and mode were read from\n  current settings at write time rather than captured per run, so switching models\n  mid-session silently relabelled a run's history."
          },
          {
            "lead": "Two release gates were not actually verifying anything",
            "text": "Both were found by\n  checking the published v1.6.0 artifacts by hand rather than trusting a green\n  pipeline:\n  - The Squirrel.Mac layout check — the gate that exists to catch the defect that\n    made every macOS update in v1.5.x impossible — reported \"no macOS update zips\n    in this build\" and passed. It matched on a `-mac.zip` filename suffix, and\n    the packaging fix in 1.6.0 renamed the artifacts to `-<arch>.zip`. The zip\n    list now comes from `latest-mac.yml`, which is naming-independent and\n    authoritative, and a macOS feed with no matching zip is a failure rather than\n    a skip — a build can no longer opt out of its own regression gate.\n  - `SHA256SUMS` listed `limboo-package.cyclonedx.json`, a side-file the SBOM\n    action writes but the upload globs exclude, so `sha256sum -c SHA256SUMS`\n    exited non-zero on an otherwise correct release — discrediting the one\n    verification command the README and release notes give users. It is excluded\n    from the publish set, and a new check fails the build if the manifest names\n    anything that is not being published. (The v1.6.0 manifest was corrected in\n    place; its remaining hashes were always valid.)"
          }
        ],
        "markdown": "- **The work graph silently discarded whole batches of its own data.** A node\n  whose payload exceeded the size cap was skipped, but the edges pointing at it\n  were still written. `INSERT OR IGNORE` does not suppress a FOREIGN KEY\n  violation, so the failing edge aborted the entire transaction and took every\n  other node and edge in that flush with it — behind a single `logger.warn`.\n  Oversized nodes are now shrunk rather than dropped, every edge's endpoints are\n  proven to exist before insert, and persistent failures surface as a banner in\n  the panel instead of an innocent-looking empty graph.\n- **Orphan cleanup deleted real work.** It removed any node with no edge, which is\n  the normal state of a terminal opened outside a run, a commit made with no agent\n  active, or a service started before the first prompt. Those kinds are now exempt.\n- **Commits could be attributed to the wrong session, or lost entirely.** An\n  unattributable commit was still recorded as \"seen\", so it was dropped\n  permanently at the exact moment its session next became active. It is now only\n  marked seen once it has been attributed. Separately, a `git pull` bringing in\n  upstream commits claimed the current run had implemented its files in every one\n  of them; that fan-out is now limited to commits made after the run started.\n- **Subagent work was spliced into the main timeline.** The `contains`\n  relationship was defined, drawn by the layouter and listed in the legend, but\n  nothing ever emitted it. Subagent nesting now rides the Agent SDK's\n  `parent_tool_use_id`, so a subagent's steps sit inside the node that spawned\n  them. (Cursor's print mode has no subagents, so the branch simply never forks\n  there.)\n- **Permission decisions were never recorded.** Approval nodes were inferred by\n  string-matching a log line's `\"Blocked…\"` prefix, which could not see the answer\n  the user actually gave. They now come from the one decision gate both providers\n  call, carrying the real decision, tool and risk.\n- **Nodes were labelled with the wrong agent.** Provider and mode were read from\n  current settings at write time rather than captured per run, so switching models\n  mid-session silently relabelled a run's history.\n- **Two release gates were not actually verifying anything.** Both were found by\n  checking the published v1.6.0 artifacts by hand rather than trusting a green\n  pipeline:\n  - The Squirrel.Mac layout check — the gate that exists to catch the defect that\n    made every macOS update in v1.5.x impossible — reported \"no macOS update zips\n    in this build\" and passed. It matched on a `-mac.zip` filename suffix, and\n    the packaging fix in 1.6.0 renamed the artifacts to `-<arch>.zip`. The zip\n    list now comes from `latest-mac.yml`, which is naming-independent and\n    authoritative, and a macOS feed with no matching zip is a failure rather than\n    a skip — a build can no longer opt out of its own regression gate.\n  - `SHA256SUMS` listed `limboo-package.cyclonedx.json`, a side-file the SBOM\n    action writes but the upload globs exclude, so `sha256sum -c SHA256SUMS`\n    exited non-zero on an otherwise correct release — discrediting the one\n    verification command the README and release notes give users. It is excluded\n    from the publish set, and a new check fails the build if the manifest names\n    anything that is not being published. (The v1.6.0 manifest was corrected in\n    place; its remaining hashes were always valid.)"
      },
      {
        "category": "changed",
        "title": "Changed",
        "items": [
          {
            "lead": "Release notes now come from this file",
            "text": "The GitHub release body was\n  generated from commit subjects while the changelog was written by hand, so the\n  two said different things about the same release and nothing connected them.\n  The notes generator now reads the section for the tag being released and falls\n  back to the previous commit-subject behaviour only when there isn't one — which\n  also means the notes shown inside the app, the notes on the release page, and\n  this file are the same text by construction."
          },
          {
            "lead": "An active icon is marked by its own color, not a filled block behind it",
            "text": "In\n  the activity rail, the title-bar tab strip and the settings navigation, the\n  background plate is gone and the glyph takes the accent color. On a pure-black\n  canvas the plate read as a second element competing with the icon it sat\n  behind. Hover still shows it, where it is feedback rather than state."
          }
        ],
        "markdown": "- **Release notes now come from this file.** The GitHub release body was\n  generated from commit subjects while the changelog was written by hand, so the\n  two said different things about the same release and nothing connected them.\n  The notes generator now reads the section for the tag being released and falls\n  back to the previous commit-subject behaviour only when there isn't one — which\n  also means the notes shown inside the app, the notes on the release page, and\n  this file are the same text by construction.\n- **An active icon is marked by its own color, not a filled block behind it.** In\n  the activity rail, the title-bar tab strip and the settings navigation, the\n  background plate is gone and the glyph takes the accent color. On a pure-black\n  canvas the plate read as a second element competing with the icon it sat\n  behind. Hover still shows it, where it is feedback rather than state."
      },
      {
        "category": "security",
        "title": "Security",
        "items": [
          {
            "lead": "The graph's secret redactor missed the case its own guide calls out",
            "text": "It is\n  shared with the Hook Engine, so a gap in it was a gap in two subsystems. It now\n  covers credential-bearing URLs (`https://user:token@host` — a remote typed into\n  a terminal became a node title verbatim), GitHub, AWS and Slack tokens, PEM\n  private-key blocks, JWTs, and generic `secret=`-shaped assignments. Redaction\n  also runs recursively over a node's whole metadata on the single path into the\n  database, rather than only over its title and detail, so a future field is\n  covered without having to opt in."
          },
          {
            "lead": "Export writes to disk without the renderer ever naming a path",
            "text": "Saving a\n  graph sends only a session id and a format; the main process opens the save\n  dialog and writes wherever you chose. There is no renderer-supplied path, and\n  therefore no traversal surface to defend."
          },
          {
            "lead": "Query inputs are bounded before they are examined",
            "text": "Array arguments are\n  capped before filtering (an oversized array was previously walked in full),\n  export results are byte-capped, and edge reads are limited instead of unbounded\n  table scans."
          }
        ],
        "markdown": "- **The graph's secret redactor missed the case its own guide calls out.** It is\n  shared with the Hook Engine, so a gap in it was a gap in two subsystems. It now\n  covers credential-bearing URLs (`https://user:token@host` — a remote typed into\n  a terminal became a node title verbatim), GitHub, AWS and Slack tokens, PEM\n  private-key blocks, JWTs, and generic `secret=`-shaped assignments. Redaction\n  also runs recursively over a node's whole metadata on the single path into the\n  database, rather than only over its title and detail, so a future field is\n  covered without having to opt in.\n- **Export writes to disk without the renderer ever naming a path.** Saving a\n  graph sends only a session id and a format; the main process opens the save\n  dialog and writes wherever you chose. There is no renderer-supplied path, and\n  therefore no traversal surface to defend.\n- **Query inputs are bounded before they are examined.** Array arguments are\n  capped before filtering (an oversized array was previously walked in full),\n  export results are byte-capped, and edge reads are limited instead of unbounded\n  table scans."
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
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.7.0",
      "compare": "https://github.com/limboo-ai/limboo/compare/v1.6.0...v1.7.0",
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.7.0",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "Adds the **Work Graph** — a typed, queryable graph of what a session actually\ndid, built from both coding agents' event streams and owned entirely by Limboo —\nalong with a document-oriented workspace where diffs open as first-class tabs,\nand an in-app **What's New** tab so an update can finally tell you what changed.\n\n### Added\n\n- **The Work Graph (DAWG).** Every session's execution is recorded as a Directed\n  Acyclic Work Graph — objectives, plans, tasks, subagents, investigations,\n  searches, memory lookups, MCP calls, commands, files, commits, approvals and\n  results — connected by nine typed relationships (`follows`, `contains`,\n  `generated`, `depends-on`, `implemented-in`, `verified-by`, `blocked-by`,\n  `reviewed-by`, `produced-artifact`). Neither Claude nor Cursor exposes a work\n  graph; both are conversation-driven. This is Limboo's own layer, derived from\n  the structured events they *do* emit, so it records both agents identically and\n  every future adapter contributes nodes for free. It is deliberately shaped like\n  a git history — vertical execution lanes, one node per row, commits in a\n  right-hand gutter — rather than a free-floating node diagram, because that is\n  the mental model developers already have. Layout runs in a Web Worker and rows\n  virtualize, so a long session stays responsive.\n- **Structural search over the graph.** Queries traverse *shape*, not just text:\n  an FTS5 seed set (free text, node kinds, statuses, time range) expanded by a\n  bounded closure over the edge table. \"Every task blocked by X\" is a traversal,\n  not a transcript scroll.\n- **Eight export formats.** JSON, Markdown, Mermaid, Graphviz DOT, CSV and a\n  self-contained HTML report are rendered from the stored graph; SVG and PNG are\n  rendered from the layout. Exports go to the clipboard or to a file you pick.\n- **A document-oriented workspace.** Diffs promote out of the Changes panel into\n  first-class tabs with their own icons, pinning, reordering, close/reopen and\n  per-document view state. `ChangesNavigator` unifies file browsing across the Git\n  panel and Changes; `DiffEditor` adds syntax highlighting and word-level diffs.\n- **A \"What's New\" tab.** When Limboo starts on a version it has not shown you\n  before, the release notes for *that* version open as a workspace tab. Closing it\n  is remembered until the next update. It is available any time from the command\n  palette, and — like Claude Code's own `/release-notes` — it is display-only and\n  never enters the agent's context.\n\n### Fixed\n\n- **The work graph silently discarded whole batches of its own data.** A node\n  whose payload exceeded the size cap was skipped, but the edges pointing at it\n  were still written. `INSERT OR IGNORE` does not suppress a FOREIGN KEY\n  violation, so the failing edge aborted the entire transaction and took every\n  other node and edge in that flush with it — behind a single `logger.warn`.\n  Oversized nodes are now shrunk rather than dropped, every edge's endpoints are\n  proven to exist before insert, and persistent failures surface as a banner in\n  the panel instead of an innocent-looking empty graph.\n- **Orphan cleanup deleted real work.** It removed any node with no edge, which is\n  the normal state of a terminal opened outside a run, a commit made with no agent\n  active, or a service started before the first prompt. Those kinds are now exempt.\n- **Commits could be attributed to the wrong session, or lost entirely.** An\n  unattributable commit was still recorded as \"seen\", so it was dropped\n  permanently at the exact moment its session next became active. It is now only\n  marked seen once it has been attributed. Separately, a `git pull` bringing in\n  upstream commits claimed the current run had implemented its files in every one\n  of them; that fan-out is now limited to commits made after the run started.\n- **Subagent work was spliced into the main timeline.** The `contains`\n  relationship was defined, drawn by the layouter and listed in the legend, but\n  nothing ever emitted it. Subagent nesting now rides the Agent SDK's\n  `parent_tool_use_id`, so a subagent's steps sit inside the node that spawned\n  them. (Cursor's print mode has no subagents, so the branch simply never forks\n  there.)\n- **Permission decisions were never recorded.** Approval nodes were inferred by\n  string-matching a log line's `\"Blocked…\"` prefix, which could not see the answer\n  the user actually gave. They now come from the one decision gate both providers\n  call, carrying the real decision, tool and risk.\n- **Nodes were labelled with the wrong agent.** Provider and mode were read from\n  current settings at write time rather than captured per run, so switching models\n  mid-session silently relabelled a run's history.\n- **Two release gates were not actually verifying anything.** Both were found by\n  checking the published v1.6.0 artifacts by hand rather than trusting a green\n  pipeline:\n  - The Squirrel.Mac layout check — the gate that exists to catch the defect that\n    made every macOS update in v1.5.x impossible — reported \"no macOS update zips\n    in this build\" and passed. It matched on a `-mac.zip` filename suffix, and\n    the packaging fix in 1.6.0 renamed the artifacts to `-<arch>.zip`. The zip\n    list now comes from `latest-mac.yml`, which is naming-independent and\n    authoritative, and a macOS feed with no matching zip is a failure rather than\n    a skip — a build can no longer opt out of its own regression gate.\n  - `SHA256SUMS` listed `limboo-package.cyclonedx.json`, a side-file the SBOM\n    action writes but the upload globs exclude, so `sha256sum -c SHA256SUMS`\n    exited non-zero on an otherwise correct release — discrediting the one\n    verification command the README and release notes give users. It is excluded\n    from the publish set, and a new check fails the build if the manifest names\n    anything that is not being published. (The v1.6.0 manifest was corrected in\n    place; its remaining hashes were always valid.)\n\n### Changed\n\n- **Release notes now come from this file.** The GitHub release body was\n  generated from commit subjects while the changelog was written by hand, so the\n  two said different things about the same release and nothing connected them.\n  The notes generator now reads the section for the tag being released and falls\n  back to the previous commit-subject behaviour only when there isn't one — which\n  also means the notes shown inside the app, the notes on the release page, and\n  this file are the same text by construction.\n- **An active icon is marked by its own color, not a filled block behind it.** In\n  the activity rail, the title-bar tab strip and the settings navigation, the\n  background plate is gone and the glyph takes the accent color. On a pure-black\n  canvas the plate read as a second element competing with the icon it sat\n  behind. Hover still shows it, where it is feedback rather than state.\n\n### Security\n\n- **The graph's secret redactor missed the case its own guide calls out.** It is\n  shared with the Hook Engine, so a gap in it was a gap in two subsystems. It now\n  covers credential-bearing URLs (`https://user:token@host` — a remote typed into\n  a terminal became a node title verbatim), GitHub, AWS and Slack tokens, PEM\n  private-key blocks, JWTs, and generic `secret=`-shaped assignments. Redaction\n  also runs recursively over a node's whole metadata on the single path into the\n  database, rather than only over its title and detail, so a future field is\n  covered without having to opt in.\n- **Export writes to disk without the renderer ever naming a path.** Saving a\n  graph sends only a session id and a format; the main process opens the save\n  dialog and writes wherever you chose. There is no renderer-supplied path, and\n  therefore no traversal surface to defend.\n- **Query inputs are bounded before they are examined.** Array arguments are\n  capped before filtering (an oversized array was previously walked in full),\n  export results are byte-capped, and edge reads are limited instead of unbounded\n  table scans."
  },
  {
    "version": "1.6.0",
    "date": "2026-07-25",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.6.0",
    "commit": null,
    "buildNumber": null,
    "summary": "Repairs in-app updating, which has never worked on macOS and could fail to\ninstall or restart anywhere; adds code signing and a Microsoft Store channel;\nand extends the release to every architecture, including Arch/Manjaro packages\nand arm64 builds for all three platforms.",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "\"Restart & install\" did nothing",
            "text": "Clicking it could leave the app running on\n  the old version, or quit without ever coming back. Four separate causes:\n  - The install request was gated on the UI stage being `downloaded`, but the\n    hourly poll re-emitted `update-available` for the already-downloaded version\n    and moved the stage off it. The click then returned with no log, no error and\n    no feedback of any kind. Staged updates are now tracked by version\n    independently of the UI stage, polling is suspended while an update is\n    staged, and every refusal is logged and surfaced to the user.\n  - **The restart lost a race with itself.** `quitAndInstall` spawns the\n    replacement process synchronously but defers `app.quit()` to the next tick,\n    so the new instance hit `requestSingleInstanceLock()` while the old one still\n    held it and quit itself. The lock is now released before the handoff, and\n    `second-instance` events are ignored while an update is in flight.\n  - **A throwing disposer could keep the app alive.** `before-quit` ran thirteen\n    `dispose()` calls with no error containment; one throw aborted the rest and\n    was swallowed by the global `uncaughtException` handler, leaving the process\n    up with an installer waiting on it. Each disposer is now isolated, and a\n    watchdog forces the exit if the process is still running four seconds after\n    the handoff.\n  - Windows now installs silently (`--updated /S --force-run`). Without `/S` the\n    assisted NSIS wizard re-ran from the first page, which reads as \"nothing\n    happened\"."
          },
          {
            "lead": "macOS auto-update was impossible, and the \"Intel\" downloads were arm64\n  builds",
            "text": "`scripts/dist.mjs` passed the Forge output *directory* to\n  `electron-builder --prepackaged`, but electron-builder treats that value as the\n  `.app` bundle path on macOS. The published update zips were rooted at\n  `Limboo-darwin-arm64/` instead of `Limboo.app/`, which Squirrel.Mac cannot\n  install — they downloaded and checksummed perfectly and then failed, every\n  time. The same misconfiguration made electron-builder wrap that one\n  single-architecture directory once per architecture listed in\n  `electron-builder.yml`, so `Limboo-1.5.1-mac.zip` (\"Intel\") and\n  `Limboo-1.5.1-arm64-mac.zip` were byte-identical. Fixed by pointing\n  `--prepackaged` at the bundle on darwin and removing every explicit `arch:`\n  list, so the architecture comes only from the CI matrix.\n  **Users on v1.5.1 or earlier must download the new `.dmg` once, manually** —\n  those builds cannot auto-update to this release."
          },
          {
            "lead": "Linux `.deb` / `.rpm` installs never received updates",
            "text": "Self-update was\n  disabled unless `APPIMAGE` was set, though electron-updater has supported\n  installing deb, rpm and pacman packages through the system package manager for\n  some time. The app now selects its updater explicitly — `APPIMAGE` first, then\n  the `package-type` marker — which also fixes AppImages that shipped a stale\n  `deb`/`rpm` marker from electron-builder's shared staging directory and so\n  routed AppImage users to the wrong updater."
          }
        ],
        "markdown": "- **\"Restart & install\" did nothing.** Clicking it could leave the app running on\n  the old version, or quit without ever coming back. Four separate causes:\n  - The install request was gated on the UI stage being `downloaded`, but the\n    hourly poll re-emitted `update-available` for the already-downloaded version\n    and moved the stage off it. The click then returned with no log, no error and\n    no feedback of any kind. Staged updates are now tracked by version\n    independently of the UI stage, polling is suspended while an update is\n    staged, and every refusal is logged and surfaced to the user.\n  - **The restart lost a race with itself.** `quitAndInstall` spawns the\n    replacement process synchronously but defers `app.quit()` to the next tick,\n    so the new instance hit `requestSingleInstanceLock()` while the old one still\n    held it and quit itself. The lock is now released before the handoff, and\n    `second-instance` events are ignored while an update is in flight.\n  - **A throwing disposer could keep the app alive.** `before-quit` ran thirteen\n    `dispose()` calls with no error containment; one throw aborted the rest and\n    was swallowed by the global `uncaughtException` handler, leaving the process\n    up with an installer waiting on it. Each disposer is now isolated, and a\n    watchdog forces the exit if the process is still running four seconds after\n    the handoff.\n  - Windows now installs silently (`--updated /S --force-run`). Without `/S` the\n    assisted NSIS wizard re-ran from the first page, which reads as \"nothing\n    happened\".\n- **macOS auto-update was impossible, and the \"Intel\" downloads were arm64\n  builds.** `scripts/dist.mjs` passed the Forge output *directory* to\n  `electron-builder --prepackaged`, but electron-builder treats that value as the\n  `.app` bundle path on macOS. The published update zips were rooted at\n  `Limboo-darwin-arm64/` instead of `Limboo.app/`, which Squirrel.Mac cannot\n  install — they downloaded and checksummed perfectly and then failed, every\n  time. The same misconfiguration made electron-builder wrap that one\n  single-architecture directory once per architecture listed in\n  `electron-builder.yml`, so `Limboo-1.5.1-mac.zip` (\"Intel\") and\n  `Limboo-1.5.1-arm64-mac.zip` were byte-identical. Fixed by pointing\n  `--prepackaged` at the bundle on darwin and removing every explicit `arch:`\n  list, so the architecture comes only from the CI matrix.\n  **Users on v1.5.1 or earlier must download the new `.dmg` once, manually** —\n  those builds cannot auto-update to this release.\n- **Linux `.deb` / `.rpm` installs never received updates.** Self-update was\n  disabled unless `APPIMAGE` was set, though electron-updater has supported\n  installing deb, rpm and pacman packages through the system package manager for\n  some time. The app now selects its updater explicitly — `APPIMAGE` first, then\n  the `package-type` marker — which also fixes AppImages that shipped a stale\n  `deb`/`rpm` marker from electron-builder's shared staging directory and so\n  routed AppImage users to the wrong updater."
      },
      {
        "category": "added",
        "title": "Added",
        "items": [
          {
            "lead": "A code-signing pipeline",
            "text": "Developer ID signing + notarization for macOS\n  (hardened runtime + entitlements) — which is also what makes macOS auto-update\n  possible at all, since Squirrel.Mac refuses to update an app it cannot verify —\n  and Authenticode for Windows, with Azure Trusted Signing wired and dormant\n  beside a self-signed route. Note that a self-signed certificate does **not**\n  remove the SmartScreen warning; it is documented as such. The whole path is\n  opt-in from environment credentials (`scripts/signing.cjs`), so builds without\n  them — **including this release** — are unsigned and behave exactly as before.\n  Because signing runs in Forge rather than electron-builder — `--prepackaged`\n  skips the pack step where electron-builder would sign — the split is documented\n  in [code signing](docs/ci/code-signing.md)."
          },
          {
            "lead": "A Microsoft Store (MSIX) channel",
            "text": ", the only warning-free Windows route that\n  does not require buying a certificate. Store builds disable self-update, since\n  the Store owns updates there. See\n  [microsoft-store.md](docs/operations/microsoft-store.md)."
          },
          {
            "lead": "Wider platform coverage",
            "text": "Linux gains `pacman` (Arch/Manjaro) and `tar.gz`\n  targets, and every platform now publishes both x64 and arm64. The\n  architectures GitLab's SaaS runners cannot build — macOS Intel, arm64 Linux,\n  arm64 Windows — are produced by a new tag-triggered\n  `release-supplement.yml` workflow that uploads into the same release."
          },
          {
            "lead": "Release gates for the failures above",
            "text": "`ci/scripts/verify-artifacts.mjs` asserts the macOS zip root, that no two\n  artifacts in an update feed share a hash, that every file a feed references\n  exists, and that debug output stays out of the publish set.\n  `ci/scripts/verify-signing.mjs` gained a Gatekeeper assessment and enforces the\n  Windows `publisherName` invariant.\n  `ci/scripts/merge-update-metadata.mjs` merges the per-runner update feeds, so a\n  supplementary upload adds an architecture instead of deleting one."
          },
          {
            "lead": null,
            "text": "[auto-update.md](docs/operations/auto-update.md) — the per-platform update\n  mechanism and the invariants that must not be broken."
          },
          {
            "lead": null,
            "text": "Documentation subsystem: landing `README`, a structured `docs/` site (getting\n  started, concepts, guides, reference, architecture, operations), community-health\n  files (`LICENSE`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`, `ROADMAP`,\n  `SUPPORT`, `GOVERNANCE`, `AUTHORS`, `CITATION.cff`), and `.github/` automation\n  (CI, CodeQL, Dependabot, issue/PR templates)."
          }
        ],
        "markdown": "- **A code-signing pipeline.** Developer ID signing + notarization for macOS\n  (hardened runtime + entitlements) — which is also what makes macOS auto-update\n  possible at all, since Squirrel.Mac refuses to update an app it cannot verify —\n  and Authenticode for Windows, with Azure Trusted Signing wired and dormant\n  beside a self-signed route. Note that a self-signed certificate does **not**\n  remove the SmartScreen warning; it is documented as such. The whole path is\n  opt-in from environment credentials (`scripts/signing.cjs`), so builds without\n  them — **including this release** — are unsigned and behave exactly as before.\n  Because signing runs in Forge rather than electron-builder — `--prepackaged`\n  skips the pack step where electron-builder would sign — the split is documented\n  in [code signing](docs/ci/code-signing.md).\n- **A Microsoft Store (MSIX) channel**, the only warning-free Windows route that\n  does not require buying a certificate. Store builds disable self-update, since\n  the Store owns updates there. See\n  [microsoft-store.md](docs/operations/microsoft-store.md).\n- **Wider platform coverage.** Linux gains `pacman` (Arch/Manjaro) and `tar.gz`\n  targets, and every platform now publishes both x64 and arm64. The\n  architectures GitLab's SaaS runners cannot build — macOS Intel, arm64 Linux,\n  arm64 Windows — are produced by a new tag-triggered\n  `release-supplement.yml` workflow that uploads into the same release.\n- **Release gates for the failures above.**\n  `ci/scripts/verify-artifacts.mjs` asserts the macOS zip root, that no two\n  artifacts in an update feed share a hash, that every file a feed references\n  exists, and that debug output stays out of the publish set.\n  `ci/scripts/verify-signing.mjs` gained a Gatekeeper assessment and enforces the\n  Windows `publisherName` invariant.\n  `ci/scripts/merge-update-metadata.mjs` merges the per-runner update feeds, so a\n  supplementary upload adds an architecture instead of deleting one.\n- [auto-update.md](docs/operations/auto-update.md) — the per-platform update\n  mechanism and the invariants that must not be broken.\n- Documentation subsystem: landing `README`, a structured `docs/` site (getting\n  started, concepts, guides, reference, architecture, operations), community-health\n  files (`LICENSE`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`, `ROADMAP`,\n  `SUPPORT`, `GOVERNANCE`, `AUTHORS`, `CITATION.cff`), and `.github/` automation\n  (CI, CodeQL, Dependabot, issue/PR templates)."
      },
      {
        "category": "security",
        "title": "Security",
        "items": [
          {
            "lead": null,
            "text": "Windows update-signature verification is pinned off\n  (`win.verifyUpdateCodeSignature: false`) while the self-signed route is in use,\n  and enforced in CI. Left at its default, electron-builder derives\n  `publisherName` from the certificate CN and writes it into `app-update.yml`;\n  electron-updater would then demand a trusted Authenticode chain that a\n  self-signed certificate can never satisfy, breaking every Windows update with\n  no recovery short of a manual reinstall."
          }
        ],
        "markdown": "- Windows update-signature verification is pinned off\n  (`win.verifyUpdateCodeSignature: false`) while the self-signed route is in use,\n  and enforced in CI. Left at its default, electron-builder derives\n  `publisherName` from the certificate CN and writes it into `app-update.yml`;\n  electron-updater would then demand a trusted Authenticode chain that a\n  self-signed certificate can never satisfy, breaking every Windows update with\n  no recovery short of a manual reinstall."
      },
      {
        "category": "changed",
        "title": "Changed",
        "items": [
          {
            "lead": "Integrated Terminal",
            "text": "— pinned `node-pty` to the `1.2.0-beta` line,\n  Microsoft's in-progress rewrite of the native addon on Node-API\n  (`node-addon-api`) instead of NAN. The compiled binary is ABI-stable across\n  Node.js *and* Electron major versions, so the per-platform prebuilt bundled\n  in the npm package works as-is — no `node-gyp` rebuild, no Visual Studio\n  Build Tools requirement, for any Electron version including future ones.\n  `forge.config.ts`'s `rebuildConfig.ignoreModules` excludes `node-pty` from\n  Electron Forge's native-rebuild pass, since `@electron/rebuild` doesn't know\n  the bundled prebuilt is already correct and would otherwise try (and fail\n  without the toolchain) to recompile it. No terminal behavior change. (An\n  earlier attempt at this used `@homebridge/node-pty-prebuilt-multiarch`, a\n  NAN-based fork — verified afterward to have no published prebuilt past\n  roughly Electron 29's ABI, so it didn't actually fix the problem; superseded\n  by this change.) See [installation](docs/getting-started/installation.md)."
          }
        ],
        "markdown": "- **Integrated Terminal** — pinned `node-pty` to the `1.2.0-beta` line,\n  Microsoft's in-progress rewrite of the native addon on Node-API\n  (`node-addon-api`) instead of NAN. The compiled binary is ABI-stable across\n  Node.js *and* Electron major versions, so the per-platform prebuilt bundled\n  in the npm package works as-is — no `node-gyp` rebuild, no Visual Studio\n  Build Tools requirement, for any Electron version including future ones.\n  `forge.config.ts`'s `rebuildConfig.ignoreModules` excludes `node-pty` from\n  Electron Forge's native-rebuild pass, since `@electron/rebuild` doesn't know\n  the bundled prebuilt is already correct and would otherwise try (and fail\n  without the toolchain) to recompile it. No terminal behavior change. (An\n  earlier attempt at this used `@homebridge/node-pty-prebuilt-multiarch`, a\n  NAN-based fork — verified afterward to have no published prebuilt past\n  roughly Electron 29's ABI, so it didn't actually fix the problem; superseded\n  by this change.) See [installation](docs/getting-started/installation.md)."
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
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.6.0",
      "compare": "https://github.com/limboo-ai/limboo/compare/v1.5.1...v1.6.0",
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.6.0",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "Repairs in-app updating, which has never worked on macOS and could fail to\ninstall or restart anywhere; adds code signing and a Microsoft Store channel;\nand extends the release to every architecture, including Arch/Manjaro packages\nand arm64 builds for all three platforms.\n\n### Fixed\n\n- **\"Restart & install\" did nothing.** Clicking it could leave the app running on\n  the old version, or quit without ever coming back. Four separate causes:\n  - The install request was gated on the UI stage being `downloaded`, but the\n    hourly poll re-emitted `update-available` for the already-downloaded version\n    and moved the stage off it. The click then returned with no log, no error and\n    no feedback of any kind. Staged updates are now tracked by version\n    independently of the UI stage, polling is suspended while an update is\n    staged, and every refusal is logged and surfaced to the user.\n  - **The restart lost a race with itself.** `quitAndInstall` spawns the\n    replacement process synchronously but defers `app.quit()` to the next tick,\n    so the new instance hit `requestSingleInstanceLock()` while the old one still\n    held it and quit itself. The lock is now released before the handoff, and\n    `second-instance` events are ignored while an update is in flight.\n  - **A throwing disposer could keep the app alive.** `before-quit` ran thirteen\n    `dispose()` calls with no error containment; one throw aborted the rest and\n    was swallowed by the global `uncaughtException` handler, leaving the process\n    up with an installer waiting on it. Each disposer is now isolated, and a\n    watchdog forces the exit if the process is still running four seconds after\n    the handoff.\n  - Windows now installs silently (`--updated /S --force-run`). Without `/S` the\n    assisted NSIS wizard re-ran from the first page, which reads as \"nothing\n    happened\".\n- **macOS auto-update was impossible, and the \"Intel\" downloads were arm64\n  builds.** `scripts/dist.mjs` passed the Forge output *directory* to\n  `electron-builder --prepackaged`, but electron-builder treats that value as the\n  `.app` bundle path on macOS. The published update zips were rooted at\n  `Limboo-darwin-arm64/` instead of `Limboo.app/`, which Squirrel.Mac cannot\n  install — they downloaded and checksummed perfectly and then failed, every\n  time. The same misconfiguration made electron-builder wrap that one\n  single-architecture directory once per architecture listed in\n  `electron-builder.yml`, so `Limboo-1.5.1-mac.zip` (\"Intel\") and\n  `Limboo-1.5.1-arm64-mac.zip` were byte-identical. Fixed by pointing\n  `--prepackaged` at the bundle on darwin and removing every explicit `arch:`\n  list, so the architecture comes only from the CI matrix.\n  **Users on v1.5.1 or earlier must download the new `.dmg` once, manually** —\n  those builds cannot auto-update to this release.\n- **Linux `.deb` / `.rpm` installs never received updates.** Self-update was\n  disabled unless `APPIMAGE` was set, though electron-updater has supported\n  installing deb, rpm and pacman packages through the system package manager for\n  some time. The app now selects its updater explicitly — `APPIMAGE` first, then\n  the `package-type` marker — which also fixes AppImages that shipped a stale\n  `deb`/`rpm` marker from electron-builder's shared staging directory and so\n  routed AppImage users to the wrong updater.\n\n### Added\n\n- **A code-signing pipeline.** Developer ID signing + notarization for macOS\n  (hardened runtime + entitlements) — which is also what makes macOS auto-update\n  possible at all, since Squirrel.Mac refuses to update an app it cannot verify —\n  and Authenticode for Windows, with Azure Trusted Signing wired and dormant\n  beside a self-signed route. Note that a self-signed certificate does **not**\n  remove the SmartScreen warning; it is documented as such. The whole path is\n  opt-in from environment credentials (`scripts/signing.cjs`), so builds without\n  them — **including this release** — are unsigned and behave exactly as before.\n  Because signing runs in Forge rather than electron-builder — `--prepackaged`\n  skips the pack step where electron-builder would sign — the split is documented\n  in [code signing](docs/ci/code-signing.md).\n- **A Microsoft Store (MSIX) channel**, the only warning-free Windows route that\n  does not require buying a certificate. Store builds disable self-update, since\n  the Store owns updates there. See\n  [microsoft-store.md](docs/operations/microsoft-store.md).\n- **Wider platform coverage.** Linux gains `pacman` (Arch/Manjaro) and `tar.gz`\n  targets, and every platform now publishes both x64 and arm64. The\n  architectures GitLab's SaaS runners cannot build — macOS Intel, arm64 Linux,\n  arm64 Windows — are produced by a new tag-triggered\n  `release-supplement.yml` workflow that uploads into the same release.\n- **Release gates for the failures above.**\n  `ci/scripts/verify-artifacts.mjs` asserts the macOS zip root, that no two\n  artifacts in an update feed share a hash, that every file a feed references\n  exists, and that debug output stays out of the publish set.\n  `ci/scripts/verify-signing.mjs` gained a Gatekeeper assessment and enforces the\n  Windows `publisherName` invariant.\n  `ci/scripts/merge-update-metadata.mjs` merges the per-runner update feeds, so a\n  supplementary upload adds an architecture instead of deleting one.\n- [auto-update.md](docs/operations/auto-update.md) — the per-platform update\n  mechanism and the invariants that must not be broken.\n- Documentation subsystem: landing `README`, a structured `docs/` site (getting\n  started, concepts, guides, reference, architecture, operations), community-health\n  files (`LICENSE`, `CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`, `ROADMAP`,\n  `SUPPORT`, `GOVERNANCE`, `AUTHORS`, `CITATION.cff`), and `.github/` automation\n  (CI, CodeQL, Dependabot, issue/PR templates).\n\n### Security\n\n- Windows update-signature verification is pinned off\n  (`win.verifyUpdateCodeSignature: false`) while the self-signed route is in use,\n  and enforced in CI. Left at its default, electron-builder derives\n  `publisherName` from the certificate CN and writes it into `app-update.yml`;\n  electron-updater would then demand a trusted Authenticode chain that a\n  self-signed certificate can never satisfy, breaking every Windows update with\n  no recovery short of a manual reinstall.\n\n### Changed\n\n- **Integrated Terminal** — pinned `node-pty` to the `1.2.0-beta` line,\n  Microsoft's in-progress rewrite of the native addon on Node-API\n  (`node-addon-api`) instead of NAN. The compiled binary is ABI-stable across\n  Node.js *and* Electron major versions, so the per-platform prebuilt bundled\n  in the npm package works as-is — no `node-gyp` rebuild, no Visual Studio\n  Build Tools requirement, for any Electron version including future ones.\n  `forge.config.ts`'s `rebuildConfig.ignoreModules` excludes `node-pty` from\n  Electron Forge's native-rebuild pass, since `@electron/rebuild` doesn't know\n  the bundled prebuilt is already correct and would otherwise try (and fail\n  without the toolchain) to recompile it. No terminal behavior change. (An\n  earlier attempt at this used `@homebridge/node-pty-prebuilt-multiarch`, a\n  NAN-based fork — verified afterward to have no published prebuilt past\n  roughly Electron 29's ABI, so it didn't actually fix the problem; superseded\n  by this change.) See [installation](docs/getting-started/installation.md)."
  },
  {
    "version": "1.5.1",
    "date": "2026-07-25",
    "channel": "stable",
    "codename": null,
    "gitTag": "v1.5.1",
    "commit": null,
    "buildNumber": null,
    "summary": "",
    "sections": [
      {
        "category": "fixed",
        "title": "Fixed",
        "items": [
          {
            "lead": "Linux packages could not launch",
            "text": "`electron-builder.yml` set no\n  `linux.executableName`, so electron-builder derived every Linux launcher path\n  from the package name (`limboo`, lowercase) while Electron Forge — which owns\n  packaging and hands the result over via `--prepackaged` — produced the binary\n  as `Limboo`. On a case-sensitive filesystem that mismatch broke all three\n  Linux artifacts in v1.5.0: the AppImage's `AppRun` exec'd a non-existent\n  `limboo` and failed to start at all, and the deb/rpm shipped a\n  `.desktop` entry pointing at `/opt/Limboo/limboo` plus a dangling\n  `/usr/bin/limboo` symlink. Windows and macOS were unaffected. The application\n  itself was never broken — only the launchers around it."
          }
        ],
        "markdown": "- **Linux packages could not launch.** `electron-builder.yml` set no\n  `linux.executableName`, so electron-builder derived every Linux launcher path\n  from the package name (`limboo`, lowercase) while Electron Forge — which owns\n  packaging and hands the result over via `--prepackaged` — produced the binary\n  as `Limboo`. On a case-sensitive filesystem that mismatch broke all three\n  Linux artifacts in v1.5.0: the AppImage's `AppRun` exec'd a non-existent\n  `limboo` and failed to start at all, and the deb/rpm shipped a\n  `.desktop` entry pointing at `/opt/Limboo/limboo` plus a dangling\n  `/usr/bin/limboo` symlink. Windows and macOS were unaffected. The application\n  itself was never broken — only the launchers around it."
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
      "release": "https://github.com/limboo-ai/limboo/releases/tag/v1.5.1",
      "compare": "https://github.com/limboo-ai/limboo/compare/v1.5.0...v1.5.1",
      "tag": "https://github.com/limboo-ai/limboo/releases/tag/v1.5.1",
      "milestone": null
    },
    "checksumManifest": "SHA256SUMS",
    "provenanceRepo": "limboo-ai/limboo",
    "markdown": "### Fixed\n\n- **Linux packages could not launch.** `electron-builder.yml` set no\n  `linux.executableName`, so electron-builder derived every Linux launcher path\n  from the package name (`limboo`, lowercase) while Electron Forge — which owns\n  packaging and hands the result over via `--prepackaged` — produced the binary\n  as `Limboo`. On a case-sensitive filesystem that mismatch broke all three\n  Linux artifacts in v1.5.0: the AppImage's `AppRun` exec'd a non-existent\n  `limboo` and failed to start at all, and the deb/rpm shipped a\n  `.desktop` entry pointing at `/opt/Limboo/limboo` plus a dangling\n  `/usr/bin/limboo` symlink. Windows and macOS were unaffected. The application\n  itself was never broken — only the launchers around it."
  }
];

/** Every released version, newest first. */
export const RELEASE_INDEX: ReleaseIndexEntry[] = [
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
    "detailed": true
  },
  {
    "version": "1.6.0",
    "date": "2026-07-25",
    "channel": "stable",
    "summary": "Repairs in-app updating, which has never worked on macOS and could fail to\ninstall or restart anywhere; adds code signing and a Microsoft Store channel;\nand extends the release to every architecture, including Arch/Manjaro packages\nand arm64 builds for all three platforms.",
    "detailed": true
  },
  {
    "version": "1.5.1",
    "date": "2026-07-25",
    "channel": "stable",
    "summary": "",
    "detailed": true
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
