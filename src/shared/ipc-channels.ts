/**
 * Canonical IPC channel names shared between the main process (handlers) and the
 * preload bridge (invokers). Keeping them in one typed object prevents drift
 * between `ipcMain.handle(...)` and `ipcRenderer.invoke(...)`.
 *
 * Convention: `domain:action`. Two-way request/response uses `invoke`/`handle`;
 * one-way main -> renderer pushes use the channels under `Events`.
 */
export const IpcChannels = {
  // Frameless window controls.
  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:isMaximized',

  // Persistent user settings.
  settingsGetAll: 'settings:getAll',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsReset: 'settings:reset',

  // Native OS integrations.
  systemNotify: 'system:notify',
  systemOpenExternal: 'system:openExternal',
  systemClipboardWrite: 'system:clipboard:write',
  systemClipboardRead: 'system:clipboard:read',

  // App metadata.
  appGetInfo: 'app:getInfo',

  // Workspace management (Phase 2).
  workspaceList: 'workspace:list',
  workspaceGet: 'workspace:get',
  workspacePickDirectory: 'workspace:pickDirectory',
  workspaceCreate: 'workspace:create',
  workspaceCreateNew: 'workspace:createNew',
  workspaceOpen: 'workspace:open',
  workspaceSwitch: 'workspace:switch',
  workspaceRemove: 'workspace:remove',
  workspaceToggleFavorite: 'workspace:toggleFavorite',
  workspaceUpdateConfig: 'workspace:updateConfig',
  workspaceGetStats: 'workspace:getStats',
  workspaceRescan: 'workspace:rescan',

  // Session system (Phase 3) — persisted, per-workspace development sessions.
  sessionList: 'session:list',
  sessionCreate: 'session:create',
  sessionUpdate: 'session:update',
  sessionDuplicate: 'session:duplicate',
  sessionDelete: 'session:delete',
  sessionRestore: 'session:restore',
  sessionPurge: 'session:purge',
  sessionSetActive: 'session:setActive',
  sessionGetActive: 'session:getActive',
  sessionCreateInWorktree: 'session:createInWorktree',
  sessionGetDependencies: 'session:getDependencies',

  // Git worktrees — session-owned isolated checkouts (own directory + branch).
  worktreeList: 'worktree:list',
  worktreePrune: 'worktree:prune',
  worktreeRecreate: 'worktree:recreate',
  worktreeDetach: 'worktree:detach',
  worktreeGetRepoConfig: 'worktree:getRepoConfig',
  worktreeAckConfig: 'worktree:ackConfig',
  worktreeRunSetup: 'worktree:runSetup',

  // Scripts & Services — supervised per-session processes from limboo.json.
  serviceList: 'service:list',
  serviceStart: 'service:start',
  serviceStop: 'service:stop',
  serviceRestart: 'service:restart',
  scriptRun: 'script:run',

  // Coding agent (Claude Code orchestration).
  agentGetInstall: 'agent:getInstall',
  agentGetState: 'agent:getState',
  agentSend: 'agent:send',
  agentStop: 'agent:stop',
  agentGetSnapshot: 'agent:getSnapshot',
  agentPermissionRespond: 'agent:permissionRespond',
  agentClarificationRespond: 'agent:clarificationRespond',
  agentClearSession: 'agent:clearSession',
  agentGetDiagnostics: 'agent:getDiagnostics',
  agentClearRateLimit: 'agent:clearRateLimit',
  agentRetryAuth: 'agent:retryAuth',

  // Cursor provider — auth + CLI maintenance. The API key crosses exactly
  // once (set) and is never returned by any channel.
  agentCursorGetAuthState: 'agent:cursorGetAuthState',
  agentCursorRefreshAuth: 'agent:cursorRefreshAuth',
  agentCursorLoginStart: 'agent:cursorLoginStart',
  agentCursorLoginCancel: 'agent:cursorLoginCancel',
  agentCursorLogout: 'agent:cursorLogout',
  agentCursorSetApiKey: 'agent:cursorSetApiKey',
  agentCursorRemoveApiKey: 'agent:cursorRemoveApiKey',
  agentCursorUpdateCli: 'agent:cursorUpdateCli',

  /**
   * The harness's one-time setup plan — its verbatim commands, so the consent
   * dialog shows what will actually run rather than a hardcoded copy.
   * Read-only; approving is an ordinary settings write of the fingerprint.
   */
  agentHarnessBootstrapPlan: 'agent:harnessBootstrapPlan',

  // Plan Mode — review-first workflow over the coding agent.
  agentGetPlan: 'agent:getPlan',
  /**
   * The single plan-decision channel: approve / keep-planning / edit / reject /
   * archive. Replaces the former approve/reject/regenerate trio, which had no
   * revision token and so could act on a plan the user was no longer seeing.
   */
  agentPlanDecision: 'agent:planDecision',
  agentSetPlanPinned: 'agent:setPlanPinned',
  agentListPlanRevisions: 'agent:listPlanRevisions',
  agentRestorePlanRevision: 'agent:restorePlanRevision',

  // Conversation revert — a session-level rollback to the checkpoint guarding a
  // turn. `Preview` measures and never mutates; `Revert` is the confirmed act.
  // Both take ids only: the renderer never supplies a path, ref, or commit.
  agentRevertPreview: 'agent:revertPreview',
  agentRevertToMessage: 'agent:revertToMessage',

  // File System Layer (Phase 4) — read + watch + index foundation.
  fsIndex: 'fs:index',
  fsGetTree: 'fs:getTree',
  fsReadFile: 'fs:readFile',
  fsGetHistory: 'fs:getHistory',
  fsReveal: 'fs:reveal',
  // File Writer — guarded workspace mutations (no new push events; mutations
  // surface through the existing fs:tree-changed / search:changed flow).
  fsWriteFile: 'fs:writeFile',
  fsCreateFile: 'fs:createFile',
  fsCreateDir: 'fs:createDir',
  fsDelete: 'fs:delete',
  fsRename: 'fs:rename',
  fsCopy: 'fs:copy',

  // Integrated Terminal — workspace-scoped PTY sessions (node-pty in main).
  terminalCreate: 'terminal:create',
  terminalList: 'terminal:list',
  terminalWrite: 'terminal:write',
  terminalResize: 'terminal:resize',
  terminalKill: 'terminal:kill',
  terminalRename: 'terminal:rename',
  terminalClear: 'terminal:clear',

  // Deep Git integration — read + safe-write git ops, all workspace-scoped.
  /**
   * Whether a usable `git` binary exists at all (process-global, memoised).
   * Deliberately NOT folded into `git:status`: status is per-workspace and
   * refetched on every `git:changed`, and it early-returns before it could
   * carry this.
   */
  gitEnvironment: 'git:environment',
  gitStatus: 'git:status',
  gitDiff: 'git:diff',
  gitStage: 'git:stage',
  gitUnstage: 'git:unstage',
  gitStageAll: 'git:stageAll',
  gitUnstageAll: 'git:unstageAll',
  gitDiscard: 'git:discard',
  gitCommit: 'git:commit',
  gitCommitMessageGenerate: 'git:commitMessage:generate',
  gitCommitMessageCancel: 'git:commitMessage:cancel',
  gitLog: 'git:log',
  gitCommitDetail: 'git:commitDetail',
  gitBranches: 'git:branches',
  gitCheckout: 'git:checkout',
  gitCreateBranch: 'git:createBranch',
  gitTags: 'git:tags',
  gitCreateTag: 'git:createTag',
  gitBlame: 'git:blame',
  /** Faithful `git diff` patch text for one or more paths (copy to clipboard). */
  gitPatchText: 'git:patchText',
  /** Same patch, written to a file the USER picks via a main-process dialog. */
  gitPatchSave: 'git:patchSave',
  gitFetch: 'git:fetch',
  gitPush: 'git:push',
  gitPull: 'git:pull',
  gitInit: 'git:init',
  gitCheckpointCreate: 'git:checkpointCreate',
  gitCheckpointList: 'git:checkpointList',
  gitCheckpointDiff: 'git:checkpointDiff',
  gitCheckpointRestore: 'git:checkpointRestore',
  gitCheckpointDelete: 'git:checkpointDelete',

  // GitHub CLI (`gh`) — OPTIONAL, read-only. There is deliberately no channel
  // for `gh api` (it can POST) and none that could return a token.
  ghState: 'gh:state',
  ghPullRequests: 'gh:pullRequests',
  ghPullRequest: 'gh:pullRequest',
  ghIssues: 'gh:issues',
  ghIssue: 'gh:issue',
  /**
   * Batched contributor avatars. BATCHED on purpose: a history render needs up
   * to 100, and one invoke per row would be 100 IPC round trips.
   */
  ghAvatars: 'gh:avatars',

  // Auto-update — electron-updater driven, GitHub releases feed (packaged only).
  updateGetState: 'update:getState',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  /**
   * Locally observable facts about the running build (platform, arch, Electron
   * versions, packaged state, macOS signature authority). The release document
   * shows these next to — and clearly apart from — the manifest's claims about
   * the artifact, because only the main process can see them and only it should.
   */
  updateGetBuildInfo: 'update:getBuildInfo',

  /**
   * Write a release document to disk. Main owns the save dialog and the write;
   * the renderer never supplies a path (the `graph:save` contract).
   */
  releaseExport: 'release:export',

  // Local Memory System — provider-independent project knowledge, all local.
  memoryList: 'memory:list',
  memoryGet: 'memory:get',
  memorySearch: 'memory:search',
  memoryCreate: 'memory:create',
  memoryUpdate: 'memory:update',
  memoryDelete: 'memory:delete',
  memoryArchive: 'memory:archive',
  memoryPin: 'memory:pin',
  memoryListProposals: 'memory:listProposals',
  memoryAcceptProposal: 'memory:acceptProposal',
  memoryRejectProposal: 'memory:rejectProposal',

  // Search Engine — unified, cross-subsystem retrieval, all local.
  searchGlobal: 'search:global',
  searchFiles: 'search:files',
  searchSymbols: 'search:symbols',
  searchReindex: 'search:reindex',
  searchGetStatus: 'search:getStatus',
  searchHistoryList: 'search:historyList',
  searchHistoryClear: 'search:historyClear',
  searchSavedList: 'search:savedList',
  searchSavedCreate: 'search:savedCreate',
  searchSavedDelete: 'search:savedDelete',

  // Work Graph — Limboo's own provider-neutral DAG of engineering work.
  // Read + maintenance only: nodes are produced in the main process from the
  // normalized event stream, never submitted by the renderer.
  graphGet: 'graph:get',
  graphQuery: 'graph:query',
  graphNodeDetail: 'graph:nodeDetail',
  graphExport: 'graph:export',
  /** Write an export to a user-chosen file (main owns the path — see `save`). */
  graphSave: 'graph:save',
  /** Resolve a commit / message / terminal / memory entity to its graph node. */
  graphFindByRef: 'graph:findByRef',
  graphPrune: 'graph:prune',
  graphClear: 'graph:clear',
  /** Export the selected node's bounded subgraph instead of the whole session. */
  graphExportSubgraph: 'graph:exportSubgraph',
  /** Per-run statistics, joined to the Runtime Telemetry rollups by run id. */
  graphRunStats: 'graph:runStats',
  /** Write one file per session into a user-chosen directory (main owns it). */
  graphSaveBatch: 'graph:saveBatch',

  // Runtime Telemetry — Limboo's provider-neutral runtime metrics service.
  // Read + maintenance only: snapshots are produced in main from the provider
  // event streams; the renderer never submits a measurement. The whole surface
  // takes IDS and ENUM LITERALS only — no renderer-supplied object crosses it,
  // so there is no prototype-pollution surface to defend here (CLAUDE.md §6).
  runtimeGetSnapshot: 'runtime:getSnapshot',
  runtimeGetHistory: 'runtime:getHistory',
  /** Tell main whether any window has the inspector open (broadcast gating). */
  runtimeSetWatching: 'runtime:setWatching',
  runtimeExport: 'runtime:export',
  /** Write an export to a user-chosen file (main owns the path — graph:save). */
  runtimeSave: 'runtime:save',
  /** Privacy action: erase all persisted telemetry. */
  runtimeClearHistory: 'runtime:clearHistory',

  // MCP platform — provider-independent Model Context Protocol registry.
  // Server config crosses freely; secret env/header values cross only on
  // add/update (never returned). All access is validated in the main process.
  mcpList: 'mcp:list',
  mcpGet: 'mcp:get',
  mcpAdd: 'mcp:add',
  mcpUpdate: 'mcp:update',
  mcpRemove: 'mcp:remove',
  mcpSetEnabled: 'mcp:setEnabled',
  mcpConnect: 'mcp:connect',
  mcpDisconnect: 'mcp:disconnect',
  mcpTest: 'mcp:test',
  mcpRefreshTools: 'mcp:refreshTools',
  mcpLogs: 'mcp:logs',
  mcpImport: 'mcp:import',
  mcpExportToProject: 'mcp:exportToProject',

  // Resume Pipeline — repository revalidation + delta on session activation.
  resumeGetState: 'resume:getState',
  resumeGetDelta: 'resume:getDelta',
  resumeDismiss: 'resume:dismiss',
  resumeRevalidate: 'resume:revalidate',

  // Attachment Manager — session-owned files staged for the agent's tool loop.
  attachmentList: 'attachment:list',
  attachmentPickFiles: 'attachment:pickFiles',
  attachmentAddPaths: 'attachment:addPaths',
  attachmentAddPasted: 'attachment:addPasted',
  attachmentRemove: 'attachment:remove',
  attachmentReveal: 'attachment:reveal',

  // Voice subsystem — local STT/TTS as another modality for the agent session.
  voiceGetState: 'voice:getState',
  voiceWarm: 'voice:warm',
  voiceStart: 'voice:start',
  voiceStop: 'voice:stop',
  voiceCancel: 'voice:cancel',
  voiceStopSpeaking: 'voice:stopSpeaking',
  voiceSpeak: 'voice:speak',
  voiceModelsList: 'voice:models:list',
  voiceModelDownload: 'voice:models:download',
  voiceModelPause: 'voice:models:pause',
  voiceModelResume: 'voice:models:resume',
  voiceModelCancel: 'voice:models:cancel',
  voiceModelRemove: 'voice:models:remove',
  voiceModelVerify: 'voice:models:verify',
  voiceModelsReveal: 'voice:models:reveal',
} as const;

/**
 * One-way renderer -> main channels (`ipcRenderer.send`) for high-frequency
 * fire-and-forget payloads that don't want invoke round-trip overhead. Handled
 * through the `on()` wrapper in main/ipc/registry.ts (same sender validation).
 */
export const IpcSends = {
  /** A chunk of 16 kHz mono Int16 PCM from the renderer's mic worklet. */
  voiceAudioChunk: 'voice:audio-chunk',
} as const;

export type IpcSend = (typeof IpcSends)[keyof typeof IpcSends];

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

/**
 * One-way channels the main process pushes to the renderer. The renderer
 * subscribes through `window.limboo.events.on(channel, cb)`.
 */
export const IpcEvents = {
  windowMaximizedChanged: 'window:maximized-changed',
  settingsChanged: 'settings:changed',
  /** A native menu / tray item asks the renderer to run a command by id. */
  commandInvoke: 'command:invoke',
  /** The active workspace changed (switched, opened, or cleared). */
  workspaceChanged: 'workspace:changed',
  /** The set of registered workspaces changed (created / removed / updated). */
  workspacesUpdated: 'workspaces:updated',
  /** The set of sessions changed (created / updated / deleted / restored). */
  sessionsUpdated: 'sessions:updated',
  /** The active session changed (switched, created, or deleted). */
  sessionActiveChanged: 'session:active-changed',
  /**
   * Progress of the activation pipeline that rebinds every root-bound service
   * after a session/workspace switch. Always ends in `ready` or `error`.
   */
  sessionActivationChanged: 'session:activation-changed',
  /** The agent runtime state changed (status / install / active session). */
  agentStateChanged: 'agent:state-changed',
  /** The Cursor provider's auth state changed (probe / login / key set). */
  agentCursorAuthChanged: 'agent:cursor-auth-changed',
  /** A structured agent event (message delta, tool call, file change, …). */
  agentEvent: 'agent:event',
  /** The agent needs the user to approve or deny a tool call. */
  agentPermissionRequest: 'agent:permission-request',
  /** The agent (AskUserQuestion) needs the user to answer clarifying questions. */
  agentClarificationRequest: 'agent:clarification-request',
  /** Progress of an in-flight workspace index pass. */
  fsIndexProgress: 'fs:index-progress',
  /** The active workspace's directory tree changed (watcher or reindex). */
  fsTreeChanged: 'fs:tree-changed',
  /** A chunk of PTY output for a terminal (stdout/stderr, raw VT bytes). */
  terminalData: 'terminal:data',
  /** A terminal's PTY exited (with code / signal). */
  terminalExit: 'terminal:exit',
  /** The set of terminals for a workspace changed (created / renamed / killed). */
  terminalsUpdated: 'terminal:updated',
  /** An agent-run shell command mirrored into the integrated terminal. */
  terminalCommand: 'terminal:command',
  /** The active workspace's git state changed (status/branch/commit/stage). */
  gitChanged: 'git:changed',
  /** A forced re-probe found git newly available (or newly missing). */
  gitEnvironmentChanged: 'git:environment-changed',
  /** The GitHub CLI's auth state changed (signed in / out / installed). */
  ghChanged: 'gh:changed',
  /** Streaming AI commit-message proposal (delta / done / error / canceled). */
  gitCommitMessageStream: 'git:commit-message-stream',
  /** A session's git checkpoints changed (created / restored / pruned). */
  gitCheckpointsChanged: 'git:checkpoints-changed',
  /** The set of session worktrees changed (created / removed / pruned / missing). */
  worktreesUpdated: 'worktrees:updated',
  /** A session's supervised services changed (started / exited / restarted). */
  servicesUpdated: 'services:updated',
  /** The memory store changed (created / updated / proposed / accepted / pruned). */
  memoryChanged: 'memory:changed',
  /** The search index / history / saved searches changed (reindex, save, clear). */
  searchChanged: 'search:changed',
  /** The set of MCP servers changed (added / updated / removed / imported). */
  mcpServersChanged: 'mcp:servers-changed',
  /** One MCP server's live runtime advanced (status / tools / latency / error). */
  mcpServerStatus: 'mcp:server-status',
  /** An incremental Work Graph delta (appended nodes/edges), or a reset signal. */
  graphChanged: 'graph:changed',
  /** A coalesced Runtime Telemetry snapshot for one session, or a reset signal. */
  runtimeChanged: 'runtime:changed',
  /** Progress of an in-flight search index pass. */
  searchIndexProgress: 'search:index-progress',
  /** A session's revalidation state advanced (checking / clean / delta). */
  resumeStateChanged: 'resume:state-changed',
  /** A session's attachment set changed (staged / sent / read / removed). */
  attachmentsChanged: 'attachment:changed',
  /** Staging progress for one attachment (hash + copy percent). */
  attachmentProgress: 'attachment:progress',
  /** The auto-update lifecycle advanced (checking / available / progress / ready). */
  updateStatus: 'update:status',
  /** The voice runtime state changed (idle / listening / transcribing / speaking). */
  voiceState: 'voice:state',
  /** A finished utterance transcript (about to be sent to the agent). */
  voiceTranscript: 'voice:transcript',
  /** A chunk of synthesized Int16 PCM for Web Audio playback. */
  voiceTtsChunk: 'voice:tts-chunk',
  /** Stop all scheduled speech playback immediately (barge-in / stop). */
  voicePlaybackCancel: 'voice:playback-cancel',
  /** Progress of an in-flight voice model download / verify / extract. */
  voiceModelProgress: 'voice:model-progress',
  /** The set of installed voice models changed (installed / removed). */
  voiceModelsChanged: 'voice:models-changed',
} as const;

export type IpcEvent = (typeof IpcEvents)[keyof typeof IpcEvents];
