/**
 * Where a harness session's adapter state lives, and how the framework's
 * working-directory arithmetic is made to land on the real worktree anyway.
 *
 * ── THE CONSTRAINT ───────────────────────────────────────────────────────
 * The AI SDK framework composes a session's cwd as
 * `posix.join(defaultWorkingDirectory, workDir)` and rejects `workDir: '.'`,
 * so the session always lands in a SUBDIRECTORY of whatever the provider
 * reports as its default. The adapter then resolves its own state against that
 * same default:
 *
 *   <default>/.harness-bootstrap/claude-code/   (installed CLI + bridge)
 *   <default>/.agent-runs/<sessionId>/bridge/   (per-run bridge state)
 *
 * So "where the state goes" and "where the agent works" are ONE value, and the
 * provider only gets to pick one of them.
 *
 * ── WHY NOT `path.dirname(worktree)` ─────────────────────────────────────
 * That was the original answer, and it is right exactly when the session is
 * worktree-backed: the parent is `{userData}/worktrees/<bucket>`, already
 * Limboo-owned. But `WorktreeManager.resolveSessionRoot` FALLS BACK to the
 * workspace path for a plain session, and then the parent is wherever the user
 * keeps their code — so a first run would create `~/Desktop/.harness-bootstrap/`
 * and `~/Desktop/.agent-runs/` beside their repository, and the provider's own
 * state carve-out would grant the harness read+write to those trees at an
 * arbitrary location on disk.
 *
 * ── THE ANSWER ───────────────────────────────────────────────────────────
 * Report a Limboo-owned directory as `defaultWorkingDirectory` for EVERY
 * session — worktree-backed or not — and make `<stateRoot>/<basename(root)>` a
 * real on-disk link to the execution root:
 *
 *   {userData}/harness-state/<sha1(realpath(root)).slice(0,12)>/
 *     ├── .harness-bootstrap/…        adapter state, always under userData
 *     ├── .agent-runs/…               adapter state, always under userData
 *     └── <basename(root)>  ─────────▶ the real worktree (symlink/junction)
 *
 * The link must be REAL rather than an in-process alias: the adapter spawns
 * `node bridge.mjs --workdir <stateRoot>/<name>`, and that child `cd`s there
 * itself. A path this process rewrites but the filesystem does not have would
 * fail in the child, where nothing can translate it back.
 *
 * Containment is unchanged by the link. `LocalSandboxSession.resolvePath`
 * canonicalizes with `realpathNearest` BEFORE confining, so
 * `<stateRoot>/<name>/foo` resolves to `<worktree>/foo` and is admitted by the
 * ordinary worktree check — not by a new carve-out. The crown-jewel refusal
 * still runs first and unconditionally.
 *
 * The bucket hash follows `worktree/paths.ts` (`repoBucket`) so both features
 * derive a directory name from a path the same way.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

/** Root of every harness session's state. Always inside userData. */
export function harnessStateRootDir(): string {
  return path.join(app.getPath('userData'), 'harness-state');
}

/** Short, stable per-execution-root bucket. The `repoBucket` idiom. */
function bucketFor(root: string): string {
  let real = root;
  try {
    real = fs.realpathSync.native(root);
  } catch {
    /* keep the normalized path when realpath fails (e.g. a transient share) */
  }
  return crypto
    .createHash('sha1')
    .update(path.normalize(real).toLowerCase())
    .digest('hex')
    .slice(0, 12);
}

export interface HarnessStateLayout {
  /** What the provider reports as `defaultWorkingDirectory`. */
  stateRoot: string;
  /** The `workDir` a caller passes so the framework's join lands on `root`. */
  workDir: string;
  /** `<stateRoot>/<workDir>` — the path the harness and its child actually use. */
  linkPath: string;
}

/**
 * Prepare the state root for one execution root, creating the link.
 *
 * Idempotent: an existing link pointing at the same target is left alone, and a
 * stale one (the worktree was recreated at a different real path) is replaced.
 *
 * @throws when the link cannot be created and the caller must not fall back —
 * see {@link canFallBackToParent}.
 */
export function prepareStateRoot(root: string): HarnessStateLayout {
  const stateRoot = path.join(harnessStateRootDir(), bucketFor(root));
  const workDir = path.basename(root);
  const linkPath = path.join(stateRoot, workDir);

  fs.mkdirSync(stateRoot, { recursive: true });

  const target = path.resolve(root);
  let existing: string | null = null;
  try {
    existing = fs.readlinkSync(linkPath);
  } catch {
    existing = null;
  }
  if (existing !== null) {
    // Compare canonically: a junction reads back as an extended-length path on
    // Windows, and the worktree may itself sit behind a symlinked home.
    if (samePath(existing, target)) return { stateRoot, workDir, linkPath };
    fs.rmSync(linkPath, { force: true });
  } else if (fs.existsSync(linkPath)) {
    // Something that is NOT a link occupies the slot. Refuse rather than delete:
    // this is inside userData, but it is still not ours to remove blind.
    throw new Error(
      `Harness state path ${workDir} exists and is not a link to the session workspace.`,
    );
  }

  // 'junction' on win32: directory junctions need no elevation and no Developer
  // Mode, unlike a real symlink. Elsewhere 'dir' is the portable choice.
  fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
  return { stateRoot, workDir, linkPath };
}

/**
 * May a session fall back to `path.dirname(root)` when the link cannot be made?
 *
 * ONLY when the parent is already inside Limboo's own worktree root — i.e. the
 * session is worktree-backed and the fallback writes into
 * `{userData}/worktrees/<bucket>`, which is exactly what shipped before. For a
 * plain session the parent is the user's own projects directory, and writing
 * adapter state there is the thing this module exists to prevent, so the caller
 * must refuse the session instead.
 */
export function canFallBackToParent(root: string, worktreeRoot: string): boolean {
  const parent = path.resolve(path.dirname(root));
  const wt = path.resolve(worktreeRoot);
  return parent === wt || parent.startsWith(wt + path.sep);
}

function samePath(a: string, b: string): boolean {
  const norm = (p: string): string => {
    let out = path.resolve(p);
    try {
      out = fs.realpathSync.native(out);
    } catch {
      /* not present — compare the resolved form */
    }
    return process.platform === 'win32' ? out.toLowerCase() : out;
  };
  return norm(a) === norm(b);
}
