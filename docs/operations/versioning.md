# Versioning

Limboo follows [Semantic Versioning](https://semver.org/) for the application
version in `package.json`, and tracks two internal schema versions separately.

## Application version (SemVer)

Given `MAJOR.MINOR.PATCH`:

- **MAJOR** — incompatible changes a user would notice (data layout that requires a
  migration the app cannot perform silently, removal of a capability, a breaking
  change to behavior).
- **MINOR** — new capability added in a backward-compatible way.
- **PATCH** — backward-compatible bug fixes.

Tags are `vX.Y.Z`, and **the tag is the version**: CI stamps it into
`package.json` at build time via `ci/scripts/apply-tag-version.mjs`. The version
committed in `package.json` is only a dev placeholder — never hand-bump it. See
[release process](release-process.md).

## Internal schema versions

Two on-disk schemas are versioned independently of the app version, so they can
evolve without forcing an app-version bump:

- **`SETTINGS_VERSION`** (in [`src/shared/constants.ts`](../../src/shared/constants.ts))
  — bumped when the `AppSettings` shape changes incompatibly. The Settings Manager
  deep-merges, clamps, and migrates on load. Currently 7.
- **`WORKSPACE_SCHEMA_VERSION`** (same file) — bumped when the workspace / database
  schema changes incompatibly. The database runs idempotent migrations keyed on the
  version stored in the `meta` table. Currently 6.

When you change either schema, bump its version and add the corresponding migration.
See [the database](../architecture/subsystems/database.md) and
[the Settings subsystem](../architecture/subsystems/settings.md).

## Changelog

Every release records its changes in [CHANGELOG.md](../../CHANGELOG.md) (Keep a
Changelog format). The `Unreleased` section accumulates entries between releases.
