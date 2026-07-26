/**
 * The command registry — the single source of truth for invokable actions used
 * by the command palette, keyboard shortcuts, and native menu/tray items.
 *
 * Commands operate on Zustand stores via `getState()` so they can run from
 * anywhere (inside or outside React) without prop drilling.
 */
import type { CommandId, SessionPermissionMode } from '@shared/types';
import { useLayoutStore } from '@/renderer/stores/useLayoutStore';
import { useSessionStore } from '@/renderer/stores/useSessionStore';
import { useUIStore } from '@/renderer/stores/useUIStore';
import { useWorkspaceStore } from '@/renderer/stores/useWorkspaceStore';
import { useAgentStore } from '@/renderer/stores/useAgentStore';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { useFileSystemStore } from '@/renderer/stores/useFileSystemStore';
import { useTerminalStore } from '@/renderer/stores/useTerminalStore';
import { useVoiceStore } from '@/renderer/stores/useVoiceStore';
import { useDocumentStore } from '@/renderer/stores/useDocumentStore';
import { useUpdateStore } from '@/renderer/stores/useUpdateStore';
import { useReleaseStore } from '@/renderer/stores/useReleaseStore';
import { releaseNotesRef } from '@/renderer/features/updates/useReleaseNotes';
import { releaseToMarkdown } from '@/renderer/features/updates/release/toMarkdown';
import { releaseManifestFor } from '@shared/releaseManifest.generated';
import { releaseNotesFor } from '@shared/releaseNotes.generated';

/**
 * Promote the release document for a version. Returns false when there is
 * nothing to open — no session to host the tab, or no version yet (the update
 * store re-stamps `currentVersion` on every status emit, but it is `''` until
 * the first one arrives).
 */
function openRelease(version: string | undefined): boolean {
  const sessionId = useSessionStore.getState().selectedId;
  if (!sessionId || !version) return false;
  useDocumentStore.getState().promote(sessionId, releaseNotesRef(version));
  return true;
}

/**
 * The running version's release as Markdown, preferring the structured manifest
 * (which carries contributors and assets) and falling back to the raw changelog
 * section for a release that predates it.
 */
function currentReleaseMarkdown(): string | null {
  const version = useUpdateStore.getState().status.currentVersion;
  if (!version) return null;
  const manifest = releaseManifestFor(version);
  if (manifest) return releaseToMarkdown(manifest);
  return releaseNotesFor(version)?.markdown ?? null;
}

/** Set the composer's default permission mode (Plan / Ask before edits / Accept edits). */
function setDefaultMode(defaultMode: SessionPermissionMode): void {
  void useSettingsStore.getState().update({ agent: { plan: { defaultMode } } });
}

/**
 * Reindex the active workspace's file tree through the File System Layer. Live
 * progress streams into the Files drawer header; this only kicks it off and
 * surfaces a failure as a toast (success is self-evident from the populated tree).
 */
async function reindexActiveWorkspace(): Promise<void> {
  const id = useWorkspaceStore.getState().activeId;
  if (!id) {
    useUIStore.getState().addToast({ title: 'No active workspace to reindex', tone: 'warning' });
    return;
  }
  try {
    await useFileSystemStore.getState().reindex(id);
  } catch (err) {
    useUIStore.getState().addToast({
      title: 'Reindex failed',
      description: err instanceof Error ? err.message : String(err),
      tone: 'danger',
    });
  }
}

/** Pick a folder and open it as a workspace, surfacing errors as a toast. Creating
 *  a *new* workspace goes through the in-app Create panel instead (no OS dialog). */
async function openWorkspaceFolder(): Promise<void> {
  const store = useWorkspaceStore.getState();
  try {
    const dir = await store.pickDirectory();
    if (!dir) return;
    await store.open(dir);
  } catch (err) {
    useUIStore.getState().addToast({
      title: 'Could not open workspace',
      description: err instanceof Error ? err.message : String(err),
      tone: 'danger',
    });
  }
}

export interface Command {
  id: CommandId;
  title: string;
  /** Section heading in the palette. */
  section: 'Sessions' | 'View' | 'General' | 'Workspace' | 'Agent';
  /** Default keybinding, expressed with `Mod` for Cmd/Ctrl. */
  keys?: string[];
  /** Whether this command should be listed in the palette UI. */
  inPalette?: boolean;
  run: () => void;
}

export const COMMANDS: Command[] = [
  {
    id: 'workspace.open',
    title: 'Open folder as workspace',
    section: 'Workspace',
    keys: ['Mod', 'O'],
    inPalette: true,
    run: () => void openWorkspaceFolder(),
  },
  {
    id: 'workspace.new',
    title: 'Create workspace',
    section: 'Workspace',
    inPalette: true,
    // Open the in-app Create panel rather than firing the native folder dialog.
    run: () => useWorkspaceStore.getState().setLauncherView('create'),
  },
  {
    id: 'session.new',
    title: 'New session',
    section: 'Sessions',
    keys: ['Mod', 'N'],
    inPalette: true,
    run: () => {
      void useSessionStore.getState().createSession();
    },
  },
  {
    id: 'session.newInWorktree',
    title: 'New session in worktree',
    section: 'Sessions',
    keys: ['Mod', 'Shift', 'N'],
    inPalette: true,
    run: () => {
      if (!useSettingsStore.getState().settings.git.worktrees.enabled) {
        useUIStore.getState().addToast({
          title: 'Worktrees are disabled',
          description: 'Enable them under Settings › Git › Worktrees.',
          tone: 'warning',
        });
        return;
      }
      void useSessionStore.getState().createSessionInWorktree();
    },
  },
  {
    id: 'session.duplicate',
    title: 'Duplicate session',
    section: 'Sessions',
    inPalette: true,
    run: () => {
      const id = useSessionStore.getState().selectedId;
      if (id) void useSessionStore.getState().duplicate(id);
    },
  },
  {
    id: 'session.nextTab',
    title: 'Next worktree tab',
    section: 'Sessions',
    keys: ['Ctrl', 'Tab'],
    inPalette: true,
    run: () => {
      void useSessionStore.getState().cycleWorktreeTab(1);
    },
  },
  {
    id: 'session.prevTab',
    title: 'Previous worktree tab',
    section: 'Sessions',
    keys: ['Ctrl', 'Shift', 'Tab'],
    inPalette: true,
    run: () => {
      void useSessionStore.getState().cycleWorktreeTab(-1);
    },
  },
  // Workspace documents. Ctrl+Tab / Ctrl+Shift+Tab already cycle WORKTREE tabs
  // (above), so documents deliberately take Mod+PageDown / Mod+PageUp instead of
  // stealing a binding that already means something else in this window.
  {
    // The equivalent of Claude Code's `/release-notes`: the notes normally
    // appear once after an update, so there has to be a way back to them.
    id: 'updates.releaseNotes',
    title: "What's New in this version",
    section: 'Workspace',
    inPalette: true,
    run: () => openRelease(useUpdateStore.getState().status.currentVersion),
  },
  {
    // The same document, opened straight onto its History section. Separate
    // command rather than an argument because the palette has no argument
    // surface, and "browse past releases" is a different intent from "what did I
    // just get" even though both land on the same tab.
    id: 'updates.releaseHistory',
    title: 'Browse release history',
    section: 'Workspace',
    inPalette: true,
    run: () => {
      const version = useUpdateStore.getState().status.currentVersion;
      if (!openRelease(version)) return;
      const release = useReleaseStore.getState();
      release.setHistoryOpen(version.replace(/^v/, ''), true);
    },
  },
  {
    id: 'updates.copyRelease',
    title: 'Copy release notes as Markdown',
    section: 'Workspace',
    inPalette: true,
    run: () => {
      const markdown = currentReleaseMarkdown();
      if (markdown) void window.limboo?.system?.clipboardWrite(markdown);
    },
  },
  {
    id: 'updates.exportRelease',
    title: 'Export release notes…',
    section: 'Workspace',
    inPalette: true,
    run: () => {
      const version = useUpdateStore.getState().status.currentVersion?.replace(/^v/, '') ?? '';
      const markdown = currentReleaseMarkdown();
      if (!version || !markdown) return;
      // Main owns the save dialog and the path — the renderer supplies content
      // only (the `graph:save` contract).
      void window.limboo?.release?.export(version, markdown);
    },
  },
  {
    id: 'document.next',
    title: 'Next document tab',
    section: 'Workspace',
    keys: ['Mod', 'PageDown'],
    inPalette: true,
    run: () => {
      const sessionId = useSessionStore.getState().selectedId;
      if (sessionId) useDocumentStore.getState().cycle(sessionId, 1);
    },
  },
  {
    id: 'document.prev',
    title: 'Previous document tab',
    section: 'Workspace',
    keys: ['Mod', 'PageUp'],
    inPalette: true,
    run: () => {
      const sessionId = useSessionStore.getState().selectedId;
      if (sessionId) useDocumentStore.getState().cycle(sessionId, -1);
    },
  },
  {
    // Deliberately UNBOUND. The obvious binding (Mod+W) is taken on macOS by the
    // File menu's `role: 'close'` accelerator, and a native menu accelerator wins
    // over a renderer keydown — so binding it here would close the user's WINDOW
    // on macOS while closing a tab everywhere else. The tab's X, middle-click,
    // and the palette all cover this without a platform-dependent surprise.
    id: 'document.close',
    title: 'Close document tab',
    section: 'Workspace',
    inPalette: true,
    run: () => {
      const sessionId = useSessionStore.getState().selectedId;
      if (!sessionId) return;
      const store = useDocumentStore.getState();
      const activeId = store.bySession[sessionId]?.activeId;
      if (activeId) store.close(sessionId, activeId);
    },
  },
  {
    id: 'document.reopenClosed',
    title: 'Reopen closed document',
    section: 'Workspace',
    keys: ['Mod', 'Shift', 'T'],
    inPalette: true,
    run: () => {
      const sessionId = useSessionStore.getState().selectedId;
      if (sessionId) useDocumentStore.getState().reopenClosed(sessionId);
    },
  },
  {
    id: 'diff.toggleSplit',
    title: 'Toggle split / unified diff',
    section: 'Workspace',
    inPalette: true,
    run: () => {
      const sessionId = useSessionStore.getState().selectedId;
      if (!sessionId) return;
      const store = useDocumentStore.getState();
      const activeId = store.bySession[sessionId]?.activeId;
      // Only meaningful while a diff document is in front.
      if (!activeId || store.bySession[sessionId]?.docs[activeId]?.ref.kind !== 'diff') return;
      const current = store.viewFor(activeId);
      store.patchView(activeId, { layout: current.layout === 'split' ? 'unified' : 'split' });
    },
  },
  {
    id: 'agent.newSession',
    title: 'New agent session',
    section: 'Agent',
    inPalette: true,
    run: () => {
      void useSessionStore.getState().createSession();
    },
  },
  {
    id: 'agent.stop',
    title: 'Stop the agent',
    section: 'Agent',
    inPalette: true,
    run: () => {
      const id = useAgentStore.getState().activeSessionId ?? useSessionStore.getState().selectedId;
      if (id) useAgentStore.getState().stop(id);
    },
  },
  {
    id: 'agent.planMode',
    title: 'Switch to Plan mode',
    section: 'Agent',
    inPalette: true,
    run: () => setDefaultMode('plan'),
  },
  {
    id: 'agent.implementMode',
    title: 'Switch to Ask-before-edits mode',
    section: 'Agent',
    inPalette: true,
    run: () => setDefaultMode('default'),
  },
  {
    id: 'plan.approve',
    title: 'Approve plan & execute',
    section: 'Agent',
    inPalette: true,
    run: () => {
      const id = useSessionStore.getState().selectedId;
      if (!id) return;
      const plan = useAgentStore.getState().bySession[id]?.plan;
      if (plan?.status === 'ready') useAgentStore.getState().approvePlan(id);
    },
  },
  {
    id: 'workspace.reindex',
    title: 'Reindex workspace',
    section: 'Workspace',
    inPalette: true,
    run: () => void reindexActiveWorkspace(),
  },
  {
    id: 'worktree.prune',
    title: 'Prune stale worktrees',
    section: 'Workspace',
    inPalette: true,
    run: () => {
      const id = useWorkspaceStore.getState().activeId;
      if (!id) {
        useUIStore.getState().addToast({ title: 'No active workspace', tone: 'warning' });
        return;
      }
      void window.limboo?.worktree
        .prune(id)
        .then((ok) =>
          useUIStore.getState().addToast({
            title: ok ? 'Stale worktrees pruned' : 'Nothing to prune',
            tone: ok ? 'success' : 'info',
          }),
        )
        .catch((err) =>
          useUIStore.getState().addToast({
            title: 'Prune failed',
            description: err instanceof Error ? err.message : String(err),
            tone: 'danger',
          }),
        );
    },
  },
  {
    id: 'sidebar.toggle',
    title: 'Toggle activity drawer',
    section: 'View',
    keys: ['Mod', 'B'],
    inPalette: true,
    run: () => useLayoutStore.getState().toggleDrawer(),
  },
  {
    id: 'terminal.toggle',
    title: 'Toggle terminal',
    section: 'View',
    keys: ['Mod', '`'],
    inPalette: true,
    run: () => useLayoutStore.getState().toggleTerminal(),
  },
  {
    id: 'terminal.new',
    title: 'New terminal',
    section: 'View',
    inPalette: true,
    run: () => {
      const id = useWorkspaceStore.getState().activeId;
      if (!id) {
        useUIStore.getState().addToast({ title: 'No active workspace', tone: 'warning' });
        return;
      }
      useLayoutStore.getState().setTerminalOpen(true);
      void useTerminalStore.getState().create(id);
    },
  },
  {
    id: 'drawer.toggleFiles',
    title: 'Show Files',
    section: 'View',
    inPalette: true,
    run: () => useLayoutStore.getState().toggleTab('files'),
  },
  {
    id: 'drawer.toggleChanges',
    title: 'Show Changes',
    section: 'View',
    inPalette: true,
    run: () => useLayoutStore.getState().toggleTab('changes'),
  },
  {
    id: 'drawer.toggleTasks',
    title: 'Show Tasks',
    section: 'View',
    inPalette: true,
    run: () => useLayoutStore.getState().toggleTab('tasks'),
  },
  {
    id: 'drawer.toggleActivity',
    title: 'Show Activity',
    section: 'View',
    inPalette: true,
    run: () => useLayoutStore.getState().toggleTab('activity'),
  },
  {
    id: 'voice.toggle',
    title: 'Toggle voice input',
    section: 'Agent',
    keys: ['Mod', 'Shift', 'M'],
    inPalette: true,
    run: () => {
      const voice = useVoiceStore.getState();
      const phase = voice.state.phase;
      if (phase === 'listening' || phase === 'recording') {
        void voice.stopVoice();
        return;
      }
      if (phase === 'speaking') {
        void voice.stopSpeaking();
        return;
      }
      const sessionId = useSessionStore.getState().selectedId;
      if (!sessionId) {
        useUIStore.getState().addToast({ title: 'No active session', tone: 'warning' });
        return;
      }
      const mode = useSettingsStore.getState().settings.agent.plan.defaultMode;
      void voice.startVoice(sessionId, mode).catch((err) => {
        useUIStore.getState().addToast({
          title: 'Voice unavailable',
          description: err instanceof Error ? err.message : String(err),
          tone: 'warning',
        });
      });
    },
  },
  {
    id: 'search.open',
    title: 'Search everything',
    section: 'General',
    keys: ['Mod', 'P'],
    inPalette: true,
    run: () => useUIStore.getState().openSearch(),
  },
  {
    id: 'settings.open',
    title: 'Open settings',
    section: 'General',
    keys: ['Mod', ','],
    inPalette: true,
    run: () => useUIStore.getState().openModal('settings'),
  },
  {
    id: 'view.reload',
    title: 'Reload window',
    section: 'General',
    inPalette: true,
    run: () => window.location.reload(),
  },
  {
    id: 'palette.open',
    title: 'Open command palette',
    section: 'General',
    keys: ['Mod', 'K'],
    inPalette: false,
    run: () => useUIStore.getState().openPalette(),
  },
];

const BY_ID = new Map<CommandId, Command>(COMMANDS.map((c) => [c.id, c]));

export function runCommand(id: CommandId): void {
  BY_ID.get(id)?.run();
}

export function paletteCommands(): Command[] {
  return COMMANDS.filter((c) => c.inPalette !== false);
}
