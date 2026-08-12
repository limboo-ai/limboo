/**
 * Terminate a spawned agent process AND its descendants.
 *
 * Every provider runtime needs this and none of them can use a plain
 * `child.kill()`: the CLIs spawn helpers, so killing only the direct child
 * orphans the grandchildren, which keep holding the worktree, the bridge pipe
 * and (on Windows) file locks that block worktree removal. Shared so the
 * platform quirks are fixed in one place rather than re-derived per adapter.
 */
import { execFile, type ChildProcess } from 'node:child_process';

/** Kill the child and its whole process tree. */
export function killTree(child: ChildProcess, graceMs: number): void {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    // taskkill /T fells the whole tree; plain kill() orphans grandchildren.
    execFile(
      'taskkill',
      ['/pid', String(child.pid), '/T', '/F'],
      { windowsHide: true },
      () => undefined,
    );
    return;
  }
  try {
    child.kill('SIGTERM');
  } catch {
    return;
  }
  const hardKill = setTimeout(() => {
    try {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }, graceMs);
  // Don't hold the event loop open for the grace timer.
  hardKill.unref?.();
}
