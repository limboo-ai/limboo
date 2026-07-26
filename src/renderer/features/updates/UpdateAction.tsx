/**
 * UpdateAction — the one button shape every updater surface uses (the bottom
 * ribbon and Settings › Updates), so "Restart & install" looks and behaves
 * identically wherever the user reaches it.
 *
 * Token-driven and dark-only per CLAUDE.md §4: `bg-accent` for the committing
 * action, the `surface-2`/`line` well for secondary ones, `rounded-md` (6px), no
 * gradients. It adds the affordances the hand-rolled buttons were missing — a
 * pressed state, a keyboard focus ring, a real disabled state, and a `busy` mode
 * that spins the icon in place rather than swapping the label out from under the
 * cursor. The global `data-reduced-motion` rule in `styles/index.css` already
 * neutralizes the spin, so nothing extra is needed here.
 */
import type { ComponentType } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/renderer/lib/cn';

interface UpdateActionProps {
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  onClick: () => void;
  tone?: 'primary' | 'secondary';
  /** Swap the icon for a spinner and block interaction. */
  busy?: boolean;
  disabled?: boolean;
  /** Compact height, for the denser Settings rows. */
  size?: 'md' | 'sm';
}

export function UpdateAction({
  label,
  icon: Icon,
  onClick,
  tone = 'primary',
  busy = false,
  disabled = false,
  size = 'md',
}: UpdateActionProps) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md font-medium',
        'transition-[opacity,border-color,background-color] duration-150',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        'focus-visible:ring-offset-1 focus-visible:ring-offset-elevated',
        'disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-6 px-2.5 text-[12px]' : 'h-7 px-3 text-[12px]',
        tone === 'primary'
          ? 'bg-accent text-base hover:opacity-90 active:opacity-75'
          : 'border border-line bg-surface-2 text-fg hover:border-line-strong active:bg-elevated',
      )}
    >
      {busy ? (
        <Loader2 size={size === 'sm' ? 13 : 14} className="animate-spin" />
      ) : (
        <Icon size={size === 'sm' ? 13 : 14} />
      )}
      {label}
    </button>
  );
}
