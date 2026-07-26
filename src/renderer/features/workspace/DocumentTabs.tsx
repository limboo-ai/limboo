/**
 * Center-column document tabs — the conversation plus any promoted diff reviews.
 *
 * Deliberately a SEPARATE strip from `WorktreeTabs` rather than an extension of
 * it. A worktree tab answers "which isolated environment am I in"; a document tab
 * answers "what am I looking at inside it". Closing one means discarding nothing;
 * closing the other would mean leaving a checkout. Same pixel size, same gesture,
 * radically different consequence — so they stay visually stacked but distinct.
 *
 * Renders null while the conversation is the only document, so a workspace that
 * never opens a diff keeps exactly the layout it had before this existed.
 *
 * The active tab is marked by its SEAT and its TYPOGRAPHY — `bg-surface-2` plus a
 * `font-semibold` label — never by an accent underline. A 2px accent bar under a
 * tab that already sits on a raised plate says the same thing twice, and on pure
 * black it reads as a second element rather than an emphasis of the first. This
 * matches the activity rail and the settings navigation, which dropped their own
 * filled/accented state plates for the same reason.
 */
import { useState } from 'react';
import { MessageSquare, Pin, X } from 'lucide-react';
import { cn } from '@/renderer/lib/cn';
import { getFileIcon } from '@/renderer/lib/fileIcons';
import {
  CONVERSATION_ID,
  useDocumentStore,
  type DocumentEntry,
} from '@/renderer/stores/useDocumentStore';

export function DocumentTabs({ sessionId }: { sessionId: string }) {
  const session = useDocumentStore((s) => s.bySession[sessionId]);
  const activate = useDocumentStore((s) => s.activate);
  const close = useDocumentStore((s) => s.close);
  const togglePin = useDocumentStore((s) => s.togglePin);
  const move = useDocumentStore((s) => s.move);
  const [dragId, setDragId] = useState<string | null>(null);

  // Only the conversation is open — stay invisible.
  if (!session || session.order.length < 2) return null;

  return (
    <div
      role="tablist"
      aria-label="Workspace documents"
      className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-line bg-surface"
      onDragOver={(e) => {
        if (dragId) e.preventDefault();
      }}
    >
      {session.order.map((id, index) => {
        const entry = session.docs[id];
        if (!entry) return null;
        return (
          <DocumentTab
            key={id}
            entry={entry}
            active={id === session.activeId}
            dragging={dragId === id}
            onSelect={() => activate(sessionId, id)}
            onClose={id === CONVERSATION_ID ? undefined : () => close(sessionId, id)}
            onTogglePin={id === CONVERSATION_ID ? undefined : () => togglePin(sessionId, id)}
            onDragStart={() => setDragId(id)}
            onDragEnd={() => setDragId(null)}
            onDropBefore={(after) => {
              if (dragId && dragId !== id) move(sessionId, dragId, index + (after ? 1 : 0));
              setDragId(null);
            }}
          />
        );
      })}
    </div>
  );
}

function DocumentTab({
  entry,
  active,
  dragging,
  onSelect,
  onClose,
  onTogglePin,
  onDragStart,
  onDragEnd,
  onDropBefore,
}: {
  entry: DocumentEntry;
  active: boolean;
  dragging: boolean;
  onSelect: () => void;
  onClose?: () => void;
  onTogglePin?: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropBefore: (after: boolean) => void;
}) {
  const isConversation = entry.ref.kind === 'conversation';
  const isReleaseNotes = entry.ref.kind === 'release-notes';
  // The file's own icon, not a generic diff glyph — a diff tab should read as
  // the same kind of object as every other editor tab.
  const spec = isConversation || isReleaseNotes ? null : getFileIcon(entry.title);
  // A release is not a file and not a conversation, and there is no glyph that
  // says "release" without inventing one — so the tab is its label. Everything
  // else in the strip names an object you could point at on disk; this one
  // names a version, and the version IS the identity.
  const Icon = isReleaseNotes ? null : (spec?.icon ?? MessageSquare);
  const path =
    entry.ref.kind === 'conversation' || entry.ref.kind === 'release-notes'
      ? undefined
      : entry.ref.path;
  const staged = entry.ref.kind === 'diff' && entry.ref.staged;
  const baseRef = entry.ref.kind === 'diff' ? entry.ref.baseRef : undefined;

  const title = [
    path ?? (isReleaseNotes ? entry.title : 'Conversation'),
    staged ? 'staged' : undefined,
    baseRef ? `vs ${baseRef}` : undefined,
  ]
    .filter(Boolean)
    .join(' — ');

  return (
    <div
      role="tab"
      tabIndex={0}
      aria-selected={active}
      title={title}
      draggable={!isConversation}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        onDropBefore(e.clientX > box.left + box.width / 2);
      }}
      onClick={onSelect}
      onAuxClick={(e) => {
        // Middle-click closes, like every editor.
        if (e.button === 1 && onClose) {
          e.preventDefault();
          onClose();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'group relative flex max-w-56 shrink-0 cursor-pointer items-center gap-1.5 border-r border-line px-3 text-[12px] transition-colors',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent',
        active ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
        dragging && 'opacity-50',
      )}
    >
      {Icon && <Icon size={12} className={cn('shrink-0', spec?.className ?? 'text-faint')} />}
      {/* A pinned tab keeps its label — these are file names, and an icon-only
          pinned tab would be ambiguous across same-language files.
          Two weight steps, two meanings: `font-medium` is pinned, `font-semibold`
          is active. They stack, and neither is the other's signal. */}
      <span className={cn('truncate', entry.pinned && 'font-medium', active && 'font-semibold')}>
        {entry.title}
      </span>
      {staged && (
        <span className="shrink-0 text-[10px] text-faint" title="Staged side">
          S
        </span>
      )}
      {baseRef && (
        <span className="shrink-0 truncate text-[10px] text-faint" title={`Compared with ${baseRef}`}>
          {baseRef}
        </span>
      )}
      {onTogglePin && (
        <button
          type="button"
          aria-label={entry.pinned ? `Unpin ${entry.title}` : `Pin ${entry.title}`}
          title={entry.pinned ? 'Unpin' : 'Pin'}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          className={cn(
            'shrink-0 rounded p-0.5 transition-colors hover:bg-surface-2 hover:text-fg',
            entry.pinned ? 'text-accent' : 'text-faint opacity-0 group-hover:opacity-100',
          )}
        >
          <Pin size={11} />
        </button>
      )}
      {onClose && (
        <button
          type="button"
          aria-label={`Close ${entry.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="ml-0.5 shrink-0 rounded p-0.5 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
