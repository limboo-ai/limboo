/**
 * The single git ref/branch naming rule table, shared by the main process (which
 * throws before spawning git) and the renderer (which disables the submit button
 * and explains the problem inline, so a bad name never reaches IPC at all).
 *
 * Rules mirror `git check-ref-format` (https://git-scm.com/docs/git-check-ref-format)
 * rather than an ad-hoc blacklist. Two levels:
 *
 *  - {@link refCharProblem} — the *argv/metacharacter* guard applied to EVERY ref
 *    or revision we hand to git (branches, tags, SHAs, `HEAD~2`, `origin/main`).
 *    Deliberately narrow: it must not reject revision syntax we legitimately pass.
 *  - {@link validateBranchName} — the full `--branch` rule set, applied only to
 *    names the user is CREATING.
 *
 * Security (CLAUDE.md §6): refs always ride a single argv element (never a shell),
 * so this is defense in depth against `--upload-pack=…`-style option smuggling and
 * control-character abuse — not the only thing standing between us and a shell.
 */
import { GIT_LIMITS } from './constants';

export type RefCheck = { ok: true } | { ok: false; reason: string };

/**
 * Characters git forbids in ANY refname: ASCII control chars (< \040 and \177
 * DEL), space, `~`, `^`, `:`, `?`, `*`, `[`, and backslash.
 *
 * Note this is an explicit ASCII set, NOT JavaScript's `\s`. `\s` also matches
 * U+00A0 (NBSP), U+FEFF, U+3000 and friends — which git accepts perfectly well —
 * so using it here rejected legal branch names pasted from Jira/Slack/Notion,
 * while simultaneously letting C0 controls and DEL through.
 */
// eslint-disable-next-line no-control-regex -- matching control characters IS the point here.
const FORBIDDEN_CHAR = /[\x00-\x20\x7f~^:?*[\\]/;

/** Human-readable name for the offending character, for the error message. */
function describeChar(ch: string): string {
  if (ch === ' ') return 'a space';
  if (ch === '\t') return 'a tab';
  if (ch === '\n' || ch === '\r') return 'a line break';
  const code = ch.charCodeAt(0);
  if (code < 0x20 || code === 0x7f) {
    return `a control character (0x${code.toString(16).padStart(2, '0')})`;
  }
  return `"${ch}"`;
}

/**
 * The shared character/length guard. Returns the problem description, or null
 * when the ref is safe to hand to git as a single argv element.
 */
export function refCharProblem(ref: unknown, label = 'ref'): string | null {
  if (typeof ref !== 'string' || ref.length === 0) {
    return `${label} cannot be empty`;
  }
  if (ref.length > GIT_LIMITS.refNameMax) {
    return `${label} is too long (max ${GIT_LIMITS.refNameMax} characters)`;
  }
  // A leading dash would be parsed by git as an option, not a ref.
  if (ref.startsWith('-')) {
    return `${label} cannot start with "-"`;
  }
  const bad = FORBIDDEN_CHAR.exec(ref);
  if (bad) {
    return `${label} cannot contain ${describeChar(bad[0])}`;
  }
  return null;
}

/**
 * Full `git check-ref-format --branch` validation, for a name the user is
 * creating. Everything {@link refCharProblem} rejects, plus the structural rules
 * that only matter when git is asked to CREATE the ref.
 */
export function validateBranchName(name: unknown, label = 'Branch name'): RefCheck {
  const charProblem = refCharProblem(name, label);
  if (charProblem) return { ok: false, reason: charProblem };

  // Narrowed by refCharProblem returning null.
  const ref = name as string;

  if (ref.includes('..')) return { ok: false, reason: `${label} cannot contain ".."` };
  if (ref.includes('@{')) return { ok: false, reason: `${label} cannot contain "@{"` };
  if (ref.includes('//')) return { ok: false, reason: `${label} cannot contain "//"` };
  if (ref.startsWith('/')) return { ok: false, reason: `${label} cannot start with "/"` };
  if (ref.endsWith('/')) return { ok: false, reason: `${label} cannot end with "/"` };
  if (ref.endsWith('.')) return { ok: false, reason: `${label} cannot end with "."` };
  if (ref.endsWith('.lock')) return { ok: false, reason: `${label} cannot end with ".lock"` };

  for (const part of ref.split('/')) {
    if (part.startsWith('.')) {
      return { ok: false, reason: `${label} cannot have a part starting with "." ("${part}")` };
    }
    if (part.endsWith('.lock')) {
      return { ok: false, reason: `${label} cannot have a part ending in ".lock" ("${part}")` };
    }
  }

  // Deliberately NOT rejected, because `git branch` accepts them (verified
  // empirically, not just read off the docs) and rejecting a name git allows is
  // the exact bug this table was written to fix:
  //   - a bare "@": rule 9 forbids the single character `@` as a full refname,
  //     but a branch is `refs/heads/@`, so the rule never applies here.
  //   - a 40-hex name that looks like an object id.
  // Both are footguns, but they are git's footguns to allow, not ours to forbid.
  return { ok: true };
}
