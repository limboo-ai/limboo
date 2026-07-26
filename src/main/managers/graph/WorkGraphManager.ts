/**
 * Work Graph Manager — the Directed Acyclic Work Graph (DAWG).
 *
 * A provider-independent platform service OWNED BY THE APP, the fourth peer of
 * the Memory System, Search Engine, and Resume Pipeline. Neither Claude nor
 * Cursor exposes a work graph — both are conversation-driven — but both emit
 * enough structure (tool calls, plans, file edits, shell runs, MCP calls,
 * results) for the host to derive one. So this subsystem normalizes BOTH
 * adapters' event streams into a single typed, queryable graph of the work
 * itself, and every future adapter contributes nodes for free.
 *
 * DESIGN RULES:
 * - `AgentManager.onEvent()` is the ONLY load-bearing source. It is public,
 *   ungated, and provider-neutral, and listener throws are swallowed there, so
 *   this manager can never break a run.
 * - `HookEngine.subscribe()` is ENRICHMENT ONLY. It is gated on
 *   `settings.agent.hookEngine.enabled`, so a graph that depended on it would
 *   silently go blank when a user turns hooks off. The graph must be complete
 *   with hooks disabled — that is an explicit verification case.
 * - Ingestion short-circuits when `settings.graph.enabled` is false: zero rows,
 *   zero pushes, zero cost. `settings.graph.persist` false keeps the live graph
 *   but skips SQLite.
 * - Every push is a bounded DELTA, coalesced over `updateFrequency` ms, so a
 *   50-tool burst is one IPC message rather than fifty.
 */
import { BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import { IpcEvents } from '@shared/ipc-channels';
import { DEFAULT_SETTINGS, GRAPH_LIMITS, providerForModel } from '@shared/constants';
import type {
  AgentEvent,
  AppSettings,
  GitCheckpoint,
  GitCommit,
  ServiceInfo,
  Session,
  WorkGraphHealth,
  WorkGraphEdge,
  WorkGraphNode,
  WorkGraphNodeKind,
  WorkGraphPush,
  WorkGraphQuery,
  WorkGraphQueryResult,
  WorkGraphRef,
  WorkGraphSnapshot,
} from '@shared/types';
import { logger } from '../../logger';
import type { SettingsManager } from '../SettingsManager';
import type { SessionLifecycleSignal } from '../SessionManager';
import type { TerminalLifecycleSignal } from '../TerminalManager';
import {
  WorkGraphBuilder,
  type GitOp,
  type GitOpDetail,
  type GitOpKind,
  type MemoryHitSignal,
  type PermissionDecisionSignal,
} from './builder';
import { deriveFileDependencies, deriveVerifiedBy } from './derive';
import {
  FORMAT_EXTENSION,
  FORMAT_LABEL,
  exportGraph,
  type GraphDataFormat,
} from './exporters';
import type { McpInvocation } from './instrument';
import { WorkGraphQueryEngine } from './query';
import { redactSecrets } from './redact';
import { WorkGraphStore, type WorkGraphWriteResult } from './store';

/** Debounce for the git reconciler; a single op fires `notifyChanged` repeatedly. */
const GIT_RECONCILE_MS = 400;

/** Commits examined per reconcile pass. Bounded — this spawns a real `git log`. */
const GIT_LOG_LIMIT = 20;

/** Cap on the commit-dedupe set so a long session cannot grow it without bound. */
const SEEN_COMMITS_MAX = 500;

/** The narrow slice of AgentManager this manager subscribes to. */
export interface GraphAgentSource {
  onEvent(listener: (event: AgentEvent) => void): () => void;
}

/** The narrow slice of SessionManager this manager needs. */
export interface GraphSessionSource {
  getActive(): Session | null;
  /**
   * One session by id. Named `get` to MATCH `SessionManager` — a structural
   * interface that renames a method compiles fine and then throws at runtime
   * on every call, which is exactly what happened here: `getById` did not
   * exist, so every node build failed into the builder's own catch.
   */
  get(id: string): Session | null;
  onActiveChanged(cb: (session: Session | null) => void): () => void;
  onLifecycle(cb: (ev: SessionLifecycleSignal) => void): () => void;
}

/** The narrow slice of GitManager the commit reconciler needs. */
export interface GraphGitSource {
  log(workspaceId: string, opts?: { limit?: number; offset?: number }): Promise<GitCommit[]>;
}

/** The narrow slice of SearchManager the dependency inference needs. */
export interface GraphRefSource {
  /** Workspace-relative paths that `srcPath` imports. */
  importsOf(workspaceId: string, srcPath: string): string[];
}

/** Script names declared by the repo's own limboo.json, for `verified-by`. */
export interface GraphScriptSource {
  scriptNames(sessionId: string): string[];
}

/** Pending delta accumulated between flushes, keyed by session. */
interface Pending {
  nodes: Map<string, WorkGraphNode>;
  edges: Map<string, WorkGraphEdge>;
}

export class WorkGraphManager {
  private readonly store = new WorkGraphStore();
  private readonly queries = new WorkGraphQueryEngine();
  private readonly builder: WorkGraphBuilder;
  private readonly pending = new Map<string, Pending>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  /** Monotonic delta sequence per session; a gap makes the renderer refetch. */
  private readonly seq = new Map<string, number>();
  private readonly gitTimers = new Map<string, NodeJS.Timeout>();
  /**
   * Deferred derivation passes. Tracked (not fire-and-forget) so `dispose()`
   * can cancel them — an untracked timer could fire after `closeDb()` and throw
   * into a swallowing catch on every quit.
   */
  private readonly deriveTimers = new Map<string, NodeJS.Timeout>();
  /** Commit hashes already turned into nodes, so a reconcile never duplicates. */
  private seenCommits = new Set<string>();
  /** Per-session recording health; only present once something has gone wrong. */
  private readonly health = new Map<string, WorkGraphHealth>();
  private git?: GraphGitSource;
  private refs?: GraphRefSource;
  private scripts?: GraphScriptSource;
  private unsubscribe: Array<() => void> = [];

  constructor(
    private readonly settings: SettingsManager,
    private readonly sessions: GraphSessionSource,
  ) {
    this.builder = new WorkGraphBuilder({
      workspaceIdFor: (sessionId) => this.sessions.get(sessionId)?.workspaceId ?? null,
      provider: () => {
        try {
          return providerForModel(this.settings.getAll().agent.model);
        } catch {
          return 'anthropic';
        }
      },
      // Keyed on the EVENT's session, not the foreground one: a background run
      // used to be stamped with whatever mode the user happened to be looking at.
      mode: (sessionId) => this.sessions.get(sessionId)?.mode ?? 'default',
      model: () => {
        try {
          return this.settings.getAll().agent.model;
        } catch {
          return '';
        }
      },
      overlayEnabled: (kind) => this.overlayEnabled(kind),
      initialSeq: (sessionId) => this.store.maxSeq(sessionId),
    });
  }

  /** Wire the git reader used by the commit reconciler (setter injection). */
  setGitManager(git: GraphGitSource): void {
    this.git = git;
  }

  /**
   * Wire the Search Engine's real import graph, used to derive file-level
   * `depends-on` edges. Optional: without it, that inference is simply skipped
   * rather than guessed at.
   */
  setSearchManager(refs: GraphRefSource): void {
    this.refs = refs;
  }

  /**
   * Wire the repo's declared scripts, which are a stronger `verified-by` signal
   * than any builtin pattern — it is the project itself saying what
   * verification means for this codebase.
   */
  setScriptSource(scripts: GraphScriptSource): void {
    this.scripts = scripts;
  }

  /**
   * Subscribe to the event sources. Called from the composition root AFTER IPC
   * is registered, like every other `.start()`.
   */
  start(agent: GraphAgentSource): void {
    this.unsubscribe.push(agent.onEvent((event) => this.onAgentEvent(event)));
    this.unsubscribe.push(this.sessions.onLifecycle((ev) => this.onSessionLifecycle(ev)));
    // Flush the leaving session so a switch never strands a half-written delta.
    this.unsubscribe.push(
      this.sessions.onActiveChanged(() => {
        for (const sessionId of [...this.pending.keys()]) this.flush(sessionId);
      }),
    );
    // Turning the graph off must actually stop it. Without this the builder
    // cache and the pending timers survived, so the next scheduled flush still
    // wrote rows for a subsystem the user had disabled.
    this.unsubscribe.push(
      this.settings.onChange((next) => {
        if (next.graph.enabled) return;
        for (const t of this.timers.values()) clearTimeout(t);
        this.timers.clear();
        for (const t of this.deriveTimers.values()) clearTimeout(t);
        this.deriveTimers.clear();
        for (const t of this.gitTimers.values()) clearTimeout(t);
        this.gitTimers.clear();
        this.pending.clear();
        this.builder.reset();
      }),
    );
    logger.info('Work Graph started');
  }

  /** Flush everything and drop subscriptions. Called on quit. */
  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const t of this.gitTimers.values()) clearTimeout(t);
    this.gitTimers.clear();
    for (const t of this.deriveTimers.values()) clearTimeout(t);
    this.deriveTimers.clear();
    for (const sessionId of [...this.pending.keys()]) this.flush(sessionId);
    for (const off of this.unsubscribe) {
      try {
        off();
      } catch {
        /* a failed unsubscribe must not block quit */
      }
    }
    this.unsubscribe = [];
  }

  /* ---- reads (IPC surface) ------------------------------------------- */

  /** A session's persisted graph, for panel hydration. */
  getSnapshot(sessionId: string): WorkGraphSnapshot {
    const cfg = this.config();
    const base = this.store.snapshot(sessionId, cfg.maxNodes);
    const health = this.health.get(sessionId);
    return { ...base, seq: this.seq.get(sessionId) ?? 0, ...(health ? { health } : {}) };
  }

  /** One node plus every edge touching it, for the inspector. */
  getNodeDetail(
    sessionId: string,
    nodeId: string,
  ): { node: WorkGraphNode; edges: WorkGraphEdge[] } | null {
    const node = this.store.node(sessionId, nodeId);
    if (!node) return null;
    return { node, edges: this.store.edgesFor(sessionId, nodeId) };
  }

  /**
   * Run a structural query: an FTS seed set expanded by a BOUNDED closure over
   * the edge table. This is what makes the graph searchable by shape ("every
   * task blocked by authentication") rather than only by text.
   */
  query(sessionId: string, q: WorkGraphQuery): WorkGraphQueryResult {
    return this.queries.run(sessionId, q);
  }

  /**
   * Export the session's graph. Only the data formats live here — SVG and PNG
   * are produced in the renderer from the SVG it already drew, because
   * re-deriving the layout and palette in main would be a second implementation
   * guaranteed to drift.
   */
  export(sessionId: string, format: GraphDataFormat): string {
    const snap = this.store.snapshot(sessionId, this.config().maxNodes);
    const out = exportGraph(format, sessionId, snap.nodes, snap.edges, snap.truncated);
    // Bounded: this string crosses IPC by structured clone, and a large session
    // can render tens of megabytes. Callers that need the whole graph regardless
    // of size use `save()`, which streams it to a file instead.
    if (out.length > GRAPH_LIMITS.exportBytesMax) {
      throw new Error('graph: export exceeds the size limit — save it to a file instead');
    }
    return out;
  }

  /**
   * Write an export to a user-chosen file.
   *
   * This is the subsystem's ONLY filesystem write, so its shape matters: the
   * renderer supplies a session id and a format and NOTHING else. Main opens the
   * save dialog, main receives the path from the OS, main writes it. There is no
   * renderer-supplied path, therefore no traversal surface, no symlink check to
   * get wrong, and no way to reach a location the user did not pick themselves.
   *
   * `content` is provided only for the renderer-rendered visual formats (SVG,
   * PNG), which main cannot produce; it is size-capped like every other export.
   */
  async save(
    sessionId: string,
    format: GraphDataFormat | 'svg' | 'png',
    content?: string,
  ): Promise<{ saved: boolean; path?: string }> {
    let data: string;
    let encoding: BufferEncoding = 'utf8';
    if (format === 'svg' || format === 'png') {
      if (typeof content !== 'string' || content.length === 0) {
        throw new Error('graph: no image content to save');
      }
      if (content.length > GRAPH_LIMITS.exportBytesMax) {
        throw new Error('graph: image exceeds the size limit');
      }
      data = format === 'png' ? stripDataUrl(content) : content;
      if (format === 'png') encoding = 'base64';
    } else {
      const snap = this.store.snapshot(sessionId, this.config().maxNodes);
      data = exportGraph(format, sessionId, snap.nodes, snap.edges, snap.truncated);
    }

    const ext = FORMAT_EXTENSION[format];
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const opts = {
      title: 'Export work graph',
      defaultPath: `work-graph-${stampedName(sessionId)}.${ext}`,
      filters: [
        { name: FORMAT_LABEL[format], extensions: [ext] },
        { name: 'All files', extensions: ['*'] },
      ],
    };
    const result = win
      ? await dialog.showSaveDialog(win, opts)
      : await dialog.showSaveDialog(opts);
    // Cancelling is a normal outcome, not an error — the caller reports it as
    // "nothing saved" rather than showing a failure toast.
    if (result.canceled || !result.filePath) return { saved: false };

    await fs.writeFile(result.filePath, data, encoding);
    logger.info(`Work Graph exported to ${result.filePath} (${format}, ${data.length} bytes)`);
    return { saved: true, path: result.filePath };
  }

  /** Resolve an existing entity to its graph node — the reveal-in-graph lookup. */
  findByRef(sessionId: string, ref: WorkGraphRef): string | null {
    return this.store.findByRef(sessionId, ref);
  }

  /** Drop unattached nodes left by an interrupted run. Returns rows removed. */
  prune(sessionId: string): number {
    const removed = this.store.pruneOrphans(sessionId);
    if (removed > 0) this.broadcast({ kind: 'reset', sessionId });
    return removed;
  }

  /** Delete a session's graph (or every session's) and tell the renderer. */
  clear(sessionId?: string): void {
    this.store.clear(sessionId);
    if (sessionId) {
      this.builder.forget(sessionId);
      this.pending.delete(sessionId);
      this.seq.delete(sessionId);
      this.health.delete(sessionId);
    } else {
      this.builder.reset();
      this.pending.clear();
      this.seq.clear();
      this.health.clear();
    }
    // The dedupe set must reset too, or commits already turned into (now
    // deleted) nodes are never re-ingested and the cleared graph stays empty
    // of history that still exists in the repository.
    this.seenCommits.clear();
    this.broadcast({ kind: 'reset', sessionId: sessionId ?? null });
  }

  /** Age sweep, run from the existing hourly maintenance tick. */
  sweep(): void {
    const cfg = this.config();
    if (!cfg.enabled || !cfg.persist) return;
    const removed = this.store.pruneAge(cfg.retentionDays);
    if (removed > 0) {
      logger.info(`Work Graph swept ${removed} node(s) older than ${cfg.retentionDays}d`);
      this.broadcast({ kind: 'reset', sessionId: null });
    }
  }

  /* ---- platform-service sinks ----------------------------------------- */

  /**
   * The Git sink. `onGitChanged` is deliberately coarse — it fires on ANY
   * repository mutation — because that is the only signal that sees all three
   * commit paths (the Git panel, the agent's own `Bash("git commit")`, and an
   * external terminal). Reconciliation against `git log` therefore happens
   * HERE, debounced, rather than at nine per-method hooks that would each miss
   * two of the three.
   */
  gitSink(): {
    onGitChanged(workspaceId: string): void;
    onCheckpoint(sessionId: string, checkpoint: GitCheckpoint, op: GitOp): void;
    onGitOp(workspaceId: string, op: GitOpKind, detail: GitOpDetail): void;
  } {
    return {
      onGitChanged: (workspaceId) => this.scheduleGitReconcile(workspaceId),
      onCheckpoint: (sessionId, checkpoint, op) => {
        if (!this.enabled() || !this.settingsGraph().checkpointIntegration) return;
        this.ingestNode(sessionId, (b) => b.addCheckpoint(sessionId, checkpoint, op));
      },
      // Ops carry a workspace, not a session — the user pressed a button in the
      // Git panel. The active session in that workspace owns the node.
      onGitOp: (workspaceId, op, detail) => {
        if (!this.enabled() || !this.overlayEnabled('git')) return;
        const active = this.sessions.getActive();
        if (!active || active.workspaceId !== workspaceId) return;
        this.ingestNode(active.id, (b) => b.addGitOp(active.id, op, detail));
      },
    };
  }

  /** The Terminal sink — real PTYs, which (unlike agent commands) have exit codes. */
  terminalSink(): { onLifecycle(ev: TerminalLifecycleSignal): void } {
    return {
      onLifecycle: (ev) => {
        // Agent `Bash` calls already arrive through the primary event path as
        // terminal nodes; mirroring their PTY here would double-count them.
        if (!ev.sessionId || ev.origin === 'agent') return;
        if (!this.enabled() || !this.overlayEnabled('terminal')) return;
        this.ingestNode(ev.sessionId, (b) => b.addTerminal(ev));
      },
    };
  }

  /** The Memory sink — which remembered decisions shaped which run. */
  memorySink(): {
    onMemoryRetrieved(sessionId: string, hits: MemoryHitSignal[]): void;
    onMemoryWritten(op: 'create' | 'accept', memory: { id: string; title: string }): void;
  } {
    return {
      onMemoryRetrieved: (sessionId, hits) => {
        if (!this.enabled() || !this.overlayEnabled('memory')) return;
        this.ingestNode(sessionId, (b) => b.addMemoryRetrieval(sessionId, hits));
      },
      onMemoryWritten: (op, memory) => {
        const sessionId = this.sessions.getActive()?.id;
        if (!sessionId || !this.enabled() || !this.overlayEnabled('memory')) return;
        this.ingestNode(sessionId, (b) => b.addMemoryWrite(sessionId, op, memory));
      },
    };
  }

  /**
   * The File System sink. Only `writer`-sourced mutations are ingested:
   * `watcher` bursts fire for every build artifact and dependency install, and
   * folding those in would bury the actual work under noise.
   */
  fsSink(): {
    onWorkspaceMutation(workspaceId: string, paths: string[], source: 'watcher' | 'writer'): void;
  } {
    return {
      onWorkspaceMutation: (workspaceId, paths, source) => {
        if (source !== 'writer' || paths.length === 0) return;
        const active = this.sessions.getActive();
        if (!active || active.workspaceId !== workspaceId) return;
        if (!this.enabled() || !this.overlayEnabled('file')) return;
        this.ingestNode(active.id, (b) => b.addFileWrites(active.id, paths));
      },
    };
  }

  /** The Service sink — supervised process transitions. */
  serviceSink(): { onServicesChanged(sessionId: string, services: ServiceInfo[]): void } {
    return {
      onServicesChanged: (sessionId, services) => {
        if (!this.enabled() || !this.overlayEnabled('service')) return;
        this.ingestNode(sessionId, (b) => b.addServices(sessionId, services));
      },
    };
  }

  /**
   * The permission sink — the one gate both providers share.
   *
   * Wired to `AgentManager.decideToolUse`, which Claude's `canUseTool` callback
   * and the Cursor hooks bridge both call, so approvals are provider-neutral by
   * construction rather than by two adapters remembering to agree.
   */
  permissionSink(): { onDecision(sessionId: string, signal: PermissionDecisionSignal): void } {
    return {
      onDecision: (sessionId, signal) => {
        if (!this.enabled()) return;
        this.ingestNode(sessionId, (b) => b.addPermissionDecision(sessionId, signal));
      },
    };
  }

  /** The Worktree sink — a session's isolated checkout is a git-shaped event. */
  worktreeSink(): {
    onWorktreeChanged(sessionId: string, op: 'created' | 'removed', branch: string | null): void;
  } {
    return {
      onWorktreeChanged: (sessionId, op, branch) => {
        if (!this.enabled() || !this.overlayEnabled('git')) return;
        this.ingestNode(sessionId, (b) => b.addWorktreeOp(sessionId, op, branch));
      },
    };
  }

  /** The Resume sink — what changed in the repository while the user was away. */
  resumeSink(): {
    onDelta(sessionId: string, summary: string, detail: string | undefined, files: number): void;
  } {
    return {
      onDelta: (sessionId, summary, detail, files) => {
        if (!this.enabled() || !this.overlayEnabled('git')) return;
        this.ingestNode(sessionId, (b) => b.addResumeDelta(sessionId, summary, detail, files));
      },
    };
  }

  /** The Attachment sink — user-supplied files are inputs to the next objective. */
  attachmentSink(): {
    onAttachment(sessionId: string, name: string, bytes: number, mime?: string): void;
  } {
    return {
      onAttachment: (sessionId, name, bytes, mime) => {
        if (!this.enabled() || !this.overlayEnabled('file')) return;
        this.ingestNode(sessionId, (b) => b.addAttachment(sessionId, name, bytes, mime));
      },
    };
  }

  /** The internal-MCP sink — enriches the node the primary path already made. */
  mcpObserver(): (invocation: McpInvocation) => void {
    return (invocation) => {
      const sessionId = this.sessions.getActive()?.id;
      if (!sessionId || !this.enabled() || !this.overlayEnabled('mcp')) return;
      this.ingestNode(sessionId, (b) => b.enrichInternalMcp(sessionId, invocation));
    };
  }

  /**
   * Drop a session's graph state when it is trashed or purged. The rows
   * themselves are deleted by `SessionManager.purge` /
   * `AgentManager.clearSession`; this clears the in-memory reconstruction cache
   * so a restored session does not resume a stale run.
   */
  private onSessionLifecycle(ev: SessionLifecycleSignal): void {
    if (ev.kind === 'purged' || ev.kind === 'trashed') {
      this.builder.forget(ev.sessionId);
      this.pending.delete(ev.sessionId);
      this.seq.delete(ev.sessionId);
    }
    if (ev.kind === 'purged' && this.settingsGraph().pruneOnSessionEnd) {
      this.store.pruneOrphans(ev.sessionId);
    }
  }

  /**
   * Reconcile commits, debounced. Every mutating git op calls `notifyChanged`,
   * often several times per operation, so a bounded `git log` runs once per
   * settled burst rather than once per call.
   */
  private scheduleGitReconcile(workspaceId: string): void {
    if (!this.enabled() || !this.overlayEnabled('git')) return;
    const existing = this.gitTimers.get(workspaceId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.gitTimers.delete(workspaceId);
      void this.reconcileGit(workspaceId);
    }, GIT_RECONCILE_MS);
    t.unref?.();
    this.gitTimers.set(workspaceId, t);
  }

  private async reconcileGit(workspaceId: string): Promise<void> {
    if (!this.git) return;
    try {
      const commits = await this.git.log(workspaceId, { limit: GIT_LOG_LIMIT });
      // Attribution is resolved HERE, in main, never supplied by a renderer:
      // the active session in this workspace owns the commits, otherwise they
      // stay unattributed. Crucially, an unattributable commit is NOT marked
      // seen — marking it would drop it permanently the moment its session
      // becomes active, which is exactly when it should have been recorded.
      const active = this.sessions.getActive();
      const sessionId = active && active.workspaceId === workspaceId ? active.id : null;
      if (!sessionId) return;

      const fresh = commits.filter((c) => !this.seenCommits.has(c.hash));
      if (fresh.length === 0) return;
      for (const c of fresh) this.seenCommits.add(c.hash);
      // Bound the dedupe set so a long-lived session cannot grow it forever.
      // Keep a full page of history, not a handful: trimming to GIT_LOG_LIMIT
      // meant the very next reconcile re-ingested commits it had just seen.
      if (this.seenCommits.size > SEEN_COMMITS_MAX) {
        this.seenCommits = new Set([...this.seenCommits].slice(-SEEN_COMMITS_MAX / 2));
      }
      this.ingestNode(sessionId, (b) => b.addCommits(sessionId, fresh.reverse()));
    } catch (err) {
      logger.warn('work graph git reconcile failed', err);
    }
  }

  /**
   * Feed one builder call's output into the same pending/flush pipeline the
   * agent event path uses, so every source coalesces into the same delta.
   */
  private ingestNode(
    sessionId: string,
    build: (builder: WorkGraphBuilder) => { nodes: WorkGraphNode[]; edges: WorkGraphEdge[] },
  ): void {
    let result;
    try {
      result = build(this.builder);
    } catch (err) {
      logger.warn('work graph builder failed', err);
      return;
    }
    if (result.nodes.length === 0 && result.edges.length === 0) return;
    const p = this.pendingFor(sessionId);
    for (const n of result.nodes) p.nodes.set(n.id, n);
    for (const e of result.edges) p.edges.set(e.id, e);
    this.schedule(sessionId, this.config().updateFrequency);
  }

  /**
   * Re-derive heuristic edges for a session, after the flush that persists the
   * run's final nodes. Deferred rather than immediate because derivation reads
   * the PERSISTED graph, and the run's last nodes are still in the pending
   * buffer at the moment `result` arrives.
   */
  private scheduleDerivation(sessionId: string): void {
    const existing = this.deriveTimers.get(sessionId);
    if (existing) clearTimeout(existing);
    const delay = Math.max(this.config().updateFrequency, 1) + 50;
    const t = setTimeout(() => {
      this.deriveTimers.delete(sessionId);
      this.derive(sessionId);
    }, delay);
    t.unref?.();
    this.deriveTimers.set(sessionId, t);
  }

  private derive(sessionId: string): void {
    const cfg = this.config();
    if (!cfg.enabled || !cfg.showDerivedEdges) return;
    try {
      const snap = this.store.snapshot(sessionId, cfg.maxNodes);
      if (snap.nodes.length === 0) return;

      const workspaceId = this.sessions.get(sessionId)?.workspaceId ?? null;
      const edges: WorkGraphEdge[] = [
        ...deriveVerifiedBy(sessionId, snap.nodes, this.scripts?.scriptNames(sessionId) ?? []),
      ];
      if (this.refs && workspaceId) {
        const refs = this.refs;
        edges.push(
          ...deriveFileDependencies(sessionId, snap.nodes, (path) =>
            refs.importsOf(workspaceId, path),
          ),
        );
      }
      if (edges.length === 0) return;

      // The unique (src,dst,kind) index makes re-deriving idempotent, so this
      // can run after every run without accumulating duplicates.
      if (cfg.persist) this.store.write(sessionId, [], edges, cfg.retentionPerSession);
      const next = (this.seq.get(sessionId) ?? 0) + 1;
      this.seq.set(sessionId, next);
      this.broadcast({ kind: 'delta', sessionId, seq: next, nodes: [], edges });
    } catch (err) {
      logger.warn('work graph derivation failed', err);
    }
  }

  private enabled(): boolean {
    return this.config().enabled;
  }

  private settingsGraph() {
    return this.config();
  }

  /* ---- ingestion ------------------------------------------------------ */

  private onAgentEvent(event: AgentEvent): void {
    const cfg = this.config();
    if (!cfg.enabled) return;
    // `diagnostic` carries no top-level sessionId; the builder skips it too,
    // but returning early here avoids constructing state for it at all.
    if (event.kind === 'diagnostic') return;

    const result = this.builder.ingest(event);
    if (result.nodes.length === 0 && result.edges.length === 0) return;

    const sessionId = event.sessionId;
    // A run ending is the point at which inference becomes possible: only then
    // is the full sequence of edits and verification commands known.
    if (event.kind === 'result' || event.kind === 'error') {
      this.scheduleDerivation(sessionId);
    }
    const p = this.pendingFor(sessionId);
    for (const n of result.nodes) p.nodes.set(n.id, n);
    for (const e of result.edges) p.edges.set(e.id, e);

    // An oversized burst is pushed as a reset rather than a giant delta: the
    // renderer refetches a coherent snapshot instead of applying a torn one.
    // Edges are counted too — one reconcile can fan out an `implemented-in`
    // edge per file per commit, so a node-only guard let thousands through.
    if (p.nodes.size > GRAPH_LIMITS.maxDeltaNodes || p.edges.size > GRAPH_LIMITS.maxDeltaEdges) {
      this.flush(sessionId, true);
      return;
    }
    this.schedule(sessionId, cfg.updateFrequency);
  }

  private pendingFor(sessionId: string): Pending {
    let p = this.pending.get(sessionId);
    if (!p) {
      p = { nodes: new Map(), edges: new Map() };
      this.pending.set(sessionId, p);
    }
    return p;
  }

  private schedule(sessionId: string, delayMs: number): void {
    if (delayMs <= 0) {
      this.flush(sessionId);
      return;
    }
    if (this.timers.has(sessionId)) return;
    const t = setTimeout(() => {
      this.timers.delete(sessionId);
      this.flush(sessionId);
    }, delayMs);
    // Never hold the event loop open for a cosmetic flush.
    t.unref?.();
    this.timers.set(sessionId, t);
  }

  /** Persist the pending delta and push it. `overflow` forces a reset push. */
  private flush(sessionId: string, overflow = false): void {
    const timer = this.timers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sessionId);
    }
    const p = this.pending.get(sessionId);
    if (!p || (p.nodes.size === 0 && p.edges.size === 0)) return;
    this.pending.delete(sessionId);

    const nodes = [...p.nodes.values()];
    const edges = [...p.edges.values()];
    const cfg = this.config();

    let removed: string[] = [];
    if (cfg.persist) {
      const result = this.store.write(sessionId, nodes, edges, cfg.retentionPerSession);
      removed = result.removed;
      this.recordHealth(sessionId, result);
    }

    const next = (this.seq.get(sessionId) ?? 0) + 1;
    this.seq.set(sessionId, next);
    const health = this.health.get(sessionId);

    this.broadcast(
      overflow
        ? { kind: 'reset', sessionId, health }
        : {
            kind: 'delta',
            sessionId,
            seq: next,
            nodes,
            edges,
            ...(removed.length > 0 ? { removed } : {}),
            ...(health ? { health } : {}),
          },
    );
  }

  /**
   * Fold one write's outcome into the session's health, and log the transition
   * into failure exactly once. Recovery clears the record, so a transient
   * SQLite hiccup does not leave a permanent banner in the panel.
   */
  private recordHealth(sessionId: string, result: WorkGraphWriteResult): void {
    if (result.ok && result.droppedEdges === 0) {
      this.health.delete(sessionId);
      return;
    }
    const prev = this.health.get(sessionId);
    const failures = result.ok ? (prev?.failures ?? 0) : (prev?.failures ?? 0) + 1;
    const next: WorkGraphHealth = {
      failures,
      droppedEdges: (prev?.droppedEdges ?? 0) + result.droppedEdges,
      ...(result.error ? { lastError: redactSecrets(result.error).slice(0, 200) } : {}),
    };
    this.health.set(sessionId, next);
    if (failures === GRAPH_LIMITS.healthFailureThreshold) {
      logger.warn(
        `Work Graph has failed to persist ${failures} times for session ${sessionId}`,
        next.lastError,
      );
    }
  }

  /* ---- helpers -------------------------------------------------------- */

  private config(): AppSettings['graph'] {
    try {
      return this.settings.getAll().graph;
    } catch {
      // Settings unavailable (very early boot / teardown) — behave as disabled
      // rather than guessing defaults that might contradict the user's choice.
      // Built from DEFAULT_SETTINGS so every field is present: a partial object
      // behind an `as` cast used to hand consumers `undefined` for half the
      // config, and to disagree with `overlayEnabled`'s own fallback.
      return { ...DEFAULT_SETTINGS.graph, enabled: false, persist: false };
    }
  }

  /** Overlay gates decide which SOURCES contribute nodes at all. */
  private overlayEnabled(kind: WorkGraphNodeKind): boolean {
    // One fallback, shared with `config()` — the two used to disagree, so the
    // same settings failure both disabled the graph and enabled every overlay.
    const overlays = this.config().overlays;
    switch (kind) {
      case 'git':
        return overlays.git;
      case 'terminal':
        return overlays.terminal;
      case 'mcp':
        return overlays.mcp;
      case 'memory':
        return overlays.memory;
      case 'file':
        return overlays.file;
      case 'search':
        return overlays.search;
      case 'service':
        return overlays.service;
      default:
        // The structural spine (objective/planning/task/approval/completion) is
        // not an overlay — turning it off would leave a graph with no shape.
        return true;
    }
  }

  private broadcast(payload: WorkGraphPush): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcEvents.graphChanged, payload);
    }
  }
}

/** `data:image/png;base64,AAAA` -> `AAAA`. Rejects any other data URL. */
function stripDataUrl(content: string): string {
  const match = /^data:image\/png;base64,/.exec(content);
  if (!match) throw new Error('graph: expected a PNG data URL');
  return content.slice(match[0].length);
}

/** A filesystem-safe default filename: short session id + local date. */
function stampedName(sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 8) || 'session';
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${safe}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
