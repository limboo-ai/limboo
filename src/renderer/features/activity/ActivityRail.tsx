/**
 * Fixed far-right icon rail. Each tab toggles its drawer panel open/closed.
 *
 * The active tab is marked by the ICON'S OWN COLOR — no background plate. On a
 * pure-black canvas a filled `bg-surface-2` block reads as a second UI element
 * competing with the glyph it sits behind; the accent glyph alone is the
 * quieter and more legible signal. The plate is kept for hover, where it is
 * transient feedback rather than persistent state.
 *
 * Backed by the layout store so the open tab persists across launches.
 */
import { RAIL_TABS } from './tabs';
import { useLayoutStore } from '@/renderer/stores/useLayoutStore';
import { useActivityBadges } from './useActivityBadges';
import { cn } from '@/renderer/lib/cn';

export function ActivityRail() {
  const activeTab = useLayoutStore((s) => s.activeTab);
  const toggleTab = useLayoutStore((s) => s.toggleTab);
  const badgeFor = useActivityBadges();

  return (
    <nav className="flex h-full w-12 shrink-0 flex-col items-center gap-1 bg-base py-2">
      {RAIL_TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const badge = badgeFor(tab.id);
        return (
          <button
            key={tab.id}
            type="button"
            aria-label={tab.label}
            title={badge > 0 ? `${tab.label} (${badge})` : tab.label}
            onClick={() => toggleTab(tab.id)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-md transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
              isActive ? 'text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            <tab.icon size={17} />
            {badge > 0 && (
              <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 text-[8px] font-bold leading-none text-base">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
