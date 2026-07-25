# Release process

This page is for maintainers cutting a release. Limboo is packaged with Electron
Forge; releases are driven from the `main` branch.

## Prerequisites

- A clean `main` with all intended changes merged and verified.
- `npm run lint` and `npx vite build --config vite.renderer.config.mts` pass.
- The app starts and smoke-tests via `npm start`.

## Steps

1. **Decide the version.** Follow [versioning](versioning.md) (SemVer).
   **Do NOT edit `package.json`** — versioning is tag-driven: every CI job that
   reads the version first runs `ci/scripts/apply-tag-version.mjs`, which stamps
   the tag's version into `package.json` (and the lockfile) at build time. The
   committed version is a dev placeholder, and `ci/scripts/check-manifest.mjs`
   verifies the stamped value matches the tag.
2. **Update the changelog.** Move the `Unreleased` items in
   [CHANGELOG.md](../../CHANGELOG.md) into a new version section with the date, and
   refresh the compare links.
3. **Commit and tag.** Commit the changelog, then tag `vX.Y.Z` and
   `git push origin vX.Y.Z` (fans out to GitLab — the source of truth — and the
   GitHub mirror). The tag triggers the GitLab release pipeline, and separately
   the GitHub Actions `release-supplement.yml` workflow, which adds the
   architectures GitLab's runners cannot build (macOS Intel, arm64 Linux, arm64
   Windows) to the same release. Tagging a commit that already carries a `v*` tag
   is rejected by `ci/scripts/check-tag-unique.mjs`.
4. **Build artifacts.**
   ```bash
   npm run package   # runnable bundle (no installers)
   npm run dist      # branded installers + auto-update metadata into dist/
   ```
   `npm run dist` runs `electron-forge package` then electron-builder
   (`--prepackaged`) to produce the branded NSIS / dmg / AppImage installers and the
   `latest*.yml` auto-update metadata. See
   [installer and updates](installer-and-updates.md) and
   [packaging and signing](packaging-and-signing.md).
5. **Publish.** The GitLab pipeline publishes automatically on a `v*` tag — an
   identical GitLab Release and GitHub Release (see
   [release-process](../ci/release-process.md)). For a manual fallback use
   `npm run dist:publish` (with `GH_TOKEN` set) or attach `dist/*` — installers,
   `latest*.yml`, and `*.blockmap` — to the GitHub release with the `gh` CLI.
6. **Verify the release.** Download an artifact from both hosts and confirm it
   launches.

## Release checklist

- [ ] `main` is green (CI passed).
- [ ] `package.json` version left ALONE (the tag supplies it).
- [ ] `CHANGELOG.md` updated with date and compare links.
- [ ] Tag `vX.Y.Z` created on a commit that carries no other `v*` tag.
- [ ] Artifacts built (`npm run dist`) and smoke-tested.
- [ ] `ci/scripts/verify-artifacts.mjs` passed on the assembled publish set.
- [ ] GitLab + GitHub releases published with notes and artifacts.
- [ ] The extra architectures from `release-supplement.yml` landed on the release.
- [ ] An in-app update from the PREVIOUS release actually installs and relaunches.

## Notes

- Signing status differs per platform — macOS is signed and notarized, Windows is
  self-signed (SmartScreen still warns), Linux has no signing mechanism. See
  [packaging and signing](packaging-and-signing.md) and
  [code signing](../ci/code-signing.md).
- The last checklist item is not optional. Checksums and signatures cannot detect
  a structurally broken update artifact — v1.5.1 shipped macOS downloads that
  verified perfectly and could never install. See
  [auto-update](auto-update.md).
- There is no separate backend or cloud component to deploy — Limboo is local-first.
