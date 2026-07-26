/**
 * Shared git ref/revision sanitizers used by both the Git Manager and the
 * Worktree Manager, so every subsystem applies the identical guard.
 *
 * Security (CLAUDE.md §6): refs are always passed as a single argv element
 * (never through a shell), so this is defense in depth against
 * `--upload-pack=…`-style argument injection and ref metacharacter abuse.
 *
 * The rule table itself lives in `@shared/refName` so the renderer can validate
 * the SAME way before invoking IPC — one table, two consumers, no drift.
 */
import { refCharProblem, validateBranchName } from '@shared/refName';

/**
 * Guard for any ref/revision handed to git: branches, tags, object ids, and
 * revision expressions (`HEAD~2`, `origin/main`). Rejects option smuggling
 * (leading `-`), ASCII control characters, and the characters git forbids in a
 * refname. Returns the ref unchanged when safe.
 *
 * Deliberately narrower than {@link sanitizeBranchName}: it must keep accepting
 * revision syntax that existing call sites legitimately pass.
 */
export function sanitizeRef(ref: string): string {
  const problem = refCharProblem(ref, 'ref');
  if (problem) throw new Error(`git: ${problem}`);
  return ref;
}

/**
 * Guard for a ref the user is CREATING (branch or tag). Applies the full
 * `git check-ref-format --branch` rule set on top of {@link sanitizeRef}, so the
 * failure is reported by us with a specific reason instead of surfacing as raw
 * git stderr several layers down.
 */
export function sanitizeBranchName(name: string, label = 'Branch name'): string {
  const check = validateBranchName(name, label);
  if (!check.ok) throw new Error(`git: ${check.reason}`);
  return name;
}
