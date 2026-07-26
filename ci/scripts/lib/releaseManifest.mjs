/**
 * releaseManifest.mjs — build a release manifest from `CHANGELOG.md`.
 *
 * Shared by the two producers so they cannot describe the same release
 * differently:
 *
 *   1. `scripts/gen-release-notes.mjs` (`npm run gen:notes`) — compiles the most
 *      recent few manifests into `src/shared/releaseManifest.generated.ts`,
 *      which is COMMITTED so the notes are reviewable in a diff and a build
 *      never depends on the script having been run.
 *   2. `ci/scripts/generate-release-manifest.mjs` — writes the published
 *      `dist/release-manifest.json`, the same manifest plus the facts that only
 *      exist after the artifacts do (per-asset size + SHA-256, signing status).
 *
 * Every field here is derived from the changelog alone, so the output is
 * deterministic and identical on a laptop and in CI. Git-derived fields
 * (`commit`, `buildNumber`, `contributors`, `pullRequests`, `mergedBranches`,
 * `stats`) are left empty and filled in by `embed-release-manifest.mjs`, which
 * runs where a git checkout and a tag actually exist.
 *
 * Dependency-free by house rule.
 */
import { parseCompareLinks, parseSections, parseSummary, versionIndex } from './changelog.mjs';

/**
 * Where this project publishes. Used to synthesize the tag/release URLs that
 * nobody writes into the changelog by hand.
 */
export const RELEASE_REPO = 'limboo-ai/limboo';
const RELEASE_BASE = `https://github.com/${RELEASE_REPO}`;

/**
 * Bounds, MIRRORED from `RELEASE_LIMITS` in `src/shared/constants.ts`. Not
 * imported: everything under `ci/scripts/` is plain dependency-free Node,
 * because these scripts gate the build that would install a TS loader. The
 * changelog grows without bound by design; the payload compiled from it must
 * not, so the clamp lives at the point of generation.
 */
export const LIMITS = {
  keepManifests: 5,
  maxSections: 16,
  maxItemsPerSection: 200,
  maxContributors: 200,
  maxPullRequests: 300,
  maxMergedBranches: 200,
  maxAssets: 120,
  maxAvatars: 24,
  avatarPx: 48,
  avatarBytesMax: 24576,
  textMax: 4096,
  markdownMax: 262144,
};

/** Clamp a string, coercing null/undefined to `''`. */
export function clampText(value, max = LIMITS.textMax) {
  return String(value ?? '').slice(0, max);
}

/** Derive the channel from a tag's prerelease suffix. Mirrors `channelForTag`. */
export function channelForTag(tag) {
  const suffix = /-([0-9A-Za-z.-]+)$/.exec(String(tag ?? '').trim())?.[1]?.toLowerCase() ?? '';
  if (!suffix) return 'stable';
  if (suffix.startsWith('beta') || suffix.startsWith('rc')) return 'beta';
  if (suffix.startsWith('nightly')) return 'nightly';
  return 'preview';
}

/**
 * An optional `<!-- codename: Orbit -->` marker anywhere in a section body.
 * Absent from every release so far; supported so one can be added without a
 * schema change.
 */
function codenameFrom(body) {
  const m = /<!--\s*codename:\s*([^\n>-]+?)\s*-->/i.exec(body);
  return m ? clampText(m[1], 64) : null;
}

/**
 * Build the changelog-derived manifest for one released section.
 *
 * @param {{ version: string, date: string | null, body: string }} section
 * @param {Record<string, string>} compareLinks
 * @returns {object} a ReleaseManifestEntry with empty git-derived fields
 */
export function manifestFromSection(section, compareLinks) {
  const gitTag = `v${section.version}`;
  const sections = parseSections(section.body)
    .slice(0, LIMITS.maxSections)
    .map((s) => ({
      category: s.category,
      title: clampText(s.title, 200),
      items: s.items.slice(0, LIMITS.maxItemsPerSection).map((item) => ({
        lead: item.lead === null ? null : clampText(item.lead, 200),
        text: clampText(item.text),
      })),
      markdown: clampText(s.markdown, LIMITS.markdownMax),
    }));

  return {
    version: section.version,
    date: section.date,
    channel: channelForTag(gitTag),
    codename: codenameFrom(section.body),
    gitTag,
    commit: null,
    buildNumber: null,
    summary: clampText(parseSummary(section.body)),
    sections,
    contributors: [],
    pullRequests: [],
    mergedBranches: [],
    // Only the PUBLISHED manifest can carry these: a build cannot contain the
    // hash of the installer that has not been produced from it yet.
    assets: [],
    signing: [],
    stats: { commits: null, filesChanged: null, additions: null, deletions: null },
    links: {
      release: `${RELEASE_BASE}/releases/tag/${gitTag}`,
      compare: compareLinks[section.version] ?? null,
      tag: `${RELEASE_BASE}/releases/tag/${gitTag}`,
      milestone: null,
    },
    checksumManifest: 'SHA256SUMS',
    provenanceRepo: RELEASE_REPO,
    markdown: clampText(section.body, LIMITS.markdownMax),
  };
}

/**
 * The manifests to bundle plus the index of every release the changelog knows.
 *
 * The index exists because the two answer different questions: "what changed in
 * the version I just installed" needs full detail for a handful of releases,
 * while "what has this project shipped" needs every version and no detail at
 * all. Bundling full notes for all of them would grow the app forever.
 *
 * @param {{ recentSections: Function, changelogPath?: string }} deps
 */
export function buildManifests(sections, changelogPath) {
  const compareLinks = parseCompareLinks(changelogPath);
  const manifests = sections.map((s) => manifestFromSection(s, compareLinks));
  const detailed = new Set(manifests.map((m) => m.version));

  const index = versionIndex(changelogPath).map((entry) => ({
    version: entry.version,
    date: entry.date,
    channel: channelForTag(`v${entry.version}`),
    summary: clampText(entry.summary),
    detailed: detailed.has(entry.version),
  }));

  return { manifests, index };
}
