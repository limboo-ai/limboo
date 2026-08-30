/**
 * What an adapter's bootstrap commands actually need on the machine, and where
 * to find it.
 *
 * WHY THIS FILE EXISTS
 * The prerequisite check used to be a two-entry table (`pnpm`, `npm`) matched
 * with `command.startsWith('pnpm ')`. Two things were wrong with that. It missed
 * every other tool a command invokes — the claude-code adapter's second command
 * also runs `node` — and it hardcoded one package manager, so an adapter that
 * bootstraps with yarn, bun or corepack would report a clean bill of health and
 * then fail at run time with a non-zero exit from a command the user never saw.
 *
 * THE CONSTRAINT THIS FILE DOES NOT BREAK
 * Limboo never rewrites a bootstrap command. `pnpm install …` is not silently
 * retargeted at `npm`, ever: the consent contract in `bootstrap.ts` is that the
 * string the user approved is the string that executes, and the approval is
 * keyed to a fingerprint of exactly those strings. So "support every package
 * manager" means DETECT AND RESOLVE whatever the plan itself invokes — never
 * substitute one tool for another.
 *
 * The second job here is discovery. `probeCommand` resolves against the Electron
 * process's own PATH, and an app launched from a `.desktop` entry or a Dock icon
 * inherits a far smaller PATH than the user's shell — one that routinely omits
 * `~/.local/share/pnpm`, `~/.bun/bin`, nvm and Homebrew. A pnpm that IS
 * installed then reads as missing. `augmentedPath()` prepends the user-local bin
 * directories that exist, following the install-directory probe idiom
 * `managers/cursor/exec.ts` already uses for `cursor-agent`.
 *
 * This is DISCOVERY, not provisioning: nothing is downloaded, installed or
 * written. CLAUDE.md §1's three outbound requests are untouched.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BootstrapPlan } from './bootstrap';
import { probeCommand } from './probe';

/** One prerequisite of a bootstrap plan, resolved. */
export interface HarnessToolStatus {
  /** Executable name, exactly as the command invokes it. */
  tool: string;
  found: boolean;
  /** How the user fixes its absence. Code-supplied; never echoes the environment. */
  hint: string;
}

/**
 * Shell words that begin a command position but are not executables.
 *
 * The claude-code plan's second command is a full `if … then … fi && ./…`
 * pipeline, so command positions genuinely contain control words. Probing for a
 * binary called `then` would report a missing prerequisite that does not exist.
 */
const SHELL_WORDS = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac',
  'test', '[', '[[', 'cd', 'echo', 'exit', 'export', 'set', 'unset', 'true', 'false',
  'read', 'shift', 'return', 'local', 'eval', 'exec', 'source', '.', ':',
]);

/** Command → how the user fixes its absence. */
const TOOL_HINTS: Readonly<Record<string, string>> = {
  pnpm:
    'Install pnpm (https://pnpm.io/installation), or run `corepack enable pnpm` — ' +
    'corepack ships with Node.js. Restart Limboo afterwards.',
  npm: 'Install Node.js, which provides npm, and restart Limboo.',
  npx: 'Install Node.js, which provides npx, and restart Limboo.',
  node: 'Install Node.js (https://nodejs.org) and restart Limboo.',
  yarn:
    'Install Yarn (https://yarnpkg.com/getting-started/install), or run ' +
    '`corepack enable yarn`. Restart Limboo afterwards.',
  bun: 'Install Bun (https://bun.sh) and restart Limboo.',
  deno: 'Install Deno (https://deno.land) and restart Limboo.',
  corepack: 'Corepack ships with Node.js — install or update Node.js, then restart Limboo.',
  git: 'Install Git (https://git-scm.com/downloads) and restart Limboo.',
  python: 'Install Python (https://python.org) and restart Limboo.',
  python3: 'Install Python 3 (https://python.org) and restart Limboo.',
  uv: 'Install uv (https://docs.astral.sh/uv/getting-started/installation/) and restart Limboo.',
  pip: 'Install Python, which provides pip, and restart Limboo.',
  cargo: 'Install the Rust toolchain (https://rustup.rs) and restart Limboo.',
  go: 'Install Go (https://go.dev/dl/) and restart Limboo.',
};

/** Anything not in the table still gets a usable sentence. */
function hintFor(tool: string): string {
  return (
    TOOL_HINTS[tool] ??
    `Install \`${tool}\` and make sure it is on your PATH, then restart Limboo.`
  );
}

/**
 * The executables a plan's commands invoke.
 *
 * Splits on the shell operators that open a new command position (`&&`, `||`,
 * `;`, `|`, and the `(`/`{` group openers), then walks each segment left to
 * right for the first real executable. Walking rather than just taking word[0]
 * matters: the claude-code plan's second command is
 * `… ; then node node_modules/…/install.cjs ; fi && …`, where `then` holds the
 * first position and `node` — an actual prerequisite — is the second.
 *
 * Deliberately conservative. This decides what to PROBE, and a false positive
 * becomes a prerequisite the user is told to install for no reason, so the walk
 * stops at the first token that is not a shell word: either it is the
 * executable, or the segment has none worth probing.
 *
 * Anything containing a path separator ends the walk without a result:
 * `./node_modules/.bin/claude` is PRODUCED by the bootstrap, not required
 * before it, and is resolved by the shell against the directory, not PATH.
 */
export function requiredTools(plan: Pick<BootstrapPlan, 'commands'>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const command of plan.commands) {
    for (const segment of command.split(/(?:&&|\|\||[;|(){}\n])/)) {
      for (const word of segment.trim().split(/\s+/)) {
        if (!word) continue;
        // A leading `VAR=value` assignment prefixes the real command word.
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) continue;
        if (SHELL_WORDS.has(word)) continue;
        // Past this point the word IS the command position, whatever it is —
        // so the walk ends here either way.
        if (!word.includes('/') && !word.includes('\\')) {
          // Same charset guard `probeCommand` enforces, so a shell token that
          // survived the split (a redirection, glob or quote) is never probed.
          if (/^[a-z][a-z0-9._-]{0,31}$/i.test(word) && !seen.has(word)) {
            seen.add(word);
            out.push(word);
          }
        }
        break;
      }
    }
  }
  return out;
}

/** Resolve every prerequisite of a plan, in the order the commands invoke them. */
export function resolveTools(plan: Pick<BootstrapPlan, 'commands'>): HarnessToolStatus[] {
  return requiredTools(plan).map((tool) => ({
    tool,
    found: probeCommand(tool),
    hint: hintFor(tool),
  }));
}

/**
 * Directories a user-installed toolchain commonly lands in, relative to `$HOME`.
 *
 * Existence-checked before use, so a missing one costs a `statSync` and nothing
 * else. Order matters only in that a user-local install should win over a
 * system one, which is why these are PREPENDED.
 */
const HOME_BIN_DIRS = [
  '.local/bin',
  '.local/share/pnpm',
  '.bun/bin',
  '.yarn/bin',
  '.config/yarn/global/node_modules/.bin',
  '.npm-global/bin',
  '.npm-packages/bin',
  '.cargo/bin',
  '.deno/bin',
  'go/bin',
];

/** System directories a GUI-launched process often lacks. */
const SYSTEM_BIN_DIRS =
  process.platform === 'darwin'
    ? ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
    : ['/usr/local/bin', '/usr/bin', '/bin', '/snap/bin'];

let cachedPath: string | undefined;

/**
 * `process.env.PATH`, widened with the user-local tool directories that exist.
 *
 * Memoised for the process lifetime, matching `probeCommand`: a toolchain
 * appearing mid-session is not worth re-scanning the filesystem for on every
 * probe, and the missing-prerequisite message tells the user to restart Limboo.
 */
export function augmentedPath(): string {
  if (cachedPath !== undefined) return cachedPath;
  const sep = process.platform === 'win32' ? ';' : ':';
  const existing = (process.env.PATH ?? '').split(sep).filter((p) => p.length > 0);
  const seen = new Set(existing.map((p) => path.normalize(p)));
  const extra: string[] = [];

  const add = (dir: string): void => {
    const normalized = path.normalize(dir);
    if (seen.has(normalized)) return;
    try {
      if (!fs.statSync(normalized).isDirectory()) return;
    } catch {
      return; // Not present on this machine — nothing to add.
    }
    seen.add(normalized);
    extra.push(normalized);
  };

  const home = os.homedir();
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA;
    const roaming = process.env.APPDATA;
    if (local) {
      add(path.join(local, 'pnpm'));
      add(path.join(local, 'Yarn', 'bin'));
      add(path.join(local, 'Microsoft', 'WindowsApps'));
    }
    if (roaming) add(path.join(roaming, 'npm'));
    add(path.join(home, '.bun', 'bin'));
    add(path.join(home, '.cargo', 'bin'));
  } else {
    for (const rel of HOME_BIN_DIRS) add(path.join(home, rel));
    // nvm keeps one bin dir per installed Node; take the newest by name so a
    // `node`/`npm`/`corepack` installed that way is discoverable.
    addNewestNvmBin(home, add);
    for (const dir of SYSTEM_BIN_DIRS) add(dir);
  }

  cachedPath = [...extra, ...existing].join(sep);
  return cachedPath;
}

/** Append nvm's newest `versions/node/<v>/bin`, when nvm is installed. */
function addNewestNvmBin(home: string, add: (dir: string) => void): void {
  const root = path.join(process.env.NVM_DIR || path.join(home, '.nvm'), 'versions', 'node');
  let versions: string[];
  try {
    versions = fs.readdirSync(root);
  } catch {
    return;
  }
  // Numeric-aware descending sort, so v20 beats v9 and v10.10 beats v10.9.
  const newest = versions
    .filter((v) => /^v\d+\.\d+\.\d+/.test(v))
    .sort((a, b) => compareVersions(b, a))[0];
  if (newest) add(path.join(root, newest, 'bin'));
}

function compareVersions(a: string, b: string): number {
  const pa = a.slice(1).split('.').map(Number);
  const pb = b.slice(1).split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
