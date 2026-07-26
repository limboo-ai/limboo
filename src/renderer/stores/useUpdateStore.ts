/**
 * Update store — the renderer-side mirror of the main-process AutoUpdateManager.
 * Holds the latest {@link UpdateStatus} and exposes the user-driven actions
 * (check / download / install). Subscribes to `update:status` so the banner and
 * the Settings panel stay live through the whole update lifecycle.
 *
 * Degrades to a quiet `disabled` state in a plain browser preview (no preload)
 * and in dev builds (where the main manager reports `disabled`).
 */
import { create } from 'zustand';
import type { UpdateStatus } from '@shared/types';
import { useUIStore } from './useUIStore';

interface UpdateState {
  status: UpdateStatus;
  hydrated: boolean;
  /** True while a user-initiated check/download is in flight (for button state). */
  busy: boolean;
  /**
   * Whether the user has dismissed the bottom strip for the current stage. Kept
   * separate from {@link UpdateStatus.stage} so dismissing the strip does NOT
   * discard the update (the Settings-icon badge stays lit). Auto-reset whenever
   * the stage advances, so e.g. download progress re-surfaces the strip.
   */
  dismissed: boolean;

  hydrate: () => void;
  check: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  /** Hide the bottom strip for the current stage (renderer-only). */
  dismiss: () => void;
}

const INITIAL: UpdateStatus = { stage: 'idle', currentVersion: '' };

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: INITIAL,
  hydrated: false,
  busy: false,
  dismissed: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    const api = window.limboo?.updates;
    if (!api) {
      set({ status: { stage: 'disabled', currentVersion: '' } });
      return;
    }
    void api.getState().then((status) => set({ status }));
    api.onStatus((status) =>
      set((prev) => ({
        status,
        // `installing` is the one stage that IS the in-flight action, so it must
        // keep the buttons busy rather than release them.
        busy: status.stage === 'installing',
        // A new stage is a fresh thing to surface — clear any prior dismissal.
        // An install in flight always surfaces, dismissal or not.
        dismissed:
          status.stage === 'installing'
            ? false
            : status.stage === prev.status.stage
              ? prev.dismissed
              : false,
      })),
    );
  },

  check: async () => {
    const api = window.limboo?.updates;
    if (!api) return;
    set({ busy: true });
    try {
      await api.check();
    } finally {
      set({ busy: false });
    }
  },

  // The `finally` is not redundant with the `onStatus` push below: if the main
  // process never emits (the download throws before its first progress event),
  // relying on the push alone leaves the Download button disabled forever.
  download: async () => {
    const api = window.limboo?.updates;
    if (!api) return;
    set({ busy: true });
    try {
      await api.download();
    } finally {
      set({ busy: false });
    }
  },

  // The install path can refuse (nothing staged, updates disabled, the installer
  // failed to launch). It used to fail silently, which is indistinguishable from
  // a dead button — always say something.
  install: async () => {
    const api = window.limboo?.updates;
    if (!api) return;
    const result = await api.install();
    if (result && !result.ok) {
      const reason = result.error ?? 'The updater refused to start the installer.';
      useUIStore.getState().addToast({
        tone: 'danger',
        title: 'Could not install the update',
        // The manual command is the actual way out of a refused install, so it
        // travels with the failure rather than living only in the ribbon.
        description: result.manualCommand ? `${reason} Run: ${result.manualCommand}` : reason,
      });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));
