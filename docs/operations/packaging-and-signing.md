# Packaging and signing

Limboo uses a **hybrid two-tool build**. This page covers producing distributable
artifacts; the signing credentials themselves are documented in
[`docs/ci/code-signing.md`](../ci/code-signing.md).

## Commands

```bash
npm run package   # Forge only: package into a runnable app dir (no installers)
npm run dist      # package + electron-builder -> branded installers in dist/
npm run make      # alias for `npm run dist`
npm run publish   # alias for `npm run dist:publish` (build + upload)
```

There is no `npm run dev` — use `npm start`.

## How the two tools divide the work

**Electron Forge** owns dev (`npm start`) and app packaging: the Vite build, the
security fuses, and the asar / asar-unpack layout. It has **no makers**
(`forge.config.ts` sets `makers: []`).

**electron-builder** then runs over that already-packaged directory via
`--prepackaged` ([`scripts/dist.mjs`](../../scripts/dist.mjs)), so it never
re-packs the app — the fuses and asar integrity Forge applied are preserved — and
only produces the branded installer targets plus the `latest*.yml` auto-update
metadata.

### Targets

| Platform | Targets |
| -------- | ------- |
| Windows  | NSIS (assisted wizard); `appx` when Store identity values are set |
| macOS    | dmg + zip (the zip is what Squirrel.Mac consumes) |
| Linux    | AppImage, deb, rpm, pacman, tar.gz |

Architectures come from the CI matrix, one runner per architecture: x64 and arm64
on all three platforms.

### Two things that must not be changed casually

**`--prepackaged` means something different on macOS.** electron-builder treats
the value as the `.app` bundle path there, and as the containing directory on
Windows and Linux. `scripts/dist.mjs` handles this; getting it wrong produces a
dmg wrapping a folder and an update zip Squirrel.Mac can never install.

**No target may declare an explicit `arch:` list.** An `arch:` array overrides
the CLI arch flag, and electron-builder then wraps the same
single-architecture directory once per listed arch — publishing one build under
several architecture names.

Both are asserted on every release by
[`ci/scripts/verify-artifacts.mjs`](../../ci/scripts/verify-artifacts.mjs).

## Native modules

Three dependencies are native. `better-sqlite3` is built per target platform /
Node ABI. `node-pty` (pinned to the Node-API `1.2.0-beta` line) and
`sherpa-onnx-node` ship ABI-stable prebuilts and are excluded from Electron
Forge's native-rebuild pass (`forge.config.ts` `rebuildConfig.ignoreModules`).
The Forge `auto-unpack-natives` plugin keeps them runnable from the packaged app.

Build on (or for) each target platform: cross-building native modules is not
configured, which is why the CI matrix uses a native runner per architecture
rather than cross-compiling. This is not merely a preference for deb/rpm —
electron-builder shells out to `fpm`, which will happily produce x64 binaries
inside an arm64-labelled package.

## Build-output naming

Both process entries are `index.ts`; their bundle names are pinned in the Vite
configs (`main.js` via `build.lib.fileName`, `preload.js` via
`rollupOptions.output.entryFileNames`) so they do not collide on `index.js`. These
must match `package.json` `main` and the `preload.js` path in `createWindow.ts`. Do
not introduce an entry that collides on basename. See [`CLAUDE.md`](../../CLAUDE.md)
§6.

## Fuses

Electron fuses are configured via `@electron-forge/plugin-fuses` /
`@electron/fuses` in the Forge config; review them when changing the security posture
of the packaged binary. The plugin hooks `packageAfterCopy`, which runs before
packager's signing step — so fuse injection cannot invalidate a signature.

## Code signing

Signing is opt-in and driven entirely by environment secrets, resolved in
[`scripts/signing.cjs`](../../scripts/signing.cjs). Current state:

- **macOS** — Developer ID signing + notarization, active when `CSC_LINK` and the
  Apple credentials are present. Required for auto-update to work at all.
- **Windows** — a self-signed certificate by default (free; SmartScreen still
  warns), with Azure Trusted Signing wired and dormant. A Microsoft Store MSIX
  channel is the warning-free route.
- **Linux** — no signing mechanism; integrity via `SHA256SUMS` and build
  provenance attestation.

Full details, secret names, and the Windows `publisherName` invariant:
[`docs/ci/code-signing.md`](../ci/code-signing.md).

## Regenerating branded art

```bash
npm run gen:icons      # runtime app/tray icons + icon.ico from assets/icon.svg
npm run gen:installer  # Windows installer art (.ico + NSIS BMPs)
npm run gen:appx       # Microsoft Store tiles
```
