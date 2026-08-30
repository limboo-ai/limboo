/**
 * Is a command available on PATH?
 *
 * Used only to turn a missing prerequisite into a named error before a run
 * starts, instead of a non-zero exit from a command the user never saw. Argv
 * only, no shell, bounded, and memoised for the process lifetime — a prereq
 * appearing mid-session is not worth re-probing on every run, and the user is
 * told to restart when one is missing.
 *
 * Resolution runs against `augmentedPath()`, not the raw `process.env.PATH`: an
 * Electron app launched from a `.desktop` entry or the Dock inherits a much
 * smaller PATH than the user's shell, so an installed pnpm/bun/nvm-node would
 * otherwise be reported as missing. See `toolchain.ts`.
 */
import { spawnSync } from 'node:child_process';
import { augmentedPath } from './toolchain';

const cache = new Map<string, boolean>();

/** Only ever probe a fixed, code-supplied name — never user input. */
const SAFE_NAME = /^[a-z][a-z0-9._-]{0,31}$/i;

export function probeCommand(name: string): boolean {
  if (!SAFE_NAME.test(name)) return false;
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  let found = false;
  try {
    const finder = process.platform === 'win32' ? 'where.exe' : 'which';
    const r = spawnSync(finder, [name], {
      encoding: 'utf8',
      timeout: 3_000,
      shell: false,
      windowsHide: true,
      // Only PATH is overridden — the finder needs the rest of the environment
      // (COMSPEC/PATHEXT on Windows) exactly as it is.
      env: { ...process.env, PATH: augmentedPath() },
    });
    found = r.status === 0 && typeof r.stdout === 'string' && r.stdout.trim().length > 0;
  } catch {
    found = false;
  }
  cache.set(name, found);
  return found;
}
