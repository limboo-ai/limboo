/**
 * Safe-delete confirmation for removing a workspace from Limboo. Removing a
 * workspace only detaches it from the app (registration + cached metadata,
 * statistics, index, and workspace-scoped sessions/memories/checkpoints). The
 * project directory on disk is NEVER touched — permanently deleting project
 * files is a deliberate, separate action and is intentionally not offered here.
 *
 * Matches the app modal idiom (centered overlay, `bg-elevated`, pop-in). Dark
 * only — no theme toggle, no gradients.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { Workspace } from '@shared/types';
import { WorkspaceIconBadge } from './WorkspaceIconBadge';
import { useWorkspaceStore } from '@/renderer/stores/useWorkspaceStore';
import { useUIStore } from '@/renderer/stores/useUIStore';

export function WorkspaceRemoveDialog({
  workspace,
  onClose,
}: {
  workspace: Workspace;
  onClose: () => void;
}) {
  const remove = useWorkspaceStore((s) => s.remove);
  const addToast = useUIStore((s) => s.addToast);
  // Removal is genuinely slow now: it tears down each session's worktree,
  // services and PTYs before touching the database. Without a pending state the
  // dialog looks frozen and invites a second click on a destructive action.
  const [removing, setRemoving] = useState(false);

  // Close on Escape for keyboard parity with the rest of the app — but not
  // mid-removal, when there is nothing to cancel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !removing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, removing]);

  const confirm = async () => {
    if (removing) return;
    setRemoving(true);
    try {
      await remove(workspace.id);
      onClose();
    } catch (err) {
      setRemoving(false);
      addToast({
        title: 'Could not remove workspace',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      });
    }
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onMouseDown={() => {
        if (!removing) onClose();
      }}
    >
      <div
        className="animate-pop-in flex w-full max-w-md flex-col overflow-hidden rounded-md border border-line-strong bg-elevated shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-fg">
            <AlertTriangle size={14} className="text-warning" />
            Remove workspace
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3 rounded-md border border-line bg-surface-2 px-3 py-2.5">
            <WorkspaceIconBadge icon={workspace.icon} size={32} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-medium text-fg">{workspace.name}</span>
              <span className="truncate text-[11px] text-faint">{workspace.path}</span>
            </div>
          </div>

          <p className="text-[12px] leading-relaxed text-muted">
            This removes the workspace from Limboo only — its registration, cached metadata,
            statistics, index, and any sessions, memories, and checkpoints scoped to it.
          </p>
          <p className="rounded-md border border-line bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-fg">
            Your files are safe. The project folder on disk is <span className="font-semibold">not</span> deleted —
            you can re-open it any time.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={removing}
            className="rounded-md border border-line bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-fg transition-colors hover:border-line-strong disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={removing}
            className="rounded-md bg-danger px-3 py-1.5 text-[12px] font-semibold text-base transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {removing ? 'Removing…' : 'Remove from Limboo'}
          </button>
        </div>
      </div>
    </div>
  );
}
