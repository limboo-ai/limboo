import {
  Activity,
  Brain,
  FileDiff,
  Folder,
  GitBranch,
  ListTodo,
  SquareTerminal,
  TerminalSquare,
  Webhook,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { ActivityTab } from '@shared/types';

export interface TabMeta {
  id: ActivityTab;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}

/** The full set of activity tabs, in display order. */
export const ACTIVITY_TABS: TabMeta[] = [
  { id: 'files', label: 'Files', icon: Folder },
  { id: 'changes', label: 'Changes', icon: FileDiff },
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'console', label: 'Console', icon: TerminalSquare },
  { id: 'hooks', label: 'Hooks', icon: Webhook },
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
];

/**
 * Activity, Console, and Hooks render as a horizontal strip in the top TitleBar
 * (next to Settings) instead of the vertical rail — while still opening their
 * drawer on the right. Everything else stays on the vertical `ActivityRail`.
 */
export const TOP_BAR_TABS: readonly ActivityTab[] = ['activity', 'console', 'hooks'];

/** Tabs shown in the top bar, in display order. */
export const TOP_TABS: TabMeta[] = ACTIVITY_TABS.filter((t) => TOP_BAR_TABS.includes(t.id));

/** Tabs that remain on the vertical right rail, in display order. */
export const RAIL_TABS: TabMeta[] = ACTIVITY_TABS.filter((t) => !TOP_BAR_TABS.includes(t.id));
