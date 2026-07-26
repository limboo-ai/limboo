/**
 * Release history — every version this changelog knows about, and a diff
 * between any two that ship with full notes.
 *
 * The index lists EVERY release; only the most recent few carry full manifests
 * (`RELEASE_LIMITS.keepManifests`). That asymmetry is deliberate and is shown
 * rather than hidden: a version without bundled detail is still listed, with
 * its summary and a link to its release page, because "this shipped and you can
 * go read it" is a more honest answer than omitting it.
 *
 * Comparison is category-by-category over item leads. It answers "what is in B
 * that was not in A" — the question someone updating across several versions
 * actually has — rather than attempting a textual diff of two Markdown blobs,
 * which would report every rewording as a change.
 */
import { ArrowLeftRight, X } from 'lucide-react';
import {
  RELEASE_CATEGORY_LABEL,
  type ReleaseCategory,
  type ReleaseIndexEntry,
  type ReleaseManifestEntry,
} from '@shared/release';
import { RELEASE_INDEX, releaseManifestFor } from '@shared/releaseManifest.generated';
import { cn } from '@/renderer/lib/cn';
import { ReleaseSectionCard } from './ReleaseSectionCard';
import { CHANNEL_LABEL, ExternalLink, formatReleaseDate } from './parts';
import { orderSections } from './ReleaseHighlights';

/** Fold key for this section. See the note in `ReleaseCredits`. */
export const HISTORY_KEY = 'history' as unknown as ReleaseCategory;

export function ReleaseHistory({
  current,
  compareWith,
  collapsed,
  onToggle,
  onOpenVersion,
  onCompare,
}: {
  current: string;
  compareWith: string | null;
  collapsed: Partial<Record<ReleaseCategory, boolean>>;
  onToggle: (key: ReleaseCategory) => void;
  onOpenVersion: (version: string) => void;
  onCompare: (version: string | null) => void;
}) {
  const other = compareWith ? releaseManifestFor(compareWith) : null;
  const mine = releaseManifestFor(current);

  return (
    <ReleaseSectionCard
      title="Release history"
      count={RELEASE_INDEX.length}
      collapsed={!!collapsed[HISTORY_KEY]}
      onToggle={() => onToggle(HISTORY_KEY)}
    >
      <div className="flex flex-col gap-3">
        <ul className="flex flex-col">
          {RELEASE_INDEX.map((entry) => (
            <HistoryRow
              key={entry.version}
              entry={entry}
              isCurrent={entry.version === current}
              isCompared={entry.version === compareWith}
              onOpen={() => onOpenVersion(entry.version)}
              onCompare={() =>
                onCompare(entry.version === compareWith ? null : entry.version)
              }
            />
          ))}
        </ul>

        {mine && other && (
          <ComparisonTable a={other} b={mine} onClear={() => onCompare(null)} />
        )}
      </div>
    </ReleaseSectionCard>
  );
}

function HistoryRow({
  entry,
  isCurrent,
  isCompared,
  onOpen,
  onCompare,
}: {
  entry: ReleaseIndexEntry;
  isCurrent: boolean;
  isCompared: boolean;
  onOpen: () => void;
  onCompare: () => void;
}) {
  return (
    <li className="group flex min-w-0 items-center gap-2 border-b border-line py-1.5 last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        disabled={!entry.detailed}
        title={
          entry.detailed
            ? `Open the release document for ${entry.version}`
            : `${entry.version} shipped before this build; its full notes are not bundled`
        }
        className={cn(
          'shrink-0 rounded px-1 font-mono text-[11px] transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
          entry.detailed ? 'text-fg hover:text-accent' : 'cursor-default text-faint',
          isCurrent && 'font-semibold text-accent',
        )}
      >
        {entry.version}
      </button>
      <span className="w-28 shrink-0 text-[11px] text-faint">
        {formatReleaseDate(entry.date)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
        {entry.summary.replace(/\*\*/g, '') || '—'}
      </span>
      {/* Only prereleases are called out — "Stable" on every other row would be
          noise. Uses the shared label table, so this no longer prints a raw
          lowercase `beta` while the header prints `Beta`. */}
      {entry.channel !== 'stable' && (
        <span className="shrink-0 text-[11px] text-faint">{CHANNEL_LABEL[entry.channel]}</span>
      )}
      {entry.detailed && !isCurrent && (
        <button
          type="button"
          onClick={onCompare}
          aria-pressed={isCompared}
          title={isCompared ? 'Stop comparing' : `Compare with ${entry.version}`}
          className={cn(
            'shrink-0 rounded p-1 transition-colors hover:bg-surface-2 hover:text-fg',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
            isCompared ? 'text-accent' : 'text-faint opacity-0 group-hover:opacity-100',
          )}
        >
          <ArrowLeftRight size={12} />
        </button>
      )}
    </li>
  );
}

/**
 * What `b` added on top of `a`, per category. Matched on item leads: the lead is
 * the stable title of a change, while its explanation gets reworded between
 * releases and would make every entry look new.
 */
function ComparisonTable({
  a,
  b,
  onClear,
}: {
  a: ReleaseManifestEntry;
  b: ReleaseManifestEntry;
  onClear: () => void;
}) {
  const rows = orderSections(b.sections).map((section) => {
    const previous = new Set(
      a.sections
        .filter((s) => s.category === section.category)
        .flatMap((s) => s.items.map((i) => (i.lead ?? i.text).toLowerCase())),
    );
    const added = section.items.filter((i) => !previous.has((i.lead ?? i.text).toLowerCase()));
    return { category: section.category, added, total: section.items.length };
  });

  return (
    <div className="rounded border border-line bg-surface-2 p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <ArrowLeftRight size={12} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-[12px] text-fg">
          <span className="font-mono">{a.version}</span> →{' '}
          <span className="font-mono font-semibold">{b.version}</span>
        </span>
        <ExternalLink href={b.links.compare} className="text-[11px]">
          Compare on the forge
        </ExternalLink>
        <button
          type="button"
          onClick={onClear}
          aria-label="Stop comparing"
          className="shrink-0 rounded p-0.5 text-faint transition-colors hover:bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          <X size={12} />
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.category} className="flex items-baseline gap-2 text-[11px]">
            <span className="w-32 shrink-0 text-muted">
              {RELEASE_CATEGORY_LABEL[row.category] ?? row.category}
            </span>
            <span className={cn('shrink-0 font-mono', row.added.length ? 'text-success' : 'text-faint')}>
              +{row.added.length}
            </span>
            <span className="min-w-0 flex-1 truncate text-faint">
              {row.added.map((i) => i.lead ?? i.text.slice(0, 40)).join(', ') || 'nothing new'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
