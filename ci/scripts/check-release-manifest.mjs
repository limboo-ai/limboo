#!/usr/bin/env node
/**
 * check-release-manifest.mjs — gate the published `release-manifest.json`.
 *
 *   node ci/scripts/check-release-manifest.mjs [artifactDir=dist] [tag]
 *
 * The manifest is presented to users as the canonical description of what they
 * installed, and the app renders it without further review. So it is verified
 * the way every other release artifact is verified — mechanically, in CI,
 * before anything is published:
 *
 *   1. It parses, and carries the fields the app reads.
 *   2. Its version matches the tag being released (the same check
 *      `check-manifest.mjs` makes for `package.json`, for the same reason).
 *   3. Every asset it names exists in the artifact directory.
 *   4. Every digest it states matches `SHA256SUMS`. Two files that claim to
 *      describe the same download must not disagree — a user who verifies
 *      against one and reads the other would get a false result either way.
 *   5. Its own line in `SHA256SUMS` exists, so the manifest is covered by the
 *      checksum manifest rather than sitting outside it.
 *
 * Runs after `make-checksums.mjs`. Dependency-free by house rule.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';

const artifactDir = process.argv[2] ?? 'dist';
const MANIFEST = 'release-manifest.json';
const CHECKSUMS = 'SHA256SUMS';
const TAG_RE = /^v(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

const problems = [];
const fail = (message) => problems.push(message);

function resolveTag() {
  const explicit = process.argv[3];
  if (explicit) return explicit.trim();
  if (process.env.CI_COMMIT_TAG) return process.env.CI_COMMIT_TAG.trim();
  if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME) {
    return process.env.GITHUB_REF_NAME.trim();
  }
  if (process.env.BITBUCKET_TAG) return process.env.BITBUCKET_TAG.trim();
  return '';
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/** Parse `<hex>␠␠<relative-path>` lines into a map. */
function parseChecksums(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s\s(.+)$/.exec(line.trim());
    if (m) map.set(m[2], m[1]);
  }
  return map;
}

async function main() {
  const manifestPath = join(artifactDir, MANIFEST);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (err) {
    console.error(`check-release-manifest: cannot read ${manifestPath}: ${err?.message ?? err}`);
    process.exit(1);
  }

  // 1) Shape. Only the fields the app actually reads are required — a stricter
  //    schema would fail a release for a field nothing consumes.
  for (const field of ['version', 'gitTag', 'channel', 'sections', 'assets', 'markdown']) {
    if (manifest[field] === undefined) fail(`missing required field "${field}"`);
  }
  if (!Array.isArray(manifest.sections) || manifest.sections.length === 0) {
    fail('"sections" is empty — the release would render with no notes');
  }
  if (!Array.isArray(manifest.assets)) fail('"assets" is not an array');

  // 2) Version ↔ tag.
  const tag = resolveTag();
  const match = TAG_RE.exec(tag);
  if (!match) {
    fail(`"${tag || '(none)'}" is not a vX.Y.Z release tag`);
  } else if (manifest.version !== match[1]) {
    fail(`manifest version "${manifest.version}" does not match tag ${tag}`);
  }

  // 3) + 4) Assets exist, and their digests agree with SHA256SUMS.
  const present = new Set();
  try {
    for await (const file of walk(artifactDir)) {
      present.add(relative(artifactDir, file).split(sep).join('/'));
    }
  } catch (err) {
    fail(`cannot list ${artifactDir}: ${err?.message ?? err}`);
  }

  // The checksum manifest lands beside the artifacts on the GitLab/Bitbucket
  // path and at the working-directory root on the GitHub one
  // (`make-checksums.mjs dist SHA256SUMS`). Both write paths RELATIVE to the
  // artifact dir, so either location is readable here — and looking in both is
  // cheaper than making three pipelines agree on one.
  let checksums = new Map();
  let checksumsFound = false;
  for (const candidate of [join(artifactDir, CHECKSUMS), CHECKSUMS]) {
    try {
      checksums = parseChecksums(await readFile(candidate, 'utf8'));
      checksumsFound = true;
      break;
    } catch {
      /* try the next location */
    }
  }
  if (!checksumsFound) {
    fail(`${CHECKSUMS} is missing — run make-checksums.mjs before this gate`);
  }

  for (const asset of manifest.assets ?? []) {
    if (typeof asset?.name !== 'string' || !asset.name) {
      fail('an asset entry has no name');
      continue;
    }
    if (!present.has(asset.name)) {
      fail(
        `manifest lists "${asset.name}", which is not in ${artifactDir}. ` +
          'Users would see an asset they cannot download.',
      );
      continue;
    }
    if (asset.sha256 !== null && !SHA256_RE.test(String(asset.sha256))) {
      fail(`asset "${asset.name}" has a malformed sha256`);
      continue;
    }
    const expected = checksums.get(asset.name);
    if (expected && asset.sha256 && expected !== asset.sha256) {
      fail(
        `asset "${asset.name}" digest disagrees with ${CHECKSUMS} ` +
          `(manifest ${String(asset.sha256).slice(0, 16)}…, checksums ${expected.slice(0, 16)}…)`,
      );
    }
    if (typeof asset.bytes === 'number') {
      try {
        const stats = await stat(join(artifactDir, asset.name));
        if (stats.size !== asset.bytes) {
          fail(`asset "${asset.name}" size ${asset.bytes} does not match ${stats.size} on disk`);
        }
      } catch {
        fail(`asset "${asset.name}" could not be stat'd`);
      }
    }
  }

  // 5) The manifest is itself covered by the checksum manifest.
  if (checksums.size > 0 && !checksums.has(MANIFEST)) {
    fail(
      `${MANIFEST} is not listed in ${CHECKSUMS}. It must be generated BEFORE ` +
        'make-checksums.mjs so the checksum manifest covers it.',
    );
  }

  if (problems.length > 0) {
    console.error(`check-release-manifest: ${problems.length} problem(s) in ${basename(manifestPath)}`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.error(
    `check-release-manifest: OK — ${manifest.version}, ${manifest.assets.length} asset(s) ` +
      `verified against ${CHECKSUMS}`,
  );
}

main().catch((err) => {
  console.error(`check-release-manifest: ${err?.message ?? err}`);
  process.exit(1);
});
