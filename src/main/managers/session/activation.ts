/**
 * The session activation pipeline.
 *
 * Switching sessions changes the *effective execution root* — the worktree a
 * session owns, or the workspace when it owns none — and almost every platform
 * service is bound to that root: the file watcher, the git status cache, the
 * search index, MCP scope, the terminal cwd, the agent's workspace. Retargeting
 * them used to be a synchronous `void` function fanned out from several
 * independent listeners, with the slow parts (`stopWatching`, `indexWorkspace`)
 * simply discarded. Nothing sequenced them, nothing cancelled a stale one, and
 * nothing could tell the renderer that the switch was still in progress — so a
 * fast A→B→A switch could leave the UI showing B's branch against A's status.
 *
 * This module makes activation ONE ordered, awaited operation with a generation
 * counter. Each `activate()` bumps the generation and aborts the previous run;
 * every step re-checks it, so a superseded activation stops quietly instead of
 * writing its results over the newer one.
 *
 * **Activation is not a lock.** The renderer switches immediately and shows the
 * cached snapshot under an "activating" ribbon. A hard gate would turn a slow
 * `git status` or a cold search index into a frozen window, which is worse than
 * briefly-stale data — so the pipeline reports progress and the UI degrades
 * gracefully. What it DOES guarantee is that a terminal event always arrives
 * (it is emitted from `finally`), so the ribbon can never stick.
 */
import type { Session, SessionActivationState, Workspace } from '@shared/types';
import { logger } from '../../logger';

/** How long the pipeline waits on a cold search index before backgrounding it. */
const SEARCH_INDEX_GRACE_MS = 3_000;

/**
 * The resolved binding for one activation: which session, which workspace,
 * which root, and whether the session owns that root.
 *
 * Resolved ONCE per activation and handed to each step. The per-manager
 * resolvers stay in place as the lazy fallback for calls outside activation,
 * but within a switch every service is told the same thing — which is what the
 * sessionId-keyed and workspaceId-keyed resolvers could previously disagree about.
 */
export interface SessionScope {
  sessionId: string | null;
  workspaceId: string;
  workspace: Workspace;
  /** Effective execution root: the session's worktree, else the workspace path. */
  root: string;
  /** The session owning `root`, or null when the root is the plain workspace. */
  owner: string | null;
  branch: string | null;
}

export interface ActivationDeps {
  workspace: { getActive(): Workspace | null };
  sessions: { getActive(): Session | null };
  worktrees: { resolveActiveRoot(workspaceId: string): string | null };
  fileSystem: {
    setActiveTarget(ws: Workspace, root: string, owner: string | null): void;
    stopWatching(): Promise<void>;
  };
  git: { invalidate(workspaceId: string): void; status(workspaceId: string): Promise<unknown> };
  gh: { invalidate(): void };
  search: { indexWorkspace(workspaceId: string): Promise<void> };
  memory: { seedDefaults(workspaceId: string): void };
  mcp: { refresh(): void; importActive(): number };
  services: { autoStartForSession(sessionId: string): void };
  resume: { onActiveSessionChanged(active: Session | null): void };
  agent: { onSessionActivated(scope: SessionScope): void };
  /** Push a state change to every renderer. */
  broadcast(state: SessionActivationState): void;
}

export interface ActivationPipeline {
  /** Run (or re-run) activation for the current active workspace + session. */
  activate(reason: SessionActivationState['reason']): Promise<void>;
  /**
   * Forget the cached effective root so the NEXT activation re-runs the
   * root-bound steps even if it resolves to the same path. Used when the root
   * is torn down out-of-band — a worktree directory being removed — where the
   * path can legitimately repeat while everything bound to it is now stale.
   */
  invalidateRoot(): void;
  current(): SessionActivationState;
  dispose(): void;
}

export function createActivationPipeline(deps: ActivationDeps): ActivationPipeline {
  let generation = 0;
  /**
   * The last root every service was actually pointed at. Carried over from the
   * previous implementation: it is what keeps an unrelated session broadcast
   * from churning the watcher and re-indexing for a root that did not change.
   */
  let lastEffectiveRoot: string | null = null;
  /**
   * The workspace the root-bound steps last ran for. A workspace switch must
   * re-scope MCP and re-seed memory even when the two workspaces resolve to the
   * same path, which the root comparison alone cannot see.
   */
  let lastWorkspaceId: string | null = null;
  let state: SessionActivationState = { sessionId: null, phase: 'idle', reason: 'boot' };
  let disposed = false;

  const publish = (next: SessionActivationState): void => {
    state = next;
    if (!disposed) deps.broadcast(next);
  };

  const activate = async (reason: SessionActivationState['reason']): Promise<void> => {
    const gen = ++generation;
    /** True while this activation is still the newest one. */
    const live = () => gen === generation && !disposed;

    const ws = deps.workspace.getActive();
    if (!ws) {
      lastEffectiveRoot = null;
      lastWorkspaceId = null;
      // No workspace means nothing to bind; release the watcher and settle.
      publish({ sessionId: null, phase: 'activating', step: 'workspace', reason });
      try {
        await deps.fileSystem.stopWatching();
      } catch (err) {
        logger.warn('activation: stopWatching failed', err);
      }
      if (live()) publish({ sessionId: null, phase: 'ready', reason });
      return;
    }

    const active = deps.sessions.getActive();
    const sessionId = active?.id ?? null;
    publish({ sessionId, phase: 'activating', step: 'worktree', reason });

    try {
      /* 1. Worktree resolve — the single source of the effective root. */
      const root = deps.worktrees.resolveActiveRoot(ws.id) ?? ws.path;
      const owner =
        active && active.workspaceId === ws.id && active.worktreePath && root !== ws.path
          ? active.id
          : null;
      const scope: SessionScope = {
        sessionId,
        workspaceId: ws.id,
        workspace: ws,
        root,
        owner,
        branch: active?.worktreeBranch ?? null,
      };
      if (!live()) return;

      /* 2. Resolver retarget — the file watcher and tree index. */
      publish({ sessionId, phase: 'activating', step: 'files', reason });
      deps.fileSystem.setActiveTarget(ws, root, owner);

      /*
       * 3. Agent rebind. Always runs, even when the root is unchanged: a
       *    session switch must never leave the previous session's plan visible,
       *    and that is true whether or not the two share a root.
       */
      deps.agent.onSessionActivated(scope);

      /*
       * The remaining steps are root-bound and expensive. Skipping them when
       * the root is unchanged is what keeps switching between two plain
       * sessions in one workspace cheap.
       */
      const rootChanged = root !== lastEffectiveRoot || ws.id !== lastWorkspaceId;
      if (rootChanged) {
        lastEffectiveRoot = root;
        lastWorkspaceId = ws.id;

        /* 4. Git — drop the cached root, then prime the status the UI will ask for. */
        publish({ sessionId, phase: 'activating', step: 'git', reason });
        deps.git.invalidate(ws.id);
        deps.gh.invalidate();
        try {
          await deps.git.status(ws.id);
        } catch (err) {
          // A non-repo root, or a git binary that failed. Not fatal: the panel
          // renders its own empty/error state from the same call.
          logger.warn('activation: git status failed', err);
        }
        if (!live()) return;

        /*
         * 5. Search index. Awaited only up to a grace window, then allowed to
         *    finish in the background. A cold index on a large repository takes
         *    far longer than a switch should ever feel, and blocking on it is
         *    exactly how "synchronized activation" becomes "frozen app".
         */
        publish({ sessionId, phase: 'activating', step: 'search', reason });
        const indexing = deps.search
          .indexWorkspace(ws.id)
          .catch((err) => logger.warn('activation: search index failed', err));
        const indexed = await raceWithTimeout(indexing, SEARCH_INDEX_GRACE_MS);
        if (!live()) return;

        /* 6. Memory scope — idempotent, seeds this workspace's starter entries. */
        publish({ sessionId, phase: 'activating', step: 'memory', reason });
        deps.memory.seedDefaults(ws.id);

        /* 7. MCP — re-scope the registry to this workspace. */
        publish({ sessionId, phase: 'activating', step: 'mcp', reason });
        deps.mcp.refresh();

        /*
         * 8. Services. Only for a session that owns its root, and only once the
         *    workspace has acknowledged the repo's limboo.json (the manager
         *    enforces the ack itself — this just decides whether to ask).
         */
        if (owner) deps.services.autoStartForSession(owner);

        if (!live()) return;
        if (!indexed) {
          publish({ sessionId, phase: 'ready', reason, searchIndexing: true });
          return;
        }
      }

      /*
       * 9. Resume Pipeline — anchor the session being left, revalidate the one
       *    being entered. Folded in from what used to be a second, independent
       *    `onActiveChanged` listener, so its ordering relative to the retarget
       *    is deterministic rather than a function of registration order.
       *    Fire-and-forget by contract: it must never delay a switch.
       */
      deps.resume.onActiveSessionChanged(active);

      if (live()) publish({ sessionId, phase: 'ready', reason });
    } catch (err) {
      logger.warn('activation failed', err);
      // A terminal event ALWAYS goes out. The renderer's ribbon clears on it,
      // so swallowing this would strand the UI in "activating" forever.
      if (live()) {
        publish({
          sessionId,
          phase: 'error',
          reason,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  return {
    activate,
    invalidateRoot: () => {
      lastEffectiveRoot = null;
      lastWorkspaceId = null;
    },
    current: () => state,
    dispose: () => {
      disposed = true;
      // Bump so any in-flight activation sees itself as superseded.
      generation += 1;
    },
  };
}

/** Resolve `true` if the promise settled inside `ms`, `false` if it is still running. */
async function raceWithTimeout(p: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
