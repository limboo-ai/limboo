/**
 * Confirmation for a conversation revert.
 *
 * Reverting is close enough to irreversible that it never happens on a single
 * icon click: this dialog states, verbatim and measured, exactly what will be
 * restored, deleted and dropped before anything is touched. The numbers come
 * from `agent:revertPreview`, which reads the same rows the revert will act on
 * and mutates nothing — an estimate would be worse than no dialog, because it
 * would look authoritative.
 *
 * When the preview reports `blocked` (a live run, a missing message, no
 * checkpoint guarding the turn) the dialog explains why and offers no confirm
 * button at all. Approximating an anchor "close enough" to the turn would let a
 * revert restore state the user never saw.
 *
 * Matches the app modal idiom (`HooksConfirmDialog`), theme tokens only.
 */
import { useEffect, useState } from 'react';
import { History, TriangleAlert, X } from 'lucide-react';
import type { ChatMessage, ConversationRevertPreview } from '@shared/types';
import { HelixLoader } from '@/renderer/components/ui';
import { useAgentStore } from '@/renderer/stores/useAgentStore';

export function RevertDialog({
  sessionId,
  message,
  onClose,
}: {
  sessionId: string;
  message: ChatMessage;
  onClose: () => void;
}) {
  const revertPreview = useAgentStore((s) => s.revertPreview);
  const revertToMessage = useAgentStore((s) => s.revertToMessage);
  const [preview, setPreview] = useState<ConversationRevertPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void revertPreview(sessionId, message.id).then((p) => {
      if (!alive) return;
      setPreview(p);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [revertPreview, sessionId, message.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !working) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, working]);

  const blocked = preview?.blocked ?? (loading ? undefined : 'Revert is unavailable right now.');
  const canRevert = !loading && !!preview?.checkpoint && !preview.blocked;

  const confirm = async () => {
    setWorking(true);
    const ok = await revertToMessage(sessionId, message.id);
    setWorking(false);
    if (ok) onClose();
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onMouseDown={() => !working && onClose()}
    >
      <div
        className="animate-pop-in flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-md border border-line-strong bg-elevated shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-fg">
            <History size={14} className="text-warning" />
            Revert to before this turn?
          </span>
          <button
            type="button"
            aria-label="Close"
            disabled={working}
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-4">
          <div className="rounded-md border border-line bg-surface-2 px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
              The turn
            </span>
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] leading-relaxed text-fg">
              {message.text.slice(0, 400) || '(no text)'}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-[12px] text-muted">
              <HelixLoader size={14} label="Measuring" />
              Measuring what would change…
            </div>
          ) : canRevert && preview ? (
            <>
              <dl className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-2 px-3 py-2.5 text-[12px]">
                <Row label="Checkpoint" value={preview.checkpoint?.label ?? '—'} />
                <Row label="Files restored" value={String(preview.filesReverted)} />
                <Row label="Files removed" value={String(preview.filesRemoved)} />
                <Row label="Messages dropped" value={String(preview.messagesDropped)} />
                <Row label="Timeline entries dropped" value={String(preview.activityDropped)} />
                <Row
                  label="Agent conversation"
                  value={preview.resetsProviderSession ? 'Reset — the next prompt starts fresh' : 'Unchanged'}
                />
              </dl>
              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-warning">
                <TriangleAlert size={12} className="mt-0.5 shrink-0" />
                Files the agent created after the checkpoint are deleted, and edited files return to
                their earlier contents. Only this session&apos;s worktree is affected. A safety
                checkpoint of the current state is taken first, and the revert is recorded in the
                timeline — nothing is erased from the audit trail.
              </p>
            </>
          ) : (
            <p className="flex items-start gap-2 rounded-md border border-line bg-surface-2 px-3 py-2.5 text-[12px] leading-relaxed text-muted">
              <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warning" />
              {blocked}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            disabled={working}
            onClick={onClose}
            className="rounded-md border border-line bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-fg transition-colors hover:border-line-strong disabled:opacity-40"
          >
            Cancel
          </button>
          {canRevert && (
            <button
              type="button"
              disabled={working}
              onClick={() => void confirm()}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-base transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {working && <HelixLoader size={12} invert label="Reverting" />}
              {working ? 'Reverting…' : 'Revert'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-faint">{label}</dt>
      <dd className="min-w-0 truncate text-right text-fg" title={value}>
        {value}
      </dd>
    </div>
  );
}
