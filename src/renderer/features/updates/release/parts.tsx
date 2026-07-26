/**
 * The small pieces every section of the release document is built from.
 *
 * They live together because they encode one rule each, and each rule is easy
 * to break by writing the "obvious" JSX inline somewhere else:
 *
 *  - `ExternalLink` — a manifest URL is DATA, so it is screened by `isForgeUrl`
 *    before it becomes clickable and opened through the preload bridge rather
 *    than navigated to. An unscreened URL renders as plain text, never as a
 *    dead or dangerous link.
 *  - `Monogram` — contributor avatars are drawn locally from initials. The
 *    production CSP is `img-src 'self' data:`, so a remote avatar would be a
 *    broken image on every row; this is not a placeholder for one.
 *  - `CopyButton` — copying is the only "write" this read-only document does,
 *    and it goes through the clipboard bridge like everything else.
 *  - `Field` / `Pill` — the label/value and status vocabulary the header and the
 *    integrity section share, so two tables of facts never drift apart.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { isForgeUrl } from '@shared/release';
import { cn } from '@/renderer/lib/cn';

/**
 * A link to a forge page. Renders its children as plain text when the URL is
 * absent or fails the allowlist — a release document must never present an
 * unverifiable destination as though it were the official one.
 */
export function ExternalLink({
  href,
  children,
  className,
  showIcon = false,
}: {
  href: string | null | undefined;
  children: ReactNode;
  className?: string;
  showIcon?: boolean;
}) {
  if (!isForgeUrl(href)) return <span className={className}>{children}</span>;
  return (
    <a
      href={href ?? undefined}
      onClick={(e) => {
        e.preventDefault();
        void window.limboo?.system?.openExternal(href as string);
      }}
      title={href ?? undefined}
      className={cn(
        'inline-flex items-center gap-1 text-accent underline decoration-accent/40 underline-offset-2',
        'rounded-sm hover:decoration-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        className,
      )}
    >
      {children}
      {showIcon && <ExternalLinkIcon size={10} className="shrink-0 opacity-70" />}
    </a>
  );
}

/** Up to two initials from a display name. `null` for anything unusable. */
function initialsOf(name: string): string {
  const parts = name
    .split(/[\s._-]+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * A locally drawn avatar. No network, by construction — see the module note.
 * Maintainers get an accent ring so the roster reads at a glance without adding
 * a colour outside the palette.
 */
export function Monogram({
  name,
  emphasis = false,
  size = 28,
}: {
  name: string;
  emphasis?: boolean;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold uppercase',
        emphasis
          ? 'bg-surface-2 text-accent ring-1 ring-accent/40'
          : 'bg-surface-2 text-muted ring-1 ring-line',
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * Copy-to-clipboard with a settled confirmation. The timer is cleared on
 * unmount — a section can be collapsed while the tick is still showing.
 */
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        void window.limboo?.system?.clipboardWrite(value);
        setDone(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 1200);
      }}
      className={cn(
        'shrink-0 rounded p-1 text-faint transition-colors hover:bg-surface-2 hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        done && 'text-success',
        className,
      )}
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

/** One label/value fact. Values that are absent render an em dash, never blank. */
export function Field({
  label,
  children,
  mono = false,
  copy,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
  /** When set, a copy button is shown and copies this exact text. */
  copy?: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-faint">{label}</span>
      <span className="flex min-w-0 items-center gap-1">
        <span className={cn('truncate text-[12px] text-fg', mono && 'font-mono text-[11px]')}>
          {children ?? '—'}
        </span>
        {copy && <CopyButton value={copy} label={`Copy ${label.toLowerCase()}`} />}
      </span>
    </div>
  );
}

export type PillTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const PILL_TONE: Record<PillTone, string> = {
  neutral: 'border-line text-muted',
  accent: 'border-accent/50 text-accent',
  success: 'border-success/50 text-success',
  warning: 'border-warning/50 text-warning',
  danger: 'border-danger/50 text-danger',
};

/**
 * A bordered status pill. Bordered rather than filled: a solid block of colour
 * on pure black reads as a button, and none of these are pressable.
 */
export function Pill({
  children,
  tone = 'neutral',
  icon: Icon,
  className,
}: {
  children: ReactNode;
  tone?: PillTone;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
        PILL_TONE[tone],
        className,
      )}
    >
      {Icon && <Icon size={10} className="shrink-0" />}
      {children}
    </span>
  );
}

/** Human byte size. `null` in, em dash out. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** `2026-07-26` → `26 July 2026`. Returns the input unchanged if unparseable. */
export function formatReleaseDate(date: string | null): string {
  if (!date) return '—';
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
