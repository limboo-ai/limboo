/**
 * changelog.mjs — parse `CHANGELOG.md` into per-version sections.
 *
 * One parser, three consumers: the GitHub/GitLab release body
 * (`generate-release-notes.mjs`), the notes bundled into the app
 * (`scripts/gen-release-notes.mjs`), and the changelog itself. Before this
 * existed the release body was generated from commit subjects while the
 * changelog was written by hand, so the two described the same release
 * differently and nothing connected them.
 *
 * Dependency-free by house rule — every script under `ci/scripts/` runs on a
 * bare Node with no install step, because they gate the build that would
 * install things.
 *
 * The format parsed is Keep a Changelog as this project writes it:
 *
 *     ## [1.7.0] - 2026-07-26
 *     <prose summary>
 *     ### Added
 *     - **Lead-in.** Explanation.
 *
 * `## [Unreleased]` is deliberately skipped: it is a staging area, not a
 * release, and emitting it as a release body would publish notes for work that
 * has not shipped.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo root, resolved from this file so callers need not agree on a cwd. */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Default changelog location. */
export const CHANGELOG_PATH = path.join(REPO_ROOT, 'CHANGELOG.md');

/**
 * A released section. `body` is the markdown BELOW the version heading and
 * above the next one, trimmed — heading excluded so a consumer can re-title it.
 */
/** @typedef {{ version: string, date: string | null, body: string }} ChangelogSection */

/** Matches `## [1.7.0] - 2026-07-26`, and `## [1.0.0]` with no date. */
const HEADING = /^## \[([^\]\s]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*$/;

/**
 * Parse a changelog into released sections, newest first.
 *
 * @param {string} [file] path to CHANGELOG.md
 * @returns {ChangelogSection[]}
 */
export function parseChangelog(file = CHANGELOG_PATH) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    // A missing changelog is not fatal: callers fall back to git history.
    return [];
  }

  const lines = text.split(/\r?\n/);
  /** @type {ChangelogSection[]} */
  const sections = [];
  /** @type {ChangelogSection | null} */
  let current = null;
  /** @type {string[]} */
  let buffer = [];

  const flush = () => {
    if (!current) return;
    current.body = buffer.join('\n').trim();
    // The link-reference block at the foot of the file belongs to no section.
    current.body = current.body.replace(/\n\[[^\]]+\]:\s*https?:\/\/\S+(?:\n\[[^\]]+\]:\s*https?:\/\/\S+)*\s*$/, '').trim();
    if (current.body) sections.push(current);
    current = null;
    buffer = [];
  };

  for (const line of lines) {
    const m = HEADING.exec(line);
    if (!m) {
      if (current) buffer.push(line);
      continue;
    }
    flush();
    const [, version, date] = m;
    // Skip the staging area — it is not a release.
    if (/^unreleased$/i.test(version)) continue;
    current = { version, date: date ?? null, body: '' };
  }
  flush();

  return sections;
}

/** Strip a leading `v` so `v1.7.0` and `1.7.0` both resolve. */
export function normalizeVersion(ref) {
  return String(ref ?? '').trim().replace(/^v/, '');
}

/**
 * The section for one version, or null when the changelog has no entry for it.
 * Returning null is meaningful: it is how a caller knows to fall back.
 *
 * @param {string} ref  tag or version, with or without a leading `v`
 * @param {string} [file]
 * @returns {ChangelogSection | null}
 */
export function sectionFor(ref, file = CHANGELOG_PATH) {
  const wanted = normalizeVersion(ref);
  if (!wanted) return null;
  return parseChangelog(file).find((s) => s.version === wanted) ?? null;
}

/**
 * The most recent `count` released sections, newest first — what the app
 * bundles so a user updating across several versions can read what they missed.
 *
 * @param {number} count
 * @param {string} [file]
 * @returns {ChangelogSection[]}
 */
export function recentSections(count, file = CHANGELOG_PATH) {
  return parseChangelog(file).slice(0, Math.max(0, count));
}
