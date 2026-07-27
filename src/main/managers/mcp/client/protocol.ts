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

/**
 * Read the MCP `annotations.readOnlyHint` for one tool entry.
 *
 * Per the spec these hints are asserted by the SERVER about itself and clients
 * must treat them as untrusted — so this is captured as information, and the
 * permission gate decides what (if anything) to do with it.
 *
 * A tool qualifies only when it claims `readOnlyHint: true` AND does not also
 * claim `destructiveHint: true`. The spec's default for `destructiveHint` is
 * `true`, but a server that explicitly sets both is describing something
 * self-contradictory, and the safe reading of a contradiction is "not read-only".
 * `idempotentHint` / `openWorldHint` are irrelevant to this decision.
 */
function readOnlyHintOf(tool: object): boolean {
  const ann = (tool as { annotations?: unknown }).annotations;
  if (!ann || typeof ann !== 'object' || Array.isArray(ann)) return false;
  const a = ann as { readOnlyHint?: unknown; destructiveHint?: unknown };
  return a.readOnlyHint === true && a.destructiveHint !== true;
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
    out.push({
      name,
      description: typeof description === 'string' ? description : undefined,
      // Omit the key entirely when unclaimed, so the cached JSON stays small and
      // "absent" and "false" are the same thing on read.
      ...(readOnlyHintOf(t) ? { readOnly: true as const } : {}),
    });
    if (out.length >= max) break;
  }
  return out;
}

/** Normalize any thrown value into a bounded, secret-free message. */
export function errMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m.slice(0, 300);
}
