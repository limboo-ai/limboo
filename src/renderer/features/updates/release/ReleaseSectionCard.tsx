/**
 * The one collapsible block every part of the release document is wrapped in.
 *
 * Written once rather than per-section so "independently collapsible,
 * searchable and copyable" is a property of the document instead of a promise
 * each new section has to keep. A section added later gets the disclosure, the
 * count, the copy affordance, the keyboard behaviour and the filter interaction
 * by construction.
 *
 * `forceOpen` is how the filter overrides folds: while a query is active a
 * section with matches must be readable, but flipping the user's stored fold
 * state to show it would silently rewrite what they see once the query clears.
 * So the open state is derived, and the stored state is left alone.
 */
import { useId, type ComponentType, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/renderer/lib/cn';
import { CopyButton } from './parts';

export function ReleaseSectionCard({
  title,
  icon: Icon,
  iconClassName,
  count,
  collapsed,
  forceOpen = false,
  onToggle,
  copyText,
  actions,
  children,
}: {
  title: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  iconClassName?: string;
  /** Item count shown beside the title. Hidden when undefined. */
  count?: number;
  collapsed: boolean;
  /** Filter match — open regardless of `collapsed`, without changing it. */
  forceOpen?: boolean;
  onToggle: () => void;
  copyText?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const bodyId = useId();
  const open = forceOpen || !collapsed;

  return (
    <section className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded text-left transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
          )}
        >
          <ChevronRight
            size={12}
            className={cn(
              'shrink-0 text-faint transition-transform',
              open && 'rotate-90',
              // A section forced open by the filter cannot be folded by the
              // chevron, so it says so rather than looking unresponsive.
              forceOpen && collapsed && 'opacity-50',
            )}
          />
          {Icon && <Icon size={13} className={cn('shrink-0', iconClassName ?? 'text-faint')} />}
          <span className="truncate text-[12px] font-medium text-fg">{title}</span>
          {count !== undefined && (
            <span className="shrink-0 text-[11px] text-faint">{count}</span>
          )}
        </button>
        {actions}
        {copyText && <CopyButton value={copyText} label={`Copy ${title}`} />}
      </div>
      {open && (
        <div id={bodyId} className="border-t border-line px-3 py-2.5">
          {children}
        </div>
      )}
    </section>
  );
}
