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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { isEmbeddedAvatar, isForgeUrl, type ReleaseChannel } from '@shared/release';
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

/** The ring that tells a maintainer apart from a contributor, shared by both avatars. */
function avatarRing(emphasis: boolean): string {
  return emphasis ? 'ring-1 ring-accent/40' : 'ring-1 ring-line';
}

/**
 * A locally drawn avatar. No network, by construction — see the module note.
 * Maintainers get an accent ring so the roster reads at a glance without adding
 * a colour outside the palette.
 *
 * Still reached often: it is {@link Avatar}'s fallback for a development
 * checkout (where the manifest carries no contributors at all), for a
 * contributor CI could not resolve to a forge account, and for anything that
 * fails {@link isEmbeddedAvatar}.
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
        'flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-semibold uppercase',
        emphasis ? 'text-accent' : 'text-muted',
        avatarRing(emphasis),
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * A contributor's real profile picture, embedded in the manifest at build time
 * as a `data:` URI and screened before it reaches `src`.
 *
 * The screening is the point. A manifest is DATA — it is stamped in by CI from a
 * network response — so `data:text/html,…` or a remote `https://` avatar must
 * never become an `<img src>` on the strength of "we generated it ourselves".
 * Anything that fails {@link isEmbeddedAvatar} degrades to {@link Monogram}, and
 * so does a decode failure at runtime, so a corrupt image can never leave a
 * broken-image glyph in the roster.
 *
 * `aria-hidden` + empty `alt` are deliberate: the person's name is the adjacent
 * text, and announcing it twice is worse than not announcing the picture.
 */
export function Avatar({
  src,
  name,
  emphasis = false,
  size = 28,
}: {
  src: string | null | undefined;
  name: string;
  emphasis?: boolean;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (failed || !isEmbeddedAvatar(src)) {
    return <Monogram name={name} emphasis={emphasis} size={size} />;
  }
  return (
    <img
      src={src as string}
      alt=""
      aria-hidden
      draggable={false}
      loading="lazy"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded-full bg-surface-2 object-cover', avatarRing(emphasis))}
    />
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
