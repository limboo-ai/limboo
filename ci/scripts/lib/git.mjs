/**
 * git.mjs — the three git helpers the release scripts all needed a copy of.
 *
 * `generate-release-notes.mjs` grew them first; `embed-release-manifest.mjs`
 * needs the same three, and a second copy of `previousTag()` is exactly how two
 * scripts that are supposed to describe the same range start disagreeing about
 * where it begins.
 *
 * Dependency-free by house rule, and argv-only — no `shell: true`, no string
 * interpolation into a command line, anywhere under `ci/scripts/`.
 */
import { spawnSync } from 'node:child_process';

/**
 * Run git and return trimmed stdout, throwing on a non-zero exit.
 *
 * @param {string[]} args
 * @param {{ allowFailure?: boolean }} [opts]
 * @returns {string}
 */
export function git(args, opts = {}) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    if (opts.allowFailure) return '';
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  }
  return r.stdout.trim();
}

/**
 * True when git can resolve a ref.
 *
 * `docs/ci/release-process.md` tells maintainers to PREVIEW a release before
 * tagging, so the common local invocation names a tag that does not exist yet.
 * Callers use this to fall back to HEAD instead of aborting.
 *
 * @param {string} ref
 * @returns {boolean}
 */
export function revExists(ref) {
  return spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).status === 0;
}

/**
 * The most recent tag strictly before `ref`, or null for the first release.
 *
 * @param {string} ref
 * @returns {string | null}
 */
export function previousTag(ref) {
  const r = spawnSync('git', ['describe', '--tags', '--abbrev=0', `${ref}^`], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}
