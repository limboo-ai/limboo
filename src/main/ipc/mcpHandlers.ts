/**
 * IPC handlers for the provider-independent MCP platform. Reached from the
 * renderer through `window.limboo.mcp.*`.
 *
 * Security (CLAUDE.md §6): renderer input is a plain object screened for
 * prototype-pollution keys before it reaches the manager (which further
 * validates + caps every field in validate.ts). Secret env/header values cross
 * only on add/update and are NEVER returned — list/get expose the `secret: true`
 * flag with an empty value, never the plaintext. The `handle()` wrapper enforces
 * the trusted-sender origin check.
 */
import { IpcChannels } from '@shared/ipc-channels';
import type {
  McpLogLine,
  McpProbeResult,
  McpServerInfo,
  McpServerInput,
} from '@shared/types';
import type { McpManager } from '../managers/mcp/McpManager';
import { handle } from './registry';

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

/** Recursively reject prototype-polluting keys in a renderer-supplied object. */
function assertSafe(value: unknown, depth = 0): void {
  if (depth > 6 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const v of value) assertSafe(v, depth + 1);
    return;
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN.has(key)) throw new Error('Invalid key in MCP server payload.');
    assertSafe((value as Record<string, unknown>)[key], depth + 1);
  }
}

function asInput(value: unknown): McpServerInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid MCP server payload.');
  }
  assertSafe(value);
  return value as McpServerInput;
}

function asId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 128) throw new Error('Invalid server id.');
  return value;
}

export function registerMcpHandlers(mcp: McpManager): void {
  handle<[], McpServerInfo[]>(IpcChannels.mcpList, () => mcp.list());

  handle<[string], McpServerInfo | null>(IpcChannels.mcpGet, (_e, id) => mcp.get(asId(id)));

  handle<[McpServerInput], McpServerInfo>(IpcChannels.mcpAdd, (_e, input) => mcp.add(asInput(input)));

  handle<[string, McpServerInput], McpServerInfo>(IpcChannels.mcpUpdate, (_e, id, input) =>
    mcp.update(asId(id), asInput(input)),
  );

  handle<[string], void>(IpcChannels.mcpRemove, (_e, id) => mcp.remove(asId(id)));

  handle<[string, boolean], void>(IpcChannels.mcpSetEnabled, (_e, id, on) =>
    mcp.setEnabled(asId(id), on === true),
  );

  handle<[string], void>(IpcChannels.mcpConnect, (_e, id) => mcp.connect(asId(id)));

  handle<[string], void>(IpcChannels.mcpDisconnect, (_e, id) => mcp.disconnect(asId(id)));

  handle<[string], McpProbeResult>(IpcChannels.mcpTest, (_e, id) => mcp.test(asId(id)));

  handle<[string], McpServerInfo | null>(IpcChannels.mcpRefreshTools, (_e, id) =>
    mcp.refreshTools(asId(id)),
  );

  handle<[string], McpLogLine[]>(IpcChannels.mcpLogs, (_e, id) => mcp.logs(asId(id)));

  handle<[], number>(IpcChannels.mcpImport, () => mcp.importActive());

  handle<[string[]], { cursor: boolean; claude: boolean }>(
    IpcChannels.mcpExportToProject,
    (_e, ids) => mcp.exportActive(Array.isArray(ids) ? ids.map(asId) : []),
  );
}
