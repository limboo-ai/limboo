/**
 * Minimal MCP (Model Context Protocol) JSON-RPC 2.0 helpers shared by the stdio
 * and HTTP health-probe clients. Limboo speaks just enough of the protocol to
 * establish a connection and enumerate tools (initialize → tools/list) — actual
 * tool EXECUTION at run time happens inside the provider (Claude Agent SDK /
 * cursor-agent), never here. The probe client exists only to power the UI's
 * status / tool-count / latency and the "test connection" action.
 */
import type { McpToolInfo } from '@shared/types';

/** MCP protocol revision we advertise on initialize. */
export const MCP_PROTOCOL_VERSION = '2025-06-18';

/** Identifies Limboo's probe client to the server. */
export const CLIENT_INFO = { name: 'limboo', version: '1.0.0' } as const;

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Outcome of a single connect + tools/list probe. */
export interface ProbeOutcome {
  ok: boolean;
  tools: McpToolInfo[];
  latencyMs: number;
  /** Human-readable failure reason (secret-free). */
  error?: string;
  /** Server issued an auth challenge (401/403) — surfaces as `needs-auth`. */
  authRequired?: boolean;
}

/** The params sent on the MCP `initialize` request. */
export function initializeParams(): Record<string, unknown> {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: CLIENT_INFO,
  };
}

/** Defensively parse the tools array from a `tools/list` result. */
export function parseToolList(result: unknown, max: number): McpToolInfo[] {
  const raw =
    result && typeof result === 'object' && Array.isArray((result as { tools?: unknown }).tools)
      ? (result as { tools: unknown[] }).tools
      : [];
  const out: McpToolInfo[] = [];
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue;
    const name = (t as { name?: unknown }).name;
    if (typeof name !== 'string' || !name) continue;
    const description = (t as { description?: unknown }).description;
    out.push({ name, description: typeof description === 'string' ? description : undefined });
    if (out.length >= max) break;
  }
  return out;
}

/** Normalize any thrown value into a bounded, secret-free message. */
export function errMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.slice(0, 300);
}
