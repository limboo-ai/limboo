/**
 * Stdio MCP health-probe client. Spawns a configured stdio server (argv-only,
 * **never `shell: true`**), performs the `initialize` → `tools/list` handshake
 * over newline-delimited JSON-RPC, then kills it. Bounded by a caller-supplied
 * timeout and {@link MCP_LIMITS.clientLineMax}. This never runs a tool — it only
 * validates connectivity and enumerates the server's tools for the UI.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { MCP_LIMITS } from '@shared/constants';
import {
  errMessage,
  initializeParams,
  parseToolList,
  type JsonRpcResponse,
  type ProbeOutcome,
} from './protocol';

export interface StdioProbeSpec {
  command: string;
  args: string[];
  /** Extra env merged over the parent process env at spawn (secrets resolved). */
  env: Record<string, string>;
  cwd?: string;
  timeoutMs: number;
}

export function probeStdioServer(spec: StdioProbeSpec): Promise<ProbeOutcome> {
  const started = Date.now();
  return new Promise<ProbeOutcome>((resolve) => {
    let settled = false;
    let child: ChildProcess | undefined;
    let stderrTail = '';
    let buf = '';
    const pending = new Map<
      number,
      { resolve: (r: JsonRpcResponse) => void; reject: (e: Error) => void }
    >();

    const done = (o: ProbeOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Drain any in-flight requests so their awaiting frames unwind instead of
      // leaking (a hung child would otherwise pin them forever). The IIFE's
      // try/catch swallows the rejection; its done() is already a no-op.
      for (const p of pending.values()) p.reject(new Error('probe settled'));
      pending.clear();
      try {
        child?.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      resolve(o);
    };

    const timer = setTimeout(
      () => done({ ok: false, tools: [], latencyMs: Date.now() - started, error: 'Probe timed out' }),
      spec.timeoutMs,
    );

    try {
      child = spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        env: { ...process.env, ...spec.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      });
    } catch (err) {
      done({ ok: false, tools: [], latencyMs: Date.now() - started, error: errMessage(err) });
      return;
    }

    child.on('error', (err) =>
      done({ ok: false, tools: [], latencyMs: Date.now() - started, error: errMessage(err) }),
    );
    child.stderr?.on('data', (d: Buffer) => {
      stderrTail = (stderrTail + d.toString('utf8')).slice(-2048);
    });
    child.on('exit', (code) => {
      if (settled) return;
      const tail = stderrTail.trim().slice(0, 200);
      done({
        ok: false,
        tools: [],
        latencyMs: Date.now() - started,
        error: `Server exited (${code ?? 'signal'})${tail ? `: ${tail}` : ''}`,
      });
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      // Guard against an unbounded line (a server that never emits a newline).
      if (buf.length > MCP_LIMITS.clientLineMax) buf = buf.slice(-MCP_LIMITS.clientLineMax);
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let parsed: JsonRpcResponse;
        try {
          parsed = JSON.parse(line) as JsonRpcResponse;
        } catch {
          continue;
        }
        if (typeof parsed.id === 'number' && pending.has(parsed.id)) {
          const cb = pending.get(parsed.id);
          pending.delete(parsed.id);
          cb?.resolve(parsed);
        }
      }
    });

    const write = (obj: unknown): void => {
      try {
        child?.stdin?.write(`${JSON.stringify(obj)}\n`);
      } catch {
        /* pipe closed — the exit/error handler resolves */
      }
    };
    const request = (id: number, method: string, params?: unknown): Promise<JsonRpcResponse> =>
      new Promise<JsonRpcResponse>((res, rej) => {
        pending.set(id, { resolve: res, reject: rej });
        write({ jsonrpc: '2.0', id, method, params });
      });

    void (async () => {
      try {
        const init = await request(1, 'initialize', initializeParams());
        if (settled) return;
        if (init.error)
          return done({ ok: false, tools: [], latencyMs: Date.now() - started, error: init.error.message });
        write({ jsonrpc: '2.0', method: 'notifications/initialized' });
        const list = await request(2, 'tools/list', {});
        if (settled) return;
        if (list.error)
          return done({ ok: false, tools: [], latencyMs: Date.now() - started, error: list.error.message });
        done({
          ok: true,
          tools: parseToolList(list.result, MCP_LIMITS.maxTools),
          latencyMs: Date.now() - started,
        });
      } catch (err) {
        done({ ok: false, tools: [], latencyMs: Date.now() - started, error: errMessage(err) });
      }
    })();
  });
}
