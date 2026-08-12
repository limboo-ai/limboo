/**
 * Loopback-only port allocation for the local sandbox provider.
 *
 * A harness adapter's bridge is a control channel for the coding agent: anyone
 * who can reach it can drive the agent. In a REMOTE sandbox the bridge's port
 * is NAT'd behind the provider, so binding broadly inside the guest is
 * harmless. A LOCAL provider has no guest — the "sandbox" is this machine — so
 * the same bind is a LAN-reachable agent-control socket. That is unacceptable
 * under CLAUDE.md §1, and a per-run token is not a substitute for not being
 * reachable.
 *
 * Two rules, both enforced here:
 *  1. Allocation only ever yields a port we proved we can hold on 127.0.0.1,
 *     and callers only ever receive a loopback URL.
 *  2. After the bridge is up, {@link assertLoopbackOnly} re-checks from a
 *     NON-loopback local address and fails the run if the port answers. This is
 *     a runtime assertion, not a comment: the adapter is a third-party package
 *     and may change its bind behaviour in any release.
 */
import net from 'node:net';
import os from 'node:os';

export interface PortReservation {
  readonly port: number;
  /**
   * Release the holding listener. Call IMMEDIATELY before spawning the process
   * that will take the port — holding it until then is what closes the
   * probe-then-race window that a plain "find a free port" helper leaves open.
   */
  release(): void;
}

/**
 * Reserve an ephemeral port on 127.0.0.1 and KEEP IT BOUND until `release()`.
 *
 * Binding to port 0 and immediately closing (the usual trick) tells you a port
 * *was* free, not that it still is. Holding the listener means nothing else on
 * the machine can take it in between.
 */
export async function reserveLoopbackPort(): Promise<PortReservation> {
  return new Promise<PortReservation>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    // Explicitly 127.0.0.1 — never 0.0.0.0, and never a caller-supplied host.
    server.listen({ port: 0, host: '127.0.0.1', exclusive: true }, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Could not resolve a loopback port.'));
        return;
      }
      let released = false;
      resolve({
        port: addr.port,
        release: () => {
          if (released) return;
          released = true;
          try {
            server.close();
          } catch {
            // already closed
          }
        },
      });
    });
  });
}

/** Every non-loopback IPv4 address on this host. */
function externalAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

/** Can `host:port` be connected to within `timeoutMs`? */
function reachable(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (answer: boolean): void => {
      sock.destroy();
      resolve(answer);
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
    try {
      sock.connect({ host, port });
    } catch {
      done(false);
    }
  });
}

/**
 * Throw if `port` answers on any non-loopback address of this host.
 *
 * THE enforcement point for the bind-address problem. The bridge shipped by
 * `@ai-sdk/harness-claude-code` hardcodes `host: "0.0.0.0"`; the local provider
 * rewrites that literal as the file is written into the sandbox
 * ({@link patchBridgeBindHost}), and this assertion proves the rewrite actually
 * took effect at runtime. Keep BOTH: the patch is a claim about a third-party
 * file, and this is the check that the claim held.
 *
 * A host with no external interface trivially passes — there is nothing to be
 * reachable from.
 */
export async function assertLoopbackOnly(port: number, timeoutMs = 750): Promise<void> {
  const externals = externalAddresses();
  if (externals.length === 0) return;
  const hits = await Promise.all(externals.map((h) => reachable(h, port, timeoutMs)));
  const exposed = externals.filter((_, i) => hits[i]);
  if (exposed.length > 0) {
    throw new Error(
      `Refusing to run: the agent bridge on port ${port} is reachable from ` +
        `${exposed.join(', ')}, not just loopback. This would expose agent ` +
        'control to the local network.',
    );
  }
}
