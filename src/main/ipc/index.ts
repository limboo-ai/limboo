/**
 * Registers every IPC handler in one place. Called once after the app is ready.
 */
import type { SettingsManager } from '../managers/SettingsManager';
import type { NotificationManager } from '../managers/NotificationManager';
import type { WorkspaceManager } from '../managers/WorkspaceManager';
import type { SessionManager } from '../managers/SessionManager';
import type { AgentManager } from '../managers/AgentManager';
import type { FileSystemManager } from '../managers/FileSystemManager';
import type { TerminalManager } from '../managers/TerminalManager';
import type { GitManager } from '../managers/GitManager';
import type { WorktreeManager } from '../managers/worktree/WorktreeManager';
import type { ServiceManager } from '../managers/services/ServiceManager';
import type { MemoryManager } from '../managers/memory/MemoryManager';
import type { AttachmentManager } from '../managers/attachments/AttachmentManager';
import type { SearchManager } from '../managers/search/SearchManager';
import type { ResumeManager } from '../managers/resume/ResumeManager';
import type { HookEngine } from '../managers/hooks/HookEngine';
import type { AutoUpdateManager } from '../managers/AutoUpdateManager';
import type { VoiceManager } from '../managers/voice/VoiceManager';
import type { VoiceModelManager } from '../managers/voice/VoiceModelManager';
import type { CursorAuthManager } from '../managers/cursor/CursorAuthManager';
import type { McpManager } from '../managers/mcp/McpManager';
import type { WorkGraphManager } from '../managers/graph/WorkGraphManager';
import { registerWindowHandlers } from './windowHandlers';
import { registerSettingsHandlers } from './settingsHandlers';
import { registerSystemHandlers } from './systemHandlers';
import { registerWorkspaceHandlers } from './workspaceHandlers';
import { registerSessionHandlers } from './sessionHandlers';
import { registerAgentHandlers } from './agentHandlers';
import { registerFsHandlers } from './fsHandlers';
import { registerTerminalHandlers } from './terminalHandlers';
import { registerGitHandlers } from './gitHandlers';
import { registerWorktreeHandlers } from './worktreeHandlers';
import { registerServiceHandlers } from './serviceHandlers';
import { registerMemoryHandlers } from './memoryHandlers';
import { registerAttachmentHandlers } from './attachmentHandlers';
import { registerSearchHandlers } from './searchHandlers';
import { registerResumeHandlers } from './resumeHandlers';
import { registerHookHandlers } from './hookHandlers';
import { registerUpdateHandlers } from './updateHandlers';
import { registerReleaseHandlers } from './releaseHandlers';
import { registerVoiceHandlers } from './voiceHandlers';
import { registerCursorHandlers } from './cursorHandlers';
import { registerMcpHandlers } from './mcpHandlers';
import { registerGraphHandlers } from './graphHandlers';

export interface IpcDeps {
  settings: SettingsManager;
  notifications: NotificationManager;
  workspace: WorkspaceManager;
  session: SessionManager;
  agent: AgentManager;
  fs: FileSystemManager;
  terminal: TerminalManager;
  git: GitManager;
  worktree: WorktreeManager;
  services: ServiceManager;
  memory: MemoryManager;
  attachments: AttachmentManager;
  search: SearchManager;
  resume: ResumeManager;
  hooks: HookEngine;
  updates: AutoUpdateManager;
  voice: VoiceManager;
  voiceModels: VoiceModelManager;
  cursorAuth: CursorAuthManager;
  mcp: McpManager;
  graph: WorkGraphManager;
}

/**
 * Fail loudly, at registration, if a manager is missing.
 *
 * Handlers capture their manager in a closure, so a dep that is `undefined`
 * here does not fail now — it fails later, on every call, as a
 * `Cannot read properties of undefined` thrown from deep inside a handler with
 * no indication of which manager was missing or why. That is exactly the shape
 * of a real failure this code hit during development, when a hot-reloaded
 * renderer invoked a channel whose manager had not been constructed by the
 * main-process build then running.
 *
 * One assertion converts that into a boot error that names the culprit.
 */
function assertDeps(deps: IpcDeps): void {
  const missing = (Object.keys(deps) as Array<keyof IpcDeps>).filter((key) => !deps[key]);
  if (missing.length > 0) {
    throw new Error(
      `registerAllIpc: missing manager(s): ${missing.join(', ')}. ` +
        'Every manager must be constructed in the composition root before IPC is wired.',
    );
  }
}

export function registerAllIpc(deps: IpcDeps): void {
  assertDeps(deps);
  registerWindowHandlers();
  registerSettingsHandlers(deps.settings);
  registerSystemHandlers(deps.notifications);
  registerWorkspaceHandlers(deps.workspace);
  registerSessionHandlers(deps.session, deps.worktree, deps.services, deps.terminal, deps.attachments);
  registerAgentHandlers(deps.agent);
  registerFsHandlers(deps.fs);
  registerTerminalHandlers(deps.terminal);
  registerGitHandlers(deps.git, deps.agent);
  registerWorktreeHandlers(deps.worktree);
  registerServiceHandlers(deps.services);
  registerMemoryHandlers(deps.memory);
  registerAttachmentHandlers(deps.attachments);
  registerSearchHandlers(deps.search);
  registerResumeHandlers(deps.resume, deps.session);
  registerHookHandlers(deps.hooks);
  registerUpdateHandlers(deps.updates);
  // Takes no dependency: the release manifest is compiled into the bundle, so
  // the only thing main owns here is the save dialog.
  registerReleaseHandlers();
  registerVoiceHandlers(deps.voice, deps.voiceModels, deps.settings);
  registerCursorHandlers(deps.cursorAuth, () => deps.agent.hasActiveRuns());
  registerMcpHandlers(deps.mcp);
  registerGraphHandlers(deps.graph);
}
