# Auto-update

How Limboo updates itself, what differs per platform, and the invariants that
must not be broken. Implementation:
[`src/main/managers/AutoUpdateManager.ts`](../../src/main/managers/AutoUpdateManager.ts).

Limboo uses `electron-updater` against this repository's GitHub Releases. The
feed is public and read-only, so no update credentials are stored anywhere.

## The flow

1. Eight seconds after launch (and hourly after that, if **Check automatically**
   is on) the app fetches `latest.yml` / `latest-mac.yml` / `latest-linux.yml`
   from the latest release.
2. A newer version surfaces as a bottom strip and a Settings badge.
3. The download runs in the background, with progress on the taskbar/dock.
4. **Restart & install** hands the staged installer to the OS and quits.

Polling is suspended while an update is staged. Re-checking would re-emit
`update-available` for the version already downloaded and move the state machine
off `downloaded`, which is what used to turn the install button into a silent
no-op.

## Per-platform mechanics

| Platform | Mechanism | Requires |
| --- | --- | --- |
| Windows (NSIS) | Runs the downloaded installer with `--updated /S --force-run` | — |
| macOS | Squirrel.Mac, fed the update zip over a loopback proxy | **A valid code signature** |
| Linux AppImage | Replaces the AppImage in place, then re-execs it | `APPIMAGE` in the environment |
| Linux deb / rpm / pacman | `dpkg`/`apt`, `zypper`/`dnf`/`yum`/`rpm`, `pacman` via `pkexec`/`sudo` | A graphical sudo prompt |
| Microsoft Store (MSIX) | **Disabled** — the Store owns updates | — |

Windows uses silent mode deliberately. Limboo's NSIS installer is the assisted
(multi-page) kind, and a non-silent update re-runs the whole wizard, which reads
to users as "clicking the button did nothing".

## Invariants

### macOS builds must be signed

Squirrel.Mac refuses to install an update into an app whose signature it cannot
verify. An unsigned or ad-hoc-signed macOS build therefore *cannot* self-update,
no matter how healthy the rest of the pipeline is. `AutoUpdateManager` probes
this at startup with `codesign -dv` and reports updates as disabled with a
reason, rather than offering a button that fails after a ~240 MB download.

### macOS update zips must be rooted at `Limboo.app/`

Squirrel.Mac unpacks the zip and expects the `.app` at its root. This is decided
by what `scripts/dist.mjs` passes to `electron-builder --prepackaged`: on macOS
that value is treated as the `.app` bundle path, not as a containing directory.
Passing the directory produces a zip rooted at `Limboo-darwin-arm64/`, which
downloads and verifies perfectly and then never installs.

`ci/scripts/verify-artifacts.mjs` asserts the zip root on every release.

### Windows must not advertise a `publisherName`

`electron-updater` runs an Authenticode check on the downloaded installer only
when `app-update.yml` carries a `publisherName`, and that check requires
`Get-AuthenticodeSignature ... Status == Valid`. The current Windows signing
route is a self-signed certificate, which is in no user's trust store and so can
never be Valid. Publishing a `publisherName` alongside it makes **every** Windows
update fail with "New version is not signed by the application owner", and the
only fix for an affected user is a manual reinstall.

Omitting the key is not sufficient on its own: at its default `true`,
`win.verifyUpdateCodeSignature` makes electron-builder *derive* `publisherName`
from the signing certificate's CN and write it into `app-update.yml` for you.
`electron-builder.yml` therefore pins `verifyUpdateCodeSignature: false`, and
`scripts/signing.cjs` turns it back on only for the Azure Trusted Signing route,
where the chain genuinely is trusted.

`ci/scripts/verify-signing.mjs` asserts both halves on every build.

### No architecture may be published under another's name

With `--prepackaged`, an explicit `arch:` list in a target overrides the CLI arch
flag, and electron-builder wraps the same single-architecture directory once per
listed arch. That is how v1.5.1 shipped an "Intel" dmg and zip that were
byte-identical to the arm64 build. Every target list in `electron-builder.yml` is
deliberately arch-free; the architecture comes from `scripts/dist.mjs` and the CI
matrix supplies one runner per architecture.

`ci/scripts/verify-artifacts.mjs` fails the build if two artifacts in a feed
share a sha512.

### Update feeds must be merged, never overwritten

Each runner writes a feed describing only the artifacts it built. Uploading the
Intel runner's `latest-mac.yml` over the Apple-silicon runner's does not add
Intel support — it removes arm64 from the feed. `ci/scripts/merge-update-metadata.mjs`
unions the `files:` arrays; the release-supplement workflow runs it against the
feeds already attached to the release.

## Which Linux updater runs

`electron-updater`'s own dispatch reads `{resources}/package-type` and lets it
**override** the AppImage default. In this repo's hybrid build every Linux target
shares one staged app directory, so electron-builder's `FpmTarget` can leave a
stale `deb`/`rpm` marker inside the AppImage.

`AutoUpdateManager` therefore selects the implementation itself, in this order:

1. `APPIMAGE` is set → `AppImageUpdater` (if we are running as an AppImage, that
   is what has to be replaced, whatever marker file is baked in).
2. `{resources}/package-type` → `DebUpdater` / `RpmUpdater` / `PacmanUpdater`.
3. Neither → updates disabled, with a reason.

## AppImage filenames change on update

The new AppImage lands under the new release's filename and the old file is
deleted, so a `.desktop` entry or dock pin aimed at the old path stops working.
This is standard AppImage behaviour, not a failure — the app listens for
`appimage-filename-updated` and notifies the user of the new path.

## Reproducing an update locally

```bash
npm run dist -- --publish never
node ci/scripts/verify-artifacts.mjs dist

./dist/limboo-*.AppImage                        # run from a terminal
tail -f ~/.config/Limboo/logs/limboo-main.log   # watch the [updater] lines
```

A healthy install logs `[updater] using AppImageUpdater`, then
`Install on explicit quitAndInstall`, then the process exits and a new one
starts. Updates are inert in dev (`npm start`) — there is no `app-update.yml`
outside a packaged build, and the Settings panel says so.

## Why quitting is now forced

`quitAndInstall` spawns the replacement process **synchronously** and only then
defers `app.quit()` to the next tick. Two things used to go wrong there:

- The new process lost the `requestSingleInstanceLock()` race against the still
  running old one and quit itself. The lock is now released *before* the handoff,
  and the `second-instance` handler ignores events while an update is in flight.
- A throwing disposer in `before-quit` aborted the rest of the teardown and got
  swallowed by the global `uncaughtException` handler, leaving the process alive
  with an installer waiting on it. Each disposer is now individually contained,
  and a watchdog forces `app.exit(0)` if the process is still up four seconds
  after the handoff.

## After the update: the release document

An update that installs silently and says nothing is a maintenance task. Limboo
turns it into a workspace document instead.

**The rule.** On launch, once settings have hydrated, the renderer compares
`app.getVersion()` against `settings.updates.lastSeenVersion`. When they differ and
this build carries notes for the running version, the release document opens once as
a workspace tab. Closing it acknowledges the version. Nothing else opens it
automatically; the command palette (`What's New in this version`) is the way back.

Three details that are easy to get wrong, and are handled:

- **Dismissal is detected as an open→closed transition**, not wired to the close
  button — so the X, middle-click, "close others", "close all" and the palette all
  count as acknowledgement. A close button that only worked when clicked directly
  would silently reopen the tab forever.
- **Auto-open is latched per app run** (module scope, not component state):
  `CenterWorkspace` remounts on layout changes, and the version is not marked seen
  until the tab is closed, so without the latch closing it would immediately reopen
  it.
- **The tab is never persisted.** `useDocumentStore.persist()` skips
  `release-notes` refs explicitly, and `PersistedDocumentKind` cannot represent them
  — reopening it every launch is exactly what "dismiss until the next update" exists
  to prevent.

**Why the notes are compiled in rather than downloaded.** `UpdateInfo.releaseNotes`
describes the version being *offered*, is HTML-stripped and capped on its way
through the updater, and lives only in memory — so it is gone by the time the new
version boots and can never answer "what did I just get?". The bundled data always
matches the running build, needs no network, and works in development. The
production CSP (`connect-src 'self'`) means there is no other option that would
work anyway.

**What it shows, and what it refuses to show.** The document renders the release
manifest (see [release-process §4b](../ci/release-process.md#4b-the-release-manifest)):
version, channel, tag, commit, build number, the structured changelog sections,
contributors, pull requests and merged branches. Per-asset SHA-256 digests are NOT
in the bundled manifest — a build cannot contain the hash of an installer produced
from it — so the Verification section shows the `sha256sum -c SHA256SUMS` and
`gh attestation verify` commands and links to the release page instead of printing a
digest it cannot stand behind. Facts about the *running process* (platform, arch,
Electron/Chromium versions, packaged state, macOS signing authority) come from
`update:getBuildInfo` and are shown in their own group, because a claim about a
download and a measurement of what is executing are different kinds of statement.

**The document is display-only.** It is never added to an agent context provider.
Claude Code shipped a fix for exactly that bug, where its release-notes view
injected the whole changelog into every subsequent request. The agent can still
answer "what changed in 1.7.0?" — by calling the read-only `list_releases` /
`release_notes` tools on the `limboo_search` MCP server when it is actually asked.

## Related

- [`docs/ci/code-signing.md`](../ci/code-signing.md) — signing secrets per platform
- [`docs/operations/microsoft-store.md`](microsoft-store.md) — the MSIX channel
- [`docs/ci/release-process.md`](../ci/release-process.md) — how a release is cut
