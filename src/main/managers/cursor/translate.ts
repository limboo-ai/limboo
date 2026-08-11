/**
 * Pure translators: Cursor stream-json events → Limboo's existing tool/message
 * identities. Cursor tool payloads are reshaped to the Claude-shaped input
 * keys (`file_path`, `command`, `content`, …) so every existing AgentManager
 * helper — summarizeTool, changeFromInput, editFromInput, terminal mirroring,
 * the attachment read hook — works on Cursor runs unmodified.
 */
import type { CursorAssistantEvent, CursorEvent, CursorToolCallEvent } from './types';
import { isReadOnlyShellCommand } from '../agent/readOnlyCommands';
import { MCP_SERVER_NAME_RE } from '@shared/constants';

/**
 * Disambiguate `--stream-partial-output` assistant events (official contract):
 *  - `timestamp_ms` present, `model_call_id` absent → streaming delta (consume)
 *  - both present → buffered flush before a tool call (skip — deltas carried it)
 *  - both absent → final flush at turn end (authoritative full text)
 */
export function classifyAssistantChunk(
  ev: CursorAssistantEvent,
): 'delta' | 'buffered-flush' | 'final-flush' {
  const hasTimestamp = typeof ev.timestamp_ms === 'number';
  const hasModelCall = typeof ev.model_call_id === 'string' && ev.model_call_id.length > 0;
  if (hasTimestamp && !hasModelCall) return 'delta';
  if (hasTimestamp && hasModelCall) return 'buffered-flush';
  return 'final-flush';
}

/** Join the text blocks of an assistant message (mirrors the Claude path). */
export function assistantText(ev: CursorAssistantEvent): string {
  const blocks = ev.message?.content;
  if (!Array.isArray(blocks)) return '';
  return blocks
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
}

/** Cursor union key → Limboo tool name. Unknown keys fall through generically. */
const TOOL_NAME_MAP: Record<string, string> = {
  readToolCall: 'Read',
  writeToolCall: 'Write',
  editToolCall: 'Edit',
  searchReplaceToolCall: 'Edit',
  strReplaceToolCall: 'Edit',
  multiEditToolCall: 'MultiEdit',
  deleteToolCall: 'Delete',
  deleteFileToolCall: 'Delete',
  shellToolCall: 'Bash',
  bashToolCall: 'Bash',
  terminalToolCall: 'Bash',
  grepToolCall: 'Grep',
  ripgrepToolCall: 'Grep',
  globToolCall: 'Glob',
  globFileSearchToolCall: 'Glob',
  lsToolCall: 'LS',
  listDirToolCall: 'LS',
  fetchToolCall: 'WebFetch',
  webFetchToolCall: 'WebFetch',
  readsemsearchfilesToolCall: 'Grep',
  codebaseSearchToolCall: 'Grep',
  applyPatchToolCall: 'Edit',
  webSearchToolCall: 'WebSearch',
  searchWebToolCall: 'WebSearch',
  updateTodosToolCall: 'TodoWrite',
  todoWriteToolCall: 'TodoWrite',
  taskToolCall: 'TodoWrite',
};

export interface MappedToolCall {
  callId: string;
  name: string;
  input: Record<string, unknown>;
}

/** Extract + normalize the single typed entry of a tool_call event. */
export function mapToolCall(ev: CursorToolCallEvent): MappedToolCall | null {
  const callId = typeof ev.call_id === 'string' && ev.call_id ? ev.call_id : null;
  const union = ev.tool_call;
  if (!callId || !union || typeof union !== 'object') return null;

  const key = Object.keys(union).find((k) => union[k] && typeof union[k] === 'object');
  if (!key) return null;
  const payload = union[key] as { args?: Record<string, unknown> };
  const args = payload.args && typeof payload.args === 'object' ? payload.args : {};

  if (key === 'mcpToolCall') {
    const server = strField(args, 'server') ?? strField(args, 'serverName') ?? 'server';
    const tool = strField(args, 'tool') ?? strField(args, 'toolName') ?? 'tool';
    return { callId, name: `mcp__${server}__${tool}`, input: { ...args } };
  }

  // Documented generic union entry: { function: { name, arguments } } where
  // `arguments` may be an object or a JSON string. Map the declared name
  // through the same identity tables as the typed keys.
  if (key === 'function') {
    const fn = union[key] as Record<string, unknown>;
    const rawName = (strField(fn, 'name') ?? '').trim();
    if (!rawName) return null;
    let fnArgs: Record<string, unknown> = {};
    const rawArgs = fn.arguments ?? fn.args;
    if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
      fnArgs = rawArgs as Record<string, unknown>;
    } else if (typeof rawArgs === 'string') {
      try {
        const parsed: unknown = JSON.parse(rawArgs);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          fnArgs = parsed as Record<string, unknown>;
        }
      } catch {
        /* unparseable arguments stay empty — the chip still renders the name */
      }
    }
    const name =
      HOOK_TOOL_NAME_MAP[rawName.toLowerCase()] ?? TOOL_NAME_MAP[rawName] ?? genericToolName(rawName);
    return { callId, name, input: reshapeArgs(name, fnArgs) };
  }

  const name = TOOL_NAME_MAP[key] ?? genericToolName(key);
  return { callId, name, input: reshapeArgs(name, args) };
}

/** Reshape Cursor args to the Claude-shaped keys the existing helpers read. */
function reshapeArgs(name: string, args: Record<string, unknown>): Record<string, unknown> {
  const input: Record<string, unknown> = { ...args };
  const filePath =
    strField(args, 'path') ??
    strField(args, 'file_path') ??
    strField(args, 'filePath') ??
    strField(args, 'target_file') ??
    strField(args, 'targetFile');

  switch (name) {
    case 'Read':
    case 'Delete':
      if (filePath) input.file_path = filePath;
      break;
    case 'LS': {
      const dir = filePath ?? strField(args, 'dir') ?? strField(args, 'directory');
      if (dir) input.file_path = dir;
      break;
    }
    case 'Write': {
      if (filePath) input.file_path = filePath;
      const content =
        strField(args, 'content') ?? strField(args, 'fileText') ?? strField(args, 'contents');
      if (content !== undefined) input.content = content;
      break;
    }
    case 'Edit':
    case 'MultiEdit': {
      if (filePath) input.file_path = filePath;
      const oldS = strField(args, 'old_string') ?? strField(args, 'oldString');
      const newS = strField(args, 'new_string') ?? strField(args, 'newString');
      if (oldS !== undefined) input.old_string = oldS;
      if (newS !== undefined) input.new_string = newS;
      break;
    }
    case 'Bash': {
      const command = strField(args, 'command') ?? strField(args, 'cmd');
      if (command !== undefined) input.command = command;
      break;
    }
    case 'Grep': {
      const pattern = strField(args, 'pattern') ?? strField(args, 'query') ?? strField(args, 'regex');
      if (pattern !== undefined) input.pattern = pattern;
      break;
    }
    case 'Glob': {
      const pattern = strField(args, 'pattern') ?? strField(args, 'globPattern');
      if (pattern !== undefined) input.pattern = pattern;
      break;
    }
    case 'WebFetch': {
      const url = strField(args, 'url');
      if (url !== undefined) input.url = url;
      break;
    }
    case 'WebSearch': {
      const query = strField(args, 'query') ?? strField(args, 'searchTerm');
      if (query !== undefined) input.query = query;
      break;
    }
    default:
      break;
  }
  return input;
}

/** Best-effort human name for an unmapped union key: strip suffix, capitalize. */
function genericToolName(key: string): string {
  // An already-qualified MCP name is an IDENTITY, not a label — capitalizing it
  // to `Mcp__server__tool` breaks every `mcp__` prefix match downstream (the
  // permission gate's trusted-server and plan-readable lookups both key off it)
  // and renders a mangled chip.
  if (key.startsWith('mcp__')) return key;
  const base = key.replace(/ToolCall$/, '') || key;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Recover the `mcp__<server>__<tool>` identity from a hook payload.
 *
 * The streamed event path builds this name itself, but the hook path receives
 * whatever the CLI puts in `tool_name`, which may be already-qualified, split
 * across a separate server field, or dot/underscore separated. Without this the
 * name reaches the permission gate as an opaque string and every MCP lookup
 * misses.
 *
 * Both segments are charset-validated before interpolation: this is
 * provider-supplied data feeding a prefix-matched security decision, and a
 * segment containing `__` could forge a different server's namespace.
 */
function mcpHookToolName(rawName: string, payload: Record<string, unknown>): string | null {
  if (rawName.startsWith('mcp__')) return rawName;
  const safe = (s: string | undefined): string | null =>
    s && MCP_SERVER_NAME_RE.test(s) ? s : null;

  const server = safe(
    strField(payload, 'server_name') ?? strField(payload, 'serverName') ?? strField(payload, 'server'),
  );
  if (server) {
    const tool = safe(strField(payload, 'tool_name') ?? strField(payload, 'toolName')) ?? safe(rawName);
    if (tool) return `mcp__${server}__${tool}`;
  }
  // `mcp.server.tool` / `mcp_server_tool` — split the first two segments only.
  const m = /^mcp[_.]([^_.]+)[_.](.+)$/i.exec(rawName);
  if (m) {
    const s = safe(m[1]);
    const t = safe(m[2]);
    if (s && t) return `mcp__${s}__${t}`;
  }
  return null;
}

export interface MappedToolResult {
  status: 'done' | 'error';
  output?: string;
}

/** Extract the completion status + a bounded output string from a completed event. */
export function toolResultOf(ev: CursorToolCallEvent, outputMax: number): MappedToolResult {
  const union = ev.tool_call;
  const key = union ? Object.keys(union).find((k) => union[k] && typeof union[k] === 'object') : undefined;
  const result = key ? (union?.[key] as { result?: unknown })?.result : undefined;

  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (r.error !== undefined || r.failure !== undefined || r.rejected !== undefined) {
      return { status: 'error', output: resultText(r.error ?? r.failure ?? r.rejected, outputMax) };
    }
    if (r.success !== undefined) {
      return { status: 'done', output: resultText(r.success, outputMax) };
    }
  }
  return { status: 'done' };
}

/** Pull a display string out of an arbitrary result payload (bounded). */
function resultText(value: unknown, outputMax: number): string | undefined {
  if (typeof value === 'string') return value.slice(0, outputMax);
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  for (const field of ['content', 'stdout', 'output', 'message', 'text']) {
    if (typeof obj[field] === 'string' && (obj[field] as string).length > 0) {
      return (obj[field] as string).slice(0, outputMax);
    }
  }
  try {
    return JSON.stringify(obj).slice(0, outputMax);
  } catch {
    return undefined;
  }
}

/**
 * Tools whose successful "completion" in a non-force run means the change was
 * only PROPOSED (print mode without --force never applies edits or commands).
 * A provably read-only shell command (`git log`, `ls`, …) proposes nothing —
 * counting it would mint a bogus "Cursor proposed N changes" artifact from a
 * purely investigative run.
 */
export function isProposedMutation(
  name: string,
  input?: Record<string, unknown>,
  cwd?: string,
): boolean {
  if (name === 'Bash') return !isReadOnlyShellCommand(input?.command, { cwd });
  return name === 'Write' || name === 'Edit' || name === 'MultiEdit' || name === 'Delete';
}

function strField(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

/** Hook `tool_name` values → Limboo tool names (same identities as the map above). */
const HOOK_TOOL_NAME_MAP: Record<string, string> = {
  read: 'Read',
  read_file: 'Read',
  write: 'Write',
  write_file: 'Write',
  create_file: 'Write',
  edit: 'Edit',
  edit_file: 'Edit',
  search_replace: 'Edit',
  str_replace: 'Edit',
  multi_edit: 'MultiEdit',
  delete: 'Delete',
  delete_file: 'Delete',
  shell: 'Bash',
  bash: 'Bash',
  terminal: 'Bash',
  run_terminal_cmd: 'Bash',
  grep: 'Grep',
  ripgrep: 'Grep',
  codebase_search: 'Grep',
  grep_search: 'Grep',
  semantic_search: 'Grep',
  search_files: 'Grep',
  apply_patch: 'Edit',
  glob: 'Glob',
  glob_file_search: 'Glob',
  file_search: 'Glob',
  ls: 'LS',
  list_dir: 'LS',
  list_directory: 'LS',
  read_lints: 'Read',
  todo_write: 'TodoWrite',
  update_todos: 'TodoWrite',
  fetch: 'WebFetch',
  web_fetch: 'WebFetch',
  web_search: 'WebSearch',
};

/**
 * A read-shaped name we have no mapping for. `classifyTool` cannot recognise
 * `Some_unmapped_search` and falls back to command-risk, which plan/ask mode
 * HARD-DENIES — so a missing map entry silently became "the agent cannot
 * search". Naming the shape keeps an unmapped inspection tool usable; the
 * caller still emits a diagnostic so the gap is visible rather than silent.
 */
const READ_SHAPED_TOOL_RE = /^(grep|search|find|list|read|glob|todo|lint|diagnos)/i;

/** True when an unmapped raw tool name reads as an inspection tool. */
export function isReadShapedToolName(rawName: string): boolean {
  return READ_SHAPED_TOOL_RE.test(rawName.trim());
}

/**
 * Canonical hook event name. The CLI's spelling is undocumented for print
 * mode, so compare case- and separator-insensitively: `pre_tool_use`,
 * `PreToolUse` and `preToolUse` are one event, not three unknowns.
 */
function canonicalHookEvent(event: string): string {
  const key = event.trim().toLowerCase().replace(/[_\-\s.]/g, '');
  switch (key) {
    case 'pretooluse':
      return 'preToolUse';
    case 'beforeshellexecution':
    case 'beforeshell':
      return 'beforeShellExecution';
    case 'beforereadfile':
    case 'beforeread':
      return 'beforeReadFile';
    case 'afterfileedit':
    case 'afteredit':
      return 'afterFileEdit';
    case 'subagentstart':
      return 'subagentStart';
    case 'subagentstop':
      return 'subagentStop';
    default:
      return '';
  }
}

/** Key names only (never values) — safe to surface in a deny message. */
function keyNames(payload: Record<string, unknown>): string {
  return Object.keys(payload).slice(0, 12).join(', ') || '(none)';
}

export interface MappedHookEvent {
  /** Limboo tool identity (feeds classifyTool / summarizeTool unchanged). */
  name: string;
  /** Claude-shaped input keys (file_path / command / …). */
  input: Record<string, unknown>;
  /** True for observe-only events (afterFileEdit) — never gated. */
  observeOnly: boolean;
  /** The raw CLI tool name when it had no map entry (for diagnostics). */
  unmapped?: string;
  /** True when an `unmapped` name reads as an inspection tool (see B5). */
  readShaped?: boolean;
}

/** Either a usable mapping, or the named reason it could not be produced. */
export type HookMapResult =
  | { ok: true; value: MappedHookEvent }
  | { ok: false; reason: string };

/** Any of the aliases Cursor might use for a file-path field. */
function hookFilePath(payload: Record<string, unknown>): string | undefined {
  return (
    strField(payload, 'file_path') ??
    strField(payload, 'path') ??
    strField(payload, 'filePath') ??
    strField(payload, 'absolute_path') ??
    strField(payload, 'absolutePath') ??
    strField(payload, 'uri') ??
    strField(payload, 'file')
  );
}

/**
 * Translate a Cursor hook payload into the Limboo tool identity the existing
 * permission machinery understands. Failure carries a NAMED reason so the
 * caller's deny message says which key was missing instead of "unknown"; the
 * fail posture itself is the caller's (for gate events, DENY).
 */
export function mapHookEvent(event: string, payload: Record<string, unknown>): HookMapResult {
  const ok = (value: MappedHookEvent): HookMapResult => ({ ok: true, value });
  switch (canonicalHookEvent(event)) {
    case 'beforeShellExecution': {
      const command = strField(payload, 'command') ?? strField(payload, 'cmd') ?? '';
      return ok({ name: 'Bash', input: { command }, observeOnly: false });
    }
    case 'beforeReadFile': {
      // An empty input would skip the workspace path guard entirely and raise a
      // content-free approval dialog, so an unrecognised path key is a failure,
      // not a permissive default.
      const filePath = hookFilePath(payload);
      if (!filePath) {
        return { ok: false, reason: `beforeReadFile carried no file path (keys: ${keyNames(payload)})` };
      }
      return ok({ name: 'Read', input: { file_path: filePath }, observeOnly: false });
    }
    case 'afterFileEdit': {
      const filePath = hookFilePath(payload);
      if (!filePath) {
        return { ok: false, reason: `afterFileEdit carried no file path (keys: ${keyNames(payload)})` };
      }
      return ok({ name: 'Edit', input: { file_path: filePath }, observeOnly: true });
    }
    case 'preToolUse': {
      const rawName = (strField(payload, 'tool_name') ?? strField(payload, 'toolName') ?? '').trim();
      if (!rawName) {
        return { ok: false, reason: `preToolUse carried no tool name (keys: ${keyNames(payload)})` };
      }
      const rawInput = payload.tool_input ?? payload.toolInput;
      const args =
        rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)
          ? (rawInput as Record<string, unknown>)
          : {};
      // MCP first: an `mcp__server__tool` identity must survive verbatim to the
      // gate, and reshapeArgs only knows the Claude-shaped tools — running it
      // over MCP args would be a no-op at best and could drop the `path` key the
      // workspace guard reads.
      const mcpName = mcpHookToolName(rawName, payload);
      if (mcpName) return ok({ name: mcpName, input: args, observeOnly: false });
      const mapped = HOOK_TOOL_NAME_MAP[rawName.toLowerCase()] ?? TOOL_NAME_MAP[rawName];
      const name = mapped ?? genericToolName(rawName);
      return ok({
        name,
        input: reshapeArgs(name, args),
        observeOnly: false,
        // An unmapped inspection tool would classify as command-risk and be
        // hard-denied in plan/ask. Flag it so the gate can treat it as a read
        // and the caller can report the gap instead of silently blocking.
        unmapped: mapped ? undefined : rawName,
        readShaped: mapped ? undefined : isReadShapedToolName(rawName),
      });
    }
    case 'subagentStart':
    case 'subagentStop': {
      // OBSERVE ONLY — never a gate. Cursor's own docs say `permission: "ask"`
      // is unsupported on subagentStart and is treated as a deny, so routing
      // this through the permission core could silently kill a delegation the
      // user never saw a prompt for. It is mapped so the run records that a
      // worker was spawned; the ids are unusable for parent linkage (all four
      // carry the session id), so nothing here tries to nest anything.
      const task = strField(payload, 'task') ?? strField(payload, 'description') ?? '';
      const model = strField(payload, 'subagent_model') ?? strField(payload, 'subagentModel');
      return ok({
        name: 'Agent',
        input: {
          description: task,
          ...(model ? { model } : {}),
        },
        observeOnly: true,
      });
    }
    default:
      return { ok: false, reason: `unhandled hook event "${event.slice(0, 40) || '(empty)'}"` };
  }
}

/** Narrow an arbitrary parsed event to the assistant shape. */
export function isAssistantEvent(ev: CursorEvent): ev is CursorAssistantEvent {
  return ev.type === 'assistant';
}

/** Narrow an arbitrary parsed event to the tool_call shape. */
export function isToolCallEvent(ev: CursorEvent): ev is CursorToolCallEvent {
  return ev.type === 'tool_call';
}
