/**
 * Safe `gh` (GitHub CLI) runner.
 *
 * **Modelled on `git/exec.ts`, deliberately NOT on `cursor/exec.ts`.** `gh`
 * ships a real `gh.exe` on Windows — the MSI/winget install puts it on PATH —
 * so there is no batch shim to bridge and **no ComSpec path here, and none may
 * be added**. If a future change reintroduces one, that is a regression, not a
 * fix.
 *
 * Security (CLAUDE.md §6):
 * - argv-only via `execFile`, never `shell: true`.
 * - **`--show-token` is refused by assert.** Limboo reads, stores, and
 *   transmits NO GitHub credential — authentication belongs entirely to the
 *   CLI, and the app never wants to hold a token it would then have to protect.
 * - Every captured string passes {@link redactGh} **inside `runGh`**, so a
 *   caller cannot forget to redact before logging or before returning to the
 *   renderer.
 * - Every argv element must match {@link GH_ARG_RE}; argv length and per-arg
 *   length are capped. Subcommands are fixed literals chosen in main.
 * - `gh api` is never invoked and has no IPC channel — it can POST, and it is
 *   excluded from the agent's read-only allowlist for the same reason.
 */
import { execFile } from 'node:child_process';
import { GH_LIMITS } from '@shared/constants';

export interface GhResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
  /** Spawn failure code (`'ENOENT'` when gh is missing), when it never ran. */
  spawnError?: string;
}

/**
 * The only argument shape allowed onto `gh`'s argv. Covers subcommands, flags,
 * `--json` field lists, numbers, and `owner/repo` — and nothing that could be
 * mistaken for a shell construct even if a shell somehow entered the picture.
 */
const GH_ARG_RE = /^[A-Za-z0-9@._/:=+-]+$/;

/** Arguments this module refuses outright, whatever the caller intended. */
const FORBIDDEN_ARGS = new Set(['--show-token', '-t', '--web', '-w']);

/**
 * Strip GitHub credential material from captured output. Runs inside `runGh`
 * on both streams. `logger.ts` carries the same token prefixes for its own
 * redaction pass — extend both together.
 */
export function redactGh(text: string): string {
  return text
    .replace(/gh[pousr]_[A-Za-z0-9]{16,}/g, 'gh*_***')
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_***')
    .replace(/(GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN)\s*[:=]\s*\S+/gi, '$1=***')
    .replace(/Authorization:\s*\S+/gi, 'Authorization: ***')
    .replace(/https:\/\/[^@\s/]+@/g, 'https://***@');
}

function assertArgs(args: string[]): void {
  if (args.length === 0 || args.length > GH_LIMITS.argvMax) {
    throw new Error('gh: invalid argument count');
  }
  for (const arg of args) {
    if (typeof arg !== 'string' || arg.length === 0 || arg.length > GH_LIMITS.argMax) {
      throw new Error('gh: invalid argument');
    }
    // Belt and braces behind the per-handler validation: the argv is composed
    // from fixed templates in main, so anything failing here is a programming
    // error, not user input — but it must still never reach the process.
    if (FORBIDDEN_ARGS.has(arg)) throw new Error(`gh: refused argument ${arg}`);
    if (!GH_ARG_RE.test(arg)) throw new Error('gh: argument contains disallowed characters');
  }
}

/**
 * Run a `gh` command. Resolves even on non-zero exit (inspect `.ok`) and never
 * rejects for a process failure — the `runGit` contract. It DOES throw
 * synchronously for a malformed argv, because that is a bug in the caller.
 */
export function runGh(
  args: string[],
  opts: { cwd?: string; timeout?: number; stdin?: string } = {},
): Promise<GhResult> {
  assertArgs(args);
  const bin = executablePath ?? 'gh';
  return new Promise((resolve) => {
    const child = execFile(
      bin,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeout ?? GH_LIMITS.timeoutMs,
        maxBuffer: GH_LIMITS.maxBuffer,
        windowsHide: true,
        env: {
          // `process.env` passes through unchanged on purpose: a user's own
          // GH_TOKEN / GH_HOST is HOW `gh` authenticates. Limboo never reads
          // those values — it just must not sabotage them.
          ...process.env,
          GH_PROMPT_DISABLED: '1',
          GH_NO_UPDATE_NOTIFIER: '1',
          GH_PAGER: 'cat',
          PAGER: 'cat',
          NO_COLOR: '1',
          CLICOLOR: '0',
        },
      },
      (err, stdout, stderr) => {
        const out = redactGh(typeof stdout === 'string' ? stdout : stdout?.toString() ?? '');
        const errOut = redactGh(typeof stderr === 'string' ? stderr : stderr?.toString() ?? '');
        if (!err) {
          resolve({ ok: true, stdout: out, stderr: errOut, code: 0 });
          return;
        }
        const code = (err as { code?: number | string }).code;
        resolve({
          ok: false,
          stdout: out,
          stderr: errOut || redactGh(err.message),
          code: typeof code === 'number' ? code : 1,
          spawnError: typeof code === 'string' ? code : undefined,
        });
      },
    );

    // Free text (a comment body) rides STDIN, never argv — argv leaks to OS
    // process listings, and `GH_ARG_RE` would reject prose anyway. Paired with
    // `--body-file -`, which the gh manual documents as reading standard input.
    if (opts.stdin !== undefined) {
      child.stdin?.on('error', () => {
        /* the process may already have exited; the exit path reports it */
      });
      child.stdin?.end(opts.stdin);
    }
  });
}

/* ------------------------------------------------------------ resolution */

/** Absolute path resolved by the Windows `where.exe` fallback, if any. */
let executablePath: string | null = null;

let resolution: Promise<{ found: boolean; version?: string }> | null = null;

/**
 * Locate `gh` and read its version. Memoised; `force` re-probes (after the user
 * installs it, or after a CLI self-update).
 */
export function resolveGh(force = false): Promise<{ found: boolean; version?: string }> {
  if (force || !resolution) {
    executablePath = force ? null : executablePath;
    resolution = probe();
  }
  return resolution;
}

async function probe(): Promise<{ found: boolean; version?: string }> {
  const direct = await runGh(['--version']);
  if (direct.ok) return { found: true, version: parseVersion(direct.stdout) };

  // On Windows a freshly-installed CLI is on the REGISTRY PATH, which an
  // already-running GUI process never sees. `where.exe` consults the live
  // machine PATH, so it finds what our inherited environment cannot.
  if (process.platform === 'win32' && direct.spawnError === 'ENOENT') {
    const hit = await whereGh();
    if (hit) {
      executablePath = hit;
      const retry = await runGh(['--version']);
      if (retry.ok) return { found: true, version: parseVersion(retry.stdout) };
      executablePath = null;
    }
  }
  return { found: false };
}

/** First `.exe` hit from `where.exe gh`. A `.cmd`-only result FAILS CLOSED. */
function whereGh(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'where.exe',
      ['gh'],
      { timeout: GH_LIMITS.timeoutMs, maxBuffer: 1 << 16, windowsHide: true },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const exe = String(stdout)
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l.toLowerCase().endsWith('.exe'));
        resolve(exe || null);
      },
    );
  });
}

/** `gh version 2.62.0 (2024-11-14)` → `2.62.0`. */
function parseVersion(stdout: string): string | undefined {
  return /gh version (\S+)/.exec(stdout)?.[1];
}

/* ------------------------------------------------------- capability probe */

let authJsonSupport: Promise<boolean> | null = null;

/**
 * Whether this `gh` understands `auth status --json`.
 *
 * BEHAVIOUR detection, not version arithmetic: the flag landed relatively
 * recently, and parsing `gh --version` to decide would break on distro builds,
 * pre-releases, and enterprise forks. One probe per process; on an
 * unknown-flag failure we fall back to the human-readable parser permanently.
 */
export function supportsAuthJson(): Promise<boolean> {
  if (!authJsonSupport) {
    authJsonSupport = runGh(['auth', 'status', '--json', 'hosts']).then((res) => {
      if (res.ok) return true;
      const combined = `${res.stderr}\n${res.stdout}`;
      // An unrecognised flag means old gh; anything else (not logged in,
      // network) means the flag exists and the COMMAND failed.
      return !/unknown flag|unknown shorthand|--json/i.test(combined);
    });
  }
  return authJsonSupport;
}

/** Test seam + settings-change hook: drop every memoised probe. */
export function resetGhProbes(): void {
  resolution = null;
  authJsonSupport = null;
  executablePath = null;
}
