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

   This file is the **single source of the release notes**. The section you write
   here becomes the GitHub/GitLab release body verbatim —
   `ci/scripts/generate-release-notes.mjs` reads it and only falls back to
   categorized commit subjects when a tag has no section — and the same text is
   what the app shows in its **What's New** tab. Preview the body before tagging:

   ```bash
   node ci/scripts/generate-release-notes.mjs vX.Y.Z
   ```

   It prints which source it used to stderr, so a release that silently fell back
   to commit subjects is visible rather than discovered on the release page.
3. **Regenerate the bundled release data.** `npm run gen:notes` rewrites BOTH
   `src/shared/releaseNotes.generated.ts` (the changelog section as Markdown) and
   `src/shared/releaseManifest.generated.ts` (the same releases parsed into the
   structure the in-app release document renders, plus an index of every released
   version). Commit both with the changelog — they are generated but committed, so
   the notes are reviewable in the diff and a build never depends on the script
   having been run.

   CI enforces this with `npm run gen:notes -- --check`, which writes nothing and
   fails when either file has drifted from `CHANGELOG.md`. It used to be a
   checklist item with nothing behind it.

   The git-derived half of the manifest (commit, build number, contributors, pull
   requests, merged branches, stats) is **not** filled in here — a laptop has no
   tag to read it from. `ci/scripts/embed-release-manifest.mjs` stamps it into the
   same file at package time, the way `apply-tag-version.mjs` stamps the version.
   To preview what it will produce:

   ```bash
   node ci/scripts/embed-release-manifest.mjs vX.Y.Z
   git diff src/shared/releaseManifest.generated.ts   # inspect
   git checkout src/shared/releaseManifest.generated.ts   # then discard
   ```
4. **Commit and tag.** Commit the changelog, then tag `vX.Y.Z` and
   `git push origin vX.Y.Z` (fans out to GitLab — the source of truth — and the
   GitHub mirror). The tag triggers the GitLab release pipeline, and separately
   the GitHub Actions `release-supplement.yml` workflow, which adds the
   architectures GitLab's runners cannot build (macOS Intel, arm64 Linux, arm64
   Windows) to the same release. Tagging a commit that already carries a `v*` tag
   is rejected by `ci/scripts/check-tag-unique.mjs`.
5. **Build artifacts.**
   ```bash
   npm run package   # runnable bundle (no installers)
   npm run dist      # branded installers + auto-update metadata into dist/
   ```
   `npm run dist` runs `electron-forge package` then electron-builder
   (`--prepackaged`) to produce the branded NSIS / dmg / AppImage installers and the
   `latest*.yml` auto-update metadata. See
   [installer and updates](installer-and-updates.md) and
   [packaging and signing](packaging-and-signing.md).
6. **Publish.** The GitLab pipeline publishes automatically on a `v*` tag — an
   identical GitLab Release and GitHub Release (see
   [release-process](../ci/release-process.md)). For a manual fallback use
   `npm run dist:publish` (with `GH_TOKEN` set) or attach `dist/*` — installers,
   `latest*.yml`, and `*.blockmap` — to the GitHub release with the `gh` CLI.
7. **Verify the release.** Download an artifact from both hosts and confirm it
   launches.

## Release checklist

- [ ] `main` is green (CI passed).
- [ ] `package.json` version left ALONE (the tag supplies it).
- [ ] `CHANGELOG.md` updated with date and compare links.
- [ ] `npm run gen:notes` re-run and BOTH generated modules committed
      (`releaseNotes.generated.ts`, `releaseManifest.generated.ts`); confirm with
      `npm run gen:notes -- --check`.
- [ ] `node ci/scripts/generate-release-notes.mjs vX.Y.Z` reports it used the
      CHANGELOG section, not the git-history fallback.
- [ ] Tag `vX.Y.Z` created on a commit that carries no other `v*` tag.
- [ ] Artifacts built (`npm run dist`) and smoke-tested.
- [ ] `ci/scripts/verify-artifacts.mjs` passed on the assembled publish set.
- [ ] `release-manifest.json` published alongside the installers and
      `ci/scripts/check-release-manifest.mjs` passed (its digests agree with
      `SHA256SUMS`).
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
