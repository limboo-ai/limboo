/**
 * The application shell — a floating app shell in two visual layers:
 *
 *   TitleBar                                                    ← root background
 *   [SessionsSidebar]│┌─────────────────────────────────────┐ [ActivityRail]
 *      (root bg)     ││ CenterWorkspace │ Terminal │ Drawer │    (root bg)
 *                    │└─────────────────────────────────────┘
 *                     ghost       floating card (bg-surface, 6px radius)
 *
 * The title bar, sessions sidebar, and activity icon rail sit directly on the
 * pure-black root background (persistent/architectural UI). The center
 * workspace, the terminal column, and the right drawer float together as one
 * detached card — bg-surface, border-line, rounded 6px — framed by an 8px side
 * gutter and a 16px bottom gutter so it never touches the window edges.
 *
 * The Composer lives only inside the center column. The integrated terminal is
 * its own full-height column INSIDE the card (so it inherits the card's
 * rounding and `overflow-hidden`, and carries no border of its own) — it is not
 * a drawer tab. It sits between the conversation and the drawer, so the drawer
 * stays adjacent to the activity rail that controls it. Panel widths, the open
 * drawer tab, and whether the terminal column is open all come from the layout
 * store (persisted).
 */
import { TitleBar } from '@/renderer/components/layout/TitleBar';
import { ResizeHandle } from '@/renderer/components/ui';
import { SessionsSidebar, CollapsedSessionsRail } from '@/renderer/features/sessions/SessionsSidebar';
import { CenterWorkspace } from '@/renderer/features/workspace/CenterWorkspace';
import { ActivityRail } from '@/renderer/features/activity/ActivityRail';
import { ActivityDrawer } from '@/renderer/features/activity/ActivityDrawer';
import { TerminalPanel } from '@/renderer/features/terminal/TerminalPanel';
import { useResizable } from '@/renderer/hooks/useResizable';
import { useLayoutStore } from '@/renderer/stores/useLayoutStore';

/**
 * Hard ceiling on the terminal column as a fraction of the window, applied at
 * render time only. On a narrow window a legitimately-persisted width could
 * otherwise crowd the conversation out entirely — but clamping the STORED value
 * would silently rewrite the user's intent, so this stays presentational.
 */
const TERMINAL_MAX_FRACTION = 0.45;

export function AppShell() {
  const leftWidth = useLayoutStore((s) => s.leftWidth);
  const rightWidth = useLayoutStore((s) => s.rightWidth);
  const terminalOpen = useLayoutStore((s) => s.terminalOpen);
  const terminalWidth = useLayoutStore((s) => s.terminalWidth);
  const gitWidth = useLayoutStore((s) => s.gitWidth);
  const graphWidth = useLayoutStore((s) => s.graphWidth);
  const activeTab = useLayoutStore((s) => s.activeTab);
  const sessionsCollapsed = useLayoutStore((s) => s.sessionsCollapsed);
  const setLeftWidth = useLayoutStore((s) => s.setLeftWidth);

  // The git and work-graph tabs each use their own (wider) remembered width;
  // every other tab uses the shared right-drawer width.
  const drawerWidth =
    activeTab === 'git' ? gitWidth : activeTab === 'graph' ? graphWidth : rightWidth;

  const left = useResizable({
    edge: 'left',
    getWidth: () => useLayoutStore.getState().leftWidth,
    setWidth: setLeftWidth,
  });
  // `edge: 'right'` because the terminal is RIGHT-anchored: it sits between the
  // conversation and the drawer, and the handle is on its LEFT, so the border
  // that moves is its left one. The hook names the anchored side and inverts the
  // delta for `'right'` (`startWidth - delta`), which is what makes dragging
  // left widen the column. `edge: 'left'` here would resize backwards.
  const term = useResizable({
    edge: 'right',
    getWidth: () => useLayoutStore.getState().terminalWidth,
    setWidth: (w) => useLayoutStore.getState().setTerminalWidth(w),
  });
  const right = useResizable({
    edge: 'right',
    getWidth: () => {
      const s = useLayoutStore.getState();
      if (s.activeTab === 'git') return s.gitWidth;
      if (s.activeTab === 'graph') return s.graphWidth;
      return s.rightWidth;
    },
    setWidth: (w) => {
      const s = useLayoutStore.getState();
      if (s.activeTab === 'git') s.setGitWidth(w);
      else if (s.activeTab === 'graph') s.setGraphWidth(w);
      else s.setRightWidth(w);
    },
  });

  return (
    <div className="flex h-full w-full flex-col bg-base text-fg">
      <TitleBar />
      <div className="flex min-h-0 flex-1 px-2 pb-4 pt-1">
        {sessionsCollapsed ? (
          <div className="mr-2 shrink-0">
            <CollapsedSessionsRail />
          </div>
        ) : (
          <>
            <div style={{ width: leftWidth }} className="shrink-0">
              <SessionsSidebar />
            </div>
            {/* The 8px gutter between sidebar and card IS the grab area. */}
            <ResizeHandle ghost onMouseDown={left.startDrag} />
          </>
        )}

        {/* Floating workspace card — terminal + center column + drawer share one surface. */}
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-md border border-line bg-surface">
          <div className="min-w-0 flex-1">
            <CenterWorkspace />
          </div>

          {terminalOpen && (
            <>
              <ResizeHandle onMouseDown={term.startDrag} />
              <div
                style={{ width: Math.min(terminalWidth, window.innerWidth * TERMINAL_MAX_FRACTION) }}
                className="shrink-0"
              >
                <TerminalPanel />
              </div>
            </>
          )}

          {activeTab && (
            <>
              <ResizeHandle onMouseDown={right.startDrag} />
              <div style={{ width: drawerWidth }} className="shrink-0">
                <ActivityDrawer tab={activeTab} />
              </div>
            </>
          )}
        </div>

        <div className="ml-2 shrink-0">
          <ActivityRail />
        </div>
      </div>
    </div>
  );
}
