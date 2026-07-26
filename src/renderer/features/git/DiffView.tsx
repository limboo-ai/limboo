/**
 * Compact inline diff preview for a single file — the expansion inside a
 * changed-file row in the navigator.
 *
 * This is a thin wrapper over the shared {@link DiffEditor} rather than a second
 * renderer. Sharing one implementation is what makes maximize -> minimize
 * lossless: the compact preview and the maximized review workspace read and
 * write the SAME `DiffViewState` record in the document store, so folds, layout,
 * and scroll offset continue across the transition instead of being copied.
 *
 * Highlighting is deliberately OFF here (`highlight={false}`): the preview keeps
 * the synchronous cost profile it always had inside scrolling lists, and only
 * the maximized workspace pays for the async Shiki pass.
 */
import type { GitFileDiff } from '@shared/types';
import { DiffEditor, DiffPlaceholder } from './diff/DiffEditor';
import {
  DEFAULT_VIEW_STATE,
  useDocumentStore,
  type DocumentId,
} from '@/renderer/stores/useDocumentStore';

export function DiffView({
  diff,
  loading,
  /** Document id whose view state this preview continues (set when promotable). */
  documentId,
}: {
  diff?: GitFileDiff | null;
  loading?: boolean;
  documentId?: DocumentId;
}) {
  const view = useDocumentStore((s) =>
    documentId ? (s.viewCache[documentId] ?? DEFAULT_VIEW_STATE) : DEFAULT_VIEW_STATE,
  );
  const patchView = useDocumentStore((s) => s.patchView);

  const placeholder = DiffPlaceholder({ diff, loading });
  if (placeholder) return placeholder;
  if (!diff) return null;

  return (
    <div className="flex max-h-96 flex-col">
      <DiffEditor
        diff={diff}
        layout={view.layout}
        foldContext={view.foldContext}
        collapsedHunks={view.collapsedHunks}
        wordLevel={view.wordDiff}
        showWhitespace={view.whitespace}
        highlight={false}
        scrollTop={view.scrollTop}
        onScrollTopChange={
          documentId ? (top) => patchView(documentId, { scrollTop: top }) : undefined
        }
        onToggleHunk={
          documentId
            ? (hunkIndex) => {
                const next = view.collapsedHunks.includes(hunkIndex)
                  ? view.collapsedHunks.filter((h) => h !== hunkIndex)
                  : [...view.collapsedHunks, hunkIndex];
                patchView(documentId, { collapsedHunks: next });
              }
            : undefined
        }
      />
      {diff.truncated && (
        <p className="shrink-0 px-3 py-2 text-[11px] italic text-faint">
          Diff truncated — file is very large.
        </p>
      )}
    </div>
  );
}
