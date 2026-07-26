/**
 * The diff rendering surface, shared by the compact inline preview and the
 * maximized review workspace.
 *
 * A CSS grid rather than the `<table>` this replaced: a table cannot carry a
 * reliable `position: sticky` row across engines, and the review workspace needs
 * the current hunk header pinned while scrolling. Rows are uniform height (
 * `font-mono`, no wrap), which is also what makes the O(1) windowing below
 * correct — introducing word wrap would silently break it.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, UnfoldVertical } from 'lucide-react';
import type { GitFileDiff } from '@shared/types';
import { DIFF_LIMITS } from '@shared/constants';
import { cn } from '@/renderer/lib/cn';
import { Spinner } from '@/renderer/components/ui';
import { wordDiff } from '@/renderer/lib/wordDiff';
import type { HlToken } from '@/renderer/lib/highlight';
import { buildDiffModel, type DiffRow, type DiffSide } from './rows';
import { useDiffTokens, type DiffTokens } from './useDiffTokens';

/** Row height in px. Must match the leading below, or windowing drifts. */
const ROW_H = 18;

export interface DiffEditorProps {
  diff: GitFileDiff;
  layout: 'unified' | 'split';
  foldContext: boolean;
  collapsedHunks: number[];
  wordLevel: boolean;
  showWhitespace: boolean;
  /** Run the async Shiki pass. Off for the compact preview (see DiffView). */
  highlight: boolean;
  /** Initial scroll offset, and a callback so it can be preserved across remounts. */
  scrollTop?: number;
  onScrollTopChange?: (top: number) => void;
  onToggleHunk?: (hunkIndex: number) => void;
  /** Cap the rendered height (the compact preview); omit to fill the parent. */
  maxHeightClass?: string;
}

export function DiffEditor({
  diff,
  layout,
  foldContext,
  collapsedHunks,
  wordLevel,
  showWhitespace,
  highlight,
  scrollTop,
  onScrollTopChange,
  onToggleHunk,
  maxHeightClass,
}: DiffEditorProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [expandedFolds, setExpandedFolds] = useState<Set<string>>(() => new Set());
  const [offset, setOffset] = useState(scrollTop ?? 0);
  const [viewportH, setViewportH] = useState(0);

  const model = useMemo(
    () => buildDiffModel(diff, { layout, foldContext, collapsedHunks, expandedFolds }),
    [diff, layout, foldContext, collapsedHunks, expandedFolds],
  );

  const tokens = useDiffTokens(model.oldText, model.newText, diff.language, highlight);

  // Restore the saved offset once the rows exist to scroll through.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (scrollTop && Math.abs(el.scrollTop - scrollTop) > 1) el.scrollTop = scrollTop;
    setViewportH(el.clientHeight);
    const observer = new ResizeObserver(() => setViewportH(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
    // Only on mount / when the document identity changes.
  }, [diff.path, diff.staged]);

  const rows = model.rows;
  const virtualize = rows.length > DIFF_LIMITS.virtualizeThreshold && viewportH > 0;
  const overscan = DIFF_LIMITS.overscanRows;
  const first = virtualize ? Math.max(0, Math.floor(offset / ROW_H) - overscan) : 0;
  const last = virtualize
    ? Math.min(rows.length, Math.ceil((offset + viewportH) / ROW_H) + overscan)
    : rows.length;
  const visible = virtualize ? rows.slice(first, last) : rows;

  // The hunk header for the topmost visible row, pinned as an overlay. A plain
  // `position: sticky` header cannot work here: windowing removes it from the
  // DOM as soon as it scrolls out of range.
  const stickyHeader = useMemo(() => {
    if (!virtualize) return null;
    for (let i = Math.min(first, rows.length - 1); i >= 0; i--) {
      const row = rows[i];
      if (row?.kind === 'hunk') return row.header;
    }
    return null;
  }, [rows, first, virtualize]);

  const toggleFold = (foldId: string) =>
    setExpandedFolds((prev) => {
      const next = new Set(prev);
      next.has(foldId) ? next.delete(foldId) : next.add(foldId);
      return next;
    });

  return (
    <div className="relative min-h-0 flex-1">
      {stickyHeader && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 truncate bg-surface-2/95 px-2 font-mono text-[11px] leading-[18px] text-faint">
          {stickyHeader}
        </div>
      )}
      <div
        ref={scroller}
        onScroll={(e) => {
          const top = e.currentTarget.scrollTop;
          setOffset(top);
          onScrollTopChange?.(top);
        }}
        className={cn('h-full overflow-auto font-mono text-[11px]', maxHeightClass)}
      >
        {virtualize && <div style={{ height: first * ROW_H }} />}
        {visible.map((row, i) => (
          <Row
            key={first + i}
            row={row}
            layout={layout}
            tokens={tokens}
            wordLevel={wordLevel}
            showWhitespace={showWhitespace}
            onToggleHunk={onToggleHunk}
            collapsed={row.kind === 'hunk' && collapsedHunks.includes(row.hunkIndex)}
            onToggleFold={toggleFold}
          />
        ))}
        {virtualize && <div style={{ height: (rows.length - last) * ROW_H }} />}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- rows */

function Row({
  row,
  layout,
  tokens,
  wordLevel,
  showWhitespace,
  collapsed,
  onToggleHunk,
  onToggleFold,
}: {
  row: DiffRow;
  layout: 'unified' | 'split';
  tokens: DiffTokens;
  wordLevel: boolean;
  showWhitespace: boolean;
  collapsed: boolean;
  onToggleHunk?: (hunkIndex: number) => void;
  onToggleFold: (foldId: string) => void;
}) {
  if (row.kind === 'hunk') {
    const Chevron = collapsed ? ChevronRight : ChevronDown;
    return (
      <button
        type="button"
        disabled={!onToggleHunk}
        onClick={() => onToggleHunk?.(row.hunkIndex)}
        style={{ height: ROW_H }}
        className={cn(
          'flex w-full items-center gap-1 bg-surface-2 px-2 text-left leading-[18px] text-faint',
          onToggleHunk && 'hover:text-fg',
        )}
      >
        {onToggleHunk && <Chevron size={11} className="shrink-0" />}
        <span className="truncate">{row.header}</span>
        {collapsed && <span className="ml-auto shrink-0 text-[10px]">{row.lineCount} lines</span>}
      </button>
    );
  }

  if (row.kind === 'meta') {
    return (
      <div style={{ height: ROW_H }} className="px-2 italic leading-[18px] text-faint">
        {row.text}
      </div>
    );
  }

  if (row.kind === 'fold') {
    return (
      <button
        type="button"
        onClick={() => onToggleFold(row.foldId)}
        style={{ height: ROW_H }}
        className="flex w-full items-center gap-1.5 bg-surface-2/50 px-2 text-left leading-[18px] text-faint hover:text-fg"
      >
        <UnfoldVertical size={11} className="shrink-0" />
        <span>{row.count} unchanged lines</span>
      </button>
    );
  }

  // A paired change row is the only place a word-level diff is meaningful.
  const left = row.left;
  const right = row.right;
  const paired =
    wordLevel && left?.kind === 'del' && right?.kind === 'add' && left.text !== right.text;
  const spans = paired && left && right ? wordDiff(left.text, right.text) : null;

  if (layout === 'split') {
    return (
      <div style={{ height: ROW_H }} className="grid grid-cols-2 leading-[18px]">
        <Cell
          side={row.left}
          tokens={tokens}
          changed={spans?.left}
          showWhitespace={showWhitespace}
          className="border-r border-line"
        />
        <Cell
          side={row.right}
          tokens={tokens}
          changed={spans?.right}
          showWhitespace={showWhitespace}
        />
      </div>
    );
  }

  // Unified: one side per row, both gutters shown.
  const side = row.right ?? row.left;
  const sign = side?.kind === 'add' ? '+' : side?.kind === 'del' ? '-' : ' ';
  return (
    <div
      style={{ height: ROW_H }}
      className={cn(
        'flex leading-[18px]',
        side?.kind === 'add' && 'bg-success/10',
        side?.kind === 'del' && 'bg-danger/10',
      )}
    >
      <Gutter value={row.left?.lineNo} />
      <Gutter value={row.right?.lineNo} />
      <div className="min-w-0 flex-1 whitespace-pre px-2">
        <span
          className={cn(
            'select-none',
            side?.kind === 'add' && 'text-success',
            side?.kind === 'del' && 'text-danger',
            side?.kind === 'context' && 'text-faint',
          )}
        >
          {sign}
        </span>
        {side && (
          <LineText
            side={side}
            tokens={tokens}
            changed={side.kind === 'del' ? spans?.left : spans?.right}
            showWhitespace={showWhitespace}
          />
        )}
      </div>
    </div>
  );
}

function Gutter({ value }: { value?: number }) {
  return (
    <span className="w-10 shrink-0 select-none border-r border-line px-2 text-right text-faint">
      {value ?? ''}
    </span>
  );
}

function Cell({
  side,
  tokens,
  changed,
  showWhitespace,
  className,
}: {
  side?: DiffSide;
  tokens: DiffTokens;
  changed?: { text: string; changed: boolean }[];
  showWhitespace: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0',
        side?.kind === 'add' && 'bg-success/10',
        side?.kind === 'del' && 'bg-danger/10',
        // An absent side is the empty half of an unbalanced change.
        !side && 'bg-surface-2/40',
        className,
      )}
    >
      <Gutter value={side?.lineNo} />
      <div className="min-w-0 flex-1 overflow-hidden whitespace-pre px-2">
        {side && (
          <LineText side={side} tokens={tokens} changed={changed} showWhitespace={showWhitespace} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- line content */

/** Character ranges that the word diff marked as changed. */
function changedRanges(spans?: { text: string; changed: boolean }[]): [number, number][] {
  if (!spans) return [];
  const out: [number, number][] = [];
  let at = 0;
  for (const span of spans) {
    if (span.changed) out.push([at, at + span.text.length]);
    at += span.text.length;
  }
  return out;
}

const WS_SPACE = '·';
const WS_TAB = '→';

/** Render visible whitespace markers without changing the text's width. */
function withWhitespace(text: string, on: boolean): string {
  return on ? text.replace(/ /g, WS_SPACE).replace(/\t/g, WS_TAB) : text;
}

/**
 * One line of code: syntax tokens (when available) sliced at word-diff
 * boundaries so the two highlight systems compose instead of fighting.
 */
function LineText({
  side,
  tokens,
  changed,
  showWhitespace,
}: {
  side: DiffSide;
  tokens: DiffTokens;
  changed?: { text: string; changed: boolean }[];
  showWhitespace: boolean;
}) {
  const line = (side.side === 'old' ? tokens.old : tokens.new)?.[side.tokenLine];
  const ranges = changedRanges(changed);
  const tint =
    side.kind === 'add' ? 'bg-success/25' : side.kind === 'del' ? 'bg-danger/25' : '';

  // No grammar (loading, unsupported, or highlighting off) — plain text, still
  // word-diffed. This is also the whole fallback path, so it must stand alone.
  if (!line) {
    if (!ranges.length) {
      return <span className="text-fg">{withWhitespace(side.text, showWhitespace)}</span>;
    }
    return (
      <>
        {sliceByRanges(side.text, ranges).map((piece, i) => (
          <span key={i} className={cn('text-fg', piece.changed && tint)}>
            {withWhitespace(piece.text, showWhitespace)}
          </span>
        ))}
      </>
    );
  }

  const out: React.ReactNode[] = [];
  let at = 0;
  let key = 0;
  for (const token of line) {
    for (const piece of sliceByRanges(token.content, ranges, at)) {
      out.push(
        <span key={key++} className={cn(piece.changed && tint)} style={styleFor(token)}>
          {withWhitespace(piece.text, showWhitespace)}
        </span>,
      );
    }
    at += token.content.length;
  }
  return <>{out}</>;
}

function styleFor(token: HlToken): React.CSSProperties {
  return {
    color: token.color,
    fontStyle: token.italic ? 'italic' : undefined,
    fontWeight: token.bold ? 600 : undefined,
    textDecoration: token.underline ? 'underline' : undefined,
  };
}

/**
 * Split `text` (which starts at absolute offset `base`) wherever a changed range
 * begins or ends, so a syntax token can be partly tinted.
 */
function sliceByRanges(
  text: string,
  ranges: [number, number][],
  base = 0,
): { text: string; changed: boolean }[] {
  if (!ranges.length) return [{ text, changed: false }];
  const out: { text: string; changed: boolean }[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const abs = base + cursor;
    const range = ranges.find(([start, end]) => abs >= start && abs < end);
    if (range) {
      const take = Math.min(text.length - cursor, range[1] - abs);
      out.push({ text: text.slice(cursor, cursor + take), changed: true });
      cursor += take;
    } else {
      // Run until the next range starts (or the end of this token).
      const next = ranges
        .map(([start]) => start)
        .filter((start) => start > abs)
        .sort((a, b) => a - b)[0];
      const stop = next === undefined ? text.length : Math.min(text.length, next - base);
      out.push({ text: text.slice(cursor, stop), changed: false });
      cursor = stop;
    }
  }
  return out;
}

/** Shared empty/edge states, so every caller renders them identically. */
export function DiffPlaceholder({ diff, loading }: { diff?: GitFileDiff | null; loading?: boolean }) {
  if (loading && !diff) {
    return (
      <div className="flex items-center gap-2 px-3 py-4 text-[12px] text-muted">
        <Spinner size={12} /> Loading diff…
      </div>
    );
  }
  if (!diff) return null;
  if (diff.binary) {
    return <p className="px-3 py-3 text-[12px] italic text-faint">Binary file — no text diff.</p>;
  }
  if (diff.hunks.length === 0) {
    return <p className="px-3 py-3 text-[12px] italic text-faint">No changes to display.</p>;
  }
  return null;
}

export { ROW_H };
