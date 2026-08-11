/**
 * AgentManager — the Coding Agent Manager. Orchestrates the local, already-
 * authenticated Claude Code through `@anthropic-ai/claude-agent-sdk`. Limboo is
 * NOT the agent; it is the operating environment around it (like a Git GUI shells
 * out to `git`). Claude Code owns authentication — this manager never stores or
 * forwards Anthropic credentials.
 *
 * Responsibilities (single domain = orchestration):
 *   • detect the local Claude Code install / auth
 *   • run prompts, map the SDK's structured message stream into typed AgentEvents
 *   • gate every tool call through a risk-based permission bridge (canUseTool)
 *   • path-guard every filesystem tool to the active workspace root
 *   • persist transcript + activity to SQLite and broadcast to all windows
 *
 * Security (CLAUDE.md §6): the SDK spawns the CLI argv-style (never shell:true);
 * file tools are canonicalized + confined to the workspace; secrets are redacted
 * before logging; prompt size is capped upstream in the IPC handler.
 */
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import type {
  Options,
  PermissionResult,
  SDKMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentActivityItem,
  GitActivityPayload,
  AgentDiagnostic,
  AgentEvent,
  AgentInstall,
  AgentLifecycleStatus,
  AgentMode,
  AgentSessionSnapshot,
  AgentState,
  AgentToolCall,
  SubagentInfo,
  AppSettings,
  ToolCallStatus,
  SubagentValidationKind,
  ChatMessage,
  ClarificationDecision,
  ClarificationOption,
  ClarificationQuestion,
  ClarificationRequest,
  ConversationRevertPreview,
  ConversationRevertResult,
  DiagnosticCategory,
  DiagnosticSeverity,
  FileChange,
  FileChangeStatus,
  GenerateCommitMessageResult,
  GitCommitContext,
  GitCommitMessageStreamEvent,
  PermissionDecision,
  PermissionRequest,
  PlanMeta,
  PlanRevision,
  PlanStatus,
  RateLimitInfo,
  RequestOutcome,
  HookEvent,
  RequestState,
  SessionPermissionMode,
  SessionPlan,
  TaskItem,
  TaskStatus,
  TerminalCommandRecord,
  ToolRisk,
} from '@shared/types';
import { RUNNING_REQUEST_PHASES } from '@shared/types';
import {
  ACTIVITY_LIMITS,
  AGENT_LIMITS,
  SUBAGENT_LIMITS,
  ANTHROPIC_MODEL_ID_RE,
  CURSOR_MODEL_ID_RE,
  CURSOR_RESUME_ID_RE,
  DEFAULT_SETTINGS,
  GIT_LIMITS,
  MEMORY_LIMITS,
  RESUME_LIMITS,
  SEARCH_LIMITS,
  cursorModelSet,
  providerForModel,
  resolveModelRouting,
} from '@shared/constants';
import type { AgentProvider } from '@shared/constants';
import type { CursorAuthManager } from './cursor/CursorAuthManager';
import type { CursorRuntime } from './cursor/CursorRuntime';
import { bridgeNodeCommand, bridgeScriptPath } from './cursor/bridge/bridgeAssets';
import { startBridgeServer, type HookDecision, type RunBridgeServer } from './cursor/bridge/pipeServer';
import { createMcpDispatcher } from './cursor/bridge/toolDispatch';
import { classifyCursorError, isCursorResumeCorruption } from './cursor/errors';
import { withSessionHooksJson } from './cursor/hooks';
import { withSessionMcpJson, type McpBridgeSpec } from './cursor/mcpConfig';
import { sessionAllowRules, sessionAskRules, sessionDenyRules, withSessionCliJson } from './cursor/permissions';
import { clearHooksVerified, getVerifiedHooksVersion, setHooksVerified } from './cursor/capabilities';
import { createSessionDir } from './cursor/sessionFile';
import { executionPostureNote, withSessionContextRule } from './cursor/rules';
import { supportsApproveMcps } from './cursor/exec';
import { mapHookEvent } from './cursor/translate';
import { withSessionSandboxJson } from './cursor/sandbox';
import {
  crownJewelPaths,
  mapClaudeSandbox,
  resolveSandboxConfig,
  type EffectiveSandbox,
} from './sandbox/policy';
import { isReadOnlyShellCommand } from './agent/readOnlyCommands';
import { clampGitPayload, gitActivityDetail, gitActivityLabel } from './agent/gitActivity';
import {
  AgentRunError,
  classifyTerminalResult,
  isAgentRunError,
  joinErrors,
  terminalResultFromText,
  type TerminalResult,
} from './agent/terminalResult';
import { HookEngine, type HookEmit } from './hooks/HookEngine';
import {
  signalFromRateLimit,
  signalFromResult,
  signalFromToolProgress,
  signalsFromStreamEvent,
  signalsFromSystem,
} from './telemetry/claudeSignals';
import type { ProviderTelemetrySignal, RuntimeSink } from './telemetry/types';
import type { PermissionDecisionSignal } from './graph/builder';
import type { CursorRunOutcome, ProviderRunBridge } from './cursor/types';
import type { HarnessRuntime, HarnessRunHandle } from './harness/HarnessRuntime';
import type { LocalWorktreeSandboxProvider } from './harness/sandbox/LocalWorktreeSandbox';
import { buildToolApprovalMap } from './harness/approval';
import { loadHarness } from './harness';
import { harnessById } from './agent/harnessRegistry';
import { isSubagentTool } from '@shared/subagents';
import { IpcEvents } from '@shared/ipc-channels';
import { getDb } from '../db/database';
import { logger } from '../logger';
import type { SettingsManager } from './SettingsManager';
import type { WorkspaceManager } from './WorkspaceManager';
import type { NotificationManager } from './NotificationManager';
import type { TerminalManager } from './TerminalManager';
import type { SessionManager } from './SessionManager';
import type { GitManager } from './GitManager';
import type { GhManager } from './gh/GhManager';
import type { MemoryManager } from './memory/MemoryManager';
import type { ResumeManager } from './resume/ResumeManager';
import { createMemoryMcpServer } from './memory/memoryTools';
import type { AttachmentManager } from './attachments/AttachmentManager';
import type { SearchManager } from './search/SearchManager';
import { createSearchMcpServer } from './search/searchTools';
import type { McpManager, McpPlanVerdict } from './mcp/McpManager';

/* ------------------------------------------------------------------ */
/* ESM loader — the SDK is ESM-only; main is a CJS bundle. Load it with */
/* the runtime's native dynamic import so the bundler never rewrites it. */
/* ------------------------------------------------------------------ */
type ClaudeSdk = typeof import('@anthropic-ai/claude-agent-sdk');
const importEsm = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>;
let sdkPromise: Promise<ClaudeSdk> | null = null;
function loadSdk(): Promise<ClaudeSdk> {
  if (!sdkPromise) sdkPromise = importEsm('@anthropic-ai/claude-agent-sdk') as Promise<ClaudeSdk>;
  return sdkPromise;
}

/* ------------------------------------------------------------------ */
/* Native Claude Code executable resolution.                           */
/*                                                                     */
/* The SDK (0.3.x) ships a per-platform NATIVE binary                  */
/* (`@anthropic-ai/claude-agent-sdk-<platform>-<arch>/claude[.exe]`)   */
/* and, when `pathToClaudeCodeExecutable` is unset, auto-resolves it to */
/* its own module path. In a packaged build that path lands INSIDE     */
/* `app.asar` — a virtual archive path the OS cannot exec, so the      */
/* spawn fails with "native binary … exists but failed to launch".     */
/* forge.config.ts already unpacks `@anthropic-ai/**` to               */
/* `app.asar.unpacked`, so the real file exists on disk — we just have */
/* to point the SDK at it. Memoized: the path never changes at runtime.*/
/* ------------------------------------------------------------------ */
let claudeExeResolved = false;
let claudeExePath: string | undefined;
function resolveClaudeExecutable(): string | undefined {
  if (claudeExeResolved) return claudeExePath;
  claudeExeResolved = true;
  const binName = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const rel = path.join(
    'node_modules',
    '@anthropic-ai',
    `claude-agent-sdk-${process.platform}-${process.arch}`,
    binName,
  );
  const appPath = app.getAppPath();
  const candidates = [
    // Packaged: the unpacked copy lives beside app.asar.
    appPath.includes('app.asar') ? path.join(appPath.replace('app.asar', 'app.asar.unpacked'), rel) : undefined,
    // Dev / already-unpacked: resolve straight from the app path.
    path.join(appPath, rel),
  ].filter((p): p is string => typeof p === 'string');
  claudeExePath = candidates.find((p) => fs.existsSync(p));
  if (claudeExePath) {
    logger.info('[claude] resolved native executable', { path: claudeExePath });
  } else {
    // Fall back to the SDK's built-in resolution (works in dev where the SDK
    // sits in a plain node_modules) rather than forcing a broken path.
    logger.warn('[claude] native executable not found on disk; using SDK default resolution');
  }
  return claudeExePath;
}

/* ------------------------------------------------------------------ */
/* Tool risk classification                                            */
/* ------------------------------------------------------------------ */
const READ_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'LS', 'WebSearch', 'WebFetch', 'NotebookRead', 'TodoWrite',
]);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Delete']);

/**
 * Limboo's own MCP tools that may run without a permission prompt.
 *
 * An ALLOW-LIST, deliberately, and the only correct shape for this: the
 * `limboo_search` server also carries `comment_on_pull_request` /
 * `comment_on_issue`, which publish under the user's GitHub account. A prefix
 * match with a deny-list would mean any tool added to that server later is
 * allowed by default — the failure mode where a write ships pre-approved and
 * nobody notices. Anything not named here falls through to the normal gate.
 *
 * Every entry must be genuinely read-only. Adding a name here is a security
 * decision, not a convenience one.
 */
const AUTO_ALLOWED_INTERNAL_TOOLS = new Set([
  // limboo_memory
  'list_memories',
  'search_memories',
  'list_memory_proposals',
  // limboo_search — retrieval
  'search_project',
  'find_files',
  'find_symbols',
  // limboo_search — release notes
  'list_releases',
  'release_notes',
  // limboo_search — GitHub reads (the comment tools are POINTEDLY absent)
  'list_pull_requests',
  'view_pull_request',
  'list_issues',
  'view_issue',
]);

/** `mcp__limboo_search__find_files` → `find_files`. */
function bareMcpToolName(toolName: string): string {
  const parts = toolName.split('__');
  return parts.length >= 3 ? parts.slice(2).join('__') : toolName;
}
const COMMAND_TOOLS = new Set(['Bash', 'BashOutput', 'KillBash', 'KillShell']);

/** The SDK tool the agent calls to present its plan and exit planning mode. */
const EXIT_PLAN_TOOL = 'ExitPlanMode';
/**
 * The SDK tool the agent uses to maintain its implementation checklist.
 * Deprecated-but-pinned: SDK ≥ 0.3.142 defaults to the Task tools and stops
 * emitting `TodoWrite`, so `buildOptions` forces it back on via
 * `CLAUDE_CODE_ENABLE_TASKS=0`. If that flag ever stops working, migrate the
 * ingestion in `onTodoWrite` to `TaskCreate`/`TaskUpdate` (keyed by task id).
 */
const TODO_TOOL = 'TodoWrite';
/** The SDK tool the agent uses to ask the user clarifying questions. */
const ASK_USER_QUESTION_TOOL = 'AskUserQuestion';

/** Default per-session request state before a session has ever run. */
const IDLE_REQUEST: RequestState = {
  sessionId: null,
  phase: 'idle',
  outcome: null,
  attempt: 0,
  maxAttempts: 0,
};

/**
 * Streamed text is coalesced before it crosses IPC: rather than one
 * `message-delta` per token (which floods IPC), deltas are buffered and flushed
 * once the buffer reaches DELTA_FLUSH_CHARS or DELTA_FLUSH_MS elapses — whichever
 * comes first. These are kept small so text emits near display-refresh cadence
 * (smooth, real-time reveal rather than large periodic bursts); the renderer then
 * coalesces bursts of deltas into one render per animation frame, so a fine flush
 * here never causes a React render storm.
 */
const DELTA_FLUSH_CHARS = 24;
const DELTA_FLUSH_MS = 16;

/**
 * How long a plan approval waits for the run that produced the plan to finish
 * tearing down (see {@link AgentManager.waitForRunSettle}). The wait is normally
 * a few milliseconds — an SDK interrupt unwinding — so this is only a ceiling on
 * how long a genuinely wedged run can hold the click hostage before the user
 * gets the "already working" refusal back. Internal timing, not a user setting.
 */
const RUN_SETTLE_TIMEOUT_MS = 8_000;

/* ------------------------------------------------------------------ */
/* Git commit-message sub-agent — an isolated, tool-less one-shot run. */
/* ------------------------------------------------------------------ */

/**
 * Pinned haiku-class model for utility one-shots (commit messages). Deliberately
 * NOT the user's configured chat model: summarizing a staged diff into a ≤72-char
 * subject is fast-model work, and pinning keeps latency/cost predictable.
 */
const COMMIT_MESSAGE_MODEL = 'claude-haiku-4-5-20251001';

const COMMIT_SYSTEM_PROMPT =
  'You write git commit messages. Output ONLY the commit message text — no ' +
  'preamble, no explanations, no code fences, no surrounding quotes. First ' +
  'line: an imperative-mood subject of at most 72 characters. If the change ' +
  'needs explanation, add one blank line then a short body wrapped at ~72 ' +
  'columns. If the repository\'s recent commit subjects follow a consistent ' +
  'convention (e.g. "feat:", "fix(scope):"), match it; otherwise use a plain ' +
  'imperative subject.';

function classifyTool(name: string): ToolRisk {
  if (WRITE_TOOLS.has(name)) return 'write';
  if (COMMAND_TOOLS.has(name)) return 'command';
  if (READ_TOOLS.has(name)) return 'read';
  // Unknown / MCP tools are gated as commands (the conservative default). That
  // includes the SDK's Task/Agent subagent tool, which stays a 'command' here so
  // it keeps prompting in default/acceptEdits mode.
  //
  // What makes a subagent safe is NOT sandbox inheritance — `mapClaudeSandbox`
  // returns undefined whenever the network policy is 'all' (the default), so
  // there is frequently no OS jail to inherit, and the subagent input carries
  // its own `dangerouslyDisableSandbox` flag. The load-bearing invariant is
  // that `makeCanUseTool` builds ONE closure per query: every tool a subagent
  // calls re-enters the SAME canUseTool with the SAME `permMode` and the SAME
  // cwd. A subagent spawned during a plan run is therefore bound by this exact
  // gate and can still only read. See PLAN_SAFE_BUILTINS.
  return 'command';
}

/**
 * Built-in provider tools that may still run in the read-only session modes.
 *
 * Without this, `classifyTool`'s conservative 'command' default means plan/ask
 * hard-denies the SDK's subagent tool — so the agent cannot delegate exploration
 * while planning, in any project. Claude Code's own Plan Mode permits `Task`
 * (forbidding only Edit/Write/Bash), so denying it made Limboo diverge from the
 * provider it wraps. Names verified against the pinned CLI binary, which defines
 * BOTH `Agent` and `Task` as wire names for the subagent tool.
 *
 * Consumed ONLY by the plan/ask branch — never folded into `effectiveRisk`,
 * which feeds `autoApproveReads`. Folding `Task` in would let a subagent spawn
 * with no prompt in DEFAULT mode; the point here is narrower, that planning
 * stops being a dead end.
 *
 * Safety rests on the closure invariant documented in `classifyTool`: every tool
 * the subagent calls re-enters this same gate with this same `permMode`, so a
 * subagent inside a plan run can only read.
 *
 * To add a future provider tool: append it here and state why it cannot mutate.
 * Deliberately EXCLUDED — `SlashCommand` (arbitrary command expansion),
 * `RefreshMcpTools` (re-probes servers: real spawns/network), `Skill` (injects
 * instructions that steer later tools, and Limboo has no Skill surface), and
 * `ReadMcpResource`, which names a server and so is gated on that server's own
 * `planAccess` instead (see decideToolUseCore).
 */
const PLAN_SAFE_BUILTINS = new Set([
  'Task', 'Agent', // spawn a subagent — bound by this same gate
  'TaskOutput', 'TaskGet', 'TaskList', // observe one
  'TaskStop', // halting work is not a mutation
  'TaskCreate', 'TaskUpdate', // checklist bookkeeping; defensive, since
  // CLAUDE_CODE_ENABLE_TASKS=0 pins TodoWrite on today
  'ListMcpResources', // enumerate resource URIs; no fetch
]);

/** Memory tools whose use inside a worker counts as a memory lookup. */
const MEMORY_LOOKUP_RE = /^mcp__limboo_memory__/;

/**
 * Parse a persisted {@link ChatMessage.display}. Defensive: the column is JSON
 * written by this process, but a corrupt or hand-edited row must degrade to
 * "render the raw text" rather than break the transcript.
 */
function parseDisplay(raw: string | null): ChatMessage['display'] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { text?: unknown; body?: unknown };
    const text = typeof parsed?.text === 'string' ? parsed.text : '';
    if (!text) return undefined;
    const body = typeof parsed?.body === 'string' ? parsed.body : undefined;
    return body ? { text, body } : { text };
  } catch {
    return undefined;
  }
}

/** Limboo's own in-process retrieval bridges — never a user-facing MCP server. */
function isInternalMcpTool(name: string): boolean {
  return name.startsWith('mcp__limboo_memory__') || name.startsWith('mcp__limboo_search__');
}

/**
 * Tools that count as "reading the repository" for a worker's record. Kept in
 * step with the `read` stage in `renderer/features/workspace/subagentStages.ts`
 * — a figure that disagreed with the stage that produced it is worse than none.
 */
const READ_SHAPED_TOOLS = new Set(['Read', 'Glob', 'LS', 'NotebookRead']);

/**
 * Recognize a verification command from its text — the spec's "validation steps
 * completed".
 *
 * Deliberately conservative. This is EVIDENCE, not inference: an unrecognized
 * command contributes nothing rather than being guessed into a category, so a
 * worker that ran no verification reports none instead of a misleading zero.
 */
function validationKindOf(command: string): SubagentValidationKind | undefined {
  const cmd = command.toLowerCase();
  if (!cmd) return undefined;
  if (/\b(jest|vitest|pytest|mocha|go test|cargo test|npm (run )?test|yarn test|pnpm test)\b/.test(cmd)) {
    return 'test';
  }
  if (/\b(eslint|ruff|flake8|clippy|golangci-lint|npm run lint|yarn lint|pnpm lint)\b/.test(cmd)) {
    return 'lint';
  }
  if (/\b(tsc|mypy|pyright|npm run typecheck|yarn typecheck|pnpm typecheck)\b/.test(cmd)) {
    return 'typecheck';
  }
  if (/\b(cargo build|go build|make build|npm run build|yarn build|pnpm build|vite build)\b/.test(cmd)) {
    return 'build';
  }
  return undefined;
}

/**
 * Scope of a remembered "always allow this session" choice. A remembered grant
 * must never widen past the class of operation the user was actually shown, so
 * the three risk classes are tracked separately and secret-file access gets its
 * own scope that no ordinary approval can satisfy.
 */
type RememberScope = ToolRisk | 'sensitive';

/** Key for the {@link AgentManager.remembered} set. */
function rememberKey(sessionId: string, scope: RememberScope): string {
  return `${sessionId}:${scope}`;
}


/**
 * Provider tools that read an MCP RESOURCE. They take `{ server, uri }`, so they
 * are gated on the named server's own `planAccess` rather than listed in
 * PLAN_SAFE_BUILTINS — a blanket allow would reach past a blocked server.
 */
const RESOURCE_READ_TOOLS = new Set(['ReadMcpResource', 'ReadMcpResourceDir']);

/**
 * The remedy sentence appended to a plan/ask denial of an MCP tool.
 *
 * Each verdict points at the thing the user would actually have to change. The
 * previous single message always blamed the `planAccess` setting, which is wrong
 * — and actively misleading — when the server is unknown, belongs to another
 * workspace, or is simply not trusted.
 *
 * `not-annotated` no longer reaches here: an otherwise-usable server that simply
 * never declared a tool read-only now PROMPTS mid-run instead of being refused,
 * so there is no denial to explain. Only `blocked` — where the user already said
 * no — still points at the setting.
 */
function mcpDenyReason(verdict: McpPlanVerdict, toolName: string): string {
  if (verdict.ok) return '';
  const server = mcpVerdictServer(verdict);
  switch (verdict.reason) {
    case 'mcp-disabled':
      return 'MCP is disabled in Settings › MCP.';
    case 'unknown-server':
      return `No configured MCP server matches ${toolName}.`;
    case 'out-of-scope':
      return `The MCP server "${server}" is not configured for this session's workspace.`;
    case 'blocked':
      return `"${server}" is set to Blocked for these modes. To allow it, open Settings › MCP, expand ${server}, and change "Plan & Ask access".`;
    case 'not-annotated':
      return `If this tool only reads, allow it under Settings › MCP › ${server} › "Plan & Ask access".`;
    default:
      return '';
  }
}

/**
 * The server a verdict names, or null for the two that name none.
 *
 * Uses `in` rather than switching on `reason`: this project compiles with
 * `strictNullChecks` off, under which TypeScript will not narrow a discriminated
 * union by its boolean `ok` tag, so `verdict.server` does not typecheck at any
 * of the call sites. The `in` operator narrows regardless.
 */
function mcpVerdictServer(verdict: McpPlanVerdict | null): string | null {
  return verdict && 'server' in verdict ? verdict.server : null;
}

/**
 * Is this a built-in the read-only modes may run?
 *
 * Input-aware because the subagent tools carry `dangerouslyDisableSandbox`:
 * planning must not silently start a subagent that asked to run outside the
 * jail, even though this gate would still confine its children to reads.
 */
function isPlanSafeBuiltin(name: string, input: Record<string, unknown>): boolean {
  if (!PLAN_SAFE_BUILTINS.has(name)) return false;
  if (
    isSubagentTool(name) &&
    (input as { dangerouslyDisableSandbox?: unknown }).dangerouslyDisableSandbox === true
  ) {
    return false;
  }
  return true;
}

function filePathOf(input: Record<string, unknown>): string | undefined {
  const v = input.file_path ?? input.path ?? input.notebook_path;
  return typeof v === 'string' ? v : undefined;
}

/** Strip token-like secrets before anything reaches the logger. */
function redact(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, 'sk-***')
    .replace(/crsr_[A-Za-z0-9_-]{8,}/g, 'crsr_***')
    .replace(/(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_CODE_OAUTH_TOKEN|CURSOR_API_KEY)=\S+/gi, '$1=***')
    .replace(/(authorization|bearer)\s*[:=]?\s*[A-Za-z0-9._-]{10,}/gi, '$1 ***');
}

/**
 * Caller-supplied context for the permission gate. These are HINTS from the
 * adapter that translated the call — never authorization. They may only relax
 * risk classification for a tool identity Limboo could not recognise; every
 * guard in {@link AgentManager.decideToolUseCore} (crown jewels, workspace
 * containment, plan read-only, remembered scoping) runs regardless.
 */
interface ToolGateHints {
  /** The adapter's raw tool name reads as an inspection tool (see B5). */
  readShaped?: boolean;
}

/* ------------------------------------------------------------------ */
/* Error classification — the heart of "process health vs request"    */
/* outcome". Maps a thrown error / SDK message to a request outcome    */
/* and (only when capability-level) a lifecycle transition.            */
/* ------------------------------------------------------------------ */
interface Classification {
  outcome: RequestOutcome;
  /** If set, escalate lifecycle; otherwise lifecycle stays ready/current. */
  lifecycle?: AgentLifecycleStatus;
  rateLimit?: RateLimitInfo;
  /** True when a transparent recovery retry is warranted. */
  recoverable: boolean;
}

/**
 * Normalize an SDK `result` message into a {@link TerminalResult}.
 *
 * Two things here are easy to get wrong and were both wrong before:
 *
 *  1. `SDKResultError` has **no `result` field** — the payload is `errors[]`,
 *     joined the way the SDK's own reducer joins it. Reading `result` yields ''
 *     and degrades every failure to its bare subtype.
 *  2. `is_error` is carried on the SUCCESS shape too, and the SDK treats
 *     `subtype === 'success' && is_error` as a failure. Testing the subtype
 *     alone reports those runs as successful.
 */
function readTerminalResult(msg: SDKMessage): TerminalResult {
  const m = msg as unknown as {
    subtype?: string;
    is_error?: boolean;
    result?: unknown;
    errors?: unknown;
    stop_reason?: unknown;
    terminal_reason?: unknown;
    permission_denials?: unknown;
  };
  const ok = m.subtype === 'success' && !m.is_error;
  const errors = Array.isArray(m.errors) ? m.errors.map((e) => String(e ?? '')) : [];
  const successText = typeof m.result === 'string' ? m.result : '';
  const text = ok ? successText : joinErrors(errors) || successText || String(m.subtype ?? '');
  return {
    ok,
    subtype: typeof m.subtype === 'string' ? m.subtype : undefined,
    stopReason: typeof m.stop_reason === 'string' ? m.stop_reason : null,
    terminalReason: typeof m.terminal_reason === 'string' ? m.terminal_reason : undefined,
    errors,
    denials: Array.isArray(m.permission_denials) ? m.permission_denials.length : undefined,
    text,
  };
}

function classifyAgentError(raw: string): Classification {
  const t = raw.toLowerCase();

  // Rate / session / usage limit — NOT an error. The process is healthy and
  // auth is valid; the service has only temporarily refused more model calls.
  if (/session limit|rate.?limit|usage limit|too many requests|hit your .*limit|quota|resets?\s+(at\s+)?\d/.test(t)) {
    return { outcome: 'rate-limited', lifecycle: 'rate-limited', rateLimit: parseRateLimit(raw), recoverable: false };
  }
  // Auth — needs the user to sign in to Claude Code again.
  if (/\b401\b|unauthorized|authentication|invalid api key|oauth|credentials? (expired|invalid|not found)|please run .?claude.? .*(sign|log) ?in|not authenticated/.test(t)) {
    return { outcome: 'auth-required', lifecycle: 'auth-required', recoverable: false };
  }
  // Context window — request-local; the capability stays ready.
  if (/context (window|length|limit) exceeded|prompt is too long|maximum context|too many tokens|context_length|model_context_window/.test(t)) {
    return { outcome: 'context-overflow', recoverable: false };
  }
  // Transient transport / process death / provider overload — retry.
  if (/econnreset|etimedout|epipe|enotfound|eai_again|socket hang up|stream (closed|ended|error)|process (exited|terminated|killed)|spawn|disconnect|network|fetch failed|\b50[023]\b|\b529\b|overloaded|temporarily unavailable/.test(t)) {
    return { outcome: 'failed', lifecycle: 'reconnecting', recoverable: true };
  }
  // Default: request-local failure; capability stays healthy.
  return { outcome: 'failed', recoverable: false };
}

/** Parse a provider rate-limit message into structured info (best-effort). */
function parseRateLimit(raw: string): RateLimitInfo {
  const message = redact(raw).slice(0, 240);
  const tzMatch = raw.match(/\(([A-Za-z]+\/[A-Za-z_]+)\)/);
  const timeMatch = raw.match(/resets?(?:\s+at)?\s+(\d{1,2}):(\d{2})\s*([ap]m)?/i);
  let resetsAt: number | undefined;
  if (timeMatch) resetsAt = computeNextReset(timeMatch, tzMatch?.[1]);
  return { message, resetsAt, timezone: tzMatch?.[1] };
}

/**
 * Given a parsed "HH:MM[am/pm]" match and an optional IANA timezone, return the
 * epoch ms of the next wall-clock occurrence of that time. Uses Intl to read the
 * timezone's current UTC offset; falls back to local time on any error.
 */
function computeNextReset(m: RegExpMatchArray, timeZone?: string): number | undefined {
  try {
    let hour = Number(m[1]);
    const minute = Number(m[2]);
    const ampm = m[3]?.toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    if (Number.isNaN(hour) || Number.isNaN(minute)) return undefined;

    const now = new Date();
    // Offset (minutes) of the target tz relative to UTC, computed from a probe.
    const tzOffsetMin = timeZone ? tzOffsetMinutes(now, timeZone) : -now.getTimezoneOffset();
    // Build the target instant for "today" at HH:MM in that tz, then roll forward.
    const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    let target = utcMidnight + (hour * 60 + minute - tzOffsetMin) * 60_000;
    if (target <= now.getTime()) target += 24 * 60 * 60_000;
    return target;
  } catch {
    return undefined;
  }
}

/** The UTC offset (in minutes, east-positive) of `tz` at instant `at`. */
function tzOffsetMinutes(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUTC - at.getTime()) / 60_000);
}

/** Exponential backoff with a hard cap. */
function backoff(base: number, attempt: number): number {
  return Math.min(base * 2 ** Math.max(0, attempt - 1), 30_000);
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `a_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/* ------------------------------------------------------------------ */
/* Per-session ephemeral state (changes / tasks / tool calls)         */
/* ------------------------------------------------------------------ */
interface SessionRuntime {
  changes: Map<string, FileChange>;
  tasks: TaskItem[];
  toolCalls: AgentToolCall[];
}

interface ActiveRun {
  abort: AbortController;
  query: { close?: () => void } | null;
  /**
   * Resolves once `send()`'s `finally` has torn this run down and removed it
   * from {@link AgentManager.runs}. A captured plan is published to the renderer
   * from INSIDE the still-live run, so an Approve click legitimately arrives
   * while the entry is still here — {@link AgentManager.waitForRunSettle} awaits
   * this instead of rejecting the user outright.
   */
  settled: Promise<void>;
  /** Whether this run is a read-only plan run or a normal implement run. */
  mode: AgentMode;
  /**
   * Terminal SDK result for the active attempt (drives outcome classification).
   * Holds the FULL structured record — `errors[]`, `stop_reason`,
   * `terminal_reason` — not just a string: an `SDKResultError` has no `result`
   * field, so a text-only shape silently degrades every failure to its bare
   * subtype and no classifier can act on it.
   */
  result?: TerminalResult;
  /** Set true once an ExitPlanMode plan was captured (suppresses the failure throw). */
  planCaptured?: boolean;
  /** Set once this run has taken its single automatic pre-write checkpoint. */
  checkpointed?: boolean;
  /**
   * The user message that opened this run. Rides onto the automatic checkpoint
   * so a checkpoint is addressable by the turn it guards, not just by time.
   */
  userMessageId?: string;
  /** Attachments riding this turn (manifest + vision blocks; reused on retry). */
  attachmentIds?: string[];
  /**
   * The workspace this run's MCP scope was resolved against, pinned at run start.
   *
   * The run-start injection (`options.mcpServers` / `options.allowedTools`, the
   * generated `.cursor/mcp.json`) is a SNAPSHOT, while the permission gate
   * re-resolves on every tool call. If the active workspace changes mid-run —
   * a switch, or a removal, neither of which cancels an in-flight run — the two
   * stop agreeing: a trusted server starts prompting and a plan-readable one
   * gets hard-denied, both for servers that are still live in the query.
   * Pinning it here makes them agree structurally rather than by timing. Same
   * idea as resolving `cwd` once in runOnce and closing over it.
   */
  mcpScopeWorkspaceId?: string | null;
  /**
   * Cursor runs only: absolute path of the per-run in-workspace attachment
   * staging dir (`<root>/.limboo/attachments`). The read-flip hook and the
   * decideToolUse attachment carve-out honor it alongside the userData dir.
   */
  stagedAttachmentsDir?: string;
  /**
   * The `<repository-delta>` block consumed for this run. Cached here because
   * consuming marks the persisted row 'injected' (one-shot) while recovery
   * retries recompose the context — the retry must re-inject the SAME block.
   */
  resumeContext?: string;
  /** Set once the SessionStart context-injection summary has been audited (per run). */
  contextInjected?: boolean;
}

export class AgentManager {
  private state: AgentState = {
    lifecycle: 'starting',
    install: { installed: false },
    request: IDLE_REQUEST,
    activeSessionId: null,
    requestsBySession: {},
    pendingPermissions: [],
    pendingClarifications: [],
    heartbeat: { lastOkAt: null, consecutiveFailures: 0 },
  };

  private installChecked = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private rateLimitTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  /**
   * Runtime Telemetry sink. A narrow, setter-injected callback rather than a
   * new {@link AgentEvent} kind: its sources fire per API request, per delta
   * frame and per tool heartbeat, and putting that volume on the render bus
   * would oblige every present and future consumer to filter it out forever.
   * {@link AgentEvent} is also a frozen contract.
   *
   * This manager only ever OBSERVES AND FORWARDS — every decision about what a
   * measurement means lives in the telemetry accumulator.
   */
  private telemetrySink: RuntimeSink | null = null;
  /**
   * The MEASURED number of memories / search locations injected into the most
   * recent prompt, per session. Written by `memoryContextFor` /
   * `searchContextFor` — the only two places that know the real count — and
   * read once by `emitRunStart`. Reset to 0 at the top of each producer so a
   * turn that retrieves nothing cannot inherit the previous turn's number.
   */
  private readonly retrievalCounts = new Map<string, { memory: number; search: number }>();
  private readonly runtimes = new Map<string, SessionRuntime>();
  private readonly runs = new Map<string, ActiveRun>();
  /**
   * Per-session run phase. Sessions can run concurrently (see {@link runs}), so
   * this MUST be keyed by sessionId rather than a single shared value — a
   * single global field would let one session's phase transition silently
   * overwrite another's, hiding e.g. an `awaiting-permission` pause behind
   * whichever session most recently touched the state.
   */
  private readonly requests = new Map<string, RequestState>();
  /**
   * One in-flight commit-message generation per workspace. Kept fully apart
   * from {@link runs}: these one-shots never touch lifecycle, transcripts,
   * plans, or the conversation event stream.
   */
  private readonly commitGenRuns = new Map<
    string,
    { abort: AbortController; query: { close?: () => void } | null }
  >();
  /** Pending permission prompts awaiting a renderer decision, keyed by request id. */
  private readonly pending = new Map<
    string,
    {
      resolve: (r: PermissionResult) => void;
      sessionId: string;
      input: Record<string, unknown>;
      /** The full request, kept so a fresh renderer hydration can replay it via {@link getState}. */
      request: PermissionRequest;
      /** What an "always allow this session" on THIS prompt may widen. */
      scope: RememberScope;
    }
  >();
  /**
   * Pending AskUserQuestion clarifications awaiting renderer answers. Kept apart
   * from {@link pending} because the resolve shape differs — answers are folded
   * back into `updatedInput` rather than approving the original input.
   */
  private readonly pendingClarifications = new Map<
    string,
    {
      resolve: (r: PermissionResult) => void;
      sessionId: string;
      /** The original SDK input, passed back verbatim so the tool resolves. */
      input: Record<string, unknown>;
      /** The normalized questions, used to key answers and summarize the result. */
      questions: ClarificationQuestion[];
      /** The full request, kept so a fresh renderer hydration can replay it via {@link getState}. */
      request: ClarificationRequest;
    }
  >();
  /**
   * Remembered "always allow this session" choices, keyed by
   * {@link rememberKey} — `sessionId:<scope>`, where scope is the tool's RISK
   * class, or the dedicated `sensitive` scope for the secret-file guard.
   *
   * The scope is load-bearing. This set used to be keyed `sessionId:remember`
   * for every entry, which meant one "always allow" on a read silently granted
   * every later write and shell command in the session — and, because the
   * sensitive-file guard consults the same set, unlocked `.env` files and SSH
   * private keys too. A remembered choice now widens only the class the user was
   * actually shown, and secret access always requires its own explicit consent.
   * Subagents make this sharper rather than introducing it: a worker's tool
   * calls re-enter the same gate, so a blanket grant would follow them.
   */
  private readonly remembered = new Set<string>();

  constructor(
    private readonly workspace: WorkspaceManager,
    private readonly settings: SettingsManager,
    private readonly notifications: NotificationManager,
  ) {}

  /** The integrated terminal, wired after construction (avoids a ctor cycle). */
  private terminal: TerminalManager | null = null;

  /** Maps an in-flight command tool-call id → the terminal it is mirrored into. */
  private readonly mirroredCommands = new Map<string, { terminalId: string; command: string; startedAt: number }>();

  /** Inject the Terminal Manager used to mirror agent-run shell commands. */
  setTerminalManager(terminal: TerminalManager): void {
    this.terminal = terminal;
  }

  /** Sessions manager, wired after construction (used to auto-title from the first prompt). */
  private sessions: SessionManager | null = null;

  /** Inject the Session Manager so the first prompt can name an untitled session. */
  setSessionManager(sessions: SessionManager): void {
    this.sessions = sessions;
  }

  /**
   * Pin the workspace this run's MCP servers were resolved from, so the live
   * permission gate answers for the same set the run-start injection used even
   * if the active workspace changes mid-run. See `ActiveRun.mcpScopeWorkspaceId`.
   */
  private pinMcpScope(sessionId: string, fallbackWorkspaceId: string): void {
    const run = this.runs.get(sessionId);
    if (!run) return;
    run.mcpScopeWorkspaceId = this.sessions?.get(sessionId)?.workspaceId ?? fallbackWorkspaceId;
  }

  /** The pinned MCP scope for this session's active run (undefined outside a run). */
  private mcpScopeFor(sessionId: string): string | null | undefined {
    return this.runs.get(sessionId)?.mcpScopeWorkspaceId;
  }

  /**
   * Resolves a session's effective execution root (its git worktree when it
   * owns one, else the workspace path). Injected by the composition root.
   */
  private resolveSessionRoot: ((sessionId: string) => string | null) | null = null;

  /** Inject the session→root resolver (worktree-backed sessions). */
  setSessionRootResolver(resolve: (sessionId: string) => string | null): void {
    this.resolveSessionRoot = resolve;
  }

  /** Cursor print-mode runtime, wired after construction (provider dispatch). */
  private cursorRuntime: CursorRuntime | null = null;

  /** Inject the Cursor runtime so cursor-model sessions can run. */
  setCursorRuntime(runtime: CursorRuntime): void {
    this.cursorRuntime = runtime;
  }

  /** AI SDK harness runtime + its local sandbox provider (setter-injected). */
  private harnessRuntime: HarnessRuntime | null = null;
  private harnessSandbox: LocalWorktreeSandboxProvider | null = null;

  /**
   * Inject the harness runtime. Both are supplied together because the runtime
   * is useless without the provider that roots it in the session's worktree.
   */
  setHarnessRuntime(runtime: HarnessRuntime, sandbox: LocalWorktreeSandboxProvider): void {
    this.harnessRuntime = runtime;
    this.harnessSandbox = sandbox;
  }

  /**
   * True while any session has an in-flight run. Gate for maintenance
   * operations that would yank the executable out from under a live child
   * (e.g. `cursor-agent update`).
   */
  hasActiveRuns(): boolean {
    return this.runs.size > 0;
  }

  /** Cursor auth manager, wired after construction (send gating + lifecycle). */
  private cursorAuth: CursorAuthManager | null = null;

  /**
   * Inject the Cursor auth manager. When the active model is a Cursor model,
   * send-gating and lifecycle reconciliation follow its classification instead
   * of the Claude credential probe; auth flips re-reconcile live.
   */
  setCursorAuth(auth: CursorAuthManager): void {
    this.cursorAuth = auth;
    auth.onChange(() => {
      if (providerForModel(this.settings.getAll().agent.model) === 'cursor') {
        this.reconcileCursorLifecycle();
      }
    });
  }

  /**
   * Resolves whether a session's repo config is trusted (Limboo's limboo.json
   * ack-hash gate). Decides `--trust` for Cursor runs — never passed blindly.
   */
  private repoTrustResolver: ((sessionId: string) => boolean) | null = null;

  /** Inject the repo-trust resolver (WorktreeManager's ack-hash gate). */
  setRepoTrustResolver(resolve: (sessionId: string) => boolean): void {
    this.repoTrustResolver = resolve;
  }

  /** Git Manager, wired after construction (auto-checkpoints + live refresh). */
  private git: GitManager | null = null;

  /** Inject the Git Manager so the agent can checkpoint before heavy work. */
  setGitManager(git: GitManager): void {
    this.git = git;
  }

  /**
   * GitHub CLI, wired after construction. Optional by design: when `gh` is
   * absent the PR/issue tools simply do not appear on the `limboo_search`
   * server, which is the same thing the UI does.
   */
  private gh: GhManager | null = null;

  setGhManager(gh: GhManager): void {
    this.gh = gh;
  }

  /** Local Memory System, wired after construction (prompt context injection). */
  private memory: MemoryManager | null = null;

  /**
   * Inject the Memory Manager. Memory is a platform service owned by the app, not
   * the agent — the manager only *consumes* it to enrich each prompt with the most
   * relevant project knowledge before the harness runs.
   */
  setMemoryManager(memory: MemoryManager): void {
    this.memory = memory;
  }

  /** Resume Pipeline, wired after construction (repository-delta injection). */
  private resume: ResumeManager | null = null;

  /**
   * Inject the Resume Manager. Resume is a platform service owned by the app —
   * the agent only *consumes* it: the one-shot `<repository-delta>` block on
   * the first prompt after a divergence, plus the run-end snapshot signal.
   */
  setResumeManager(resume: ResumeManager): void {
    this.resume = resume;
  }

  /** MCP platform, wired after construction (provider-neutral tool servers). */
  private mcp: McpManager | null = null;

  /**
   * Inject the MCP Manager. MCP is a platform service owned by the app — both
   * providers CONSUME the same registry: Claude via `options.mcpServers`
   * (+ trusted `allowedTools`), Cursor via the generated `.cursor/mcp.json`
   * (+ `Mcp()` allow rules). Every resulting tool call still flows through
   * {@link decideToolUse}; trusted servers are the only auto-approve widening.
   */
  setMcpManager(mcp: McpManager): void {
    this.mcp = mcp;
  }

  /** Provider-Neutral Hook Engine, wired after construction (governance/audit). */
  private hooks: HookEngine | null = null;

  /**
   * Inject the Hook Engine. The agent EMITS normalized lifecycle events onto it
   * (session/prompt/tool/checkpoint/subagent) so both providers produce one
   * identical audit trail. The engine holds no policy — enforcement stays in
   * {@link decideToolUse}; the engine only records the outcome.
   */
  setHookEngine(hooks: HookEngine): void {
    this.hooks = hooks;
  }

  /**
   * Optional Work Graph permission sink. Everything else the graph needs
   * already arrives on the public {@link onEvent} stream; permission decisions
   * do not, because the decision is computed inside the gate and only its
   * *effect* is observable. A structural type keeps the coupling one-way.
   */
  private graph: { onDecision(sessionId: string, signal: PermissionDecisionSignal): void } | null =
    null;

  /** Wire the Work Graph so permission gates become approval nodes. */
  setWorkGraph(graph: {
    onDecision(sessionId: string, signal: PermissionDecisionSignal): void;
  }): void {
    this.graph = graph;
  }

  /**
   * Emit one normalized {@link HookEvent} onto the Hook Engine. The engine
   * stamps the provider + id + timestamp and redacts every string, so this is a
   * thin, never-throwing delegate. A no-op when the engine is unwired.
   */
  private emitHook(sessionId: string, phase: HookEvent['phase'], opts: HookEmit = {}): void {
    this.hooks?.emit(sessionId, phase, opts);
  }

  /** Attachment Manager, wired after construction (session-owned staged files). */
  private attachments: AttachmentManager | null = null;

  /**
   * Inject the Attachment Manager. Attachments are a platform service owned by
   * the app — the agent *consumes* them: a per-turn manifest, read access to the
   * session's staging dir, vision blocks for images, and read-status tracking.
   */
  setAttachmentManager(attachments: AttachmentManager): void {
    this.attachments = attachments;
  }

  /** The session's staging dir, or null when it has no attachments. */
  private attachmentsDirFor(sessionId: string): string | null {
    if (!this.attachments) return null;
    try {
      return this.attachments.hasAny(sessionId) ? this.attachments.sessionDir(sessionId) : null;
    } catch {
      return null;
    }
  }

  /**
   * Build the system-prompt addition that injects ranked, relevant memories for a
   * prompt. Returns undefined when memory is disabled / not injecting / empty.
   * Fully local and best-effort: a failure never blocks the run.
   */
  private memoryContextFor(sessionId: string, prompt: string): string | undefined {
    this.retrievalCounts.set(sessionId, {
      ...(this.retrievalCounts.get(sessionId) ?? { memory: 0, search: 0 }),
      memory: 0,
    });
    if (!this.memory) return undefined;
    const cfg = this.settings.getAll().memory;
    if (!cfg.enabled || !cfg.injectIntoPrompt) return undefined;
    try {
      const ws = this.workspace.getActive();
      const hits = this.memory.retrieve({
        workspaceId: ws?.id ?? null,
        sessionId,
        prompt,
        limit: cfg.maxInjected,
      });
      const block = this.memory.buildContextBlock(hits);
      if (block) {
        // The MEASURED hit count, for Runtime Telemetry. `cfg.maxInjected` is a
        // ceiling and reporting it as "memories injected" would be a fabricated
        // number in a subsystem whose whole premise is that it never fabricates.
        this.retrievalCounts.set(sessionId, {
          ...(this.retrievalCounts.get(sessionId) ?? { memory: 0, search: 0 }),
          memory: hits.length,
        });
        this.diag('request', 'debug', `Injected ${hits.length} memories`, undefined, sessionId);
        // Surface an inline marker in the conversation so the recall is visible in
        // the timeline, not just the diagnostics console.
        const label = hits.length === 1 ? 'Recalled 1 memory' : `Recalled ${hits.length} memories`;
        this.pushActivity(sessionId, 'status', label, undefined, 'info');
      }
      return block || undefined;
    } catch (err) {
      logger.warn('memory: context build failed', err);
      return undefined;
    }
  }

  /** Search Engine, wired after construction (retrieval-based prompt context). */
  private search: SearchManager | null = null;

  /**
   * Inject the Search Manager. Search is a platform service owned by the app — the
   * agent only *consumes* it to enrich each prompt with the files/symbols/docs most
   * relevant to the task, so the harness explores less before doing real work.
   */
  setSearchManager(search: SearchManager): void {
    this.search = search;
  }

  /**
   * Build the system-prompt addition that injects ranked, relevant project context
   * (files/symbols/docs) for a prompt. Returns undefined when search is disabled /
   * not injecting / empty. Fully local and best-effort: a failure never blocks the
   * run. Advisory to the agent — its own Read/Grep/Glob remain authoritative.
   */
  private searchContextFor(sessionId: string, prompt: string): string | undefined {
    this.retrievalCounts.set(sessionId, {
      ...(this.retrievalCounts.get(sessionId) ?? { memory: 0, search: 0 }),
      search: 0,
    });
    if (!this.search) return undefined;
    const cfg = this.settings.getAll().search;
    if (!cfg.enabled || !cfg.injectContext) return undefined;
    try {
      const ws = this.workspace.getActive();
      const hits = this.search.retrieveContext({
        workspaceId: ws?.id ?? null,
        prompt,
        limit: cfg.maxInjected,
      });
      const block = this.search.buildContextBlock(hits);
      if (block) {
        // Measured, not the configured ceiling — see `memoryContextFor`.
        this.retrievalCounts.set(sessionId, {
          ...(this.retrievalCounts.get(sessionId) ?? { memory: 0, search: 0 }),
          search: hits.length,
        });
        this.diag('request', 'debug', `Injected ${hits.length} context items`, undefined, sessionId);
        const label =
          hits.length === 1 ? 'Retrieved 1 relevant location' : `Retrieved ${hits.length} relevant locations`;
        this.pushActivity(sessionId, 'status', label, undefined, 'info');
      }
      return block || undefined;
    } catch (err) {
      logger.warn('search: context build failed', err);
      return undefined;
    }
  }

  /**
   * Build the system-prompt addition that injects the pending repository delta
   * (repo changes since this session's last snapshot). One-shot per delta: the
   * first consumption marks the persisted row 'injected'; the rendered block is
   * cached on the in-flight run so recovery retries re-inject the same block.
   * Fully local and best-effort: a failure never blocks the run.
   */
  private resumeContextFor(sessionId: string): string | undefined {
    if (!this.resume) return undefined;
    const cfg = this.settings.getAll().resume;
    if (!cfg.enabled || !cfg.injectDelta) return undefined;
    try {
      const run = this.runs.get(sessionId);
      if (run?.resumeContext) return run.resumeContext;
      const block = this.resume.consumePendingDelta(sessionId);
      if (block) {
        if (run) run.resumeContext = block;
        this.diag('request', 'debug', 'Injected repository delta', undefined, sessionId);
        this.pushActivity(sessionId, 'status', 'Injected repository delta', undefined, 'info');
      }
      return block;
    } catch (err) {
      logger.warn('resume: context build failed', err);
      return undefined;
    }
  }

  /**
   * Create one automatic checkpoint per run, the first time the agent performs a
   * write/command, so the pre-edit state is always recoverable. Fire-and-forget:
   * never blocks or fails the stream. Honors the `git.autoCheckpoint` setting.
   */
  private maybeAutoCheckpoint(sessionId: string): void {
    if (!this.git) return;
    const run = this.runs.get(sessionId);
    if (!run || run.checkpointed) return;
    run.checkpointed = true;
    if (!this.settings.getAll().git.autoCheckpoint) return;
    const ws = this.workspace.getActive();
    if (!ws) return;
    void this.git
      // Anchored to the user turn that started this run: it is what lets the
      // conversation offer "revert to before this message" without asking the
      // user to match a timestamp against a list of checkpoints.
      .createCheckpoint(ws.id, sessionId, 'Before agent changes', {
        auto: true,
        messageId: run.userMessageId,
      })
      // No activity push here: `GitManager.createCheckpoint` records the
      // structured `git` entry itself (with `origin: 'agent'`, which its `auto`
      // flag identifies), so pushing a plain status marker too would show the
      // same checkpoint twice in the stream.
      .catch(() => {
        /* checkpointing is best-effort and never breaks a run */
      });
  }

  /* ---------------------------------------------------------------- */
  /* Public API (reached via IPC)                                     */
  /* ---------------------------------------------------------------- */

  /**
   * A fresh snapshot including live per-session data, so a renderer hydrating
   * after a reload (or a second window opening) can rebuild every session's
   * pending request/clarification/phase — not just whatever `agentStateChanged`
   * last broadcast, which only carries the fields in {@link setState} patches.
   */
  getState(): AgentState {
    this.healPhantomRequests();
    return {
      ...this.state,
      requestsBySession: Object.fromEntries(this.requests),
      pendingPermissions: [...this.pending.values()].map((p) => p.request),
      pendingClarifications: [...this.pendingClarifications.values()].map((p) => p.request),
    };
  }

  /**
   * Reconcile any request phase that claims to be in flight while `runs` holds
   * no entry for it. The phase map is authoritative for every busy/disabled
   * control in the UI — including the plan's Approve buttons, which are gated on
   * it while Reject is not, so a phase that outlives its run reads to the user
   * as "I can only reject". A run that ends without reaching `completeRequest`
   * (a window reload mid-run, an iterator that never unwinds after the
   * ExitPlanMode interrupt) left exactly that, and `getState` replayed it to
   * every hydrating window. Proving the phase against the run map on the way out
   * makes it self-healing.
   */
  private healPhantomRequests(): void {
    for (const [sessionId, request] of this.requests) {
      if (!RUNNING_REQUEST_PHASES.includes(request.phase)) continue;
      if (this.runs.has(sessionId)) continue;
      this.diag(
        'request',
        'warning',
        `Cleared a stale '${request.phase}' phase with no live run`,
        undefined,
        sessionId,
      );
      // Through setRequest so live windows heal too, not just the hydrating one.
      this.setRequest(sessionId, { phase: 'done', outcome: 'cancelled', attempt: 0 });
    }
  }

  /**
   * Boot the manager: probe the capability once, then begin heartbeat
   * supervision. Called from the main-process wiring after construction.
   */
  start(): void {
    this.setLifecycle('initializing');
    this.diag('lifecycle', 'info', 'Agent manager starting');
    this.reconcilePlans();
    this.lastModel = this.settings.getAll().agent.model;
    this.probeHealth(true);
    this.startHeartbeat();
    this.sweepDiagnostics();
    // Re-tune the heartbeat whenever connection settings change.
    this.settings.onChange(() => this.reconfigure());
  }

  /**
   * Detect whether Claude Code is usable. The SDK bundles the runtime, so this
   * really checks for available authentication — Claude Code owns auth and we
   * never read the secret itself, only whether one is configured. Cached for the
   * IPC accessor; {@link probeHealth} forces a fresh read.
   */
  getInstall(): AgentInstall {
    if (this.installChecked) return this.state.install;
    return this.probeHealth(true);
  }

  /**
   * Re-read install/auth presence and reconcile the lifecycle. `force` bypasses
   * the cache (used by the heartbeat). Only checks for the *presence* of creds —
   * never reads the secret.
   */
  private probeHealth(force = false): AgentInstall {
    if (this.installChecked && !force) return this.state.install;
    this.installChecked = true;

    const hasEnvToken =
      !!process.env.ANTHROPIC_API_KEY ||
      !!process.env.ANTHROPIC_AUTH_TOKEN ||
      !!process.env.CLAUDE_CODE_OAUTH_TOKEN;

    const home = os.homedir();
    const credFiles = [
      path.join(home, '.claude', '.credentials.json'),
      path.join(home, '.claude.json'),
    ];
    const hasCredFile = credFiles.some((f) => {
      try {
        return fs.existsSync(f);
      } catch {
        return false;
      }
    });

    const install: AgentInstall = hasEnvToken || hasCredFile
      ? { installed: true }
      : {
          installed: false,
          error:
            'Claude Code is not authenticated. Open a terminal, run `claude`, and sign in — Limboo reuses that login.',
        };

    // When the active model is a Cursor model, `install` stays the Claude
    // truth (the Providers card reads it) but the lifecycle — what actually
    // gates the composer — follows the Cursor auth classification instead.
    if (providerForModel(this.settings.getAll().agent.model) === 'cursor') {
      this.setState({ install });
      this.reconcileCursorLifecycle();
      return install;
    }

    // Reconcile lifecycle without clobbering an in-flight run's state.
    const busy = this.runs.size > 0;
    let lifecycle = this.state.lifecycle;
    if (!install.installed) {
      lifecycle = 'not-installed';
    } else if (!busy && (this.state.lifecycle === 'starting' || this.state.lifecycle === 'initializing' || this.state.lifecycle === 'not-installed' || this.state.lifecycle === 'auth-required')) {
      lifecycle = 'ready';
    }
    this.setState({ install, lifecycle, error: install.installed ? undefined : this.state.error });
    return install;
  }

  /**
   * Lifecycle reconciliation for the Cursor provider — mirrors the Claude arm
   * of {@link probeHealth} but sources from the CursorAuthManager's memoized
   * classification. Never spawns; an `unknown` state kicks a lazy async probe
   * whose completion re-enters here via the onChange subscription.
   */
  private reconcileCursorLifecycle(): void {
    if (!this.cursorAuth) return;
    const auth = this.cursorAuth.getCachedState();
    const busy = this.runs.size > 0;
    const settling =
      this.state.lifecycle === 'starting' ||
      this.state.lifecycle === 'initializing' ||
      this.state.lifecycle === 'not-installed' ||
      this.state.lifecycle === 'auth-required';
    let lifecycle = this.state.lifecycle;
    if (auth.status === 'not-installed') {
      lifecycle = 'not-installed';
    } else if (auth.status === 'not-authenticated') {
      lifecycle = 'auth-required';
    } else if (auth.status === 'authenticated-cli' || auth.status === 'authenticated-api-key') {
      if (!busy && settling) lifecycle = 'ready';
    } else {
      // 'unknown' — never gate on an unprobed state; classify in the background.
      void this.cursorAuth.probe(false);
      if (!busy && (this.state.lifecycle === 'starting' || this.state.lifecycle === 'initializing')) {
        lifecycle = 'ready';
      }
    }
    if (lifecycle !== this.state.lifecycle) this.setState({ lifecycle });
  }

  /**
   * Send-gate for Cursor runs: the runtime must be wired and the CLI both
   * installed and authenticated. Awaits the first classification when nothing
   * has probed yet (bounded by CURSOR_LIMITS timeouts) so a fresh boot can't
   * slip an unauthenticated run through.
   */
  private async assertCursorReady(): Promise<void> {
    if (!this.cursorRuntime || !this.cursorAuth) {
      throw new Error('The Cursor runtime is not available.');
    }
    const auth = this.cursorAuth.hasProbed()
      ? this.cursorAuth.getCachedState()
      : await this.cursorAuth.probe(false);
    if (auth.status === 'not-installed') {
      this.setLifecycle('not-installed');
      throw new Error(
        auth.error ?? 'The Cursor CLI is not installed. Install cursor-agent, then retry.',
      );
    }
    if (auth.status === 'not-authenticated' || auth.status === 'unknown') {
      this.setLifecycle('auth-required');
      throw new Error(
        'Cursor is not signed in. Sign in or add an API key under Settings › Agent › Providers.',
      );
    }
  }

  /** Force a fresh auth probe — invoked after the user signs in again. */
  retryAuth(): AgentInstall {
    this.diag('auth', 'info', 'Re-checking Claude Code authentication');
    return this.probeHealth(true);
  }

  /** The model at the last settings read — a provider flip re-gates the composer. */
  private lastModel: string | null = null;

  /** Re-read connection settings and restart the heartbeat with new cadence. */
  reconfigure(): void {
    this.startHeartbeat();
    const model = this.settings.getAll().agent.model;
    if (this.lastModel !== null && this.lastModel !== model) this.probeHealth(true);
    this.lastModel = model;
  }

  /** Restore a session's transcript + activity (from SQLite) plus live state. */
  getSnapshot(sessionId: string): AgentSessionSnapshot {
    const rt = this.runtimes.get(sessionId);
    return {
      messages: this.loadMessages(sessionId),
      activity: this.loadActivity(sessionId),
      changes: rt ? [...rt.changes.values()] : [],
      tasks: rt ? rt.tasks : [],
      // Live runtime calls win; persisted subagent rows fill in the delegations
      // this process no longer holds in memory (see loadSubagentRuns).
      toolCalls: this.mergeSubagentRuns(sessionId, rt ? rt.toolCalls : []),
      plan: this.loadPlan(sessionId),
    };
  }

  /** Merge persisted subagent rows under the live tool calls, de-duped by id. */
  private mergeSubagentRuns(sessionId: string, live: AgentToolCall[]): AgentToolCall[] {
    const stored = this.loadSubagentRuns(sessionId);
    if (stored.length === 0) return live;
    const seen = new Set(live.map((c) => c.id));
    const extra = stored.filter((c) => !seen.has(c.id));
    if (extra.length === 0) return live;
    return [...extra, ...live].sort((a, b) => a.startedAt - b.startedAt);
  }

  /** Load the persisted diagnostics console history (global or per-session). */
  getDiagnostics(sessionId?: string | null): AgentDiagnostic[] {
    const db = getDb();
    const rows = (
      sessionId
        ? db
            .prepare(
              'SELECT id, session_id, severity, category, label, detail, created_at FROM agent_diagnostics WHERE session_id = ? ORDER BY created_at DESC LIMIT 500',
            )
            .all(sessionId)
        : db
            .prepare(
              'SELECT id, session_id, severity, category, label, detail, created_at FROM agent_diagnostics ORDER BY created_at DESC LIMIT 500',
            )
            .all()
    ) as Array<{
      id: string;
      session_id: string | null;
      severity: string;
      category: string;
      label: string;
      detail: string | null;
      created_at: number;
    }>;
    return rows
      .map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        severity: r.severity as DiagnosticSeverity,
        category: r.category as DiagnosticCategory,
        label: r.label,
        detail: r.detail ?? undefined,
        at: r.created_at,
      }))
      .reverse();
  }

  /** Resolve a pending permission prompt from the renderer. */
  respondPermission(decision: PermissionDecision): void {
    const entry = this.pending.get(decision.id);
    if (!entry) return;
    this.pending.delete(decision.id);

    if (decision.behavior === 'allow') {
      // Widen only the scope this prompt was actually about — see `remembered`.
      if (decision.remember) this.remembered.add(rememberKey(entry.sessionId, entry.scope));
      this.diag('tool', 'info', 'Tool approved', undefined, entry.sessionId);
      entry.resolve({ behavior: 'allow', updatedInput: entry.input });
    } else {
      this.diag('tool', 'warning', 'Tool rejected', decision.message, entry.sessionId);
      entry.resolve({
        behavior: 'deny',
        message: decision.message || 'Denied by the user.',
      });
    }

    // Drop back to streaming if there are no other prompts outstanding.
    if (
      this.pending.size === 0 &&
      this.pendingClarifications.size === 0 &&
      this.runs.has(entry.sessionId)
    ) {
      this.setLifecycle('streaming');
      this.setRequest(entry.sessionId, { phase: 'streaming' });
    }
  }

  /**
   * AskUserQuestion bridge: surface the agent's clarifying questions to the
   * renderer and pause the run until answers come back. The returned promise is
   * the `canUseTool` result — resolving it with `{ behavior: 'allow', updatedInput }`
   * resumes the SDK with the user's selections folded into the tool input.
   */
  private requestClarification(
    sessionId: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<PermissionResult> {
    const questions = normalizeQuestions(input);
    if (questions.length === 0) {
      return Promise.resolve({
        behavior: 'deny',
        message: 'No well-formed questions were provided.',
      });
    }

    const request: ClarificationRequest = {
      id: newId(),
      sessionId,
      questions,
      createdAt: Date.now(),
    };
    const headers = questions.map((q) => q.header).join(', ');
    // No persisted activity yet — the live "Waiting for your decision…" row in
    // the stream (driven by pendingClarification) covers the paused moment, and
    // resolving records the answered summary. This avoids a duplicate marker.
    this.diag('tool', 'info', 'Clarification requested', headers, sessionId);
    this.setLifecycle('awaiting-permission');
    this.setRequest(sessionId, { phase: 'awaiting-permission' });
    this.broadcastChannel(IpcEvents.agentClarificationRequest, request);

    return new Promise<PermissionResult>((resolve) => {
      const onAbort = () => {
        this.pendingClarifications.delete(request.id);
        resolve({ behavior: 'deny', message: 'Run stopped.', interrupt: true });
      };
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
      this.pendingClarifications.set(request.id, {
        sessionId,
        input,
        questions,
        request,
        resolve: (r) => {
          signal.removeEventListener('abort', onAbort);
          resolve(r);
        },
      });
    });
  }

  /** Resolve a pending AskUserQuestion clarification with the user's answers. */
  respondClarification(decision: ClarificationDecision): void {
    const entry = this.pendingClarifications.get(decision.id);
    if (!entry) return;
    this.pendingClarifications.delete(decision.id);

    // Build a clean answers map keyed only by known question texts (defense in
    // depth: never trust renderer-supplied keys, and drop prototype-pollution keys).
    const answers: Record<string, string | string[]> = Object.create(null);
    const summary: string[] = [];
    for (const q of entry.questions) {
      if (q.question === '__proto__' || q.question === 'constructor' || q.question === 'prototype') {
        continue;
      }
      const value = decision.answers?.[q.question];
      if (value === undefined) continue;
      answers[q.question] = value;
      const text = Array.isArray(value) ? value.join(', ') : value;
      summary.push(`${q.header}: ${text}`);
    }

    const response = typeof decision.response === 'string' ? decision.response.trim() : '';
    // The SDK requires the original questions array passed back verbatim.
    const updatedInput: Record<string, unknown> = { questions: entry.input.questions, answers };
    if (response) updatedInput.response = response;

    const label = response
      ? `Replied: ${truncate(response, 80)}`
      : summary.length > 0
        ? `Answered: ${truncate(summary.join(' · '), 120)}`
        : 'Answered';
    this.pushActivity(entry.sessionId, 'clarification', label, summary.join('\n') || undefined, 'success');
    this.diag('tool', 'info', 'Clarification answered', label, entry.sessionId);
    entry.resolve({ behavior: 'allow', updatedInput });

    // Drop back to streaming if there are no other prompts outstanding.
    if (
      this.pending.size === 0 &&
      this.pendingClarifications.size === 0 &&
      this.runs.has(entry.sessionId)
    ) {
      this.setLifecycle('streaming');
      this.setRequest(entry.sessionId, { phase: 'streaming' });
    }
  }

  /** Abort the active run for a session. */
  stop(sessionId: string): void {
    const run = this.runs.get(sessionId);
    if (!run) return;

    // Stopping kills the provider mid-turn. If a tool call is unanswered at
    // this moment, the provider's own transcript is left ending in a tool_use
    // with no tool_result — a shape it rejects on EVERY replay. The stored
    // resume/chat id points straight at it, so the next message would fail with
    // `[ede_diagnostic] … stop_reason=tool_use` before the user typed anything
    // wrong. Forget the id here, while we still know a tool was in flight:
    // recovering after the fact costs the user a failed turn, and detecting it
    // after the fact depends on which of two provider error paths wins a race.
    // Only the PROVIDER's conversation memory resets — Limboo's transcript,
    // activity and checkpoints are untouched and keep rendering.
    if (this.hasRunningToolCalls(sessionId)) {
      const provider = providerForModel(this.settings.getAll().agent.model);
      if (this.loadProviderSession(sessionId, provider)) {
        this.forgetProviderSession(sessionId, provider);
        this.diag(
          'recovery',
          'info',
          'Stopped mid-tool — the next message starts a fresh provider conversation',
          undefined,
          sessionId,
        );
      }
    }

    run.abort.abort();
    try {
      run.query?.close?.();
    } catch {
      /* already closed */
    }
    // Reject any prompts tied to this session so canUseTool unblocks.
    for (const [id, entry] of this.pending) {
      if (entry.sessionId === sessionId) {
        this.pending.delete(id);
        entry.resolve({ behavior: 'deny', message: 'Run stopped by the user.', interrupt: true });
      }
    }
    // Clarifications block canUseTool exactly like permissions do; draining only
    // `pending` left them to unwind via their abort listener alone.
    for (const [id, entry] of this.pendingClarifications) {
      if (entry.sessionId === sessionId) {
        this.pendingClarifications.delete(id);
        entry.resolve({ behavior: 'deny', message: 'Run stopped by the user.', interrupt: true });
      }
    }
    this.runs.delete(sessionId);
    this.completeRequest(sessionId, 'cancelled');
    if (!this.isCapabilityDegraded()) this.setLifecycle('ready', { activeSessionId: null });
    this.diag('request', 'warning', 'Run cancelled', undefined, sessionId);
    this.pushEvent({ kind: 'activity', sessionId, item: this.activity(sessionId, 'status', 'Run stopped', undefined, 'warning') });
  }

  /**
   * Await the teardown of an in-flight run for this session, then confirm it is
   * idle. A captured plan is published from INSIDE the still-live run — Claude's
   * ExitPlanMode interrupt has not finished unwinding the SDK, and Cursor's
   * promise has not settled — so the Approve/Keep-planning click a user makes the
   * instant the plan appears legitimately lands while `runs` still holds the
   * entry. Waiting for the settle is the correct answer there; rejecting it (as
   * `send`'s own guard does) surfaced as a spurious "the agent is already working
   * on this session".
   *
   * Falls back to the same refusal if the run is genuinely still going after the
   * timeout — a busy session must still say no.
   */
  private async waitForRunSettle(sessionId: string): Promise<void> {
    const run = this.runs.get(sessionId);
    if (!run) return;
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        run.settled,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, RUN_SETTLE_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (this.runs.has(sessionId)) {
      throw new Error('The agent is already working on this session.');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Conversation revert                                              */
  /* ---------------------------------------------------------------- */

  /**
   * Look up the anchor a revert to `messageId` would use, without touching
   * anything. Everything the confirmation dialog states is measured here — a
   * revert is close enough to irreversible that the user must be told the real
   * numbers, not an estimate.
   */
  async revertPreview(sessionId: string, messageId: string): Promise<ConversationRevertPreview> {
    const base: ConversationRevertPreview = {
      sessionId,
      messageId,
      checkpoint: null,
      messagesDropped: 0,
      activityDropped: 0,
      filesReverted: 0,
      filesRemoved: 0,
      resetsProviderSession: false,
    };
    if (this.runs.has(sessionId)) {
      return { ...base, blocked: 'The agent is still working on this session.' };
    }
    const db = getDb();
    const row = db
      .prepare('SELECT created_at FROM agent_messages WHERE id = ? AND session_id = ?')
      .get(messageId, sessionId) as { created_at: number } | undefined;
    if (!row) return { ...base, blocked: 'That message is no longer in this session.' };

    const messagesDropped = (
      db
        .prepare('SELECT COUNT(*) AS n FROM agent_messages WHERE session_id = ? AND created_at > ?')
        .get(sessionId, row.created_at) as { n: number }
    ).n;
    const activityDropped = (
      db
        .prepare('SELECT COUNT(*) AS n FROM agent_activity WHERE session_id = ? AND created_at > ?')
        .get(sessionId, row.created_at) as { n: number }
    ).n;
    const resetsProviderSession =
      (
        db
          .prepare('SELECT COUNT(*) AS n FROM agent_provider_sessions WHERE session_id = ?')
          .get(sessionId) as { n: number }
      ).n > 0;

    const checkpoint = this.git?.checkpointForMessage(sessionId, messageId, row.created_at) ?? null;
    if (!checkpoint) {
      return {
        ...base,
        messagesDropped,
        activityDropped,
        resetsProviderSession,
        blocked:
          'No checkpoint guards this turn, so the repository cannot be restored. Enable automatic checkpoints in Settings › Git.',
      };
    }
    // Measure the repository side against the same diff the restore will act on,
    // so the dialog's numbers are the operation's numbers rather than a guess.
    // "added" here means "appeared since the checkpoint", i.e. what gets removed.
    let filesReverted = 0;
    let filesRemoved = 0;
    try {
      const counts = await this.git?.previewRestore(checkpoint.workspaceId, checkpoint.id);
      filesReverted = counts?.filesReverted ?? 0;
      filesRemoved = counts?.filesRemoved ?? 0;
    } catch (err) {
      logger.warn('revertPreview: could not measure the checkpoint', err);
    }

    return {
      ...base,
      checkpoint,
      messagesDropped,
      activityDropped,
      resetsProviderSession,
      filesReverted,
      filesRemoved,
    };
  }

  /**
   * Roll the session back to just before `messageId`.
   *
   * This is a SESSION-level rollback, not a git revert: it restores the
   * repository from the checkpoint that guards the turn, truncates the
   * transcript after it, and invalidates the provider resume token so the next
   * prompt opens a conversation that matches the repository again — leaving the
   * agent "remembering" work that no longer exists is the failure mode that
   * makes a half-revert worse than none.
   *
   * Nothing is erased from the audit trail: checkpoints are kept (including the
   * safety checkpoint the restore takes of the pre-revert state), and the revert
   * itself is recorded as a new immutable timeline event.
   *
   * Provider-neutral by construction — `agent_provider_sessions` is keyed by
   * provider, so one delete covers Claude and Cursor alike.
   */
  async revertToMessage(sessionId: string, messageId: string): Promise<ConversationRevertResult> {
    const preview = await this.revertPreview(sessionId, messageId);
    const git = this.git;
    if (preview.blocked || !preview.checkpoint || !git) {
      return {
        ok: false,
        messagesDropped: 0,
        activityDropped: 0,
        error: preview.blocked ?? 'Nothing to revert to.',
      };
    }
    const checkpoint = preview.checkpoint;

    const restore = await git.restoreCheckpoint(checkpoint.workspaceId, checkpoint.id);
    if (!restore.ok) {
      return {
        ok: false,
        messagesDropped: 0,
        activityDropped: 0,
        error: restore.error ?? 'The repository could not be restored.',
      };
    }

    const db = getDb();
    const at = (
      db.prepare('SELECT created_at FROM agent_messages WHERE id = ?').get(messageId) as {
        created_at: number;
      }
    ).created_at;

    // Truncate forward conversation state. Checkpoints and diagnostics are NOT
    // touched — they are the record of what happened, which a rollback adds to
    // rather than rewrites.
    const truncate = db.transaction(() => {
      db.prepare('DELETE FROM agent_messages WHERE session_id = ? AND created_at > ?').run(
        sessionId,
        at,
      );
      db.prepare('DELETE FROM agent_activity WHERE session_id = ? AND created_at > ?').run(
        sessionId,
        at,
      );
      db.prepare('DELETE FROM agent_provider_sessions WHERE session_id = ?').run(sessionId);
      db.prepare('DELETE FROM agent_session_meta WHERE session_id = ?').run(sessionId);
      // A plan captured after the anchor describes work that no longer exists.
      db.prepare('DELETE FROM agent_plans WHERE session_id = ? AND created_at > ?').run(
        sessionId,
        at,
      );
    });
    truncate();

    // In-memory runtime state (tool rows, tasks, live changes) belongs to the
    // truncated turns; dropping it lets the next snapshot rebuild cleanly.
    this.runtimes.delete(sessionId);

    const detail =
      `${restore.filesReverted} file${restore.filesReverted === 1 ? '' : 's'} restored` +
      (restore.filesRemoved > 0 ? `, ${restore.filesRemoved} removed` : '') +
      `, ${preview.messagesDropped} message${preview.messagesDropped === 1 ? '' : 's'} dropped`;
    this.pushActivity(
      sessionId,
      'status',
      `Reverted to checkpoint — ${checkpoint.label}`,
      detail.slice(0, ACTIVITY_LIMITS.detailMax),
      'warning',
    );

    // Re-anchor the resume snapshot: the repository just moved under it, and a
    // stale anchor would make the next activation report a phantom delta.
    this.resume?.onCheckpointCreated(sessionId);

    return {
      ok: true,
      restore,
      messagesDropped: preview.messagesDropped,
      activityDropped: preview.activityDropped,
    };
  }

  /** Forget a session entirely (transcript, activity, runtime state). */
  clearSession(sessionId: string): void {
    this.stop(sessionId);
    // Governance bus: the session's execution context is ending. Emit before the
    // rows are deleted (the audit trail for this session is cleared with them).
    this.emitHook(sessionId, 'session-end', { summary: 'Session cleared' });
    this.runtimes.delete(sessionId);
    this.retrievalCounts.delete(sessionId);
    const db = getDb();
    db.prepare('DELETE FROM agent_messages WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM agent_activity WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM agent_session_meta WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM agent_provider_sessions WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM agent_diagnostics WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM agent_plans WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM hook_audit WHERE session_id = ?').run(sessionId);
    // Work Graph: edges BEFORE nodes. The FK cascade would handle it, but being
    // explicit keeps this correct even if `foreign_keys` is ever off.
    db.prepare('DELETE FROM work_graph_edges WHERE session_id = ?').run(sessionId);
    db.prepare('DELETE FROM work_graph_nodes WHERE session_id = ?').run(sessionId);
  }

  /** Abort every active run + stop all supervision timers. Called on quit. */
  cleanup(): void {
    for (const sessionId of [...this.runs.keys()]) this.stop(sessionId);
    for (const workspaceId of [...this.commitGenRuns.keys()]) this.cancelCommitMessage(workspaceId);
    this.stopHeartbeat();
    this.clearRateLimitTimer();
    this.clearIdleTimer();
  }

  /* ---------------------------------------------------------------- */
  /* Git commit-message sub-agent (isolated one-shot)                 */
  /* ---------------------------------------------------------------- */

  /**
   * Generate a commit message for the staged changes described by `ctx` (built
   * main-side by GitManager — never renderer-supplied). Runs an isolated,
   * tool-less, single-turn SDK query and streams the text to the renderer over
   * `IpcEvents.gitCommitMessageStream`. It only PROPOSES a message: nothing here
   * ever calls `git commit`. The run never touches lifecycle, transcripts,
   * memory/search context, MCP servers, or the conversation event stream.
   */
  async generateCommitMessage(
    workspaceId: string,
    ctx: GitCommitContext,
  ): Promise<GenerateCommitMessageResult> {
    // Gate on the ACTIVE provider, not unconditionally on Claude. This ran the
    // Claude SDK regardless of what the user had selected, so a Cursor-only user
    // clicking "generate commit message" launched a Claude Code run — and, with
    // Claude not installed, was told "Claude Code unavailable" by a feature they
    // never asked Claude for.
    const commitProvider = providerForModel(this.settings.getAll().agent.model);
    if (commitProvider === 'cursor') {
      const cursorState = this.cursorAuth?.getCachedState();
      const ready =
        cursorState?.status === 'authenticated-cli' ||
        cursorState?.status === 'authenticated-api-key';
      if (!ready) {
        return {
          ok: false,
          reason: 'agent-unavailable',
          error: cursorState?.error ?? 'Sign in to Cursor to generate commit messages.',
        };
      }
    } else {
      const install = this.getInstall();
      if (!install.installed) {
        return { ok: false, reason: 'agent-unavailable', error: install.error };
      }
    }
    if (this.state.lifecycle === 'rate-limited') {
      return {
        ok: false,
        reason: 'rate-limited',
        error: this.state.rateLimit?.message ?? 'The agent is rate limited right now.',
      };
    }
    if (this.commitGenRuns.has(workspaceId)) {
      return { ok: false, reason: 'busy', error: 'A commit message is already being generated.' };
    }

    const requestId = newId();
    const abort = new AbortController();
    const run: { abort: AbortController; query: { close?: () => void } | null } = {
      abort,
      query: null,
    };
    this.commitGenRuns.set(workspaceId, run);

    // Governance bus: the commit-message generator is an isolated, tool-less
    // sub-agent. Scope its lifecycle to the active session (best-effort) so it
    // branches into that session's audit trail (Claude-only — Cursor CLI print
    // mode has no subagents).
    const subagentSession = this.state.activeSessionId;
    if (subagentSession) {
      this.emitHook(subagentSession, 'subagent-start', { summary: 'Commit-message sub-agent' });
    }

    const emit = (ev: Omit<GitCommitMessageStreamEvent, 'workspaceId' | 'requestId'>): void => {
      const payload: GitCommitMessageStreamEvent = { workspaceId, requestId, ...ev };
      this.broadcastChannel(IpcEvents.gitCommitMessageStream, payload);
    };

    // Coalesced-delta state, mirroring runOnce's DELTA_FLUSH_* pattern.
    let pendingDelta = '';
    let flushTimer: NodeJS.Timeout | null = null;
    const flushDelta = (): void => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (pendingDelta.length === 0) return;
      const text = pendingDelta;
      pendingDelta = '';
      emit({ kind: 'delta', text });
    };
    const queueDelta = (text: string): void => {
      pendingDelta += text;
      if (pendingDelta.length >= DELTA_FLUSH_CHARS) flushDelta();
      else if (!flushTimer) flushTimer = setTimeout(flushDelta, DELTA_FLUSH_MS);
    };

    try {
      const prompt = buildCommitPrompt(ctx);
      if (prompt.length > AGENT_LIMITS.promptMax) {
        // Belt + braces: GitManager's commitGen caps keep us far below this.
        throw new Error('Commit context too large.');
      }
      let finalText = '';
      let resultOk: boolean | null = null;
      let resultText = '';

      if (commitProvider === 'cursor') {
        const out = await this.runCursorUtility(prompt, ctx.root, abort, queueDelta, run);
        finalText = out.text;
        resultOk = out.ok;
        resultText = out.text;
      } else {
      const sdk = await loadSdk();
      const options = this.buildUtilityOptions(ctx.root, abort);
      const q = sdk.query({ prompt, options }) as unknown as AsyncIterable<SDKMessage> & {
        close?: () => void;
      };
      run.query = q;

      for await (const msg of q) {
        if (abort.signal.aborted) break;
        switch (msg.type) {
          case 'stream_event': {
            const ev = msg.event as unknown as {
              type?: string;
              delta?: { type?: string; text?: string };
            };
            if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
              queueDelta(ev.delta.text);
            }
            break;
          }
          case 'assistant': {
            if (msg.error) throw new Error(String(msg.error));
            const content = (msg.message?.content ?? []) as unknown as Array<Record<string, unknown>>;
            const text = content
              .filter((b) => b.type === 'text' && typeof b.text === 'string')
              .map((b) => b.text as string)
              .join('');
            if (text.trim().length > 0) finalText = text;
            break;
          }
          case 'result': {
            resultOk = msg.subtype === 'success';
            resultText = 'result' in msg && typeof msg.result === 'string' ? msg.result : '';
            break;
          }
          default:
            break;
        }
      }
      }
      flushDelta();

      if (abort.signal.aborted) {
        emit({ kind: 'canceled' });
        return { ok: false, reason: 'canceled' };
      }
      if (resultOk === false) {
        throw new Error(resultText || 'The commit-message run ended with errors.');
      }
      const message = polishCommitMessage(finalText || resultText);
      if (!message) throw new Error('The model returned an empty commit message.');
      emit({ kind: 'done', text: message });
      return { ok: true, message };
    } catch (err) {
      if (abort.signal.aborted) {
        emit({ kind: 'canceled' });
        return { ok: false, reason: 'canceled' };
      }
      const raw = err instanceof Error ? err.message : String(err);
      const safe = redact(raw);
      logger.warn('[claude:commit-msg] generation failed', safe);
      const cls = classifyAgentError(raw);
      const reason: GenerateCommitMessageResult['reason'] =
        cls.outcome === 'auth-required'
          ? 'agent-unavailable'
          : cls.outcome === 'rate-limited'
            ? 'rate-limited'
            : 'error';
      emit({ kind: 'error', error: safe });
      return { ok: false, reason, error: safe };
    } finally {
      if (flushTimer) clearTimeout(flushTimer);
      this.commitGenRuns.delete(workspaceId);
      if (subagentSession) {
        this.emitHook(subagentSession, 'subagent-stop', { summary: 'Commit-message sub-agent' });
      }
    }
  }

  /**
   * The Cursor analogue of {@link buildUtilityOptions}: a tool-less, one-shot,
   * non-resuming print-mode run used for utility generations (commit messages).
   *
   * `--mode ask` is the closest thing Cursor has to Claude's `allowedTools: []`
   * — it is provider-enforced read-only — and `force: false` means nothing can
   * be applied even if the model tried. No bridge pipe, no hooks, no MCP, no
   * generated session files, and the bridge's `onToolUse` is inert, so this can
   * never mutate the repository. Nothing is persisted: no resume id is stored
   * and none is replayed, so a utility run never disturbs the user's chat.
   */
  private async runCursorUtility(
    prompt: string,
    cwd: string,
    abort: AbortController,
    queueDelta: (text: string) => void,
    run: { query: { close?: () => void } | null },
  ): Promise<{ ok: boolean; text: string }> {
    const runtime = this.cursorRuntime;
    if (!runtime) throw new Error('The Cursor runtime is not available.');
    const agent = this.settings.getAll().agent;
    const model = agent.model;
    if (!CURSOR_MODEL_ID_RE.test(model) || !cursorModelSet().has(model)) {
      throw new Error(`"${model.slice(0, 80)}" is not an available Cursor model.`);
    }

    let text = '';
    let ok = true;
    const bridge: ProviderRunBridge = {
      ensureStreaming: () => undefined,
      queueDelta: (t) => {
        text += t;
        queueDelta(t);
      },
      finishStreaming: (final) => {
        if (final && final.trim().length > 0) text = final;
      },
      // A utility run has no tools. Record nothing and, critically, grant
      // nothing — there is no permission gate wired up here to ask.
      onToolUse: () => undefined,
      onToolResult: () => undefined,
      onInit: () => undefined,
      onResult: (good, t) => {
        ok = good;
        if (t && t.trim().length > 0) text = t;
      },
      diag: (category, severity, label, detail) =>
        this.diag(
          category === 'stream' ? 'stream' : 'request',
          severity,
          label,
          detail,
          this.state.activeSessionId,
        ),
    };

    const handle = await runtime.start(
      {
        sessionId: `commit-msg:${newId()}`,
        prompt,
        cwd,
        mode: 'ask',
        force: false,
        trusted: false,
        model,
        // No attachmentsDir: a utility run has no session and no attachments.
        sandbox: resolveSandboxConfig(agent.sandbox, { cwd, provider: 'cursor' }),
        abort,
      },
      bridge,
    );
    run.query = { close: handle.close };
    await handle.done;
    return { ok, text };
  }

  /** Abort an in-flight commit-message generation for a workspace. */
  cancelCommitMessage(workspaceId: string): void {
    const run = this.commitGenRuns.get(workspaceId);
    if (!run) return;
    run.abort.abort();
    try {
      run.query?.close?.();
    } catch {
      /* already closed */
    }
  }

  /**
   * Options for utility one-shots — deliberately parallel to (not shared with)
   * {@link buildOptions}; the divergence list is the point: tool-less
   * (`allowedTools: []` AND a deny-all canUseTool, belt + braces), single-turn,
   * no thinking, plain-string system prompt (no claude_code preset, no
   * memory/search append), no settings sources, no resume, no MCP servers.
   * The model can only emit text.
   */
  private buildUtilityOptions(cwd: string, abort: AbortController): Options {
    const options: Options = {
      cwd,
      model: COMMIT_MESSAGE_MODEL,
      maxTurns: 1,
      includePartialMessages: true,
      abortController: abort,
      thinking: { type: 'disabled' },
      systemPrompt: COMMIT_SYSTEM_PROMPT,
      allowedTools: [],
      canUseTool: async () => ({
        behavior: 'deny' as const,
        message: 'Tools are disabled for commit-message generation.',
      }),
      settingSources: [],
      env: { ...process.env, CLAUDE_CODE_ENABLE_TASKS: '0' },
      stderr: (data: string) => logger.warn('[claude:commit-msg]', redact(data)),
    };
    const claudeExe = resolveClaudeExecutable();
    if (claudeExe) options.pathToClaudeCodeExecutable = claudeExe;
    return options;
  }

  /**
   * Run a prompt for a session. Streams the agent's work as structured events,
   * with transparent recovery on transient failures. A failed *request* never
   * marks the whole agent dead — only a genuinely degraded *capability* does.
   */
  async send(
    sessionId: string,
    prompt: string,
    permMode: SessionPermissionMode = 'default',
    clientMessageId?: string,
    attachmentIds?: string[],
    /**
     * Render this turn as something other than the prompt itself. Used only by
     * the orchestration prompts Limboo composes on the user's behalf (plan
     * approve / regenerate), whose raw text is a document plus XML tags rather
     * than anything a person typed. See {@link ChatMessage.display}.
     */
    display?: ChatMessage['display'],
  ): Promise<void> {
    const isPlan = permMode === 'plan';
    if (this.runs.has(sessionId)) {
      throw new Error('The agent is already working on this session.');
    }
    const provider = providerForModel(this.settings.getAll().agent.model);
    if (provider === 'cursor') {
      await this.assertCursorReady();
    } else {
      const install = this.getInstall();
      if (!install.installed) {
        this.setLifecycle('auth-required');
        throw new Error(install.error ?? 'Claude Code is not available.');
      }
    }
    if (this.state.lifecycle === 'rate-limited') {
      throw new Error(this.state.rateLimit?.message ?? 'The agent is rate limited right now.');
    }
    const ws = this.workspace.getActive();
    if (!ws) {
      throw new Error('Open a workspace before talking to the agent.');
    }

    // Record + persist the user turn immediately so it feels live. Reuse the
    // renderer's optimistic id when supplied so the echoed event upserts in place
    // (no duplicate bubble).
    const userMsg: ChatMessage = {
      id: clientMessageId ?? newId(),
      sessionId,
      role: 'user',
      text: prompt,
      streaming: false,
      createdAt: Date.now(),
      ...(display ? { display } : {}),
    };
    this.persistMessage(userMsg);
    // Bind composer drafts to this turn so the chips ride the echoed message
    // (ownership is re-validated in the manager; foreign ids are dropped).
    if (attachmentIds && attachmentIds.length > 0 && this.attachments) {
      const attached = this.attachments.attachToMessage(sessionId, attachmentIds, userMsg.id);
      if (attached.length > 0) userMsg.attachments = attached;
      attachmentIds = attached.map((a) => a.id);
    }
    this.pushEvent({ kind: 'message-done', sessionId, message: userMsg });
    // The timeline gets the readable line too — an approval logged as 24,000
    // characters of plan Markdown is not an audit entry, it is noise.
    this.pushActivity(
      sessionId,
      'prompt',
      'You',
      (display?.text ?? prompt).slice(0, ACTIVITY_LIMITS.labelMax),
      'info',
    );
    // Name an untitled session after its first prompt (a no-op once renamed).
    // Never after an orchestration prompt: "Approved the plan — …" describes
    // Limboo's own action, not what the user set out to do.
    if (!display) this.sessions?.autoTitle(sessionId, prompt);
    // Remember the mode so the composer restores it when this session reopens.
    this.sessions?.setMode(sessionId, permMode);

    // Plan run: open a fresh planning artifact so the panel switches into its
    // "analyzing repository" state immediately while the agent reads.
    if (isPlan) {
      this.beginPlan(sessionId, prompt);
    }

    const cfg = this.settings.getAll().agent.connection;
    const abort = new AbortController();
    // Deferred settled in the `finally` below, after the map entry is gone.
    // Definite assignment: a Promise executor runs synchronously, so this is
    // bound before the constructor returns, let alone before anything awaits it.
    let markSettled!: () => void;
    const settled = new Promise<void>((resolve) => {
      markSettled = resolve;
    });
    this.runs.set(sessionId, {
      abort,
      query: null,
      settled,
      mode: isPlan ? 'plan' : 'implement',
      attachmentIds: attachmentIds && attachmentIds.length > 0 ? attachmentIds : undefined,
      userMessageId: userMsg.id,
    });
    this.clearIdleTimer();
    this.setRequest(sessionId, {
      phase: 'submitting',
      outcome: null,
      attempt: 0,
      maxAttempts: cfg.maxRecoveryAttempts,
      detail: undefined,
    });
    this.setLifecycle('busy', { activeSessionId: sessionId, error: undefined });
    this.diag('request', 'info', `Prompt submitted (${permMode})`, prompt.slice(0, ACTIVITY_LIMITS.detailMax), sessionId);
    // Governance bus: a run is beginning. `session-start` + `prompt-submit` are
    // provider-neutral choke points — one emission each covers Claude + Cursor.
    this.emitHook(sessionId, 'session-start', { summary: `Run started (${permMode})` });
    this.emitHook(sessionId, 'prompt-submit', {
      summary: prompt.slice(0, ACTIVITY_LIMITS.labelMax),
    });

    try {
      await this.runWithRecovery(sessionId, prompt, abort, cfg, permMode);
    } finally {
      const captured = this.runs.get(sessionId)?.planCaptured;
      this.runs.delete(sessionId);
      // Release waiters immediately after the map entry is gone, so anyone who
      // wakes on it observes an idle session. Kept ahead of the teardown work
      // below (and outside its failure modes) so a throw can never strand them.
      markSettled();
      this.emitHook(sessionId, 'run-finished', { summary: 'Run finished' });
      // Re-anchor the session's repository snapshot — the agent may have
      // changed the repo. Fire-and-forget; never delays run teardown.
      this.resume?.onRunFinished(sessionId);
      // A plan run that ended without presenting a plan (error/cancel) must not
      // leave the panel stuck "analyzing" — settle it back to a rejected state.
      if (isPlan && !captured) {
        const plan = this.loadPlan(sessionId);
        if (plan && plan.status === 'planning') {
          const settled: SessionPlan = { ...plan, status: 'rejected' };
          this.savePlan(settled);
          this.pushEvent({ kind: 'plan', sessionId, plan: settled });
        }
      }
      if (!this.isCapabilityDegraded()) this.setLifecycle('ready', { activeSessionId: null });
      this.armIdleTimer(cfg);
    }
  }

  /** Retry wrapper around {@link runOnce}: classify, recover, or surface. */
  private async runWithRecovery(
    sessionId: string,
    prompt: string,
    abort: AbortController,
    cfg: ReturnType<SettingsManager['getAll']>['agent']['connection'],
    permMode: SessionPermissionMode,
  ): Promise<void> {
    let attempt = 0;
    // Two INDEPENDENT one-shot budgets. Dropping a stored resume id and
    // retrying-from-scratch are different remedies: the first only applies when
    // a row exists, and gating the second on the first (as this loop used to)
    // meant a session with no stored id got no recovery at all. Separate flags
    // give each remedy exactly one shot and still make the loop terminating.
    let resumeDropped = false;
    let freshRetried = false;
    for (;;) {
      try {
        await this.runOnce(sessionId, prompt, abort, permMode);
        if (abort.signal.aborted) {
          // The user stopped mid-stream; stop() already recorded 'cancelled'.
          return;
        }
        // A captured plan ends the read-only run cleanly — it is not a failure.
        if (this.runs.get(sessionId)?.planCaptured) {
          this.completeRequest(sessionId, 'success');
          this.markHeartbeatOk();
          return;
        }
        // A successful implement run that fulfilled a plan marks it completed.
        // Ask runs are read-only exploration — they never fulfil a plan.
        if (permMode === 'default' || permMode === 'acceptEdits') {
          this.markPlanCompletedIfImplementing(sessionId);
        }
        this.completeRequest(sessionId, 'success');
        this.markHeartbeatOk();
        if (this.state.lifecycle === 'reconnecting') {
          this.setLifecycle('ready');
          this.diag('recovery', 'info', 'Recovered', undefined, sessionId);
        }
        if (this.state.lifecycle === 'rate-limited') this.clearRateLimit('request succeeded');
        return;
      } catch (err) {
        if (abort.signal.aborted) {
          this.completeRequest(sessionId, 'cancelled');
          return;
        }
        const raw = err instanceof Error ? err.message : String(err);
        const provider = providerForModel(this.settings.getAll().agent.model);

        // ---- Structured terminal-result classification (preferred path) ----
        // Prefer the record carried by AgentRunError. Fall back to parsing the
        // thrown TEXT, because the SDK replaces a transport error with
        // `Claude Code returned an error result: <errors joined>` — the same
        // failure reaches us as data on one path and as prose on the other, and
        // only normalizing both makes detection deterministic instead of a race.
        const terminal = isAgentRunError(err) ? err.terminal : terminalResultFromText(raw);
        const structured = terminal ? classifyTerminalResult(terminal) : null;

        // Structured verdict wins when there is one; otherwise fall through to
        // the provider regex classifiers, which still own the rate-limit / auth
        // / transport shapes that never appear as a terminal_reason. Resolved
        // BEFORE the retry-fresh check so a Cursor verdict — which carries its
        // own `retryFresh` — gets the same remedy as a Claude one.
        const cls =
          structured ??
          (provider === 'cursor' ? classifyCursorError(redact(raw)) : classifyAgentError(redact(raw)));
        // These two are optional across the three classifier shapes — only the
        // terminal-result and Cursor classifiers supply them — so read them
        // through one widened view rather than leaning on `in`-narrowing across
        // a three-way union.
        const { retryFresh, message } = cls as { retryFresh?: boolean; message?: string };
        // `userMessage` is the ONLY string allowed into the conversation. The
        // raw provider prose stays in the diagnostics console and the log.
        const userMessage = message || redact(raw);

        // An interrupted turn leaves the provider transcript ending in a tool
        // call with no result; replaying it via the stored resume/chat id fails
        // identically every time. Retry FRESH — and do so whether or not a
        // stored id exists, since the failure is a turn-level artifact that a
        // clean conversation clears (anthropics/claude-agent-sdk-typescript#366:
        // the next well-formed prompt is answered normally). Limboo's own
        // transcript, activity and checkpoints are untouched.
        if (retryFresh && !freshRetried) {
          freshRetried = true;
          const hadResume = Boolean(this.loadProviderSession(sessionId, provider));
          if (hadResume && !resumeDropped) {
            resumeDropped = true;
            this.forgetProviderSession(sessionId, provider);
          }
          this.diag(
            'recovery',
            'warning',
            hadResume
              ? 'Turn was interrupted — dropping the stored conversation and retrying fresh'
              : 'Turn was interrupted — retrying',
            redact(raw),
            sessionId,
          );
          continue;
        }

        // Cursor's own resume-token corruption (the stored chat id no longer
        // resolves server-side) is not a terminal-result shape — keep its
        // dedicated matcher, with the same one-shot drop-and-retry remedy.
        if (
          provider === 'cursor' &&
          isCursorResumeCorruption(raw) &&
          !resumeDropped &&
          this.loadProviderSession(sessionId, provider)
        ) {
          resumeDropped = true;
          this.forgetProviderSession(sessionId, provider);
          this.diag(
            'recovery',
            'warning',
            'Resumed conversation was corrupted — starting a fresh session',
            redact(raw),
            sessionId,
          );
          continue; // retry — the next attempt no longer finds a resume id
        }

        this.diag('recovery', cls.recoverable ? 'warning' : 'error', `Run error (${cls.outcome})`, redact(raw), sessionId);

        if (cls.outcome === 'rate-limited' && cls.rateLimit) {
          this.enterRateLimited(cls.rateLimit, sessionId);
          this.completeRequest(sessionId, 'rate-limited', cls.rateLimit.message);
          return;
        }
        if (cls.outcome === 'auth-required') {
          this.setLifecycle('auth-required', { error: redact(raw) });
          this.completeRequest(
            sessionId,
            'auth-required',
            provider === 'cursor'
              ? 'Sign in to Cursor again (or update the API key in Settings › Agent).'
              : 'Sign in to Claude Code again.',
          );
          this.pushEvent({ kind: 'error', sessionId, message: redact(raw), outcome: 'auth-required' });
          this.pushActivity(sessionId, 'error', 'Authentication required', undefined, 'warning');
          this.diag('auth', 'warning', 'Authentication required', redact(raw));
          // Reconcile the Providers card with the CLI's own view of the world.
          if (provider === 'cursor') void this.cursorAuth?.probe(true);
          return;
        }
        if (cls.outcome === 'context-overflow') {
          this.completeRequest(sessionId, 'context-overflow', 'Context window exceeded.');
          this.pushEvent({ kind: 'error', sessionId, message: userMessage, outcome: 'context-overflow' });
          this.pushActivity(sessionId, 'error', 'Context window exceeded', undefined, 'warning');
          return; // capability stays ready — this is request-local
        }

        if (cls.recoverable && cfg.maxRecoveryAttempts > 0 && attempt < cfg.maxRecoveryAttempts) {
          attempt += 1;
          this.setLifecycle('reconnecting');
          this.setRequest(sessionId, { phase: 'recovering', attempt });
          this.diag('recovery', 'info', `Reconnect attempt ${attempt}/${cfg.maxRecoveryAttempts}`, undefined, sessionId);
          const ok = await this.abortableDelay(backoff(cfg.reconnectDelay, attempt), abort);
          if (!ok) {
            this.completeRequest(sessionId, 'cancelled');
            return;
          }
          continue; // retry — runOnce reuses buildOptions → options.resume
        }

        // Exhausted or non-recoverable. The log keeps the raw provider text;
        // the conversation gets `userMessage` (identical to the raw text unless
        // the terminal-result classifier supplied plain-English copy).
        logger.error('Agent run failed', redact(raw));
        this.completeRequest(sessionId, cls.outcome, userMessage);
        this.pushEvent({ kind: 'error', sessionId, message: userMessage, outcome: cls.outcome });
        this.pushActivity(sessionId, 'error', 'Agent error', userMessage.slice(0, ACTIVITY_LIMITS.detailMax), 'danger');
        if (cls.recoverable) {
          // A transport error whose recovery budget is spent — capability degraded.
          this.setLifecycle('failed', { error: userMessage });
        }
        // Otherwise a request-local failure: the agent itself stays ready (the
        // outer send() finally restores 'ready' since the capability is healthy).
        return;
      }
    }
  }

  /**
   * A single run through the AI SDK `HarnessAgent`.
   *
   * Deliberately the same shape as {@link runCursorOnce}: compose the context,
   * build a {@link ProviderRunBridge} over the caller's streaming closures,
   * hand both to a runtime, and let everything downstream stay unaware of
   * which adapter produced the events.
   *
   * Layer 1 is preserved by construction — `toolApproval` routes into
   * `makeCanUseTool`, the SAME callback the Claude SDK path installs, so risk
   * classification, the crown-jewel and workspace guards, plan read-only,
   * remembered scoping and the PermissionRequest dialog are literally the same
   * code (see `harness/approval.ts`).
   */
  private async runHarnessOnce(
    sessionId: string,
    prompt: string,
    cwd: string,
    abort: AbortController,
    permMode: SessionPermissionMode,
    stream: {
      ensureStreaming: () => ChatMessage;
      queueDelta: (text: string) => void;
      finishStreaming: (finalText?: string) => void;
    },
  ): Promise<void> {
    const runtime = this.harnessRuntime;
    const provider = this.harnessSandbox;
    if (!runtime || !provider) throw new Error('The agent harness runtime is not available.');
    const agent = this.settings.getAll().agent;
    const run = this.runs.get(sessionId);

    // Same three context producers, same order, same one-shot resume-delta
    // semantics as both other paths. They ride `instructions` here, which is
    // the harness's equivalent of Claude's single systemPrompt.append.
    const memoryContext = this.memoryContextFor(sessionId, prompt);
    const searchContext = this.searchContextFor(sessionId, prompt);
    const resumeContext = this.resumeContextFor(sessionId);
    const injectedContext =
      [memoryContext, searchContext, resumeContext].filter(Boolean).join('\n\n') || undefined;

    this.emitRunStart(sessionId, agent.model, permMode, {
      memory: memoryContext?.length ?? 0,
      search: searchContext?.length ?? 0,
      resume: resumeContext?.length ?? 0,
    });

    const sandbox = this.resolveSandboxFor(sessionId, cwd, 'anthropic', agent);
    if (sandbox.enabled) this.recordSandboxStatus(sessionId, sandbox);

    // `workDir` must be the worktree's BASENAME: the framework always appends
    // a path segment to the provider's defaultWorkingDirectory (it rejects
    // '.'), so this is what lands the session ON the worktree instead of in a
    // new subdirectory of it.
    const workDir = provider.workDirFor(sessionId);
    if (!workDir) throw new Error('No execution root resolved for this session.');

    const bridge: ProviderRunBridge = {
      ensureStreaming: () => {
        stream.ensureStreaming();
      },
      queueDelta: stream.queueDelta,
      finishStreaming: stream.finishStreaming,
      onToolUse: (id, name, input, parentCallId) =>
        this.onToolUse(sessionId, id, name, input, parentCallId),
      onToolResult: (id, status, output) => this.onToolResult(sessionId, id, status, output),
      // Deliberately inert on this path. The harness's resume token is a
      // structured `HarnessAgentResumeSessionState` object obtained from
      // `session.detach()`/`stop()` — NOT anything the stream carries — and it
      // must be stored under its own provider key so it can never collide with
      // the legacy Claude SDK row. Until that lands, storing nothing is
      // correct; storing the wrong thing corrupted the legacy path's resume.
      onInit: () => undefined,
      onResult: (ok, text) =>
        this.recordRunResult(sessionId, {
          ok,
          subtype: ok ? 'success' : 'error_during_execution',
          errors: ok || !text ? [] : [text],
          text,
        }),
      onSandboxStatus: (_phase, detail) =>
        detail ? this.recordStatus(sessionId, detail) : undefined,
      diag: (category, severity, label, detail) =>
        this.diag(category as DiagnosticCategory, severity, label, detail, sessionId),
    };

    // MCP reuse: point limboo_memory / limboo_search at the SAME bundled stdio
    // bridge Cursor uses, over the same token-authed local pipe, dispatching
    // into the same transport-neutral plain tools. Both agents therefore query
    // one memory and one index, and better-sqlite3 stays in a single process —
    // which is only possible because the sandbox is local.
    //
    // Only `onMcp` is wired: permissions travel through `toolApproval`, not
    // hooks, so there is no gate event to serve here.
    let pipe: RunBridgeServer | null = null;
    let mcpServers: Record<string, unknown> | undefined;
    const mcpBridgePath = this.memory || this.search ? bridgeScriptPath('mcpBridge.cjs') : null;
    if (mcpBridgePath) {
      const dispatcher = createMcpDispatcher(this.memory, this.search, this.workspace, this.gh);
      try {
        pipe = await startBridgeServer({
          onMcp: (server, method, params) =>
            Promise.resolve(dispatcher.dispatch(server, method, params)),
        });
        const entry = (kind: 'memory' | 'search'): Record<string, unknown> => ({
          command: bridgeNodeCommand(),
          args: [mcpBridgePath],
          env: {
            ELECTRON_RUN_AS_NODE: '1',
            ...(pipe as RunBridgeServer).env,
            LIMBOO_BRIDGE_SERVER: kind,
          },
        });
        mcpServers = {
          ...(this.memory ? { limboo_memory: entry('memory') } : {}),
          ...(this.search ? { limboo_search: entry('search') } : {}),
        };
      } catch (err) {
        // Best-effort, exactly as on the Cursor path: losing the index is a
        // degraded run, never a failed one.
        this.diag(
          'lifecycle',
          'warning',
          'Harness bridge pipe failed to start — running without Limboo MCP tools',
          err instanceof Error ? err.message.slice(0, 300) : undefined,
          sessionId,
        );
      }
    }

    const canUseTool = this.makeCanUseTool(sessionId, cwd, permMode);
    // The approval callback needs the handle in order to interrupt the turn,
    // but the handle only exists once the run has started — hence the cell.
    const handleRef: { current: HarnessRunHandle | null } = { current: null };
    try {
    const handle = await runtime.start(
      {
        sessionId,
        harnessId: agent.harness.id,
        prompt,
        cwd,
        mode: permMode,
        model: agent.model,
        maxTurns: agent.maxTurns,
        instructions: injectedContext,
        // The web tools are the one capability a setting removes outright.
        // Built-in tool keys are the adapter's OWN identifiers and are mostly
        // native-cased (`WebFetch`, not `webFetch`); only seven are lowercase
        // common names. `validateToolNames` THROWS on an unknown key, so a
        // guessed literal here crashed every run with web search turned off
        // before its first turn. HarnessRuntime validates these against the
        // adapter's real key set and drops what it does not recognise.
        inactiveTools: agent.webSearch ? undefined : ['webSearch', 'WebFetch'],
        harnessLabel: harnessById(agent.harness.id)?.label,
        // Built-in tools are gated by `permissionMode` (set inside the runtime),
        // NOT by this map — the framework looks the map up by tool name and only
        // consults it for tools Limboo supplies itself. With no host tools it is
        // empty, which is honest: there is nothing to route.
        toolApproval: buildToolApprovalMap([]),
        // How a permission request is answered. This is the delegation into
        // Layer 1 — the same `makeCanUseTool` the Claude SDK path installs, so
        // risk classification, the crown-jewel and workspace guards, plan
        // read-only, remembered scoping, the Work Graph approval node and the
        // governance-bus emission are all literally the same code.
        approval: {
          canUseTool: (name, input, ctx) =>
            canUseTool(name, input, ctx) as Promise<{
              behavior: 'allow' | 'deny';
              updatedInput?: Record<string, unknown>;
              message?: string;
              interrupt?: boolean;
            }>,
          // Plan capture denies with `interrupt: true`; the harness has no such
          // field, so halt the turn here instead. close() prefers suspendTurn,
          // which preserves the turn for the post-approval continuation.
          interrupt: () => handleRef.current?.close(),
          abort: abort.signal,
          permMode,
        },
        sandbox,
        mcpServers,
        // No resume yet. `createSession({resumeFrom})` requires a structured
        // `{type:'resume-session', specificationVersion, harnessId, data}` and
        // THROWS on anything else, so passing the legacy row's opaque string
        // failed every second prompt. A fresh conversation per run is a
        // degradation; an error on every second prompt is a broken feature.
        resumeFrom: undefined,
        workDir,
        debug: agent.harness.debug,
        abort,
      },
      bridge,
    );
    handleRef.current = handle;
    if (run) run.query = { close: handle.close };
    this.setLifecycle('streaming');
    this.setRequest(sessionId, { phase: 'streaming' });
    await handle.done;
    } finally {
      // The pipe is per-run: closing it is what stops a stale bridge from
      // outliving the run that authorized it.
      if (pipe) {
        this.setState({
          cursorBridge: { hooksActive: null, mcpActive: pipe.mcpConnected, at: Date.now() },
        });
        void pipe.close();
      }
    }
  }

  /** A single SDK run attempt. Streams events; re-throws on any failure. */
  private async runOnce(
    sessionId: string,
    prompt: string,
    abort: AbortController,
    permMode: SessionPermissionMode,
  ): Promise<void> {
    const ws = this.workspace.getActive();
    if (!ws) throw new Error('Open a workspace before talking to the agent.');
    // A worktree-backed session binds the agent to ITS isolated checkout — the
    // cwd flows into buildOptions AND makeCanUseTool, so the existing
    // isInside(cwd, …) path guard automatically confines every file tool to the
    // worktree. Plain sessions keep the workspace root.
    const cwd = this.resolveSessionRoot?.(sessionId) ?? ws.path;
    this.pinMcpScope(sessionId, ws.id);
    const agent = this.settings.getAll().agent;

    let streaming: ChatMessage | null = null;
    // Coalesced-delta state: `pendingDelta` accrues streamed text between flushes;
    // `flushTimer` bounds the latency of a partial buffer (see DELTA_FLUSH_*).
    let pendingDelta = '';
    let flushTimer: NodeJS.Timeout | null = null;
    const flushDelta = (): void => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (!streaming || pendingDelta.length === 0) return;
      const text = pendingDelta;
      pendingDelta = '';
      this.pushEvent({ kind: 'message-delta', sessionId, messageId: streaming.id, text });
    };
    const ensureStreaming = (): ChatMessage => {
      if (!streaming) {
        streaming = {
          id: newId(),
          sessionId,
          role: 'assistant',
          text: '',
          streaming: true,
          createdAt: Date.now(),
        };
        this.pushEvent({ kind: 'message-start', sessionId, message: { ...streaming } });
      }
      return streaming;
    };
    // Buffer a streamed text chunk; flush eagerly past the size threshold,
    // otherwise arm a short timer so a trailing partial buffer still lands fast.
    const queueDelta = (text: string): void => {
      const m = ensureStreaming();
      m.text += text;
      pendingDelta += text;
      if (pendingDelta.length >= DELTA_FLUSH_CHARS) flushDelta();
      else if (!flushTimer) flushTimer = setTimeout(flushDelta, DELTA_FLUSH_MS);
    };
    const finishStreaming = (finalText?: string): void => {
      // Drop any buffered partial — the `message-done` below carries the full,
      // authoritative text and the renderer replaces (not appends) on done.
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      pendingDelta = '';
      if (!streaming) return;
      if (typeof finalText === 'string' && finalText.length > 0) streaming.text = finalText;
      streaming.streaming = false;
      this.persistMessage(streaming);
      this.pushEvent({ kind: 'message-done', sessionId, message: { ...streaming } });
      // Badge the session as unread if the user is looking at a different one.
      this.sessions?.bumpUnread(sessionId);
      streaming = null;
    };

    const run = this.runs.get(sessionId);
    if (run) run.result = undefined;
    this.setRequest(sessionId, { phase: 'connecting' });

    // Provider dispatch. EXHAUSTIVE by construction: an unroutable model is a
    // named failure, never a fall-through. This was an `if (cursor) … return;`
    // with the Claude path underneath, so anything not proven to be Cursor ran
    // as Claude — which is how a Cursor session ended up streaming Claude Code.
    // Adding a provider must be a compile-visible change here, not a silent
    // inheritance of the Anthropic branch.
    const routing = resolveModelRouting(agent.model);
    switch (routing.provider) {
      case 'cursor':
        try {
          // Reuses the exact streaming closures above so everything downstream
          // (events, persistence, plan artifacts, UI) behaves identically.
          await this.runCursorOnce(sessionId, prompt, cwd, abort, permMode, {
            ensureStreaming,
            queueDelta,
            finishStreaming,
          });
        } finally {
          // Same reconciliation the Claude branch does — a Cursor run cut
          // mid-tool would otherwise leave its chip spinning forever.
          this.settleOrphanedToolCalls(sessionId);
        }
        return;
      case 'anthropic':
        // Anthropic models run through the AI SDK harness, or through the
        // direct Claude Agent SDK when the documented rollback is set. The
        // rollback ships ON, so this phase changes nothing until it is flipped.
        if (!agent.harness.legacyClaudeSdk) {
          try {
            await this.runHarnessOnce(sessionId, prompt, cwd, abort, permMode, {
              ensureStreaming,
              queueDelta,
              finishStreaming,
            });
          } finally {
            this.settleOrphanedToolCalls(sessionId);
          }
          return;
        }
        break; // falls into the Claude Agent SDK path below
      case null:
        throw new Error(`${routing.reason}. Pick a model in the composer.`);
      default: {
        const never: never = routing.provider;
        throw new Error(`Unhandled agent provider: ${String(never)}`);
      }
    }

    try {
      const sdk = await loadSdk();
      const { query } = sdk;
      // Compose the injected context: durable Memory knowledge + the Search
      // Engine's ranked retrieval + the one-shot repository delta for this
      // prompt. All are appended to the Claude Code preset via a single
      // systemPrompt.append (blank-line separated).
      //
      // THREE PRODUCERS, AND RELEASE NOTES ARE DELIBERATELY NOT A FOURTH. Each
      // of these is selected FOR this turn: memory ranked against this prompt,
      // search retrieved for it, the delta computed since this session last
      // ran. Release notes are a fixed document that matters only when someone
      // asks about it, so they are exposed as a TOOL the agent pulls
      // (`list_releases` / `release_notes` on the `limboo_search` server) rather
      // than a block pushed into every request. Claude Code shipped a fix for
      // exactly the other choice, where its release-notes view leaked the whole
      // changelog into every subsequent request.
      const memoryContext = this.memoryContextFor(sessionId, prompt);
      const searchContext = this.searchContextFor(sessionId, prompt);
      const resumeContext = this.resumeContextFor(sessionId);
      const injectedContext =
        [memoryContext, searchContext, resumeContext].filter(Boolean).join('\n\n') || undefined;
      // Governance bus: SessionStart is the context-injection checkpoint. Audit
      // WHICH blocks were injected — presence booleans ONLY, never the injected
      // text (it carries memory/file content). Guarded once per run so recovery
      // retries (which recompose the same context) don't duplicate the line.
      const run = this.runs.get(sessionId);
      if (run && !run.contextInjected) {
        run.contextInjected = true;
        this.emitHook(sessionId, 'session-start', {
          summary: `Context injected: memory ${memoryContext ? '✓' : '✗'} · search ${searchContext ? '✓' : '✗'} · repo-delta ${resumeContext ? '✓' : '✗'}`,
        });
      }
      const options = this.buildOptions(sessionId, cwd, abort, agent, permMode, injectedContext);
      // Limboo's own in-process servers. They carry no registry row, so they are
      // invisible to McpManager and have to be tracked here for the plan-mode
      // allowlist below.
      const ownMcpServers: string[] = [];
      // Expose a live, read-only view of the Local Memory System so the agent can
      // actually list/search the developer's memories on demand (the injected
      // <project-memory> block is only a one-shot snapshot).
      if (this.memory && this.settings.getAll().memory.enabled) {
        options.mcpServers = {
          ...(options.mcpServers ?? {}),
          limboo_memory: createMemoryMcpServer(sdk, this.memory, this.workspace),
        };
        ownMcpServers.push('limboo_memory');
      }
      // Expose read-only Search Engine tools so the agent can query the local index
      // on demand to decide what to explore before its own Read/Grep/Glob run.
      if (this.search && this.settings.getAll().search.enabled) {
        options.mcpServers = {
          ...(options.mcpServers ?? {}),
          limboo_search: createSearchMcpServer(sdk, this.search, this.workspace, this.gh),
        };
        ownMcpServers.push('limboo_search');
      }
      // User-configured MCP servers from the provider-independent registry. Both
      // providers consume the SAME registry; for Claude they ride
      // options.mcpServers with secrets resolved in-memory (never persisted).
      // Trusted servers auto-approve inside decideToolUse (via
      // trustedToolMatchers), NOT via allowedTools, so the single permission
      // authority + governance audit still cover every MCP call.
      if (this.mcp) {
        const inj = this.mcp.claudeServersFor(sessionId, this.mcpScopeFor(sessionId));
        const mcpNames = Object.keys(inj.servers);
        if (mcpNames.length > 0) {
          options.mcpServers = { ...(options.mcpServers ?? {}), ...inj.servers };
          this.recordStatus(sessionId, `Loading ${mcpNames.length} MCP server(s)…`, mcpNames.join(', '));
        }
      }
      // The ONE exception to the rule directly above: a plan-mode pre-approval
      // list, so tools already cleared for read-only use never stall a planning
      // run on a prompt.
      //
      // allowedTools entries run with no prompt, so membership requires an
      // explicit human decision: either the user declared the whole server
      // read-only (planAccess 'all' — their own assertion, made out of band in
      // Settings), or a TRUSTED server declared the individual tool read-only
      // (planAccess 'annotated'). See McpManager.planAllowedToolsFor for why
      // those two cases differ. Nothing else is listed, so a run never skips an
      // approval the user has not already given.
      //
      // Limboo's own memory/search servers lead the list, and NOT inside the
      // `if (this.mcp)` above — they have no registry row, so planAllowedToolsFor
      // cannot see them, and gating them on an unrelated manager being wired left
      // the app's own retrieval tools unusable in every planning run. They are
      // already allowed unconditionally in decideToolUseCore, so listing them
      // pre-approves nothing that gate would have refused.
      if (permMode === 'plan') {
        const planAllow = [
          ...ownMcpServers.map((name) => `mcp__${name}__*`),
          ...(this.mcp?.planAllowedToolsFor(sessionId, this.mcpScopeFor(sessionId)) ?? []),
        ];
        if (planAllow.length > 0) options.allowedTools = planAllow;
      }
      this.diag('lifecycle', 'debug', 'Handshake — query opened', undefined, sessionId);
      // Attachments ride the SDK prompt only (the persisted transcript keeps the
      // raw prompt): a compact manifest tells the agent what is staged on disk so
      // it Reads on demand, and raster images are additionally sent as vision
      // content blocks via a one-shot streaming-input message.
      const attachIds = this.runs.get(sessionId)?.attachmentIds ?? [];
      const manifest =
        attachIds.length > 0 && this.attachments
          ? this.attachments.manifestFor(sessionId, attachIds)
          : undefined;
      const effectivePrompt = manifest ? `${prompt}\n\n${manifest}` : prompt;
      // Runtime Telemetry opens the run HERE, not earlier, because this is the
      // first point at which every block Limboo composed for this prompt exists
      // as a string — the three context blocks AND the attachment manifest. The
      // provider reports one aggregate input-token count and no breakdown at
      // all, so these measured lengths are the only honest basis for the
      // per-contributor split. Nothing between here and the retrieval above
      // depends on this call, and measuring the manifest beats estimating it.
      this.emitRunStart(sessionId, agent.model, permMode, {
        memory: memoryContext?.length ?? 0,
        search: searchContext?.length ?? 0,
        resume: resumeContext?.length ?? 0,
        attachments: manifest?.length ?? 0,
        prompt: prompt.length,
      });
      const imageBlocks =
        attachIds.length > 0 && this.attachments
          ? this.attachments.imageBlocksFor(sessionId, attachIds)
          : [];
      let q: AsyncIterable<SDKMessage> & { close?: () => void };
      if (imageBlocks.length > 0) {
        this.diag('request', 'info', `Attaching ${imageBlocks.length} image(s) for vision`, undefined, sessionId);
        const userMessage = {
          type: 'user',
          message: {
            role: 'user',
            content: [{ type: 'text', text: effectivePrompt }, ...imageBlocks],
          },
          parent_tool_use_id: null,
          session_id: '',
        } as unknown as SDKUserMessage;
        // One-shot generator: yields the single multimodal turn, then ends the
        // input stream (the SDK treats generator return as end-of-input).
        const oneShot = async function* (): AsyncGenerator<SDKUserMessage> {
          yield userMessage;
        };
        q = query({ prompt: oneShot(), options }) as unknown as AsyncIterable<SDKMessage> & {
          close?: () => void;
        };
      } else {
        q = query({ prompt: effectivePrompt, options }) as unknown as AsyncIterable<SDKMessage> & {
          close?: () => void;
        };
      }
      if (run) run.query = q;
      this.setLifecycle('streaming');
      this.setRequest(sessionId, { phase: 'streaming' });
      this.diag('stream', 'debug', 'Streaming response', undefined, sessionId);

      for await (const msg of q) {
        if (abort.signal.aborted) break;
        this.handleMessage(sessionId, msg, ensureStreaming, finishStreaming, queueDelta);
      }
    } finally {
      finishStreaming();
      // A tool call whose tool_result never arrives (interrupt, process death,
      // an aborted stream) would otherwise stay `running` in the runtime
      // forever and spin its chip for the rest of the session. Nothing else
      // reconciles it, because the reconciling signal is the message that never
      // came.
      this.settleOrphanedToolCalls(sessionId);
    }

    // A captured plan halts the read-only run via an ExitPlanMode interrupt;
    // that is the intended terminal state, not an error to classify/retry.
    if (this.runs.get(sessionId)?.planCaptured) return;

    // A non-success terminal result is surfaced as a throw so the recovery loop
    // can classify it (rate-limit / auth / context / transient / hard failure).
    // AgentRunError carries the STRUCTURED record, so the loop classifies on
    // `terminal_reason` / `stop_reason` rather than on provider prose.
    const result = this.runs.get(sessionId)?.result;
    if (result && !result.ok && !abort.signal.aborted) {
      throw new AgentRunError(result);
    }
  }

  /**
   * Settle any tool call still marked `running` for this session. Called when a
   * run unwinds — normally there is nothing to do, and on an interrupted run
   * this is what stops the UI showing work that will never finish.
   */
  private settleOrphanedToolCalls(sessionId: string): void {
    const rt = this.runtimes.get(sessionId);
    if (!rt) return;
    for (const call of rt.toolCalls) {
      if (call.status === 'running') {
        this.onToolResult(sessionId, call.id, 'error', 'Interrupted before it finished.');
      }
    }
  }

  /**
   * Whether this session has a tool call the provider has not yet reported a
   * result for. Aborting in that window is what leaves the provider transcript
   * structurally invalid — see the note in {@link stop}.
   */
  private hasRunningToolCalls(sessionId: string): boolean {
    const rt = this.runtimes.get(sessionId);
    if (!rt) return false;
    return rt.toolCalls.some((c) => c.status === 'running');
  }

  /* ---------------------------------------------------------------- */
  /* SDK message → structured events                                  */
  /* ---------------------------------------------------------------- */

  private handleMessage(
    sessionId: string,
    msg: SDKMessage,
    ensureStreaming: () => ChatMessage,
    finishStreaming: (finalText?: string) => void,
    queueDelta: (text: string) => void,
  ): void {
    switch (msg.type) {
      case 'system': {
        if (msg.subtype === 'init') {
          this.rememberProviderSession(sessionId, 'anthropic', msg.session_id);
          break;
        }
        // Runtime Telemetry FIRST. `onTaskMessage` no-ops on any subtype that
        // does not start with `task_`, so the order is safe either way — but
        // taking telemetry first means a future task subtype cannot shadow a
        // measurement by claiming the message before we look at it.
        this.emitTelemetryAll(
          signalsFromSystem(sessionId, msg as unknown as Record<string, unknown>),
        );
        // The Agent SDK's task lifecycle. These are the provider's OWN
        // measurements of a delegation — duration, tool count, tokens, and an
        // AI-written progress line — joined to the spawning call by
        // `tool_use_id`. Limboo used to derive all of this by hand from the
        // worker's child calls and drop these messages on the floor.
        this.onTaskMessage(sessionId, msg as unknown as Record<string, unknown>);
        break;
      }

      case 'stream_event': {
        const ev = msg.event as unknown as { type?: string; delta?: { type?: string; text?: string } };
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
          // Buffered emit (see queueDelta / DELTA_FLUSH_*) — `ensureStreaming` is
          // still invoked inside queueDelta so the message is created on first token.
          queueDelta(ev.delta.text);
        }
        // `message_start` / `message_delta` on this same stream carry the
        // provider's MEASURED token usage for each API request — the live
        // context-window number. The translator ignores the content deltas
        // handled above, so the two paths never interfere.
        this.emitTelemetryAll(
          signalsFromStreamEvent(sessionId, msg as unknown as Record<string, unknown>),
        );
        break;
      }

      case 'tool_progress': {
        const signal = signalFromToolProgress(
          sessionId,
          msg as unknown as Record<string, unknown>,
        );
        if (signal) this.emitTelemetry(signal);
        break;
      }

      case 'rate_limit_event': {
        // The provider's own rolling quota windows. Until now Limboo learned
        // about a quota only by regex-matching an error string — which by
        // definition fired after the user had already been cut off.
        const signal = signalFromRateLimit(msg as unknown as Record<string, unknown>);
        if (signal) this.emitTelemetry(signal);
        break;
      }

      case 'assistant': {
        if (msg.error) {
          // Surface as a throw so the recovery loop classifies it consistently.
          throw new Error(String(msg.error));
        }
        const content = (msg.message?.content ?? []) as unknown as Array<Record<string, unknown>>;

        // Messages originating inside a subagent carry the spawning `Agent` call's
        // id in `parent_tool_use_id` (Agent SDK). It is the only signal that
        // distinguishes a subagent's work from the main agent's.
        //
        // THIS READ MUST STAY ABOVE THE TEXT BRANCH. With `forwardSubagentText`
        // on, the SDK forwards a worker's own narration as assistant messages
        // carrying this id. Finalizing text before checking it spliced that
        // narration into the parent transcript as a top-level assistant message
        // — and persisted it — which is exactly the context flooding delegation
        // exists to prevent. A worker's prose belongs to the worker's row.
        const parentId = (msg as unknown as { parent_tool_use_id?: unknown }).parent_tool_use_id;
        const parentCallId = typeof parentId === 'string' && parentId ? parentId : undefined;

        const text = content
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text as string)
          .join('');
        if (text.trim().length > 0) {
          if (parentCallId) {
            this.appendSubagentTranscript(sessionId, parentCallId, text);
          } else {
            // Make sure a message exists even when no partial deltas were streamed
            // (e.g. includePartialMessages produced nothing), then finalize it.
            ensureStreaming();
            finishStreaming(text);
          }
        }

        for (const block of content) {
          if (block.type === 'tool_use') {
            this.onToolUse(
              sessionId,
              String(block.id ?? newId()),
              String(block.name ?? 'tool'),
              (block.input as Record<string, unknown>) ?? {},
              parentCallId,
            );
          }
        }
        break;
      }

      case 'user': {
        const content = (msg.message?.content ?? []) as unknown as Array<Record<string, unknown>>;
        for (const block of content) {
          if (block.type === 'tool_result') {
            const id = String(block.tool_use_id ?? '');
            const status = block.is_error ? 'error' : 'done';
            const text = toolResultText(block.content);
            this.onToolResult(sessionId, id, status, text);
            // Tool results are the largest thing Limboo can attribute in the
            // context window that it did not compose itself.
            const call = this.runtimes.get(sessionId)?.toolCalls.find((c) => c.id === id);
            this.observeResultChars(sessionId, call?.name ?? '', text);
          }
        }
        break;
      }

      case 'result': {
        finishStreaming();
        // Two readers, deliberately separate. `readTerminalResult` decides the
        // run's OUTCOME and feeds the renderer's result event; `signalFromResult`
        // reads the MEASUREMENTS (usage, modelUsage, cost, turns, timings).
        // Widening TerminalResult to carry both would put numbers nobody
        // classifies on a type whose whole job is classification.
        this.emitTelemetry(signalFromResult(sessionId, msg as unknown as Record<string, unknown>));
        this.recordRunResult(sessionId, readTerminalResult(msg));
        break;
      }

      default:
        break;
    }
  }

  /**
   * Record a run's terminal result (shared by the Claude message handler and
   * the Cursor bridge): stores it on the active run for outcome
   * classification, emits the result event, and celebrates success. Failure
   * paths are owned by runWithRecovery (classified + surfaced there).
   */
  private recordRunResult(sessionId: string, terminal: TerminalResult): void {
    const run = this.runs.get(sessionId);
    if (run) run.result = terminal;
    const { ok } = terminal;
    // The renderer's result event carries the SUCCESS text only. A failure's
    // text is raw provider prose (`[ede_diagnostic] …`) and is surfaced instead
    // by runWithRecovery as plain-English copy; the raw form stays in the
    // diagnostics console. See agent/terminalResult.ts.
    this.pushEvent({ kind: 'result', sessionId, ok, text: ok ? terminal.text : '' });
    if (ok) {
      this.pushActivity(sessionId, 'result', 'Completed', undefined, 'success');
      this.diag('request', 'info', 'Run completed', undefined, sessionId);
      if (this.settings.getAll().behavior.notifications) {
        this.notifications.notify({
          title: 'Agent finished',
          body: 'The agent completed the task.',
        });
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Cursor provider run path                                          */
  /* ---------------------------------------------------------------- */

  /**
   * A single Cursor print-mode run attempt — the provider twin of the Claude
   * body of {@link runOnce}, sharing its streaming closures so downstream
   * behavior is identical. Safe posture: runs are propose-only (no --force)
   * except an approved-plan implement pass or the explicit auto posture, and
   * force runs are wrapped in a deny-first session .cursor/cli.json.
   */
  private async runCursorOnce(
    sessionId: string,
    prompt: string,
    cwd: string,
    abort: AbortController,
    permMode: SessionPermissionMode,
    stream: {
      ensureStreaming: () => ChatMessage;
      queueDelta: (text: string) => void;
      finishStreaming: (finalText?: string) => void;
    },
  ): Promise<void> {
    const runtime = this.cursorRuntime;
    if (!runtime) throw new Error('The Cursor runtime is not available.');
    const agent = this.settings.getAll().agent;
    const run = this.runs.get(sessionId);
    const isPlan = permMode === 'plan';

    // Same context producers as the Claude path. Cursor has no system-prompt
    // preset append; the composed block is injected via a session-scoped
    // generated rule (.cursor/rules/limboo-context.mdc — the CLI auto-loads
    // it), with prompt prepending kept as the fallback when the rule write
    // fails. NOTE the resume delta is marked injected at build time — both
    // vehicles deliver it, so that stays correct on the fallback path too.
    const memoryContext = this.memoryContextFor(sessionId, prompt);
    const searchContext = this.searchContextFor(sessionId, prompt);
    const resumeContext = this.resumeContextFor(sessionId);
    const injectedContext =
      [memoryContext, searchContext, resumeContext].filter(Boolean).join('\n\n') || undefined;

    // Attachments ride as the same manifest text; image vision blocks are a
    // Claude streaming-input feature and are skipped for Cursor runs (the
    // staged file path is the ceiling over CLI stdin). The manifest is
    // per-turn, so it stays on the prompt (never the rules file).
    //
    // The userData staging dir is deny-ruled in the session cli.json (deny
    // beats allow), so this turn's files are MIRRORED into the workspace at
    // `<root>/.limboo/attachments` (crash-leftover-cleared, symlink-guarded,
    // removed in the finally below) and the manifest points there. Fail-soft:
    // a copy failure falls back to the userData manifest — those paths may be
    // unreadable by the CLI, but the run itself proceeds.
    const attachIds = run?.attachmentIds ?? [];
    let attachmentStaging: { dir: string; cleanup: () => Promise<void> } | null = null;
    if (attachIds.length > 0 && this.attachments) {
      try {
        attachmentStaging = await createSessionDir(cwd, path.join('.limboo', 'attachments'));
        for (const f of this.attachments.stagedFilesFor(sessionId, attachIds)) {
          const dest = path.join(attachmentStaging.dir, f.storedName);
          try {
            await fs.promises.link(f.path, dest);
          } catch {
            await fs.promises.copyFile(f.path, dest);
          }
        }
        if (run) run.stagedAttachmentsDir = attachmentStaging.dir;
      } catch (err) {
        this.diag(
          'lifecycle',
          'warning',
          'Attachment staging into the workspace failed — the CLI may not be able to read attachments this turn',
          err instanceof Error ? err.message.slice(0, 300) : undefined,
          sessionId,
        );
        if (attachmentStaging) await attachmentStaging.cleanup();
        attachmentStaging = null;
      }
    }
    const manifest =
      attachIds.length > 0 && this.attachments
        ? this.attachments.manifestFor(sessionId, attachIds, {
            dirOverride: attachmentStaging?.dir,
            vision: false,
          })
        : undefined;
    const basePrompt = manifest ? `${prompt}\n\n${manifest}` : prompt;

    // Runtime Telemetry, same call and same position as the Claude path: after
    // every block Limboo composed exists as a string. Cursor's capability set
    // hides every token-derived section, so these lengths go unused today — but
    // they are measured identically, so the day Cursor reports a token count
    // the split works with no change here.
    this.emitRunStart(sessionId, agent.model, permMode, {
      memory: memoryContext?.length ?? 0,
      search: searchContext?.length ?? 0,
      resume: resumeContext?.length ?? 0,
      attachments: manifest?.length ?? 0,
      prompt: prompt.length,
    });

    const isAsk = permMode === 'ask';
    const trusted = this.repoTrustResolver ? this.repoTrustResolver(sessionId) : false;

    // The model id is a settings string — never let it reach argv unless it
    // both passes the strict charset AND names a model we know serves the
    // Cursor provider. `cursorModelSet()` is the SAME set `resolveModelRouting`
    // consults, so routing and validation cannot disagree: this used to build
    // its own union (adding the auth cache), which made it strictly larger than
    // the routing set — an id in the cache but not the registry routed to
    // Claude and never reached this check. Both feed the registry now.
    const model = agent.model;
    if (!CURSOR_MODEL_ID_RE.test(model) || !cursorModelSet().has(model)) {
      throw new Error(
        `"${model.slice(0, 80)}" is not an available Cursor model. ` +
          'Pick a Composer model in the model picker (Settings › Agent), then retry.',
      );
    }

    // A stored resume chat id round-trips through the DB; a corrupted or
    // hand-edited row must never reach `--resume` argv. Drop + forget so the
    // next turn starts a fresh chat (mirrors the resume-corruption self-heal).
    let resumeChatId = this.loadProviderSession(sessionId, 'cursor');
    if (resumeChatId && !CURSOR_RESUME_ID_RE.test(resumeChatId)) {
      this.diag(
        'recovery',
        'warning',
        'Stored Cursor chat id was malformed — starting a fresh chat',
        undefined,
        sessionId,
      );
      this.forgetProviderSession(sessionId, 'cursor');
      resumeChatId = undefined;
    }

    // Pre-bind: no stored chat yet → mint one via `create-chat` so the chat
    // id is bound to this session BEFORE any prompt is sent (design doc §4),
    // instead of waiting to harvest it from the run's init event. Best-effort:
    // on any failure the init-event harvest below keeps working unchanged.
    if (!resumeChatId && !abort.signal.aborted) {
      const minted = await runtime.createChat();
      if (minted) {
        this.rememberProviderSession(sessionId, 'cursor', minted);
        resumeChatId = minted;
        this.diag('lifecycle', 'debug', 'Pre-bound a new Cursor chat', `chat ${minted}`, sessionId);
      } else {
        this.diag(
          'lifecycle',
          'debug',
          'create-chat unavailable — the chat id will bind from the run init event',
          undefined,
          sessionId,
        );
      }
    }

    // OS-level Sandbox (Layer 3) — the SAME provider-neutral policy Claude gets,
    // resolved once here and translated for Cursor into a session
    // `.cursor/sandbox.json` (writable root + denied userData + network policy)
    // plus the `--sandbox` flag. 'auto' omits the flag (CLI default) but still
    // writes the declarative sandbox.json.
    const sandbox = this.resolveSandboxFor(sessionId, cwd, 'cursor', agent);
    if (sandbox.enabled) this.recordSandboxStatus(sessionId, sandbox);

    // Did this run exercise any write/command tool? Feeds the hook-capability
    // check in the finally: a FORCED run that used gated tools while the hooks
    // bridge never connected means the CLI ignored hooks.json — revert to
    // propose-only. Read-only runs never fire hooks, so they must not clear.
    let gatedToolSeen = false;

    const bridge: ProviderRunBridge = {
      ensureStreaming: () => {
        stream.ensureStreaming();
      },
      queueDelta: stream.queueDelta,
      finishStreaming: stream.finishStreaming,
      onToolUse: (id, name, input) => {
        if (classifyTool(name) !== 'read') gatedToolSeen = true;
        this.onToolUse(sessionId, id, name, input);
      },
      onToolResult: (id, status, output) => this.onToolResult(sessionId, id, status, output),
      onInit: (chatId) => {
        // The CLI's own init payload is the source — still never persist a
        // token that couldn't safely round-trip back to `--resume` argv.
        if (CURSOR_RESUME_ID_RE.test(chatId)) {
          this.rememberProviderSession(sessionId, 'cursor', chatId);
        }
      },
      // Cursor reports a plain ok/text pair; normalize it into the same
      // structured record the Claude path produces so both providers reach one
      // classifier (agent/terminalResult.ts).
      onResult: (ok, text) =>
        this.recordRunResult(sessionId, {
          ok,
          subtype: ok ? 'success' : 'error_during_execution',
          errors: ok || !text ? [] : [text],
          text,
        }),
      // Close the telemetry run with the single measurement Cursor reports.
      // Every other field is omitted rather than defaulted — a zero here would
      // claim the provider measured nothing, not that it reported nothing.
      onUsage: (usage) =>
        this.emitTelemetry({
          kind: 'run-end',
          sessionId,
          durationMs: usage.durationMs,
        }),
      diag: (category, severity, label, detail) =>
        this.diag(category as DiagnosticCategory, severity, label, detail, sessionId),
    };

    // ---- Per-run bridge (hooks + MCP over a token-authed local pipe) ----
    // Both layers are best-effort enhancements: an unresolved bundled script
    // or a failed pipe never blocks the run — the deny-first cli.json and the
    // propose-only/--force posture stay the enforced baseline regardless.
    const hooksEnabled = agent.cursor?.hooks !== 'off';
    const hookRunnerPath = hooksEnabled ? bridgeScriptPath('hookRunner.cjs') : null;
    const mcpBridgePath = this.memory || this.search ? bridgeScriptPath('mcpBridge.cjs') : null;

    let pipe: RunBridgeServer | null = null;
    if (hookRunnerPath || mcpBridgePath) {
      // Duplicate suppression: preToolUse and beforeShellExecution can both
      // fire for one action (and hook retries happen) — identical concurrent
      // requests share one decision instead of prompting twice.
      const inFlight = new Map<string, Promise<HookDecision>>();
      const dispatcher = createMcpDispatcher(this.memory, this.search, this.workspace, this.gh);
      try {
        pipe = await startBridgeServer({
          onHook: (event, payload) => {
            const result = mapHookEvent(event, payload);
            if (!result.ok) {
              // Unmappable GATE events fail closed; Cursor also has failClosed
              // set. The reason is NAMED (which key was missing, which event was
              // unrecognised) and surfaced as a diagnostic — a silent universal
              // deny here reads to the user as "the agent cannot do anything",
              // with nothing anywhere saying why.
              this.diag(
                'tool',
                'error',
                'Hook event could not be mapped',
                result.reason,
                sessionId,
              );
              return Promise.resolve<HookDecision>({
                permission: 'deny',
                agentMessage: `Limboo could not interpret this hook: ${result.reason}.`,
              });
            }
            const mapped = result.value;
            if (mapped.unmapped) {
              this.diag(
                'tool',
                mapped.readShaped ? 'debug' : 'warning',
                `Unmapped Cursor tool "${mapped.unmapped.slice(0, 60)}"`,
                mapped.readShaped
                  ? `Treated as a read (the name reads as an inspection tool). Mapped identity: ${mapped.name}.`
                  : `Treated as command-risk. Mapped identity: ${mapped.name}.`,
                sessionId,
              );
            }
            if (mapped.observeOnly) {
              // afterFileEdit: the stream's tool_call events already feed the
              // Changes tab / File History — just acknowledge.
              //
              // subagentStart/subagentStop: recorded onto the governance bus so
              // a Cursor delegation is at least AUDITABLE, then acknowledged.
              // They are deliberately not a gate (Cursor documents `ask` there
              // as treated-as-deny, so gating could silently kill a delegation
              // the user never saw) and deliberately not a nesting source (all
              // four of their id fields carry the same session id, so parent
              // linkage is not derivable). Until that changes, a Cursor run
              // renders its tool calls flat and shows no subagent row.
              // Keyed off the MAPPED identity, not the raw `event` string: the
              // CLI's spelling is normalised in mapHookEvent, so comparing the
              // raw value here would miss `subagent_start` and silently drop the
              // audit row.
              if (mapped.name === 'Agent') {
                this.emitHook(
                  sessionId,
                  /stop$/i.test(event.trim()) ? 'subagent-stop' : 'subagent-start',
                  {
                    tool: 'Agent',
                    summary: 'Cursor subagent',
                    detail: typeof mapped.input.description === 'string' ? mapped.input.description : undefined,
                  },
                );
              }
              return Promise.resolve<HookDecision>({ permission: 'allow' });
            }
            const key = `${mapped.name}:${JSON.stringify(mapped.input)}`;
            let decision = inFlight.get(key);
            if (!decision) {
              decision = this.decideToolUse(
                sessionId,
                cwd,
                permMode,
                mapped.name,
                mapped.input,
                abort.signal,
                { readShaped: mapped.readShaped },
              ).then((r): HookDecision => {
                if (r.behavior === 'allow') return { permission: 'allow' };
                return {
                  permission: 'deny',
                  agentMessage: r.message || 'Denied by the user.',
                  userMessage: r.message,
                };
              });
              inFlight.set(key, decision);
              void decision.finally(() => {
                const t = setTimeout(() => inFlight.delete(key), 2_000);
                t.unref?.();
              });
            }
            return decision;
          },
          onMcp: (server, method, params) =>
            Promise.resolve(dispatcher.dispatch(server, method, params)),
        });
      } catch (err) {
        this.diag(
          'lifecycle',
          'warning',
          'Cursor bridge pipe failed to start — running without hooks/MCP',
          err instanceof Error ? err.message.slice(0, 300) : undefined,
          sessionId,
        );
      }
    }

    // User-configured MCP servers from the app-owned registry (git-clean per-run
    // injection): secret values ride the cursor-agent child env and are
    // referenced as ${env:NAME} in the generated .cursor/mcp.json (never the
    // file). Independent of the limboo bridge pipe — external servers don't need
    // it — so a server is registered even when the bridge failed to start.
    // Every field of CursorMcpInjection must be present here: the allow-rule
    // array below spreads `planAllowRules`, and spreading `undefined` throws.
    const cursorMcp = this.mcp
      ? this.mcp.cursorSpecFor(sessionId, this.mcpScopeFor(sessionId))
      : { userServers: {}, allowRules: [], planAllowRules: [], secretEnv: {} };
    const hasUserServers = Object.keys(cursorMcp.userServers).length > 0;
    const limbooBridge = !!(pipe && mcpBridgePath);
    const mcpSpec: McpBridgeSpec | null =
      limbooBridge || hasUserServers
        ? {
            nodeCommand: limbooBridge ? bridgeNodeCommand() : '',
            bridgePath: mcpBridgePath ?? '',
            bridgeEnv: pipe ? pipe.env : {},
            memory: limbooBridge && !!this.memory,
            search: limbooBridge && !!this.search,
            userServers: cursorMcp.userServers,
          }
        : null;
    const hookCfg =
      pipe && hookRunnerPath
        ? { nodeCommand: bridgeNodeCommand(), runnerPath: hookRunnerPath }
        : null;
    // --force decision — three ways in:
    //   1. an approved plan's implement pass (the explicit user approval),
    //   2. acceptEdits: the user's explicit per-session "apply edits" opt-in
    //      always forces — print mode cannot prompt, so propose-only would
    //      make the mode non-functional. The deny-first cli.json is the
    //      enforced floor (app-data guard, self-gates, destructive shell,
    //      --workspace scoping); when the hooks bridge verifies it only
    //      TIGHTENS (every tool then gates live through decideToolUse on
    //      top). These forced runs double as the hooks probe that unlocks 3.
    //   3. hook-gated interactive execution for 'default' ("ask before
    //      edits"): hooks are registered for THIS run and the bridge has been
    //      verified to connect for this exact CLI version — edits/commands
    //      surface in the permission dialog and execute on approval, with the
    //      fail-closed hookRunner denying on any bridge failure. An
    //      unverified CLI version stays propose-only (mutations become an
    //      approvable proposal artifact).
    // Plan/ask runs never force (read-only by contract).
    const applying = !isPlan && !isAsk && this.loadPlan(sessionId)?.status === 'implementing';
    const cliVersion = this.cursorAuth?.getCachedState().cliVersion ?? null;
    const hookGate =
      !!hookCfg && !!pipe && !!cliVersion && getVerifiedHooksVersion() === cliVersion;
    const force = applying || permMode === 'acceptEdits' || (permMode === 'default' && hookGate);

    // The posture depends on the force decision, so the injected rule content
    // (and the prompt-prepend fallback) is composed here, not with the context
    // producers above. The posture line is always present, so the rule is
    // written on every run.
    const posture = executionPostureNote(permMode, force);
    const ruleBlock = [posture, injectedContext].filter(Boolean).join('\n\n');
    const fallbackPrompt = `<context>\n${ruleBlock}\n</context>\n\n${basePrompt}`;

    const approveMcps = mcpSpec ? await supportsApproveMcps() : false;
    if (mcpSpec && !approveMcps) {
      this.diag(
        'lifecycle',
        'debug',
        'This cursor-agent version has no --approve-mcps — the limboo MCP servers may need a one-time approval',
        undefined,
        sessionId,
      );
    }

    // Declarative posture (documented CLI feature — the enforced layer): the
    // deny-first cli.json now wraps EVERY run (the crown-jewel Read/Write guard
    // matters even propose-only), with allow rules translated from the
    // standing posture. Deny beats allow, so the merge only tightens.
    const denyRules = sessionDenyRules(crownJewelPaths());
    const allowRules = [
      ...sessionAllowRules({
        autoApproveReads: agent.autoApproveReads && agent.permissionMode !== 'approve-all',
        // NOT ANDed with `approve-all` — see CursorAllowPosture.readOnlyShell.
        // Withdrawing the read-only shell floor under "prompt me for everything"
        // left a hookless run with no way to prompt and no way to read.
        readOnlyShell: agent.autoApproveReads,
        limbooMcp: limbooBridge,
        attachmentsStaged: attachmentStaging != null,
      }),
      // Trusted user MCP servers auto-approve declaratively too (Mcp(<name>:*)),
      // matching the decideToolUse trust for the Claude path.
      ...cursorMcp.allowRules,
      // Read-only MCP tools the user opened up for the plan/ask modes. Spliced
      // per-mode, not always, so a server granted read-only planning access does
      // not thereby become allow-listed for ordinary runs.
      //
      // Note this is the ONLY enforcement surface for MCP on the Cursor path:
      // cursor/hooks.ts has no `beforeMCPExecution`, so if `preToolUse` does not
      // fire for MCP calls, decideToolUse never sees them and can neither prompt
      // nor deny. Do NOT try to compensate with a broad Mcp(<name>:*) deny plus
      // narrow allows — deny supersedes allow in Cursor's grammar and would eat
      // the allows.
      ...(permMode === 'plan' || permMode === 'ask' ? cursorMcp.planAllowRules : []),
    ];
    // Workspace secrets (.env / SSH keys / key-cert material) are ask-for-approval,
    // not hard-denied: on a hook-verified run the beforeReadFile hook drives the
    // Limboo prompt (touchesSensitiveFile); `ask` (unlike `deny`) never poisons
    // other tools on non-hook runs.
    const askRules = sessionAskRules();

    let started = false;
    const runAttempt = async (injectViaRules: boolean): Promise<CursorRunOutcome> => {
      const spec = {
        sessionId,
        prompt: injectViaRules ? basePrompt : fallbackPrompt,
        cwd,
        mode: permMode,
        force,
        trusted,
        model,
        resumeChatId,
        sandbox,
        approveMcps,
        // ELECTRON_RUN_AS_NODE lets cursor-agent's children run the bundled
        // .cjs bridges through the Electron binary; harmless to the CLI itself.
        // cursorMcp.secretEnv carries resolved MCP secret values referenced as
        // ${env:NAME} in .cursor/mcp.json — kept off the file, on the child env.
        extraEnv: ((): Record<string, string> | undefined => {
          const e = {
            ...(pipe ? { ...pipe.env, ELECTRON_RUN_AS_NODE: '1' } : {}),
            ...cursorMcp.secretEnv,
          };
          return Object.keys(e).length > 0 ? e : undefined;
        })(),
        abort,
      };

      const execute = async (): Promise<CursorRunOutcome> => {
        started = true;
        const handle = await runtime.start(spec, bridge);
        if (run) run.query = { close: handle.close };
        this.setLifecycle('streaming');
        this.setRequest(sessionId, { phase: 'streaming' });
        this.diag('stream', 'debug', 'Streaming response', undefined, sessionId);
        return handle.done;
      };

      const withMcp = (): Promise<CursorRunOutcome> => withSessionMcpJson(cwd, mcpSpec, execute);
      const withHooks = (): Promise<CursorRunOutcome> => withSessionHooksJson(cwd, hookCfg, withMcp);
      const inner = injectViaRules
        ? (): Promise<CursorRunOutcome> => withSessionContextRule(cwd, ruleBlock, withHooks)
        : withHooks;
      const withCli = (): Promise<CursorRunOutcome> =>
        withSessionCliJson(cwd, { deny: denyRules, allow: allowRules, ask: askRules }, inner);
      // Outermost: the declarative `.cursor/sandbox.json` (snapshot+restored like
      // every other generated session file, so `git status` stays clean).
      //
      // The jail must grant the bridge its socket + binaries, or it starves the
      // permission mechanism itself: the hook child cannot connect, fails
      // closed, and every tool call is denied "bridge unreachable".
      const pipePath = pipe?.env.LIMBOO_BRIDGE_PIPE;
      return withSessionSandboxJson(cwd, sandbox, withCli, {
        socketDir:
          pipePath && process.platform !== 'win32' ? path.dirname(pipePath) : undefined,
        executables: pipe ? [bridgeNodeCommand()] : [],
        scripts: [hookRunnerPath, mcpBridgePath].filter((p): p is string => !!p),
      });
    };

    let outcome: CursorRunOutcome;
    try {
      try {
        outcome = await runAttempt(true);
      } catch (err) {
        // A pre-spawn failure with a rules file pending is most likely the
        // rule write itself — retry once with prompt-prepended context (the
        // documented fallback). Anything after spawn rethrows unchanged.
        if (!started) {
          this.diag(
            'lifecycle',
            'warning',
            'Context rule write failed — falling back to prompt injection',
            err instanceof Error ? err.message.slice(0, 300) : undefined,
            sessionId,
          );
          outcome = await runAttempt(false);
        } else {
          throw err;
        }
      }
    } finally {
      stream.finishStreaming();
      // Remove the in-workspace attachment mirror so git status ends clean.
      if (attachmentStaging) {
        if (run) run.stagedAttachmentsDir = undefined;
        await attachmentStaging.cleanup();
      }
      if (pipe) {
        // Capability record for Settings › Agent › Troubleshooting.
        this.setState({
          cursorBridge: {
            hooksActive: hookCfg ? pipe.hookConnected : null,
            mcpActive: mcpSpec ? pipe.mcpConnected : null,
            at: Date.now(),
          },
        });
        // Hook-capability bookkeeping (drives the hook-gated --force posture):
        // a connect verifies this CLI version; a COMPLETED forced run that
        // exercised write/command tools with hooks registered but never
        // connected means the CLI ignored hooks.json — forget the
        // verification so 'default' runs revert to propose-only. An aborted
        // run proves nothing (hooks may simply not have fired yet), so it
        // never clears — otherwise a single Stop would flip-flop the posture.
        // Hooks registered but never connected means the run had no way to
        // PROMPT — the declarative cli.json floor was the only thing standing
        // between the agent and a total block. Say so once per run so
        // Troubleshooting can explain a degraded session instead of leaving the
        // user to infer it from things silently not working.
        if (hookCfg && !pipe.hookConnected && gatedToolSeen) {
          this.diag(
            'tool',
            'warning',
            'Cursor hook bridge never connected — interactive approval was unavailable',
            'Tool calls were governed by the declarative .cursor/cli.json rules alone. ' +
              'Reads stay allowed by the read-only floor; anything outside it was refused ' +
              'by the CLI without reaching a prompt.',
            sessionId,
          );
        }
        if (hookCfg && cliVersion) {
          if (pipe.hookConnected) {
            setHooksVerified(cliVersion);
          } else if (
            force &&
            gatedToolSeen &&
            !abort.signal.aborted &&
            getVerifiedHooksVersion() === cliVersion
          ) {
            clearHooksVerified();
            this.diag(
              'lifecycle',
              'warning',
              'Cursor hooks went silent during an interactive run — reverting to propose-only',
              `CLI ${cliVersion}`,
              sessionId,
            );
          }
        }
        void pipe.close();
      }
      this.setState({
        cursorInteractive: {
          active:
            hooksEnabled && !!cliVersion && getVerifiedHooksVersion() === cliVersion,
          cliVersion,
        },
      });
    }

    if (abort.signal.aborted) return;

    // Plan capture, style 'result': Cursor has no ExitPlanMode tool — in plan
    // mode the plan IS the final result text.
    if (isPlan && outcome.result?.ok && outcome.result.text.trim().length > 0) {
      this.capturePlan(sessionId, outcome.result.text);
      const active = this.runs.get(sessionId);
      if (active) active.planCaptured = true;
      return;
    }

    // Propose→apply: a propose-only run that generated mutations surfaces them
    // through the existing plan-approval pipeline (Approve reruns with --force
    // on the same chat — see approvePlan).
    if (!force && !isPlan && !isAsk && outcome.result?.ok && outcome.proposedMutations > 0) {
      this.captureCursorProposal(sessionId, outcome);
    }

    // Same terminal contract as the Claude path: a non-success result is
    // surfaced as a throw so the recovery loop classifies it.
    const result = this.runs.get(sessionId)?.result;
    if (result && !result.ok && !abort.signal.aborted) {
      throw new Error(result.text || 'The run ended with errors.');
    }
  }

  /**
   * Wrap a propose-only Cursor run's pending mutations in a plan artifact so
   * the existing plan-ready banner / panel / Approve flow reviews them. The
   * caveat (documented, accepted): approval re-executes on the resumed chat
   * rather than replaying stored diffs — the Git panel diff is the
   * verification surface.
   */
  private captureCursorProposal(sessionId: string, outcome: CursorRunOutcome): void {
    const n = outcome.proposedMutations;
    const header =
      `> Cursor proposed ${n} change${n === 1 ? '' : 's'} without applying ` +
      '(propose-only run). Approve to apply them.';
    this.capturePlan(sessionId, `${header}\n\n${outcome.result?.text ?? ''}`);
  }

  /** Register a tool invocation (drives the inline chip + activity + changes). */
  private onToolUse(
    sessionId: string,
    id: string,
    name: string,
    input: Record<string, unknown>,
    /** `parent_tool_use_id` when this call came from inside a subagent. */
    parentCallId?: string,
  ): void {
    // TodoWrite drives the live task checklist rather than an inline chip.
    if (name === TODO_TOOL) {
      this.onTodoWrite(sessionId, input);
      return;
    }
    // ExitPlanMode presents the plan. It is normally captured in canUseTool; do
    // it here too as a fallback (in case the SDK doesn't route it through the
    // permission callback) and never render it as a tool chip.
    if (name === EXIT_PLAN_TOOL) {
      const run = this.runs.get(sessionId);
      if (!run?.planCaptured) {
        this.capturePlan(sessionId, typeof input.plan === 'string' ? input.plan : '');
        if (run) run.planCaptured = true;
      }
      return;
    }

    const risk = classifyTool(name);
    // For file-editing tools, compute the change summary + a diff preview up front
    // so they ride along on the tool-start event the renderer stream consumes.
    const change = risk === 'write' ? changeFromInput(name, input) : null;
    const edit = risk === 'write' ? editFromInput(name, input) : null;
    const call: AgentToolCall = {
      id,
      sessionId,
      name,
      risk,
      summary: summarizeTool(name, input, risk),
      detail: permissionDetail(name, input),
      target: toolTarget(name, input),
      change: change ?? undefined,
      edit: edit ?? undefined,
      parentCallId,
      subagent: isSubagentTool(name) ? subagentFromInput(input) : undefined,
      status: 'running',
      startedAt: Date.now(),
    };
    const rt = this.runtime(sessionId);
    rt.toolCalls = [...rt.toolCalls, call];
    this.pushEvent({ kind: 'tool-start', sessionId, call });
    // A worker's OWN tool calls belong to that worker's row, not to the session
    // timeline: recording them here listed a delegated Grep in the Activity feed
    // as if the main agent had run it — the flat presentation the stream was
    // rebuilt to avoid. The delegation itself is still recorded, below.
    if (!parentCallId) {
      this.pushActivity(sessionId, 'tool', call.summary, call.target, 'info');
    }
    this.diag('tool', 'info', call.summary, call.target ?? call.detail, sessionId);

    if (call.subagent) {
      // A worker was delegated to. This is a lifecycle fact, not a tool result,
      // so it also rides the governance bus — the phases already existed and
      // until now only the commit-message one-shot ever emitted them.
      this.emitHook(sessionId, 'subagent-start', {
        tool: name,
        summary: call.summary,
        detail: call.target,
      });
      this.persistSubagentRun(sessionId, call);
    } else if (parentCallId) {
      // This call happened INSIDE a worker: roll it into that worker's record so
      // the single inline row can answer "what did it actually do" without the
      // renderer re-deriving orchestration facts from a flat array.
      this.rollUpSubagentChild(sessionId, parentCallId, call);
    }

    // Governance bus: an MCP tool call is executing (both providers route MCP
    // through an `mcp__<server>__<tool>` name). Distinct from the pre-tool-use
    // gate — this is the execution notification the manifesto's `beforeMCPExecution`
    // maps to. The internal limboo_* read tools are excluded (retrieval noise).
    if (
      name.startsWith('mcp__') &&
      !name.startsWith('mcp__limboo_memory__') &&
      !name.startsWith('mcp__limboo_search__')
    ) {
      this.emitHook(sessionId, 'mcp-exec', { tool: name, summary: call.summary });
    }

    // Mirror agent-run shell commands into the integrated terminal so the user
    // sees exactly what the agent executes. The Agent SDK does not stream tool
    // stdout, so this is a record (command now, output on result) — not a live PTY.
    if (name === 'Bash') this.mirrorCommandStart(sessionId, id, input);

    // A read tool opening a staged attachment flips its chip to "read" live.
    // Both staging locations count: userData (Claude) and the per-run
    // in-workspace mirror (Cursor) — stored names are preserved, so the
    // basename-keyed markReadByPath matches either way.
    if (risk === 'read' && this.attachments) {
      const file = filePathOf(input);
      if (file) {
        const dirs = [this.attachmentsDirFor(sessionId), this.runs.get(sessionId)?.stagedAttachmentsDir];
        if (dirs.some((dir) => dir && isInside(dir, file))) {
          this.attachments.markReadByPath(sessionId, file);
        }
      }
    }

    // Snapshot the pre-edit state before the first write/command of this run.
    if (risk === 'write' || name === 'Bash') this.maybeAutoCheckpoint(sessionId);

    if (change) {
      rt.changes.set(change.path, change);
      this.pushEvent({ kind: 'file-change', sessionId, change });
      this.pushActivity(sessionId, 'file-change', `${change.status} ${shortPath(change.path)}`, undefined, 'info');
      this.emitHook(sessionId, 'file-edit', {
        tool: name,
        summary: `${change.status} ${shortPath(change.path)}`,
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Subagent telemetry (Agent SDK `task_*` system messages)          */
  /* ---------------------------------------------------------------- */

  /**
   * Apply one `task_started` / `task_progress` / `task_updated` /
   * `task_notification` message to the worker's record.
   *
   * Joined by `tool_use_id` — the spawning call's id — never by array position
   * or arrival order, for the same reason `graph/builder.ts` joins `tool-end`
   * through a map: concurrent workers interleave, and a positional join
   * mis-attributes every one of them.
   *
   * Read defensively off an untyped record: the SDK's system-message union is
   * open and grows between releases, so an unknown subtype must be a no-op
   * rather than a throw. Every failure is swallowed — telemetry must never be
   * able to break a run.
   */
  private onTaskMessage(sessionId: string, msg: Record<string, unknown>): void {
    try {
      const subtype = typeof msg.subtype === 'string' ? msg.subtype : '';
      if (!subtype.startsWith('task_')) return;

      // Ambient/housekeeping tasks: the SDK explicitly asks consumers to keep
      // these out of the inline transcript.
      if (msg.skip_transcript === true) return;

      const callId = typeof msg.tool_use_id === 'string' ? msg.tool_use_id : '';
      if (!callId) return;
      const rt = this.runtimes.get(sessionId);
      const call = rt?.toolCalls.find((c) => c.id === callId);
      if (!call?.subagent) return;
      const info = call.subagent;

      const str = (v: unknown, max: number): string | undefined =>
        typeof v === 'string' && v.trim() ? truncate(v.trim(), max) : undefined;

      if (typeof msg.task_id === 'string') info.taskId = truncate(msg.task_id, 128);
      info.type = str(msg.subagent_type, 60) ?? info.type;
      info.description = str(msg.description, 160) ?? info.description;

      // The provider's own measurements outrank anything derived from child
      // calls: `tool_uses` counts what the worker actually invoked, including
      // tools whose events Limboo never saw.
      const usage = msg.usage as { duration_ms?: number; tool_uses?: number; total_tokens?: number } | undefined;
      if (usage && typeof usage === 'object') {
        if (Number.isFinite(usage.duration_ms)) info.durationMs = Number(usage.duration_ms);
        if (Number.isFinite(usage.tool_uses)) info.toolUses = Number(usage.tool_uses);
        if (Number.isFinite(usage.total_tokens)) info.totalTokens = Number(usage.total_tokens);
      }

      if (subtype === 'task_progress') {
        // The AI-written present-tense line ("Analyzing authentication module").
        info.progress = str(msg.summary, 200) ?? info.progress;
        info.lastTool = str(msg.last_tool_name, 64) ?? info.lastTool;
      } else if (subtype === 'task_updated') {
        const patch = msg.patch as { error?: unknown; is_backgrounded?: unknown } | undefined;
        if (patch && typeof patch === 'object') {
          info.error = str(patch.error, 500) ?? info.error;
          if (patch.is_backgrounded === true) info.background = true;
        }
      } else if (subtype === 'task_notification') {
        const status = msg.status;
        if (status === 'completed' || status === 'failed' || status === 'stopped') {
          info.outcome = status;
        }
        // The worker's final message, as the provider reports it. Preferred
        // over scraping the tool_result text.
        info.summary = str(msg.summary, this.subagentSettings().summaryMax) ?? info.summary;
        // A worker that finished but whose progress line is stale would keep
        // narrating after the fact.
        info.progress = undefined;
      }

      this.pushEvent({ kind: 'tool-start', sessionId, call: { ...call } });
      this.persistSubagentRun(sessionId, call);
    } catch (err) {
      logger.warn('subagent task telemetry failed', err);
    }
  }

  /**
   * Append a chunk of a worker's forwarded narration to its record.
   *
   * This is UNTRUSTED CONTENT — model output Limboo stores and renders verbatim
   * — so it is bounded by `settings.agent.subagents.transcriptMax` and never
   * reaches a system prompt or a context provider. It is also not the worker's
   * reasoning: thinking blocks are filtered out upstream, and nothing here may
   * imply the chain of thought is available.
   */
  private appendSubagentTranscript(sessionId: string, parentCallId: string, text: string): void {
    try {
      const rt = this.runtimes.get(sessionId);
      const call = rt?.toolCalls.find((c) => c.id === parentCallId);
      if (!call?.subagent) return;
      const cap = this.subagentSettings().transcriptMax;
      const next = call.subagent.transcript ? `${call.subagent.transcript}\n\n${text}` : text;
      call.subagent.transcript = truncate(next, cap);
      this.pushEvent({ kind: 'tool-start', sessionId, call: { ...call } });
    } catch (err) {
      logger.warn('subagent transcript append failed', err);
    }
  }

  /** The clamped subagent settings block. */
  private subagentSettings(): AppSettings['agent']['subagents'] {
    return this.settings.getAll().agent.subagents;
  }

  /**
   * Upsert a subagent run so the row survives a restart.
   *
   * Ordinary tool calls are deliberately NOT persisted — they are runtime state
   * rebuilt per run. A subagent is the exception: its row is the only record of
   * a delegation in the conversation, and without this the Work Graph remembered
   * that a worker ran while the transcript showed nothing at all.
   */
  private persistSubagentRun(sessionId: string, call: AgentToolCall): void {
    if (!call.subagent) return;
    try {
      const db = getDb();
      db.prepare(
        `INSERT INTO agent_subagent_runs
           (call_id, session_id, parent_call_id, subagent_type, description, status, payload, started_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(call_id) DO UPDATE SET
           status = excluded.status,
           subagent_type = excluded.subagent_type,
           description = excluded.description,
           payload = excluded.payload,
           ended_at = excluded.ended_at`,
      ).run(
        call.id,
        sessionId,
        call.parentCallId ?? null,
        call.subagent.type ?? null,
        call.subagent.description ?? null,
        call.status,
        JSON.stringify(call.subagent),
        call.startedAt,
        call.endedAt ?? null,
      );
      this.pruneSubagentRuns(sessionId);
    } catch (err) {
      logger.warn('subagent run persist failed', err);
    }
  }

  /** Ring-cap stored runs per session (oldest first), like work_graph_nodes. */
  private pruneSubagentRuns(sessionId: string): void {
    try {
      getDb()
        .prepare(
          `DELETE FROM agent_subagent_runs
             WHERE session_id = ?
               AND call_id NOT IN (
                 SELECT call_id FROM agent_subagent_runs
                  WHERE session_id = ? ORDER BY started_at DESC LIMIT ?
               )`,
        )
        .run(sessionId, sessionId, this.subagentSettings().retainRuns);
    } catch {
      /* pruning is housekeeping — never fail a run over it */
    }
  }

  /**
   * Rehydrate persisted subagent rows as tool calls for a session snapshot.
   *
   * Returns synthetic {@link AgentToolCall}s carrying only what a subagent row
   * needs to render. A run still in flight is left to the live runtime, which
   * always wins — these fill in the turns the process no longer has in memory.
   */
  private loadSubagentRuns(sessionId: string): AgentToolCall[] {
    try {
      const rows = getDb()
        .prepare(
          `SELECT call_id, parent_call_id, status, payload, started_at, ended_at
             FROM agent_subagent_runs WHERE session_id = ? ORDER BY started_at ASC`,
        )
        .all(sessionId) as Array<{
        call_id: string;
        parent_call_id: string | null;
        status: string;
        payload: string;
        started_at: number;
        ended_at: number | null;
      }>;
      return rows.flatMap((r) => {
        let info: SubagentInfo;
        try {
          info = JSON.parse(r.payload) as SubagentInfo;
        } catch {
          return [];
        }
        // A run that was live when the process died can never resume, so it is
        // rehydrated as errored rather than as a row that spins forever.
        const status: ToolCallStatus = r.status === 'running' ? 'error' : (r.status as ToolCallStatus);
        return [
          {
            id: r.call_id,
            sessionId,
            name: 'Agent',
            risk: 'command' as ToolRisk,
            summary: info.type ? `${info.type} agent` : 'Subagent',
            target: info.description,
            parentCallId: r.parent_call_id ?? undefined,
            subagent: info,
            status,
            startedAt: r.started_at,
            endedAt: r.ended_at ?? undefined,
          },
        ];
      });
    } catch (err) {
      logger.warn('subagent run load failed', err);
      return [];
    }
  }

  /**
   * Fold one of a worker's own tool calls into the spawning call's record.
   *
   * Mutates the parent call in place and re-emits it, because `tool-start` is
   * the only event carrying a whole {@link AgentToolCall} — the renderer's
   * reducer de-dupes on id, so re-pushing the parent is how a live subagent row
   * updates its counters while it runs. Every failure is swallowed: an
   * observability roll-up must never be able to break a run.
   */
  private rollUpSubagentChild(sessionId: string, parentCallId: string, child: AgentToolCall): void {
    try {
      const rt = this.runtimes.get(sessionId);
      const parent = rt?.toolCalls.find((c) => c.id === parentCallId);
      if (!parent?.subagent) return;
      const info = parent.subagent;

      const cap = this.rollupCap();
      const push = (list: string[], value: string): void => {
        const v = truncate(value, SUBAGENT_LIMITS.fieldMax);
        if (v && !list.includes(v) && list.length < cap) list.push(v);
      };

      push(info.tools ?? (info.tools = []), child.name);

      // Limboo's OWN retrieval bridges are not "MCP servers the worker reached"
      // — they are the app's internal memory/search plumbing, and every other
      // site in this file excludes them. Counting them here made a plain memory
      // lookup report a phantom server alongside its memoryLookups increment.
      if (child.name.startsWith('mcp__') && !isInternalMcpTool(child.name)) {
        const server = child.name.split('__')[1];
        if (server) push(info.mcpServers ?? (info.mcpServers = []), server);
      }
      if (MEMORY_LOOKUP_RE.test(child.name)) info.memoryLookups = (info.memoryLookups ?? 0) + 1;
      // Every read-shaped tool, matching the `read` stage in subagentStages.ts.
      // Counting only `Read` under-reported a worker that explored with Glob/LS.
      if (READ_SHAPED_TOOLS.has(child.name)) info.filesRead = (info.filesRead ?? 0) + 1;

      const childChange = child.change;
      if (childChange) {
        const changed = info.filesChanged ?? (info.filesChanged = []);
        const existing = changed.find((c) => c.path === childChange.path);
        if (existing) {
          // A worker editing the same file twice is one changed file with the
          // combined diffstat, not two rows.
          existing.adds += childChange.adds;
          existing.dels += childChange.dels;
        } else if (changed.length < cap) {
          changed.push({ ...childChange });
        }
      }

      // Verification the worker actually ran — the spec's "validation steps".
      // Recognized from the command text, never assumed: a worker that ran no
      // tests must produce an empty list so the row omits the line rather than
      // claiming zero.
      if (child.name === 'Bash') {
        const kind = validationKindOf(child.detail ?? child.target ?? '');
        if (kind) {
          const list = info.validations ?? (info.validations = []);
          if (list.length < cap) {
            list.push({
              kind,
              command: truncate(child.detail ?? child.target ?? '', SUBAGENT_LIMITS.fieldMax),
              // Optimistic until tool-end settles it; patched in onToolResult.
              ok: true,
            });
          }
        }
      }
      this.pushEvent({ kind: 'tool-start', sessionId, call: { ...parent } });
    } catch (err) {
      logger.warn('subagent roll-up failed', err);
    }
  }

  /** Record a permission outcome against the worker that raised it, if any. */
  private rollUpSubagentPermission(sessionId: string, parentCallId: string, denied: boolean): void {
    try {
      const rt = this.runtimes.get(sessionId);
      const parent = rt?.toolCalls.find((c) => c.id === parentCallId);
      if (!parent?.subagent) return;
      const p = parent.subagent.permissions ?? (parent.subagent.permissions = { prompted: 0, denied: 0 });
      p.prompted += 1;
      if (denied) p.denied += 1;
      this.pushEvent({ kind: 'tool-start', sessionId, call: { ...parent } });
    } catch (err) {
      logger.warn('subagent permission roll-up failed', err);
    }
  }

  /** The configured roll-up cap, clamped by SettingsManager. */
  private rollupCap(): number {
    return this.settings.getAll().agent.subagents.rollupMax;
  }

  /** Mark the validation step a worker's failed command corresponds to. */
  private settleSubagentValidation(sessionId: string, child: AgentToolCall): void {
    try {
      const rt = this.runtimes.get(sessionId);
      const parent = rt?.toolCalls.find((c) => c.id === child.parentCallId);
      if (!parent?.subagent?.validations) return;
      const list = parent.subagent.validations;
      const command = truncate(child.detail ?? child.target ?? '', SUBAGENT_LIMITS.fieldMax);
      const entry = list.find((v) => v.command === command && v.ok);
      if (!entry) return;
      entry.ok = false;
      this.pushEvent({ kind: 'tool-start', sessionId, call: { ...parent } });
    } catch (err) {
      logger.warn('subagent validation settle failed', err);
    }
  }

  /**
   * The spawning call that owns a permission prompt raised right now, or
   * undefined when it cannot be determined soundly.
   *
   * The SDK does not pass `parent_tool_use_id` to `canUseTool`, so attribution
   * has to come from elsewhere. Two sources, in order:
   *
   *  1. **The task stream.** `task_progress` reports `last_tool_name` per
   *     worker, so a prompt for tool X while exactly one live worker is running
   *     X is that worker's. This resolves the common concurrent case.
   *  2. **Sole worker.** With exactly one worker in flight there is no ambiguity.
   *
   * When neither applies the answer is undefined — attributing a prompt to the
   * wrong worker is worse than not attributing it, so ambiguity yields nothing
   * and the dialog renders exactly as it does without subagents.
   */
  private subagentOwningPrompt(sessionId: string, toolName?: string): AgentToolCall | undefined {
    const rt = this.runtimes.get(sessionId);
    if (!rt) return undefined;
    const live = rt.toolCalls.filter((c) => c.subagent && c.status === 'running');
    if (live.length === 0) return undefined;
    if (live.length === 1) return live[0];
    if (!toolName) return undefined;
    const matches = live.filter((c) => c.subagent?.lastTool === toolName);
    return matches.length === 1 ? matches[0] : undefined;
  }

  private onToolResult(
    sessionId: string,
    toolUseId: string,
    status: 'done' | 'error',
    output?: string,
  ): void {
    // Complete any mirrored command record first (independent of toolCalls state).
    this.mirrorCommandEnd(sessionId, toolUseId, status, output);

    const rt = this.runtimes.get(sessionId);
    if (!rt) return;
    const call = rt.toolCalls.find((c) => c.id === toolUseId);
    if (!call) return;
    call.status = status;
    call.endedAt = Date.now();
    // A successful Read carries the file content the model just saw. Keep a
    // bounded, gutter-stripped copy so the stream can render it as a highlighted
    // code block rather than only the path.
    const read =
      status === 'done' && call.name === 'Read' ? readFromResult(output, call.target) : null;
    if (read) call.read = read;

    // A worker's verification command settling decides whether that validation
    // step passed. Recorded optimistically on start; corrected here.
    if (call.parentCallId && call.name === 'Bash' && status === 'error') {
      this.settleSubagentValidation(sessionId, call);
    }

    if (call.subagent) {
      // The Agent tool's result IS the worker's final message — the distilled
      // summary the parent receives. It was previously discarded (only Read
      // output was kept), which left the completion row with nothing to show.
      //
      // `task_notification` is the better source and may already have set it, so
      // it is not overwritten: the harness's own report beats scraped text. An
      // ERRORED result is never stored as a summary at all — an interrupt
      // message ("Interrupted before it finished.") presented under "returned
      // summary" would be Limboo's words in the worker's mouth.
      const text = typeof output === 'string' ? output.trim() : '';
      if (text && status === 'done' && !call.subagent.summary) {
        call.subagent.summary = truncate(text, this.subagentSettings().summaryMax);
      }
      if (text && status === 'error') {
        call.subagent.error = truncate(text, 500);
        call.subagent.outcome = call.subagent.outcome ?? 'failed';
      }
      const agentId = text.match(/agentId:\s*([\w-]+)/)?.[1];
      if (agentId && !call.subagent.type) call.subagent.type = agentId;
      if (!call.subagent.outcome) call.subagent.outcome = status === 'error' ? 'failed' : 'completed';
      this.emitHook(sessionId, 'subagent-stop', {
        tool: call.name,
        summary: call.summary,
        detail: call.subagent.summary,
        severity: status === 'error' ? 'error' : 'info',
      });
      // One timeline entry per delegation, replacing the worker's suppressed
      // internals with the fact that actually belongs in the session record.
      this.pushActivity(
        sessionId,
        'tool',
        `${call.summary} ${status === 'error' ? 'failed' : 'completed'}`,
        call.subagent.description,
        status === 'error' ? 'warning' : 'success',
      );
    }

    this.pushEvent({
      kind: 'tool-end',
      sessionId,
      callId: toolUseId,
      status,
      read: read ?? undefined,
    });
    // The subagent record only exists on the whole-call event, so re-emit the
    // settled parent to carry its summary + final counters to the renderer.
    if (call.subagent) {
      this.pushEvent({ kind: 'tool-start', sessionId, call: { ...call } });
      this.persistSubagentRun(sessionId, call);
    }
    this.emitHook(sessionId, 'post-tool-use', {
      tool: call.name,
      summary: call.summary,
      severity: status === 'error' ? 'error' : 'info',
    });
  }

  /* ---------------------------------------------------------------- */
  /* Terminal mirroring (agent shell commands → integrated terminal)  */
  /* ---------------------------------------------------------------- */

  /** Echo an agent Bash command into the integrated terminal (status running). */
  private mirrorCommandStart(
    sessionId: string,
    callId: string,
    input: Record<string, unknown>,
  ): void {
    if (!this.terminal) return;
    if (!this.settings.getAll().agent.terminal.mirrorAgentCommands) return;
    const workspaceId = this.workspace.getActive()?.id;
    if (!workspaceId) return;
    const command = typeof input.command === 'string' ? input.command : '';
    if (!command) return;

    const terminalId = this.terminal.ensureAgentTerminal(workspaceId, sessionId);
    if (!terminalId) return;

    this.emitHook(sessionId, 'shell-exec', { tool: 'Bash', summary: command });

    const startedAt = Date.now();
    this.mirroredCommands.set(callId, { terminalId, command, startedAt });
    const record: TerminalCommandRecord = {
      terminalId,
      sessionId,
      callId,
      command,
      status: 'running',
      startedAt,
    };
    this.terminal.mirrorAgentCommand(record);
  }

  /** Complete a mirrored command record with its output + exit status. */
  private mirrorCommandEnd(
    sessionId: string,
    callId: string,
    status: 'done' | 'error',
    output?: string,
  ): void {
    const pending = this.mirroredCommands.get(callId);
    if (!pending || !this.terminal) return;
    this.mirroredCommands.delete(callId);
    const record: TerminalCommandRecord = {
      terminalId: pending.terminalId,
      sessionId,
      callId,
      command: pending.command,
      output: output ? output.slice(0, 100_000) : undefined,
      status: status === 'error' ? 'error' : 'done',
      exitCode: status === 'error' ? 1 : 0,
      startedAt: pending.startedAt,
      endedAt: Date.now(),
    };
    this.terminal.mirrorAgentCommand(record);
  }

  /** Map a TodoWrite call into the live task checklist + broadcast it. */
  private onTodoWrite(sessionId: string, input: Record<string, unknown>): void {
    const todos = Array.isArray(input.todos) ? (input.todos as Array<Record<string, unknown>>) : [];
    const tasks: TaskItem[] = todos.map((t, i) => {
      const status = normalizeTaskStatus(t.status);
      const label = String(t.content ?? t.activeForm ?? `Task ${i + 1}`).slice(0, 300);
      return { id: `${sessionId}_todo_${i}`, label, status, done: status === 'completed' };
    });
    const rt = this.runtime(sessionId);
    rt.tasks = tasks;
    this.pushEvent({ kind: 'tasks', sessionId, tasks });
  }

  /* ---------------------------------------------------------------- */
  /* Plan Mode                                                        */
  /* ---------------------------------------------------------------- */

  /** Public accessor (IPC): the current plan artifact for a session, if any. */
  getPlan(sessionId: string): SessionPlan | null {
    return this.loadPlan(sessionId);
  }

  /**
   * Unfinished work for the Resume Pipeline's context reconstruction: the live
   * TodoWrite checklist when it has incomplete items, else the unchecked
   * checkboxes of a persisted, not-yet-completed plan. Read-only and bounded;
   * null when there is nothing outstanding.
   */
  unfinishedPlanItems(sessionId: string): { title: string; items: string[] } | null {
    const cap = RESUME_LIMITS.maxPlanItemsInjected;
    const plan = this.loadPlan(sessionId);
    const live = (this.runtimes.get(sessionId)?.tasks ?? []).filter((t) => !t.done);
    if (live.length > 0) {
      return {
        title: plan?.title ?? 'current task list',
        items: live.slice(0, cap).map((t) => t.label),
      };
    }
    if (!plan || (plan.status !== 'ready' && plan.status !== 'implementing')) return null;
    const items: string[] = [];
    for (const line of plan.markdown.split(/\r?\n/)) {
      const m = /^\s*(?:[-*]|\d+\.)\s*\[ \]\s+(.+)$/.exec(line);
      if (!m) continue;
      items.push(m[1].trim());
      if (items.length >= cap) break;
    }
    return items.length > 0 ? { title: plan.title, items } : null;
  }

  /**
   * Settle plan rows stranded by the last shutdown. Only `send`'s `finally`
   * moves a plan off `planning`, and only a completed implement run moves one
   * off `implementing` — so a quit or crash mid-run leaves a row in a state the
   * UI renders as permanently in-flight. `PlanPanel` hides its whole toolbar
   * while `planning` and its approval block unless `ready`, so such a row has NO
   * approve, reject or regenerate: the session is stuck with no way out.
   *
   * Safe to do unconditionally at boot: `this.runs` is empty, so nothing here
   * can be alive. Writes the DB only — no window exists yet to receive an event,
   * and every renderer hydrates through {@link getSnapshot}, which reads it.
   */
  private reconcilePlans(): void {
    try {
      const rows = getDb()
        .prepare("SELECT session_id FROM agent_plans WHERE status IN ('planning', 'implementing')")
        .all() as Array<{ session_id: string }>;
      let settled = 0;
      for (const row of rows) {
        const plan = this.loadPlan(row.session_id);
        if (!plan) continue;
        // A planning run that never presented a plan is over; an implementation
        // that never finished goes back to `ready` so it can be approved again —
        // 'completed' would claim work that demonstrably did not happen.
        const status: PlanStatus = plan.status === 'planning' ? 'rejected' : 'ready';
        this.savePlan({ ...plan, status });
        settled += 1;
      }
      if (settled > 0) {
        this.diag('lifecycle', 'info', `Settled ${settled} plan(s) interrupted by the last shutdown`);
      }
    } catch (err) {
      // Never block boot on housekeeping.
      this.diag(
        'lifecycle',
        'warning',
        'Could not reconcile interrupted plans',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /** Open a fresh planning artifact when a plan run starts. */
  private beginPlan(sessionId: string, prompt: string): void {
    // A plan awaiting approval is a user-visible artifact — never overwrite one
    // without filing it in History first. Restoring the composer's default
    // `plan` mode after a restart made this reachable by simply typing.
    const existing = this.loadPlan(sessionId);
    if (existing && (existing.status === 'ready' || existing.status === 'implementing')) {
      this.snapshotRevision(existing);
    }
    const plan: SessionPlan = {
      sessionId,
      status: 'planning',
      title: deriveTitle('', prompt),
      markdown: '',
      meta: { frameworks: this.workspace.getActive()?.metadata.frameworks?.slice(0, 6) },
      createdAt: Date.now(),
    };
    this.savePlan(plan);
    this.pushEvent({ kind: 'plan', sessionId, plan });
    this.pushActivity(sessionId, 'status', 'Planning started', 'Analyzing the repository (read-only)', 'info');
    this.diag('request', 'info', 'Plan run started', undefined, sessionId);
  }

  /** Capture the plan the agent presented through ExitPlanMode, awaiting approval. */
  private capturePlan(sessionId: string, rawMarkdown: string): void {
    const markdown = rawMarkdown.slice(0, AGENT_LIMITS.planMarkdownMax);
    const existing = this.loadPlan(sessionId);
    const rt = this.runtimes.get(sessionId);
    const taskCount = rt?.tasks.length || undefined;
    const plan: SessionPlan = {
      sessionId,
      status: 'ready',
      title: deriveTitle(markdown, existing?.title),
      markdown,
      meta: {
        taskCount,
        affectedFiles: countAffectedFiles(markdown),
        risk: estimateRisk(taskCount),
        frameworks: existing?.meta.frameworks,
      },
      createdAt: existing?.createdAt ?? Date.now(),
      pinned: existing?.pinned,
    };
    this.savePlan(plan);
    this.pushEvent({ kind: 'plan', sessionId, plan });
    this.pushActivity(sessionId, 'status', 'Plan ready for review', undefined, 'info');
    this.diag('request', 'info', 'Plan captured — awaiting approval', undefined, sessionId);
  }

  /**
   * Approve a ready plan and begin implementation. Records the approval, unlocks
   * writes (implement mode), and resumes the same SDK session so the agent keeps
   * the plan in context. The only transition that lets the agent touch the repo.
   */
  async approvePlan(sessionId: string, execMode: SessionPermissionMode = 'default'): Promise<void> {
    if (this.loadPlan(sessionId)?.status !== 'ready') {
      throw new Error('There is no plan ready to approve for this session.');
    }
    // The plan run that produced this plan is usually still unwinding — wait for
    // it BEFORE mutating anything, so a timeout leaves the plan 'ready' and the
    // Approve button retryable rather than stranding the session.
    await this.waitForRunSettle(sessionId);
    // Re-read: the settling run republishes the plan on its way out (the
    // planning→rejected settle in send's finally), so the pre-wait snapshot may
    // be stale. Bail without mutating if it moved off 'ready'.
    const plan = this.loadPlan(sessionId);
    if (!plan || plan.status !== 'ready') {
      throw new Error('There is no plan ready to approve for this session.');
    }
    // Approving a plan never starts another planning pass — coerce a stray
    // read-only mode ('plan'/'ask') to the ask-before-edits execution mode.
    const mode: SessionPermissionMode =
      execMode === 'plan' || execMode === 'ask' ? 'default' : execMode;
    const approved: SessionPlan = { ...plan, status: 'implementing', approvedAt: Date.now() };
    // Committed BEFORE the send on purpose: runCursorOnce re-reads this row to
    // decide whether the implement pass runs with --force.
    this.savePlan(approved);
    this.pushEvent({ kind: 'plan', sessionId, plan: approved });
    this.pushActivity(sessionId, 'status', 'Plan approved — implementing', undefined, 'success');
    this.diag('request', 'info', `Plan approved (${mode})`, undefined, sessionId);

    // Cursor implement passes re-run with --force on the resumed chat (see
    // runCursorOnce), so the prompt asks it to apply what it already proposed.
    const instruction =
      providerForModel(this.settings.getAll().agent.model) === 'cursor'
        ? 'The plan below is approved — implement it now, applying the proposed changes exactly as planned, working through the steps in order.'
        : 'The plan below is approved. Implement it now, working through the steps in order and tracking your progress with the TodoWrite tool. Ask for approval before any change you are unsure about.';
    // The plan RIDES THE PROMPT rather than relying on the provider conversation
    // to still hold it. A plan run always ends on an ExitPlanMode deny with
    // `interrupt: true`, which leaves a tool call unanswered — exactly the
    // condition `stop()` (and quit, via `cleanup()`) uses to forget the stored
    // resume/chat id. Without this the approval that follows a restart opened a
    // FRESH conversation and pointed it at a plan the model had never seen: the
    // run "succeeded" having done nothing, and markPlanCompletedIfImplementing
    // then filed the plan as completed. Approve must not depend on state that
    // does not survive the process.
    const body = plan.markdown.trim().slice(0, AGENT_LIMITS.planPromptMax);
    const prompt = body ? `${instruction}\n\n<approved-plan>\n${body}\n</approved-plan>` : instruction;
    try {
      // The prompt is a document plus XML tags — correct to SEND, unreadable to
      // SHOW. The turn renders as one line with the plan beneath it as rendered
      // Markdown; the raw view still reveals exactly what the model received.
      await this.send(sessionId, prompt, mode, undefined, undefined, {
        text: plan.title ? `Approved the plan — ${plan.title}` : 'Approved the plan',
        ...(body ? { body } : {}),
      });
    } catch (err) {
      // The approval never took effect — put the plan back so Approve renders
      // again. Without this the session is stranded: 'implementing' hides the
      // controls forever AND makes every later Cursor run silently --force.
      this.savePlan(plan);
      this.pushEvent({ kind: 'plan', sessionId, plan });
      this.pushActivity(
        sessionId,
        'status',
        'Could not start implementing — plan restored',
        err instanceof Error ? err.message : undefined,
        'warning',
      );
      throw err;
    }
  }

  /** Pin / unpin the current plan so it is preserved even after a new plan begins. */
  setPlanPinned(sessionId: string, pinned: boolean): void {
    const plan = this.loadPlan(sessionId);
    if (!plan) return;
    const next: SessionPlan = { ...plan, pinned };
    this.savePlan(next);
    this.pushEvent({ kind: 'plan', sessionId, plan: next });
  }

  /** Reject a ready plan; the session returns to an idle, no-plan state. */
  rejectPlan(sessionId: string): void {
    const plan = this.loadPlan(sessionId);
    if (!plan) return;
    const rejected: SessionPlan = { ...plan, status: 'rejected' };
    this.savePlan(rejected);
    this.pushEvent({ kind: 'plan', sessionId, plan: rejected });
    this.pushActivity(sessionId, 'status', 'Plan rejected', undefined, 'warning');
    this.diag('request', 'info', 'Plan rejected', undefined, sessionId);
  }

  /** Discard the current plan and run a fresh planning pass (optionally guided). */
  async regeneratePlan(sessionId: string, extra?: string): Promise<void> {
    // Same race as approvePlan: "Keep planning" is offered the instant the plan
    // renders, while the run that produced it is still tearing down.
    await this.waitForRunSettle(sessionId);
    const plan = this.loadPlan(sessionId);
    // Preserve the outgoing plan as a revision before the new pass overwrites it,
    // so iterative planning cycles can be compared/restored.
    if (plan && plan.markdown.trim().length > 0) this.snapshotRevision(plan);
    const base = plan?.title ? `Reconsider the plan for: ${plan.title}.` : 'Produce a new implementation plan.';
    const prompt = extra && extra.trim().length > 0 ? `${base}\n\n${extra.trim()}` : base;
    await this.send(sessionId, prompt, 'plan');
  }

  /** List the historical plan revisions for a session, newest first. */
  listPlanRevisions(sessionId: string): PlanRevision[] {
    if (!this.settings.getAll().agent.plan.retainPlanHistory) return [];
    const rows = getDb()
      .prepare(
        'SELECT id, session_id, rev, status, title, markdown, meta, created_at FROM plan_revisions WHERE session_id = ? ORDER BY rev DESC',
      )
      .all(sessionId) as Array<{
      id: string;
      session_id: string;
      rev: number;
      status: string;
      title: string;
      markdown: string;
      meta: string;
      created_at: number;
    }>;
    return rows.map((r) => {
      let meta: PlanMeta = {};
      try {
        meta = JSON.parse(r.meta) as PlanMeta;
      } catch {
        /* keep empty meta on a corrupt row */
      }
      return {
        id: r.id,
        sessionId: r.session_id,
        rev: r.rev,
        status: r.status as PlanStatus,
        title: r.title,
        markdown: r.markdown,
        meta,
        createdAt: r.created_at,
      };
    });
  }

  /** Restore a historical revision as the session's current (ready) plan. */
  restorePlanRevision(sessionId: string, revisionId: string): void {
    const rev = this.listPlanRevisions(sessionId).find((r) => r.id === revisionId);
    if (!rev) throw new Error('That plan revision no longer exists.');
    const current = this.loadPlan(sessionId);
    // Snapshot the current plan first so the restore itself is reversible.
    if (current && current.markdown.trim().length > 0) this.snapshotRevision(current);
    const restored: SessionPlan = {
      sessionId,
      status: 'ready',
      title: rev.title,
      markdown: rev.markdown,
      meta: rev.meta,
      createdAt: current?.createdAt ?? Date.now(),
      pinned: current?.pinned,
    };
    this.savePlan(restored);
    this.pushEvent({ kind: 'plan', sessionId, plan: restored });
    this.pushActivity(sessionId, 'status', 'Plan revision restored', undefined, 'info');
  }

  /** Persist a plan snapshot into `plan_revisions`, pruning to the history limit. */
  private snapshotRevision(plan: SessionPlan): void {
    const planCfg = this.settings.getAll().agent.plan;
    if (!planCfg.retainPlanHistory) return;
    const db = getDb();
    const next =
      ((db
        .prepare('SELECT MAX(rev) AS m FROM plan_revisions WHERE session_id = ?')
        .get(plan.sessionId) as { m: number | null } | undefined)?.m ?? 0) + 1;
    db.prepare(
      `INSERT INTO plan_revisions (id, session_id, rev, status, title, markdown, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(),
      plan.sessionId,
      next,
      plan.status,
      plan.title,
      plan.markdown,
      JSON.stringify(plan.meta ?? {}),
      Date.now(),
    );
    // Prune older revisions beyond the configured limit.
    db.prepare(
      `DELETE FROM plan_revisions
        WHERE session_id = ?
          AND id NOT IN (
            SELECT id FROM plan_revisions WHERE session_id = ? ORDER BY rev DESC LIMIT ?
          )`,
    ).run(plan.sessionId, plan.sessionId, planCfg.historyLimit);
  }

  /** When a plan was being implemented and the run succeeds, mark it completed. */
  private markPlanCompletedIfImplementing(sessionId: string): void {
    const plan = this.loadPlan(sessionId);
    if (!plan || plan.status !== 'implementing') return;
    const completed: SessionPlan = { ...plan, status: 'completed' };
    this.savePlan(completed);
    this.pushEvent({ kind: 'plan', sessionId, plan: completed });
    this.diag('request', 'info', 'Plan implementation completed', undefined, sessionId);
    this.savePlanToMemory(completed);
  }

  /**
   * Persist a completed plan into the Local Memory system (opt-in) so its strategy
   * becomes retrievable project knowledge on future tasks. Best-effort: a memory
   * failure never breaks the run.
   */
  private savePlanToMemory(plan: SessionPlan): void {
    const s = this.settings.getAll();
    if (!this.memory || !s.memory.enabled || !s.agent.plan.savePlansToMemory) return;
    if (plan.markdown.trim().length === 0) return;
    try {
      this.memory.create({
        workspaceId: this.workspace.getActive()?.id ?? null,
        tier: 'solution',
        title: `Plan: ${plan.title}`.slice(0, 200),
        body: plan.markdown,
        source: 'conversation',
        sessionId: plan.sessionId,
      });
      this.diag('request', 'info', 'Plan saved to memory', undefined, plan.sessionId);
    } catch (err) {
      this.diag(
        'request',
        'warning',
        'Could not save plan to memory',
        err instanceof Error ? err.message : String(err),
        plan.sessionId,
      );
    }
  }

  private savePlan(plan: SessionPlan): void {
    getDb()
      .prepare(
        `INSERT OR REPLACE INTO agent_plans
           (session_id, status, title, markdown, meta, pinned, created_at, approved_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        plan.sessionId,
        plan.status,
        plan.title,
        plan.markdown,
        JSON.stringify(plan.meta ?? {}),
        plan.pinned ? 1 : 0,
        plan.createdAt,
        plan.approvedAt ?? null,
        Date.now(),
      );
  }

  private loadPlan(sessionId: string): SessionPlan | null {
    const row = getDb()
      .prepare(
        'SELECT session_id, status, title, markdown, meta, pinned, created_at, approved_at FROM agent_plans WHERE session_id = ?',
      )
      .get(sessionId) as
      | {
          session_id: string;
          status: string;
          title: string;
          markdown: string;
          meta: string;
          pinned: number;
          created_at: number;
          approved_at: number | null;
        }
      | undefined;
    if (!row) return null;
    let meta: PlanMeta = {};
    try {
      meta = JSON.parse(row.meta) as PlanMeta;
    } catch {
      /* keep empty meta on a corrupt row */
    }
    return {
      sessionId: row.session_id,
      status: row.status as PlanStatus,
      title: row.title,
      markdown: row.markdown,
      meta,
      pinned: row.pinned === 1,
      createdAt: row.created_at,
      approvedAt: row.approved_at ?? undefined,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Permission bridge                                                */
  /* ---------------------------------------------------------------- */

  private buildOptions(
    sessionId: string,
    cwd: string,
    abort: AbortController,
    agent: ReturnType<SettingsManager['getAll']>['agent'],
    permMode: SessionPermissionMode,
    injectedContext?: string,
  ): Options {
    // PROVIDER first, charset second. Charset validation alone let every
    // plausible Cursor id (`composer-2`, `cheetah`, `gpt-5`) through — they all
    // match ANTHROPIC_MODEL_ID_RE — so a mis-routed model was handed verbatim to
    // the Claude SDK and the user watched Claude Code stream while Cursor was
    // selected. The Cursor arm has always cross-checked its provider; the
    // asymmetry WAS the bug. A mismatch is a hard error, never a silent
    // substitution: running someone else's model is worse than not running.
    const routing = resolveModelRouting(agent.model);
    if (routing.provider !== 'anthropic') {
      throw new Error(
        routing.provider === null
          ? `${routing.reason}. Pick a model in the composer.`
          : `"${agent.model.slice(0, 80)}" is served by ${routing.provider}, not Claude Code.`,
      );
    }
    // Charset guard stays for well-formed but unknown ANTHROPIC ids, so newer
    // Claude models keep working before the catalog catches up.
    const model = ANTHROPIC_MODEL_ID_RE.test(agent.model)
      ? agent.model
      : DEFAULT_SETTINGS.agent.model;
    if (model !== agent.model) {
      logger.warn(`agent: rejected malformed model id (${agent.model.slice(0, 80)}); using default`);
    }
    const options: Options = {
      cwd,
      model,
      // The composer's permission mode maps onto the SDK's:
      //   plan        → read-only; agent presents a plan via ExitPlanMode.
      //   ask         → SDK `default`; read-only enforced by decideToolUse (SDK
      //                 `plan` would drive ExitPlanMode, which ask must not).
      //   default     → writes/commands prompt through our canUseTool bridge.
      //   acceptEdits → SDK auto-approves file edits; commands still prompt.
      // bypassPermissions is never used (safety); the auto/approve-all knobs are
      // enforced on top inside canUseTool.
      permissionMode: permMode === 'ask' ? 'default' : permMode,
      canUseTool: this.makeCanUseTool(sessionId, cwd, permMode),
      maxTurns: agent.maxTurns,
      includePartialMessages: true,
      // Subagent observability. Both default to OFF in the SDK, which is why a
      // delegation used to arrive as nothing but its child tool calls and a
      // final result — everything else the inline row shows had to be guessed.
      //
      //  - forwardSubagentText: the worker's own narration, tagged with
      //    `parent_tool_use_id`. Routed into the worker's row by handleMessage
      //    (which reads that id BEFORE finalizing text — see the comment there);
      //    it must never reach the parent transcript.
      //  - agentProgressSummaries: a present-tense line refreshed while the
      //    worker runs, produced by periodically forking its conversation. Costs
      //    little (it reuses the worker's prompt cache) but it is a real cost,
      //    so it stays user-controllable.
      forwardSubagentText: agent.subagents.forwardText,
      agentProgressSummaries: agent.subagents.progressSummaries,
      abortController: abort,
      settingSources: ['user', 'project', 'local'],
      thinking: mapThinking(agent.thinking),
      // Pin the legacy `TodoWrite` checklist tool ON. As of SDK 0.3.142 the agent
      // defaults to the structured Task tools (TaskCreate/TaskUpdate/…) and stops
      // emitting `TodoWrite`, which is the ONLY tool `onTodoWrite` (→ TODO_TOOL)
      // ingests — so without this the Plan panel's live checklist never populates
      // ("Completed · 0/N"). `CLAUDE_CODE_ENABLE_TASKS=0` restores TodoWrite; must
      // spread process.env since this replaces the spawned process's environment.
      // If a future SDK bump removes TodoWrite, migrate onTodoWrite to Task* tools.
      env: { ...process.env, CLAUDE_CODE_ENABLE_TASKS: '0' },
      stderr: (data: string) => logger.warn('[claude]', redact(data)),
    };
    // Point the SDK at the UNPACKED native binary. Without this it auto-resolves
    // claude[.exe] to a path inside app.asar (unrunnable) in a packaged build.
    const claudeExe = resolveClaudeExecutable();
    if (claudeExe) options.pathToClaudeCodeExecutable = claudeExe;
    // Memory + Search context: append durable project knowledge and the ranked
    // retrieval for this prompt to Claude Code's default system prompt (preset
    // preserved), so the agent starts each task with the most relevant context
    // instead of an empty slate.
    if (injectedContext) {
      options.systemPrompt = { type: 'preset', preset: 'claude_code', append: injectedContext };
    }
    if (!agent.webSearch) options.disallowedTools = ['WebSearch', 'WebFetch'];

    // Attachments: grant the SDK read access to THIS session's staging dir only
    // (never the attachments root, never userData) so Read/Grep/Glob can open
    // staged files on demand. Applied on every turn — prior-turn attachments
    // stay readable across resumed conversations.
    const attachmentsDir = this.attachmentsDirFor(sessionId);
    if (attachmentsDir) options.additionalDirectories = [attachmentsDir];

    // OS-level Sandbox (defense-in-depth Layer 3). Limboo's one sandbox policy
    // becomes the SDK's `Options.sandbox` — a Seatbelt/bubblewrap jail fencing
    // Bash + its children to the worktree and the configured network, beneath
    // (never replacing) the canUseTool permission gate. Graceful by default:
    // `failIfUnavailable=false` degrades to an unsandboxed run if bubblewrap is
    // missing. `autoAllowBashIfSandboxed` is pinned off so decideToolUse stays
    // the authority. The metadata is recorded onto the run for the timeline.
    const eff = this.resolveSandboxFor(sessionId, cwd, 'anthropic', agent);
    const claudeSandbox = mapClaudeSandbox(eff);
    if (claudeSandbox) {
      options.sandbox = claudeSandbox;
      this.recordSandboxStatus(sessionId, eff);
    }

    // Resume the Claude Code session so multi-turn conversations keep context.
    const sdkSessionId = this.loadProviderSession(sessionId, 'anthropic');
    if (sdkSessionId) options.resume = sdkSessionId;

    return options;
  }

  private loadProviderSession(sessionId: string, provider: AgentProvider): string | undefined {
    const row = getDb()
      .prepare(
        'SELECT provider_session_id FROM agent_provider_sessions WHERE session_id = ? AND provider = ?',
      )
      .get(sessionId, provider) as { provider_session_id?: string } | undefined;
    return row?.provider_session_id || undefined;
  }

  private makeCanUseTool(sessionId: string, cwd: string, permMode: SessionPermissionMode) {
    return async (
      toolName: string,
      input: Record<string, unknown>,
      { signal }: { signal: AbortSignal },
    ): Promise<PermissionResult> => {
      // ExitPlanMode: the agent is presenting its plan. Capture it for review and
      // interrupt the run — nothing is executed until the user approves.
      if (toolName === EXIT_PLAN_TOOL) {
        const run = this.runs.get(sessionId);
        if (!run?.planCaptured) {
          this.capturePlan(sessionId, typeof input.plan === 'string' ? input.plan : '');
          if (run) run.planCaptured = true;
        }
        return { behavior: 'deny', message: 'Plan captured for your review.', interrupt: true };
      }

      // AskUserQuestion: a workflow pause point, not a tool to approve. Handle it
      // BEFORE risk classification and the plan-mode read-only guard — clarifying
      // questions are the whole point of plan mode and must not be blocked there.
      if (toolName === ASK_USER_QUESTION_TOOL) {
        return this.requestClarification(sessionId, input, signal);
      }

      return this.decideToolUse(sessionId, cwd, permMode, toolName, input, signal);
    };
  }

  /**
   * The provider-neutral tool-permission decision core — risk classification,
   * app-data + workspace path guards, plan read-only enforcement, standing
   * auto-approvals, remembered choices, and finally the interactive
   * PermissionRequest → renderer → respondPermission round-trip. Claude's
   * canUseTool callback and the Cursor hooks bridge both call THIS, so both
   * providers get the same dialogs, the same risk chips, and the same audit
   * trail from one implementation.
   */
  private async decideToolUse(
    sessionId: string,
    cwd: string,
    permMode: SessionPermissionMode,
    toolName: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
    hints?: ToolGateHints,
  ): Promise<PermissionResult> {
    // Both providers (Claude's canUseTool and the Cursor hook bridge) call this
    // wrapper, so a single emission records the pre-tool-use gate outcome onto
    // the governance bus for both. The wrapper NEVER changes the decision — it
    // only observes {@link decideToolUseCore}'s result. `prompted` distinguishes
    // an auto/remembered resolution from one the user had to answer; a per-call
    // ctx object keeps it race-free under concurrent gate calls.
    const gate = { prompted: false };
    const result = await this.decideToolUseCore(
      sessionId,
      cwd,
      permMode,
      toolName,
      input,
      signal,
      gate,
      hints,
    );
    const decision = result.behavior === 'allow' ? 'allow' : 'deny';
    const risk = classifyTool(toolName);
    const summary = summarizeTool(toolName, input, risk);
    this.emitHook(sessionId, 'pre-tool-use', {
      tool: toolName,
      summary,
      severity: decision === 'deny' ? 'warning' : 'info',
      decision,
      auto: !gate.prompted,
    });
    // The Work Graph records the same outcome from the same place, so an
    // approval node is provider-neutral by construction: the Cursor hook bridge
    // calls this method too. It is the ONLY site that knows the user's actual
    // answer — `respondPermission` only writes a diagnostic.
    try {
      this.graph?.onDecision(sessionId, {
        tool: toolName,
        summary,
        detail: permissionDetail(toolName, input),
        risk,
        decision,
        auto: !gate.prompted,
        at: Date.now(),
      });
    } catch {
      /* observability must never change a permission outcome */
    }
    // Attribute a PROMPTED decision to the worker that raised it, when exactly
    // one worker is in flight. Auto-resolved gates are excluded: they are not
    // user-visible events, so counting them would inflate the row's permission
    // figure with decisions nobody was asked to make.
    if (gate.prompted && !isSubagentTool(toolName)) {
      const owner = this.subagentOwningPrompt(sessionId, toolName);
      if (owner) this.rollUpSubagentPermission(sessionId, owner.id, decision === 'deny');
    }
    return result;
  }

  private async decideToolUseCore(
    sessionId: string,
    cwd: string,
    permMode: SessionPermissionMode,
    toolName: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
    gate?: { prompted: boolean },
    hints?: ToolGateHints,
  ): Promise<PermissionResult> {
      // Sandbox-escape audit (G4): when a tool sets the SDK's
      // `dangerouslyDisableSandbox` flag, it is being retried OUTSIDE the OS jail
      // and falls back to this normal permission flow. Record it in the timeline
      // so the audit trail shows whether it stayed contained or escaped —
      // enforcement is unchanged (it still passes every guard below). Covers the
      // subagent tools as well as Bash: the flag is on all of their input
      // schemas, and only Bash used to be recorded.
      if (
        (toolName === 'Bash' || isSubagentTool(toolName)) &&
        (input as { dangerouslyDisableSandbox?: unknown }).dangerouslyDisableSandbox === true
      ) {
        this.pushActivity(
          sessionId,
          'status',
          toolName === 'Bash'
            ? 'Command ran outside the sandbox — normal permission flow'
            : 'Subagent requested to run outside the sandbox — normal permission flow',
          undefined,
          'warning',
        );
      }

      // Attachment carve-out: READ tools may open files inside THIS session's own
      // attachments dir — the userData staging dir (Claude) or the per-run
      // in-workspace mirror (Cursor) — without a prompt. Both live outside the
      // workspace root, so this short-circuits the path guard below; the crown-jewel
      // guard no longer covers the staging dir (it denies only the DB/config/secrets),
      // but the ordering is kept so the allow stays ahead of every gate.
      {
        const attachmentTarget = filePathOf(input);
        if (attachmentTarget && classifyTool(toolName) === 'read') {
          const dirs = [
            this.attachmentsDirFor(sessionId),
            this.runs.get(sessionId)?.stagedAttachmentsDir,
          ];
          for (const dir of dirs) {
            if (dir && isInside(dir, attachmentTarget)) {
              return { behavior: 'allow', updatedInput: input };
            }
          }
        }
      }

      // Crown-jewel guard (defense in depth): the agent must never reach Limboo's own
      // database, config, or safeStorage secrets directly — the memory tools are the
      // only sanctioned read path. Checked before any auto-allow so a Bash
      // `sqlite3 …/limboo.db` can't slip past. Scoped to those specific paths, NOT
      // the whole userData root — the session worktree and attachment staging dir
      // live under it (see protectedPaths / sandbox/policy.ts).
      if (touchesCrownJewel(toolName, input)) {
        this.pushActivity(
          sessionId,
          'permission',
          `Blocked ${toolName} on Limboo's database/settings`,
          undefined,
          'danger',
        );
        return {
          behavior: 'deny',
          message:
            "Limboo's own database, settings, and stored secrets are off limits — use the memory tools instead.",
        };
      }

      // Sensitive-file guard (both providers): secrets like `.env`, SSH private
      // keys, and key/cert material are gated behind an explicit human approval
      // rather than hard-blocked. This sits before the standing auto-approvals so
      // `autoApproveReads` / `acceptEdits` can never silently allow a secret —
      // sensitive access always asks (unless "always allow this session" was
      // chosen). Mirrors the declarative `ask` rules in cursor/permissions.ts.
      if (touchesSensitiveFile(toolName, input)) {
        // Only a remembered choice made on a SECRET-file prompt satisfies this.
        // An "always allow" on an ordinary read or edit must never unlock
        // `.env` files or private keys — including for a subagent, whose calls
        // re-enter this same gate.
        if (this.remembered.has(rememberKey(sessionId, 'sensitive'))) {
          return { behavior: 'allow', updatedInput: input };
        }
        const risk = classifyTool(toolName);
        const request: PermissionRequest = {
          id: newId(),
          sessionId,
          tool: toolName,
          risk,
          summary: `${summarizeTool(toolName, input, risk)} — secret file`,
          detail: permissionDetail(toolName, input),
          createdAt: Date.now(),
        };
        if (gate) gate.prompted = true;
        return this.promptForApproval(sessionId, input, request, signal, 'sensitive');
      }

      // Limboo's own internal tools. Most are strictly read-only and are always
      // allowed (even during a plan run) so retrieval never prompts.
      //
      // This is an ALLOW-LIST keyed by the bare tool name, NOT a prefix match
      // with exceptions. The `limboo_search` server also carries the two GitHub
      // comment tools, which WRITE — publicly, under the user's own account —
      // and a deny-list would mean the next tool anyone adds to that server
      // ships silently pre-approved. Falling through to the normal gate is the
      // correct default for anything unrecognised.
      if (
        toolName.startsWith('mcp__limboo_memory__') ||
        toolName.startsWith('mcp__limboo_search__')
      ) {
        if (AUTO_ALLOWED_INTERNAL_TOOLS.has(bareMcpToolName(toolName))) {
          return { behavior: 'allow', updatedInput: input };
        }
        // Not on the list — keep going and let the gate below prompt.
      }

      const mode = this.settings.getAll().agent;

      // Web tool parity: Claude enforces the webSearch toggle via
      // `disallowedTools`; the Cursor hook path has no equivalent, so gate here
      // for both providers.
      if (!mode.webSearch && (toolName === 'WebSearch' || toolName === 'WebFetch')) {
        return { behavior: 'deny', message: 'Web access is disabled in Settings › Agent.' };
      }

      const risk = classifyTool(toolName);
      // Risk relaxation (never escalation): a Bash invocation that is provably
      // read-only (`git log`, `gh pr list`, …) and the passive shell tools
      // (polling/stopping the agent's own shells) act as reads for gating, so
      // plan/ask runs can inspect git history and autoApproveReads covers them.
      // The renderer's PermissionRequest keeps the raw risk (chip honesty).
      const readOnlyShell =
        risk === 'command' &&
        (toolName === 'BashOutput' ||
          toolName === 'KillBash' ||
          toolName === 'KillShell' ||
          (toolName === 'Bash' && isReadOnlyShellCommand(input.command, { cwd })));
      // An adapter tool with no name mapping classifies as command-risk because
      // `classifyTool` cannot recognise it — which hard-denies it in plan/ask.
      // When the raw name reads as an inspection tool (`grep_search`,
      // `file_search`, …) the caller says so and it gates as a read. This only
      // ever RELAXES, and only for a name the provider itself supplied; the
      // crown-jewel and workspace guards below are unaffected.
      const readShaped = risk === 'command' && hints?.readShaped === true;
      const effectiveRisk: ToolRisk = readOnlyShell || readShaped ? 'read' : risk;

      // An external MCP tool the user declared reachable in the read-only modes
      // (per-server `planAccess`, optionally backed by the server's own
      // `readOnlyHint`). Every `mcp__*` name classifies as 'command' because
      // classifyTool has no way to know better, which otherwise makes plan/ask
      // unusable with any third-party MCP server.
      //
      // Deliberately NOT folded into `effectiveRisk` like `readOnlyShell` is.
      // That relaxation rests on an allowlist WE authored; this one rests on a
      // claim the server makes about itself, and `effectiveRisk` feeds the
      // `autoApproveReads` branch further down — so folding it in would make a
      // plan-mode setting silently stop these tools prompting in DEFAULT mode
      // too. Keeping it separate means a qualifying tool merely stops being
      // hard-denied here and falls through to the normal path: auto-allowed if
      // its server is trusted, otherwise PROMPTED, with the chip still honestly
      // reading 'command'.
      const mcpScope = this.mcpScopeFor(sessionId);
      const mcpVerdict: McpPlanVerdict | null =
        risk === 'command' && toolName.startsWith('mcp__')
          ? (this.mcp?.planVerdictFor(toolName, sessionId, mcpScope) ?? {
              ok: false,
              reason: 'mcp-disabled',
            })
          : null;
      const planReadableMcp = mcpVerdict?.ok === true;

      // Built-in provider tools the read-only modes may still run — chiefly the
      // subagent tool, which Claude Code's own Plan Mode permits. Same shape and
      // same reason as the MCP relaxation above, and equally kept out of
      // `effectiveRisk`. See PLAN_SAFE_BUILTINS.
      const planSafeBuiltin = risk === 'command' && isPlanSafeBuiltin(toolName, input);

      // An MCP RESOURCE read names its server (these tools take `{server, uri}`),
      // so it is gated on that server's own plan access rather than
      // blanket-allowed — otherwise it would reach straight past a
      // `planAccess: 'block'` server. Resources are read-only by MCP definition,
      // so no per-item hint is consulted.
      const planReadableResource =
        RESOURCE_READ_TOOLS.has(toolName) &&
        typeof input.server === 'string' &&
        (this.mcp?.resourceReadableIn(input.server, sessionId, mcpScope) ?? false);

      const planPermitted = planReadableMcp || planSafeBuiltin || planReadableResource;

      // A KNOWN, enabled, in-scope MCP server whose only fault is that it never
      // declared this tool read-only. `readOnlyHint` is optional in the MCP spec
      // and most servers ship none, so the 'annotated' default otherwise allows
      // nothing — and the denial pointed at a setting buried two clicks inside a
      // per-server edit form, which is not a remedy the user can act on mid-run.
      //
      // So ASK instead of refusing. This is not an allow: the call falls through
      // to the same interactive prompt a 'command'-risk tool gets in default
      // mode, behind the same workspace/app-data/secret guards below. The user
      // makes the read-only judgement the server declined to make, in the one
      // place they are already looking.
      //
      // Deliberately narrow: 'blocked' means the user already said no, and
      // 'mcp-disabled' / 'unknown-server' / 'out-of-scope' are not questions a
      // prompt can settle. Those stay hard denials.
      const planPromptableMcpServer =
        mcpVerdict?.ok === false && mcpVerdict.reason === 'not-annotated'
          ? (mcpVerdictServer(mcpVerdict) ?? 'MCP')
          : null;

      // Read-only contract (defense in depth): plan runs propose before touching
      // the repo, ask runs never touch it at all. The SDK/provider already leans
      // read-only in these modes, but we also refuse any write/mutating command
      // here so a misbehaving tool can never slip through. Kept AHEAD of the
      // auto/remembered auto-approvals below — nothing bypasses this gate.
      const planBlocked =
        (permMode === 'plan' || permMode === 'ask') &&
        effectiveRisk !== 'read' &&
        !planPermitted &&
        !planPromptableMcpServer;
      if (planBlocked) {
        const label = permMode === 'plan' ? 'planning' : 'ask mode';
        this.pushActivity(sessionId, 'permission', `Blocked ${toolName} during ${label}`, undefined, 'warning');
        const base =
          permMode === 'plan'
            ? 'Planning is read-only — approve the plan to make changes.'
            : 'Ask mode is read-only — switch to another mode to make changes.';
        // Name the actual cause. This used to blame the `planAccess` setting
        // unconditionally, which is wrong (and sends the user to an already-
        // correct field) when the server is unknown, out of scope, or untrusted.
        return {
          behavior: 'deny',
          message: mcpVerdict ? `${base} ${mcpDenyReason(mcpVerdict, toolName)}` : base,
        };
      }

      // Path guard: confine every filesystem tool to the workspace root.
      const target = filePathOf(input);
      if (target && !isInside(cwd, target)) {
        this.pushActivity(
          sessionId,
          'permission',
          `Blocked ${toolName} outside workspace`,
          shortPath(target),
          'danger',
        );
        return { behavior: 'deny', message: `Path is outside the workspace: ${target}` };
      }

      // acceptEdits: file edits are pre-approved. Claude gets this from the SDK's
      // own permissionMode; the Cursor hook path lands here, so mirror it.
      if (permMode === 'acceptEdits' && risk === 'write') {
        return { behavior: 'allow', updatedInput: input };
      }

      // The un-annotated MCP tool from the gate above: ASK, and ask every time.
      //
      // This deliberately jumps the queue ahead of trust, `permissionMode:
      // 'auto'`, `autoApproveReads` and the remembered-choice cache. Each of
      // those is a standing "stop asking me" that the user set for ordinary
      // runs; none of them is a statement that a tool nobody has vouched for is
      // safe to run inside a read-only mode. Plan and Ask stay read-only by
      // default, and the only way past is an explicit decision about THIS call.
      // A server that should not need asking has a setting for that — Plan &
      // Ask access › Whole server — which is a deliberate act, out of band.
      if ((permMode === 'plan' || permMode === 'ask') && planPromptableMcpServer) {
        const label = permMode === 'plan' ? 'planning' : 'ask mode';
        const request: PermissionRequest = {
          id: newId(),
          sessionId,
          tool: toolName,
          risk,
          summary: `${summarizeTool(toolName, input, risk)} — during ${label}`,
          detail:
            `${permissionDetail(toolName, input)}\n\n` +
            `${permMode === 'plan' ? 'Planning' : 'Ask'} is a read-only mode, and the ` +
            `"${planPromptableMcpServer}" server has not declared this tool read-only, so Limboo ` +
            `cannot confirm it only reads. Allow it if you know it is safe here. To stop being ` +
            `asked, set this server's Plan & Ask access under Settings › MCP.`,
          createdAt: Date.now(),
        };
        if (gate) gate.prompted = true;
        return this.promptForApproval(sessionId, input, request, signal);
      }

      // User-configured MCP servers marked "trusted" auto-approve — the single
      // permission authority both providers share for external tools. Placed
      // AFTER the plan/ask read-only gate and the path guard, so trust ALONE
      // never reopens a plan run: a tool only reaches here during plan/ask if
      // the server's separate `planAccess` setting already declared it
      // read-only (the un-annotated case returned above, prompting). Trust then
      // decides prompt-vs-silent, not allowed-vs-denied. Untrusted MCP tools
      // fall through to the prompt below like any other 'command'-risk tool.
      if (this.mcp && toolName.startsWith('mcp__')) {
        for (const prefix of this.mcp.trustedToolMatchers(sessionId, mcpScope)) {
          if (toolName.startsWith(prefix)) return { behavior: 'allow', updatedInput: input };
        }
      }

      // A subagent spawned while planning performs no I/O itself, and every tool
      // it goes on to call re-enters THIS gate with THIS `permMode` — so
      // approving the spawn grants no reachable capability, and prompting per
      // spawn would make a fan-out plan unusable. Scoped to plan/ask on purpose:
      // in default / acceptEdits these tools keep prompting exactly as before.
      // Placed after the path guard so nothing skips it.
      if ((permMode === 'plan' || permMode === 'ask') && (planSafeBuiltin || planReadableResource)) {
        return { behavior: 'allow', updatedInput: input };
      }

      const autoRead =
        effectiveRisk === 'read' && mode.autoApproveReads && mode.permissionMode !== 'approve-all';
      if (mode.permissionMode === 'auto' || autoRead) {
        return { behavior: 'allow', updatedInput: input };
      }
      // A remembered choice satisfies only its own risk class: "always allow"
      // on a read never pre-approves a write or a shell command.
      if (this.remembered.has(rememberKey(sessionId, effectiveRisk))) {
        return { behavior: 'allow', updatedInput: input };
      }

      // Interactive approval — bridge to the renderer and await its decision.
      const request: PermissionRequest = {
        id: newId(),
        sessionId,
        tool: toolName,
        risk,
        summary: summarizeTool(toolName, input, risk),
        detail: permissionDetail(toolName, input),
        createdAt: Date.now(),
      };
      if (gate) gate.prompted = true;
      // Store the grant under the SAME class the check above reads, so a
      // remembered choice can neither over- nor under-apply.
      return this.promptForApproval(sessionId, input, request, signal, effectiveRisk);
  }

  /**
   * Broadcast a permission request to the renderer and await the user's decision,
   * resolving to the tool's `PermissionResult`. Shared by the normal permission
   * fallback and the sensitive-file guard. Honors the run's AbortController so a
   * stopped run resolves as a deny+interrupt instead of hanging on a pending
   * prompt. Works for both providers (Claude's canUseTool and the Cursor hook
   * bridge both await this Promise).
   */
  private promptForApproval(
    sessionId: string,
    input: Record<string, unknown>,
    request: PermissionRequest,
    signal: AbortSignal,
    /** What "always allow this session" widens here. Defaults to the tool's risk. */
    scope: RememberScope = request.risk,
  ): Promise<PermissionResult> {
    // Every prompt funnels through here, so this is the one place that can tag a
    // request with the worker that raised it without each construction site
    // having to remember to. Undefined when the delegation is ambiguous — see
    // subagentOwningPrompt.
    if (!isSubagentTool(request.tool)) {
      const owner = this.subagentOwningPrompt(sessionId, request.tool);
      if (owner) {
        request.parentCallId = owner.id;
        request.subagentType = owner.subagent?.type;
      }
    }
    this.pushActivity(sessionId, 'permission', `Asked to ${request.summary}`, undefined, 'warning');
    this.diag('tool', 'warning', `Approval requested: ${request.summary}`, request.detail, sessionId);
    this.emitHook(sessionId, 'permission-request', {
      tool: request.tool,
      summary: request.summary,
      detail: request.detail,
      severity: 'warning',
    });
    this.setLifecycle('awaiting-permission');
    this.setRequest(sessionId, { phase: 'awaiting-permission' });
    this.broadcastChannel(IpcEvents.agentPermissionRequest, request);

    return new Promise<PermissionResult>((resolve) => {
      const onAbort = () => {
        this.pending.delete(request.id);
        resolve({ behavior: 'deny', message: 'Run stopped.', interrupt: true });
      };
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
      this.pending.set(request.id, {
        sessionId,
        input,
        request,
        scope,
        resolve: (r) => {
          signal.removeEventListener('abort', onAbort);
          resolve(r);
        },
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Persistence helpers                                              */
  /* ---------------------------------------------------------------- */

  private runtime(sessionId: string): SessionRuntime {
    let rt = this.runtimes.get(sessionId);
    if (!rt) {
      rt = { changes: new Map(), tasks: [], toolCalls: [] };
      this.runtimes.set(sessionId, rt);
    }
    return rt;
  }

  private persistMessage(m: ChatMessage): void {
    getDb()
      .prepare(
        'INSERT OR REPLACE INTO agent_messages (id, session_id, role, text, created_at, display) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        m.id,
        m.sessionId,
        m.role,
        m.text,
        m.createdAt,
        // NULL for every ordinary prompt; the raw text stays authoritative.
        m.display ? JSON.stringify(m.display) : null,
      );
  }

  private loadMessages(sessionId: string): ChatMessage[] {
    const rows = getDb()
      .prepare(
        'SELECT id, session_id, role, text, created_at, display FROM agent_messages WHERE session_id = ? ORDER BY created_at ASC',
      )
      .all(sessionId) as Array<{
      id: string;
      session_id: string;
      role: string;
      text: string;
      created_at: number;
      display: string | null;
    }>;
    // Rehydrate the attachment chips of sent turns (message_id links the rows).
    const byMessage = new Map<string, ChatMessage['attachments']>();
    if (this.attachments) {
      for (const meta of this.attachments.list(sessionId)) {
        if (!meta.messageId) continue;
        const bucket = byMessage.get(meta.messageId) ?? [];
        bucket.push(meta);
        byMessage.set(meta.messageId, bucket);
      }
    }
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      role: r.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      text: r.text,
      streaming: false,
      createdAt: r.created_at,
      attachments: byMessage.get(r.id),
      ...(parseDisplay(r.display) ? { display: parseDisplay(r.display) } : {}),
    }));
  }

  private loadActivity(sessionId: string): AgentActivityItem[] {
    const rows = getDb()
      .prepare(
        'SELECT payload FROM agent_activity WHERE session_id = ? ORDER BY created_at ASC',
      )
      .all(sessionId) as Array<{ payload: string }>;
    const out: AgentActivityItem[] = [];
    for (const r of rows) {
      try {
        out.push(JSON.parse(r.payload) as AgentActivityItem);
      } catch {
        /* skip corrupt row */
      }
    }
    return out;
  }

  private activity(
    sessionId: string,
    type: AgentActivityItem['type'],
    label: string,
    detail?: string,
    tone?: AgentActivityItem['tone'],
  ): AgentActivityItem {
    return { id: newId(), sessionId, type, label, detail, tone, at: Date.now() };
  }

  private pushActivity(
    sessionId: string,
    type: AgentActivityItem['type'],
    label: string,
    detail?: string,
    tone?: AgentActivityItem['tone'],
    git?: GitActivityPayload,
  ): void {
    const item = this.activity(sessionId, type, label, detail, tone);
    if (git) item.git = git;
    getDb()
      .prepare(
        'INSERT INTO agent_activity (id, session_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(item.id, sessionId, type, JSON.stringify(item), item.at);
    this.pushEvent({ kind: 'activity', sessionId, item });
  }

  /**
   * Public timeline recorder for platform services without their own activity
   * feed (e.g. the Resume Pipeline logging a revalidation result). Delegates to
   * the same `pushActivity` path so the entry lands in `agent_activity` and,
   * therefore, in the session timeline automatically.
   */
  recordStatus(sessionId: string, label: string, detail?: string): void {
    this.pushActivity(
      sessionId,
      'status',
      label.slice(0, ACTIVITY_LIMITS.labelMax),
      detail?.slice(0, ACTIVITY_LIMITS.detailMax),
      'info',
    );
  }

  /**
   * Record a git operation as a structured conversation-stream entry.
   *
   * The label/detail are composed HERE, in main — the renderer never authors
   * audit prose. The payload rides inside the existing `agent_activity.payload`
   * JSON, so this needs no schema migration and inherits persistence, session
   * fork, and rewind for free.
   *
   * Every failure is swallowed: observability must never break a git operation.
   */
  recordGitActivity(sessionId: string, payload: GitActivityPayload): void {
    try {
      const git = clampGitPayload(payload);
      this.pushActivity(
        sessionId,
        'git',
        gitActivityLabel(git),
        gitActivityDetail(git),
        git.ok ? 'success' : 'danger',
        git,
      );
    } catch (err) {
      logger.warn('git activity record failed', err);
    }
  }

  /**
   * Resolve the effective OS-level sandbox policy for a run. Shared by both
   * providers (Claude via {@link mapClaudeSandbox}, Cursor via
   * {@link withSessionSandboxJson}) so the two containment layers never drift —
   * the writable root, userData/secrets denials, and network policy are decided
   * exactly once, here.
   */
  private resolveSandboxFor(
    sessionId: string,
    cwd: string,
    provider: AgentProvider,
    agent: ReturnType<SettingsManager['getAll']>['agent'],
  ): EffectiveSandbox {
    return resolveSandboxConfig(agent.sandbox, {
      cwd,
      provider,
      attachmentsDir: this.attachmentsDirFor(sessionId) ?? undefined,
    });
  }

  /**
   * Stream the sandbox lifecycle into the session timeline as ordinary status
   * markers (same typography/animation as every other streamed status event —
   * never a modal). Also records the sandbox metadata as an audit row so the
   * timeline carries mode / writable root / network policy for the run.
   */
  private recordSandboxStatus(sessionId: string, eff: EffectiveSandbox): void {
    if (!eff.enabled) return;
    const netLabel =
      eff.network.policy === 'all'
        ? 'network open'
        : eff.network.policy === 'off'
          ? 'network blocked'
          : `network allowlist (${eff.network.allowedDomains.length})`;
    // The full sandbox-init sequence, streamed as ordinary status markers (same
    // typography/animation as any other status event — never a modal). The
    // first line's detail doubles as the per-run sandbox audit summary (mode,
    // writable root, network policy, strict); run exit/duration land via the
    // existing run-finished activity row.
    this.recordStatus(
      sessionId,
      'Preparing isolated execution environment…',
      `mode=${eff.mode} · writable=${eff.writeRoots[0]} · ${netLabel}` +
        (eff.excludedCommands.length ? ` · ${eff.excludedCommands.length} excluded` : '') +
        (eff.failIfUnavailable ? ' · strict' : ''),
    );
    this.recordStatus(sessionId, 'Workspace boundary established.');
    this.recordStatus(sessionId, 'Filesystem restrictions applied.');
    this.recordStatus(sessionId, 'Network policy loaded.', netLabel);
    this.recordStatus(sessionId, 'Running command inside sandbox.');
  }

  private rememberProviderSession(
    sessionId: string,
    provider: AgentProvider,
    providerSessionId: string,
  ): void {
    getDb()
      .prepare(
        'INSERT OR REPLACE INTO agent_provider_sessions (session_id, provider, provider_session_id, updated_at) VALUES (?, ?, ?, ?)',
      )
      .run(sessionId, provider, providerSessionId, Date.now());
  }

  /**
   * Drop the stored provider session id so the next run starts a fresh
   * conversation instead of resuming. Used when the resumed transcript is
   * corrupted (e.g. it ends in a tool_use with no tool_result after a mid-tool
   * kill) — resuming it would fail identically on every turn.
   */
  private forgetProviderSession(sessionId: string, provider: AgentProvider): void {
    getDb()
      .prepare('DELETE FROM agent_provider_sessions WHERE session_id = ? AND provider = ?')
      .run(sessionId, provider);
  }

  /**
   * The stored provider resume token for a session, for display. Read-only and
   * best-effort: this feeds the Runtime Inspector's execution section, which
   * must never be able to fail a run.
   */
  providerSessionIdFor(sessionId: string, provider: AgentProvider): string | undefined {
    try {
      const row = getDb()
        .prepare(
          'SELECT provider_session_id FROM agent_provider_sessions WHERE session_id = ? AND provider = ?',
        )
        .get(sessionId, provider) as { provider_session_id?: string } | undefined;
      return row?.provider_session_id;
    } catch {
      return undefined;
    }
  }

  /* ---------------------------------------------------------------- */
  /* State + broadcast                                                */
  /* ---------------------------------------------------------------- */

  private setState(patch: Partial<AgentState>): void {
    this.state = { ...this.state, ...patch };
    this.broadcastChannel(IpcEvents.agentStateChanged, this.state);
  }

  private setLifecycle(lifecycle: AgentLifecycleStatus, patch: Partial<AgentState> = {}): void {
    this.setState({ lifecycle, ...patch });
  }

  /**
   * Patch ONE session's run phase. Kept per-session (see {@link requests}) so
   * two concurrent runs can never clobber each other's phase — the bug that
   * made an `awaiting-permission` pause on one session vanish whenever another
   * session started or finished a run in the meantime.
   */
  private setRequest(sessionId: string, patch: Partial<RequestState>): void {
    const current = this.requests.get(sessionId) ?? { ...IDLE_REQUEST, sessionId };
    const request = { ...current, ...patch, sessionId };
    this.requests.set(sessionId, request);
    // Also mirror onto the legacy single-session field for any remaining
    // back-compat reader — multi-session-aware UI must read `requestsBySession`.
    this.setState({ request });
    this.pushEvent({ kind: 'request-state', sessionId, request });
  }

  private completeRequest(sessionId: string, outcome: RequestOutcome, detail?: string): void {
    this.setRequest(sessionId, { phase: 'done', outcome, detail, attempt: 0 });
  }

  /** True when the capability itself is degraded (not just the last request). */
  private isCapabilityDegraded(): boolean {
    return (
      this.state.lifecycle === 'reconnecting' ||
      this.state.lifecycle === 'rate-limited' ||
      this.state.lifecycle === 'auth-required' ||
      this.state.lifecycle === 'offline' ||
      this.state.lifecycle === 'failed' ||
      this.state.lifecycle === 'not-installed'
    );
  }

  /* ---------------------------------------------------------------- */
  /* Diagnostics console                                              */
  /* ---------------------------------------------------------------- */

  private diag(
    category: DiagnosticCategory,
    severity: DiagnosticSeverity,
    label: string,
    detail?: string,
    sessionId: string | null = null,
  ): void {
    // Honor the verbosity preference: drop debug lines unless verbose.
    const verbosity = this.settings.getAll().agent.logVerbosity;
    if (severity === 'debug' && verbosity !== 'verbose') return;
    const d: AgentDiagnostic = {
      id: newId(),
      sessionId: sessionId || null,
      severity,
      category,
      label,
      detail: detail ? redact(detail).slice(0, 2_000) : undefined,
      at: Date.now(),
    };
    if (this.settings.getAll().agent.connection.sessionPersistence) this.persistDiagnostic(d);
    this.pushEvent({ kind: 'diagnostic', diagnostic: d });
  }

  private persistDiagnostic(d: AgentDiagnostic): void {
    try {
      getDb()
        .prepare(
          'INSERT INTO agent_diagnostics (id, session_id, severity, category, label, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(d.id, d.sessionId, d.severity, d.category, d.label, d.detail ?? null, d.at);
    } catch {
      /* diagnostics are best-effort — never block a run on a write failure */
    }
  }

  /** Bound the diagnostics table: keep ~14 days of history. */
  private sweepDiagnostics(): void {
    try {
      const cutoff = Date.now() - 14 * 24 * 60 * 60_000;
      getDb().prepare('DELETE FROM agent_diagnostics WHERE created_at < ?').run(cutoff);
    } catch {
      /* best-effort */
    }
  }

  /* ---------------------------------------------------------------- */
  /* Heartbeat supervision                                            */
  /* ---------------------------------------------------------------- */

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const interval = this.settings.getAll().agent.connection.heartbeatInterval;
    if (interval <= 0) return;
    this.heartbeatTimer = setInterval(() => void this.heartbeat(), interval);
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private markHeartbeatOk(): void {
    this.setState({ heartbeat: { lastOkAt: Date.now(), consecutiveFailures: 0 } });
  }

  /**
   * Lightweight liveness re-verification. There is no persistent child process
   * between prompts, so this re-probes install/auth presence and confirms the
   * SDK is loadable — never an expensive model call.
   */
  private async heartbeat(): Promise<void> {
    // An active run is itself the liveness signal; rate-limit/auth states clear
    // on their own paths, so don't fight them.
    if (this.runs.size > 0) return;
    if (this.state.lifecycle === 'rate-limited' || this.state.lifecycle === 'auth-required') return;

    const cfg = this.settings.getAll().agent.connection;
    try {
      const install = this.probeHealth(true);
      if (!install.installed) throw new Error('Claude Code authentication is no longer available.');
      // Probe the module the NEXT run will actually load. Checking the direct
      // SDK while runs go through the harness would report a healthy capability
      // whose real execution path is broken.
      const agentCfg = this.settings.getAll().agent;
      if (
        providerForModel(agentCfg.model) === 'anthropic' &&
        !agentCfg.harness.legacyClaudeSdk
      ) {
        await loadHarness(agentCfg.harness.id);
      } else {
        await loadSdk();
      }
      this.markHeartbeatOk();
      if (this.state.lifecycle === 'reconnecting' || this.state.lifecycle === 'offline') {
        this.setLifecycle('ready', { error: undefined });
        this.diag('heartbeat', 'info', 'Capability recovered');
      }
    } catch (err) {
      const failures = this.state.heartbeat.consecutiveFailures + 1;
      this.setState({ heartbeat: { lastOkAt: this.state.heartbeat.lastOkAt, consecutiveFailures: failures } });
      this.diag('heartbeat', 'warning', `Heartbeat failed (${failures})`, redact(String(err)));
      if (failures >= cfg.heartbeatFailureThreshold && this.state.lifecycle === 'ready') {
        this.setLifecycle('reconnecting');
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Rate-limit handling                                              */
  /* ---------------------------------------------------------------- */

  private enterRateLimited(info: RateLimitInfo, sessionId: string): void {
    this.setLifecycle('rate-limited', { rateLimit: info, activeSessionId: null });
    this.diag('rate-limit', 'warning', 'Rate / session limit hit', info.message);
    this.pushActivity(sessionId, 'status', 'Rate limited', info.message.slice(0, ACTIVITY_LIMITS.detailMax), 'warning');
    this.clearRateLimitTimer();
    if (info.resetsAt) {
      const ms = Math.max(0, info.resetsAt - Date.now());
      this.rateLimitTimer = setTimeout(() => this.clearRateLimit('reset time elapsed'), ms + 1_000);
      if (this.rateLimitTimer.unref) this.rateLimitTimer.unref();
    }
    if (this.settings.getAll().agent.connection.connectivityNotifications) {
      this.notifications.notify({ title: 'Agent rate limited', body: info.message });
    }
  }

  /** Clear the rate-limit state (timer elapsed, or a later request succeeded). */
  private clearRateLimit(reason: string): void {
    if (this.state.lifecycle !== 'rate-limited') return;
    this.clearRateLimitTimer();
    this.setLifecycle('ready', { rateLimit: undefined });
    this.diag('rate-limit', 'info', 'Rate limit cleared', reason);
  }

  /** Renderer-triggered manual clear ("try again now"). */
  clearRateLimitManual(): void {
    this.clearRateLimit('cleared by the user');
  }

  private clearRateLimitTimer(): void {
    if (this.rateLimitTimer) {
      clearTimeout(this.rateLimitTimer);
      this.rateLimitTimer = null;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Idle + recovery utilities                                        */
  /* ---------------------------------------------------------------- */

  private armIdleTimer(cfg: ReturnType<SettingsManager['getAll']>['agent']['connection']): void {
    this.clearIdleTimer();
    if (cfg.idleTimeout <= 0) return;
    this.idleTimer = setTimeout(() => {
      if (this.runs.size > 0) return;
      this.diag('lifecycle', 'debug', 'Idle');
      if (cfg.autoRestart && this.state.lifecycle === 'ready') this.probeHealth(true);
    }, cfg.idleTimeout);
    if (this.idleTimer.unref) this.idleTimer.unref();
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /** Resolve true after `ms`, or false if aborted first. */
  private abortableDelay(ms: number, abort: AbortController): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        abort.signal.removeEventListener('abort', onAbort);
        resolve(true);
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        resolve(false);
      };
      if (abort.signal.aborted) return onAbort();
      abort.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /**
   * In-process subscribers to the same structured event stream the renderer
   * receives (e.g. the VoiceManager's sentence segmenter). Listener failures
   * are swallowed — a consumer must never be able to break a run.
   */
  private readonly eventListeners = new Set<(event: AgentEvent) => void>();

  /** Subscribe to the agent event stream. Returns an unsubscribe function. */
  onEvent(listener: (event: AgentEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private pushEvent(event: AgentEvent): void {
    this.broadcastChannel(IpcEvents.agentEvent, event);
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        logger.warn('agent event listener failed', err);
      }
    }
  }

  private broadcastChannel(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Runtime Telemetry                                                 */
  /* ---------------------------------------------------------------- */

  /** Inject the Runtime Telemetry sink (see {@link telemetrySink}). */
  setTelemetrySink(sink: RuntimeSink): void {
    this.telemetrySink = sink;
  }

  /**
   * Forward one telemetry signal. Swallows everything: observability must never
   * be able to break a run. The failure is not lost — the telemetry manager
   * counts it and surfaces it as snapshot health, so a stream that stopped
   * recording never looks like a quiet session.
   */
  private emitTelemetry(signal: ProviderTelemetrySignal): void {
    if (!this.telemetrySink) return;
    try {
      this.telemetrySink(signal);
    } catch (err) {
      logger.warn('telemetry sink failed', err);
    }
  }

  /** Forward several signals (the stream-event translator returns a list). */
  private emitTelemetryAll(signals: ProviderTelemetrySignal[]): void {
    for (const signal of signals) this.emitTelemetry(signal);
  }

  /**
   * Open a telemetry run, carrying the measured character lengths of the blocks
   * Limboo composed for this prompt. Shared by both provider paths so the
   * accumulator never learns which adapter is running.
   */
  private emitRunStart(
    sessionId: string,
    model: string,
    mode: SessionPermissionMode,
    chars: {
      memory: number;
      search: number;
      resume: number;
      /** The attachment manifest as actually composed — measured, not estimated. */
      attachments: number;
      prompt: number;
    },
  ): void {
    if (!this.telemetrySink) return;
    // Measured by the producers themselves. Reading `maxInjected` here would
    // report the configured CEILING as though it were the count.
    const retrieved = this.retrievalCounts.get(sessionId) ?? { memory: 0, search: 0 };

    this.emitTelemetry({
      kind: 'run-start',
      sessionId,
      runId: `${sessionId}:${Date.now()}`,
      provider: providerForModel(model),
      model,
      mode,
      injected: {
        memory: chars.memory,
        search: chars.search,
        resume: chars.resume,
        attachments: chars.attachments,
        prompt: chars.prompt,
        memoryHits: retrieved.memory,
        searchHits: retrieved.search,
        memoryBudget: MEMORY_LIMITS.injectCharBudget,
        searchBudget: SEARCH_LIMITS.injectCharBudget,
      },
    });
    this.telemetryChars?.(sessionId, 'conversation', chars.prompt);
  }

  /**
   * Character tallies Limboo measured of content it OBSERVED rather than
   * composed — tool results, split by MCP vs built-in. These feed the
   * per-contributor context split, which has no other honest source: the API
   * reports one aggregate input-token count and no breakdown at all.
   */
  private observeResultChars(sessionId: string, toolName: string, text: string): void {
    if (!this.telemetryChars || !text) return;
    this.telemetryChars(sessionId, toolName.startsWith('mcp__') ? 'mcp' : 'tools', text.length);
  }

  private telemetryChars:
    | ((sessionId: string, kind: 'conversation' | 'tools' | 'mcp', chars: number) => void)
    | null = null;

  /** Inject the observed-character tally sink (see {@link observeResultChars}). */
  setTelemetryCharSink(
    sink: (sessionId: string, kind: 'conversation' | 'tools' | 'mcp', chars: number) => void,
  ): void {
    this.telemetryChars = sink;
  }
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

/** Render the main-side git context into the sub-agent's user prompt. */
function buildCommitPrompt(ctx: GitCommitContext): string {
  const parts: string[] = [];
  if (ctx.branch) parts.push(`Branch: ${ctx.branch}`);

  const fileLines = ctx.files.map((f) => {
    const counts =
      f.binary
        ? ' (binary)'
        : typeof f.adds === 'number' || typeof f.dels === 'number'
          ? ` (+${f.adds ?? 0} -${f.dels ?? 0})`
          : '';
    return `- ${f.status}: ${f.path}${counts}`;
  });
  parts.push(`Staged files (${ctx.files.length}):\n${fileLines.join('\n')}`);

  if (ctx.recentSubjects.length > 0) {
    parts.push(`Recent commit subjects (newest first):\n${ctx.recentSubjects.map((s) => `- ${s}`).join('\n')}`);
  } else {
    parts.push("This is the repository's first commit.");
  }

  if (ctx.diff.trim().length > 0) {
    parts.push(
      `Staged diff${ctx.diffTruncated ? ' (truncated)' : ''}:\n\`\`\`diff\n${ctx.diff}\n\`\`\``,
    );
  }

  parts.push('Write the commit message for these staged changes.');
  return parts.join('\n\n');
}

/** Normalize the model's output into a clean, size-capped commit message. */
function polishCommitMessage(raw: string): string {
  let text = (raw ?? '').trim();
  // Strip a single wrapping code fence the model may have added despite orders.
  const fence = /^```[a-z]*\n([\s\S]*?)\n?```$/i.exec(text);
  if (fence) text = fence[1].trim();
  // Strip one pair of wrapping quotes.
  if (/^"[\s\S]*"$/.test(text) || /^'[\s\S]*'$/.test(text)) text = text.slice(1, -1).trim();
  return text.slice(0, GIT_LIMITS.commitGen.messageMax);
}

function mapThinking(thinking: 'off' | 'on' | 'adaptive'): Options['thinking'] {
  if (thinking === 'off') return { type: 'disabled' };
  if (thinking === 'on') return { type: 'enabled', budgetTokens: 10_000 };
  return { type: 'adaptive' };
}

/** Coerce a TodoWrite status string into our TaskStatus union. */
function normalizeTaskStatus(value: unknown): TaskStatus {
  if (value === 'completed' || value === 'in_progress') return value;
  return 'pending';
}

/**
 * Pick a short plan title: the first markdown heading, else the first non-empty
 * line, else a prior title / prompt, else a sensible default.
 */
function deriveTitle(markdown: string, fallback?: string): string {
  const lines = markdown.split('\n').map((l) => l.trim());
  const heading = lines.find((l) => /^#{1,3}\s+/.test(l));
  if (heading) return truncate(heading.replace(/^#{1,3}\s+/, ''), 80);
  const firstLine = lines.find((l) => l.length > 0);
  if (firstLine) return truncate(firstLine.replace(/^[-*]\s+/, ''), 80);
  if (fallback && fallback.trim().length > 0) return truncate(fallback.trim(), 80);
  return 'Implementation plan';
}

/** Best-effort count of distinct file-ish paths referenced in a plan. */
function countAffectedFiles(markdown: string): number | undefined {
  const matches = markdown.match(/[\w./-]+\.[a-zA-Z]{1,5}\b/g);
  if (!matches) return undefined;
  const files = new Set(matches.filter((m) => m.includes('/') || m.includes('.')));
  return files.size > 0 ? files.size : undefined;
}

/** Coarse risk estimate from the number of checklist tasks. */
function estimateRisk(taskCount?: number): PlanMeta['risk'] {
  if (!taskCount) return undefined;
  if (taskCount <= 3) return 'low';
  if (taskCount <= 8) return 'medium';
  return 'high';
}

/**
 * Extract plain text from a tool_result block's `content`, which the SDK delivers
 * either as a string or as an array of `{ type: 'text', text }` parts.
 */
function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const part = b as Record<string, unknown>;
        return part.type === 'text' && typeof part.text === 'string' ? part.text : '';
      })
      .join('');
  }
  return '';
}

/** True when `target` resolves to a path inside `root` (symlink-aware). */
function isInside(root: string, target: string): boolean {
  try {
    const realRoot = fs.realpathSync(root);
    const abs = path.isAbsolute(target) ? target : path.resolve(realRoot, target);
    // Resolve symlinks where possible; fall back to the lexical path otherwise.
    let resolved = abs;
    try {
      resolved = fs.realpathSync(abs);
    } catch {
      resolved = path.resolve(abs);
    }
    const rel = path.relative(realRoot, resolved);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  } catch {
    return false;
  }
}

function shortPath(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join('/') || p;
}

/**
 * Limboo's **crown jewels** — the safeStorage `secrets/` store, the SQLite DB (and
 * its WAL/SHM siblings), and the `settings.json` / `window-state.json` config
 * files. These are the only parts of `userData` the agent must never reach: the
 * Local Memory System (the `mcp__limboo_memory__*` tools) is the sole sanctioned
 * read path into the DB, and a direct write to the live store would corrupt the
 * running app.
 *
 * This is deliberately NOT the whole `userData` root. The session worktree
 * (default `{userData}/worktrees/…`) and the attachment staging dir
 * (`{userData}/attachments/…`) legitimately live under it and ARE the agent's
 * working directories — a blanket root deny fought the agent's own cwd and
 * hard-blocked every edit in a default-rooted worktree. Same narrowing, same
 * reason, as the OS sandbox floor: `crownJewelPaths()` in sandbox/policy.ts is
 * the shared source, so Layer 1 and Layer 3 can never drift.
 *
 * Resolved once (lazily, so a non-Electron test context can't crash).
 */
let crownJewels: string[] | undefined;
function protectedPaths(): string[] {
  if (crownJewels === undefined) {
    try {
      const base = crownJewelPaths();
      // The DB's WAL/SHM siblings are the same secret by another name; derive
      // them here rather than widening the Layer 3 sandbox floor's contract.
      const db = base.find((p) => p.endsWith('limboo.db'));
      const named = db ? [...base, `${db}-wal`, `${db}-shm`] : base;
      // Cover the realpath of the userData root too (a symlinked `~/.config`
      // is common), so a resolved target still matches. NOT `isInside` per
      // jewel: that realpaths its root argument and therefore silently fails
      // open for a jewel that does not exist yet — `secrets/` and
      // `window-state.json` are both absent on a fresh install, and those are
      // exactly the ones a first write must not be allowed to create.
      const raw = app.getPath('userData');
      let real = raw;
      try {
        real = fs.realpathSync(raw);
      } catch {
        /* not yet created — the lexical path is the only truth we have */
      }
      const variants = new Set<string>();
      for (const jewel of named) {
        variants.add(path.resolve(jewel));
        if (real !== raw) variants.add(path.resolve(real, path.relative(raw, jewel)));
      }
      crownJewels = [...variants];
    } catch {
      crownJewels = [];
    }
  }
  return crownJewels;
}

/** Resolve a path through symlinks where possible, else lexically. */
function resolveLoosely(target: string): string {
  const abs = path.resolve(target);
  try {
    return fs.realpathSync(abs);
  } catch {
    return abs;
  }
}

/**
 * True when a tool call would touch one of the crown jewels — either a path-bearing
 * tool resolving to (or inside) one, or a `Bash`/command tool whose command string
 * names one by absolute path. The shell check is intentionally absolute-path only:
 * a bare-name match blocked innocent commands like `grep limboo.db src/` that never
 * leave the workspace.
 */
function touchesCrownJewel(toolName: string, input: Record<string, unknown>): boolean {
  const jewels = protectedPaths();
  if (jewels.length === 0) return false;

  const file = filePathOf(input);
  if (file) {
    // Compare both the raw and the symlink-resolved form: the raw catches a
    // not-yet-existing jewel, the resolved catches a symlink aimed at one.
    const abs = path.resolve(file);
    const real = resolveLoosely(file);
    const hit = (t: string) =>
      jewels.some((jewel) => t === jewel || t.startsWith(jewel + path.sep));
    if (hit(abs) || hit(real)) return true;
  }

  if (toolName === 'Bash') {
    const cmd = String(input.command ?? '');
    if (!cmd) return false;
    if (jewels.some((jewel) => cmd.includes(jewel))) return true;
  }
  return false;
}

/**
 * True when a file basename is a secret-bearing file the agent must never touch:
 * `.env` and its runtime variants (but NOT the non-secret templates
 * `.env.example` / `.sample` / `.template` / `.dist`), SSH private keys, key/cert
 * material (`.pem`/`.key`/`.p12`/`.pfx`, but not public `.pub`), and `.netrc`.
 * Basename-only — path/depth is handled by the callers.
 */
const ENV_TEMPLATE_SUFFIX = /^\.env\.(example|sample|template|dist)$/i;
function isSensitiveBasename(base: string): boolean {
  const name = base.toLowerCase();
  if (name === '.env') return true;
  if (name.startsWith('.env.') && !ENV_TEMPLATE_SUFFIX.test(name)) return true;
  if (name === '.netrc') return true;
  if (/^id_(rsa|ed25519|ecdsa|dsa)$/.test(name)) return true;
  if (/\.(pem|key|p12|pfx)$/.test(name)) return true;
  return false;
}

/**
 * Files that live inside `~/.ssh` but are NOT private keys, so touching them
 * should not trigger the secret-file prompt (config, host lists, public keys).
 * Everything else under `~/.ssh` is treated as a private key (they routinely have
 * arbitrary, extension-less names like `id_work`).
 */
function isSshNonSecret(base: string): boolean {
  const name = base.toLowerCase();
  return (
    name === 'config' ||
    name === 'known_hosts' ||
    name === 'known_hosts.old' ||
    name === 'authorized_keys' ||
    name === 'environment' ||
    name.endsWith('.pub')
  );
}

/**
 * True when a tool call would touch project-local secrets — a path-bearing tool
 * resolving to a sensitive basename or anything under the user's `~/.ssh`, or a
 * `Bash`/command tool whose command string references such a file. Mirrors the
 * declarative `ask` rules in cursor/permissions.ts; the caller turns a hit into a
 * human-approval prompt (not a hard block) for BOTH providers — Cursor's
 * absolute-path glob normalization is unreliable, so this app-level guard is the
 * dependable catch (defense in depth, like touchesCrownJewel).
 */
function touchesSensitiveFile(toolName: string, input: Record<string, unknown>): boolean {
  const sshDir = path.join(os.homedir(), '.ssh');

  const file = filePathOf(input);
  if (file) {
    const base = path.basename(file);
    if (isSensitiveBasename(base)) return true;
    // A private key under ~/.ssh (but not config/known_hosts/authorized_keys/*.pub).
    if (isInside(sshDir, file) && !isSshNonSecret(base)) return true;
  }

  if (toolName === 'Bash') {
    const cmd = String(input.command ?? '');
    if (!cmd) return false;
    // Whitespace-delimited token whose basename is sensitive (covers `cat .env`,
    // `cp foo ~/.ssh/id_rsa`, redirections like `> .env.production`).
    for (const tok of cmd.split(/[\s=]+/)) {
      const bare = tok.replace(/^['"]|['"]$/g, '').replace(/^~[\\/]/, '');
      if (!bare) continue;
      if (isSensitiveBasename(path.basename(bare))) return true;
      // A private key referenced under a .ssh directory — `.ssh/config`,
      // `.ssh/known_hosts` and `.ssh/*.pub` are explicitly not secrets.
      const ssh = bare.match(/(?:^|[\\/])\.ssh[\\/]([^\\/]+)$/);
      if (ssh && !isSshNonSecret(ssh[1])) return true;
    }
  }
  return false;
}

/** The Agent tool's `subagent_type`, normalized to a display name. */
function subagentTypeOf(input: Record<string, unknown>): string | undefined {
  const raw = input.subagent_type ?? input.subagentType ?? input.agent_type;
  const t = typeof raw === 'string' ? raw.trim() : '';
  return t ? truncate(t, 60) : undefined;
}

/** The Agent tool's `description` — the one-line task given to the worker. */
function subagentDescriptionOf(input: Record<string, unknown>): string | undefined {
  const raw = input.description ?? input.task;
  const d = typeof raw === 'string' ? raw.trim() : '';
  return d ? truncate(d, 160) : undefined;
}

/**
 * Seed a {@link SubagentInfo} from the Agent tool's input.
 *
 * Only what the parent actually declared: the counters are filled in later from
 * the worker's own child calls. `model` is read opportunistically because Claude
 * may pass a per-invocation model override, but it is left undefined rather than
 * guessed from session settings — a worker's model resolves through the
 * environment, the invocation, its definition, and only then the session, so
 * showing the session's model would frequently be a lie.
 */
function subagentFromInput(input: Record<string, unknown>): SubagentInfo {
  const model = typeof input.model === 'string' ? input.model.trim() : '';
  return {
    type: subagentTypeOf(input),
    description: subagentDescriptionOf(input),
    model: model ? truncate(model, 60) : undefined,
    background: input.run_in_background === true ? true : undefined,
  };
}

function summarizeTool(name: string, input: Record<string, unknown>, risk: ToolRisk): string {
  const file = filePathOf(input);
  if (isSubagentTool(name)) {
    // The worker's identity is the summary. `Run Task` (the old `default:` fall
    // through) told the user nothing, and the description is exactly the
    // distilled statement of intent the parent wrote for the delegation.
    const type = subagentTypeOf(input);
    return type ? `${type} agent` : 'Subagent';
  }
  switch (name) {
    case 'Read':
      return `Read ${file ? shortPath(file) : 'a file'}`;
    case 'Write':
      return `Create ${file ? shortPath(file) : 'a file'}`;
    case 'Edit':
    case 'MultiEdit':
      return `Edit ${file ? shortPath(file) : 'a file'}`;
    case 'Delete':
      return `Delete ${file ? shortPath(file) : 'a file'}`;
    case 'Bash':
      return `Run ${truncate(String(input.command ?? 'a command'), 60)}`;
    case 'Grep':
      return `Search "${truncate(String(input.pattern ?? ''), 40)}"`;
    case 'Glob':
      return `Find ${truncate(String(input.pattern ?? ''), 40)}`;
    case 'WebSearch':
      return `Web search: ${truncate(String(input.query ?? ''), 40)}`;
    case 'WebFetch':
      return `Fetch ${truncate(String(input.url ?? ''), 40)}`;
    default:
      return risk === 'command' ? `Run ${name}` : name;
  }
}

/** The inline "target" shown in chat for a tool — a URL, query, or path. */
function toolTarget(name: string, input: Record<string, unknown>): string | undefined {
  // For a subagent the target is what it was asked to do, so the single inline
  // row reads "Explore agent — find every call site of resolveSessionRoot".
  if (isSubagentTool(name)) return subagentDescriptionOf(input);
  if (name === 'WebSearch') return truncate(String(input.query ?? ''), 120) || undefined;
  if (name === 'WebFetch') return truncate(String(input.url ?? ''), 160) || undefined;
  if (name === 'Bash') return truncate(String(input.command ?? ''), 120) || undefined;
  if (name === 'Grep') return truncate(String(input.pattern ?? ''), 80) || undefined;
  const file = filePathOf(input);
  return file ? shortPath(file) : undefined;
}

function permissionDetail(name: string, input: Record<string, unknown>): string | undefined {
  if (isSubagentTool(name)) {
    // The prompt is the ONLY content that crosses from parent to worker (the
    // worker's context starts fresh), so it is the whole of what approving this
    // delegation authorizes. Show it verbatim, bounded.
    const prompt = typeof input.prompt === 'string' ? input.prompt : '';
    return truncate(prompt, 2_000) || subagentDescriptionOf(input);
  }
  if (name === 'Bash') return String(input.command ?? '');
  if (name === 'Edit') {
    const oldS = String(input.old_string ?? '');
    const newS = String(input.new_string ?? '');
    return `- ${truncate(oldS, 200)}\n+ ${truncate(newS, 200)}`;
  }
  if (name === 'Write') return truncate(String(input.content ?? ''), 400);
  const file = filePathOf(input);
  return file;
}

function changeFromInput(name: string, input: Record<string, unknown>): FileChange | null {
  const file = filePathOf(input);
  if (!file) return null;
  if (name === 'Write') {
    const content = String(input.content ?? '');
    // tool-start fires before the write runs, so a missing target means a create.
    const status: FileChangeStatus = fileMissing(file) ? 'added' : 'modified';
    return { path: file, status, adds: countLines(content), dels: 0 };
  }
  if (name === 'Edit') {
    return {
      path: file,
      status: 'modified',
      adds: countLines(String(input.new_string ?? '')),
      dels: countLines(String(input.old_string ?? '')),
    };
  }
  if (name === 'MultiEdit') {
    const edits = Array.isArray(input.edits) ? (input.edits as Array<Record<string, unknown>>) : [];
    let adds = 0;
    let dels = 0;
    for (const e of edits) {
      adds += countLines(String(e.new_string ?? ''));
      dels += countLines(String(e.old_string ?? ''));
    }
    return { path: file, status: 'modified', adds, dels };
  }
  if (name === 'Delete') {
    return { path: file, status: 'deleted', adds: 0, dels: 0 };
  }
  return { path: file, status: 'modified', adds: 0, dels: 0 };
}

function countLines(s: string): number {
  if (!s) return 0;
  return s.split('\n').length;
}

/** True when the write target does not exist yet (→ a file create). Best-effort. */
function fileMissing(file: string): boolean {
  try {
    return !fs.existsSync(file);
  } catch {
    return false;
  }
}

/** Cap for diff previews carried on tool-call events (renderer-only display). */
const DIFF_PREVIEW_CAP = 4000;

/**
 * Build the truncated before/after content for the conversation stream's diff
 * view. `before` is empty for creates, `after` empty for pure deletions.
 */
function editFromInput(
  name: string,
  input: Record<string, unknown>,
): { before: string; after: string; lang?: string } | null {
  const file = filePathOf(input);
  if (!file) return null;
  const lang = langFromPath(file);
  if (name === 'Write') {
    return { before: '', after: truncate(String(input.content ?? ''), DIFF_PREVIEW_CAP), lang };
  }
  if (name === 'Edit') {
    return {
      before: truncate(String(input.old_string ?? ''), DIFF_PREVIEW_CAP),
      after: truncate(String(input.new_string ?? ''), DIFF_PREVIEW_CAP),
      lang,
    };
  }
  if (name === 'MultiEdit') {
    const edits = Array.isArray(input.edits) ? (input.edits as Array<Record<string, unknown>>) : [];
    const before = edits.map((e) => String(e.old_string ?? '')).join('\n');
    const after = edits.map((e) => String(e.new_string ?? '')).join('\n');
    return { before: truncate(before, DIFF_PREVIEW_CAP), after: truncate(after, DIFF_PREVIEW_CAP), lang };
  }
  return null;
}

/**
 * Build the code preview for a completed `Read` from the tool's own result text.
 *
 * Both providers hand back the file the way the model saw it: `cat -n` style
 * gutter lines (`   12→const x = 1`), optionally wrapped in `<system-reminder>`
 * blocks the model is meant to read but the user should not. We strip the
 * reminders and the gutter (the code block draws its own line numbers, starting
 * from the real first line so an offset read still lines up with the file), and
 * cap the content like the diff preview. Returns null when the result is not a
 * text read at all (images, errors, empty files).
 */
function readFromResult(
  output: string | undefined,
  target: string | undefined,
): { content: string; lang?: string; startLine?: number; truncated?: boolean } | null {
  const raw = (output ?? '').replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
  if (!raw) return null;

  const lines = raw.split('\n');
  // Only treat this as a gutter read when the result actually looks like one —
  // otherwise (a tool that returned prose, an image placeholder) leave it alone.
  const GUTTER = /^\s*(\d+)→(.*)$/;
  const gutter = lines.filter((l) => GUTTER.test(l));
  if (gutter.length < Math.max(1, Math.floor(lines.length / 2))) return null;

  const startLine = Number(GUTTER.exec(gutter[0])?.[1] ?? 1);
  const content = lines
    .map((l) => {
      const m = GUTTER.exec(l);
      return m ? m[2] : l;
    })
    .join('\n');
  const capped = truncate(content, DIFF_PREVIEW_CAP);
  return {
    content: capped,
    lang: target ? langFromPath(target) : undefined,
    startLine: Number.isFinite(startLine) && startLine > 1 ? startLine : undefined,
    truncated: capped.length < content.length,
  };
}

/** Map a file extension to a Shiki language id for the stream diff view. */
function langFromPath(p: string): string | undefined {
  const ext = path.extname(p).slice(1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript',
    cjs: 'javascript', mts: 'typescript', cts: 'typescript', json: 'json', jsonc: 'json',
    css: 'css', scss: 'scss', less: 'less', html: 'html', xml: 'xml', svg: 'xml',
    md: 'markdown', mdx: 'markdown', py: 'python', rs: 'rust', go: 'go', java: 'java',
    kt: 'kotlin', rb: 'ruby', php: 'php', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp',
    hpp: 'cpp', cs: 'csharp', sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell',
    yml: 'yaml', yaml: 'yaml', toml: 'toml', sql: 'sql', swift: 'swift', dart: 'dart',
  };
  return map[ext];
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Defensively coerce the agent-supplied `AskUserQuestion` input into a clean,
 * bounded {@link ClarificationQuestion} list before it crosses to the renderer.
 * The SDK contract is 1–4 questions with 2–4 options each; anything malformed is
 * dropped rather than trusted. Returns an empty array if nothing is usable.
 */
function normalizeQuestions(input: Record<string, unknown>): ClarificationQuestion[] {
  const raw = Array.isArray(input.questions) ? input.questions : [];
  const out: ClarificationQuestion[] = [];
  for (const q of raw.slice(0, 4)) {
    if (!q || typeof q !== 'object') continue;
    const rec = q as Record<string, unknown>;
    const question = typeof rec.question === 'string' ? rec.question.trim() : '';
    if (!question) continue;
    const header =
      typeof rec.header === 'string' && rec.header.trim()
        ? rec.header.trim().slice(0, 12)
        : 'Question';
    const rawOptions = Array.isArray(rec.options) ? rec.options : [];
    const options: ClarificationOption[] = [];
    for (const o of rawOptions.slice(0, 4)) {
      if (!o || typeof o !== 'object') continue;
      const orec = o as Record<string, unknown>;
      const label = typeof orec.label === 'string' ? orec.label.trim() : '';
      if (!label) continue;
      const description = typeof orec.description === 'string' ? orec.description.trim() : '';
      options.push({ label, description });
    }
    if (options.length < 1) continue;
    out.push({ question, header, options, multiSelect: rec.multiSelect === true });
  }
  return out;
}
