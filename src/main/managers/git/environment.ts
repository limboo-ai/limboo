/**
 * Git availability detection.
 *
 * Limboo's whole engineering surface — history, branches, checkpoints,
 * worktrees, diffs, and every agent collaboration flow built on them — assumes
 * a working `git` binary. When it is missing, {@link GitManager.resolveRoot}
 * gets a failed `rev-parse` and reports `isRepo: false`, which is the SAME
 * signal an ordinary uninitialised folder produces. The UI then offers
 * "Initialize git", which cannot possibly work. This module is what lets the
 * two states be told apart.
 *
 * Deliberately a module function rather than a `GitManager` method: the answer
 * is process-global (is `git` on PATH?), not workspace-scoped, and the result
 * is memoised for the process so panels can ask freely.
 */
import os from 'node:os';
import type { GitEnvironment } from '@shared/types';
import { runGit } from './exec';
import { redactSecrets } from '../../logger';

const PROBE_TIMEOUT_MS = 5_000;
const ERROR_MAX = 240;

/** `git version 2.45.2` / `git version 2.45.2.windows.1` → `2.45.2…`. */
const VERSION_RE = /^git version (\S+)/;

let probe: Promise<GitEnvironment> | null = null;

/**
 * Resolve (and memoise) whether `git` can be run at all. Pass `force` to
 * re-probe after the user installs it — the "Check again" affordance in the
 * onboarding state.
 *
 * Never throws: a failed probe resolves to `available: false` with a reason.
 */
export function probeGitEnvironment(force = false): Promise<GitEnvironment> {
  if (force || !probe) probe = runProbe();
  return probe;
}

async function runProbe(): Promise<GitEnvironment> {
  const base = {
    platform: process.platform,
    checkedAt: Date.now(),
  };

  // `os.tmpdir()` rather than a repo root: the probe must answer "is git
  // installed" even when no workspace is open, and `execFile` fails outright on
  // a cwd that does not exist — which would look exactly like a missing binary.
  const res = await runGit(os.tmpdir(), ['--version'], { timeout: PROBE_TIMEOUT_MS });

  if (res.ok) {
    const version = VERSION_RE.exec(res.stdout.trim())?.[1];
    // A zero exit with unparseable output still means git ran, so treat the
    // binary as available and simply omit the version we could not read.
    return { ...base, available: true, version };
  }

  return {
    ...base,
    available: false,
    error: describeFailure(res.spawnError, res.stderr),
  };
}

function describeFailure(spawnError: string | undefined, stderr: string): string {
  if (spawnError === 'ENOENT') return 'The git executable was not found on PATH.';
  if (spawnError === 'EACCES') return 'The git executable was found but is not executable.';
  if (spawnError) return `git could not be started (${spawnError}).`;
  const detail = redactSecrets(stderr).trim().slice(0, ERROR_MAX);
  return detail || 'git exited with an error.';
}
