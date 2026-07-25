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

## Related

- [`docs/ci/code-signing.md`](../ci/code-signing.md) — signing secrets per platform
- [`docs/operations/microsoft-store.md`](microsoft-store.md) — the MSIX channel
- [`docs/ci/release-process.md`](../ci/release-process.md) — how a release is cut
