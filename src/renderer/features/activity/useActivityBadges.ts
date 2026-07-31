/**
 * Shared badge computation for the activity tabs, used by both the vertical
 * `ActivityRail` and the horizontal `ActivityTabIcons` strip in the TitleBar.
 * Keeping it in one place means the two renderers can never disagree on counts.
 *
 * Git shows unpushed commits ahead; Memory shows pending proposals — each a
 * subtle accent dot with a count.
 */
import type { ActivityTab } from '@shared/types';
import { useGitStore } from '@/renderer/stores/useGitStore';
import { useMemoryStore } from '@/renderer/stores/useMemoryStore';

export function useActivityBadges(): (id: ActivityTab) => number {
  const ahead = useGitStore((s) => s.status?.ahead ?? 0);
  const proposals = useMemoryStore((s) => s.proposals.length);

  return (id: ActivityTab): number => {
    if (id === 'git') return ahead;
    if (id === 'memory') return proposals;
    return 0;
  };
}
