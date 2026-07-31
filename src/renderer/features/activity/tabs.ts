import { Brain, FileDiff, Folder, GitBranch, ListTodo, TerminalSquare, Workflow } from 'lucide-react';
import type { ComponentType } from 'react';
import type { ActivityTab } from '@shared/types';
import { ACTIVITY_TAB_IDS } from '@shared/constants';

export interface TabMeta {
  id: ActivityTab;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}

/**
 * The full set of activity tabs, in display order. The id list itself lives in
 * `@shared/constants` (`ACTIVITY_TAB_IDS`) so the main process can validate a
 * persisted `layout.activeTab` against exactly this set without importing React.
 */
export const ACTIVITY_TABS: TabMeta[] = [
  { id: 'files', label: 'Files', icon: Folder },
  { id: 'changes', label: 'Changes', icon: FileDiff },
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'console', label: 'Console', icon: TerminalSquare },
  { id: 'graph', label: 'Work Graph', icon: Workflow },
];

// Fail loudly in dev if the two lists drift apart.
if (ACTIVITY_TABS.length !== ACTIVITY_TAB_IDS.length) {
  throw new Error('ACTIVITY_TABS and ACTIVITY_TAB_IDS have diverged');
}

/**
 * Console and the Work Graph render as a horizontal strip in the top TitleBar
 * (next to Settings) instead of the vertical rail — while still opening their
 * drawer on the right. Everything else stays on the vertical `ActivityRail`.
 */
export const TOP_BAR_TABS: readonly ActivityTab[] = ['console', 'graph'];

/** Tabs shown in the top bar, in display order. */
export const TOP_TABS: TabMeta[] = ACTIVITY_TABS.filter((t) => TOP_BAR_TABS.includes(t.id));

/** Tabs that remain on the vertical right rail, in display order. */
export const RAIL_TABS: TabMeta[] = ACTIVITY_TABS.filter((t) => !TOP_BAR_TABS.includes(t.id));
