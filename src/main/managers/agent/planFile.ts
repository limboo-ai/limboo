/**
 * Plan-file plumbing for Claude runs.
 *
 * Current Claude Code / Agent SDK builds do NOT pass the plan through
 * `ExitPlanMode`'s input — the tool's declared schema is
 * `{ allowedPrompts?: … /* deprecated *\/; [k: string]: unknown }` with no
 * `plan` field. The plan is written to a FILE, and the tool's *output* carries
 * `plan` / `filePath`. Reading `input.plan` therefore captures an empty string,
 * and because Limboo denies the tool the output never exists either.
 *
 * The fix is to stop guessing where the plan is. `Settings.plansDirectory`
 * ("Custom directory for plan files, relative to project root. If not set,
 * defaults to ~/.claude/plans/") lets the host CHOOSE the location, so:
 *
 *   1. the plan file is inside the session root, at a path we control;
 *   2. it exists on disk before `ExitPlanMode` is called, so the approval gate
 *      can show the user real markdown instead of scraping narration;
 *   3. containment is trivially satisfied — we are not accepting a path from
 *      the model, we are dictating one.
 *
 * The settings file itself is generated per run through `withSessionFile`, the
 * same snapshot/atomic-write/restore helper every Cursor session file uses, so
 * the working tree ends each run exactly as it started.
 */
import fs from 'node:fs';
import path from 'node:path';

import { AGENT_LIMITS } from '@shared/constants';

import { copySafeKeys, safeParseObject, withSessionFile } from '../cursor/sessionFile';

/**
 * Where plan files go, relative to the session root. Under `.claude/` so it
 * sits beside the settings file that points at it and reads as tool state
 * rather than project content.
 */
export const PLAN_DIR_REL = path.join('.claude', 'limboo-plans');

/** The generated settings file that carries `plansDirectory`. */
const SETTINGS_REL = path.join('.claude', 'settings.local.json');

/** Plan files are markdown, and nothing else is ever read from the directory. */
const PLAN_FILE_RE = /^[A-Za-z0-9._-]+\.md$/;

/**
 * Run `fn` with a generated `.claude/settings.local.json` that points the CLI's
 * plan files at {@link PLAN_DIR_REL}.
 *
 * Merges defensively over a repo-authored file — every other key is preserved
 * and only `plansDirectory` is imposed — following the `mcpConfig.ts`
 * precedent: a repo's own configuration is never silently replaced.
 */
export async function withPlanSettings<T>(root: string, fn: () => Promise<T>): Promise<T> {
  return withSessionFile(
    root,
    SETTINGS_REL,
    (original) => {
      const merged = copySafeKeys(safeParseObject(original));
      merged.plansDirectory = PLAN_DIR_REL;
      return JSON.stringify(merged, null, 2);
    },
    fn,
  );
}

/** Absolute path of the plans directory for a session root. */
export function planDir(root: string): string {
  return path.join(root, PLAN_DIR_REL);
}

/**
 * The plan file written most recently inside the session's plans directory, or
 * null when there is none.
 *
 * Picking the newest is deliberate: the CLI names the file itself, so the host
 * cannot know the name in advance — only the directory. Everything else about
 * the read is locked down (see {@link readPlanFile}).
 */
export function latestPlanFile(root: string): string | null {
  const dir = planDir(root);
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  let best: { name: string; mtime: number } | null = null;
  for (const name of names) {
    if (!PLAN_FILE_RE.test(name)) continue;
    try {
      // lstat, not stat: a symlink here must be seen as a symlink, not followed.
      const st = fs.lstatSync(path.join(dir, name));
      if (!st.isFile()) continue;
      if (!best || st.mtimeMs > best.mtime) best = { name, mtime: st.mtimeMs };
    } catch {
      /* skip unreadable entries */
    }
  }
  return best?.name ?? null;
}

/**
 * Read a plan file by BASENAME from the session's plans directory.
 *
 * Only a basename is accepted — never a path, and never a value taken from the
 * model or the renderer without passing this gate. The checks are, in order:
 * charset + `.md` extension, no path separators, resolved location still inside
 * the plans directory after `realpath` (so a symlink cannot redirect the read),
 * regular file, and a size cap.
 */
export function readPlanFile(root: string, name: string): string | null {
  if (!PLAN_FILE_RE.test(name)) return null;
  // Redundant given the charset, and kept because this is the check whose
  // absence would matter if the charset is ever loosened.
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return null;

  const dir = planDir(root);
  const file = path.join(dir, name);
  try {
    const realDir = fs.realpathSync(dir);
    const realFile = fs.realpathSync(file);
    const rel = path.relative(realDir, realFile);
    if (rel.startsWith('..') || path.isAbsolute(rel) || rel.includes(path.sep)) return null;

    const st = fs.statSync(realFile);
    if (!st.isFile()) return null;
    if (st.size > AGENT_LIMITS.planMarkdownMax) {
      // Truncate rather than refuse: a plan too large to store is still a plan
      // the user needs to see enough of to judge.
      const fd = fs.openSync(realFile, 'r');
      try {
        const buf = Buffer.alloc(AGENT_LIMITS.planMarkdownMax);
        const read = fs.readSync(fd, buf, 0, buf.length, 0);
        return stripNul(buf.subarray(0, read).toString('utf8'));
      } finally {
        fs.closeSync(fd);
      }
    }
    return stripNul(fs.readFileSync(realFile, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Screen a `filePath` reported by `ExitPlanMode`'s output back to a basename we
 * are willing to read. Manifest data is data, even when we chose the directory:
 * the value still has to prove it points where we think it does.
 */
export function planFileNameFrom(root: string, filePath: unknown): string | null {
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  const name = path.basename(abs);
  if (!PLAN_FILE_RE.test(name)) return null;
  // Must resolve into OUR plans directory — a path anywhere else is refused
  // outright rather than read from a second allowed root.
  const rel = path.relative(path.resolve(planDir(root)), path.resolve(abs));
  if (rel !== name) return null;
  return name;
}

/** NUL bytes mean this is not the text file it claims to be. */
function stripNul(text: string): string {
  return text.includes('\0') ? text.replace(/\0/g, '') : text;
}
