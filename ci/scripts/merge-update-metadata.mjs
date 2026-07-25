#!/usr/bin/env node
/**
 * merge-update-metadata.mjs — merge the per-runner `latest*.yml` update feeds
 * into one file per platform before publishing.
 *
 * Why this exists: each runner writes a feed describing only the artifacts IT
 * built. GitLab's Apple-silicon runner emits a `latest-mac.yml` listing only the
 * arm64 dmg/zip; the GitHub Actions supplement's Intel runner emits one listing
 * only the x64 pair. Uploading the second over the first does not add Intel
 * support — it REMOVES arm64 from the feed, and every Apple-silicon user's next
 * update check fails to find a matching artifact. The same applies to Linux,
 * where x64 and arm64 packages are built on different machines.
 *
 * Merging is by `url`, which is unique per artifact. The `version` must agree
 * across inputs (they all come from the same tag); anything else is a packaging
 * mistake worth failing on rather than silently picking a winner.
 *
 * The top-level `path`/`sha512` fields — electron-updater's fallback when it
 * cannot match a file to the running architecture — are taken from the FIRST
 * input, so the primary pipeline's build stays the default.
 *
 * Usage:
 *   node ci/scripts/merge-update-metadata.mjs <outDir> <inputDir> [inputDir...]
 *
 * Each input directory is scanned for `latest*.yml`; results are grouped by
 * filename and written into <outDir>.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const [outDir, ...inputDirs] = process.argv.slice(2);

if (!outDir || inputDirs.length === 0) {
  console.error(
    'usage: node ci/scripts/merge-update-metadata.mjs <outDir> <inputDir> [inputDir...]',
  );
  process.exit(1);
}

/**
 * Parse the narrow, generator-produced shape of a `latest*.yml`.
 *
 * Deliberately not a general YAML parser: electron-builder writes a fixed
 * two-level structure (scalars at the root, a `files:` list of scalar maps), and
 * pulling in a dependency for it would put a third-party parser on the path
 * every release artifact flows through.
 */
function parseFeed(text) {
  const root = {};
  const files = [];
  let current = null;
  let inFiles = false;

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;

    if (/^files:\s*$/.test(raw)) {
      inFiles = true;
      continue;
    }

    if (inFiles) {
      const item = raw.match(/^\s*-\s+([A-Za-z0-9_]+):\s*(.*)$/);
      if (item) {
        if (current) files.push(current);
        current = { [item[1]]: item[2] };
        continue;
      }
      const field = raw.match(/^\s{4,}([A-Za-z0-9_]+):\s*(.*)$/);
      if (field && current) {
        current[field[1]] = field[2];
        continue;
      }
      // Dedented back to the root level.
      if (/^[A-Za-z0-9_]+:/.test(raw)) {
        if (current) {
          files.push(current);
          current = null;
        }
        inFiles = false;
      } else {
        continue;
      }
    }

    const scalar = raw.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (scalar) root[scalar[1]] = scalar[2];
  }
  if (current) files.push(current);

  return { root, files };
}

/** Serialize back to the exact shape electron-updater expects. */
function serializeFeed(root, files) {
  const lines = [];
  if (root.version !== undefined) lines.push(`version: ${root.version}`);

  lines.push('files:');
  for (const file of files) {
    const keys = Object.keys(file);
    lines.push(`  - ${keys[0]}: ${file[keys[0]]}`);
    for (const key of keys.slice(1)) lines.push(`    ${key}: ${file[key]}`);
  }

  for (const [key, value] of Object.entries(root)) {
    if (key === 'version') continue;
    lines.push(`${key}: ${value}`);
  }
  return `${lines.join('\n')}\n`;
}

async function feedsIn(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && /^latest.*\.yml$/i.test(e.name))
    .map((e) => join(dir, e.name));
}

async function main() {
  // filename -> ordered list of parsed feeds
  const groups = new Map();

  for (const dir of inputDirs) {
    for (const feed of await feedsIn(dir)) {
      const name = basename(feed);
      const parsed = parseFeed(await readFile(feed, 'utf8'));
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push({ source: feed, ...parsed });
    }
  }

  if (groups.size === 0) {
    console.error('merge-update-metadata: no latest*.yml found in any input directory.');
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });

  for (const [name, feeds] of groups) {
    const versions = new Set(feeds.map((f) => f.root.version).filter(Boolean));
    if (versions.size > 1) {
      console.error(
        `merge-update-metadata: ${name} has conflicting versions across runners ` +
          `(${[...versions].join(', ')}). Every artifact in a release must be built from the ` +
          'same tag — check that apply-tag-version.mjs ran on every runner.',
      );
      process.exit(1);
    }

    const byUrl = new Map();
    for (const feed of feeds) {
      for (const file of feed.files) {
        if (!file.url) continue;
        // First writer wins: the primary pipeline's copy of a shared artifact
        // stays authoritative if two runners somehow produced the same name.
        if (!byUrl.has(file.url)) byUrl.set(file.url, file);
      }
    }

    const merged = serializeFeed(feeds[0].root, [...byUrl.values()]);
    await writeFile(join(outDir, name), merged, 'utf8');
    console.log(
      `merge-update-metadata: ${name} — ${byUrl.size} artifact(s) from ${feeds.length} feed(s)`,
    );
  }
}

main().catch((err) => {
  console.error('merge-update-metadata failed:', err);
  process.exit(1);
});
