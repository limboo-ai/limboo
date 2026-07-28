/**
 * Workspace document store — what the center column is currently showing.
 *
 * The center column used to render exactly one thing (the conversation). It now
 * hosts a set of *documents*: the conversation plus any number of promoted diff
 * reviews. Documents are scoped per session, so switching worktree tabs swaps
 * the whole document strip — which is what "isolated engineering environment"
 * should mean.
 *
 * The one structural idea worth preserving through any refactor: `viewCache`
 * lives OUTSIDE `bySession` and is keyed by `DocumentId`. Minimizing a document
 * removes its tab but deliberately does NOT touch its cached view state, and the
 * compact preview embedded in the navigator reads and writes that same object.
 * Scroll offset, folds, selected hunk, and comparison mode therefore survive a
 * maximize/minimize round-trip because both renderers share one record — not
 * because anything copies state between them.
 */
import { create } from 'zustand';
import type { PersistedDocument } from '@shared/types';
import { DOCUMENT_LIMITS } from '@shared/constants';
import { debounce } from '@/renderer/lib/debounce';

/** What a document points at. `conversation` is implicit and always present. */
export type DocumentRef =
  | { kind: 'conversation' }
  | { kind: 'diff'; path: string; staged: boolean; baseRef?: string }
  | { kind: 'file'; path: string }
  /**
   * The release notes for one app version. Pathless — unlike every other kind
   * it does not point at a file in the repository, which is why `documentId`
   * and `titleFor` below both need an explicit case for it.
   */
  | { kind: 'release-notes'; version: string }
  /**
   * One delegated subagent, opened full-width to watch its live stream. Pathless
   * like `release-notes` — identity is the spawning `Agent` tool call's id, which
   * is also the key everything else about a worker hangs off.
   */
  | { kind: 'subagent'; callId: string; title: string };

export type DocumentId = string;

/** What the maximized diff is being compared against. */
export type CompareMode =
  | { kind: 'head' }
  | { kind: 'branch'; ref: string }
  | { kind: 'checkpoint'; id: string; commit: string; label: string };

export type ReviewStatus = 'unreviewed' | 'reviewed' | 'flagged';

/**
 * Per-document review state. Everything a minimize -> restore round-trip must
 * not lose. Intentionally NOT persisted across restarts: these describe a diff
 * whose shape may have changed while the app was closed.
 */
export interface DiffViewState {
  layout: 'unified' | 'split';
  /** Indices of collapsed hunks. */
  collapsedHunks: number[];
  /** Collapse long unchanged-context runs. */
  foldContext: boolean;
  /** Keyboard/selection anchor. */
  selectedHunk: number | null;
  compare: CompareMode;
  wordDiff: boolean;
  whitespace: boolean;
  blame: boolean;
  scrollTop: number;
  review: ReviewStatus;
}

export const DEFAULT_VIEW_STATE: DiffViewState = {
  layout: 'unified',
  collapsedHunks: [],
  foldContext: false,
  selectedHunk: null,
  compare: { kind: 'head' },
  wordDiff: true,
  whitespace: false,
  blame: false,
  scrollTop: 0,
  review: 'unreviewed',
};

export interface DocumentEntry {
  id: DocumentId;
  ref: DocumentRef;
  /** Basename, used as the tab label. */
  title: string;
  pinned: boolean;
}

interface SessionDocuments {
  /** Pinned documents first, then unpinned. `CONVERSATION_ID` is always index 0. */
  order: DocumentId[];
  docs: Record<DocumentId, DocumentEntry>;
  activeId: DocumentId;
  /** Reopen stack (most recent last). */
  closed: DocumentRef[];
}

/**
 * Presentation state for a maximized subagent, cached exactly like
 * {@link DiffViewState} so a maximize -> minimize round-trip keeps its place.
 *
 * A SEPARATE map rather than widening `viewCache`: that field is typed
 * `Record<DocumentId, DiffViewState>` and every consumer does
 * `?? DEFAULT_VIEW_STATE`, so a union would break `viewFor`'s return type and
 * each of those call sites. Same key space, same lifetime, same invariant —
 * closing a document never clears it.
 */
export interface SubagentViewState {
  scrollTop: number;
  summaryOpen: boolean;
  transcriptOpen: boolean;
  /** Follow the live stream to the bottom as it grows. */
  autoScroll: boolean;
}

export const DEFAULT_SUBAGENT_VIEW: SubagentViewState = {
  scrollTop: 0,
  summaryOpen: true,
  transcriptOpen: false,
  autoScroll: true,
};

interface DocumentState {
  bySession: Record<string, SessionDocuments>;
  viewCache: Record<DocumentId, DiffViewState>;
  subagentViewCache: Record<DocumentId, SubagentViewState>;

  ensureSession: (sessionId: string) => void;
  /** Open (or focus) a document and make it active. Returns its id. */
  promote: (sessionId: string, ref: DocumentRef) => DocumentId;
  /** Remove the tab but KEEP its view state, so the inline preview continues it. */
  minimize: (sessionId: string, id: DocumentId) => void;
  close: (sessionId: string, id: DocumentId) => void;
  closeOthers: (sessionId: string, id: DocumentId) => void;
  closeAll: (sessionId: string) => void;
  reopenClosed: (sessionId: string) => void;
  activate: (sessionId: string, id: DocumentId) => void;
  cycle: (sessionId: string, delta: number) => void;
  move: (sessionId: string, id: DocumentId, toIndex: number) => void;
  togglePin: (sessionId: string, id: DocumentId) => void;
  /** Drop documents for a session that no longer exists. */
  forgetSession: (sessionId: string) => void;

  viewFor: (id: DocumentId) => DiffViewState;
  patchView: (id: DocumentId, patch: Partial<DiffViewState>) => void;

  subagentViewFor: (id: DocumentId) => SubagentViewState;
  patchSubagentView: (id: DocumentId, patch: Partial<SubagentViewState>) => void;

  seed: (persisted: PersistedDocument[]) => void;
}

export const CONVERSATION_ID: DocumentId = 'conv';

const CONVERSATION_ENTRY: DocumentEntry = {
  id: CONVERSATION_ID,
  ref: { kind: 'conversation' },
  title: 'Conversation',
  pinned: false,
};

/** Stable id for a ref. Diff identity includes the side AND the comparison base. */
export function documentId(ref: DocumentRef): DocumentId {
  if (ref.kind === 'conversation') return CONVERSATION_ID;
  if (ref.kind === 'file') return `file:${ref.path}`;
  // Keyed by version, so notes for two versions are two documents and the tab
  // for a version already read is never reused for a newer one.
  if (ref.kind === 'release-notes') return `release-notes:${ref.version}`;
  // Must precede the diff fallthrough: without a case of its own a subagent ref
  // silently produces a diff-shaped id built from undefined fields.
  if (ref.kind === 'subagent') return `subagent:${ref.callId}`;
  return `diff:${ref.staged ? 's' : 'w'}:${ref.baseRef ?? ''}:${ref.path}`;
}

/** The diff-cache key for a document, shared by every consumer so they can't drift. */
export function diffKey(path: string, staged: boolean, baseRef?: string): string {
  return `${staged ? 's' : 'w'}:${baseRef ?? ''}:${path}`;
}

function basename(p: string): string {
  const segs = p.split('/').filter(Boolean);
  return segs[segs.length - 1] ?? p;
}

function titleFor(ref: DocumentRef): string {
  if (ref.kind === 'conversation') return 'Conversation';
  // Must precede the `basename` call: this ref has no path, and reading one
  // would hand `basename` an undefined and throw while opening the tab.
  // Titled by version, not "What's New": the document is the whole release —
  // notes, contributors, assets, integrity — and its tab carries no icon, so the
  // label is the only identity it has. Two open releases must not read alike.
  if (ref.kind === 'release-notes') return `Release ${ref.version}`;
  // Must precede the basename call for the same reason release-notes does: this
  // ref has no path, and reading one would throw while opening the tab.
  if (ref.kind === 'subagent') return ref.title;
  return basename(ref.path);
}

function emptySession(): SessionDocuments {
  return {
    order: [CONVERSATION_ID],
    docs: { [CONVERSATION_ID]: CONVERSATION_ENTRY },
    activeId: CONVERSATION_ID,
    closed: [],
  };
}

/**
 * Reorder so pinned documents form a contiguous block after the conversation.
 * Applied after every mutation, so a drag can never interleave the two groups.
 */
function normalizeOrder(session: SessionDocuments): DocumentId[] {
  const rest = session.order.filter((id) => id !== CONVERSATION_ID);
  const pinned = rest.filter((id) => session.docs[id]?.pinned);
  const loose = rest.filter((id) => !session.docs[id]?.pinned);
  return [CONVERSATION_ID, ...pinned, ...loose];
}

/** Persist only the tab SET (never view state), debounced like the layout store. */
const persist = debounce((bySession: Record<string, SessionDocuments>) => {
  const documents: PersistedDocument[] = [];
  for (const [sessionId, session] of Object.entries(bySession)) {
    for (const id of session.order) {
      const entry = session.docs[id];
      if (!entry || entry.ref.kind === 'conversation') continue;
      // Release notes are deliberately NOT restored: reopening What's New on
      // every launch is the exact behaviour "dismiss until the next update" is
      // meant to prevent. Skipped explicitly rather than left to be dropped by
      // the pathless-ref filter in SettingsManager, so the intent is in the
      // code instead of being an accident of a downstream guard.
      if (entry.ref.kind === 'release-notes') continue;
      // A subagent tab watches a live run. Restoring one after a restart would
      // reopen a tab onto work that can never resume — and the record it would
      // show already lives in the conversation. Skipped explicitly, like release
      // notes, so the intent is in the code rather than an accident of the
      // pathless-ref guard downstream.
      if (entry.ref.kind === 'subagent') continue;
      if (documents.length >= DOCUMENT_LIMITS.maxPersisted) break;
      documents.push({
        sessionId,
        kind: entry.ref.kind,
        path: entry.ref.path,
        staged: entry.ref.kind === 'diff' ? entry.ref.staged : false,
        ...(entry.ref.kind === 'diff' && entry.ref.baseRef
          ? { baseRef: entry.ref.baseRef }
          : {}),
        pinned: entry.pinned,
      });
    }
  }
  void window.limboo?.settings.set({ layout: { documents } });
}, 300);

export const useDocumentStore = create<DocumentState>((set, get) => {
  /** Apply `fn` to one session, re-normalize its order, and persist. */
  const mutate = (sessionId: string, fn: (session: SessionDocuments) => SessionDocuments) => {
    set((state) => {
      const current = state.bySession[sessionId] ?? emptySession();
      const next = fn({ ...current });
      next.order = normalizeOrder(next);
      // The active document must always exist.
      if (!next.docs[next.activeId]) next.activeId = CONVERSATION_ID;
      const bySession = { ...state.bySession, [sessionId]: next };
      persist(bySession);
      return { bySession };
    });
  };

  return {
    bySession: {},
    viewCache: {},
    subagentViewCache: {},

    ensureSession: (sessionId) => {
      if (get().bySession[sessionId]) return;
      set((state) => ({ bySession: { ...state.bySession, [sessionId]: emptySession() } }));
    },

    promote: (sessionId, ref) => {
      const id = documentId(ref);
      mutate(sessionId, (session) => {
        if (session.docs[id]) return { ...session, activeId: id };
        const docs = { ...session.docs, [id]: { id, ref, title: titleFor(ref), pinned: false } };
        let order = [...session.order, id];
        // Evict the oldest unpinned, non-active document when over the cap.
        if (order.length > DOCUMENT_LIMITS.maxPerSession) {
          const victim = order.find(
            (candidate) =>
              candidate !== CONVERSATION_ID && candidate !== id && !docs[candidate]?.pinned,
          );
          if (victim) {
            order = order.filter((candidate) => candidate !== victim);
            delete docs[victim];
          }
        }
        return { ...session, docs, order, activeId: id };
      });
      return id;
    },

    // Minimize and close differ only in intent, never in the view cache: NEITHER
    // clears it. Reopening a closed document therefore also resumes where it was.
    minimize: (sessionId, id) => get().close(sessionId, id),

    close: (sessionId, id) => {
      if (id === CONVERSATION_ID) return;
      mutate(sessionId, (session) => {
        const entry = session.docs[id];
        if (!entry) return session;
        const order = session.order.filter((candidate) => candidate !== id);
        const docs = { ...session.docs };
        delete docs[id];
        // Focus the neighbour that took this document's slot, like an editor does.
        const wasActive = session.activeId === id;
        const index = session.order.indexOf(id);
        const activeId = wasActive
          ? (order[Math.min(index, order.length - 1)] ?? CONVERSATION_ID)
          : session.activeId;
        const closed = [...session.closed, entry.ref].slice(-DOCUMENT_LIMITS.reopenMax);
        return { ...session, order, docs, activeId, closed };
      });
    },

    closeOthers: (sessionId, id) => {
      const session = get().bySession[sessionId];
      if (!session) return;
      for (const candidate of [...session.order]) {
        if (candidate !== id && candidate !== CONVERSATION_ID && !session.docs[candidate]?.pinned) {
          get().close(sessionId, candidate);
        }
      }
      get().activate(sessionId, id);
    },

    closeAll: (sessionId) => {
      const session = get().bySession[sessionId];
      if (!session) return;
      for (const candidate of [...session.order]) {
        if (candidate !== CONVERSATION_ID) get().close(sessionId, candidate);
      }
    },

    reopenClosed: (sessionId) => {
      const session = get().bySession[sessionId];
      const ref = session?.closed[session.closed.length - 1];
      if (!ref) return;
      mutate(sessionId, (s) => ({ ...s, closed: s.closed.slice(0, -1) }));
      get().promote(sessionId, ref);
    },

    activate: (sessionId, id) => {
      mutate(sessionId, (session) =>
        session.docs[id] ? { ...session, activeId: id } : session,
      );
    },

    cycle: (sessionId, delta) => {
      const session = get().bySession[sessionId];
      if (!session || session.order.length < 2) return;
      const index = session.order.indexOf(session.activeId);
      const next = (index + delta + session.order.length) % session.order.length;
      get().activate(sessionId, session.order[next]);
    },

    move: (sessionId, id, toIndex) => {
      if (id === CONVERSATION_ID) return;
      mutate(sessionId, (session) => {
        const order = session.order.filter((candidate) => candidate !== id);
        // Never before the conversation, never past the end.
        const clamped = Math.max(1, Math.min(toIndex, order.length));
        order.splice(clamped, 0, id);
        return { ...session, order };
      });
    },

    togglePin: (sessionId, id) => {
      if (id === CONVERSATION_ID) return;
      mutate(sessionId, (session) => {
        const entry = session.docs[id];
        if (!entry) return session;
        return {
          ...session,
          docs: { ...session.docs, [id]: { ...entry, pinned: !entry.pinned } },
        };
      });
    },

    forgetSession: (sessionId) => {
      set((state) => {
        if (!state.bySession[sessionId]) return state;
        const bySession = { ...state.bySession };
        delete bySession[sessionId];
        persist(bySession);
        return { bySession };
      });
    },

    viewFor: (id) => get().viewCache[id] ?? DEFAULT_VIEW_STATE,

    subagentViewFor: (id) => get().subagentViewCache[id] ?? DEFAULT_SUBAGENT_VIEW,

    patchSubagentView: (id, patch) =>
      set((state) => ({
        subagentViewCache: {
          ...state.subagentViewCache,
          [id]: { ...(state.subagentViewCache[id] ?? DEFAULT_SUBAGENT_VIEW), ...patch },
        },
      })),

    patchView: (id, patch) =>
      set((state) => ({
        viewCache: {
          ...state.viewCache,
          [id]: { ...(state.viewCache[id] ?? DEFAULT_VIEW_STATE), ...patch },
        },
      })),

    seed: (persisted) => {
      const bySession: Record<string, SessionDocuments> = {};
      for (const doc of persisted) {
        const ref: DocumentRef =
          doc.kind === 'file'
            ? { kind: 'file', path: doc.path }
            : {
                kind: 'diff',
                path: doc.path,
                staged: doc.staged,
                ...(doc.baseRef ? { baseRef: doc.baseRef } : {}),
              };
        const id = documentId(ref);
        const session = (bySession[doc.sessionId] ??= emptySession());
        if (session.docs[id]) continue;
        session.docs[id] = { id, ref, title: titleFor(ref), pinned: doc.pinned };
        session.order.push(id);
      }
      for (const session of Object.values(bySession)) {
        session.order = normalizeOrder(session);
      }
      // Restored tabs open on the conversation — the user chose that document
      // last session, not this one.
      set({ bySession });
    },
  };
});
