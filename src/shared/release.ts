/**
 * The release manifest — the typed shape of "what is in this version".
 *
 * `CHANGELOG.md` is the single source of truth. One parser
 * (`ci/scripts/lib/changelog.mjs`) reads it, and three consumers render it: the
 * GitHub/GitLab release body, `dist/release-manifest.json` published alongside
 * the binaries, and the in-app release document. This file is the contract they
 * agree on, hand-written and reviewed; `releaseManifest.generated.ts` carries
 * only DATA and imports these types.
 *
 * WHY THE MANIFEST IS COMPILED IN RATHER THAN FETCHED. The production CSP is
 * `connect-src 'self'; img-src 'self' data:` (see `hardenSession` in
 * `src/main/index.ts`) — the renderer cannot reach github.com at all, by design.
 * Limboo is local-first and the only network traffic in the product is the
 * connected coding agent talking to its provider. A release document that needed
 * the network would be blank offline, blank in development, and would be the
 * first feature to widen the CSP. So the notes ship inside the build that they
 * describe, and there is nothing to verify at runtime because there is nothing
 * arriving at runtime.
 *
 * THE ONE THING A BUILD CANNOT KNOW ABOUT ITSELF is its own installer's hash: it
 * does not exist until after the build that would have to contain it. So
 * `assets[]` / `signing[]` are populated only in the PUBLISHED manifest
 * (`ci/scripts/generate-release-manifest.mjs`, written into `dist/` before
 * `make-checksums.mjs` so `SHA256SUMS` covers it) and are empty in the embedded
 * copy. The document renders what it has and says where the rest is verified,
 * rather than printing a digest it cannot stand behind.
 */

/** Distribution channel, derived from the tag's prerelease suffix. */
export type ReleaseChannel = 'stable' | 'beta' | 'nightly' | 'preview';

/**
 * A section of a release, normalized from a `### Heading` in the changelog.
 *
 * Keep a Changelog defines the first six. The rest are headings this project
 * writes in practice. Anything unrecognized maps to `other` — an unknown heading
 * is displayed, never trusted as a category.
 */
export type ReleaseCategory =
  | 'added'
  | 'changed'
  | 'deprecated'
  | 'removed'
  | 'fixed'
  | 'security'
  | 'performance'
  | 'breaking'
  | 'migration'
  | 'dependencies'
  | 'documentation'
  | 'tooling'
  | 'known-issues'
  | 'other';

/**
 * One bullet. House style is `- **Lead-in.** Explanation.`, so the lead is split
 * out and rendered as the item's title; `text` is the remaining Markdown.
 * `lead` is null for a bullet written without one.
 */
export interface ReleaseItem {
  lead: string | null;
  text: string;
}

/** One `### …` block of a release. */
export interface ReleaseSection {
  category: ReleaseCategory;
  /** The heading as authored, so an unmapped one still reads correctly. */
  title: string;
  items: ReleaseItem[];
  /** The block's raw Markdown, for copy/export and the Markdown fallback. */
  markdown: string;
}

/** How someone shows up in a release. */
export type ReleaseRole = 'maintainer' | 'contributor' | 'reviewer' | 'release-manager';

/**
 * A person credited on a release. There is no avatar URL by design: `img-src` is
 * `'self' data:`, so a remote avatar would be a broken image on every row. The
 * document renders a local monogram from `name` instead.
 */
export interface ReleasePerson {
  name: string;
  /**
   * Forge handle when it can be derived offline (a GitHub noreply commit email
   * encodes it), else null. Never guessed from a display name.
   */
  handle: string | null;
  /** Commits attributed in the tag range. */
  commits: number;
  role: ReleaseRole;
  /** Profile URL, always forge-hosted and screened by {@link isForgeUrl}. */
  profileUrl: string | null;
}

/** A merged pull/merge request referenced by the release range. */
export interface ReleasePullRequest {
  number: number;
  title: string;
  url: string | null;
}

export type ReleasePlatform = 'windows' | 'macos' | 'linux' | 'any';

/** What kind of thing a published file is. */
export type ReleaseAssetKind = 'installer' | 'archive' | 'feed' | 'metadata' | 'other';

/**
 * One published file. `bytes`/`sha256` are null in the embedded manifest and
 * populated in the published one — see the header note on why a build cannot
 * contain its own hash.
 */
export interface ReleaseAsset {
  name: string;
  platform: ReleasePlatform;
  /** `x64`, `arm64`, `universal`, or `''` when the file is arch-independent. */
  arch: string;
  kind: ReleaseAssetKind;
  bytes: number | null;
  sha256: string | null;
}

/** Signing posture for one platform, as observed by `verify-signing.mjs`. */
export interface ReleaseSigning {
  platform: ReleasePlatform;
  status: 'signed' | 'self-signed' | 'unsigned' | 'unknown';
  /** Human-readable detail (authority, certificate subject, or why not). */
  detail: string;
}

/** Range statistics for the release. Null when not computed from git. */
export interface ReleaseStats {
  commits: number | null;
  filesChanged: number | null;
  additions: number | null;
  deletions: number | null;
}

/** Outbound links. Every one is screened by {@link isForgeUrl} before display. */
export interface ReleaseLinks {
  release: string | null;
  compare: string | null;
  tag: string | null;
  milestone: string | null;
}

/** Everything the app knows about one released version. */
export interface ReleaseManifestEntry {
  /** Semantic version, without a leading `v`. */
  version: string;
  /** ISO date, or null for a section authored without one. */
  date: string | null;
  channel: ReleaseChannel;
  /** Optional `<!-- codename: … -->` marker in the changelog section. */
  codename: string | null;
  /** The git tag, e.g. `v1.7.0`. */
  gitTag: string;
  /** Commit the tag points at. Null outside a tagged CI build. */
  commit: string | null;
  /** CI pipeline/run number. Null outside CI. */
  buildNumber: string | null;
  /** The prose paragraph under the version heading. */
  summary: string;
  sections: ReleaseSection[];
  contributors: ReleasePerson[];
  pullRequests: ReleasePullRequest[];
  mergedBranches: string[];
  assets: ReleaseAsset[];
  signing: ReleaseSigning[];
  stats: ReleaseStats;
  links: ReleaseLinks;
  /** Name of the published checksum manifest, e.g. `SHA256SUMS`. */
  checksumManifest: string | null;
  /** `owner/repo` for `gh attestation verify`. */
  provenanceRepo: string | null;
  /** The section's raw Markdown — the source for copy and export. */
  markdown: string;
}

/**
 * A version the changelog knows about. The full manifest is bundled only for the
 * most recent few (the changelog grows without bound; the app payload must not),
 * so History lists every version from this index and offers detail for the ones
 * that are carried.
 */
export interface ReleaseIndexEntry {
  version: string;
  date: string | null;
  channel: ReleaseChannel;
  summary: string;
  /** Whether a full {@link ReleaseManifestEntry} is bundled for this version. */
  detailed: boolean;
}

/** Display label for a category. */
export const RELEASE_CATEGORY_LABEL: Record<ReleaseCategory, string> = {
  added: 'Added',
  changed: 'Changed',
  deprecated: 'Deprecated',
  removed: 'Removed',
  fixed: 'Fixed',
  security: 'Security',
  performance: 'Performance',
  breaking: 'Breaking changes',
  migration: 'Migration',
  dependencies: 'Dependencies',
  documentation: 'Documentation',
  tooling: 'Developer tooling',
  'known-issues': 'Known limitations',
  other: 'Other',
};

/**
 * Reading order in the document: what breaks first, what is dangerous second,
 * then the ordinary Keep a Changelog progression, then the long tail.
 */
export const RELEASE_CATEGORY_ORDER: ReleaseCategory[] = [
  'breaking',
  'security',
  'migration',
  'added',
  'changed',
  'fixed',
  'performance',
  'deprecated',
  'removed',
  'dependencies',
  'tooling',
  'documentation',
  'known-issues',
  'other',
];

/**
 * Map a `### Heading` to a category. Shared with the generator by value, not by
 * import — `ci/scripts/**` is dependency-free plain Node and cannot import TS —
 * so any change here must be mirrored in `ci/scripts/lib/changelog.mjs`. The
 * generator is what actually assigns categories; this table exists so the
 * renderer can classify a manifest produced by an older generator.
 */
export function releaseCategoryFor(heading: string): ReleaseCategory {
  const h = heading.trim().toLowerCase();
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

/**
 * The forges this project publishes to. A release URL that is not on one of
 * these is not rendered as a link.
 */
const FORGE_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org'] as const;

/**
 * Whether a URL may be surfaced as a clickable link in the release document.
 *
 * Manifest text is authored in this repository, but it reaches the renderer as
 * data and is rendered without further review, so links are screened the same
 * way the Cursor login URL is: https only, no embedded credentials, and the host
 * must be a forge host or a subdomain of one (DOT-BOUNDARY match — a plain
 * `endsWith` would accept `evil-github.com`).
 *
 * `system.openExternal` performs its own length and credential checks in main;
 * this is the renderer-side gate that decides whether something is a link at all.
 */
export function isForgeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  return FORGE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Derive the channel from a tag's prerelease suffix. `v1.7.0-beta.1` → beta. */
export function channelForTag(tag: string): ReleaseChannel {
  const suffix = /-([0-9A-Za-z.-]+)$/.exec(tag.trim())?.[1]?.toLowerCase() ?? '';
  if (!suffix) return 'stable';
  if (suffix.startsWith('beta') || suffix.startsWith('rc')) return 'beta';
  if (suffix.startsWith('nightly')) return 'nightly';
  return 'preview';
}
