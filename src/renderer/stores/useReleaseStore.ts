/**
 * View state for the release document — which sections are collapsed, the
 * in-document filter, and which version History is comparing against.
 *
 * Scoped per version, because two open releases are two documents and neither
 * should inherit the other's folds.
 *
 * DELIBERATELY NOT PERSISTED, for the same reason `DiffViewState` is not: this
 * is where you were looking, not what you were working on. A release is read
 * once and dismissed; restoring a scroll position and a stale filter into a
 * document the user already acknowledged is worse than opening it clean. The
 * one thing that IS persisted is the acknowledgement itself
 * (`settings.updates.lastSeenVersion`), which is the only bit that changes what
 * the app does on the next launch.
 */
import { create } from 'zustand';
import type { ReleaseCategory } from '@shared/release';

interface ReleaseView {
  /** Categories the user has collapsed. Absent = expanded. */
  collapsed: Partial<Record<ReleaseCategory, boolean>>;
  /** Free-text filter applied across every section's items. */
  filter: string;
  /** Whether the History panel is open. */
  historyOpen: boolean;
  /** Version being compared against, or null. */
  compareWith: string | null;
}

const EMPTY: ReleaseView = { collapsed: {}, filter: '', historyOpen: false, compareWith: null };

interface ReleaseStoreState {
  byVersion: Record<string, ReleaseView>;
  view: (version: string) => ReleaseView;
  toggleCategory: (version: string, category: ReleaseCategory) => void;
  setAllCollapsed: (version: string, categories: ReleaseCategory[], collapsed: boolean) => void;
  setFilter: (version: string, filter: string) => void;
  setHistoryOpen: (version: string, open: boolean) => void;
  setCompareWith: (version: string, other: string | null) => void;
}

export const useReleaseStore = create<ReleaseStoreState>((set, get) => {
  /** Read-modify-write one version's view without disturbing the others. */
  const patch = (version: string, next: Partial<ReleaseView>) =>
    set((s) => ({
      byVersion: {
        ...s.byVersion,
        [version]: { ...(s.byVersion[version] ?? EMPTY), ...next },
      },
    }));

  return {
    byVersion: {},

    view: (version) => get().byVersion[version] ?? EMPTY,

    toggleCategory: (version, category) => {
      const current = get().byVersion[version] ?? EMPTY;
      patch(version, {
        collapsed: { ...current.collapsed, [category]: !current.collapsed[category] },
      });
    },

    setAllCollapsed: (version, categories, collapsed) => {
      const next: Partial<Record<ReleaseCategory, boolean>> = {};
      for (const c of categories) next[c] = collapsed;
      patch(version, { collapsed: next });
    },

    setFilter: (version, filter) => patch(version, { filter }),

    setHistoryOpen: (version, historyOpen) => patch(version, { historyOpen }),

    setCompareWith: (version, compareWith) => patch(version, { compareWith, historyOpen: true }),
  };
});
