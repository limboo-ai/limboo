/**
 * The Work Graph builder — a PURE reducer from normalized execution events to
 * typed graph nodes and edges.
 *
 * This file is the single home of the event -> node/edge mapping. It has no DB
 * access, no IPC, and no clock (time arrives on the events), so it is trivially
 * testable and cannot stall a run.
 *
 * PROVIDER NEUTRALITY: every signal here arrives from `AgentManager.onEvent()`,
 * which is already normalized across both adapters — Cursor's `translate.ts`
 * maps Cursor's tool-union keys onto Claude-shaped tool names before the event
 * is pushed. So ONE mapping table serves both providers, and any future adapter
 * that emits `AgentEvent` contributes nodes for free. The Hook Engine bus is
 * used only for ENRICHMENT (approval decisions, checkpoints) — never as a sole
 * source, because it is gated on `settings.agent.hookEngine.enabled` and the
 * graph must be complete with hooks turned off.
 *
 * HONESTY RULES enforced here:
 * - An edge is `derived: true` unless it was read straight off an event.
 * - `terminal.meta.exitCode` is left undefined for agent commands: the Agent
 *   SDK does not stream tool stdout, so there is no real exit code to report.
 * - Cursor print mode has no subagents, so no `subagent` node is ever synthesized
 *   for a Cursor run.
 */
import crypto from 'node:crypto';
import { GRAPH_LIMITS } from '@shared/constants';
import { isSubagentTool } from '@shared/subagents';
import type {
  AgentEvent,
  AgentToolCall,
  FileChange,
  MemoryTier,
  SessionPlan,
  TaskItem,
  WorkGraphEdge,
  WorkGraphEdgeKind,
  WorkGraphNode,
  WorkGraphNodeKind,
  WorkGraphNodeStatus,
  WorkGraphRef,
} from '@shared/types';
import { isPlanBlocking } from '@shared/plan';
import { clean, cleanRequired } from './redact';

/**
 * The graph status for a settled plan, or null while it is still live.
 * 'archived' reads as denied because the plan did not complete — the reason it
 * did not is carried by `planEndReason`, not by the colour.
 */
function settledPlanStatus(status: SessionPlan['status']): WorkGraphNodeStatus | null {
  if (status === 'completed') return 'done';
  if (status === 'rejected' || status === 'archived') return 'denied';
  return null;
}

/** Files ingested from one File Writer mutation burst. */
const MAX_FILES_PER_MUTATION = 25;

/** Optional fields when constructing a node; everything else is derived. */
interface NodeOpts {
  status?: WorkGraphNodeStatus;
  detail?: string;
  ref?: WorkGraphRef;
  runId?: string;
  id?: string;
  endedAt?: number;
}

/** Which repository operation a git node records. */
export type GitOp = 'create' | 'restore' | 'delete';

/** Repository operations that are not commits and not checkpoints. */
export type GitOpKind = 'push' | 'pull' | 'fetch' | 'checkout' | 'branch' | 'tag' | 'init';

/** What the op acted on. Never a remote URL — URLs can carry credentials. */
export interface GitOpDetail {
  branch?: string;
  remote?: string;
  summary?: string;
}

/** Title for a git-op node, reading as the action the user or agent took. */
function gitOpTitle(op: GitOpKind, detail: GitOpDetail): string {
  const target = detail.branch ?? detail.remote ?? '';
  switch (op) {
    case 'push':
      return target ? `Pushed ${target}` : 'Pushed';
    case 'pull':
      return target ? `Pulled ${target}` : 'Pulled';
    case 'fetch':
      return target ? `Fetched ${target}` : 'Fetched';
    case 'checkout':
      return target ? `Checked out ${target}` : 'Checked out';
    case 'branch':
      return target ? `Created branch ${target}` : 'Created branch';
    case 'tag':
      return target ? `Tagged ${target}` : 'Created tag';
    default:
      return 'Initialized repository';
  }
}

function opLabel(op: GitOp): string {
  return op === 'create' ? 'Checkpoint' : op === 'restore' ? 'Restored' : 'Deleted checkpoint';
}

/** One ranked memory hit, as reported by the Memory System. */
export interface MemoryHitSignal {
  id: string;
  tier: MemoryTier;
  score: number;
  title: string;
}

/* The builder takes STRUCTURAL types for platform-service inputs rather than
 * importing each manager's own interface: it must stay a pure, dependency-free
 * reducer, and these are the only fields it actually reads. */

interface GitCommitLike {
  hash: string;
  subject: string;
  body?: string;
  at: number;
}

interface GitCheckpointLike {
  id: string;
  commit: string;
  label: string;
  files: string[];
  createdAt: number;
}

interface TerminalSignalLike {
  terminalId: string;
  sessionId?: string;
  origin: 'user' | 'agent' | 'hook' | 'service';
  phase: 'created' | 'exited';
  title: string;
  cwd: string;
  exitCode?: number;
  at: number;
}

interface ServiceInfoLike {
  name: string;
  status: string;
  port: number | null;
  url: string | null;
}

interface McpInvocationLike {
  server: string;
  tool: string;
  durationMs: number;
  resultChars: number;
  resultItems: number;
  ok: boolean;
}

/** Ambient facts the builder cannot derive from an {@link AgentEvent} alone. */
export interface BuilderContext {
  workspaceIdFor(sessionId: string): string | null;
  /**
   * The provider for a run that is starting NOW. Read once per run and cached
   * on the run's state — reading it per node stamped every node with whatever
   * model was selected at the time it was built, so switching models mid-session
   * silently relabelled the run's history and made `nodeColoring: 'provider'` lie.
   */
  provider(): 'anthropic' | 'cursor';
  /** Composer permission mode of the run's OWN session, not the foreground one. */
  mode(sessionId: string): string;
  /** Currently selected model id, for the objective node's metadata. */
  model(): string;
  /** Whether a node kind's source overlay is enabled in settings. */
  overlayEnabled(kind: WorkGraphNodeKind): boolean;
  /**
   * The next free `seq` for a session, read from what is already persisted.
   * Without this the counter would restart at 0 after an app restart and
   * collide with existing rows — which, since `seq` IS the structural order,
   * would interleave a new run into the middle of the old history.
   */
  initialSeq(sessionId: string): number;
}

/** What one `ingest()` call produced. Empty arrays are the common case. */
export interface BuildResult {
  nodes: WorkGraphNode[];
  edges: WorkGraphEdge[];
}

const EMPTY: BuildResult = { nodes: [], edges: [] };

/**
 * Nodes kept in the per-session reconstruction cache.
 *
 * This map only exists so a late `tool-end` can patch the node its `tool-start`
 * created, which is a window of seconds — but nothing ever removed entries, so
 * every node ever built stayed resident for the whole process lifetime. The DB
 * is ring-capped for exactly this reason; the in-memory mirror now matches.
 */
const NODE_CACHE_MAX = 2_000;

/** In-flight internal MCP calls tracked for enrichment; bounded by concurrency. */
const OPEN_MCP_MAX = 64;

/** Permission decisions held waiting for their tool call. */
const PENDING_APPROVALS_MAX = 32;

/** One resolved permission gate, from the provider-neutral decision core. */
export interface PermissionDecisionSignal {
  tool: string;
  summary: string;
  detail?: string;
  risk: string;
  decision: 'allow' | 'deny';
  /** False when the user was actually asked (the only approvals worth a node). */
  auto: boolean;
  at: number;
}

/** Evict oldest-first once the cache exceeds its bound (Maps keep insertion order). */
function trimNodeCache(s: SessionState): void {
  if (s.nodes.size <= NODE_CACHE_MAX) return;
  const excess = s.nodes.size - NODE_CACHE_MAX;
  let dropped = 0;
  for (const key of s.nodes.keys()) {
    s.nodes.delete(key);
    dropped += 1;
    if (dropped >= excess) break;
  }
}

/**
 * Per-session builder state. Kept in memory only: it is a reconstruction cache
 * for the CURRENT run, not a second source of truth. Losing it (restart) costs
 * nothing — persisted nodes are already complete.
 */
interface SessionState {
  /** The active run's objective node id; null between runs. */
  runId: string | null;
  /**
   * The provider that owns the CURRENT run, captured when the run opens. Every
   * node in the run is stamped from here, so the run's history stays internally
   * consistent even if the user picks a different model while it is streaming.
   */
  provider: 'anthropic' | 'cursor';
  /** The last node on the structural spine, which the next node `follows`. */
  spineTip: string | null;
  /** tool-call id -> node id, so `tool-end` patches the right node. */
  byCallId: Map<string, string>;
  /**
   * Long-lived entity key -> node id, for things that OUTLIVE a single run:
   * PTY terminals and supervised services. Deliberately separate from
   * `byCallId`, which is reset on every new user turn — a service started
   * before a prompt must patch its existing node afterwards, not gain a
   * duplicate one.
   */
  byEntityKey: Map<string, string>;
  /** The node payloads we produced this run, so `tool-end` can upsert them. */
  nodes: Map<string, WorkGraphNode>;
  /** TaskItem.id -> node id, so a `tasks` event patches instead of duplicating. */
  byTaskId: Map<string, string>;
  /** `${runId}:${path}` -> node id, so one file touched twice is one node. */
  byFileKey: Map<string, string>;
  /**
   * Node ids of in-flight search/memory/MCP calls, newest last. Internal-MCP
   * enrichment used to linearly scan every node ever built for the session on
   * EVERY `limboo_*` call; this is the same lookup over a list that is bounded
   * by concurrency rather than by session length.
   */
  openMcp: string[];
  /**
   * Permission decisions awaiting the tool call they gated. The gate resolves
   * BEFORE the tool node exists, so the `reviewed-by` link is drawn when the
   * matching `tool-start` arrives. Keyed by tool name, bounded.
   */
  pendingApprovals: Map<string, { nodeId: string; decision: 'allow' | 'deny' }>;
  /** The planning node for this run, if a plan was captured. */
  planNodeId: string | null;
  /** Monotonic per-session ordering counter (survives across runs). */
  seq: number;
  /** Counters for the completion node's summary. */
  toolCount: number;
  fileCount: number;
  runStartedAt: number;
}

function freshState(provider: 'anthropic' | 'cursor'): SessionState {
  return {
    runId: null,
    provider,
    spineTip: null,
    byCallId: new Map(),
    byEntityKey: new Map(),
    nodes: new Map(),
    byTaskId: new Map(),
    byFileKey: new Map(),
    openMcp: [],
    pendingApprovals: new Map(),
    planNodeId: null,
    seq: 0,
    toolCount: 0,
    fileCount: 0,
    runStartedAt: 0,
  };
}

/**
 * Which node kind a tool call becomes. Tool names are already Claude-shaped for
 * both providers (see the file header), so this one table is provider-neutral.
 */
export function nodeKindForTool(call: AgentToolCall): WorkGraphNodeKind {
  const name = call.name;
  // Both spellings: Claude Code renamed `Task` to `Agent` in v2.1.63 and current
  // SDK releases emit `Agent` in tool_use blocks. Testing only `Task` here made
  // the `subagent` node kind unreachable on every current release — subagent
  // work landed as `investigation`/`command` nodes on the main spine instead.
  if (isSubagentTool(name)) return 'subagent';
  if (name.startsWith('mcp__limboo_search__')) return 'search';
  if (name.startsWith('mcp__limboo_memory__')) return 'memory';
  if (name.startsWith('mcp__')) return 'mcp';
  if (name === 'Bash' || name === 'BashOutput' || name === 'KillShell') return 'terminal';
  if (call.change) return 'file';
  if (call.risk === 'write') return 'file';
  return 'investigation';
}

/** Split an `mcp__<server>__<tool>` name into its parts. */
function splitMcpName(name: string): { server: string; tool: string } {
  const parts = name.split('__');
  return { server: parts[1] ?? 'unknown', tool: parts.slice(2).join('__') || 'unknown' };
}

/** Map a tool-call status onto a node status. */
function statusForTool(status: AgentToolCall['status']): WorkGraphNodeStatus {
  if (status === 'running') return 'running';
  if (status === 'denied') return 'denied';
  if (status === 'error') return 'error';
  return 'done';
}

export class WorkGraphBuilder {
  private readonly sessions = new Map<string, SessionState>();

  constructor(private readonly ctx: BuilderContext) {}

  /** Drop a session's in-memory reconstruction cache (cleared / purged / trashed). */
  forget(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Drop every session's cache (settings turned the graph off, or app quit). */
  reset(): void {
    this.sessions.clear();
  }

  /**
   * Fold one agent event into the graph. Returns only what CHANGED, so the
   * caller can push a delta rather than a snapshot. Never throws — a malformed
   * event yields an empty result rather than breaking the run that produced it.
   */
  ingest(event: AgentEvent): BuildResult {
    try {
      return this.dispatch(event);
    } catch {
      return EMPTY;
    }
  }

  /* ---- platform-service ingestion ------------------------------------ */
  /*                                                                      */
  /* These come from Limboo's own subsystems rather than an agent adapter, */
  /* so their nodes carry `provider: 'limboo'`. They attach to the current */
  /* run when one is open, and stand alone when the user acted outside a   */
  /* run (committing from the Git panel, running a service by hand).       */

  /**
   * Commits reconciled from `git log`. Placed in the right-hand gutter by the
   * layouter, aligned to the work that produced them, so they never perturb
   * lane assignment.
   */
  addCommits(sessionId: string, commits: GitCommitLike[]): BuildResult {
    const s = this.stateFor(sessionId);
    const out: BuildResult = { nodes: [], edges: [] };
    for (const c of commits) {
      const node = this.mkLimbooNode(s, sessionId, 'git', c.subject, c.at, {
        op: 'commit' as const,
        hash: c.hash,
        files: [],
        adds: 0,
        dels: 0,
      }, { detail: c.body, ref: { kind: 'commit', id: c.hash }, endedAt: c.at });
      out.nodes.push(node);
      if (s.runId) {
        out.edges.push(this.mkEdge(sessionId, s.runId, node.id, 'produced-artifact', false, c.at));
      }
      // Every file this run touched is implemented in this commit. Exact, not
      // inferred: these are the files the run itself reported changing.
      //
      // Only for the run's OWN commits, though. A `git pull` that brings in
      // twenty upstream commits by other authors would otherwise claim this
      // run's files were implemented in every one of them — and the fan-out is
      // files × commits, which is also how a single reconcile produced
      // thousands of edges in one delta.
      if (s.runId && c.at >= s.runStartedAt) {
        for (const fileNodeId of s.byFileKey.values()) {
          out.edges.push(this.mkEdge(sessionId, fileNodeId, node.id, 'implemented-in', false, c.at));
        }
      }
    }
    return out;
  }

  /**
   * A non-commit git operation: push, pull, fetch, checkout, branch, tag, init.
   *
   * Commits arrive by reconciling `git log`, which by definition only sees new
   * commits — so six of the nine declared `git.op` values were unreachable and
   * a push or a branch left no trace at all. These come from the ops themselves.
   */
  addGitOp(sessionId: string, op: GitOpKind, detail: GitOpDetail): BuildResult {
    const s = this.stateFor(sessionId);
    const at = Date.now();
    const node = this.mkLimbooNode(s, sessionId, 'git', gitOpTitle(op, detail), at, {
      op,
      branch: detail.branch,
      // The remote NAME only. A remote URL can carry embedded credentials, and
      // this string is persisted and broadcast (CLAUDE.md §8).
      remote: detail.remote,
      files: [],
      adds: 0,
      dels: 0,
    }, { detail: detail.summary, endedAt: at });

    const out: BuildResult = { nodes: [node], edges: [] };
    // Publishing work is an artifact of the run; moving between refs is part of
    // the run's own sequence.
    if (s.runId) {
      const kind = op === 'push' || op === 'tag' ? 'produced-artifact' : 'generated';
      out.edges.push(this.mkEdge(sessionId, s.runId, node.id, kind, false, at));
    }
    return out;
  }

  /** A session's dedicated worktree appearing or being torn down. */
  addWorktreeOp(sessionId: string, op: 'created' | 'removed', branch: string | null): BuildResult {
    const s = this.stateFor(sessionId);
    const at = Date.now();
    const label = branch ? `${op === 'created' ? 'Created' : 'Removed'} worktree ${branch}` :
      `${op === 'created' ? 'Created' : 'Removed'} worktree`;
    const node = this.mkLimbooNode(s, sessionId, 'git', label, at, {
      op: op === 'created' ? ('worktree-created' as const) : ('worktree-removed' as const),
      branch: branch ?? undefined,
      files: [],
      adds: 0,
      dels: 0,
    }, { endedAt: at, ref: branch ? { kind: 'worktree', id: branch } : undefined });
    return { nodes: [node], edges: [] };
  }

  /**
   * A repository delta the Resume Pipeline computed while the session was away.
   * Modeled as an artifact the NEXT objective depends on, because that is
   * exactly what it is: context injected into the run before the prompt.
   */
  addResumeDelta(
    sessionId: string,
    summary: string,
    detail: string | undefined,
    files: number,
  ): BuildResult {
    const s = this.stateFor(sessionId);
    const at = Date.now();
    const node = this.mkLimbooNode(s, sessionId, 'artifact', summary, at, {
      artifactKind: 'diff' as const,
      fileCount: files,
    }, { detail, endedAt: at });
    const out: BuildResult = { nodes: [node], edges: [] };
    if (s.runId) {
      out.edges.push(this.mkEdge(sessionId, node.id, s.runId, 'depends-on', false, at));
    }
    return out;
  }

  /** A file the user attached — an input to the run, not something it produced. */
  addAttachment(sessionId: string, name: string, bytes: number, mime?: string): BuildResult {
    const s = this.stateFor(sessionId);
    const at = Date.now();
    const node = this.mkLimbooNode(s, sessionId, 'artifact', name, at, {
      artifactKind: 'attachment' as const,
      bytes,
      mime,
    }, { endedAt: at, ref: { kind: 'attachment', id: name } });
    const out: BuildResult = { nodes: [node], edges: [] };
    if (s.runId) {
      out.edges.push(this.mkEdge(sessionId, node.id, s.runId, 'depends-on', false, at));
    }
    return out;
  }

  /** A checkpoint created, restored, or deleted. */
  addCheckpoint(sessionId: string, cp: GitCheckpointLike, op: GitOp): BuildResult {
    const s = this.stateFor(sessionId);
    const out: BuildResult = { nodes: [], edges: [] };
    const at = op === 'create' ? cp.createdAt : Date.now();
    const node = this.mkLimbooNode(s, sessionId, 'git', `${opLabel(op)}: ${cp.label}`, at, {
      // `delete` is its own op. Recording it as `checkpoint` made the queryable
      // field contradict the node's own title ("Deleted checkpoint…").
      op:
        op === 'create'
          ? ('checkpoint' as const)
          : op === 'restore'
            ? ('restore' as const)
            : ('checkpoint-deleted' as const),
      hash: cp.commit,
      checkpointId: cp.id,
      files: [],
      adds: 0,
      dels: 0,
    }, { detail: `${cp.files.length} file(s)`, ref: { kind: 'checkpoint', id: cp.id }, endedAt: at });
    out.nodes.push(node);
    if (s.runId) {
      out.edges.push(this.mkEdge(sessionId, s.runId, node.id, 'produced-artifact', false, at));
    }
    return out;
  }

  /** A real PTY (user / hook / service) — these DO have genuine exit codes. */
  addTerminal(ev: TerminalSignalLike): BuildResult {
    if (!ev.sessionId) return EMPTY;
    const s = this.stateFor(ev.sessionId);
    const key = `term:${ev.terminalId}`;
    const existingId = s.byEntityKey.get(key);

    if (ev.phase === 'created') {
      if (existingId) return EMPTY;
      const node = this.mkLimbooNode(s, ev.sessionId, 'terminal', ev.title, ev.at, {
        command: cleanRequired(ev.title, GRAPH_LIMITS.detailMax),
        origin: ev.origin,
        terminalId: ev.terminalId,
      }, { status: 'running', detail: ev.cwd, ref: { kind: 'terminal', id: ev.terminalId } });
      s.byEntityKey.set(key, node.id);
      return { nodes: [node], edges: [] };
    }

    if (!existingId) return EMPTY;
    const existing = s.nodes.get(existingId);
    if (!existing || existing.kind !== 'terminal') return EMPTY;
    const patched: WorkGraphNode = {
      ...existing,
      status: ev.exitCode === 0 ? 'done' : 'error',
      endedAt: ev.at,
      meta: {
        ...existing.meta,
        // A real exit code, unlike an agent command's — record it as fact.
        exitCode: ev.exitCode,
        durationMs: ev.at - existing.startedAt,
      },
    };
    s.nodes.set(existingId, patched);
    return { nodes: [patched], edges: [] };
  }

  /** Which remembered decisions were retrieved for this run, and at what rank. */
  addMemoryRetrieval(sessionId: string, hits: MemoryHitSignal[]): BuildResult {
    if (hits.length === 0) return EMPTY;
    const s = this.stateFor(sessionId);
    if (!s.runId) return EMPTY;
    const at = Date.now();
    const node = this.mkLimbooNode(s, sessionId, 'memory', `Recalled ${hits.length} memory item(s)`, at, {
      op: 'retrieve' as const,
      memoryIds: hits.map((h) => h.id),
      tiers: hits.map((h) => h.tier),
      scores: hits.map((h) => Math.round(h.score * 1000) / 1000),
    }, {
      endedAt: at,
      detail: hits.map((h) => h.title).join(' · '),
      ref: { kind: 'memory', id: hits[0].id },
    });
    return {
      nodes: [node],
      // The recalled knowledge is a prerequisite of the run, not its output.
      edges: [this.mkEdge(sessionId, node.id, s.runId, 'depends-on', false, at)],
    };
  }

  /** A memory created or a proposal accepted during this session. */
  addMemoryWrite(
    sessionId: string,
    op: 'create' | 'accept',
    memory: { id: string; title: string },
  ): BuildResult {
    const s = this.stateFor(sessionId);
    const at = Date.now();
    const node = this.mkLimbooNode(s, sessionId, 'memory', memory.title, at, {
      op,
      memoryIds: [memory.id],
      tiers: [],
    }, { endedAt: at, ref: { kind: 'memory', id: memory.id } });
    const out: BuildResult = { nodes: [node], edges: [] };
    if (s.runId) {
      out.edges.push(this.mkEdge(sessionId, s.runId, node.id, 'generated', false, at));
    }
    return out;
  }

  /** File writes Limboo made itself (the File Writer), not the agent's tools. */
  addFileWrites(sessionId: string, paths: string[]): BuildResult {
    const s = this.stateFor(sessionId);
    if (!s.runId) return EMPTY;
    const out: BuildResult = { nodes: [], edges: [] };
    const at = Date.now();
    for (const path of paths.slice(0, MAX_FILES_PER_MUTATION)) {
      this.emitFileNode(
        s,
        sessionId,
        { path, status: 'modified', adds: 0, dels: 0 },
        at,
        out,
        null,
        undefined,
      );
    }
    return out;
  }

  /** Supervised services — one node per service, patched as its state advances. */
  addServices(sessionId: string, services: ServiceInfoLike[]): BuildResult {
    const s = this.stateFor(sessionId);
    const out: BuildResult = { nodes: [], edges: [] };
    const at = Date.now();
    for (const svc of services) {
      const key = `svc:${svc.name}`;
      const existingId = s.byEntityKey.get(key);
      const status: WorkGraphNodeStatus =
        svc.status === 'running' || svc.status === 'starting'
          ? 'running'
          : svc.status === 'crashed'
            ? 'error'
            : 'done';

      if (existingId) {
        const existing = s.nodes.get(existingId);
        if (!existing || existing.kind !== 'service') continue;
        // Only push a node when something visible actually changed.
        if (
          existing.status === status &&
          (existing.meta as { state: string }).state === svc.status
        ) {
          continue;
        }
        const patched: WorkGraphNode = {
          ...existing,
          status,
          endedAt: status === 'running' ? undefined : at,
          meta: {
            ...existing.meta,
            state: svc.status,
            port: svc.port ?? undefined,
            url: svc.url ?? undefined,
          },
        };
        s.nodes.set(existingId, patched);
        out.nodes.push(patched);
        continue;
      }

      const node = this.mkLimbooNode(s, sessionId, 'service', svc.name, at, {
        name: svc.name,
        state: svc.status,
        port: svc.port ?? undefined,
        url: svc.url ?? undefined,
      }, { status, ref: { kind: 'service', id: svc.name } });
      s.byEntityKey.set(key, node.id);
      out.nodes.push(node);
      if (s.runId) {
        out.edges.push(this.mkEdge(sessionId, s.runId, node.id, 'generated', false, at));
      }
    }
    return out;
  }

  /**
   * Enrich an internal MCP node the primary event path already created with the
   * real duration the transport measured. Deliberately does NOT create a node:
   * `mcp__limboo_*` calls already arrive as `tool-start`/`tool-end`, and adding
   * one here would double-count every search and memory lookup.
   */
  enrichInternalMcp(sessionId: string, invocation: McpInvocationLike): BuildResult {
    const s = this.stateFor(sessionId);
    // The server decides which node kind to look for. Matching on the tool name
    // alone was wrong twice over: `endsWith` cross-attributed any two tools
    // sharing a name suffix, and `memory` nodes carry no `tool` field at all,
    // so a memory call could never be enriched.
    const wantKind: WorkGraphNodeKind =
      invocation.server === 'limboo_search'
        ? 'search'
        : invocation.server === 'limboo_memory'
          ? 'memory'
          : 'mcp';

    let target: WorkGraphNode | undefined;
    for (let i = s.openMcp.length - 1; i >= 0; i -= 1) {
      const node = s.nodes.get(s.openMcp[i]);
      if (!node || node.status !== 'running' || node.kind !== wantKind) continue;
      const tool = (node.meta as { tool?: string }).tool;
      // For a kind-unique server the newest open call is the right one; when a
      // tool name IS recorded, require an exact segment match.
      if (tool && tool !== invocation.tool && !tool.endsWith(`__${invocation.tool}`)) continue;
      target = node;
      break;
    }
    if (!target) return EMPTY;

    // `resultChars` and `ok` were measured by the transport and then thrown
    // away, leaving `search.hitCount` permanently unset and a failed internal
    // call indistinguishable from a successful one.
    const sizing = target.kind === 'search' ? { hitCount: invocation.resultItems } : {};
    const patched: WorkGraphNode = {
      ...target,
      status: invocation.ok ? target.status : 'error',
      meta: { ...target.meta, ...sizing, durationMs: invocation.durationMs },
    } as WorkGraphNode;
    s.nodes.set(patched.id, patched);
    return { nodes: [patched], edges: [] };
  }

  /** A node originating from Limboo itself rather than an agent adapter. */
  private mkLimbooNode(
    s: SessionState,
    sessionId: string,
    kind: WorkGraphNodeKind,
    title: string,
    at: number,
    meta: unknown,
    opts: NodeOpts = {},
  ): WorkGraphNode {
    const node = this.mkNode(s, sessionId, kind, title, at, meta, opts);
    const tagged = { ...node, provider: 'limboo' as const };
    s.nodes.set(tagged.id, tagged);
    return tagged;
  }

  /* ------------------------------------------------------------------ */

  private dispatch(event: AgentEvent): BuildResult {
    // `diagnostic` is the only variant without a top-level sessionId, and it is
    // a capability-level signal (auth, rate limit) rather than work — skip it.
    if (event.kind === 'diagnostic' || event.kind === 'request-state') return EMPTY;

    const s = this.stateFor(event.sessionId);

    switch (event.kind) {
      case 'message-done':
        // A user turn opens a run. Assistant turns are prose, not structure.
        return event.message.role === 'user' ? this.onObjective(s, event.message) : EMPTY;
      case 'plan':
        return this.onPlan(s, event.sessionId, event.plan);
      case 'tasks':
        return this.onTasks(s, event.sessionId, event.tasks);
      case 'tool-start':
        return this.onToolStart(s, event.call);
      case 'tool-end':
        return this.onToolEnd(s, event.callId, event.status);
      case 'file-change':
        return this.onFileChange(s, event.sessionId, event.change);
      // `activity` rows are deliberately NOT ingested. Permission rows used to
      // become approval nodes by string-matching a "Blocked…" label prefix,
      // which could not see the user's actual answer; they now arrive on the
      // dedicated decision path with the real decision, tool, and risk.
      case 'result':
        return this.onResult(s, event.sessionId, event.ok, undefined);
      case 'error':
        return this.onResult(s, event.sessionId, false, event.outcome);
      default:
        return EMPTY;
    }
  }

  private stateFor(sessionId: string): SessionState {
    let s = this.sessions.get(sessionId);
    if (!s) {
      s = freshState(this.ctx.provider());
      // Continue the persisted sequence rather than restarting at 0, so a new
      // run after a restart appends to the history instead of interleaving with it.
      s.seq = this.ctx.initialSeq(sessionId);
      this.sessions.set(sessionId, s);
    }
    return s;
  }

  /* ---- node/edge construction ---------------------------------------- */

  private mkNode(
    s: SessionState,
    sessionId: string,
    kind: WorkGraphNodeKind,
    title: string,
    at: number,
    meta: unknown,
    opts: NodeOpts = {},
  ): WorkGraphNode {
    const id = opts.id ?? `wg_${crypto.randomUUID()}`;
    const node = {
      id,
      sessionId,
      workspaceId: this.ctx.workspaceIdFor(sessionId),
      runId: opts.runId ?? s.runId ?? id,
      kind,
      provider: s.provider,
      status: opts.status ?? 'done',
      title: cleanRequired(title, GRAPH_LIMITS.titleMax),
      detail: clean(opts.detail, GRAPH_LIMITS.detailMax),
      ref: opts.ref,
      startedAt: at,
      endedAt: opts.endedAt,
      seq: s.seq++,
      meta,
    } as WorkGraphNode;
    s.nodes.set(id, node);
    trimNodeCache(s);
    return node;
  }

  private mkEdge(
    sessionId: string,
    src: string,
    dst: string,
    kind: WorkGraphEdgeKind,
    derived: boolean,
    at: number,
  ): WorkGraphEdge {
    return { id: `wge_${crypto.randomUUID()}`, sessionId, src, dst, kind, derived, createdAt: at };
  }

  /**
   * Append a node to the structural spine and advance the tip. `follows` is the
   * ONLY edge the lane layouter walks, so exactly one is emitted per node and
   * it always points forward in time — which is what makes the graph acyclic
   * by construction rather than by hope.
   */
  private appendToSpine(
    s: SessionState,
    node: WorkGraphNode,
    out: BuildResult,
    at: number,
  ): void {
    if (s.spineTip && s.spineTip !== node.id) {
      out.edges.push(this.mkEdge(node.sessionId, s.spineTip, node.id, 'follows', false, at));
    }
    s.spineTip = node.id;
  }

  /* ---- handlers ------------------------------------------------------- */

  /** A user turn opens a new run: the objective node is that run's root. */
  private onObjective(
    s: SessionState,
    message: {
      id: string;
      sessionId: string;
      text: string;
      createdAt: number;
      /** Already hydrated on the `message-done` event — no extra plumbing needed. */
      attachments?: unknown[];
    },
  ): BuildResult {
    const out: BuildResult = { nodes: [], edges: [] };
    const at = message.createdAt;
    const prevObjective = s.runId;

    // Reset the per-run caches, but keep `seq` and the spine so consecutive
    // runs read as one continuous session history (like a git branch).
    s.byCallId = new Map();
    s.byTaskId = new Map();
    s.byFileKey = new Map();
    s.planNodeId = null;
    s.toolCount = 0;
    s.fileCount = 0;
    s.runStartedAt = at;
    // Bind the provider to the run HERE, at the one moment it is unambiguous.
    s.provider = this.ctx.provider();

    const id = `wg_${crypto.randomUUID()}`;
    const node = this.mkNode(s, message.sessionId, 'objective', firstLine(message.text), at, {
      prompt: cleanRequired(message.text, GRAPH_LIMITS.detailMax),
      mode: this.ctx.mode(message.sessionId),
      model: this.ctx.model(),
      attachmentCount: message.attachments?.length ?? 0,
    }, {
      id,
      runId: id,
      status: 'running',
      detail: message.text,
      ref: { kind: 'message', id: message.id },
    });
    s.runId = id;
    out.nodes.push(node);

    // Chain runs together so a session reads as one lane from top to bottom.
    if (prevObjective) {
      out.edges.push(this.mkEdge(message.sessionId, prevObjective, id, 'follows', false, at));
    }
    s.spineTip = id;
    return out;
  }

  private onPlan(s: SessionState, sessionId: string, plan: SessionPlan): BuildResult {
    if (!s.runId) return EMPTY;
    const out: BuildResult = { nodes: [], edges: [] };
    const at = Date.now();

    // The planning node is created once, when the plan first becomes readable,
    // then patched in place as the plan advances through its lifecycle.
    if (!s.planNodeId && (isPlanBlocking(plan.status) || plan.status === 'implementing')) {
      const node = this.mkNode(s, sessionId, 'planning', plan.title || 'Implementation plan', at, {
        planTitle: cleanRequired(plan.title || 'Plan', GRAPH_LIMITS.titleMax),
        taskCount: plan.meta.taskCount ?? 0,
        affectedFiles: plan.meta.affectedFiles,
        risk: plan.meta.risk,
        planStatus: plan.status,
      }, { status: 'running', ref: { kind: 'plan', id: sessionId } });
      s.planNodeId = node.id;
      out.nodes.push(node);
      this.appendToSpine(s, node, out, at);
      out.edges.push(this.mkEdge(sessionId, s.runId, node.id, 'generated', false, at));

      // The plan markdown is a real artifact the run produced.
      const artifact = this.mkNode(s, sessionId, 'artifact', 'Plan document', at, {
        artifactKind: 'plan' as const,
        bytes: plan.markdown.length,
      }, { detail: firstLine(plan.markdown), ref: { kind: 'plan', id: sessionId } });
      out.nodes.push(artifact);
      out.edges.push(
        this.mkEdge(sessionId, node.id, artifact.id, 'produced-artifact', false, at),
      );
      return out;
    }

    if (!s.planNodeId) return EMPTY;
    const existing = s.nodes.get(s.planNodeId);
    if (!existing || existing.kind !== 'planning') return EMPTY;

    // Patch the planning node's lifecycle in place (an upsert, not a new node).
    const patched: WorkGraphNode = {
      ...existing,
      // 'archived' joins 'rejected' as a terminal non-success. They are drawn
      // the same way but MEAN different things — a human declined vs something
      // else ended it — which is why `endReason` rides in the meta below.
      status: settledPlanStatus(plan.status) ?? 'running',
      endedAt: settledPlanStatus(plan.status) ? at : existing.endedAt,
      meta: {
        ...existing.meta,
        planStatus: plan.status,
        taskCount: plan.meta.taskCount ?? 0,
        ...(plan.meta.endReason ? { planEndReason: plan.meta.endReason } : {}),
      },
    };
    s.nodes.set(patched.id, patched);
    out.nodes.push(patched);

    // An approve/reject is a real HUMAN decision — a first-class approval node.
    // 'archived' is deliberately excluded: a run that errored or a plan the
    // shutdown ended is not a verdict, and recording it as one would put a
    // decision in the audit trail that nobody made.
    if (plan.status === 'approved' || plan.status === 'rejected') {
      const decided = plan.status === 'rejected' ? 'deny' : 'allow';
      const approval = this.mkNode(s, sessionId, 'approval', `Plan ${decided === 'deny' ? 'rejected' : 'approved'}`, at, {
        subject: 'plan' as const,
        decision: decided as 'allow' | 'deny',
        auto: false,
      }, { status: decided === 'deny' ? 'denied' : 'done', endedAt: at, ref: { kind: 'plan', id: sessionId } });
      out.nodes.push(approval);
      out.edges.push(this.mkEdge(sessionId, patched.id, approval.id, 'reviewed-by', false, at));
      if (decided === 'deny' && s.runId) {
        out.edges.push(this.mkEdge(sessionId, s.runId, approval.id, 'blocked-by', false, at));
      }
    }
    return out;
  }

  /**
   * TodoWrite checklist items. Each becomes a task node once; later `tasks`
   * events patch status rather than appending duplicates (TodoWrite re-sends
   * the whole list on every change).
   */
  private onTasks(s: SessionState, sessionId: string, tasks: TaskItem[]): BuildResult {
    if (!s.runId) return EMPTY;
    const out: BuildResult = { nodes: [], edges: [] };
    const at = Date.now();
    const parent = s.planNodeId ?? s.runId;
    let prevTaskNodeId: string | null = null;

    tasks.forEach((task, index) => {
      const status: WorkGraphNodeStatus =
        task.status === 'completed' || task.done
          ? 'done'
          : task.status === 'in_progress'
            ? 'running'
            : 'skipped';
      const existingId = s.byTaskId.get(task.id);

      if (existingId) {
        const existing = s.nodes.get(existingId);
        if (existing && existing.kind === 'task' && existing.status !== status) {
          const patched: WorkGraphNode = {
            ...existing,
            status,
            endedAt: status === 'done' ? at : existing.endedAt,
            meta: { ...existing.meta, taskStatus: task.status ?? (task.done ? 'completed' : 'pending') },
          };
          s.nodes.set(patched.id, patched);
          out.nodes.push(patched);
        }
        prevTaskNodeId = existingId;
        return;
      }

      const node = this.mkNode(s, sessionId, 'task', task.label, at, {
        label: cleanRequired(task.label, GRAPH_LIMITS.titleMax),
        taskStatus: task.status ?? (task.done ? 'completed' : 'pending'),
        index,
      }, { status });
      s.byTaskId.set(task.id, node.id);
      out.nodes.push(node);
      out.edges.push(this.mkEdge(sessionId, parent, node.id, 'generated', false, at));
      // TodoWrite ordering is the ONLY dependency signal a provider gives us,
      // and it is ordering, not a declared dependency — hence derived: true.
      if (prevTaskNodeId) {
        out.edges.push(this.mkEdge(sessionId, prevTaskNodeId, node.id, 'depends-on', true, at));
      }
      prevTaskNodeId = node.id;
    });

    return out;
  }

  private onToolStart(s: SessionState, call: AgentToolCall): BuildResult {
    if (!s.runId) return EMPTY;
    const kind = nodeKindForTool(call);
    if (!this.ctx.overlayEnabled(kind)) return EMPTY;

    const out: BuildResult = { nodes: [], edges: [] };
    const at = call.startedAt;
    s.toolCount += 1;

    // Claim the gate decision that let this call through, if the user was asked.
    const approval = s.pendingApprovals.get(call.name);
    if (approval) s.pendingApprovals.delete(call.name);

    const meta = this.toolMeta(kind, call);
    if (approval && kind === 'terminal') {
      (meta as { approval?: string }).approval = approval.decision;
    }
    const node = this.mkNode(s, call.sessionId, kind, call.summary, at, meta, {
      status: 'running',
      detail: call.detail ?? call.target,
      ref: { kind: 'tool', id: call.id },
    });
    s.byCallId.set(call.id, node.id);
    if (approval) {
      out.edges.push(
        this.mkEdge(call.sessionId, node.id, approval.nodeId, 'reviewed-by', false, at),
      );
    }
    out.nodes.push(node);
    if (kind === 'search' || kind === 'memory' || kind === 'mcp') {
      s.openMcp.push(node.id);
      if (s.openMcp.length > OPEN_MCP_MAX) s.openMcp.shift();
    }

    // A subagent's work belongs INSIDE the subagent, not after it on the main
    // spine. `parentCallId` is the Claude SDK's `parent_tool_use_id`, set on
    // every message originating in a subagent's context; without it every child
    // tool call was indistinguishable from a parent one, which is why the
    // `contains` edge kind existed but was never emitted by anything.
    const parentNodeId = call.parentCallId ? s.byCallId.get(call.parentCallId) : undefined;
    if (parentNodeId && parentNodeId !== node.id) {
      out.edges.push(this.mkEdge(call.sessionId, parentNodeId, node.id, 'contains', false, at));
      this.bumpChildCount(s, parentNodeId, out);
    } else {
      this.appendToSpine(s, node, out, at);
    }

    // A write tool that reports a concrete change also produces a file node —
    // the durable record of WHAT the run touched, independent of which tool did it.
    if (call.change && kind !== 'file' && this.ctx.overlayEnabled('file')) {
      this.emitFileNode(s, call.sessionId, call.change, at, out, node.id, call.name);
    } else if (kind === 'file' && call.change) {
      // The write tool IS the file node here, so there is no producer edge to
      // draw — but the objective still implements this change, and that edge is
      // what answers "which request produced this file?" without the transcript.
      s.fileCount += 1;
      s.byFileKey.set(`${s.runId}:${call.change.path}`, node.id);
      out.edges.push(this.mkEdge(call.sessionId, s.runId, node.id, 'implemented-in', false, at));
    }
    return out;
  }

  private toolMeta(kind: WorkGraphNodeKind, call: AgentToolCall): unknown {
    switch (kind) {
      case 'subagent':
        return {
          toolName: call.name,
          childCount: 0,
          subagentType: clean(call.subagent?.type, GRAPH_LIMITS.textMax),
        };
      case 'search':
        return { tool: call.name, query: clean(call.target, GRAPH_LIMITS.textMax) };
      case 'memory':
        return { op: 'use' as const, memoryIds: [], tiers: [] };
      case 'mcp': {
        const { server, tool } = splitMcpName(call.name);
        return {
          server,
          tool,
          internal: false,
          params: clean(call.detail ?? call.target, GRAPH_LIMITS.textMax),
        };
      }
      case 'terminal':
        // exitCode is deliberately absent: the Agent SDK does not stream tool
        // stdout, so an agent command resolves to done/error and nothing more.
        return {
          command: cleanRequired(call.detail ?? call.summary, GRAPH_LIMITS.detailMax),
          origin: 'agent' as const,
        };
      case 'file':
        return {
          change: call.change ?? { path: call.target ?? '', status: 'modified', adds: 0, dels: 0 },
          tool: call.name,
          hasPreview: !!call.edit,
        };
      default:
        return { tool: call.name, target: clean(call.target, GRAPH_LIMITS.textMax) };
    }
  }

  /** `tool-end` carries only the call id, so join through the per-run map. */
  private onToolEnd(
    s: SessionState,
    callId: string,
    status: AgentToolCall['status'],
  ): BuildResult {
    const nodeId = s.byCallId.get(callId);
    if (!nodeId) return EMPTY;
    const existing = s.nodes.get(nodeId);
    if (!existing) return EMPTY;

    const at = Date.now();
    const patched: WorkGraphNode = {
      ...existing,
      status: statusForTool(status),
      endedAt: at,
      meta:
        existing.kind === 'search' ||
        existing.kind === 'mcp' ||
        existing.kind === 'terminal' ||
        // A subagent's duration is the headline fact about a delegation — how
        // long the parent waited on it — so it is measured like the other
        // long-running kinds rather than left for a reader to subtract.
        existing.kind === 'subagent'
          ? { ...existing.meta, durationMs: at - existing.startedAt }
          : existing.meta,
    } as WorkGraphNode;
    s.nodes.set(nodeId, patched);
    // The call is settled; stop offering it to internal-MCP enrichment.
    const open = s.openMcp.indexOf(nodeId);
    if (open >= 0) s.openMcp.splice(open, 1);
    return { nodes: [patched], edges: [] };
  }

  /**
   * Advance a subagent node's child count as its children arrive. `childCount`
   * was declared and hardcoded to 0, which left the collapse affordance with
   * nothing to label and the inspector reporting "0 children" for a branch that
   * plainly had some.
   */
  private bumpChildCount(s: SessionState, parentNodeId: string, out: BuildResult): void {
    const parent = s.nodes.get(parentNodeId);
    if (!parent || parent.kind !== 'subagent') return;
    const patched: WorkGraphNode = {
      ...parent,
      meta: { ...parent.meta, childCount: parent.meta.childCount + 1 },
    };
    s.nodes.set(parentNodeId, patched);
    out.nodes.push(patched);
  }

  private onFileChange(s: SessionState, sessionId: string, change: FileChange): BuildResult {
    if (!s.runId || !this.ctx.overlayEnabled('file')) return EMPTY;
    const out: BuildResult = { nodes: [], edges: [] };
    this.emitFileNode(s, sessionId, change, Date.now(), out, null, undefined);
    return out;
  }

  /**
   * One file node per (run, path). A file touched three times in a run is one
   * vertex whose counts advance — otherwise the graph degenerates into a list.
   */
  private emitFileNode(
    s: SessionState,
    sessionId: string,
    change: FileChange,
    at: number,
    out: BuildResult,
    producerNodeId: string | null,
    tool: string | undefined,
  ): void {
    const key = `${s.runId}:${change.path}`;
    const existingId = s.byFileKey.get(key);
    if (existingId) {
      const existing = s.nodes.get(existingId);
      if (existing && existing.kind === 'file') {
        const patched: WorkGraphNode = {
          ...existing,
          endedAt: at,
          meta: { ...existing.meta, change },
        };
        s.nodes.set(patched.id, patched);
        out.nodes.push(patched);
      }
      if (producerNodeId) {
        out.edges.push(this.mkEdge(sessionId, producerNodeId, existingId, 'generated', false, at));
      }
      return;
    }

    const node = this.mkNode(s, sessionId, 'file', change.path, at, {
      change,
      tool,
      hasPreview: false,
    }, { status: 'done', endedAt: at, ref: { kind: 'file', id: change.path } });
    s.byFileKey.set(key, node.id);
    s.fileCount += 1;
    out.nodes.push(node);

    if (producerNodeId) {
      out.edges.push(this.mkEdge(sessionId, producerNodeId, node.id, 'generated', false, at));
    }
    // The objective is what this file implements — the edge that answers
    // "which request produced this change?" without reading the transcript.
    if (s.runId) {
      out.edges.push(this.mkEdge(sessionId, s.runId, node.id, 'implemented-in', false, at));
    }
  }

  /**
   * A permission gate resolved. Emitted from `AgentManager.decideToolUse`, the
   * provider-neutral decision core BOTH adapters call, so one implementation
   * records Claude's `canUseTool` and Cursor's hook bridge identically.
   *
   * Only DECISIONS worth recording become nodes: every denial, and every
   * approval the user was actually asked for. A silently auto-approved read is
   * already represented by its own tool node, and minting an approval node for
   * each one would bury the graph in thousands of rows that say nothing.
   */
  addPermissionDecision(sessionId: string, signal: PermissionDecisionSignal): BuildResult {
    const s = this.stateFor(sessionId);
    if (!s.runId) return EMPTY;
    const denied = signal.decision === 'deny';
    if (!denied && signal.auto) return EMPTY;

    const out: BuildResult = { nodes: [], edges: [] };
    const at = signal.at;
    const node = this.mkNode(s, sessionId, 'approval', signal.summary, at, {
      subject: 'tool' as const,
      // The user's ACTUAL answer, not an inference from a log line's wording.
      decision: signal.decision,
      tool: signal.tool,
      risk: signal.risk,
      auto: signal.auto,
    }, { status: denied ? 'denied' : 'done', endedAt: at, detail: signal.detail });
    out.nodes.push(node);

    // The gate fires BEFORE the tool node exists, so the link to the tool is
    // deferred: `onToolStart` claims it when the matching call arrives.
    s.pendingApprovals.set(signal.tool, { nodeId: node.id, decision: signal.decision });
    if (s.pendingApprovals.size > PENDING_APPROVALS_MAX) {
      const oldest = s.pendingApprovals.keys().next().value;
      if (oldest !== undefined) s.pendingApprovals.delete(oldest);
    }

    if (s.spineTip) {
      out.edges.push(this.mkEdge(sessionId, s.spineTip, node.id, 'reviewed-by', false, at));
    }
    // A denial blocks the work that asked for it. Drawing this from the run root
    // AND from the current task is what makes "every task blocked by X"
    // answerable — a `blocked-by` edge that only ever touched the objective
    // could never satisfy a task-scoped query.
    if (denied) {
      out.edges.push(this.mkEdge(sessionId, s.runId, node.id, 'blocked-by', false, at));
      const task = this.currentTaskNodeId(s);
      if (task) out.edges.push(this.mkEdge(sessionId, task, node.id, 'blocked-by', false, at));
    }
    return out;
  }

  /** The task currently in progress, if the run has a task list. */
  private currentTaskNodeId(s: SessionState): string | null {
    for (const nodeId of s.byTaskId.values()) {
      const node = s.nodes.get(nodeId);
      if (node?.kind === 'task' && node.status === 'running') return nodeId;
    }
    return null;
  }


  private onResult(
    s: SessionState,
    sessionId: string,
    ok: boolean,
    outcome: string | undefined,
  ): BuildResult {
    if (!s.runId) return EMPTY;
    const out: BuildResult = { nodes: [], edges: [] };
    const at = Date.now();

    const node = this.mkNode(s, sessionId, 'completion', ok ? 'Run completed' : 'Run failed', at, {
      ok,
      outcome,
      durationMs: s.runStartedAt ? at - s.runStartedAt : 0,
      toolCount: s.toolCount,
      fileCount: s.fileCount,
    }, { status: ok ? 'done' : 'error', endedAt: at });
    out.nodes.push(node);
    this.appendToSpine(s, node, out, at);

    // Close the objective so the panel stops rendering it as in-flight.
    const objective = s.nodes.get(s.runId);
    if (objective && objective.status === 'running') {
      const patched: WorkGraphNode = { ...objective, status: ok ? 'done' : 'error', endedAt: at };
      s.nodes.set(patched.id, patched);
      out.nodes.push(patched);
    }

    // Any tool still marked running was cut short by the run ending.
    for (const [, id] of s.byCallId) {
      const n = s.nodes.get(id);
      if (n && n.status === 'running') {
        const patched: WorkGraphNode = { ...n, status: 'skipped', endedAt: at };
        s.nodes.set(id, patched);
        out.nodes.push(patched);
      }
    }
    return out;
  }
}

/** First non-empty line, for a node title. */
function firstLine(text: string): string {
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t) return t;
  }
  return text.trim() || 'Untitled';
}
