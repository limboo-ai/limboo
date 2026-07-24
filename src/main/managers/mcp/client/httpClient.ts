/**
 * HTTP MCP health-probe client (Streamable HTTP + legacy SSE). POSTs the
 * `initialize` → `tools/list` handshake and reads the response from either an
 * `application/json` body or a `text/event-stream` (Streamable HTTP). Every
 * connection is SSRF-guarded via the shared {@link makeGuardedLookup} on the
 * ACTUAL resolved socket address (DNS-rebind-safe): private/loopback/link-local
 * are blocked unless the server explicitly opts in, and the cloud-metadata IP is
 * always blocked. This never executes a tool — the provider owns the runtime
 * transport; the probe only powers status + tool discovery for the UI.
 */
import * as http from 'node:http';
import * as https from 'node:https';
import { MCP_LIMITS } from '@shared/constants';
import { makeGuardedLookup } from '../../../net/ssrfGuard';
import {
  errMessage,
  initializeParams,
  parseToolList,
  type JsonRpcResponse,
  type ProbeOutcome,
} from './protocol';

export interface HttpProbeSpec {
  url: string;
  /** Resolved request headers (auth/bearer already merged in). */
  headers: Record<string, string>;
  timeoutMs: number;
  /** Permit a private/loopback/link-local resolved address (opt-in per server). */
  allowPrivate: boolean;
}

interface RawResult {
  status: number;
  contentType: string;
  body: string;
  sessionId?: string;
}

/** POST one JSON-RPC payload; resolves with the raw response (bounded body). */
function post(spec: HttpProbeSpec, payload: unknown, sessionId?: string): Promise<RawResult> {
  return new Promise<RawResult>((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(spec.url);
    } catch {
      return reject(new Error('Invalid server URL'));
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return reject(new Error(`Unsupported URL scheme: ${url.protocol}`));
    }
    if (url.username || url.password) {
      return reject(new Error('Server URL must not contain embedded credentials'));
    }
    const mod = url.protocol === 'https:' ? https : http;
    const data = Buffer.from(JSON.stringify(payload), 'utf8');
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'content-length': String(data.length),
      ...spec.headers,
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;

    const req = mod.request(
      url,
      {
        method: 'POST',
        headers,
        lookup: makeGuardedLookup({ allowPrivate: spec.allowPrivate }),
        timeout: spec.timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (c: Buffer) => {
          total += c.length;
          if (total <= MCP_LIMITS.clientLineMax) chunks.push(c);
          else res.destroy();
        });
        res.on('end', () => {
          const sid = res.headers['mcp-session-id'];
          resolve({
            status: res.statusCode ?? 0,
            contentType: String(res.headers['content-type'] ?? ''),
            body: Buffer.concat(chunks).toString('utf8'),
            sessionId: typeof sid === 'string' ? sid : sessionId,
          });
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/** Find the JSON-RPC response with the given id in a JSON or SSE body. */
function extractResponse(body: string, contentType: string, id: number): JsonRpcResponse | null {
  const tryParse = (s: string): JsonRpcResponse | null => {
    try {
      const o = JSON.parse(s) as JsonRpcResponse | JsonRpcResponse[];
      if (Array.isArray(o)) return o.find((r) => r && r.id === id) ?? null;
      return o && o.id === id ? o : null;
    } catch {
      return null;
    }
  };
  if (contentType.includes('text/event-stream')) {
    for (const line of body.split(/\r?\n/)) {
      const m = line.match(/^data:\s?(.*)$/);
      if (!m) continue;
      const r = tryParse(m[1]);
      if (r) return r;
    }
    return null;
  }
  return tryParse(body);
}

export async function probeHttpServer(spec: HttpProbeSpec): Promise<ProbeOutcome> {
  const started = Date.now();
  const authFail = (status: number): ProbeOutcome => ({
    ok: false,
    tools: [],
    latencyMs: Date.now() - started,
    authRequired: true,
    error: `Authentication required (HTTP ${status})`,
  });
  try {
    const init = await post(
      spec,
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: initializeParams() },
    );
    if (init.status === 401 || init.status === 403) return authFail(init.status);
    if (init.status >= 400) {
      return { ok: false, tools: [], latencyMs: Date.now() - started, error: `HTTP ${init.status}` };
    }
    const initResp = extractResponse(init.body, init.contentType, 1);
    if (initResp?.error) {
      return { ok: false, tools: [], latencyMs: Date.now() - started, error: initResp.error.message };
    }
    const sessionId = init.sessionId;
    // Best-effort initialized notification (servers reply 202 / empty).
    try {
      await post(spec, { jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId);
    } catch {
      /* non-fatal */
    }
    const list = await post(spec, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, sessionId);
    if (list.status === 401 || list.status === 403) return authFail(list.status);
    if (list.status >= 400) {
      return { ok: false, tools: [], latencyMs: Date.now() - started, error: `HTTP ${list.status}` };
    }
    const listResp = extractResponse(list.body, list.contentType, 2);
    if (listResp?.error) {
      return { ok: false, tools: [], latencyMs: Date.now() - started, error: listResp.error.message };
    }
    return {
      ok: true,
      tools: parseToolList(listResp?.result, MCP_LIMITS.maxTools),
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return { ok: false, tools: [], latencyMs: Date.now() - started, error: errMessage(err) };
  }
}
