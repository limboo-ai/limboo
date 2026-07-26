#!/usr/bin/env node
/**
 * Bundle the release documentation the app ships, from the single source of
 * truth: CHANGELOG.md.
 *
 *   node scripts/gen-release-notes.mjs           (npm run gen:notes)
 *   node scripts/gen-release-notes.mjs --check   (CI: fail if out of sync)
 *
 * Output — both COMMITTED:
 *   src/shared/releaseNotes.generated.ts     the most recent N sections as Markdown
 *   src/shared/releaseManifest.generated.ts  the same releases, structured, plus
 *                                            an index of every released version
 *
 * TWO FILES, NOT ONE. The Markdown blob is the fallback and the export/copy
 * source — it is what the changelog literally says, and it must survive a
 * generator that learns to parse something incorrectly. The manifest is the
 * structured view the release document renders. Keeping both means a parsing
 * bug degrades the page to plain notes instead of losing the release entirely.
 *
 * WHY A GENERATED MODULE RATHER THAN A BUNDLED ASSET. `electron-builder.yml`
 * deliberately declares no `files`/`extraResources` block — it repacks Forge's
 * output via `--prepackaged` so the security fuses and asar integrity Forge
 * baked in survive. A data file copied for packaging would therefore need a
 * second mechanism (and a runtime path that differs between dev, asar, and
 * asar-unpacked). An imported module needs none of that and behaves identically
 * everywhere.
 *
 * WHY NOT READ THE UPDATER'S NOTES INSTEAD. `UpdateInfo.releaseNotes` describes
 * the version being *offered*, is HTML-stripped and capped on its way through
 * the updater, and lives only in memory — so it is gone by the time the new
 * version boots and cannot answer "what did I just get?". Bundled notes always
 * match the running build, need no network, and work in development.
 *
 * WHY `--check` EXISTS. Regenerating was a manual checklist item with nothing
 * enforcing it, so a changelog edit could ship with stale in-app notes and
 * nobody would find out until after the release. CI runs `--check` in the
 * validate stage; it writes nothing and exits non-zero on any drift.
 *
 * The generated files are COMMITTED so they are reviewable in a diff and so a
 * build never depends on this script having been run.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CHANGELOG_PATH, REPO_ROOT, recentSections } from '../ci/scripts/lib/changelog.mjs';
import { LIMITS, buildManifests } from '../ci/scripts/lib/releaseManifest.mjs';

/**
 * How many past releases ship with the app. Enough that someone updating across
 * a couple of versions can read what they missed, few enough that the changelog
 * does not become app payload — it grows without bound, the bundle should not.
 */
const KEEP = LIMITS.keepManifests;

const NOTES_OUT = path.join(REPO_ROOT, 'src', 'shared', 'releaseNotes.generated.ts');
const MANIFEST_OUT = path.join(REPO_ROOT, 'src', 'shared', 'releaseManifest.generated.ts');

const check = process.argv.includes('--check');

/** Escape a string for a TS backtick template literal. */
function escapeTemplate(text) {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

/**
 * Emit a JS value as a TS literal.
 *
 * JSON is a syntactic subset of TS expressions, so `JSON.stringify` is the
 * whole escaping story for the manifest — no template-literal escaping, no way
 * for a backtick or a `${` in the changelog to break out of the emitted file.
 */
function literal(value) {
  return JSON.stringify(value, null, 2);
}

function notesFile(sections) {
  const entries = sections
    .map(
      (s) => `  {
    version: '${s.version}',
    date: ${s.date ? `'${s.date}'` : 'null'},
    markdown: \`${escapeTemplate(s.body)}\`,
  },`,
    )
    .join('\n');

  return `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Written by \`npm run gen:notes\` (scripts/gen-release-notes.mjs) from
 * CHANGELOG.md, which is the single source of truth for release notes: the same
 * text becomes the GitHub release body, the in-app release document, and the
 * changelog itself. Re-run the script after editing CHANGELOG.md.
 *
 * Contains the ${KEEP} most recent released sections.
 */

/** One release's notes, as authored in CHANGELOG.md. */
export interface ReleaseNotesEntry {
  /** Semantic version, without a leading \`v\`. */
  version: string;
  /** ISO release date, or null for a section written without one. */
  date: string | null;
  /** The section body as Markdown — headings and bullets, no version heading. */
  markdown: string;
}

/** Newest first. */
export const RELEASE_NOTES: ReleaseNotesEntry[] = [
${entries}
];

/** The notes for one version, or null when this build does not carry them. */
export function releaseNotesFor(version: string): ReleaseNotesEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_NOTES.find((r) => r.version === wanted) ?? null;
}
`;
}

function manifestFile(manifests, index) {
  return `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Written by \`npm run gen:notes\` (scripts/gen-release-notes.mjs) from
 * CHANGELOG.md. Types live in \`./release\`; this file carries only data.
 *
 * \`RELEASE_MANIFESTS\` holds the ${KEEP} most recent releases in full.
 * \`RELEASE_INDEX\` lists EVERY released version, so the release document can
 * show a complete history without the changelog becoming app payload.
 *
 * Git-derived fields (commit, buildNumber, contributors, pullRequests,
 * mergedBranches, stats) are null/empty here and are stamped in at package time
 * by \`ci/scripts/embed-release-manifest.mjs\`, the same way
 * \`apply-tag-version.mjs\` stamps the version — a laptop has no tag to read them
 * from. That step also resolves each contributor to their forge account and
 * embeds the profile picture as a \`data:\` URI, which is why the app can show
 * real avatars under a CSP that forbids it from fetching one.
 * Asset digests and signing status appear only in the PUBLISHED manifest
 * (\`dist/release-manifest.json\`): a build cannot contain the hash of an
 * installer that does not exist until after it is built.
 */
import type { ReleaseIndexEntry, ReleaseManifestEntry } from './release';

/** Newest first. */
export const RELEASE_MANIFESTS: ReleaseManifestEntry[] = ${literal(manifests)};

/** Every released version, newest first. */
export const RELEASE_INDEX: ReleaseIndexEntry[] = ${literal(index)};

/** The full manifest for one version, or null when this build does not carry it. */
export function releaseManifestFor(version: string): ReleaseManifestEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_MANIFESTS.find((r) => r.version === wanted) ?? null;
}

/** The index entry for one version, or null when the changelog has no section. */
export function releaseIndexFor(version: string): ReleaseIndexEntry | null {
  const wanted = version.replace(/^v/, '');
  return RELEASE_INDEX.find((r) => r.version === wanted) ?? null;
}
`;
}

/** Write, or in --check mode compare. Returns true when the file is in sync. */
function emit(file, contents) {
  const rel = path.relative(REPO_ROOT, file);
  if (check) {
    let existing = '';
    try {
      existing = readFileSync(file, 'utf8');
    } catch {
      console.error(`gen-release-notes --check: ${rel} is missing. Run \`npm run gen:notes\`.`);
      return false;
    }
    if (existing !== contents) {
      console.error(
        `gen-release-notes --check: ${rel} is out of sync with CHANGELOG.md. ` +
          'Run `npm run gen:notes` and commit the result.',
      );
      return false;
    }
    return true;
  }
  writeFileSync(file, contents, 'utf8');
  return true;
}

function main() {
  const sections = recentSections(KEEP, CHANGELOG_PATH);
  if (sections.length === 0) {
    console.error('gen-release-notes: no released sections found in CHANGELOG.md');
    process.exit(1);
  }

  const { manifests, index } = buildManifests(sections, CHANGELOG_PATH);

  const ok = [
    emit(NOTES_OUT, notesFile(sections)),
    emit(MANIFEST_OUT, manifestFile(manifests, index)),
  ].every(Boolean);

  if (!ok) process.exit(1);

  const names = sections.map((s) => s.version).join(', ');
  console.error(
    check
      ? `gen-release-notes --check: in sync — ${sections.length} release(s): ${names}`
      : `Wrote releaseNotes.generated.ts + releaseManifest.generated.ts — ` +
          `${sections.length} release(s): ${names}; ${index.length} indexed`,
  );
}

main();
