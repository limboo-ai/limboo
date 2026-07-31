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
 *  - `Avatar` / `Monogram` — a contributor image is screened by
 *    `isEmbeddedAvatar` and falls back to locally drawn initials. The avatar is
 *    always an embedded `data:` URI resolved at build time, never a remote URL:
 *    production CSP is `img-src 'self' data:`, so a github.com avatar would be a
 *    broken image on every row and the document would stop working offline.
 *  - `CopyButton` — copying is the only "write" this read-only document does,
 *    and it goes through the clipboard bridge like everything else.
 *  - `Field` — the label/value vocabulary the header and the integrity section
 *    share, so two tables of facts never drift apart.
 *
 * There is deliberately NO badge/pill primitive here. Status reads as words:
 * "Stable", "Running now", "Windows: self-signed" are sentences, and wrapping a
 * sentence in a coloured capsule adds emphasis without adding information.
 */
import type { ReactNode } from 'react';
import { isForgeUrl, type ReleaseChannel } from '@shared/release';
import { Avatar, CopyButton, Monogram } from '@/renderer/components/ui';
import { cn } from '@/renderer/lib/cn';

/**
 * Display name per channel. Lives here rather than in the header so the header
 * and the history list cannot drift — the history row used to print the raw
 * lowercase `beta` while the header printed `Beta`.
 */
export const CHANNEL_LABEL: Record<ReleaseChannel, string> = {
  stable: 'Stable',
  beta: 'Beta',
  nightly: 'Nightly',
  preview: 'Preview',
};

/**
 * A link to a forge page. Renders its children as plain text when the URL is
 * absent or fails the allowlist — a release document must never present an
 * unverifiable destination as though it were the official one.
 */
export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string | null | undefined;
  children: ReactNode;
  className?: string;
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
    </a>
  );
}

/**
 * Shared primitives re-exported so existing imports keep working while there is
 * only one implementation of each. `Avatar`/`Monogram` moved to `components/ui`
 * when git history started needing them too — the `CopyButton` precedent.
 */
export { CopyButton, Avatar, Monogram };

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
