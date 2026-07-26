#!/usr/bin/env node
/**
 * Bundle the release notes the app shows in its "What's New" tab, from the
 * single source of truth: CHANGELOG.md.
 *
 *   node scripts/gen-release-notes.mjs        (npm run gen:notes)
 *
 * Output:
 *   src/shared/releaseNotes.generated.ts   the most recent N released sections
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
 * The generated file is COMMITTED so it is reviewable in a diff and so a build
 * never depends on this script having been run.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { CHANGELOG_PATH, REPO_ROOT, recentSections } from '../ci/scripts/lib/changelog.mjs';

/**
 * How many past releases ship with the app. Enough that someone updating across
 * a couple of versions can read what they missed, few enough that the changelog
 * does not become app payload — it grows without bound, the bundle should not.
 */
const KEEP = 3;

const OUT = path.join(REPO_ROOT, 'src', 'shared', 'releaseNotes.generated.ts');

/** Escape a string for a TS backtick template literal. */
function escapeTemplate(text) {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function main() {
  const sections = recentSections(KEEP, CHANGELOG_PATH);
  if (sections.length === 0) {
    console.error('gen-release-notes: no released sections found in CHANGELOG.md');
    process.exit(1);
  }

  const entries = sections
    .map(
      (s) => `  {
    version: '${s.version}',
    date: ${s.date ? `'${s.date}'` : 'null'},
    markdown: \`${escapeTemplate(s.body)}\`,
  },`,
    )
    .join('\n');

  const file = `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Written by \`npm run gen:notes\` (scripts/gen-release-notes.mjs) from
 * CHANGELOG.md, which is the single source of truth for release notes: the same
 * text becomes the GitHub release body, this in-app "What's New" tab, and the
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

  writeFileSync(OUT, file, 'utf8');
  console.error(
    `Wrote ${path.relative(REPO_ROOT, OUT)} — ${sections.length} release(s): ` +
      sections.map((s) => s.version).join(', '),
  );
}

main();
