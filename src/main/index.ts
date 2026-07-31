/**
 * Main process entry point.
 *
 * Owns the application lifecycle and constructs the long-lived managers that
 * make up the Desktop Foundation: settings, window-state, native menu, tray,
 * and notifications. All OS access lives here or in a manager; the renderer only
 * ever asks through IPC.
 */
import { app, BrowserWindow, nativeTheme, session } from 'electron';
import started from 'electron-squirrel-startup';
import path from 'node:path';

import { installGlobalErrorHandlers, logger } from './logger';
import { createMainWindow, getMainWindow } from './window/createWindow';
import { WindowStateManager } from './window/windowState';
import { SettingsManager } from './managers/SettingsManager';
import { NotificationManager } from './managers/NotificationManager';
import { AppMenuManager } from './managers/AppMenuManager';
import { TrayManager } from './managers/TrayManager';
import { WorkspaceManager } from './managers/WorkspaceManager';
import { SessionManager } from './managers/SessionManager';
import { AgentManager } from './managers/AgentManager';
import { FileSystemManager } from './managers/FileSystemManager';
import { TerminalManager } from './managers/TerminalManager';
import { GitManager } from './managers/GitManager';
import { WorktreeManager } from './managers/worktree/WorktreeManager';
import { ServiceManager } from './managers/services/ServiceManager';
import { ProxyServer } from './managers/services/ProxyServer';
import { MemoryManager } from './managers/memory/MemoryManager';
import { SearchManager } from './managers/search/SearchManager';
import { ResumeManager } from './managers/resume/ResumeManager';
import { HookEngine } from './managers/hooks/HookEngine';
import { GhManager } from './managers/gh/GhManager';
import { AutoUpdateManager, isQuittingForUpdate } from './managers/AutoUpdateManager';
import { VoiceManager } from './managers/voice/VoiceManager';
import { VoiceModelManager } from './managers/voice/VoiceModelManager';
import { AttachmentManager } from './managers/attachments/AttachmentManager';
import { SecretStore } from './secrets/SecretStore';
import { CursorAuthManager } from './managers/cursor/CursorAuthManager';
import { CursorRuntime } from './managers/cursor/CursorRuntime';
import { McpManager } from './managers/mcp/McpManager';
import { WorkGraphManager } from './managers/graph/WorkGraphManager';
import { RuntimeTelemetryManager } from './managers/telemetry/RuntimeTelemetryManager';
import { setMcpObserver } from './managers/graph/instrument';
import { configureCursorExec } from './managers/cursor/exec';
import { registerCursorModels } from '@shared/constants';
import { getDb, closeDb } from './db/database';
import { registerAllIpc } from './ipc';

// Injected by Electron Forge's Vite plugin as a compile-time global (NOT an env
// var): the renderer dev-server URL in dev, `undefined` in a packaged build.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// One stable Windows identity for the taskbar, notifications, and the installer
// (must match electron-builder.yml `appId`). Harmless on other platforms.
app.setAppUserModelId('dev.limboo.app');

installGlobalErrorHandlers();

// On many Linux GPU/driver combos (notably failing VAAPI init), Electron's GPU
// compositor paints an all-black window even though the renderer loaded fine —
// the app "opens but shows nothing". Disabling hardware acceleration forces
// software compositing, which renders reliably. Must run before `app` is ready.
if (process.platform === 'linux') {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

// Pure-black, dark-mode ONLY. Force the native theme to dark so OS-level chrome
// (window background, native dialogs, menus) matches the renderer.
nativeTheme.themeSource = 'dark';

// Single-instance: focus the existing window instead of launching a second app.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  bootstrap();
}

function bootstrap(): void {
  // Long-lived managers. Created lazily inside `whenReady` where `app` paths are
  // guaranteed to resolve.
  let settings: SettingsManager;
  let notifications: NotificationManager;
  let workspace: WorkspaceManager;
  let sessions: SessionManager;
  let agent: AgentManager;
  let fileSystem: FileSystemManager;
  let terminal: TerminalManager;
  let git: GitManager;
  let worktrees: WorktreeManager;
  let services: ServiceManager;
  let proxy: ProxyServer;
  let memory: MemoryManager;
  let attachments: AttachmentManager;
  let search: SearchManager;
  let resume: ResumeManager;
  let gh: GhManager;
  let hooks: HookEngine;
  let updates: AutoUpdateManager;
  let voiceModels: VoiceModelManager;
  let voice: VoiceManager;
  let cursorAuth: CursorAuthManager;
  let cursorRuntime: CursorRuntime;
  let mcp: McpManager;
  let workGraph: WorkGraphManager;
  let runtime: RuntimeTelemetryManager;
  let memorySweepTimer: ReturnType<typeof setInterval> | undefined;
  let graphSweepTimer: ReturnType<typeof setInterval> | undefined;
  let runtimeSweepTimer: ReturnType<typeof setInterval> | undefined;
  const windowState = new WindowStateManager();
  const appMenu = new AppMenuManager();
  const tray = new TrayManager();

  /**
   * True from the moment the app has committed to shutting down. The window's
   * `close` handler consults it so an intentional quit is never mistaken for a
   * "hide to tray" close. Set in `before-quit` — which Electron emits BEFORE it
   * starts closing windows — so every quit route inherits it: the native menu's
   * `role: 'quit'`, the tray's Quit item, Cmd/Ctrl+Q, an OS session logout, and
   * the updater's `app.quit()` after a successful install.
   */
  let isQuitting = false;

  /** Quit for real, announcing it first so `close` handlers stand aside. */
  const requestQuit = (): void => {
    isQuitting = true;
    app.quit();
  };

  app.on('second-instance', () => {
    // During an update handoff the "second instance" IS the new version starting
    // up while we tear down. Focusing our soon-to-die window would steal it back.
    if (isQuittingForUpdate()) return;
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    settings = new SettingsManager();
    notifications = new NotificationManager(settings);
    // Open the local database before any manager that reads from it.
    getDb();
    workspace = new WorkspaceManager();
    sessions = new SessionManager();
    agent = new AgentManager(workspace, settings, notifications);
    // Cursor provider (Agent Adapter Architecture). Auth: API keys live
    // safeStorage-encrypted in the SecretStore; probing is lazy and classifies
    // per the user's `agent.cursor.preferredAuth` setting. Runtime: print-mode
    // child processes whose env is composed at spawn time from the auth layer.
    cursorAuth = new CursorAuthManager(new SecretStore(), settings);
    cursorRuntime = new CursorRuntime(cursorAuth);
    fileSystem = new FileSystemManager(workspace);
    terminal = new TerminalManager(workspace, settings);
    git = new GitManager(workspace, settings);
    // Git worktrees — first-class session isolation. The WorktreeManager is the
    // single resolver of a session's effective execution root; agent / terminal /
    // git / file-watcher / search all consult it instead of deriving paths.
    worktrees = new WorktreeManager(workspace, sessions, settings);
    worktrees.setTerminalManager(terminal);
    // Scripts & Services — supervised per-session processes from limboo.json.
    // Stopped before any worktree removal (open handles = EBUSY on Windows).
    services = new ServiceManager(sessions, settings);
    services.setTerminalManager(terminal);
    services.setConfigSource(worktrees);
    worktrees.setServiceManager(services);
    // Loopback-only *.localhost reverse proxy (off by default; Settings › Git).
    proxy = new ProxyServer(services, settings);
    proxy.sync();
    settings.onChange(() => proxy.sync());
    // The Local Memory System — a platform service owned by the app, not the
    // agent. Seeds default memories on first run and injects relevant knowledge
    // into prompts before they reach the harness.
    memory = new MemoryManager(settings);
    memory.seedDefaults(null); // global / user-scope starters
    // The Attachment Manager — session-owned files staged for the agent's tool
    // loop. Sweeps orphaned staging dirs shortly after boot (off the hot path).
    attachments = new AttachmentManager(sessions, settings);
    void attachments.sweepOrphans().catch((err) => logger.warn('attachment sweep failed', err));
    // The Search Engine — a platform service owned by the app. Maintains the local
    // file/symbol index and federates every other subsystem behind one query
    // interface; also the primary context provider for the coding agent.
    search = new SearchManager(settings, workspace);
    // The Resume Pipeline — repository revalidation when a session is activated.
    // Anchors each session's repo state (snapshot), detects divergence on
    // activation, and hands the agent a one-shot repository delta. A platform
    // service like Memory/Search; never blocks session switching.
    resume = new ResumeManager(workspace, sessions, settings);
    // The Provider-Neutral Hook Engine — the governance/audit layer between every
    // provider and every subsystem. Providers emit normalized lifecycle events
    // onto it; it persists a redacted audit trail and broadcasts to the Hooks
    // panel. It holds no policy (enforcement stays in AgentManager's gate).
    hooks = new HookEngine(settings);
    // The OPTIONAL GitHub CLI integration. `gh` is detected, never required:
    // when it is absent or logged out the GitHub surface hides itself and
    // nothing else changes. Limboo stores no GitHub credential — auth belongs
    // entirely to the CLI (see managers/gh/exec.ts).
    gh = new GhManager(workspace, settings);
    // In-app updater (electron-updater + GitHub releases). No-op in dev / non-AppImage.
    updates = new AutoUpdateManager(settings, notifications);
    // The MCP platform — a provider-independent Model Context Protocol registry
    // owned by the app. Both agents CONSUME it (Claude via options.mcpServers,
    // Cursor via generated .cursor/mcp.json); it owns discovery, secrets,
    // health probes, and permission trust. Its own SecretStore instance (the
    // store is stateless — filesystem-backed) keeps MCP secrets namespaced.
    mcp = new McpManager(new SecretStore(), settings, workspace);
    // A run's MCP scope comes from ITS session's workspace, not from whichever
    // workspace happens to be active — otherwise switching projects mid-run
    // silently changes which servers the permission gate can see.
    mcp.setSessionManager(sessions);
    // The Work Graph — a provider-neutral platform service owned by the app,
    // peer to Memory / Search / Resume. It normalizes BOTH adapters' event
    // streams into one typed, queryable DAG of the work itself. Purely
    // additive: it only observes, so no existing wiring path changes.
    workGraph = new WorkGraphManager(settings, sessions);
    // Runtime Telemetry — the fifth peer of Memory / Search / Resume / Work
    // Graph. It normalizes BOTH adapters' runtime measurements into one
    // provider-independent model, so the inspector shows whatever the running
    // provider actually reports and omits what it does not. Purely additive:
    // like the Work Graph it only observes, and every ingestion path swallows.
    runtime = new RuntimeTelemetryManager(settings, sessions);
    // The Limboo-owned half of a snapshot. Plain getters rather than manager
    // injections — this needs one fact from each subsystem, and the worktree
    // path is deliberately relativized here so an absolute $HOME path can never
    // reach a snapshot or an export.
    runtime.setHostSources({
      attachmentCount: (sessionId) => attachments.list(sessionId).length,
      mcpCounts: () => {
        const servers = mcp.list();
        return {
          connected: servers.filter((s) => s.runtime?.status === 'connected').length,
          total: servers.length,
        };
      },
      indexStatus: () => search.getStatus(workspace.getActive()?.id ?? null),
      worktree: (sessionId) => {
        const session = sessions.get(sessionId);
        if (!session?.worktreePath || !session.worktreeBranch) return null;
        // NEVER let an absolute path reach a snapshot. Relativizing against the
        // workspace is only valid when the worktree is INSIDE it — and the
        // default worktree root is `{userData}/worktrees`, which never is, so
        // `path.relative` yields a `../../…` walk right back out to $HOME. With
        // no workspace at all the old fallback handed over the absolute path
        // outright. Both collapse to the leaf name, which is all the UI shows.
        const root = workspace.getActive()?.path;
        const rel = root ? path.relative(root, session.worktreePath) : '..';
        const contained = rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
        return {
          branch: session.worktreeBranch,
          path: contained ? rel : path.basename(session.worktreePath),
        };
      },
      providerSessionId: (sessionId, provider) =>
        agent.providerSessionIdFor(sessionId, provider),
    });
    runtime.setNotifications(notifications);
    // The Work Graph's statistics view and its telemetry-annotated exports join
    // against these rollups by run id. One-directional: the graph may read
    // telemetry, telemetry never reads the graph.
    workGraph.setTelemetrySource({ rollupsFor: (id) => runtime.rollupsFor(id) });
    // The character tallies behind the context split. AgentManager measures the
    // blocks it composed; this carries what it merely observed (tool results).
    agent.setTelemetryCharSink((sessionId, kind, chars) =>
      runtime.addObservedChars(sessionId, kind, chars),
    );
    // The agent mirrors its shell commands into the integrated terminal.
    agent.setTerminalManager(terminal);
    // The agent auto-titles untitled sessions from their first prompt.
    agent.setSessionManager(sessions);
    // The agent drives checkpoints + live git refresh through the Git Manager.
    agent.setGitManager(git);
    // Optional: when `gh` is missing the PR/issue tools just do not appear.
    agent.setGhManager(gh);
    // The agent retrieves + injects relevant memories; the git engine proposes
    // new memories from commits. Both treat memory as an optional collaborator.
    agent.setMemoryManager(memory);
    git.setMemoryManager(memory);
    // The agent consumes attachments: manifest + staging-dir read access per
    // prompt, vision blocks for images, and read-status tracking on tool use.
    agent.setAttachmentManager(attachments);
    // The Search Engine federates memory / git / sessions at query time, powers the
    // Global Search UI, and feeds ranked context into the agent prompt.
    search.setMemoryManager(memory);
    search.setGitManager(git);
    search.setSessionManager(sessions);
    agent.setSearchManager(search);
    // The agent consumes the pending repository delta (one-shot per divergence)
    // and re-anchors the snapshot at the end of every run; checkpoints re-anchor
    // too. Revalidation results land in the session timeline via recordStatus.
    agent.setResumeManager(resume);
    git.setResumeManager(resume);
    // Both providers consume the same MCP registry: Claude via options.mcpServers
    // (+ trusted allow inside decideToolUse), Cursor via the generated
    // .cursor/mcp.json (+ Mcp() allow rules). One registry, no drift.
    agent.setMcpManager(mcp);
    // The agent + git engine emit normalized lifecycle/checkpoint events onto the
    // Hook Engine so both providers produce one identical governance audit trail.
    // Additive: existing hot-path wiring (auto-checkpoint, mirror, reindex) stays.
    agent.setHookEngine(hooks);
    git.setHookEngine(hooks);
    // The Work Graph observes every platform service so a session's execution
    // structure is complete regardless of which subsystem did the work. Every
    // one of these is a NARROW structural type and every call site is
    // optional-chained, so the graph is purely additive: removing it would not
    // change any subsystem's behavior.
    git.setWorkGraph(workGraph.gitSink());
    memory.setWorkGraph(workGraph.memorySink());
    fileSystem.setWorkGraph(workGraph.fsSink());
    services.setWorkGraph(workGraph.serviceSink());
    // Permission decisions are the one signal the public event stream cannot
    // carry: the gate computes the answer internally and only its effect is
    // observable. Wired to the decision core BOTH providers call, so approvals
    // stay provider-neutral by construction.
    agent.setWorkGraph(workGraph.permissionSink());
    worktrees.setWorkGraph(workGraph.worktreeSink());
    resume.setWorkGraph(workGraph.resumeSink());
    attachments.setWorkGraph(workGraph.attachmentSink());
    workGraph.setGitManager(git);
    // Inference inputs: the Search Engine's REAL import graph, and the repo's
    // own declared scripts (a stronger "this command verifies" signal than any
    // builtin pattern). Both optional — without them the inference is skipped
    // rather than guessed.
    workGraph.setSearchManager(search);
    workGraph.setScriptSource(services);
    // Real PTYs (user / hook / service) carry genuine exit codes, unlike agent
    // commands — fired alongside the existing per-caller onExit, never instead.
    terminal.onLifecycle((ev) => workGraph.terminalSink().onLifecycle(ev));
    // A real bus consumer: the Hook Engine dispatches to whichever service
    // registers interest (not just the audit sink). Here, session-lifecycle
    // bookends surface in the unified session timeline via recordStatus — the
    // markers it otherwise lacks (the prompt/start is already recorded by send).
    // recordStatus is redacted + ACTIVITY_LIMITS-bounded; a throwing subscriber
    // is swallowed per-observer inside HookEngine.record.
    hooks.subscribe((event) => {
      if (event.phase === 'run-finished') {
        agent.recordStatus(event.sessionId, 'Run finished');
      } else if (event.phase === 'session-end') {
        agent.recordStatus(event.sessionId, 'Session ended');
      }
    });
    resume.setSearchManager(search);
    resume.setMemoryManager(memory);
    resume.setStatusRecorder((sessionId, label, detail) =>
      agent.recordStatus(sessionId, label, detail),
    );
    // The injected delta block carries the session's outstanding plan items.
    resume.setPlanItemsProvider((sessionId) => agent.unfinishedPlanItems(sessionId));
    // The File System Layer pushes live git status (branch + diff) into sessions
    // and notifies the Git workspace whenever the working tree changes.
    fileSystem.setSessionManager(sessions);
    fileSystem.setGitManager(git);
    // The File System Layer drives incremental search reindexing on tree changes.
    fileSystem.setSearchManager(search);
    // Worktree-backed sessions: every subsystem resolves the session's isolated
    // checkout through the WorktreeManager (agent cwd, terminal cwd, git root,
    // search scope). The resolvers are cheap, synchronous DB lookups.
    agent.setSessionRootResolver((sessionId) => worktrees.resolveSessionRoot(sessionId));
    // Cursor runs: the runtime + auth gate, plus the repo-trust resolver that
    // decides `--trust` — trusted when the repo has no limboo.json (nothing
    // repo-authored to distrust) or the user acked its hash (the existing
    // HooksConfirmDialog gate). Never passed blindly.
    agent.setCursorRuntime(cursorRuntime);
    agent.setCursorAuth(cursorAuth);
    agent.setRepoTrustResolver((sessionId) => {
      const state = worktrees.getRepoConfigState(sessionId);
      return !state.config || state.acked;
    });
    // Cursor executable override + persisted model routing, applied before
    // agent.start() so the first probe/send already sees them. The settings
    // listener re-probes when the user changes the override path.
    configureCursorExec({ executablePath: settings.getAll().agent.cursor.executablePath });
    registerCursorModels(settings.getAll().agent.cursor.discoveredModels);
    settings.onChange((next) => {
      if (configureCursorExec({ executablePath: next.agent.cursor.executablePath })) {
        void cursorAuth.probe(true);
      }
    });
    terminal.setSessionRootResolver((sessionId) => worktrees.resolveSessionRoot(sessionId));
    resume.setSessionRootResolver((sessionId) => worktrees.resolveSessionRoot(sessionId));
    // Git operations become structured entries in the active session's
    // conversation stream. GitManager is reached only from the renderer, so
    // everything it records here is user-initiated; the agent's own git is
    // `Bash("git …")`, which already renders as a tool row.
    git.setActivityRecorder({
      activeSessionFor: (workspaceId) => {
        const active = sessions.getActive();
        return active && active.workspaceId === workspaceId ? active.id : null;
      },
      recordGit: (sessionId, payload) => agent.recordGitActivity(sessionId, payload),
    });
    git.setActiveRootResolver((workspaceId) => worktrees.resolveActiveRoot(workspaceId));
    // `gh` infers the repository from its cwd, so a worktree-backed session must
    // be read against its own checkout — the same seam GitManager uses.
    gh.setActiveRootResolver((workspaceId) => worktrees.resolveActiveRoot(workspaceId));
    search.setActiveRootResolver((workspaceId) => worktrees.resolveActiveRoot(workspaceId));
    // The Voice subsystem — local speech (sherpa-onnx) as another input/output
    // modality of the SAME agent session. The model store owns downloads; the
    // manager orchestrates capture/TTS and taps the agent event stream.
    voiceModels = new VoiceModelManager();
    voice = new VoiceManager(settings, agent, voiceModels);
    // Spoken desktop notifications (gated by voice.playbackEvents.notifications).
    notifications.setSpeaker((text) => voice.speakNotification(text));

    hardenSession();
    registerAllIpc({
      settings,
      notifications,
      workspace,
      session: sessions,
      agent,
      fs: fileSystem,
      terminal,
      git,
      worktree: worktrees,
      services,
      memory,
      attachments,
      search,
      resume,
      gh,
      updates,
      voice,
      voiceModels,
      cursorAuth,
      mcp,
      graph: workGraph,
      runtime,
    });
    // Begin capability supervision (probe + heartbeat) once IPC is wired.
    agent.start();
    // Begin MCP health probes + heartbeat once IPC is wired.
    mcp.start();
    // Subscribe the Work Graph to the agent's normalized event stream. This is
    // the ONLY load-bearing source: it is ungated and provider-neutral, and
    // AgentManager swallows listener throws, so the graph can never break a run.
    // (The Hook Engine bus is enrichment only — it is gated on
    // `agent.hookEngine.enabled`, so a graph depending on it would go blank
    // whenever a user turns hooks off.)
    workGraph.start(agent);
    // Subscribe Runtime Telemetry to the provider streams. Same argument as the
    // Work Graph: AgentManager is the one place both adapters converge, and it
    // swallows sink throws, so telemetry can never break a run.
    runtime.start(agent);
    // Observe Limboo's OWN MCP tools. Both providers call the same PlainTool
    // handlers, so this one hook covers the SDK in-process servers (Claude) and
    // the stdio bridge dispatcher (Cursor). Enrichment only — these calls
    // already arrive as tool events, so this adds real durations, not nodes.
    setMcpObserver(workGraph.mcpObserver());
    // Wire the voice agent-event tap + honor the auto-download preference.
    voice.start();
    // Begin the auto-update check + hourly poll (packaged builds only).
    updates.start();

    // File System Layer: watch + index the *effective root* — the workspace
    // path, or the active session's worktree checkout when it owns one — and
    // follow every active-workspace AND active-session change. The retarget is
    // guarded by the last effective root so unrelated session broadcasts (and
    // switches between plain sessions) never churn the watcher or the index.
    let lastEffectiveRoot: string | null = null;
    const retargetEffectiveRoot = (): void => {
      const ws = workspace.getActive();
      if (!ws) {
        lastEffectiveRoot = null;
        void fileSystem.stopWatching();
        return;
      }
      const active = sessions.getActive();
      const root = worktrees.resolveActiveRoot(ws.id) ?? ws.path;
      const owner =
        active && active.workspaceId === ws.id && active.worktreePath && root !== ws.path
          ? active.id
          : null;
      fileSystem.setActiveTarget(ws, root, owner);
      if (root !== lastEffectiveRoot) {
        lastEffectiveRoot = root;
        git.invalidate(ws.id);
        gh.invalidate();
        void search.indexWorkspace(ws.id).catch((err) => logger.warn('search index failed', err));
        // Recovery/activation: start the session's autoStart services (only
        // when the workspace already acknowledged the repo's limboo.json).
        if (owner) services.autoStartForSession(owner);
      }
    };
    workspace.onActiveChanged((ws) => {
      retargetEffectiveRoot();
      if (ws) memory.seedDefaults(ws.id);
      // Re-scope the MCP registry to the new workspace and, on first activation,
      // discover servers already configured in that repo's provider config files
      // (read-only import; new servers land disabled for the user to review).
      if (ws) mcp.importActive();
      mcp.refresh();
    });
    // Session switches (and worktree create/remove/missing on the active
    // session) retarget the same way — the SessionManager only emits when the
    // active session's execution root could actually differ.
    sessions.onActiveChanged(() => retargetEffectiveRoot());
    // Resume Pipeline: a SEPARATE, additive listener — anchor the session being
    // left, revalidate the one being entered. Fire-and-forget; the retarget
    // path above is untouched and never waits on git.
    sessions.onActiveChanged((active) => resume.onActiveSessionChanged(active));
    // Before a worktree directory is removed, fully release the watcher handles
    // inside it (Windows EBUSY) — the post-removal broadcast retargets afresh.
    worktrees.setReleaseRootHook(async () => {
      lastEffectiveRoot = null;
      await fileSystem.stopWatching();
    });

    const initialWs = workspace.getActive();
    // Boot-time worktree recovery (repair/prune + flag missing directories)
    // runs before the first retarget so a vanished worktree never gets watched.
    void worktrees
      .recover()
      .catch((err) => logger.warn('worktree recovery failed', err))
      .finally(() => {
        retargetEffectiveRoot();
        // Boot-time revalidation of the session that comes back active — only
        // after worktree recovery settled so a repaired/missing worktree never
        // produces a bogus delta. Async, best-effort, never awaited.
        resume.onBoot();
      });
    if (initialWs) memory.seedDefaults(initialWs.id);

    // Low-frequency memory maintenance (decay/flag stale entries). Off the hot
    // path; runs hourly and once shortly after boot.
    memory.sweep();
    memorySweepTimer = setInterval(() => memory.sweep(), 60 * 60 * 1000);
    // The Work Graph's age sweep rides the same low-frequency tick.
    workGraph.sweep();
    graphSweepTimer = setInterval(() => workGraph.sweep(), 60 * 60 * 1000);
    // Age-sweep the telemetry time series on the same hourly maintenance tick.
    runtimeSweepTimer = setInterval(() => runtime.sweep(), 60 * 60 * 1000);

    appMenu.install();

    /**
     * Focus the main window, recreating it if it is gone. Shared by the tray and
     * by macOS `activate` so "Show Limboo" can never be a silent no-op.
     */
    const showOrCreateWindow = (): void => {
      const existing = getMainWindow();
      if (existing) {
        if (existing.isMinimized()) existing.restore();
        existing.show();
        existing.focus();
        return;
      }
      const created = createMainWindow(windowState);
      appMenu.attachContextMenu(created);
      attachCloseToTray(created);
    };

    /**
     * Tell the user where the window went, once per launch. A window that
     * disappears with no trace is indistinguishable from a crash — and on Linux
     * desktops the tray icon is often tucked inside an overflow menu.
     *
     * Deliberately in-memory rather than persisted: a per-launch reminder needs
     * no `SETTINGS_VERSION` bump and no migration.
     */
    let trayHintShown = false;
    const announceTrayOnce = (): void => {
      if (trayHintShown) return;
      trayHintShown = true;
      notifications.notify({
        title: 'Limboo is still running',
        body: 'The window was hidden to the system tray. Open it again from the tray icon.',
      });
    };

    /**
     * Make `settings.behavior.minimizeToTray` real.
     *
     * The setting has shipped since Phase 1 with no main-process consumer at all:
     * the only `close` listener was WindowStateManager's geometry capture, which
     * cannot veto, so closing the window always destroyed it →
     * `window-all-closed` → `app.quit()` → `tray.destroy()`. The tray icon
     * vanished because the whole app had quit.
     *
     * The `tray.isActive()` guard is not defensive noise. Swallowing the close on
     * a desktop where the tray never appeared would leave Limboo running with no
     * window and no icon — unreachable and unquittable. Quitting is the correct
     * behaviour there, whatever the setting says.
     */
    const attachCloseToTray = (target: BrowserWindow): void => {
      target.on('close', (event) => {
        if (isQuitting) return;
        if (!settings.getAll().behavior.minimizeToTray) return;
        if (!tray.isActive()) return;
        event.preventDefault();
        target.hide();
        tray.refresh();
        announceTrayOnce();
      });
    };

    const win = createMainWindow(windowState);
    appMenu.attachContextMenu(win);
    // The tray must exist before the close handler can consult isActive().
    tray.init({ showWindow: showOrCreateWindow, quit: requestQuit });
    attachCloseToTray(win);

    logger.info('Limboo main process ready');

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) showOrCreateWindow();
    });
  });

  app.on('window-all-closed', () => {
    // Not reached while a window is merely hidden — hiding does not close it.
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // Teardown. Every disposer is isolated: an exception thrown here used to abort
  // the rest of the handler AND get swallowed by the global uncaughtException
  // handler, so the process stayed alive with half its resources released — which
  // is exactly how "Restart & install" ended up quitting nothing at all.
  app.on('before-quit', () => {
    // FIRST, ahead of every disposer: the window's close handler reads this to
    // tell an intentional quit from a hide-to-tray close, and Electron closes
    // windows only after this handler returns.
    isQuitting = true;
    safeDispose('agent', () => agent?.cleanup());
    safeDispose('cursorRuntime', () => cursorRuntime?.dispose());
    safeDispose('cursorAuth', () => cursorAuth?.dispose());
    safeDispose('mcp', () => mcp?.dispose());
    safeDispose('fileSystem', () => void fileSystem?.dispose());
    safeDispose('proxy', () => proxy?.stop());
    safeDispose('services', () => services?.dispose());
    safeDispose('terminal', () => terminal?.dispose());
    safeDispose('updates', () => updates?.dispose());
    safeDispose('voice', () => voice?.dispose());
    safeDispose('voiceModels', () => voiceModels?.dispose());
    safeDispose('memorySweep', () => {
      if (memorySweepTimer) clearInterval(memorySweepTimer);
    });
    safeDispose('workGraph', () => {
      setMcpObserver(null);
      workGraph?.dispose();
    });
    safeDispose('runtime', () => {
      runtime?.dispose();
    });
    safeDispose('runtimeSweep', () => {
      if (runtimeSweepTimer) clearInterval(runtimeSweepTimer);
    });
    safeDispose('graphSweep', () => {
      if (graphSweepTimer) clearInterval(graphSweepTimer);
    });
    safeDispose('tray', () => tray.destroy());
    safeDispose('db', () => closeDb());
  });
}

/**
 * Run one teardown step, containing any failure to that step. Quitting must be
 * unstoppable: a manager that throws on shutdown is a bug to log, never a reason
 * to leave the other managers holding their resources.
 */
function safeDispose(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    logger.error(`before-quit: ${label} disposer failed`, err);
  }
}

/**
 * Lock the renderer down with a Content-Security-Policy and deny-by-default
 * permission handlers. In dev the CSP must allow the Vite dev server (inline
 * styles + websocket HMR); production is strict.
 */
function hardenSession(): void {
  // Detect dev via the injected global (the env-var form is never set, so the
  // old check silently fell through to the STRICT policy in dev — which blocks
  // Vite's inline React-Refresh preamble and leaves the window blank). Fall back
  // to `!app.isPackaged` for safety.
  const devUrl =
    typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined'
      ? MAIN_WINDOW_VITE_DEV_SERVER_URL
      : undefined;
  const isDev = !!devUrl || !app.isPackaged;
  // Google Fonts is the ONE remote origin the renderer may load from — the
  // stylesheet from fonts.googleapis.com (style-src) and the woff2 files from
  // fonts.gstatic.com (font-src) power the user-selectable chat font. Nothing
  // else is opened: connect/script/img stay locked down.
  const policy = isDev
    ? "default-src 'self' 'unsafe-inline' data: blob:; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' data: https://fonts.gstatic.com; " +
      "worker-src 'self' blob:; " +
      "connect-src 'self' ws: http: https:; img-src 'self' data: blob:;"
    : "default-src 'self'; " +
      // blob: on script-src is what actually permits the voice capture
      // AudioWorklet: Chromium checks worklet module loads against
      // script-src-elem, which falls back to script-src. The worklet source is
      // inlined (see capture.ts) and loaded from a same-origin Blob URL; page/
      // script loading otherwise stays locked to 'self'. worker-src is kept as
      // defensive, spec-compliant coverage.
      "script-src 'self' blob:; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "worker-src 'self' blob:; " +
      // media-src is defensive: voice playback uses Web Audio AudioBuffers (no
      // <audio> element), but a blob-backed fallback must never be CSP-broken.
      "img-src 'self' data:; media-src 'self' blob:; connect-src 'self';";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });

  // Deny every web-platform permission with ONE narrow exception: the Voice
  // subsystem needs the microphone, so `media` is granted only when ALL hold —
  //   1. the request comes from our own renderer origin (dev server / file://),
  //   2. it comes from the main window's webContents (never a webview/popup;
  //      those are already blocked in createWindow.ts, this is defense in depth),
  //   3. it asks for AUDIO only — any request including video is refused.
  // Camera, geolocation, USB, notifications-via-web, etc. all stay denied.
  // (OS notifications go through the NotificationManager, not this API.)
  const isOwnOrigin = (origin: string | undefined): boolean => {
    // Dev: the renderer is served from the Vite dev-server origin. Normalize
    // BOTH sides through `URL` before comparing — Electron 42 hands the check
    // handler the origin as `http://localhost:5173/` (with a trailing slash),
    // while `new URL(devUrl).origin` yields `http://localhost:5173` (no slash),
    // so a strict `===` silently denied the mic in dev. Parsing both to their
    // canonical `.origin` makes the trailing-slash (and any other serialization)
    // form match, and keeps this consistent with the request handler below.
    if (devUrl) {
      if (!origin) return false;
      if (origin.startsWith('file:')) return true;
      try {
        return new URL(origin).origin === new URL(devUrl).origin;
      } catch {
        return false;
      }
    }
    // Packaged: the renderer is the ONLY content that can ever load — every
    // navigation, redirect, window.open and <webview> is blocked in
    // createWindow.ts — and it loads over file://. Chromium serializes a
    // sandboxed file:// page's origin inconsistently across platforms/versions:
    // it can arrive as 'file://', 'file:///…', a full 'file:///C:/…' URL, the
    // opaque 'null', an empty string, or undefined. In dev these all matched a
    // real origin; in a packaged build none of them matched, so the permission
    // CHECK handler silently denied the mic (this was the "works in dev, not in
    // the built app" bug). Accept every file-protocol / opaque form here; the
    // request handler still gates on audio-only + the main-window webContents
    // identity, which is what keeps this safe.
    if (origin === undefined || origin === '' || origin === 'null') return true;
    return origin.startsWith('file:');
  };

  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (permission === 'media') {
      const requestOrigin = (() => {
        try {
          const raw = details.requestingUrl ?? wc.getURL();
          return raw.startsWith('file:') ? 'file://' : new URL(raw).origin;
        } catch {
          return undefined;
        }
      })();
      const mediaTypes = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
      const audioOnly = mediaTypes.length > 0 && mediaTypes.every((t) => t === 'audio');
      if (audioOnly && isOwnOrigin(requestOrigin) && wc === getMainWindow()?.webContents) {
        callback(true);
        return;
      }
      logger.warn('Denied media permission request', { requestOrigin, mediaTypes });
    }
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
    if (permission !== 'media') return false;
    const mediaType = (details as { mediaType?: string }).mediaType;
    if (mediaType === 'video') return false;
    const ok = isOwnOrigin(requestingOrigin);
    // This handler is consulted synchronously before getUserMedia's request
    // handler; returning false rejects the mic outright. It used to be silent —
    // log denials so a future permission mismatch is diagnosable from the main log.
    if (!ok) logger.warn('Denied media permission check', { requestingOrigin, mediaType });
    return ok;
  });
}
