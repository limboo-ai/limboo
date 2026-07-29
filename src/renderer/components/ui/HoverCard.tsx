/**
 * A hover-and-focus floating card — the app's first shared popover primitive.
 *
 * Hand-rolled on the idiom every existing popover in the app already uses
 * (`ComposerControls`, `WorkspaceSwitcher`, `SessionsSidebar`): an absolutely
 * positioned `bg-elevated` panel with `animate-pop-in`. No dependency is added;
 * the repo has no floating-ui or Radix and does not need one for this.
 *
 * WHY IT OPENS UPWARD BY DEFAULT. Its first consumer sits in the composer
 * footer, and that row must never gain `overflow-x` — the selects' popovers
 * open upward, and any horizontal overflow forces `overflow-y: auto` and clips
 * them. Placing this card upward too keeps it in the same escape path.
 *
 * ACCESSIBILITY. It opens on hover AND on keyboard focus: a panel reachable
 * only by mouse is not reachable. Escape closes it, and `pinned` keeps it open
 * so a user who wants to read it can stop hovering.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/renderer/lib/cn';

/** Grace period so the pointer can travel from the trigger onto the card. */
const CLOSE_DELAY_MS = 160;
const OPEN_DELAY_MS = 90;

export function HoverCard({
  trigger,
  children,
  placement = 'top',
  align = 'end',
  pinned = false,
  onPinnedChange,
  animate = true,
  label,
  panelClassName,
  className,
}: {
  /** The always-visible element that opens the card. */
  trigger: React.ReactNode;
  children: React.ReactNode;
  /** `top` clears the composer footer; `bottom` suits a header anchor. */
  placement?: 'top' | 'bottom';
  align?: 'start' | 'end';
  /** Keep the card open without hovering. Click the trigger to toggle. */
  pinned?: boolean;
  onPinnedChange?: (pinned: boolean) => void;
  /** Off drops the entry animation (settings: `animation: 'none'`). */
  animate?: boolean;
  /** Accessible name for the trigger button. */
  label: string;
  panelClassName?: string;
  className?: string;
}) {
  const [hovering, setHovering] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();
  const open = pinned || hovering;

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const schedule = useCallback(
    (next: boolean) => {
      clearTimer();
      timer.current = setTimeout(() => setHovering(next), next ? OPEN_DELAY_MS : CLOSE_DELAY_MS);
    },
    [clearTimer],
  );

  // Clear on unmount so a pending open cannot set state on a dead component.
  useEffect(() => clearTimer, [clearTimer]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setHovering(false);
      onPinnedChange?.(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onPinnedChange]);

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => schedule(true)}
      onMouseLeave={() => schedule(false)}
      // Focus-within opens it for keyboard users; blur closes on the same grace
      // delay so tabbing THROUGH the panel's own controls does not dismiss it.
      onFocus={() => schedule(true)}
      onBlur={() => schedule(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => onPinnedChange?.(!pinned)}
        className="no-drag inline-flex items-center rounded-md outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        {trigger}
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={label}
          className={cn(
            // `rounded-md` (6px), not `rounded-lg` — CLAUDE.md §4b fixes the
            // radius for every floating surface in the app, and every other
            // popover (ComposerControls, WorkspaceSwitcher) already uses it.
            // The width cap keeps a narrow window from pushing the card
            // off-screen; the height cap is the consumer's business.
            'absolute z-30 w-[320px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-md border border-line bg-elevated shadow-xl',
            placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            align === 'end' ? 'right-0' : 'left-0',
            animate && 'animate-pop-in',
            panelClassName,
          )}
        >
          {children}
        </div>
      )}
    </span>
  );
}
