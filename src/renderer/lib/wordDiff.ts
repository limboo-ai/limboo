/**
 * Word-level intra-line diff for the review editor. When a diff row pairs one
 * deleted line with one added line, highlighting only the words that actually
 * moved is far more readable than tinting both whole lines.
 *
 * Pure, synchronous, dependency-free, and renderer-local: it operates on text
 * the diff already delivered, so it never touches IPC.
 */
import { DIFF_LIMITS } from '@shared/constants';

/** A run of characters, flagged as changed or unchanged. */
export interface WordSpan {
  text: string;
  changed: boolean;
}

export interface WordDiffResult {
  left: WordSpan[];
  right: WordSpan[];
}

/**
 * Split into diff-able units: whitespace runs, word runs, and single punctuation
 * characters. Keeping whitespace as its own token means re-indentation shows up
 * as one changed token instead of shifting every word after it.
 */
const TOKEN_RE = /\s+|[A-Za-z0-9_$]+|[^\s\w$]/g;

function tokenize(line: string): string[] {
  return line.match(TOKEN_RE) ?? [];
}

/** Collapse adjacent spans of the same flag so the DOM stays small. */
function coalesce(spans: WordSpan[]): WordSpan[] {
  const out: WordSpan[] = [];
  for (const span of spans) {
    if (span.text === '') continue;
    const prev = out[out.length - 1];
    if (prev && prev.changed === span.changed) prev.text += span.text;
    else out.push({ ...span });
  }
  return out;
}

/** The whole line changed — the fallback shape used by every bail-out path. */
function whole(a: string, b: string): WordDiffResult {
  return {
    left: a ? [{ text: a, changed: true }] : [],
    right: b ? [{ text: b, changed: true }] : [],
  };
}

/**
 * Diff two single lines at word granularity.
 *
 * Falls back to "the whole line changed" when either side exceeds
 * `DIFF_LIMITS.wordDiffMaxTokens`: the LCS table below is O(n·m), and a minified
 * bundle line can carry tens of thousands of tokens — computing that on the main
 * thread would freeze the window for seconds. Degrading to the previous
 * whole-line tint is invisible enough to be the right trade.
 */
export function wordDiff(a: string, b: string): WordDiffResult {
  if (a === b) {
    return {
      left: a ? [{ text: a, changed: false }] : [],
      right: b ? [{ text: b, changed: false }] : [],
    };
  }

  const left = tokenize(a);
  const right = tokenize(b);
  const max = DIFF_LIMITS.wordDiffMaxTokens;
  if (left.length > max || right.length > max) return whole(a, b);
  if (left.length === 0 || right.length === 0) return whole(a, b);

  // Classic LCS table over tokens.
  const n = left.length;
  const m = right.length;
  const lcs = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[at(i, j)] =
        left[i] === right[j]
          ? lcs[at(i + 1, j + 1)] + 1
          : Math.max(lcs[at(i + 1, j)], lcs[at(i, j + 1)]);
    }
  }

  const leftSpans: WordSpan[] = [];
  const rightSpans: WordSpan[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      leftSpans.push({ text: left[i], changed: false });
      rightSpans.push({ text: right[j], changed: false });
      i++;
      j++;
    } else if (lcs[at(i + 1, j)] >= lcs[at(i, j + 1)]) {
      leftSpans.push({ text: left[i], changed: true });
      i++;
    } else {
      rightSpans.push({ text: right[j], changed: true });
      j++;
    }
  }
  while (i < n) leftSpans.push({ text: left[i++], changed: true });
  while (j < m) rightSpans.push({ text: right[j++], changed: true });

  return { left: coalesce(leftSpans), right: coalesce(rightSpans) };
}
