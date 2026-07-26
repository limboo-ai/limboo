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

// ===========================================================================
// Structured parsing
//
// Everything above returns a section's body as one Markdown blob, which is all
// a release BODY needs. The in-app release document renders structure —
// collapsible categories, per-item leads, a filter — so it needs the same text
// broken apart. That happens HERE rather than in the renderer for two reasons:
// the build already runs this parser, and a renderer that parsed Markdown at
// display time would be doing at runtime what a generator can do once.
//
// The category table below is duplicated by value in `src/shared/release.ts`
// (`releaseCategoryFor`). It cannot be imported: everything under `ci/scripts/`
// is dependency-free plain Node by house rule, because these scripts gate the
// build that would install a TypeScript loader. Change one, change the other.
// ===========================================================================

/**
 * @typedef {{ lead: string | null, text: string }} ReleaseItem
 * @typedef {{ category: string, title: string, items: ReleaseItem[], markdown: string }} ReleaseSection
 */

/** Heading → category. Mirrors `releaseCategoryFor` in `src/shared/release.ts`. */
export function categoryFor(heading) {
  const h = String(heading ?? '').trim().toLowerCase();
  if (h.startsWith('added') || h.startsWith('new')) return 'added';
  if (h.startsWith('changed') || h.startsWith('improved')) return 'changed';
  if (h.startsWith('deprecated')) return 'deprecated';
  if (h.startsWith('removed')) return 'removed';
  if (h.startsWith('fixed') || h.startsWith('bug')) return 'fixed';
  if (h.startsWith('security')) return 'security';
  if (h.startsWith('performance') || h.startsWith('perf')) return 'performance';
  if (h.startsWith('breaking')) return 'breaking';
  if (h.startsWith('migration') || h.startsWith('upgrad')) return 'migration';
  if (h.startsWith('dependenc')) return 'dependencies';
  if (h.startsWith('documentation') || h.startsWith('docs')) return 'documentation';
  if (h.startsWith('tooling') || h.startsWith('developer')) return 'tooling';
  if (h.startsWith('known')) return 'known-issues';
  return 'other';
}

/** Matches a `### Heading` inside a release section. */
const SUBHEADING = /^###\s+(.+?)\s*$/;

/**
 * The prose paragraph a section opens with, above the first `###`.
 *
 * Every release in this changelog leads with one, and it is the single most
 * useful line in the whole entry — it says what the release IS. Returns `''`
 * when a section jumps straight to its first subheading.
 *
 * @param {string} body
 * @returns {string}
 */
export function parseSummary(body) {
  const out = [];
  for (const line of String(body ?? '').split(/\r?\n/)) {
    if (SUBHEADING.test(line)) break;
    out.push(line);
  }
  return out.join('\n').trim();
}

/**
 * Split one section body into its `### …` blocks.
 *
 * Bullets are split on TOP-LEVEL `- ` only: a continuation line and a nested
 * list both belong to the bullet above them, and treating either as a new item
 * would shred every multi-line entry in this changelog (most of them). Fenced
 * code regions are atomic for the same reason — a `- ` inside a fence is code.
 *
 * @param {string} body
 * @returns {ReleaseSection[]}
 */
export function parseSections(body) {
  const lines = String(body ?? '').split(/\r?\n/);
  /** @type {ReleaseSection[]} */
  const sections = [];
  /** @type {{ title: string, lines: string[] } | null} */
  let current = null;

  const flush = () => {
    if (!current) return;
    const markdown = current.lines.join('\n').trim();
    if (markdown) {
      sections.push({
        category: categoryFor(current.title),
        title: current.title,
        items: parseItems(markdown),
        markdown,
      });
    }
    current = null;
  };

  for (const line of lines) {
    const m = SUBHEADING.exec(line);
    if (m) {
      flush();
      current = { title: m[1], lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  flush();
  return sections;
}

/**
 * Split a block into top-level bullets, then split each into `lead` + `text`.
 *
 * The house style is `- **Lead-in.** Explanation.` — the bold run at the very
 * start of a bullet is a title, so it is lifted out and rendered as one. A
 * bullet with no such run keeps `lead: null` and is rendered whole; nothing is
 * invented from the first sentence.
 *
 * @param {string} markdown
 * @returns {ReleaseItem[]}
 */
export function parseItems(markdown) {
  const lines = String(markdown ?? '').split(/\r?\n/);
  /** @type {string[][]} */
  const bullets = [];
  /** @type {string[] | null} */
  let current = null;
  /** @type {string | null} */
  let fence = null;

  for (const line of lines) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line);
    if (fence) {
      if (current) current.push(line);
      if (fenceMatch && line.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      if (current) current.push(line);
      continue;
    }
    // A top-level bullet starts at column 0. Anything indented continues the
    // one above it, whether it is a wrapped line or a nested list.
    if (/^[-*]\s+/.test(line)) {
      current = [line.replace(/^[-*]\s+/, '')];
      bullets.push(current);
      continue;
    }
    if (current) current.push(line);
  }

  return bullets
    .map((b) => b.join('\n').trim())
    .filter(Boolean)
    .map((text) => {
      // `**Lead-in.**` must be at the very start; a bold run mid-sentence is
      // emphasis, not a title.
      const m = /^\*\*(.+?)\*\*\s*/s.exec(text);
      if (!m) return { lead: null, text };
      return { lead: m[1].replace(/[.:]\s*$/, '').trim(), text: text.slice(m[0].length).trim() };
    });
}

/**
 * The `[1.7.0]: https://…/compare/v1.6.0...v1.7.0` reference block at the foot
 * of the file. `parseChangelog` strips it from the last section's body; this
 * reads it, because those are the only compare URLs anyone has written down.
 *
 * @param {string} [file]
 * @returns {Record<string, string>}
 */
export function parseCompareLinks(file = CHANGELOG_PATH) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  /** @type {Record<string, string>} */
  const links = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\[([^\]]+)\]:\s*(https?:\/\/\S+)\s*$/.exec(line);
    if (m) links[normalizeVersion(m[1])] = m[2];
  }
  return links;
}

/**
 * Every released version, newest first — including the ones whose full notes
 * are NOT bundled. The app carries a handful of full manifests but lists the
 * complete history, so a version missing from the bundle is still a version the
 * user can see shipped.
 *
 * @param {string} [file]
 * @returns {{ version: string, date: string | null, summary: string }[]}
 */
export function versionIndex(file = CHANGELOG_PATH) {
  return parseChangelog(file).map((s) => ({
    version: s.version,
    date: s.date,
    summary: parseSummary(s.body),
  }));
}
