/**
 * Layout store — the live, fast-updating UI layout (sidebar widths + which
 * activity drawer tab is open). Width changes during a resize drag stay local
 * for smoothness and are persisted to the main-process settings file
 * (debounced) so the layout is restored on the next launch.
 */
import { create } from 'zustand';
import type { ActivityTab } from '@shared/types';
import { ACTIVITY_TAB_IDS, LAYOUT_LIMITS, clamp } from '@shared/constants';
import { debounce } from '@/renderer/lib/debounce';

interface LayoutState {
  leftWidth: number;
  rightWidth: number;
  /** Open drawer tab, or null when the drawer is collapsed. */
  activeTab: ActivityTab | null;
  /** Remembers the last open tab so "toggle sidebar" can restore it. */
  lastTab: ActivityTab;
  /** Whether the left sessions sidebar is collapsed to a thin rail. */
  sessionsCollapsed: boolean;
  /**
   * Whether the integrated terminal column is open. The terminal is NOT a
   * drawer tab — it is its own full-height column inside the workspace card,
   * between the sessions sidebar and the conversation.
   */
  terminalOpen: boolean;
  /** Width (px) of the terminal column (clamped to the terminal bounds). */
  terminalWidth: number;
  /**
   * Width (px) used for the right drawer when the Git tab is active. The Git
   * workspace (diffs/history) benefits from a wider drawer, so — like the
   * terminal — it keeps its own remembered width (clamped to the git bounds).
   */
  gitWidth: number;
  /**
   * Width (px) used for the right drawer when the Work Graph tab is active. The
   * graph is a canvas, so it wants the widest drawer of any tab and — like the
   * terminal and git workspaces — keeps its own remembered width.
   */
  graphWidth: number;

  seed: (layout: {
    leftWidth: number;
    rightWidth: number;
    activeTab: ActivityTab | null;
    sessionsCollapsed?: boolean;
    terminalOpen?: boolean;
    terminalWidth?: number;
    gitWidth?: number;
    graphWidth?: number;
  }) => void;
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  setGitWidth: (width: number) => void;
  setGraphWidth: (width: number) => void;
  setActiveTab: (tab: ActivityTab | null) => void;
  toggleTab: (tab: ActivityTab) => void;
  /** Collapse the drawer if open, otherwise reopen the last-used tab. */
  toggleDrawer: () => void;
  /** Collapse / expand the left sessions sidebar. */
  setSessionsCollapsed: (collapsed: boolean) => void;
  setTerminalWidth: (width: number) => void;
  /** Open or close the terminal column. */
  setTerminalOpen: (open: boolean) => void;
  /** Toggle the terminal column open/closed. */
  toggleTerminal: () => void;
}

const persist = debounce((layout: Partial<LayoutState>) => {
  void window.limboo?.settings.set({
    layout: {
      leftWidth: layout.leftWidth,
      rightWidth: layout.rightWidth,
      activeTab: layout.activeTab,
      sessionsCollapsed: layout.sessionsCollapsed,
      terminalOpen: layout.terminalOpen,
      terminalWidth: layout.terminalWidth,
      gitWidth: layout.gitWidth,
      graphWidth: layout.graphWidth,
    },
  });
}, 300);

export const useLayoutStore = create<LayoutState>((set, get) => ({
  leftWidth: LAYOUT_LIMITS.left.default,
  rightWidth: LAYOUT_LIMITS.right.default,
  activeTab: 'files',
  lastTab: 'files',
  sessionsCollapsed: false,
  terminalOpen: false,
  terminalWidth: LAYOUT_LIMITS.terminal.default,
  gitWidth: LAYOUT_LIMITS.git.default,
  graphWidth: LAYOUT_LIMITS.graph.default,

  seed: (layout) => {
    // Belt and braces: main's `SettingsManager.normalize` already allowlists the
    // persisted tab, but this store is ALSO seeded from a live `settings:changed`
    // push, which an older instance could have written.
    const tab =
      layout.activeTab !== null && ACTIVITY_TAB_IDS.includes(layout.activeTab)
        ? layout.activeTab
        : null;
    set({
      leftWidth: layout.leftWidth,
      rightWidth: layout.rightWidth,
      activeTab: tab,
      lastTab: tab ?? 'files',
      sessionsCollapsed: layout.sessionsCollapsed ?? false,
      terminalOpen: layout.terminalOpen ?? false,
      terminalWidth: clamp(
        layout.terminalWidth ?? LAYOUT_LIMITS.terminal.default,
        LAYOUT_LIMITS.terminal.min,
        LAYOUT_LIMITS.terminal.max,
      ),
      gitWidth: clamp(
        layout.gitWidth ?? LAYOUT_LIMITS.git.default,
        LAYOUT_LIMITS.git.min,
        LAYOUT_LIMITS.git.max,
      ),
      graphWidth: clamp(
        layout.graphWidth ?? LAYOUT_LIMITS.graph.default,
        LAYOUT_LIMITS.graph.min,
        LAYOUT_LIMITS.graph.max,
      ),
    });
  },

  setLeftWidth: (width) => {
    const leftWidth = clamp(width, LAYOUT_LIMITS.left.min, LAYOUT_LIMITS.left.max);
    set({ leftWidth });
    persist(get());
  },

  setRightWidth: (width) => {
    const rightWidth = clamp(width, LAYOUT_LIMITS.right.min, LAYOUT_LIMITS.right.max);
    set({ rightWidth });
    persist(get());
  },

  setActiveTab: (tab) => {
    set(tab ? { activeTab: tab, lastTab: tab } : { activeTab: null });
    persist(get());
  },

  toggleTab: (tab) => {
    const next = get().activeTab === tab ? null : tab;
    set(next ? { activeTab: next, lastTab: next } : { activeTab: null });
    persist(get());
  },

  toggleDrawer: () => {
    const { activeTab, lastTab } = get();
    set(activeTab ? { activeTab: null } : { activeTab: lastTab, lastTab });
    persist(get());
  },

  setSessionsCollapsed: (collapsed) => {
    set({ sessionsCollapsed: collapsed });
    persist(get());
  },

  setTerminalWidth: (width) => {
    const terminalWidth = clamp(width, LAYOUT_LIMITS.terminal.min, LAYOUT_LIMITS.terminal.max);
    set({ terminalWidth });
    persist(get());
  },

  setGitWidth: (width) => {
    const gitWidth = clamp(width, LAYOUT_LIMITS.git.min, LAYOUT_LIMITS.git.max);
    set({ gitWidth });
    persist(get());
  },

  setGraphWidth: (width) => {
    const graphWidth = clamp(width, LAYOUT_LIMITS.graph.min, LAYOUT_LIMITS.graph.max);
    set({ graphWidth });
    persist(get());
  },

  // The terminal is its own column inside the workspace card, not a drawer tab,
  // so it opens and closes independently of `activeTab`.
  setTerminalOpen: (open) => {
    set({ terminalOpen: open });
    persist(get());
  },

  toggleTerminal: () => {
    get().setTerminalOpen(!get().terminalOpen);
  },
}));
