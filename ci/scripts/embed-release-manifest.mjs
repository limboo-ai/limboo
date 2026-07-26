#!/usr/bin/env node
/**
 * embed-release-manifest.mjs — stamp the git-derived release facts into the
 * committed manifest module, at package time.
 *
 *   node ci/scripts/embed-release-manifest.mjs [tag]
 *   # tag defaults to CI_COMMIT_TAG / GITHUB_REF_NAME / BITBUCKET_TAG
 *
 * Rewrites `src/shared/releaseManifest.generated.ts` IN PLACE, exactly the way
 * `apply-tag-version.mjs` rewrites `package.json`: an ephemeral build-time edit
 * that is never committed. The reason is the same in both cases — a laptop
 * running `npm run gen:notes` has no tag, so it cannot know the commit the
 * release points at, who contributed to the range, or which pipeline built it.
 * Only the tagged CI job can, and only at build time.
 *
 * Everything it fills in is derived from git alone. It never invents a field it
 * cannot compute: an absent previous tag (the first release) yields empty
 * contributors rather than "everyone who ever committed".
 *
 * Runs BEFORE the app build, so the values end up compiled into the bundle.
 * Asset digests and signing status are NOT stamped here — they do not exist yet
 * — and are added to the published `dist/release-manifest.json` afterwards by
 * `generate-release-manifest.mjs`.
 *
 * Dependency-free, argv-only (no `shell: true`) like every script here.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './lib/changelog.mjs';
import { git, previousTag, revExists } from './lib/git.mjs';
import { LIMITS, RELEASE_REPO } from './lib/releaseManifest.mjs';
import { resolveForgeProfiles } from './lib/forgeProfiles.mjs';

const MANIFEST = path.join(REPO_ROOT, 'src', 'shared', 'releaseManifest.generated.ts');

/** Same tag grammar `apply-tag-version.mjs` enforces, so the two cannot diverge. */
const TAG_RE = /^v(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/;

/** GitHub's noreply commit emails encode the handle; nothing else does. */
const NOREPLY_RE = /^(?:\d+\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com$/i;

function resolveTag() {
  const explicit = process.argv[2];
  if (explicit) return explicit.trim();
  if (process.env.CI_COMMIT_TAG) return process.env.CI_COMMIT_TAG.trim();
  if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME) {
    return process.env.GITHUB_REF_NAME.trim();
  }
  if (process.env.BITBUCKET_TAG) return process.env.BITBUCKET_TAG.trim();
  return '';
}

function buildNumber() {
  return (
    process.env.CI_PIPELINE_IID ??
    process.env.GITHUB_RUN_NUMBER ??
    process.env.BITBUCKET_BUILD_NUMBER ??
    null
  );
}

/**
 * Contributors in `prev..tag`, deduped by email and commit-counted.
 *
 * This is the OFFLINE truth, and deliberately still complete on its own: the
 * forge enrichment below improves these entries but is never required by them.
 * The email rides along as a join key for that step and is stripped before the
 * manifest is written — it must not end up compiled into every copy of the app.
 */
function gitContributors(range) {
  const raw = git(['log', '--no-merges', '--format=%an%x00%ae', ...range], { allowFailure: true });
  if (!raw) return [];

  /** @type {Map<string, { name: string, email: string, commits: number }>} */
  const byEmail = new Map();
  for (const line of raw.split('\n')) {
    const [name, email] = line.split('\0');
    if (!name || !email) continue;
    const key = email.toLowerCase();
    const entry = byEmail.get(key) ?? { name, email, commits: 0 };
    entry.commits += 1;
    byEmail.set(key, entry);
  }

  return [...byEmail.values()]
    .sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name))
    .slice(0, LIMITS.maxContributors);
}

/**
 * Turn git contributors into manifest entries, preferring the forge account when
 * one was resolved.
 *
 * The tagger is marked `maintainer` — that is a fact git records, unlike
 * "reviewer" or "release manager", which nothing in this repository's history
 * distinguishes. Those roles exist in the schema for a forge that can supply
 * them; inventing them from commit data would be a guess presented as a credit.
 *
 * `profiles` is empty whenever the network half did not happen (no token, rate
 * limit, offline runner, a non-GitHub forge), and every field then falls back to
 * what git knows. The document degrades to initials; it never degrades to blank.
 */
function toReleasePersons(people, profiles) {
  return people.map((c, i) => {
    const profile = profiles.get(c.email.toLowerCase()) ?? null;
    // Offline fallback: GitHub's noreply commit emails encode the handle, and
    // nothing else does.
    const handle = profile?.login ?? NOREPLY_RE.exec(c.email)?.[1] ?? null;
    return {
      name: (profile?.name || c.name).slice(0, 200),
      handle,
      commits: c.commits,
      // The top committer in a release range is this project's maintainer.
      role: i === 0 ? 'maintainer' : 'contributor',
      profileUrl: profile?.profileUrl ?? (handle ? `https://github.com/${handle}` : null),
      avatar: profile?.avatar ?? null,
    };
  });
}

/**
 * Pull requests referenced by the range.
 *
 * Two conventions, because this repository uses both: squash-merged commits end
 * in `(#85)`, and true merge commits say `Merge pull request #85 from …`. The
 * TITLE is whatever the commit subject says minus the reference — nothing here
 * contacts a forge, so a PR's real title is not available offline.
 */
function pullRequestsFor(range) {
  const raw = git(['log', '--format=%s', ...range], { allowFailure: true });
  if (!raw) return [];

  /** @type {Map<number, string>} */
  const byNumber = new Map();
  for (const subject of raw.split('\n')) {
    const merge = /^Merge pull request #(\d+) from \S+(?:\s+(.*))?$/.exec(subject);
    if (merge) {
      byNumber.set(Number(merge[1]), (merge[2] ?? `Pull request #${merge[1]}`).trim());
      continue;
    }
    const squash = /^(.*)\s+\(#(\d+)\)$/.exec(subject);
    if (squash) byNumber.set(Number(squash[2]), squash[1].trim());
  }

  return [...byNumber.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, LIMITS.maxPullRequests)
    .map(([number, title]) => ({
      number,
      title: title.slice(0, LIMITS.textMax),
      url: `https://github.com/${RELEASE_REPO}/pull/${number}`,
    }));
}

/** Branch names from merge-commit subjects, deduped. */
function mergedBranchesFor(range) {
  const raw = git(['log', '--merges', '--format=%s', ...range], { allowFailure: true });
  if (!raw) return [];
  const names = new Set();
  for (const subject of raw.split('\n')) {
    const m =
      /^Merge pull request #\d+ from \S+?\/(\S+)/.exec(subject) ??
      /^Merge branch '([^']+)'/.exec(subject);
    if (m) names.add(m[1]);
  }
  return [...names].slice(0, LIMITS.maxMergedBranches);
}

/** Commit / file / line counts for the range. */
function statsFor(range) {
  const commits = Number(git(['rev-list', '--count', ...range], { allowFailure: true }) || '0');
  const shortstat = git(['diff', '--shortstat', ...range], { allowFailure: true });
  const files = Number(/(\d+) files? changed/.exec(shortstat)?.[1] ?? '0');
  const additions = Number(/(\d+) insertions?/.exec(shortstat)?.[1] ?? '0');
  const deletions = Number(/(\d+) deletions?/.exec(shortstat)?.[1] ?? '0');
  return {
    commits: Number.isFinite(commits) ? commits : null,
    filesChanged: files,
    additions,
    deletions,
  };
}

async function main() {
  const tag = resolveTag();
  if (!tag) {
    // Not an error: every non-tag build takes this path, and the committed
    // manifest is already correct for it.
    console.error('embed-release-manifest: no tag in the environment — nothing to stamp.');
    return;
  }
  const match = TAG_RE.exec(tag);
  if (!match) {
    console.error(`embed-release-manifest: "${tag}" is not a vX.Y.Z release tag.`);
    process.exit(1);
  }
  const version = match[1];

  if (!revExists(tag)) {
    console.error(`embed-release-manifest: tag ${tag} does not exist in this checkout.`);
    process.exit(1);
  }

  const prev = previousTag(tag);
  // The first release has no predecessor. `tag` alone would mean "every commit
  // ever", which is right for a first release and wrong for anything else — so
  // the range is explicit rather than implied.
  const range = prev ? [`${prev}..${tag}`] : [tag];

  const people = gitContributors(range);

  // Ask the forge who these commit emails actually belong to, and bring back
  // each account's profile name and picture. Best-effort by contract: any
  // failure yields an empty map and the git-derived identity stands.
  let profiles = new Map();
  try {
    profiles = await resolveForgeProfiles(people, {
      repo: RELEASE_REPO,
      base: prev,
      head: tag,
      log: (msg) => console.error(`embed-release-manifest: forge: ${msg}`),
    });
  } catch (err) {
    console.error(
      `embed-release-manifest: forge lookup failed, keeping git identities — ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const source = readFileSync(MANIFEST, 'utf8');
  const stamped = {
    commit: git(['rev-parse', `${tag}^{commit}`]),
    buildNumber: buildNumber(),
    contributors: toReleasePersons(people, profiles),
    pullRequests: pullRequestsFor(range),
    mergedBranches: mergedBranchesFor(range),
    stats: statsFor(range),
  };

  const updated = stampVersion(source, version, stamped);
  if (updated === source) {
    console.error(
      `embed-release-manifest: no entry for ${version} in releaseManifest.generated.ts. ` +
        'Run `npm run gen:notes` after adding the CHANGELOG.md section.',
    );
    process.exit(1);
  }

  writeFileSync(MANIFEST, updated, 'utf8');
  const withAvatars = stamped.contributors.filter((c) => c.avatar).length;
  console.error(
    `embed-release-manifest: stamped ${version} — commit ${stamped.commit.slice(0, 12)}, ` +
      `${stamped.contributors.length} contributor(s) (${withAvatars} with avatars), ` +
      `${stamped.pullRequests.length} PR(s), build ${stamped.buildNumber ?? 'n/a'}`,
  );
}

/**
 * Replace the six git-derived fields of one version's entry.
 *
 * Operates on the emitted JSON rather than re-running the generator, so the
 * changelog-derived half of the file is byte-identical to what was reviewed and
 * committed. The entry is located by parsing the two `RELEASE_*` literals out of
 * the module — a regex over 300 lines of nested JSON would be the fragile way
 * to do this.
 */
function stampVersion(source, version, stamped) {
  const parsed = parseArrays(source);
  if (!parsed) return source;

  const entry = parsed.manifests.find((m) => m.version === version);
  if (!entry) return source;
  Object.assign(entry, stamped);

  return (
    source.slice(0, parsed.manifestsStart) +
    JSON.stringify(parsed.manifests, null, 2) +
    source.slice(parsed.manifestsEnd)
  );
}

/** Locate and parse the `RELEASE_MANIFESTS` array literal in the module text. */
function parseArrays(source) {
  const marker = 'export const RELEASE_MANIFESTS: ReleaseManifestEntry[] = ';
  const at = source.indexOf(marker);
  if (at === -1) return null;
  const start = at + marker.length;
  const end = matchBracket(source, start);
  if (end === -1) return null;
  try {
    return { manifests: JSON.parse(source.slice(start, end)), manifestsStart: start, manifestsEnd: end };
  } catch {
    return null;
  }
}

/**
 * Index just past the `]` that closes the array beginning at `start`.
 *
 * String-aware, because the manifest bodies are full of brackets inside
 * changelog prose. JSON strings have exactly one escape form, so tracking
 * `"` and `\` is the whole grammar needed here.
 */
function matchBracket(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

// `main` is async now (the forge lookup). Without this, a rejection would print
// an UnhandledPromiseRejection warning and, depending on Node's mode, still exit
// 0 — a release that silently skipped stamping is exactly the failure this
// script exists to prevent.
main().catch((err) => {
  console.error('embed-release-manifest:', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
