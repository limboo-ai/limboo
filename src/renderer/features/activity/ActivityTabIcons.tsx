/**
 * Horizontal activity strip for the top TitleBar — the Activity, Console, and
 * Hooks tabs, rendered next to the Settings gear. Each button toggles its drawer
 * open/closed on the right, exactly like the vertical `ActivityRail`; only the
 * placement differs. Styled to match the TitleBar's Settings `IconButton`.
 */
import { TOP_TABS } from './tabs';
import { useLayoutStore } from '@/renderer/stores/useLayoutStore';
import { useActivityBadges } from './useActivityBadges';
import { cn } from '@/renderer/lib/cn';

export function ActivityTabIcons() {
  const activeTab = useLayoutStore((s) => s.activeTab);
  const toggleTab = useLayoutStore((s) => s.toggleTab);
  const badgeFor = useActivityBadges();

  return (
    <div className="flex items-center gap-1">
      {TOP_TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const badge = badgeFor(tab.id);
        return (
          <button
            key={tab.id}
            type="button"
            aria-label={tab.label}
            title={badge > 0 ? `${tab.label} (${badge})` : tab.label}
            onClick={() => toggleTab(tab.id)}
            className={cn(
              'relative flex h-7 w-7 items-center justify-center rounded-md transition-colors',
              isActive ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            {isActive && (
              <span className="absolute -bottom-1 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-accent" />
            )}
            <tab.icon size={15} />
            {badge > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 text-[8px] font-bold leading-none text-base">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
