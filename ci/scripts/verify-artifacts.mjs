#!/usr/bin/env node
/**
 * verify-artifacts.mjs — structural checks on the built distributables, run in
 * the `secure` stage before anything is published.
 *
 * Every check here exists because the corresponding bug SHIPPED. v1.5.1's
 * macOS artifacts were structurally incapable of auto-updating and its "Intel"
 * downloads were the arm64 build under a different name, and nothing in the
 * pipeline noticed. Checksums and signatures cannot catch either: a broken
 * artifact hashes and signs exactly as well as a good one.
 *
 * Checks:
 *   1. macOS update zips are rooted at `<Product>.app/`. Squirrel.Mac only
 *      accepts that layout; a zip rooted at the packaging directory downloads
 *      fine and then fails to install, forever.
 *   2. No two artifacts listed in a `latest*.yml` share a sha512 — identical
 *      hashes across differently-named files mean one architecture is being
 *      published under another's name.
 *   3. Every file named in a `latest*.yml` actually exists in the directory.
 *      A feed that references a missing asset is an update that 404s.
 *   4. Debug output (`builder-debug.yml`, `builder-effective-config.yaml`) is
 *      not sitting in the publish set. Only checked with `--publish-set`:
 *      electron-builder writes those files into its own output directory quite
 *      legitimately, so this is about what gets UPLOADED, not what gets built.
 *
 * Zero dependencies: reads the zip central directory and parses the small,
 * fixed shape of `latest*.yml` by hand, so it runs anywhere Node does.
 *
 * Usage: node ci/scripts/verify-artifacts.mjs [artifactDir=dist] [--publish-set]
 */
import { readFileSync } from 'node:fs';
import { open, readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

const args = process.argv.slice(2);
const publishSet = args.includes('--publish-set');
const artifactDir = args.find((a) => !a.startsWith('--')) ?? 'dist';

/** Files that must never reach a release. */
const FORBIDDEN = ['builder-debug.yml', 'builder-effective-config.yaml'];

const problems = [];
const notes = [];

function fail(message) {
  problems.push(message);
}

function note(message) {
  notes.push(message);
}

/* ------------------------------------------------------------------ */
/* 1. macOS zip layout                                                 */
/* ------------------------------------------------------------------ */

/**
 * Read the name of the first entry in a zip by parsing its first local file
 * header. Layout (little-endian): signature `PK\x03\x04` (4 bytes), then 22
 * bytes of fixed fields, then the filename length at offset 26.
 */
async function firstZipEntry(file) {
  const handle = await open(file, 'r');
  try {
    const header = Buffer.alloc(30);
    const { bytesRead } = await handle.read(header, 0, 30, 0);
    if (bytesRead < 30) return null;
    if (header.readUInt32LE(0) !== 0x04034b50) return null; // not a local file header
    const nameLength = header.readUInt16LE(26);
    if (nameLength === 0 || nameLength > 4096) return null;
    const name = Buffer.alloc(nameLength);
    await handle.read(name, 0, nameLength, 30);
    return name.toString('utf8');
  } finally {
    await handle.close();
  }
}

/**
 * Which files are macOS update zips?
 *
 * Derived from `latest-mac.yml` rather than from the filename, because the
 * filename is exactly the wrong thing to trust here: this check once keyed on a
 * `-mac.zip` suffix, the artifact naming changed to `-<arch>.zip`, and the most
 * important gate in this script silently reported "nothing to check" on a real
 * release. The update feed is authoritative — those entries are, by definition,
 * the archives Squirrel.Mac will be handed.
 */
function macZipsFromFeed(files) {
  const feed = files.find((f) => basename(f).toLowerCase() === 'latest-mac.yml');
  if (!feed) return { feedPresent: false, zips: [] };
  const listed = new Set();
  for (const line of readFileSync(feed, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*-\s+url:\s*(.+?)\s*$/);
    if (match && match[1].toLowerCase().endsWith('.zip')) listed.add(basename(match[1]));
  }
  return { feedPresent: true, zips: files.filter((f) => listed.has(basename(f))) };
}

async function checkMacZips(files) {
  const { feedPresent, zips: macZips } = macZipsFromFeed(files);

  if (macZips.length === 0) {
    if (feedPresent) {
      // A macOS update feed with no checkable zip beside it is not a "nothing to
      // do" case — either the feed lists no zip (Squirrel.Mac has nothing to
      // install) or the artifacts are missing from the publish set.
      fail(
        'latest-mac.yml is present but no macOS update zip could be matched to it. ' +
          'Squirrel.Mac needs a zip listed in that feed; check the mac targets in ' +
          'electron-builder.yml and that the zip reached this directory.',
      );
      return;
    }
    note('no macOS update feed in this build — Squirrel.Mac layout check not applicable');
    return;
  }

  for (const zip of macZips) {
    const entry = await firstZipEntry(zip);
    if (!entry) {
      fail(`${basename(zip)}: could not read the first zip entry (corrupt archive?)`);
      continue;
    }
    // Squirrel.Mac unpacks the zip and expects to find the .app at its root.
    if (!/^[^/]+\.app\/?$/.test(entry)) {
      fail(
        `${basename(zip)}: first entry is "${entry}", expected "<Product>.app/". ` +
          'Squirrel.Mac cannot install this — check the --prepackaged path in scripts/dist.mjs ' +
          '(on darwin it must point at the .app bundle, not its parent directory).',
      );
    } else {
      note(`${basename(zip)}: rooted at ${entry} — OK`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 2 + 3. Update feed sanity                                           */
/* ------------------------------------------------------------------ */

/**
 * Pull `{ url, sha512 }` pairs out of a `latest*.yml`. The generated shape is
 * fixed and shallow, so a targeted line scan beats adding a YAML dependency.
 */
function parseFeedFiles(yaml) {
  const entries = [];
  let current = null;
  for (const raw of yaml.split(/\r?\n/)) {
    const url = raw.match(/^\s*-\s+url:\s*(.+?)\s*$/);
    if (url) {
      if (current) entries.push(current);
      current = { url: url[1], sha512: null };
      continue;
    }
    if (!current) continue;
    const sha = raw.match(/^\s+sha512:\s*(.+?)\s*$/);
    if (sha) current.sha512 = sha[1];
  }
  if (current) entries.push(current);
  return entries;
}

async function checkFeeds(dir, files) {
  const feeds = files.filter((f) => /^latest.*\.yml$/i.test(basename(f)));
  if (feeds.length === 0) {
    note('no latest*.yml in this build — skipping update-feed checks');
    return;
  }
  const present = new Set(files.map((f) => basename(f)));

  for (const feed of feeds) {
    const entries = parseFeedFiles(await readFile(feed, 'utf8'));
    if (entries.length === 0) {
      fail(`${basename(feed)}: lists no files`);
      continue;
    }
    const problemsBefore = problems.length;

    // (3) every referenced asset exists
    for (const entry of entries) {
      if (!present.has(basename(entry.url))) {
        fail(`${basename(feed)}: references "${entry.url}", which is not in ${dir}`);
      }
    }

    // (2) no duplicate hashes across differently-named artifacts
    const byHash = new Map();
    for (const entry of entries) {
      if (!entry.sha512) continue;
      const seen = byHash.get(entry.sha512);
      if (seen && seen !== entry.url) {
        fail(
          `${basename(feed)}: "${seen}" and "${entry.url}" have the SAME sha512. ` +
            'Two differently-named artifacts with identical contents means one architecture ' +
            'is being published under another\'s name — check that no target in ' +
            'electron-builder.yml declares an explicit `arch:` list (it overrides the CLI flag ' +
            'and re-wraps the same --prepackaged directory once per arch).',
        );
      } else if (!seen) {
        byHash.set(entry.sha512, entry.url);
      }
    }

    if (problems.length === problemsBefore) {
      note(`${basename(feed)}: ${entries.length} artifact(s), all present, all distinct`);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 4. Debug output                                                     */
/* ------------------------------------------------------------------ */

/**
 * `SHA256SUMS` must describe exactly what is published — no more.
 *
 * A manifest listing a file the user cannot download makes `sha256sum -c
 * SHA256SUMS` exit non-zero on a perfectly good release, which discredits the
 * one verification command the README and release notes hand people. v1.6.0
 * shipped with a stray `limboo-package.cyclonedx.json` entry for exactly this
 * reason: a build side-file that was checksummed but never uploaded.
 */
async function checkChecksumManifest(dir, files) {
  const manifest = files.find((f) => basename(f) === 'SHA256SUMS');
  if (!manifest) return;
  const present = new Set(files.map((f) => basename(f)));
  for (const line of (await readFile(manifest, 'utf8')).split(/\r?\n/)) {
    if (!line.trim()) continue;
    // `<hex>  <name>` — the name may carry a binary-mode `*` prefix.
    const name = line.slice(line.indexOf(' ')).trim().replace(/^\*/, '');
    if (name && !present.has(basename(name))) {
      fail(
        `SHA256SUMS lists "${name}", which is not in ${dir}. ` +
          '`sha256sum -c SHA256SUMS` would fail for anyone who downloads the release — ' +
          'checksum only what actually gets published.',
      );
    }
  }
}

function checkForbidden(files) {
  if (!publishSet) return;
  for (const file of files) {
    if (FORBIDDEN.includes(basename(file))) {
      fail(
        `${basename(file)} is in the publish set — it is electron-builder debug output ` +
          'and should be excluded from the release upload globs.',
      );
    }
  }
}

/* ------------------------------------------------------------------ */

async function listFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else out.push(full);
  }
  return out;
}

async function main() {
  try {
    await stat(artifactDir);
  } catch {
    console.error(`verify-artifacts: "${artifactDir}" does not exist.`);
    process.exit(1);
  }

  const files = await listFiles(artifactDir);
  if (files.length === 0) {
    console.error(`verify-artifacts: "${artifactDir}" is empty — nothing was built.`);
    process.exit(1);
  }

  await checkMacZips(files);
  await checkFeeds(artifactDir, files);
  await checkChecksumManifest(artifactDir, files);
  checkForbidden(files);

  for (const n of notes) console.log(`verify-artifacts: ${n}`);

  if (problems.length > 0) {
    console.error('');
    for (const p of problems) console.error(`verify-artifacts: FAIL — ${p}`);
    process.exit(1);
  }

  console.log(`verify-artifacts: ${files.length} file(s) checked — OK.`);
}

main().catch((err) => {
  console.error('verify-artifacts failed:', err);
  process.exit(1);
});
