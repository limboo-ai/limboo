/**
 * Transport-neutral tool shape shared by the SDK-shaped in-process MCP servers
 * (Claude runs) and the stdio bridge dispatcher (Cursor runs) — one handler
 * implementation, two transports.
 *
 * Most plain tools are read-only, but that is no longer a blanket contract: the
 * GitHub tools include two that POST a comment, and they are gated by name in
 * `AgentManager.decideToolUseCore` rather than by an assumption made here.
 */
export interface PlainTool {
  name: string;
  description: string;
  /** Hand-written JSON Schema for MCP `tools/list` (mirrors the zod shape). */
  inputSchema: Record<string, unknown>;
  /**
   * Validates its own args defensively; returns display text.
   *
   * May be async — tools that shell out to `gh` are. Every consumer must AWAIT
   * this, including `instrumentPlainTools`, whose timing would otherwise measure
   * how long it took to create the promise rather than to do the work.
   */
  run(args: Record<string, unknown>): string | Promise<string>;
}

/** Coerce an arg to a non-empty bounded string, or null. */
export function strArg(value: unknown, max = 1_000): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.slice(0, max) : null;
}

/** Coerce an arg to a clamped integer with a default. */
export function intArg(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(max, Math.max(min, n));
}
