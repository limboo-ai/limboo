/**
 * linuxInstall — Limboo's own privileged installer for the Linux
 * package-manager formats (deb / rpm / pacman).
 *
 * WHY THIS EXISTS. electron-updater applies these formats from inside
 * `quitAndInstall()`, and its implementation is unusable for a desktop app:
 *
 * 1. It runs the package manager through **`spawnSync` with `shell: true`**,
 *    wrapped in `/bin/bash -c '<joined argv>'`. That blocks the entire main
 *    process for the whole authentication + install — measured at 19 s on a
 *    normal Manjaro box. The window is frozen while the polkit dialog is up, so
 *    the prompt can land behind a dead app and the user sees nothing happen.
 * 2. It passes `pkexec --disable-internal-agent`, which removes pkexec's own
 *    fallback agent, and on failure immediately fires a SECOND privileged
 *    command (`pacman -Sy`) — a second password prompt for a database sync the
 *    user never asked for.
 * 3. When no graphical helper exists it falls back to plain `sudo` with piped
 *    stdio, which blocks forever on a password it can never read.
 * 4. `RpmUpdater` picks the FIRST entry of its priority list when none of the
 *    package managers are installed, so a machine with no rpm tooling still
 *    prompts for a password and then reports `zypper: command not found`.
 *
 * This module does the same job the way CLAUDE.md §6 requires: argv arrays only,
 * never `shell: true`, no `/bin/bash -c` string assembly, asynchronous so the
 * main process stays responsive, bounded output, one prompt, and an honest
 * result the UI can act on. When it cannot succeed it hands back the exact
 * command the user can run themselves ({@link manualInstallCommand}) instead of
 * dying silently.
 *
 * Nothing here accepts renderer input. The only variable is the staged file path
 * electron-updater reports, which the main process owns end to end.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../logger';

/** The Linux packaging formats this module can install. */
export type LinuxPackageFormat = 'deb' | 'rpm' | 'pacman';

export interface PrivilegedInstallResult {
  ok: boolean;
  /** Human-readable failure reason (failure only). Safe to show verbatim. */
  error?: string;
}

/** How long to let the whole privileged install run before killing it. */
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;
/** Hard cap on captured child output, so a chatty package manager can't grow memory. */
const MAX_OUTPUT_BYTES = 8 * 1024;

/**
 * Package managers that can install each format, in preference order.
 *
 * The FIRST one actually present on the host wins. Unlike electron-updater's
 * `detectPackageManager`, an empty result is a hard failure rather than a
 * silent fallback to the head of the list.
 */
const MANAGERS: Record<LinuxPackageFormat, readonly string[]> = {
  pacman: ['pacman'],
  deb: ['dpkg', 'apt-get'],
  rpm: ['dnf', 'zypper', 'yum', 'rpm'],
};

/* ------------------------------------------------------------------ */
/* Command discovery (no child processes — pure filesystem)            */
/* ------------------------------------------------------------------ */

/**
 * Absolute path of `cmd` on PATH, or null.
 *
 * Deliberately does NOT shell out (`which` / `command -v`) — resolving this
 * ourselves keeps discovery free of subprocesses and lets us apply the
 * PATH-poisoning guard in one place: only ABSOLUTE PATH entries are considered,
 * so a writable relative directory earlier in PATH can never shadow the real
 * package manager.
 */
function resolveCommand(cmd: string): string | null {
  if (cmd.includes(path.sep)) return isExecutableFile(cmd) ? cmd : null;
  for (const dir of sanitizedPathDirs()) {
    const candidate = path.join(dir, cmd);
    if (isExecutableFile(candidate)) return candidate;
  }
  return null;
}

function sanitizedPathDirs(): string[] {
  return (process.env.PATH ?? '').split(path.delimiter).filter((dir) => path.isAbsolute(dir));
}

function isExecutableFile(candidate: string): boolean {
  try {
    if (!fs.statSync(candidate).isFile()) return false;
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** The first package manager for `format` that exists here, as an absolute path. */
function resolveManager(format: LinuxPackageFormat): string | null {
  for (const name of MANAGERS[format]) {
    const resolved = resolveCommand(name);
    if (resolved) return resolved;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Format detection                                                    */
/* ------------------------------------------------------------------ */

/**
 * Which package format this install actually IS, or null when it is neither a
 * package-manager install nor one we can act on (tar.gz, an unpacked dir, …).
 *
 * `{resources}/package-type` is electron-builder's marker, but the repo's hybrid
 * `--prepackaged` build hands ONE staged app directory to every Linux target, so
 * a later fpm run can leave a stale marker behind (the hazard AutoUpdateManager's
 * header already documents). The marker is therefore CROSS-CHECKED against the
 * host: a marker naming a package manager this machine does not have is not
 * trusted, and the host's own tooling decides instead.
 *
 * An ABSENT marker still returns null. Guessing the packaging format purely from
 * the host would also pick which artifact we download, and being wrong there is
 * worse than reporting "this build cannot self-update".
 */
export function detectPackageFormat(resourcesPath: string): LinuxPackageFormat | null {
  if (process.platform !== 'linux') return null;
  if (process.env.APPIMAGE) return null; // AppImage replaces itself; no packages involved.

  const marker = readPackageTypeMarker(resourcesPath);
  if (!marker) return null;

  if (resolveManager(marker)) return marker;

  // Stale marker: the format it names cannot be installed here. Fall back to
  // whatever tooling the host really has.
  for (const format of ['pacman', 'deb', 'rpm'] as const) {
    if (resolveManager(format)) {
      logger.warn(
        `[updater] package-type marker says "${marker}" but this host has no ${MANAGERS[marker].join('/')}; using ${format} instead`,
      );
      return format;
    }
  }

  logger.warn(`[updater] package-type marker "${marker}": no usable package manager on this host`);
  return null;
}

function readPackageTypeMarker(resourcesPath: string): LinuxPackageFormat | null {
  try {
    const marker = path.join(resourcesPath, 'package-type');
    if (!fs.existsSync(marker)) return null;
    const value = fs.readFileSync(marker, 'utf8').trim();
    return value === 'deb' || value === 'rpm' || value === 'pacman' ? value : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Privilege escalation                                                */
/* ------------------------------------------------------------------ */

/**
 * `pkexec` is the ONLY escalation helper supported, and it is invoked WITHOUT
 * `--disable-internal-agent` so pkexec can fall back to its own agent when the
 * session has no graphical one registered.
 *
 * gksudo/kdesudo are intentionally not supported: their argv contracts take the
 * command as a single shell-quoted STRING, which would reintroduce exactly the
 * `/bin/bash -c '…'` assembly this module exists to remove. Plain `sudo` is
 * refused outright — with piped stdio it blocks forever on a password prompt it
 * can never read, wedging the main process permanently.
 */
function resolvePkexec(): string | null {
  return resolveCommand('pkexec');
}

/** True when this process is already root and needs no escalation at all. */
function isRoot(): boolean {
  return typeof process.getuid === 'function' && process.getuid() === 0;
}

/* ------------------------------------------------------------------ */
/* Install                                                             */
/* ------------------------------------------------------------------ */

/**
 * The argv that installs `file`, using an absolute-path package manager.
 *
 * Single-shot by design: no `-Sy` database sync, no `apt-get install -f` repair
 * pass. Either the package installs on the one authorization the user granted,
 * or we report why and offer {@link manualInstallCommand}. Chaining a second
 * privileged command onto a failure is what produced the "why is it asking
 * again?" second prompt.
 */
function buildInstallArgv(format: LinuxPackageFormat, file: string): string[] | null {
  const manager = resolveManager(format);
  if (!manager) return null;
  const name = path.basename(manager);

  switch (name) {
    case 'pacman':
      return [manager, '-U', '--noconfirm', file];
    case 'dpkg':
      return [manager, '-i', file];
    case 'apt-get':
      return [manager, 'install', '-y', '--allow-downgrades', file];
    case 'dnf':
    case 'yum':
      return [manager, 'install', '--nogpgcheck', '-y', file];
    case 'zypper':
      return [manager, '--non-interactive', '--no-refresh', 'install', '--allow-unsigned-rpm', file];
    case 'rpm':
      return [manager, '-Uvh', '--replacepkgs', '--replacefiles', file];
    default:
      return null;
  }
}

/**
 * Install the staged package, escalating through pkexec when not already root.
 *
 * Asynchronous on purpose: the main process must stay responsive so the renderer
 * can paint the `installing` state and the authorization dialog can never end up
 * behind a frozen window.
 */
export async function runPrivilegedInstall(
  format: LinuxPackageFormat,
  file: string,
): Promise<PrivilegedInstallResult> {
  if (!path.isAbsolute(file) || file.includes('\0')) {
    return { ok: false, error: 'The downloaded update has an unusable file path.' };
  }
  if (!isExistingFile(file)) {
    return { ok: false, error: 'The downloaded update file is no longer on disk. Download it again.' };
  }

  const installArgv = buildInstallArgv(format, file);
  if (!installArgv) {
    return {
      ok: false,
      error: `No package manager for .${format} packages was found on this system.`,
    };
  }

  let argv = installArgv;
  if (!isRoot()) {
    const pkexec = resolvePkexec();
    if (!pkexec) {
      return {
        ok: false,
        error:
          'No graphical privilege helper was found (pkexec). Install polkit, or run the command below yourself.',
      };
    }
    argv = [pkexec, ...installArgv];
  }

  const [command, ...args] = argv;
  logger.info(`[updater] privileged install: ${command} ${args.join(' ')}`);

  return spawnBounded(command, args);
}

function isExistingFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/**
 * Run one argv array to completion, bounded by {@link INSTALL_TIMEOUT_MS} and
 * {@link MAX_OUTPUT_BYTES}, and turn its exit code into a sentence a user can
 * act on.
 */
function spawnBounded(command: string, args: string[]): Promise<PrivilegedInstallResult> {
  return new Promise((resolve) => {
    let settled = false;
    let output = '';

    const finish = (result: PrivilegedInstallResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: sanitizedPathDirs().join(path.delimiter) },
    });

    const collect = (chunk: Buffer) => {
      if (output.length >= MAX_OUTPUT_BYTES) return;
      output += chunk.toString('utf8').slice(0, MAX_OUTPUT_BYTES - output.length);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ ok: false, error: 'The installer took too long and was stopped.' });
    }, INSTALL_TIMEOUT_MS);
    timer.unref?.();

    child.on('error', (err: NodeJS.ErrnoException) => {
      finish({
        ok: false,
        error:
          err.code === 'ENOENT'
            ? `${path.basename(command)} could not be found on this system.`
            : `The installer could not be started: ${err.message}`,
      });
    });

    child.on('close', (code) => {
      if (code === 0) {
        finish({ ok: true });
        return;
      }
      finish({ ok: false, error: describeFailure(code, output) });
    });
  });
}

/**
 * Turn an exit code + captured output into something worth reading.
 *
 * 126/127 are pkexec's own codes and mean the command never ran, so the package
 * manager's output (if any) is noise; every other code is the package manager
 * talking, and its first real line is the most useful thing we have. This is
 * where `cannot resolve "http-parser", a dependency of "limboo"` finally reaches
 * the user instead of being swallowed.
 */
function describeFailure(code: number | null, output: string): string {
  if (code === 126) return 'Authorization was cancelled, dismissed, or timed out.';
  if (code === 127) return 'The package manager could not be found or could not be executed.';

  const detail = firstMeaningfulLine(output);
  if (detail) return detail;
  return `The installer exited with code ${code ?? 'unknown'}.`;
}

function firstMeaningfulLine(output: string): string | null {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  // Prefer an explicit diagnostic over a progress line.
  const flagged = lines.find((line) => /^(error|warning|E:)/i.test(line));
  const chosen = flagged ?? lines[lines.length - 1];
  return chosen ? chosen.slice(0, 300) : null;
}

/* ------------------------------------------------------------------ */
/* The escape hatch                                                    */
/* ------------------------------------------------------------------ */

/**
 * Flags that suppress the package manager's own confirmation. Correct for the
 * in-app install (nothing can answer a prompt there) and wrong for the copyable
 * one — a user pasting this into a terminal HAS a prompt to answer, and should
 * get to see what is about to be installed before it happens.
 */
const NON_INTERACTIVE_FLAGS = new Set(['--noconfirm', '-y', '--non-interactive']);

/**
 * The command the user can paste into a terminal to finish the update
 * themselves. Shown (and copyable) whenever the in-app install refuses.
 *
 * `sudo` is correct HERE and wrong in {@link runPrivilegedInstall}: in a
 * terminal sudo has a TTY to prompt on. Falls back to a generic manager name
 * when nothing is installed, so the text is still a useful starting point.
 */
export function manualInstallCommand(format: LinuxPackageFormat, file: string): string {
  const argv = buildInstallArgv(format, file);
  const parts = argv
    ? [path.basename(argv[0]), ...argv.slice(1).filter((arg) => !NON_INTERACTIVE_FLAGS.has(arg))]
    : FALLBACK_ARGV[format](file);
  return ['sudo', ...parts].map(shellQuote).join(' ');
}

/**
 * What to suggest when this host has none of the format's package managers —
 * the "you downloaded the wrong artifact" or "minimal container" case.
 *
 * Written out per format rather than assembled from flags: each manager has its
 * own verb, and a generically-built line like `dnf -i <file>` is not a command
 * that works. Offering something that fails on paste is worse than offering
 * nothing.
 */
const FALLBACK_ARGV: Record<LinuxPackageFormat, (file: string) => string[]> = {
  pacman: (file) => ['pacman', '-U', file],
  deb: (file) => ['dpkg', '-i', file],
  rpm: (file) => ['dnf', 'install', file],
};

/** Quote only when needed, so the common case stays copy-paste readable. */
function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
