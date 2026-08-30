/**
 * Workspace switcher in the title bar. Shows the active workspace (name +
 * branch) and, on click, a dropdown to switch to another registered workspace,
 * open/create one, or remove one. Replaces the old static session context pill.
 *
 * NO ICON BADGE ON THE TRIGGER. The title bar shows the workspace NAME; the
 * initials chip in front of it said the same thing twice in less legible form.
 * `WorkspaceIconBadge` still earns its place in the launcher and the remove
 * dialog, where a workspace has to be picked out of a set at a glance.
 *
 * Removal lives here because it lived ONLY in `WorkspaceLauncher`, which renders
 * only while no workspace is active — so once you opened one, there was no route
 * to removing any workspace at all.
 */
import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Boxes,
  Check,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useWorkspaceStore } from '@/renderer/stores/useWorkspaceStore';
import { useUIStore } from '@/renderer/stores/useUIStore';
import { IconButton } from '@/renderer/components/ui';
import { WorkspaceRemoveDialog } from './WorkspaceRemoveDialog';
import type { Workspace } from '@shared/types';

export function WorkspaceSwitcher() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeId = useWorkspaceStore((s) => s.activeId);
  const switchTo = useWorkspaceStore((s) => s.switchTo);
  const pickDirectory = useWorkspaceStore((s) => s.pickDirectory);
  const open = useWorkspaceStore((s) => s.open);
  const setLauncherView = useWorkspaceStore((s) => s.setLauncherView);
  const rescan = useWorkspaceStore((s) => s.rescan);
  const addToast = useUIStore((s) => s.addToast);

  const active = workspaces.find((w) => w.id === activeId) ?? null;
  const [openMenu, setOpenMenu] = useState(false);
  // Held ABOVE the `openMenu` conditional on purpose: the menu unmounts as soon
  // as it closes, and the dialog has to outlive it.
  const [pendingRemove, setPendingRemove] = useState<Workspace | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenMenu(false);
    };
    // Escape closes the menu, matching SessionRowMenu — a menu you can only
    // dismiss with the mouse is not dismissable from the keyboard at all.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  const requestRemove = (ws: Workspace) => {
    setOpenMenu(false);
    setPendingRemove(ws);
  };

  const pickAnd = async (action: (path: string) => Promise<Workspace | null>) => {
    setOpenMenu(false);
    try {
      const dir = await pickDirectory();
      if (!dir) return;
      await action(dir);
    } catch (err) {
      addToast({
        title: 'Could not open workspace',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      });
    }
  };

  const runRescan = async (ws: Workspace) => {
    setOpenMenu(false);
    try {
      await rescan(ws.id);
      addToast({ title: `Rescanned ${ws.name}`, tone: 'info' });
    } catch (err) {
      addToast({
        title: 'Could not rescan workspace',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      });
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpenMenu((v) => !v)}
        className="no-drag ml-1 flex items-center gap-2 rounded-md px-2 py-1 text-[11px] text-muted transition-colors hover:text-fg"
      >
        {active ? (
          <>
            <span className="max-w-[12rem] truncate font-medium text-fg">{active.name}</span>
            {active.metadata.branch && (
              <>
                <span className="text-faint">/</span>
                <GitBranch size={11} />
                <span>{active.metadata.branch}</span>
              </>
            )}
          </>
        ) : (
          <span className="text-faint">No workspace</span>
        )}
        <ChevronDown size={12} className="text-faint" />
      </button>

      {openMenu && (
        // `no-drag` is REQUIRED: `-webkit-app-region` is inherited, so without it
        // every item in this menu inherits the title bar's `drag` region and the
        // OS swallows the clicks (the menu opens but nothing inside it responds).
        <div className="no-drag animate-pop-in absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-line-strong bg-elevated p-1.5 shadow-2xl">
          {workspaces.length > 0 ? (
            <ul className="max-h-72 overflow-y-auto">
              {workspaces.map((ws) => (
                // A row, not a button: the switch target and the remove control
                // are siblings, because a <button> inside a <button> is invalid
                // HTML and the nested one never receives the click.
                <li
                  key={ws.id}
                  className="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-surface-2"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(false);
                      if (ws.id !== activeId) void switchTo(ws.id);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-muted transition-colors hover:text-fg"
                  >
                    <span className="min-w-0 flex-1 truncate text-fg">{ws.name}</span>
                    {ws.id === activeId && <Check size={13} className="text-accent" />}
                  </button>
                  {/* Revealed by hover AND focus — a control reachable only by
                      mouse is not reachable. */}
                  <IconButton
                    size="sm"
                    label={`Remove ${ws.name} from Limboo`}
                    className="opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                    onClick={() => requestRemove(ws)}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-2 px-2 py-3 text-[12px] text-faint">
              <Boxes size={14} />
              No workspaces yet
            </div>
          )}

          <div className="my-1 border-t border-line" />
          {active && (
            <button
              type="button"
              onClick={() => void runRescan(active)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <RefreshCw size={14} />
              Rescan {active.name}
            </button>
          )}
          <button
            type="button"
            onClick={() => pickAnd(open)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <FolderOpen size={14} />
            Open folder…
          </button>
          <button
            type="button"
            onClick={() => {
              setOpenMenu(false);
              setLauncherView('create');
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12px] text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <FolderPlus size={14} />
            Create workspace…
          </button>
          {active && (
            <>
              <div className="my-1 border-t border-line" />
              {/* The keyboard route to the same action as the per-row trash. */}
              <button
                type="button"
                onClick={() => requestRemove(active)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12px] text-danger transition-colors hover:bg-surface-2"
              >
                <Trash2 size={14} />
                Remove {active.name}…
              </button>
            </>
          )}
        </div>
      )}

      {pendingRemove && (
        <WorkspaceRemoveDialog
          workspace={pendingRemove}
          onClose={() => setPendingRemove(null)}
        />
      )}
    </div>
  );
}
