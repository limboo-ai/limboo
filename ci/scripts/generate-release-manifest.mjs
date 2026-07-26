#!/usr/bin/env node
/**
 * generate-release-manifest.mjs — write the published `release-manifest.json`.
 *
 *   node ci/scripts/generate-release-manifest.mjs [artifactDir=dist] [tag]
 *
 * This is the authoritative, machine-readable description of one release: the
 * same structured notes the app carries, PLUS the facts that only exist once
 * the artifacts do — every published file with its size and SHA-256, and the
 * signing posture per platform.
 *
 * ORDERING MATTERS. It runs AFTER `verify-artifacts.mjs` (a manifest describing
 * a broken build is a correct description of something that cannot be
 * installed) and BEFORE `make-checksums.mjs`, so `SHA256SUMS` covers the
 * manifest itself. `check-release-manifest.mjs` then asserts the two agree.
 *
 * WHY THE APP DOES NOT SHIP THIS FILE. A build cannot contain the hash of the
 * installer produced from it — the hash does not exist until after the build is
 * finished. The bundled manifest therefore carries everything derivable
 * beforehand, and the release document is explicit about where the digests
 * live. The alternative, printing a hash the app cannot stand behind, would
 * look like verification while being decoration.
 *
 * Dependency-free by house rule.
 */
import { readdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';
import { CHANGELOG_PATH, sectionFor } from './lib/changelog.mjs';
import { sha256 } from './lib/hash.mjs';
import { LIMITS, channelForTag, manifestFromSection } from './lib/releaseManifest.mjs';
import { parseCompareLinks } from './lib/changelog.mjs';
import { git, previousTag, revExists } from './lib/git.mjs';

const artifactDir = process.argv[2] ?? 'dist';
const OUT_NAME = 'release-manifest.json';

const TAG_RE = /^v(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/;

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

/**
 * Classify a published file by name.
 *
 * Extension-driven, because that is what electron-builder guarantees; the
 * arch is read from the filename the same way, and left empty rather than
 * guessed when a name does not carry one. `any` is a real answer for the feed
 * and checksum files, not a fallback for "could not tell".
 */
function classify(name) {
  const lower = name.toLowerCase();
  const ext = extname(lower);

  const arch =
    /(?:^|[-_.])(arm64|aarch64)(?:[-_.]|$)/.test(lower)
      ? 'arm64'
      : /(?:^|[-_.])(x64|x86_64|amd64)(?:[-_.]|$)/.test(lower)
        ? 'x64'
        : /(?:^|[-_.])universal(?:[-_.]|$)/.test(lower)
          ? 'universal'
          : /(?:^|[-_.])(ia32|i386)(?:[-_.]|$)/.test(lower)
            ? 'ia32'
            : '';

  if (lower.startsWith('latest') && (ext === '.yml' || ext === '.yaml')) {
    return { platform: 'any', arch: '', kind: 'feed' };
  }
  if (ext === '.blockmap' || lower.endsWith('sha256sums') || lower.includes('sbom')) {
    return { platform: 'any', arch, kind: 'metadata' };
  }
  if (ext === '.exe' || ext === '.msi' || ext === '.appx' || ext === '.msix') {
    return { platform: 'windows', arch, kind: 'installer' };
  }
  if (ext === '.dmg' || ext === '.pkg') return { platform: 'macos', arch, kind: 'installer' };
  if (ext === '.zip') {
    // The macOS update zip is what Squirrel.Mac consumes; a zip elsewhere is a
    // plain archive.
    return { platform: lower.includes('mac') ? 'macos' : 'any', arch, kind: 'archive' };
  }
  if (ext === '.appimage' || ext === '.deb' || ext === '.rpm' || ext === '.snap') {
    return { platform: 'linux', arch, kind: 'installer' };
  }
  if (lower.endsWith('.pkg.tar.zst')) return { platform: 'linux', arch, kind: 'installer' };
  if (ext === '.tar' || lower.endsWith('.tar.gz') || lower.endsWith('.tar.xz')) {
    return { platform: 'linux', arch, kind: 'archive' };
  }
  if (ext === '.json' || ext === '.yml' || ext === '.yaml' || ext === '.txt') {
    return { platform: 'any', arch: '', kind: 'metadata' };
  }
  return { platform: 'any', arch, kind: 'other' };
}

/**
 * Signing posture, stated from what this repository actually does rather than
 * probed.
 *
 * Deliberately conservative: `docs/ci/code-signing.md` records that Windows is
 * self-signed and that the packaging invariants depend on it staying declared
 * that way (`win.verifyUpdateCodeSignature: false`). Claiming "signed" here
 * because a file exists would be the release document lying about the one thing
 * it exists to be honest about. Update this table when signing changes — and
 * `verify-signing.mjs` is what checks the claim.
 */
function signingPosture(files) {
  const has = (pred) => files.some((f) => pred(basename(f).toLowerCase()));
  const out = [];
  if (has((n) => n.endsWith('.exe') || n.endsWith('.msi'))) {
    out.push({
      platform: 'windows',
      status: 'self-signed',
      detail: 'Self-signed certificate; SmartScreen will warn until reputation builds.',
    });
  }
  if (has((n) => n.endsWith('.dmg') || (n.endsWith('.zip') && n.includes('mac')))) {
    out.push({
      platform: 'macos',
      status: 'unknown',
      detail: 'Signed and notarized only when Developer ID credentials are present in CI.',
    });
  }
  if (has((n) => n.endsWith('.appimage') || n.endsWith('.deb') || n.endsWith('.rpm'))) {
    out.push({
      platform: 'linux',
      status: 'unsigned',
      detail: 'Verify with SHA256SUMS and the build-provenance attestation.',
    });
  }
  return out;
}

async function main() {
  try {
    await stat(artifactDir);
  } catch {
    console.error(`generate-release-manifest: artifact dir not found: ${artifactDir}`);
    process.exit(1);
  }

  const tag = resolveTag();
  const match = TAG_RE.exec(tag);
  if (!match) {
    console.error(
      `generate-release-manifest: "${tag || '(none)'}" is not a vX.Y.Z release tag. ` +
        'Pass one explicitly, or run this only on a tag pipeline.',
    );
    process.exit(1);
  }
  const version = match[1];

  const section = sectionFor(version, CHANGELOG_PATH);
  if (!section) {
    console.error(
      `generate-release-manifest: CHANGELOG.md has no section for ${version}. ` +
        'The manifest is the release notes; there is nothing to publish without one.',
    );
    process.exit(1);
  }

  const manifest = manifestFromSection(section, parseCompareLinks(CHANGELOG_PATH));
  manifest.channel = channelForTag(tag);
  manifest.buildNumber =
    process.env.CI_PIPELINE_IID ??
    process.env.GITHUB_RUN_NUMBER ??
    process.env.BITBUCKET_BUILD_NUMBER ??
    null;
  if (revExists(tag)) {
    manifest.commit = git(['rev-parse', `${tag}^{commit}`], { allowFailure: true }) || null;
    const prev = previousTag(tag);
    if (prev && !manifest.links.compare) {
      manifest.links.compare = `https://github.com/limboo-ai/limboo/compare/${prev}...${tag}`;
    }
  }

  // Every published file except the manifest itself (it does not yet exist) and
  // SHA256SUMS (written after this, and self-describing anyway).
  const files = [];
  for await (const file of walk(artifactDir)) {
    const name = basename(file);
    if (name === OUT_NAME || name === 'SHA256SUMS') continue;
    files.push(file);
  }
  files.sort();

  const assets = [];
  for (const file of files.slice(0, LIMITS.maxAssets)) {
    const info = classify(basename(file));
    const stats = await stat(file);
    assets.push({
      name: relative(artifactDir, file).split(sep).join('/'),
      platform: info.platform,
      arch: info.arch,
      kind: info.kind,
      bytes: stats.size,
      sha256: await sha256(file),
    });
  }

  manifest.assets = assets;
  manifest.signing = signingPosture(files);

  const out = join(artifactDir, OUT_NAME);
  await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.error(
    `generate-release-manifest: wrote ${out} — ${version}, ${assets.length} asset(s), ` +
      `${manifest.sections.length} section(s)`,
  );
}

main().catch((err) => {
  console.error(`generate-release-manifest: ${err?.message ?? err}`);
  process.exit(1);
});
