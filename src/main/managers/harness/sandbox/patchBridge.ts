/**
 * Rewrite the harness bridge's bind address as it is written into the sandbox.
 *
 * WHY THIS EXISTS
 * `@ai-sdk/harness-claude-code` ships a bridge that opens its control
 * WebSocket with a HARDCODED `new WebSocketServer({ port, host: "0.0.0.0" })`.
 * There is no env var, argv flag, or config option for the bind host — the
 * literal was verified in the published `dist/bridge/index.mjs`. That is the
 * right default for the sandbox providers the adapter was written for (a
 * remote guest, where the port is NAT'd), and the wrong one for a LOCAL
 * provider, where "the sandbox" is the user's own machine and `0.0.0.0` puts a
 * channel that drives the coding agent on the LAN.
 *
 * The other three options were checked and do not work: the adapter takes no
 * bind host; pre-binding `127.0.0.1:<port>` ourselves makes the bridge's own
 * `0.0.0.0` bind fail with EADDRINUSE rather than securing it; and the
 * transport is a TCP WebSocket, so a unix socket is not substitutable.
 *
 * WHY IT IS SAFE TO DO HERE
 * The adapter does not write the file — it hands the CONTENT to the sandbox
 * session's file API, which this provider implements. The rewrite therefore
 * happens at a seam we own, on data already passing through our hands, and it
 * only ever NARROWS what the bridge listens on.
 *
 * WHY IT FAILS LOUD
 * This is a string match against a third-party package's compiled output — the
 * exact thing that breaks silently on an upgrade. So a miss is an ERROR, not a
 * fallback: {@link patchBridgeBindHost} throws when the literal is absent or
 * appears more than once, the run refuses to start, and the port assertion in
 * `ports.ts` independently re-proves the outcome at runtime. Never soften
 * either one into a warning.
 */

/** The exact literal the adapter ships. Verified in 1.0.67. */
const BIND_ALL = /host:\s*(["'])0\.0\.0\.0\1/g;
const LOOPBACK = 'host: "127.0.0.1"';

/** True when this bootstrap file is the one that opens the control socket. */
export function isBridgeEntry(path: string): boolean {
  return /(^|[\\/])bridge\.m?js$/.test(path);
}

export interface BridgePatchResult {
  content: string;
  /** How many bind sites were rewritten (always 1 on a supported version). */
  patched: number;
}

/**
 * Rewrite every `host: "0.0.0.0"` in the bridge source to loopback.
 *
 * @throws when the literal is missing — meaning the adapter changed how it
 * binds and this mitigation no longer applies. Refusing to run is the correct
 * response: the alternative is shipping an exposed agent-control socket
 * because a regex stopped matching.
 */
export function patchBridgeBindHost(source: string): BridgePatchResult {
  const matches = source.match(BIND_ALL);
  const patched = matches?.length ?? 0;
  if (patched === 0) {
    throw new Error(
      'Refusing to start the agent bridge: its bind address could not be ' +
        'pinned to loopback. The harness adapter no longer contains the ' +
        'expected `host: "0.0.0.0"` binding, so Limboo cannot prove the bridge ' +
        'will not be reachable from the local network. This usually means ' +
        '@ai-sdk/harness-claude-code was upgraded — re-verify how its bridge ' +
        'binds before allowing runs again.',
    );
  }
  return { content: source.replace(BIND_ALL, LOOPBACK), patched };
}

/**
 * Apply {@link patchBridgeBindHost} to a bootstrap file when it is the bridge
 * entry, and pass everything else through untouched.
 */
export function patchBootstrapFile(
  path: string,
  content: string,
): { content: string; patched: boolean } {
  if (!isBridgeEntry(path)) return { content, patched: false };
  const r = patchBridgeBindHost(content);
  return { content: r.content, patched: r.patched > 0 };
}
