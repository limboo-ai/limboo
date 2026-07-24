/**
 * PreviewRail — a Codex-style navigation rail: a column of compact ticks that
 * form a "pyramid" around the pointer (the hovered tick runs full width, its
 * neighbours fall away by distance) and reveal a floating preview card for the
 * destination under the cursor.
 *
 * Adapted from the beui.dev `preview-rail` pattern, with three deliberate
 * departures for this codebase:
 *
 * - **No animation library.** The reference drives the tick scale and the card
 *   swap with `motion/react`; this repo ships neither Framer Motion nor Motion
 *   One, and the pinned Vite 5 / Electron 42 toolchain is not worth a new
 *   dependency for two transitions. The pyramid is a CSS `transform: scaleX()`
 *   transition and the card uses the existing `animate-fade-in` utility, so the
 *   global reduced-motion switch (`html[data-reduced-motion]`) collapses both
 *   for free — no `useReducedMotion` hook needed.
 * - **Selection, not navigation.** Items resolve to an in-page target rather
 *   than an `href`, so each tick is a `<button>` and the consumer handles the
 *   jump via `onSelect`.
 * - **Rows shrink instead of scrolling.** A conversation grows without bound,
 *   so the row pitch steps down as items accumulate (and only the most recent
 *   {@link MAX_ITEMS} are kept) — the rail always fits its column, which keeps
 *   the preview card's per-row alignment exact.
 *
 * `align` decides which edge the ticks anchor to and which way the preview
 * flies out: `end` (the default) anchors right and previews to the left, which
 * is what a rail pinned to the right edge of a scroll region needs.
 */
import { useState, type ReactNode } from 'react';
import { cn } from '@/renderer/lib/cn';

/** Ticks past this are dropped from the head — the rail stays legible. */
export const MAX_ITEMS = 48;

export interface PreviewRailItem {
  id: string;
  label: string;
  description?: ReactNode;
  /** Optional trailing meta shown under the label (e.g. a timestamp). */
  meta?: string;
}

export interface PreviewRailProps {
  items: PreviewRailItem[];
  /** Controlled current item (the one the viewport is on). */
  activeId?: string;
  defaultActiveId?: string;
  onActiveChange?: (id: string) => void;
  /** Fired when a tick is clicked or activated by keyboard. */
  onSelect?: (id: string) => void;
  renderPreview?: (item: PreviewRailItem) => ReactNode;
  align?: 'start' | 'end';
  label?: string;
  className?: string;
  railClassName?: string;
  previewClassName?: string;
}

/** Tick width falls off with distance from the hovered item — the pyramid. */
function scaleFor(distance: number): number {
  if (distance === 0) return 1;
  if (distance === 1) return 0.68;
  if (distance === 2) return 0.44;
  return 0.25;
}

/** Row pitch in px — steps down so a long conversation still fits one column. */
function pitchFor(count: number): number {
  if (count <= 16) return 16;
  if (count <= 28) return 12;
  return 8;
}

function DefaultPreview({ item }: { item: PreviewRailItem }) {
  return (
    <div className="rounded-md border border-line-strong bg-elevated px-3 py-2 shadow-xl">
      <p className="line-clamp-2 text-[12px] font-medium leading-snug text-fg">{item.label}</p>
      {item.description ? (
        <div className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted">
          {item.description}
        </div>
      ) : null}
      {item.meta ? <div className="mt-1 text-[10px] text-faint">{item.meta}</div> : null}
    </div>
  );
}

export function PreviewRail({
  items: allItems,
  activeId,
  defaultActiveId,
  onActiveChange,
  onSelect,
  renderPreview,
  align = 'end',
  label = 'Conversation navigation',
  className,
  railClassName,
  previewClassName,
}: PreviewRailProps) {
  const [internalActiveId, setInternalActiveId] = useState(
    defaultActiveId ?? allItems[0]?.id ?? '',
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const items = allItems.length > MAX_ITEMS ? allItems.slice(-MAX_ITEMS) : allItems;
  const requestedActiveId = activeId ?? internalActiveId;
  const selectedId = items.some((item) => item.id === requestedActiveId)
    ? requestedActiveId
    : (items[items.length - 1]?.id ?? '');
  const displayedId = hoveredId ?? focusedId ?? '';
  const displayedIndex = items.findIndex((item) => item.id === displayedId);
  const atEnd = align === 'end';
  const pitch = pitchFor(items.length);
  const railHeight = items.length * pitch;

  const select = (id: string) => {
    if (activeId === undefined) setInternalActiveId(id);
    onActiveChange?.(id);
    onSelect?.(id);
  };

  if (!items.length) return null;

  // Card centre follows the hovered row, clamped so it never rides off the top
  // or bottom of the rail (the card is ~72px tall).
  const CARD_HALF = 40;
  const previewTop =
    displayedIndex < 0
      ? 0
      : Math.min(
          Math.max(displayedIndex * pitch + pitch / 2, CARD_HALF),
          Math.max(railHeight - CARD_HALF, CARD_HALF),
        );

  return (
    <div
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedId(null);
      }}
      className={cn('pointer-events-none relative', className)}
      style={{ height: railHeight }}
    >
      <nav
        aria-label={label}
        onPointerLeave={() => setHoveredId(null)}
        className={cn(
          'pointer-events-auto flex h-full flex-col',
          atEnd ? 'items-end' : 'items-start',
          railClassName,
        )}
      >
        {items.map((item, index) => {
          const displayed = item.id === displayedId;
          const selected = item.id === selectedId;
          const distance =
            displayedIndex < 0 ? Number.POSITIVE_INFINITY : Math.abs(index - displayedIndex);
          // With nothing hovered the rail rests on the current position: the
          // item in view reads full width, everything else sits at the floor.
          const scale = displayedIndex < 0 ? (selected ? 1 : 0.25) : scaleFor(distance);

          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              aria-current={selected ? 'true' : undefined}
              title={item.label}
              onPointerEnter={() => setHoveredId(item.id)}
              onPointerDown={() => setFocusedId(null)}
              onFocus={(event) => {
                if (event.currentTarget.matches(':focus-visible')) setFocusedId(item.id);
              }}
              onClick={() => select(item.id)}
              className={cn(
                'flex w-8 shrink-0 items-center rounded-sm focus-visible:outline-none',
                atEnd ? 'justify-end' : 'justify-start',
              )}
              style={{ height: pitch }}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'limboo-rail-tick block h-0.5 w-8',
                  atEnd ? 'origin-right' : 'origin-left',
                  displayed || selected ? 'bg-fg' : 'bg-line-strong',
                )}
                style={{ transform: `scaleX(${scale})` }}
              />
            </button>
          );
        })}
      </nav>

      {/* Floating destination preview for the tick under the pointer/focus. */}
      {displayedIndex >= 0 && (
        <div
          aria-hidden="true"
          className={cn(
            'animate-fade-in pointer-events-none absolute w-64 -translate-y-1/2',
            atEnd ? 'right-full mr-3' : 'left-full ml-3',
            previewClassName,
          )}
          style={{ top: previewTop }}
        >
          {renderPreview ? (
            renderPreview(items[displayedIndex])
          ) : (
            <DefaultPreview item={items[displayedIndex]} />
          )}
        </div>
      )}
    </div>
  );
}
