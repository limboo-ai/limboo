/**
 * Search tools — an in-process MCP server that lets the coding agent query the
 * local Search Engine on demand. The Search Engine is the app's **retrieval**
 * layer: these tools help the agent decide *what* to explore before it invokes its
 * own authoritative Read/Grep/Glob. They never replace those tools.
 *
 * Security (CLAUDE.md §6): every tool is read-only and scoped to the active
 * workspace. They are auto-allowed in `AgentManager.makeCanUseTool` precisely
 * because they cannot mutate anything. The SDK is ESM-only, so
 * `createSdkMcpServer`/`tool` are passed in from the runtime-loaded module rather
 * than statically imported here.
 */
import { z } from 'zod';
import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import type { SearchHit } from '@shared/types';
import { intArg, strArg, type PlainTool } from '../cursor/bridge/plainTool';
import { observePlainTools } from '../graph/instrument';
import { releasePlainTools } from './releaseTools';
import type { SearchManager } from './SearchManager';
import type { WorkspaceManager } from '../WorkspaceManager';

type SdkMcpApi = Pick<typeof import('@anthropic-ai/claude-agent-sdk'), 'createSdkMcpServer' | 'tool'>;

function text(s: string) {
  return { content: [{ type: 'text' as const, text: s }] };
}

/** One hit as a single compact, navigable line. */
function fmt(h: SearchHit): string {
  const loc = h.line ? `${h.path}:${h.line}` : h.path ?? h.ref;
  if (h.kind === 'symbol') return `- [${h.symbolKind ?? 'symbol'}] ${h.title} — ${loc}`;
  if (h.kind === 'file' || h.kind === 'doc') return `- ${loc}`;
  return `- [${h.kind}] ${h.title}${h.subtitle ? ` — ${h.subtitle}` : ''}`;
}

/** Shared `{ query, limit }` JSON Schema for the retrieval tools. */
function querySchema(queryHint: string, limitHint: string): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      query: { type: 'string', description: queryHint },
      limit: { type: 'number', description: limitHint },
    },
    required: ['query'],
  };
}

/**
 * The `limboo_search` tool set as transport-neutral plain tools — the single
 * handler implementation behind both the SDK-shaped server (Claude runs) and
 * the stdio bridge dispatcher (Cursor runs). Read-only, workspace-scoped.
 */
export function searchPlainTools(search: SearchManager, workspace: WorkspaceManager): PlainTool[] {
  const wsId = (): string | null => workspace.getActive()?.id ?? null;
  // Release notes join this server rather than getting one of their own: they
  // are retrieval, `limboo_search` is the retrieval server, and a third server
  // would need its own permission rule, its own generated Cursor `mcp.json`
  // entry and its own auto-allow branch — three places to forget.
  //
  // They are appended OUTSIDE `observePlainTools` because they wrap themselves
  // (see `releaseTools.ts`); double-wrapping would report each call twice.
  // Wrapped once HERE so all three consumers — the two SDK in-process servers
  // (Claude) and the Cursor bridge dispatcher — are observed by one edit.
  return observePlainTools([
    {
      name: 'search_project',
      description:
        'Retrieve the files, symbols and documentation the local Search Engine ' +
        'judges most relevant to a query, across the whole workspace. Use this ' +
        'FIRST to decide what to open — then read the ranked results with your own ' +
        'Read/Grep/Glob tools. Faster than blind exploration.',
      inputSchema: querySchema(
        'What to look for (keywords, a symbol name, a phrase).',
        'Max hits per group (default 12).',
      ),
      run: (args) => {
        const query = strArg(args.query);
        if (!query) return 'A non-empty "query" is required.';
        const groups = search.globalSearch(query, {
          workspaceId: wsId(),
          limit: intArg(args.limit, 1, 50, 12),
        });
        if (groups.length === 0) return `No matches for "${query}".`;
        return groups.map((g) => `${g.label}:\n${g.hits.map(fmt).join('\n')}`).join('\n\n');
      },
    },
    {
      name: 'find_files',
      description:
        'Find workspace files by name, path fragment, or content. Returns ranked, ' +
        'workspace-relative paths to open.',
      inputSchema: querySchema(
        'Filename, path fragment, or content keywords.',
        'Max results (default 20).',
      ),
      run: (args) => {
        const query = strArg(args.query);
        if (!query) return 'A non-empty "query" is required.';
        const hits = search.searchFiles(query, {
          workspaceId: wsId(),
          limit: intArg(args.limit, 1, 50, 20),
        });
        if (hits.length === 0) return `No files match "${query}".`;
        return hits.map(fmt).join('\n');
      },
    },
    {
      name: 'find_symbols',
      description:
        'Find declarations (functions, classes, interfaces, types, …) by name across ' +
        'the workspace. Returns path:line locations to jump to.',
      inputSchema: querySchema('Symbol name or fragment.', 'Max results (default 20).'),
      run: (args) => {
        const query = strArg(args.query);
        if (!query) return 'A non-empty "query" is required.';
        const hits = search.searchSymbols(query, {
          workspaceId: wsId(),
          limit: intArg(args.limit, 1, 50, 20),
        });
        if (hits.length === 0) return `No symbols match "${query}".`;
        return hits.map(fmt).join('\n');
      },
    },
  ], 'limboo_search').concat(releasePlainTools());
}

/**
 * Zod args per tool.
 *
 * The retrieval tools all take `{ query, limit }`; the release tools do not —
 * `list_releases` takes nothing at all. Handing every tool the same schema
 * would make `query` mandatory on a tool that has no query, so the SDK would
 * reject the model's perfectly correct call. The plain-tool `inputSchema` is
 * already per-tool; this is the zod mirror of it.
 */
const QUERY_ARGS = {
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional(),
};

const ZOD_ARGS: Record<string, z.ZodRawShape> = {
  release_notes: { version: z.string().min(1) },
  list_releases: {},
};

/**
 * Build the `limboo_search` MCP server exposing read-only retrieval tools to the
 * agent. Returns a server instance ready to drop into `Options.mcpServers`.
 */
export function createSearchMcpServer(
  sdk: SdkMcpApi,
  search: SearchManager,
  workspace: WorkspaceManager,
): McpSdkServerConfigWithInstance {
  const { createSdkMcpServer, tool } = sdk;

  return createSdkMcpServer({
    name: 'limboo_search',
    version: '1.0.0',
    tools: searchPlainTools(search, workspace).map((t) =>
      tool(t.name, t.description, ZOD_ARGS[t.name] ?? QUERY_ARGS, async (args) =>
        text(t.run(args)),
      ),
    ),
  });
}
