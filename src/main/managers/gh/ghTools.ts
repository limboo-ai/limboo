/**
 * GitHub tools for the agent — pull requests and issues, on the EXISTING
 * `limboo_search` MCP server.
 *
 * Deliberately not a third server: `searchTools.ts` already argues that one
 * would need its own permission rule, its own generated Cursor `mcp.json` entry
 * and its own auto-allow branch — three places to forget. Riding the existing
 * server means both providers (Claude in-process, Cursor over the stdio bridge)
 * get these for free.
 *
 * PERMISSIONS. The four read tools are auto-allowed by name in
 * `AgentManager.decideToolUseCore`; the two comment tools are deliberately NOT
 * in that set, so posting always shows the user the exact body first. The list
 * there is an ALLOW-list, so a tool added here later is gated by default rather
 * than allowed by default — get that backwards and a future write tool ships
 * silently pre-approved.
 *
 * The workspace is never a tool argument: it comes from the active workspace,
 * exactly like the search and memory tools.
 */
import { GH_LIMITS } from '@shared/constants';
import { strArg, intArg, type PlainTool } from '../cursor/bridge/plainTool';
import type { GhListState, GhManager } from './GhManager';
import type { WorkspaceManager } from '../WorkspaceManager';
import type { GhIssue, GhPullRequest } from '@shared/types';

/** Tool names the agent may call without a permission prompt. */
export const GH_READ_TOOL_NAMES = [
  'list_pull_requests',
  'view_pull_request',
  'list_issues',
  'view_issue',
] as const;

/** Tool names that WRITE to GitHub. Never auto-allowed. */
export const GH_WRITE_TOOL_NAMES = ['comment_on_pull_request', 'comment_on_issue'] as const;

const LIST_SCHEMA = {
  type: 'object',
  properties: {
    state: {
      type: 'string',
      enum: ['open', 'closed', 'merged', 'all'],
      description: 'Filter by state (default open).',
    },
    limit: { type: 'number', description: `Max results (default 20, max ${GH_LIMITS.listMax}).` },
  },
  additionalProperties: false,
} as const;

const NUMBER_SCHEMA = {
  type: 'object',
  properties: { number: { type: 'number', description: 'The pull request or issue number.' } },
  required: ['number'],
  additionalProperties: false,
} as const;

const COMMENT_SCHEMA = {
  type: 'object',
  properties: {
    number: { type: 'number', description: 'The pull request or issue number.' },
    body: { type: 'string', description: 'The comment body (Markdown).' },
  },
  required: ['number', 'body'],
  additionalProperties: false,
} as const;

const NUMBER_MAX = 10_000_000;

function fmtPr(pr: GhPullRequest): string {
  const bits = [
    `#${pr.number}`,
    pr.title,
    pr.isDraft ? '[draft]' : `[${pr.state.toLowerCase()}]`,
    pr.author ? `by ${pr.author}` : '',
    pr.headRefName ? `${pr.headRefName} → ${pr.baseRefName ?? ''}` : '',
    pr.reviewDecision ? pr.reviewDecision.toLowerCase().replace(/_/g, ' ') : '',
    pr.url,
  ];
  return bits.filter(Boolean).join('  ');
}

function fmtIssue(issue: GhIssue): string {
  const bits = [
    `#${issue.number}`,
    issue.title,
    `[${issue.state.toLowerCase()}]`,
    issue.author ? `by ${issue.author}` : '',
    issue.labels.length > 0 ? `(${issue.labels.join(', ')})` : '',
    issue.url,
  ];
  return bits.filter(Boolean).join('  ');
}

export function ghPlainTools(gh: GhManager, workspace: WorkspaceManager): PlainTool[] {
  const wsId = (): string | null => workspace.getActive()?.id ?? null;

  const listState = (value: unknown, allowed: readonly string[]): GhListState | undefined => {
    const s = strArg(value, 16);
    return s && allowed.includes(s) ? (s as GhListState) : undefined;
  };

  const number = (value: unknown): number | null => {
    const n = intArg(value, 1, NUMBER_MAX, 0);
    return n >= 1 ? n : null;
  };

  return [
    {
      name: 'list_pull_requests',
      description:
        "List pull requests on this repository's GitHub remote. Read-only. Returns number, " +
        'title, state, author, branches, and URL.',
      inputSchema: LIST_SCHEMA,
      run: async (args) => {
        const id = wsId();
        if (!id) return 'No active workspace.';
        const prs = await gh.listPullRequests(id, {
          state: listState(args.state, ['open', 'closed', 'merged', 'all']),
          limit: intArg(args.limit, 1, GH_LIMITS.listMax, GH_LIMITS.listDefault),
        });
        if (prs.length === 0) return 'No pull requests match.';
        return prs.map(fmtPr).join('\n');
      },
    },
    {
      name: 'view_pull_request',
      description: 'Show one pull request by number. Read-only.',
      inputSchema: NUMBER_SCHEMA,
      run: async (args) => {
        const id = wsId();
        if (!id) return 'No active workspace.';
        const n = number(args.number);
        if (n === null) return 'A valid "number" is required.';
        const pr = await gh.viewPullRequest(id, n);
        return pr ? fmtPr(pr) : `Pull request #${n} was not found.`;
      },
    },
    {
      name: 'list_issues',
      description:
        "List issues on this repository's GitHub remote. Read-only. Returns number, title, " +
        'state, author, labels, and URL.',
      inputSchema: LIST_SCHEMA,
      run: async (args) => {
        const id = wsId();
        if (!id) return 'No active workspace.';
        const issues = await gh.listIssues(id, {
          state: listState(args.state, ['open', 'closed', 'all']),
          limit: intArg(args.limit, 1, GH_LIMITS.listMax, GH_LIMITS.listDefault),
        });
        if (issues.length === 0) return 'No issues match.';
        return issues.map(fmtIssue).join('\n');
      },
    },
    {
      name: 'view_issue',
      description: 'Show one issue by number. Read-only.',
      inputSchema: NUMBER_SCHEMA,
      run: async (args) => {
        const id = wsId();
        if (!id) return 'No active workspace.';
        const n = number(args.number);
        if (n === null) return 'A valid "number" is required.';
        const issue = await gh.viewIssue(id, n);
        return issue ? fmtIssue(issue) : `Issue #${n} was not found.`;
      },
    },
    {
      name: 'comment_on_pull_request',
      description:
        'Post a comment on a pull request. WRITES to GitHub and is published publicly under ' +
        "the user's account, so it always requires their explicit approval.",
      inputSchema: COMMENT_SCHEMA,
      run: (args) => comment('pr', args),
    },
    {
      name: 'comment_on_issue',
      description:
        'Post a comment on an issue. WRITES to GitHub and is published publicly under the ' +
        "user's account, so it always requires their explicit approval.",
      inputSchema: COMMENT_SCHEMA,
      run: (args) => comment('issue', args),
    },
  ];

  async function comment(kind: 'pr' | 'issue', args: Record<string, unknown>): Promise<string> {
    const id = wsId();
    if (!id) return 'No active workspace.';
    const n = number(args.number);
    if (n === null) return 'A valid "number" is required.';
    const body = strArg(args.body, GH_LIMITS.commentBodyMax);
    if (!body) return 'A non-empty "body" is required.';

    const res = await gh.comment(id, kind, n, body);
    if (!res.ok) return `Could not post the comment: ${res.error ?? 'unknown error'}`;
    return res.url ? `Comment posted: ${res.url}` : 'Comment posted.';
  }
}
