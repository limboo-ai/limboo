/**
 * Hook store — the renderer-side mirror of the main-process Hook Engine's audit
 * trail. Holds each session's normalized governance events (gate decisions +
 * lifecycle) and subscribes once to `hooks:audit`. Display-only: the renderer
 * NEVER makes a policy decision — enforcement lives entirely in the main
 * process. All data crosses via the validated IPC surface.
 *
 * Degrades to empty, read-only state in a plain browser preview (no preload).
 */
import { create } from 'zustand';
import type { HookEvent } from '@shared/types';

/** Cap kept in memory per session (main ring-caps the persisted trail too). */
const MAX_PER_SESSION = 500;

interface HookStoreState {
  /** Redacted audit events per session, oldest first. */
  bySession: Record<string, HookEvent[]>;
  /** Sessions already fetched from main (avoid refetch churn). */
  loaded: Record<string, boolean>;
  hydrated: boolean;

  hydrate: () => void;
  /** Pull the persisted trail for a session (on session open). */
  loadSession: (sessionId: string) => Promise<void>;
  /** Clear a session's trail, or all sessions when omitted. */
  clear: (sessionId?: string) => Promise<void>;
}

function hooksApi() {
  return window.limboo?.hooks;
}

const EMPTY: HookEvent[] = [];

export const useHookStore = create<HookStoreState>((set, get) => ({
  bySession: {},
  loaded: {},
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    hooksApi()?.onAudit((push) => {
      if (push.kind === 'event') {
        const { event } = push;
        set((s) => {
          const prev = s.bySession[event.sessionId] ?? EMPTY;
          const next = [...prev, event];
          if (next.length > MAX_PER_SESSION) next.splice(0, next.length - MAX_PER_SESSION);
          return { bySession: { ...s.bySession, [event.sessionId]: next } };
        });
      } else if (push.sessionId) {
        const sessionId = push.sessionId;
        set((s) => ({ bySession: { ...s.bySession, [sessionId]: [] } }));
      } else {
        set({ bySession: {}, loaded: {} });
      }
    });
  },

  loadSession: async (sessionId) => {
    const api = hooksApi();
    if (!api || get().loaded[sessionId]) return;
    try {
      const events = await api.getAudit(sessionId);
      set((s) => ({
        bySession: { ...s.bySession, [sessionId]: events },
        loaded: { ...s.loaded, [sessionId]: true },
      }));
    } catch {
      /* best-effort hydration — the push stream keeps it current */
    }
  },

  clear: async (sessionId) => {
    try {
      await hooksApi()?.clearAudit(sessionId);
    } catch {
      /* the audit push reflects whatever main decided */
    }
  },
}));

/** Stable empty fallback for selectors (avoids re-renders on missing sessions). */
export const EMPTY_HOOKS: HookEvent[] = EMPTY;
