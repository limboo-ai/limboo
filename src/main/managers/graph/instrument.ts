/**
 * Internal-MCP instrumentation for the Work Graph.
 *
 * Limboo's own MCP tools (`limboo_memory`, `limboo_search`) are exposed over
 * TWO transports — the SDK's in-process servers for Claude runs, and the stdio
 * bridge dispatcher for Cursor runs — but both call the SAME `PlainTool.run`.
 * Wrapping `run` once therefore captures every internal MCP invocation on both
 * providers, which is why the tools were factored into `PlainTool` in the first
 * place.
 *
 * ENRICHMENT, NOT INGESTION. Internal MCP calls also arrive on the primary
 * `AgentManager.onEvent()` path as `tool-start`/`tool-end` on `mcp__limboo_*`
 * names, so this wrapper's job is to add what that path lacks — the real
 * execution duration and the result size — not to create duplicate nodes. If
 * the wrapper were removed entirely the graph would still show every call.
 *
 * The wrapper is transparent: it never alters args, never alters the return
 * value, and never swallows an error. A failing observer must not be able to
 * change what a tool returns to a model.
 */
import type { PlainTool } from '../cursor/bridge/plainTool';

/** One observed internal MCP invocation. */
export interface McpInvocation {
  server: string;
  tool: string;
  durationMs: number;
  resultChars: number;
  /**
   * Items in the result, counted from the `- ` list convention every Limboo
   * plain tool uses for its hits (`searchTools.fmt`, `memoryTools`). 0 for a
   * tool whose output is not a list — which is why it is reported separately
   * from `resultChars` rather than inferred from it.
   */
  resultItems: number;
  ok: boolean;
}

/** Count `- ` prefixed lines — the shared hit format of the plain tools. */
function countItems(text: string): number {
  let n = 0;
  for (const line of text.split('\n')) if (line.startsWith('- ')) n += 1;
  return n;
}

export type McpObserver = (invocation: McpInvocation) => void;

/**
 * The process-wide observer, set once at boot.
 *
 * A module-level setter (the `configureCursorExec` idiom) rather than a
 * threaded parameter: the two tool factories have three call sites between them
 * — two SDK servers and the Cursor bridge dispatcher — and none of them has, or
 * should have, a reference to the Work Graph. Defaults to a no-op, so an
 * un-configured build simply records nothing.
 */
let observer: McpObserver | null = null;

/** Install the observer. Pass `null` to detach (used on quit). */
export function setMcpObserver(fn: McpObserver | null): void {
  observer = fn;
}

/**
 * Wrap tools with the process-wide observer, if one is installed. Returns the
 * input untouched when there is none, so there is zero cost when the Work Graph
 * is disabled or absent.
 */
export function observePlainTools(tools: PlainTool[], server: string): PlainTool[] {
  if (!observer) return tools;
  const observe = observer;
  return instrumentPlainTools(tools, server, (invocation) => observe(invocation));
}

/**
 * Wrap every tool so its invocations are reported to `observe`. Returns a new
 * array; the input tools are not mutated.
 */
export function instrumentPlainTools(
  tools: PlainTool[],
  server: string,
  observe: McpObserver,
): PlainTool[] {
  return tools.map((tool) => ({
    ...tool,
    run: (args: Record<string, unknown>): string => {
      const startedAt = Date.now();
      let ok = true;
      let out = '';
      try {
        out = tool.run(args);
        return out;
      } catch (err) {
        ok = false;
        // Rethrow: the transport owns error handling, and an observer must
        // never change what the model sees.
        throw err;
      } finally {
        try {
          observe({
            server,
            tool: tool.name,
            durationMs: Date.now() - startedAt,
            resultChars: out.length,
            resultItems: countItems(out),
            ok,
          });
        } catch {
          /* an observer failure must never affect the tool call */
        }
      }
    },
  }));
}
