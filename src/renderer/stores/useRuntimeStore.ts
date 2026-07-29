/**
 * Runtime Telemetry store — the renderer's view of the live runtime snapshot.
 *
 * Session-scoped, following `useGraphStore`: it ignores pushes for a session it
 * is not showing and refetches on a sequence gap rather than rendering a
 * half-applied state.
 *
 * THE RENDERER NEVER BRANCHES ON PROVIDER. Everything downstream reads
 * `snapshot.capabilities` and `snapshot.notes`, both stamped by main. That is
 * what lets a section hide itself when the running adapter cannot measure it,
 * with no per-provider conditionals scattered through the components — and what
 * lets a third adapter contribute its sections without a renderer edit.
 */
import { create } from 'zustand';
import type {
  RuntimePush,
  RuntimeSnapshot,
  RuntimeUsageHistory,
  RuntimeExportFormat,
} from '@shared/types';
import { useSessionStore } from './useSessionStore';

/** Guarded accessor so the UI still renders in a plain browser preview. */
function api() {
  return window.limboo?.runtime;
}

interface RuntimeStoreState {
  hydrated: boolean;
  sessionId: string | null;
  snapshot: RuntimeSnapshot | null;
  seq: number;
  history: RuntimeUsageHistory[];
  /** True while the inspector is open in this window (gates the push volume). */
  watching: boolean;

  hydrate: () => void;
  load: (sessionId: string | null) => Promise<void>;
  /** Re-fetch the current session's snapshot (after telemetry is re-enabled). */
  reload: () => Promise<void>;
  loadHistory: () => Promise<void>;
  setWatching: (watching: boolean) => void;
  exportText: (format: RuntimeExportFormat) => Promise<string | null>;
  save: (format: RuntimeExportFormat) => Promise<boolean>;
  clearHistory: () => Promise<void>;
}

export const useRuntimeStore = create<RuntimeStoreState>((set, get) => ({
  hydrated: false,
  sessionId: null,
  snapshot: null,
  seq: 0,
  history: [],
  watching: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    const r = api();
    if (!r) return;

    r.onChanged((push: RuntimePush) => {
      const state = get();
      if (push.kind === 'reset') {
        // A reset means main dropped its buffers (telemetry disabled, or quit).
        if (push.sessionId && push.sessionId !== state.sessionId) return;
        set({ snapshot: null, seq: 0 });
        return;
      }
      // Ignore pushes for a session we are not showing.
      if (push.sessionId !== state.sessionId) return;
      // A sequence gap means we missed a snapshot. Each push carries the WHOLE
      // snapshot, so simply taking the newer one is correct — but refetching
      // keeps `seq` honest so the next gap is still detectable.
      if (push.seq !== state.seq + 1 && state.seq !== 0) {
        void get().load(state.sessionId);
        return;
      }
      set({ snapshot: push.snapshot, seq: push.seq });
    });

    // Follow the selected session, and load whatever is already selected.
    useSessionStore.subscribe((s, prev) => {
      if (s.selectedId !== prev.selectedId) void get().load(s.selectedId);
    });
    void get().load(useSessionStore.getState().selectedId);
  },

  load: async (sessionId) => {
    if (!sessionId) {
      set({ sessionId: null, snapshot: null, seq: 0, history: [] });
      return;
    }
    set({ sessionId, seq: 0 });
    try {
      const snapshot = (await api()?.getSnapshot(sessionId)) ?? null;
      // Guard against a session switch that landed while this was in flight.
      if (get().sessionId !== sessionId) return;
      set({ snapshot });
    } catch {
      set({ snapshot: null });
    }
  },

  /**
   * Re-fetch for whatever session is already selected. Main pushes only when a
   * signal arrives, so a snapshot cleared by a `reset` (telemetry disabled)
   * needs an explicit pull once telemetry is switched back on.
   */
  reload: async () => {
    const { sessionId } = get();
    if (sessionId) await get().load(sessionId);
  },

  loadHistory: async () => {
    const { sessionId } = get();
    if (!sessionId) return;
    try {
      const history = (await api()?.getHistory(sessionId)) ?? [];
      if (get().sessionId !== sessionId) return;
      set({ history });
    } catch {
      set({ history: [] });
    }
  },

  /**
   * Declare whether this window shows the inspector. Main keeps ingesting
   * either way (history stays complete) but only pushes at run boundaries when
   * nothing is watching — which is what makes the live ring free when closed.
   */
  setWatching: (watching) => {
    if (get().watching === watching) return;
    set({ watching });
    void api()?.setWatching(watching);
    if (watching) void get().load(get().sessionId);
  },

  exportText: async (format) => {
    const { sessionId } = get();
    if (!sessionId) return null;
    try {
      return (await api()?.export(sessionId, format)) ?? null;
    } catch {
      return null;
    }
  },

  save: async (format) => {
    const { sessionId } = get();
    if (!sessionId) return false;
    try {
      const result = await api()?.save(sessionId, format);
      return result?.saved === true;
    } catch {
      return false;
    }
  },

  clearHistory: async () => {
    try {
      await api()?.clearHistory();
    } finally {
      set({ history: [] });
    }
  },
}));
