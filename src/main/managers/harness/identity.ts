/**
 * Reconcile the harness's tool identities and inputs with Limboo's.
 *
 * Two independent mappings, both required before a tool call can be gated or
 * displayed correctly. Kept in one small pure module because both are
 * corrections for specific, verified behaviours of the adapter layer — if either
 * changes on an adapter bump, this is the file to look at.
 */
import path from 'node:path';

/**
 * Common tool names → the native Claude identities Limboo classifies on.
 *
 * The adapter exposes seven built-ins under lowercase "common" names and the
 * rest under their native Claude names. Limboo's `classifyTool`,
 * `summarizeTool`, `permissionDetail`, `filePathOf`, `READ_TOOLS`/`WRITE_TOOLS`
 * and the risk chips all key on the native form, so an unmapped `write` would
 * classify as unknown → `'command'` risk. The consequences are not cosmetic:
 * `autoApproveReads` stops matching reads, `acceptEdits` stops matching edits,
 * every permission chip is mislabelled, and `rememberKey(sessionId, risk)`
 * scopes remembered grants under the wrong risk class.
 *
 * Exactly seven entries; everything else already arrives native-cased
 * (`ExitPlanMode`, `AskUserQuestion`, `Agent`, `WebFetch`, `NotebookEdit`,
 * `TodoWrite`, and every `mcp__*`).
 */
const COMMON_TO_NATIVE: Record<string, string> = {
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  bash: 'Bash',
  glob: 'Glob',
  grep: 'Grep',
  webSearch: 'WebSearch',
};

/**
 * The Limboo tool identity for a harness tool call.
 *
 * Prefers the adapter's own `nativeName` when the part carries one — it is
 * authoritative — and falls back to the common-name table.
 */
export function harnessToolName(toolName: string, nativeName?: string): string {
  if (typeof nativeName === 'string' && nativeName.length > 0) return nativeName;
  return COMMON_TO_NATIVE[toolName] ?? toolName;
}

/** The three input keys `filePathOf` reads. Keep in step with it. */
const PATH_KEYS = ['file_path', 'path', 'notebook_path'] as const;

/**
 * Restore absolute paths that the framework stripped.
 *
 * The harness rewrites every tool input before it reaches the stream, replacing
 * the session's work dir with `''` or `'.'` — so `Write` on
 * `/…/worktrees/ab/slug/src/x.ts` arrives as `src/x.ts`. That is fine for
 * display inside the agent's own transcript and wrong everywhere Limboo needs a
 * real path: the crown-jewel guard resolves a relative path against
 * `process.cwd()` (the app's directory, not the worktree), and a permission
 * dialog should show the user a path they recognise.
 *
 * Re-absolutising is safe by construction: a relative path from the harness can
 * only ever be worktree-relative, because the worktree IS the CLI's working
 * directory. Only the three keys the path guards actually read are touched;
 * everything else is passed through untouched.
 *
 * `Bash.command` is deliberately NOT repaired. The substitution inside a
 * command string is lossy and irreversible (`cd /…/slug && npm test` arrives as
 * `cd . && npm test`, and `.` is indistinguishable from a `.` the model typed).
 * The guards that read `command` are unaffected: crown-jewel paths live outside
 * the worktree so they are never stripped and stay absolute, and the read-only
 * classifier keys on command names, which never contain the worktree path.
 */
export function absolutizeToolInput(
  input: Record<string, unknown>,
  cwd: string,
): Record<string, unknown> {
  let out: Record<string, unknown> | null = null;
  for (const key of PATH_KEYS) {
    const value = input[key];
    if (typeof value !== 'string' || value.length === 0) continue;
    if (path.isAbsolute(value)) continue;
    // '.' is how the framework spells "the work dir itself".
    const resolved = path.resolve(cwd, value === '.' ? '' : value);
    if (resolved === value) continue;
    if (!out) out = { ...input };
    out[key] = resolved;
  }
  return out ?? input;
}
