/**
 * The diff row model: turns a parsed `GitFileDiff` into a flat, uniform-height
 * row list that both the unified and split renderers draw and the virtualizer
 * windows.
 *
 * Two jobs beyond layout:
 *
 *  1. **Split pairing.** Split view is derived from the SAME unified hunks git
 *     already gave us — deletions and additions inside a hunk are buffered and
 *     flushed side-by-side at each context boundary. No second `git diff`, no
 *     new IPC.
 *  2. **Token indexing.** Highlighting one diff line at a time mis-colors
 *     multi-line strings, template literals, block comments, and JSX, because a
 *     grammar has no idea it is being fed fragments. So we reconstruct two
 *     pseudo-documents per file — the old side (context + deletions) and the new
 *     side (context + additions) — tokenize each ONCE, and record on every row
 *     which line of which document it came from.
 */
import type { GitDiffLine, GitFileDiff } from '@shared/types';
import { DIFF_LIMITS } from '@shared/constants';

export type DiffSideKind = 'context' | 'add' | 'del';

/** One rendered half-row (a cell in split view, a whole row in unified view). */
export interface DiffSide {
  text: string;
  /** 1-based line number in its file, when the diff supplied one. */
  lineNo?: number;
  kind: DiffSideKind;
  /** Row index into the tokenized old/new pseudo-document. */
  tokenLine: number;
  /** Which pseudo-document `tokenLine` indexes. */
  side: 'old' | 'new';
}

export type DiffRow =
  | { kind: 'hunk'; hunkIndex: number; header: string; lineCount: number }
  | { kind: 'meta'; hunkIndex: number; text: string }
  | { kind: 'fold'; hunkIndex: number; count: number; foldId: string }
  | { kind: 'line'; hunkIndex: number; left?: DiffSide; right?: DiffSide };

export interface DiffModel {
  rows: DiffRow[];
  /** The old-side pseudo-document (context + deletions), newline-joined. */
  oldText: string;
  /** The new-side pseudo-document (context + additions), newline-joined. */
  newText: string;
  /** Total change counts, for the header. */
  adds: number;
  dels: number;
}

export interface BuildRowsOptions {
  layout: 'unified' | 'split';
  /** Collapse long unchanged-context runs to a single expander row. */
  foldContext: boolean;
  /** Hunk indices rendered as a header only. */
  collapsedHunks: number[];
  /** Fold ids the user has manually expanded. */
  expandedFolds: Set<string>;
}

/** Annotated line: the raw diff line plus its index in the pseudo-documents. */
interface Indexed {
  line: GitDiffLine;
  oldIdx: number;
  newIdx: number;
}

function toSide(entry: Indexed, side: 'old' | 'new'): DiffSide {
  const kind = entry.line.kind as DiffSideKind;
  return {
    text: entry.line.text,
    lineNo: side === 'old' ? entry.line.oldLine : entry.line.newLine,
    kind,
    tokenLine: side === 'old' ? entry.oldIdx : entry.newIdx,
    side,
  };
}

export function buildDiffModel(diff: GitFileDiff, opts: BuildRowsOptions): DiffModel {
  const rows: DiffRow[] = [];
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let adds = 0;
  let dels = 0;

  const collapsed = new Set(opts.collapsedHunks);

  diff.hunks.forEach((hunk, hunkIndex) => {
    // First pass: assign every renderable line its index in the pseudo-documents.
    const indexed: Indexed[] = [];
    for (const line of hunk.lines) {
      if (line.kind === 'hunk') continue;
      if (line.kind === 'meta') {
        indexed.push({ line, oldIdx: -1, newIdx: -1 });
        continue;
      }
      let oldIdx = -1;
      let newIdx = -1;
      if (line.kind === 'context' || line.kind === 'del') {
        oldIdx = oldLines.length;
        oldLines.push(line.text);
      }
      if (line.kind === 'context' || line.kind === 'add') {
        newIdx = newLines.length;
        newLines.push(line.text);
      }
      if (line.kind === 'add') adds++;
      if (line.kind === 'del') dels++;
      indexed.push({ line, oldIdx, newIdx });
    }

    const bodyCount = indexed.filter((e) => e.line.kind !== 'meta').length;
    rows.push({ kind: 'hunk', hunkIndex, header: hunk.header, lineCount: bodyCount });
    if (collapsed.has(hunkIndex)) return;

    const body =
      opts.layout === 'split'
        ? pairSides(indexed, hunkIndex)
        : unifiedRows(indexed, hunkIndex);

    rows.push(...(opts.foldContext ? foldRuns(body, hunkIndex, opts.expandedFolds) : body));
  });

  return { rows, oldText: oldLines.join('\n'), newText: newLines.join('\n'), adds, dels };
}

/** Unified: one row per diff line, in file order. */
function unifiedRows(indexed: Indexed[], hunkIndex: number): DiffRow[] {
  return indexed.map((entry) => {
    if (entry.line.kind === 'meta') {
      return { kind: 'meta', hunkIndex, text: entry.line.text } as DiffRow;
    }
    const side = entry.line.kind === 'add' ? 'new' : 'old';
    const cell = toSide(entry, side);
    return entry.line.kind === 'add'
      ? ({ kind: 'line', hunkIndex, right: cell } as DiffRow)
      : entry.line.kind === 'del'
        ? ({ kind: 'line', hunkIndex, left: cell } as DiffRow)
        : ({ kind: 'line', hunkIndex, left: toSide(entry, 'old'), right: toSide(entry, 'new') } as DiffRow);
  });
}

/**
 * Split: buffer each run of deletions and additions, then flush them paired at
 * the next context line (or the end of the hunk). This is how git's own
 * side-by-side viewers align a change — the Nth deletion lines up with the Nth
 * addition of the same run, which is exactly what a word-level diff then needs.
 */
function pairSides(indexed: Indexed[], hunkIndex: number): DiffRow[] {
  const out: DiffRow[] = [];
  let dels: Indexed[] = [];
  let adds: Indexed[] = [];

  const flush = () => {
    const count = Math.max(dels.length, adds.length);
    for (let i = 0; i < count; i++) {
      out.push({
        kind: 'line',
        hunkIndex,
        left: dels[i] ? toSide(dels[i], 'old') : undefined,
        right: adds[i] ? toSide(adds[i], 'new') : undefined,
      });
    }
    dels = [];
    adds = [];
  };

  for (const entry of indexed) {
    if (entry.line.kind === 'meta') {
      flush();
      out.push({ kind: 'meta', hunkIndex, text: entry.line.text });
    } else if (entry.line.kind === 'del') {
      dels.push(entry);
    } else if (entry.line.kind === 'add') {
      adds.push(entry);
    } else {
      flush();
      out.push({
        kind: 'line',
        hunkIndex,
        left: toSide(entry, 'old'),
        right: toSide(entry, 'new'),
      });
    }
  }
  flush();
  return out;
}

/** True when a row is unchanged context on both sides. */
function isContextRow(row: DiffRow): boolean {
  return (
    row.kind === 'line' &&
    (!row.left || row.left.kind === 'context') &&
    (!row.right || row.right.kind === 'context')
  );
}

/**
 * Collapse runs of unchanged context longer than `contextFoldRun` into a single
 * expander, keeping `contextFoldEdge` lines visible on each side so a change
 * never loses its immediate surroundings.
 */
function foldRuns(rows: DiffRow[], hunkIndex: number, expanded: Set<string>): DiffRow[] {
  const out: DiffRow[] = [];
  let run: DiffRow[] = [];

  const flushRun = () => {
    const edge = DIFF_LIMITS.contextFoldEdge;
    const foldId = `${hunkIndex}:${out.length}`;
    if (run.length <= DIFF_LIMITS.contextFoldRun || expanded.has(foldId)) {
      out.push(...run);
    } else {
      out.push(...run.slice(0, edge));
      out.push({ kind: 'fold', hunkIndex, count: run.length - edge * 2, foldId });
      out.push(...run.slice(run.length - edge));
    }
    run = [];
  };

  for (const row of rows) {
    if (isContextRow(row)) run.push(row);
    else {
      flushRun();
      out.push(row);
    }
  }
  flushRun();
  return out;
}
