/**
 * Git store — the renderer-side mirror of the main-process GitManager. Holds the
 * active workspace's live status, history, branches, tags, the per-session
 * checkpoints, and a small diff cache. Subscribes to `git:changed` (working-tree
 * moved) and `git:checkpoints-changed` so the Git workspace stays live as the
 * developer and the agent work.
 *
 * Degrades to empty, read-only state in a plain browser preview (no preload).
 */
import { create } from 'zustand';
import type {
  GitBranch,
  GitCheckpoint,
  GitCommit,
  GitEnvironment,
  GitFileDiff,
  GitStatus,
  GitTag,
} from '@shared/types';
import { guardIpc } from '@/renderer/lib/ipcError';
import { agentDisplayName } from '@/renderer/features/agent/status';
import { useWorkspaceStore } from './useWorkspaceStore';
import { useSessionStore } from './useSessionStore';
import { useSettingsStore } from './useSettingsStore';
import { useUIStore } from './useUIStore';
import { diffKey } from './useDocumentStore';

/** Diff/patch selectors shared by the diff, patch-text, and patch-save calls. */
export interface PatchOpts {
  staged?: boolean;
  baseRef?: string;
}

/** Which Git workspace sub-view is focused (also the activity-card jump target). */
export type GitView = 'status' | 'diff' | 'commit' | 'history' | 'checkpoints' | 'branches';

interface GitFocus {
  view: GitView;
  path?: string;
  staged?: boolean;
  /** Commit hash to reveal in the History view (set by the Work Graph). */
  hash?: string;
}

interface GitState {
  /**
   * Whether `git` itself exists on this machine. Null until probed. Distinct
   * from `status.isRepo`: a missing binary and an uninitialised folder both
   * report `isRepo: false`, and only this can tell them apart.
   */
  environment: GitEnvironment | null;
  status: GitStatus | null;
  log: GitCommit[];
  branches: GitBranch[];
  tags: GitTag[];
  checkpoints: GitCheckpoint[];
  /** Diff cache keyed by {@link diffKey} (side + comparison base + path). */
  diffs: Record<string, GitFileDiff>;
  loading: boolean;
  /** Drives which sub-view + file the GitPanel reveals (activity-card jumps). */
  focus: GitFocus | null;
  hydrated: boolean;
  /** The commit composer's draft (streams live during AI generation). */
  commitMessage: string;
  /** True while the commit-message sub-agent is streaming a proposal. */
  generatingMessage: boolean;

  hydrate: () => void;
  /** Probe (or re-probe, with `force`) whether git is installed. */
  loadEnvironment: (force?: boolean) => Promise<void>;
  setCommitMessage: (text: string) => void;
  generateCommitMessage: () => Promise<void>;
  cancelCommitMessage: () => void;
  refresh: () => Promise<void>;
  /** Load (and cache) a file diff, optionally against an arbitrary base ref. */
  loadDiff: (path: string, staged: boolean, baseRef?: string) => Promise<GitFileDiff | null>;
  /** Copy a FAITHFUL patch (from git, not the parsed diff) to the clipboard. */
  copyPatch: (paths: string[], opts?: PatchOpts) => Promise<boolean>;
  /** Export a patch; main owns the save dialog and destination. */
  savePatch: (paths: string[], opts?: PatchOpts) => Promise<boolean>;
  /** The most recent commit touching `path`, or null. */
  lastCommitFor: (path: string) => Promise<GitCommit | null>;
  stage: (path: string) => Promise<void>;
  unstage: (path: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  discard: (path: string) => Promise<void>;
  commit: (message: string) => Promise<boolean>;
  loadHistory: () => Promise<void>;
  loadBranches: () => Promise<void>;
  loadTags: () => Promise<void>;
  loadCheckpoints: () => Promise<void>;
  createCheckpoint: (label: string) => Promise<void>;
  restoreCheckpoint: (checkpointId: string) => Promise<void>;
  deleteCheckpoint: (checkpointId: string) => Promise<void>;
  checkout: (branch: string, force?: boolean) => Promise<import('@shared/types').GitCheckoutResult>;
  /** Resolves true when the branch was created; toasts and resolves false otherwise. */
  createBranch: (name: string) => Promise<boolean>;
  fetch: () => Promise<boolean>;
  push: (opts?: { setUpstream?: boolean; force?: boolean }) => Promise<boolean>;
  pull: (opts?: { rebase?: boolean }) => Promise<boolean>;
  init: () => Promise<void>;
  setFocus: (focus: GitFocus | null) => void;
}

function gitApi() {
  return window.limboo?.git;
}

/** Surface a rejected git `invoke` as a toast (shared with the other stores). */
const guard = guardIpc;

function activeWs(): string | null {
  return useWorkspaceStore.getState().activeId;
}

function activeSession(): string | null {
  return useSessionStore.getState().selectedId;
}

/**
 * Generation-scoped bookkeeping (module-local, not store state): the user's
 * pre-generation draft — restored when a run errors/cancels before any text
 * arrived — and whether the in-flight run produced at least one delta.
 */
let draftBackup = '';
let sawDelta = false;

export const useGitStore = create<GitState>((set, get) => ({
  environment: null,
  status: null,
  log: [],
  branches: [],
  tags: [],
  checkpoints: [],
  diffs: {},
  loading: false,
  focus: null,
  hydrated: false,
  commitMessage: '',
  generatingMessage: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    const api = gitApi();
    if (!api) return;

    api.onChanged(({ workspaceId }) => {
      if (workspaceId === activeWs()) {
        // The working tree moved — drop the diff cache and re-pull status.
        set({ diffs: {} });
        void get().refresh();
      }
    });
    api.onCheckpointsChanged(({ sessionId }) => {
      if (sessionId === activeSession()) void get().loadCheckpoints();
    });
    api.onCommitMessageStream?.((ev) => {
      if (ev.workspaceId !== activeWs()) return;
      if (ev.kind === 'delta') {
        sawDelta = true;
        set((s) => ({ commitMessage: s.commitMessage + (ev.text ?? '') }));
      } else if (ev.kind === 'done') {
        // The done frame carries the full authoritative message — replace.
        set({ commitMessage: ev.text ?? get().commitMessage, generatingMessage: false });
      } else {
        // error / canceled: a failed run must not eat the user's draft.
        set({
          generatingMessage: false,
          ...(sawDelta ? {} : { commitMessage: draftBackup }),
        });
      }
    });

    api.onEnvironmentChanged?.((env) => set({ environment: env }));

    // Initial pull + follow active-workspace switches.
    void get().loadEnvironment();
    void get().refresh();
    window.limboo?.workspace.onChanged(() => {
      get().cancelCommitMessage();
      set({ diffs: {}, log: [], branches: [], tags: [], commitMessage: '', generatingMessage: false });
      void get().refresh();
    });
  },

  loadEnvironment: async (force = false) => {
    const api = gitApi();
    if (!api?.environment) return;
    // Best-effort: a failed probe must never block the panel from rendering.
    try {
      set({ environment: await api.environment(force ? { force: true } : undefined) });
    } catch {
      /* leave the previous answer in place */
    }
  },

  setCommitMessage: (text) => set({ commitMessage: text }),

  generateCommitMessage: async () => {
    const api = gitApi();
    const wsId = activeWs();
    const toast = useUIStore.getState().addToast;
    if (!api?.generateCommitMessage || !wsId || get().generatingMessage) return;
    draftBackup = get().commitMessage;
    sawDelta = false;
    set({ generatingMessage: true, commitMessage: '' });
    try {
      const r = await api.generateCommitMessage(wsId);
      if (!r.ok && r.reason !== 'canceled') {
        if (r.reason === 'no-staged') {
          toast({ title: 'Nothing staged', description: 'Stage changes first.', tone: 'warning' });
        } else if (r.reason === 'agent-unavailable') {
          // Name whichever agent is actually selected — the generator follows
          // the composer's provider, so hardcoding "Claude Code" told a Cursor
          // user to sign into a product they are not using.
          const agentName = agentDisplayName(
            useSettingsStore.getState().settings.agent.model,
          );
          toast({
            title: `${agentName} unavailable`,
            description: r.error ?? `Sign in to ${agentName} to generate commit messages.`,
            tone: 'danger',
          });
        } else if (r.reason === 'busy') {
          toast({ title: 'Already generating', description: 'A commit message is being generated.', tone: 'warning' });
        } else if (r.reason === 'rate-limited') {
          toast({ title: 'Rate limited', description: r.error, tone: 'warning' });
        } else {
          toast({ title: 'Generation failed', description: r.error, tone: 'danger' });
        }
      }
    } catch (err) {
      toast({
        title: 'Generation failed',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      });
    } finally {
      // Backstop — the stream's terminal frame normally clears this first; if it
      // never arrived (e.g. an early invoke error), restore the user's draft.
      if (get().generatingMessage) {
        set({
          generatingMessage: false,
          ...(sawDelta ? {} : { commitMessage: draftBackup }),
        });
      }
    }
  },

  cancelCommitMessage: () => {
    const wsId = activeWs();
    if (wsId && get().generatingMessage) void gitApi()?.cancelCommitMessage?.(wsId);
  },

  refresh: async () => {
    const api = gitApi();
    const wsId = activeWs();
    if (!api || !wsId) {
      set({ status: null });
      return;
    }
    set({ loading: true });
    try {
      const status = await api.status(wsId);
      set({ status });
    } finally {
      set({ loading: false });
    }
  },

  loadDiff: async (path, staged, baseRef) => {
    const api = gitApi();
    const wsId = activeWs();
    if (!api || !wsId) return null;
    // A read: a rejected path guard must not become an unhandled rejection that
    // leaves the expanding row stuck in its loading state.
    let diff: GitFileDiff;
    try {
      diff = await api.diff(wsId, path, { staged, ...(baseRef ? { baseRef } : {}) });
    } catch {
      return null;
    }
    set((s) => ({ diffs: { ...s.diffs, [diffKey(path, staged, baseRef)]: diff } }));
    return diff;
  },

  copyPatch: async (paths, opts) => {
    const api = gitApi();
    const wsId = activeWs();
    const toast = useUIStore.getState().addToast;
    if (!api?.patchText || !wsId || paths.length === 0) return false;
    const result = await guard('Could not copy patch', () => api.patchText(wsId, paths, opts));
    if (!result) return false;
    if (!result.text) {
      toast({ title: 'Nothing to copy', description: 'This file has no diff.', tone: 'warning' });
      return false;
    }
    await window.limboo?.system.clipboardWrite(result.text);
    toast({
      title: 'Patch copied',
      description: result.truncated ? 'Truncated — the diff exceeded the size cap.' : undefined,
      tone: result.truncated ? 'warning' : 'success',
    });
    return true;
  },

  savePatch: async (paths, opts) => {
    const api = gitApi();
    const wsId = activeWs();
    const toast = useUIStore.getState().addToast;
    if (!api?.patchSave || !wsId || paths.length === 0) return false;
    const result = await guard('Could not export patch', () => api.patchSave(wsId, paths, opts));
    // A canceled dialog is not a failure — say nothing.
    if (!result || !result.saved) return false;
    toast({ title: 'Patch exported', description: result.path, tone: 'success' });
    return true;
  },

  lastCommitFor: async (path) => {
    const api = gitApi();
    const wsId = activeWs();
    if (!api || !wsId) return null;
    try {
      const commits = await api.log(wsId, { limit: 1, path });
      return commits[0] ?? null;
    } catch {
      return null;
    }
  },

  stage: async (path) => {
    const api = gitApi();
    const wsId = activeWs();
    if (api && wsId) await guard('Could not stage file', () => api.stage(wsId, path));
  },
  unstage: async (path) => {
    const api = gitApi();
    const wsId = activeWs();
    if (api && wsId) await guard('Could not unstage file', () => api.unstage(wsId, path));
  },
  stageAll: async () => {
    const api = gitApi();
    const wsId = activeWs();
    if (api && wsId) await guard('Could not stage changes', () => api.stageAll(wsId));
  },
  unstageAll: async () => {
    const api = gitApi();
    const wsId = activeWs();
    if (api && wsId) await guard('Could not unstage changes', () => api.unstageAll(wsId));
  },
  discard: async (path) => {
    const api = gitApi();
    const wsId = activeWs();
    if (api && wsId) await guard('Could not discard changes', () => api.discard(wsId, path));
  },

  commit: async (message) => {
    const wsId = activeWs();
    if (!wsId) return false;
    const result = await gitApi()?.commit(wsId, message);
    await get().refresh();
    await get().loadHistory();
    return !!result;
  },

  loadHistory: async () => {
    const api = gitApi();
    const wsId = activeWs();
    if (!api || !wsId) return;
    set({ log: await api.log(wsId, { limit: 100 }) });
  },
  loadBranches: async () => {
    const api = gitApi();
    const wsId = activeWs();
    if (!api || !wsId) return;
    set({ branches: await api.branches(wsId) });
  },
  loadTags: async () => {
    const api = gitApi();
    const wsId = activeWs();
    if (!api || !wsId) return;
    set({ tags: await api.tags(wsId) });
  },
  loadCheckpoints: async () => {
    const api = gitApi();
    const sid = activeSession();
    if (!api || !sid) {
      set({ checkpoints: [] });
      return;
    }
    set({ checkpoints: await api.checkpointList(sid) });
  },

  createCheckpoint: async (label) => {
    const api = gitApi();
    const wsId = activeWs();
    const sid = activeSession();
    if (!api || !wsId || !sid) return;
    await guard('Could not create checkpoint', () => api.checkpointCreate(wsId, sid, label));
  },
  restoreCheckpoint: async (checkpointId) => {
    const api = gitApi();
    const wsId = activeWs();
    if (!api || !wsId) return;
    // A restore is now a true tree reset (it can DELETE files created since the
    // checkpoint), so say what it actually did rather than succeeding silently.
    const result = await guard('Could not restore checkpoint', () =>
      api.checkpointRestore(wsId, checkpointId),
    );
    if (result?.ok) {
      const removed = result.filesRemoved > 0 ? `, ${result.filesRemoved} removed` : '';
      useUIStore.getState().addToast({
        title: 'Checkpoint restored',
        description: `${result.filesReverted} file${result.filesReverted === 1 ? '' : 's'} restored${removed}.`,
        tone: 'success',
      });
    } else if (result?.error) {
      useUIStore.getState().addToast({ title: 'Could not restore checkpoint', description: result.error, tone: 'danger' });
    }
    await get().refresh();
  },
  deleteCheckpoint: async (checkpointId) => {
    const api = gitApi();
    const wsId = activeWs();
    if (!api || !wsId) return;
    await guard('Could not delete checkpoint', () => api.checkpointDelete(wsId, checkpointId));
  },

  checkout: async (branch, force) => {
    const api = gitApi();
    const wsId = activeWs();
    if (!api || !wsId) return { ok: false, error: 'No workspace' };
    // `checkout` returns a result object for git failures but still THROWS for a
    // rejected ref, so the rejection has to be converted into that same shape.
    let result: import('@shared/types').GitCheckoutResult;
    try {
      result = await api.checkout(wsId, branch, { force });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? cleanIpcError(err.message) : String(err) };
    }
    if (result.ok) {
      await get().refresh();
      await get().loadBranches();
    }
    return result;
  },
  createBranch: async (name) => {
    const api = gitApi();
    const wsId = activeWs();
    const toast = useUIStore.getState().addToast;
    if (!api || !wsId) return false;
    // The main process throws (not returns) on an invalid ref, so this MUST be
    // caught: an uncaught rejection here silently aborts the caller mid-way.
    try {
      const result = await api.createBranch(wsId, name, true);
      await get().refresh();
      await get().loadBranches();
      if (result && result.ok === false) {
        toast({ title: 'Could not create branch', description: result.error, tone: 'danger' });
        return false;
      }
      return true;
    } catch (err) {
      toast({
        title: 'Could not create branch',
        description: err instanceof Error ? cleanIpcError(err.message) : String(err),
        tone: 'danger',
      });
      return false;
    }
  },
  fetch: async () => {
    const api = gitApi();
    const wsId = activeWs();
    if (!api || !wsId) return false;
    const ok = await api.fetch(wsId);
    await get().refresh();
    return ok;
  },

  push: async (opts) => {
    const api = gitApi();
    const wsId = activeWs();
    const toast = useUIStore.getState().addToast;
    if (!api || !wsId) return false;
    try {
      const r = await api.push(wsId, opts);
      await get().refresh();
      if (r.ok) {
        toast({
          title: r.setUpstream ? 'Published branch' : 'Pushed to remote',
          description: r.pushed ? `${r.pushed} commit${r.pushed === 1 ? '' : 's'} pushed.` : undefined,
          tone: 'success',
        });
        return true;
      }
      if (r.noRemote) {
        toast({ title: 'No remote configured', description: 'Add a git remote to push.', tone: 'warning' });
      } else if (r.noUpstream) {
        toast({ title: 'Branch not published', description: 'Use Publish branch to set its upstream.', tone: 'warning' });
      } else if (r.authFailed) {
        toast({ title: 'No credentials for this remote', description: 'Configure your git credential helper or SSH key, then retry.', tone: 'danger' });
      } else if (r.rejected || r.needsPull) {
        toast({ title: 'Push rejected — pull first', description: 'The remote has new commits. Pull, then push again.', tone: 'danger' });
      } else {
        toast({ title: 'Push failed', description: r.error, tone: 'danger' });
      }
      return false;
    } catch (err) {
      toast({ title: 'Push failed', description: err instanceof Error ? err.message : String(err), tone: 'danger' });
      return false;
    }
  },

  pull: async (opts) => {
    const api = gitApi();
    const wsId = activeWs();
    const toast = useUIStore.getState().addToast;
    if (!api || !wsId) return false;
    try {
      const r = await api.pull(wsId, opts);
      set({ diffs: {} });
      await get().refresh();
      await get().loadHistory();
      if (r.ok) {
        toast({
          title: r.upToDate ? 'Already up to date' : 'Pulled from remote',
          tone: r.upToDate ? 'info' : 'success',
        });
        return true;
      }
      if (r.noUpstream) {
        toast({ title: 'Nothing to pull', description: 'This branch has no upstream.', tone: 'warning' });
      } else if (r.notFastForward) {
        toast({ title: 'Cannot fast-forward', description: 'Local and remote have diverged. Try a rebase pull.', tone: 'danger' });
      } else if (r.conflicts) {
        toast({ title: 'Pull stopped on conflicts', description: 'Resolve the conflicts in the changes list, then commit.', tone: 'danger' });
      } else {
        toast({ title: 'Pull failed', description: r.error, tone: 'danger' });
      }
      return false;
    } catch (err) {
      toast({ title: 'Pull failed', description: err instanceof Error ? err.message : String(err), tone: 'danger' });
      return false;
    }
  },
  init: async () => {
    const api = gitApi();
    const wsId = activeWs();
    if (!api || !wsId) return;
    await guard('Could not initialize repository', () => api.init(wsId));
    await get().refresh();
  },

  setFocus: (focus) => set({ focus }),
}));
