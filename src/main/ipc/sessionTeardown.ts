/**
 * Permanently destroying one session, everywhere it exists.
 *
 * WHY THIS FILE EXISTS
 * A session is not just a row. It can own a git worktree on disk, a supervised
 * service, live PTYs, and staged attachment files — and the order those come
 * down in is load-bearing, not incidental. This sequence lived inline in the
 * `session:purge` handler, and when workspace removal needed exactly the same
 * teardown the choice was to duplicate it or to extract it. Duplicated, the two
 * copies would drift, and the one that drifted would leave worktrees behind.
 *
 * ORDER MATTERS:
 *  1. Services and PTYs die first. On Windows a process holding a cwd inside a
 *     worktree keeps `git worktree remove` failing with EBUSY, which is the
 *     reason `disposeSession` exists at all.
 *  2. The worktree is removed with `force`, but the BRANCH is kept — permanent
 *     loss of committed work stays a separate, explicit act.
 *  3. Staged attachments are deleted. Trash keeps them so a restored session
 *     still has its files; a purge is where they actually go.
 *  4. The database rows go last, so a failure above still leaves a session the
 *     user can see and retry rather than an orphaned directory nobody owns.
 *
 * Every step is individually contained: a session that cannot give up its
 * worktree must not block the purge of the rest, or a single stuck directory
 * makes an entire workspace unremovable.
 */
import type { SessionManager } from '../managers/SessionManager';
import type { WorktreeManager } from '../managers/worktree/WorktreeManager';
import type { ServiceManager } from '../managers/services/ServiceManager';
import type { TerminalManager } from '../managers/TerminalManager';
import type { AttachmentManager } from '../managers/attachments/AttachmentManager';
import { logger } from '../logger';

export interface SessionTeardownDeps {
  sessions: SessionManager;
  worktrees: WorktreeManager;
  services: ServiceManager;
  terminals: TerminalManager;
  attachments: AttachmentManager;
}

/** Stop everything a session is running, without touching its records. */
export async function stopSessionProcesses(
  deps: Pick<SessionTeardownDeps, 'services' | 'terminals'>,
  sessionId: string,
): Promise<void> {
  await deps.services.stopForSession(sessionId).catch(() => undefined);
  deps.terminals.disposeSession(sessionId);
}

/**
 * Purge one session permanently: processes, worktree, attachments, then rows.
 *
 * Used by `session:purge` and by the workspace cascade, so the two can never
 * disagree about what "permanently deleted" means.
 */
export async function purgeSessionCompletely(
  deps: SessionTeardownDeps,
  sessionId: string,
): Promise<void> {
  await stopSessionProcesses(deps, sessionId);
  try {
    await deps.worktrees.removeForSession(sessionId, { force: true, deleteBranch: false });
  } catch (err) {
    logger.warn(`session purge: worktree removal failed for ${sessionId}`, err);
  }
  try {
    await deps.attachments.purgeSession(sessionId);
  } catch (err) {
    logger.warn(`session purge: attachment cleanup failed for ${sessionId}`, err);
  }
  deps.sessions.purge(sessionId);
}
