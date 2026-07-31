/**
 * Safe git command runner for the Git Manager.
 *
 * Security (CLAUDE.md §6): git is always invoked via `execFile` with an **argv
 * array** and a fixed `cwd` — never `shell: true`, so nothing in a path, branch
 * name, or message is interpreted by a shell. Calls are bounded by a timeout and
 * a max output buffer, and the process environment is locked down (no pager, no
 * interactive prompts, non-interactive credential helper). Callers must validate
 * any renderer-supplied path with {@link assertInsideRepo} before passing it.
 */
import { execFile } from 'node:child_process';
import path from 'node:path';

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
  /**
   * The SPAWN failure code (`'ENOENT'` when the `git` binary is missing,
   * `'EACCES'`, …), when the process never ran at all.
   *
   * `execFile` reports these as a *string* in `err.code`, which the numeric
   * `code` field below collapses to `1` — making "git is not installed"
   * indistinguishable from "this is not a repository". Callers that need to
   * tell those apart (see `environment.ts`) must read this, never `stderr`.
   */
  spawnError?: string;
}

const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_MAX_BUFFER = 32 * 1024 * 1024;

/**
 * Run a git command in `cwd`. Resolves even on non-zero exit (inspect `.ok`),
 * so callers can branch on failure without try/catch noise. Never rejects.
 */
export function runGit(
  cwd: string,
  args: string[],
  opts: { timeout?: number; maxBuffer?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout: opts.timeout ?? DEFAULT_TIMEOUT,
        maxBuffer: opts.maxBuffer ?? DEFAULT_MAX_BUFFER,
        windowsHide: true,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_OPTIONAL_LOCKS: '0',
          GIT_PAGER: 'cat',
          PAGER: 'cat',
          // Never block on an interactive credential prompt (local-only ops).
          GIT_ASKPASS: 'echo',
          ...opts.env,
        },
      },
      (err, stdout, stderr) => {
        const out = typeof stdout === 'string' ? stdout : stdout?.toString() ?? '';
        const errOut = typeof stderr === 'string' ? stderr : stderr?.toString() ?? '';
        if (!err) {
          resolve({ ok: true, stdout: out, stderr: errOut, code: 0 });
          return;
        }
        const code = (err as { code?: number | string }).code;
        resolve({
          ok: false,
          stdout: out,
          stderr: errOut || err.message,
          code: typeof code === 'number' ? code : 1,
          spawnError: typeof code === 'string' ? code : undefined,
        });
      },
    );
  });
}

/** True when `git` exited 0 and produced (trimmed) stdout. */
export async function gitText(cwd: string, args: string[]): Promise<string | null> {
  const r = await runGit(cwd, args);
  return r.ok ? r.stdout.replace(/\n$/, '') : null;
}

/**
 * Guard a renderer-supplied, repo-relative path: reject absolute paths, parent
 * traversal, and anything that resolves outside the repository root. Returns the
 * normalized, repo-relative POSIX path on success.
 */
export function assertInsideRepo(root: string, relPath: string): string {
  if (typeof relPath !== 'string' || relPath.length === 0 || relPath.length > 4096) {
    throw new Error('git: invalid path');
  }
  if (path.isAbsolute(relPath) || relPath.includes('\0')) {
    throw new Error('git: path must be repo-relative');
  }
  const resolved = path.resolve(root, relPath);
  const rel = path.relative(root, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('git: path escapes the repository');
  }
  return rel.split(path.sep).join('/');
}
