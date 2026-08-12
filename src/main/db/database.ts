/**
 * Local SQLite database — the on-device persistence layer for Limboo.
 *
 * Owned entirely by the main process (never the renderer). Opened once as a
 * singleton under `userData`. Security contract (CLAUDE.md §6): callers use only
 * prepared statements with *bound parameters* — values are never concatenated or
 * interpolated into SQL. WAL mode keeps reads fast and writes durable.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import { logger } from '../logger';
import { WORKSPACE_SCHEMA_VERSION } from '@shared/constants';

let db: Database.Database | null = null;

/** Open (or return the already-open) database and ensure the schema exists. */
export function getDb(): Database.Database {
  if (db) return db;

  const file = path.join(app.getPath('userData'), 'limboo.db');
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrate(db);
  logger.info(`SQLite opened at ${file}`);
  return db;
}

/** Close the database. Called on app quit. */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// SQLite cannot bind DDL identifiers, so table/column/type are interpolated.
// These are always compile-time literals below, but validate defensively so a
// future caller can never turn this into an injection vector (CWE-89). The
// column definition is composed from validated parts rather than pattern-matched
// as a free-form SQL fragment — a charset allowlist has to guess at every legal
// default ('[]', a quoted string containing an apostrophe, …) and fails closed
// on the ones it missed.
const SQL_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SQL_COLUMN_TYPES = ['TEXT', 'INTEGER', 'REAL', 'BLOB'] as const;

type ColumnSpec = {
  type: (typeof SQL_COLUMN_TYPES)[number];
  notNull?: boolean;
  /** Literal default. Strings are SQL-quoted; numbers must be finite. */
  default?: string | number;
};

/** Render a scalar as a SQL literal (single quotes doubled, per SQLite). */
function quoteSqlLiteral(value: string | number): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Unsafe numeric default: ${value}`);
    return String(value);
  }
  if (typeof value !== 'string') throw new Error(`Unsafe default type: ${typeof value}`);
  return `'${value.replace(/'/g, "''")}'`;
}

/** Add a column to a table if it isn't already present (idempotent migration). */
function addColumnIfMissing(
  database: Database.Database,
  table: string,
  column: string,
  spec: ColumnSpec,
): void {
  if (!SQL_IDENTIFIER_RE.test(table)) throw new Error(`Unsafe table identifier: ${table}`);
  if (!SQL_IDENTIFIER_RE.test(column)) throw new Error(`Unsafe column identifier: ${column}`);
  if (!SQL_COLUMN_TYPES.includes(spec.type)) throw new Error(`Unsafe column type: ${spec.type}`);
  const definition =
    spec.type +
    (spec.notNull ? ' NOT NULL' : '') +
    (spec.default !== undefined ? ` DEFAULT ${quoteSqlLiteral(spec.default)}` : '');
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === column)) return;
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  logger.info(`DB migration: added ${table}.${column}`);
}

/** Create tables on first run and record the schema version for future upgrades. */
function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      path           TEXT NOT NULL UNIQUE,
      icon           TEXT NOT NULL,
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL,
      last_opened_at INTEGER NOT NULL,
      favorite       INTEGER NOT NULL DEFAULT 0,
      lifecycle      TEXT NOT NULL,
      health         TEXT NOT NULL,
      metadata       TEXT NOT NULL,
      config         TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_state (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    -- Persisted development sessions (Phase 3). Every session belongs to a
    -- workspace; deleted_at is NULL for live sessions and set when moved to the
    -- recoverable trash. The agent_* tables key off session_id for transcript.
    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title        TEXT NOT NULL,
      branch       TEXT NOT NULL,
      status       TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      pinned       INTEGER NOT NULL DEFAULT 0,
      archived     INTEGER NOT NULL DEFAULT 0,
      deleted_at   INTEGER,
      adds         INTEGER NOT NULL DEFAULT 0,
      dels         INTEGER NOT NULL DEFAULT 0,
      unread       INTEGER NOT NULL DEFAULT 0,
      mode         TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_workspace
      ON sessions (workspace_id, pinned DESC, updated_at DESC);

    -- Agent conversation history, persisted per session so a reopened session
    -- restores its transcript. Append-only.
    CREATE TABLE IF NOT EXISTS agent_messages (
      id         TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role       TEXT NOT NULL,
      text       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_messages_session
      ON agent_messages (session_id, created_at);

    -- Immutable, audit-style activity feed (tool calls, file changes, results).
    CREATE TABLE IF NOT EXISTS agent_activity (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL,
      type        TEXT NOT NULL,
      payload     TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_activity_session
      ON agent_activity (session_id, created_at);

    -- One row per subagent the agent delegated to (schema v17).
    --
    -- Tool calls in general are deliberately NOT persisted — they are runtime
    -- state rebuilt per run. A subagent is the exception: its row is the ONLY
    -- record of a delegation in the conversation, and losing it on restart left
    -- the Work Graph remembering that a worker ran while the transcript showed
    -- nothing. The payload column holds the JSON SubagentInfo, the same
    -- shape-in-a-blob approach work_graph_nodes uses, so extending the record
    -- needs no migration. Ring-capped per session by
    -- settings.agent.subagents.retainRuns.
    CREATE TABLE IF NOT EXISTS agent_subagent_runs (
      call_id        TEXT PRIMARY KEY,
      session_id     TEXT NOT NULL,
      parent_call_id TEXT,
      subagent_type  TEXT,
      description    TEXT,
      status         TEXT NOT NULL,
      payload        TEXT NOT NULL,
      started_at     INTEGER NOT NULL,
      ended_at       INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_agent_subagent_runs_session
      ON agent_subagent_runs (session_id, started_at);

    -- Maps a Limboo session to its Claude Code SDK session id so multi-turn
    -- conversations resume across prompts. Superseded by
    -- agent_provider_sessions (schema v12) — kept for backfill, no longer
    -- written.
    CREATE TABLE IF NOT EXISTS agent_session_meta (
      session_id     TEXT PRIMARY KEY,
      sdk_session_id TEXT,
      updated_at     INTEGER NOT NULL
    );

    -- Provider-keyed resume tokens (schema v12) — one row per (session,
    -- provider) so a Limboo session can hold a Claude SDK session id and a
    -- Cursor chat id side by side. The backfill below migrates legacy rows
    -- once; INSERT OR IGNORE keeps it idempotent across boots.
    CREATE TABLE IF NOT EXISTS agent_provider_sessions (
      session_id          TEXT NOT NULL,
      provider            TEXT NOT NULL,
      provider_session_id TEXT,
      updated_at          INTEGER NOT NULL,
      PRIMARY KEY (session_id, provider)
    );
    INSERT OR IGNORE INTO agent_provider_sessions
      (session_id, provider, provider_session_id, updated_at)
      SELECT session_id, 'anthropic', sdk_session_id, updated_at
        FROM agent_session_meta;

    -- Structured diagnostics console — the lifecycle / request / recovery /
    -- heartbeat timeline. session_id is nullable for capability-global events.
    CREATE TABLE IF NOT EXISTS agent_diagnostics (
      id          TEXT PRIMARY KEY,
      session_id  TEXT,
      severity    TEXT NOT NULL,
      category    TEXT NOT NULL,
      label       TEXT NOT NULL,
      detail      TEXT,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_diagnostics_session
      ON agent_diagnostics (session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_agent_diagnostics_created
      ON agent_diagnostics (created_at);

    -- Provider-Neutral Hook Engine audit log (schema v13) — one immutable,
    -- redacted row per normalized lifecycle event (gate + observe) across every
    -- provider, so the Hooks panel shows an identical governance trail whether
    -- Claude or Cursor produced the run. payload is the JSON-serialized HookEvent.
    CREATE TABLE IF NOT EXISTS hook_audit (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL,
      phase       TEXT NOT NULL,
      payload     TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hook_audit_session
      ON hook_audit (session_id, created_at);

    -- Plan Mode artifacts — one proposed implementation strategy per session,
    -- persisted so an unfinished/awaiting-approval plan survives an app restart.
    -- meta is JSON-serialized PlanMeta; markdown is the raw plan from ExitPlanMode.
    CREATE TABLE IF NOT EXISTS agent_plans (
      session_id  TEXT PRIMARY KEY,
      status      TEXT NOT NULL,
      title       TEXT NOT NULL,
      markdown    TEXT NOT NULL,
      meta        TEXT NOT NULL,
      pinned      INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      approved_at INTEGER,
      updated_at  INTEGER NOT NULL
    );

    -- Plan revisions — historical snapshots of a session's plan, captured on each
    -- regenerate / re-capture so iterative planning cycles can be compared and
    -- restored. Additive to agent_plans (which always holds the current plan).
    CREATE TABLE IF NOT EXISTS plan_revisions (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL,
      rev         INTEGER NOT NULL,
      status      TEXT NOT NULL,
      title       TEXT NOT NULL,
      markdown    TEXT NOT NULL,
      meta        TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_plan_revisions_session
      ON plan_revisions (session_id, rev DESC);

    -- Plan resumption state — everything needed to reopen a pending plan after
    -- an app restart with the approval decision still live and implementation
    -- still locked. A SIBLING of agent_plans, not more columns on it, because
    -- these are resumption INPUTS (which repo, which conversation, which
    -- retrieval) rather than plan identity, and they are rewritten on a
    -- different cadence. Modelled on session_snapshots.
    --
    -- attachment_ids / memory_ids / search_refs / settings_snapshot /
    -- orchestration are capped JSON, all bound. head/branch/worktree_id are
    -- NULL when the effective root is not a git repo or has no worktree.
    CREATE TABLE IF NOT EXISTS plan_state (
      session_id          TEXT PRIMARY KEY,
      plan_rev            INTEGER NOT NULL,
      approval_path       TEXT NOT NULL,
      exec_mode           TEXT,
      provider            TEXT NOT NULL,
      provider_session_id TEXT,
      workspace_id        TEXT NOT NULL,
      worktree_id         TEXT,
      branch              TEXT,
      root                TEXT NOT NULL,
      head                TEXT,
      dirty_hash          TEXT NOT NULL DEFAULT '',
      checkpoint_id       TEXT,
      attachment_ids      TEXT NOT NULL DEFAULT '[]',
      memory_ids          TEXT NOT NULL DEFAULT '[]',
      search_refs         TEXT NOT NULL DEFAULT '[]',
      settings_snapshot   TEXT NOT NULL DEFAULT '{}',
      orchestration       TEXT NOT NULL DEFAULT '{}',
      created_at          INTEGER NOT NULL,
      updated_at          INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_plan_state_updated
      ON plan_state (updated_at DESC);

    -- Git checkpoints — lightweight, session-scoped recovery points stored as
    -- dedicated git refs (refs/limboo/checkpoints/<sessionId>/<ts>); this table
    -- holds only the metadata + which ref to restore. Never on a branch, never
    -- pushed. Soft history of an agent's work, separate from real commits.
    CREATE TABLE IF NOT EXISTS git_checkpoints (
      id            TEXT PRIMARY KEY,
      session_id    TEXT NOT NULL,
      workspace_id  TEXT NOT NULL,
      ref           TEXT NOT NULL,
      commit_hash   TEXT NOT NULL,
      label         TEXT NOT NULL,
      auto          INTEGER NOT NULL DEFAULT 0,
      message_id    TEXT,
      files         TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_git_checkpoints_session
      ON git_checkpoints (session_id, created_at DESC);

    -- Resume Pipeline (schema v10) — one repository anchor per session,
    -- upserted at meaningful moments (run end, checkpoint, deactivation).
    -- head/branch are NULL when the effective root is not a git repo (or the
    -- branch is detached). dirty_files is a capped JSON array of {path,status};
    -- dirty_hash is a sha256 over the sorted dirty entries
    -- (status|path|size|mtimeMs) so content drift in an already-dirty tree is
    -- detected without ever reading file contents. All values bound.
    CREATE TABLE IF NOT EXISTS session_snapshots (
      session_id   TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      root         TEXT NOT NULL,
      head         TEXT,
      branch       TEXT,
      dirty_hash   TEXT NOT NULL DEFAULT '',
      dirty_files  TEXT NOT NULL DEFAULT '[]',
      reason       TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );

    -- The last computed repository delta per session, persisted so the
    -- one-shot prompt injection survives an app restart between detection and
    -- the next prompt. status: 'pending' | 'injected' | 'dismissed'.
    -- delta is a JSON RepoDelta built entirely in the main process.
    CREATE TABLE IF NOT EXISTS resume_deltas (
      session_id TEXT PRIMARY KEY,
      status     TEXT NOT NULL,
      delta      TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- Local Memory System — durable, provider-independent project knowledge.
    -- workspace_id is NULL for global/user-scope memories (e.g. preferences).
    -- Only rows with status='active' are ever injected into an agent prompt;
    -- 'proposed' rows await user confirmation. All values are bound, never
    -- string-interpolated. meta is a JSON blob (validated before write).
    CREATE TABLE IF NOT EXISTS memories (
      id            TEXT PRIMARY KEY,
      workspace_id  TEXT,
      tier          TEXT NOT NULL,
      title         TEXT NOT NULL,
      body          TEXT NOT NULL,
      source        TEXT NOT NULL,
      confidence    REAL NOT NULL DEFAULT 0.5,
      pinned        INTEGER NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'active',
      use_count     INTEGER NOT NULL DEFAULT 0,
      last_used_at  INTEGER,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      expires_at    INTEGER,
      session_id    TEXT,
      commit_hash   TEXT,
      file_path     TEXT,
      meta          TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_memories_workspace
      ON memories (workspace_id, status, tier);
    CREATE INDEX IF NOT EXISTS idx_memories_status
      ON memories (status, updated_at DESC);

    -- Full-text index over title+body for BM25 keyword retrieval (offline). It
    -- shadows the memories table via content='memories' and is kept in sync by
    -- the triggers below.
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      title, body, content='memories', content_rowid='rowid'
    );
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, title, body)
        VALUES ('delete', old.rowid, old.title, old.body);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, title, body)
        VALUES ('delete', old.rowid, old.title, old.body);
      INSERT INTO memories_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
    END;

    -- Back-links from a memory to the conversation / commit / file / memory it
    -- originated from, so the UI can navigate to the source.
    CREATE TABLE IF NOT EXISTS memory_links (
      memory_id TEXT NOT NULL,
      kind      TEXT NOT NULL,
      ref       TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_memory_links_memory
      ON memory_links (memory_id);

    -- Search Engine — the app-owned index of workspace files. One row per indexed
    -- file, scoped by workspace. Content is bounded (head of file, text only) and
    -- read solely through the guarded file reader. All values are bound, never
    -- string-interpolated. The FTS5 shadow below powers BM25 keyword retrieval.
    CREATE TABLE IF NOT EXISTS search_files (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      path         TEXT NOT NULL,
      lang         TEXT,
      size         INTEGER NOT NULL DEFAULT 0,
      content      TEXT NOT NULL DEFAULT '',
      updated_at   INTEGER NOT NULL,
      UNIQUE (workspace_id, path)
    );
    CREATE INDEX IF NOT EXISTS idx_search_files_workspace
      ON search_files (workspace_id, updated_at DESC);

    -- Full-text index over path + content (default unicode tokenizer → BM25).
    -- Shadows search_files via content='search_files'; kept in sync by triggers.
    CREATE VIRTUAL TABLE IF NOT EXISTS search_files_fts USING fts5(
      path, content, content='search_files', content_rowid='rowid'
    );
    CREATE TRIGGER IF NOT EXISTS search_files_ai AFTER INSERT ON search_files BEGIN
      INSERT INTO search_files_fts(rowid, path, content)
        VALUES (new.rowid, new.path, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS search_files_ad AFTER DELETE ON search_files BEGIN
      INSERT INTO search_files_fts(search_files_fts, rowid, path, content)
        VALUES ('delete', old.rowid, old.path, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS search_files_au AFTER UPDATE ON search_files BEGIN
      INSERT INTO search_files_fts(search_files_fts, rowid, path, content)
        VALUES ('delete', old.rowid, old.path, old.content);
      INSERT INTO search_files_fts(rowid, path, content)
        VALUES (new.rowid, new.path, new.content);
    END;

    -- Language-aware symbol index (best-effort, regex-extracted during indexing).
    -- One row per declaration; navigable via path + line.
    CREATE TABLE IF NOT EXISTS search_symbols (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      path         TEXT NOT NULL,
      name         TEXT NOT NULL,
      kind         TEXT NOT NULL,
      lang         TEXT,
      line         INTEGER NOT NULL DEFAULT 1,
      signature    TEXT NOT NULL DEFAULT '',
      updated_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_search_symbols_workspace
      ON search_symbols (workspace_id, name);
    CREATE INDEX IF NOT EXISTS idx_search_symbols_path
      ON search_symbols (workspace_id, path);

    -- Trigram tokenizer → substring + fuzzy matching on symbol names/signatures
    -- (built into FTS5 since 3.34; substrings <3 chars fall back to a LIKE scan).
    CREATE VIRTUAL TABLE IF NOT EXISTS search_symbols_fts USING fts5(
      name, signature, content='search_symbols', content_rowid='rowid',
      tokenize='trigram'
    );
    CREATE TRIGGER IF NOT EXISTS search_symbols_ai AFTER INSERT ON search_symbols BEGIN
      INSERT INTO search_symbols_fts(rowid, name, signature)
        VALUES (new.rowid, new.name, new.signature);
    END;
    CREATE TRIGGER IF NOT EXISTS search_symbols_ad AFTER DELETE ON search_symbols BEGIN
      INSERT INTO search_symbols_fts(search_symbols_fts, rowid, name, signature)
        VALUES ('delete', old.rowid, old.name, old.signature);
    END;
    CREATE TRIGGER IF NOT EXISTS search_symbols_au AFTER UPDATE ON search_symbols BEGIN
      INSERT INTO search_symbols_fts(search_symbols_fts, rowid, name, signature)
        VALUES ('delete', old.rowid, old.name, old.signature);
      INSERT INTO search_symbols_fts(rowid, name, signature)
        VALUES (new.rowid, new.name, new.signature);
    END;

    -- Attachment Manager (schema v9) — session-owned files attached in the
    -- composer. The staged copy lives under userData/attachments/<session_id>/
    -- <stored_name>; this table is the metadata + lifecycle record. message_id
    -- is NULL while the attachment is a composer draft and set when it is sent
    -- with a user turn. Deduped per session by content hash. All values bound.
    CREATE TABLE IF NOT EXISTS attachments (
      id           TEXT PRIMARY KEY,
      session_id   TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      name         TEXT NOT NULL,
      stored_name  TEXT NOT NULL,
      mime         TEXT NOT NULL,
      category     TEXT NOT NULL,
      size         INTEGER NOT NULL,
      sha256       TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'ready',
      origin       TEXT NOT NULL,
      risk         TEXT NOT NULL DEFAULT 'safe',
      message_id   TEXT,
      thumb        TEXT,
      error        TEXT,
      meta         TEXT NOT NULL DEFAULT '{}',
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_session
      ON attachments (session_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_attachments_dedupe
      ON attachments (session_id, sha256);

    -- Recent searches (most-recent-first) per scope. workspace_id NULL = global.
    CREATE TABLE IF NOT EXISTS search_history (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT,
      query        TEXT NOT NULL,
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_search_history_scope
      ON search_history (workspace_id, created_at DESC);

    -- Named, re-runnable saved searches. filter is a JSON blob (validated on write).
    CREATE TABLE IF NOT EXISTS saved_searches (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT,
      name         TEXT NOT NULL,
      query        TEXT NOT NULL,
      filter       TEXT NOT NULL DEFAULT '{}',
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_saved_searches_scope
      ON saved_searches (workspace_id, created_at DESC);

    -- Lightweight dependency / reference layer (schema v11) — one row per
    -- import/require/use edge, extracted by regex during the same indexing pass
    -- that owns search_symbols. Parser-agnostic: a future tree-sitter extractor
    -- can repopulate the same columns without a schema change. The ref column is
    -- the raw module specifier; ref_path is the workspace-relative resolution
    -- when the specifier is relative (NULL for bare/package specifiers). Bounded
    -- per file by SEARCH_LIMITS. All values bound, never string-interpolated.
    CREATE TABLE IF NOT EXISTS search_refs (
      id           TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      src_path     TEXT NOT NULL,
      ref          TEXT NOT NULL,
      ref_path     TEXT,
      kind         TEXT NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_search_refs_src
      ON search_refs (workspace_id, src_path);
    CREATE INDEX IF NOT EXISTS idx_search_refs_target
      ON search_refs (workspace_id, ref_path);

    -- Provider-independent MCP registry (schema v14) — one row per configured
    -- Model Context Protocol server, consumed by BOTH Claude (options.mcpServers)
    -- and Cursor (generated .cursor/mcp.json). workspace_id NULL = global/user
    -- scope (all workspaces), else the owning workspace, mirroring the memories
    -- table. NO plaintext secrets live here: env/header values flagged secret
    -- carry an empty value and the real value is safeStorage-encrypted in the
    -- secret store under mcp-<id>-<key>. args_json/env_json/headers_json/
    -- providers_json/tools_json are validated JSON written with bound params.
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id                    TEXT PRIMARY KEY,
      workspace_id          TEXT,
      name                  TEXT NOT NULL,
      display_name          TEXT NOT NULL,
      transport             TEXT NOT NULL,
      command               TEXT,
      args_json             TEXT NOT NULL DEFAULT '[]',
      env_json              TEXT NOT NULL DEFAULT '{}',
      cwd                   TEXT,
      url                   TEXT,
      headers_json          TEXT NOT NULL DEFAULT '{}',
      enabled               INTEGER NOT NULL DEFAULT 1,
      startup               TEXT NOT NULL DEFAULT 'on-demand',
      trust                 TEXT NOT NULL DEFAULT 'ask',
      plan_access           TEXT NOT NULL DEFAULT 'annotated',
      timeout_ms            INTEGER NOT NULL DEFAULT 60000,
      restart_policy        TEXT NOT NULL DEFAULT 'on-failure',
      providers_json        TEXT NOT NULL DEFAULT '{"claude":true,"cursor":true}',
      allow_private_network INTEGER NOT NULL DEFAULT 0,
      category              TEXT NOT NULL DEFAULT 'custom',
      icon                  TEXT NOT NULL DEFAULT '',
      source                TEXT NOT NULL DEFAULT 'user',
      tools_json            TEXT NOT NULL DEFAULT '[]',
      created_at            INTEGER NOT NULL,
      updated_at            INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mcp_servers_scope
      ON mcp_servers (workspace_id, updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_servers_name
      ON mcp_servers (workspace_id, name);

    -- Work Graph (schema v15) — the Directed Acyclic Work Graph: Limboo's own
    -- structural record of engineering work, normalized across BOTH providers
    -- from the AgentManager event stream. Nodes are typed, so the graph is
    -- queryable without replaying a conversation. The payload column is the
    -- JSON-serialized WorkGraphNode (already redacted + length-bounded by the
    -- builder); the header columns are exactly the fields traversal and index
    -- queries filter on. ref_kind/ref_id is the bidirectional-navigation join
    -- (message/tool/commit/checkpoint/terminal/memory/file/mcp/plan/service).
    -- There is no separate runs table: a run IS its objective node (run_id
    -- refers to itself for a root).
    CREATE TABLE IF NOT EXISTS work_graph_nodes (
      id           TEXT PRIMARY KEY,
      session_id   TEXT NOT NULL,
      workspace_id TEXT,
      run_id       TEXT NOT NULL,
      kind         TEXT NOT NULL,
      provider     TEXT NOT NULL,
      status       TEXT NOT NULL,
      title        TEXT NOT NULL,
      detail       TEXT NOT NULL DEFAULT '',
      ref_kind     TEXT,
      ref_id       TEXT,
      seq          INTEGER NOT NULL,
      started_at   INTEGER NOT NULL,
      ended_at     INTEGER,
      payload      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_work_graph_nodes_session
      ON work_graph_nodes (session_id, seq);
    CREATE INDEX IF NOT EXISTS idx_work_graph_nodes_run
      ON work_graph_nodes (run_id, seq);
    CREATE INDEX IF NOT EXISTS idx_work_graph_nodes_kind
      ON work_graph_nodes (session_id, kind, started_at);
    CREATE INDEX IF NOT EXISTS idx_work_graph_nodes_ref
      ON work_graph_nodes (ref_kind, ref_id);
    CREATE INDEX IF NOT EXISTS idx_work_graph_nodes_age
      ON work_graph_nodes (started_at);

    -- Work Graph edges (schema v15) — a SEPARATE table, deliberately not folded
    -- into the node payload. The product's whole point is traversal ("every
    -- task blocked by authentication"), which is a recursive join; edges stored
    -- as JSON would force a full scan + parse per query. The derived flag marks
    -- heuristic edges (verified-by, sequential depends-on) so the UI can dash
    -- them and queries can exclude them — a heuristic must never be able to
    -- masquerade as a fact. The FK cascade (PRAGMA foreign_keys is ON) keeps
    -- edges from outliving a ring-pruned node.
    CREATE TABLE IF NOT EXISTS work_graph_edges (
      id         TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      src        TEXT NOT NULL REFERENCES work_graph_nodes(id) ON DELETE CASCADE,
      dst        TEXT NOT NULL REFERENCES work_graph_nodes(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL,
      derived    INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_work_graph_edges_src
      ON work_graph_edges (session_id, src, kind);
    CREATE INDEX IF NOT EXISTS idx_work_graph_edges_dst
      ON work_graph_edges (session_id, dst, kind);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_work_graph_edges_triple
      ON work_graph_edges (src, dst, kind);

    -- FTS5 over node title+detail (mirrors memories_fts / search_files_fts).
    -- Graph search is a HYBRID: FTS supplies the seed set for a text predicate
    -- ("authentication", "touched GitHub"), and a WITH RECURSIVE closure over
    -- work_graph_edges does the actual traversal from those seeds. Neither
    -- alone answers the questions this subsystem exists for.
    CREATE VIRTUAL TABLE IF NOT EXISTS work_graph_nodes_fts USING fts5(
      title, detail, content='work_graph_nodes', content_rowid='rowid'
    );
    CREATE TRIGGER IF NOT EXISTS work_graph_nodes_ai AFTER INSERT ON work_graph_nodes BEGIN
      INSERT INTO work_graph_nodes_fts(rowid, title, detail)
        VALUES (new.rowid, new.title, new.detail);
    END;
    CREATE TRIGGER IF NOT EXISTS work_graph_nodes_ad AFTER DELETE ON work_graph_nodes BEGIN
      INSERT INTO work_graph_nodes_fts(work_graph_nodes_fts, rowid, title, detail)
        VALUES ('delete', old.rowid, old.title, old.detail);
    END;
    CREATE TRIGGER IF NOT EXISTS work_graph_nodes_au AFTER UPDATE ON work_graph_nodes BEGIN
      INSERT INTO work_graph_nodes_fts(work_graph_nodes_fts, rowid, title, detail)
        VALUES ('delete', old.rowid, old.title, old.detail);
      INSERT INTO work_graph_nodes_fts(rowid, title, detail)
        VALUES (new.rowid, new.title, new.detail);
    END;

    -- ---------------------------------------------------------------
    -- Runtime Telemetry (schema v18)
    --
    -- THE SCHEMA IS THE REDACTION POLICY. There is no column here that
    -- can hold a prompt, a message, a file path, a tool input, a memory
    -- body or a session title — only numbers, enum strings, a model id
    -- and ids. That is why an export of these tables cannot leak
    -- conversation data: not because a filter strips it, but because
    -- there is nowhere for it to have been stored. A future field that
    -- needs a free string has to justify itself against this comment.
    -- ---------------------------------------------------------------

    -- One row per (provider, window, time bucket), upserted. Buckets bound
    -- growth: a year of 5-minute samples across six window kinds stays in the
    -- low hundreds of thousands of rows, and the retention sweep trims below
    -- that. The window_kind column stores the provider's own identifier
    -- verbatim, so a new window type the provider invents is recorded
    -- rather than dropped.
    CREATE TABLE IF NOT EXISTS telemetry_usage_samples (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      at          INTEGER NOT NULL,
      provider    TEXT    NOT NULL,
      window_kind TEXT    NOT NULL,
      utilization REAL,
      status      TEXT,
      resets_at   INTEGER,
      is_overage  INTEGER NOT NULL DEFAULT 0,
      UNIQUE (provider, window_kind, at)
    );
    CREATE INDEX IF NOT EXISTS idx_telemetry_samples
      ON telemetry_usage_samples (provider, window_kind, at DESC);

    -- Per-model limits as the PROVIDER reported them (modelUsage.contextWindow
    -- and maxOutputTokens). Persisted so the ring is determinate immediately on
    -- the next launch instead of waiting for a run to finish — and so that no
    -- hardcoded model table is ever needed anywhere in the app. The
    -- auto_compact_tokens column is OBSERVED from the first automatic
    -- compaction boundary seen for the model; the SDK reports no threshold of
    -- its own, so NULL there means not-yet-seen, never none.
    CREATE TABLE IF NOT EXISTS telemetry_model_limits (
      model               TEXT PRIMARY KEY,
      context_window      INTEGER NOT NULL,
      max_output_tokens   INTEGER NOT NULL,
      auto_compact_tokens INTEGER,
      observed_at         INTEGER NOT NULL
    );

    -- One row per completed run. Ring-capped per session by retainRuns and
    -- swept by retentionDays. The run_id column is the join key the Work Graph's
    -- statistics view uses, which is how the two subsystems agree without
    -- either reaching into the other's storage.
    CREATE TABLE IF NOT EXISTS telemetry_run_rollups (
      run_id              TEXT PRIMARY KEY,
      session_id          TEXT NOT NULL,
      provider            TEXT NOT NULL,
      model               TEXT NOT NULL,
      mode                TEXT NOT NULL,
      started_at          INTEGER NOT NULL,
      duration_ms         INTEGER,
      duration_api_ms     INTEGER,
      ttft_ms             INTEGER,
      num_turns           INTEGER,
      input_tokens        INTEGER NOT NULL DEFAULT 0,
      output_tokens       INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens  INTEGER NOT NULL DEFAULT 0,
      cost_estimate_usd   REAL,
      peak_context_tokens INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_telemetry_rollups
      ON telemetry_run_rollups (session_id, started_at DESC);
  `);

  // Idempotent column additions for databases created before a column existed.
  // (SQLite has no "ADD COLUMN IF NOT EXISTS"; guard against the existing set.)
  addColumnIfMissing(database, 'sessions', 'mode', { type: 'TEXT' });
  // Worktree-backed sessions (schema v8) — a session may own an isolated git
  // worktree (own directory + branch). worktree_status: 'none'|'creating'|
  // 'ready'|'missing'|'removing'. base_ref is the branch/commit the worktree
  // branch was created from (used for recreate/duplicate). folder + tags are
  // user organization (tags is a JSON string array, validated before write).
  addColumnIfMissing(database, 'sessions', 'worktree_path', { type: 'TEXT' });
  addColumnIfMissing(database, 'sessions', 'worktree_branch', { type: 'TEXT' });
  addColumnIfMissing(database, 'sessions', 'worktree_status', {
    type: 'TEXT',
    notNull: true,
    default: 'none',
  });
  addColumnIfMissing(database, 'sessions', 'base_ref', { type: 'TEXT' });
  addColumnIfMissing(database, 'sessions', 'folder', { type: 'TEXT' });
  addColumnIfMissing(database, 'sessions', 'tags', {
    type: 'TEXT',
    notNull: true,
    default: '[]',
  });
  // Code Intelligence (schema v11) — a content hash per indexed file so the
  // incremental pass can skip files whose bytes are unchanged (no FTS churn)
  // and the resume delta engine can detect real content change. Path-only rows
  // (binary/oversize) store a cheap "size:mtimeMs" surrogate instead.
  addColumnIfMissing(database, 'search_files', 'content_hash', {
    type: 'TEXT',
    notNull: true,
    default: '',
  });
  // MCP plan/ask access (schema v16) — how far a server's tools reach inside the
  // read-only session modes, which otherwise deny every non-read tool outright
  // (McpPlanAccess). Existing rows adopt 'annotated': only tools the server
  // itself declares read-only — and even those still prompt unless the server is
  // also marked trusted.
  addColumnIfMissing(database, 'mcp_servers', 'plan_access', {
    type: 'TEXT',
    notNull: true,
    default: 'annotated',
  });

  // How to RENDER a turn when that differs from what was sent (JSON
  // {text, body}). Orchestration prompts Limboo composes on the user's behalf —
  // approving a plan, regenerating one — carry a whole document plus XML tags,
  // and without this the raw prompt reappeared in the transcript on every
  // reload. NULL for every ordinary prompt, which is the overwhelming majority.
  addColumnIfMissing(database, 'agent_messages', 'display', { type: 'TEXT' });

  // Plan Mode state machine (schema v19). `rev` is the concurrency token: every
  // mutating plan IPC carries the rev it believes it is acting on, and the
  // single writer updates `WHERE session_id = ? AND rev = ?`, so a stale window
  // cannot approve a plan that has since been replaced. NOT NULL DEFAULT 1 is
  // the only legal shape for a NOT NULL ADD COLUMN in SQLite.
  addColumnIfMissing(database, 'agent_plans', 'rev', {
    type: 'INTEGER',
    notNull: true,
    default: 1,
  });
  // Whether a pending plan can still be released in-turn. Existing rows have no
  // parked callback (the process that owned it is gone), so they are 'detached'.
  addColumnIfMissing(database, 'agent_plans', 'approval_path', {
    type: 'TEXT',
    notNull: true,
    default: 'detached',
  });
  // When the CURRENT planning pass began. Distinct from created_at, which
  // survives re-captures — milestone derivation needs this pass's boundary or a
  // regenerated plan replays the previous pass's tool calls.
  addColumnIfMissing(database, 'agent_plans', 'run_started_at', { type: 'INTEGER' });
  addColumnIfMissing(database, 'agent_plans', 'captured_at', { type: 'INTEGER' });
  // Basename of the plan file inside Limboo's own plans directory. A BASENAME,
  // never a path: the directory is chosen by main, so storing the full path
  // would let a restored row point anywhere.
  addColumnIfMissing(database, 'agent_plans', 'plan_file', { type: 'TEXT' });
  addColumnIfMissing(database, 'plan_revisions', 'reason', { type: 'TEXT' });

  // Backfill (idempotent, safe to re-run every boot).
  //
  // 'ready' is the pre-state-machine name for 'waiting-approval'. Rows are
  // rewritten here AND normalized on read (normalizePlanStatus), because a
  // database restored from a backup can reintroduce them at any time.
  database.exec(`
    UPDATE agent_plans    SET status = 'waiting-approval' WHERE status = 'ready';
    UPDATE plan_revisions SET status = 'waiting-approval' WHERE status = 'ready';
    UPDATE agent_plans    SET run_started_at = created_at WHERE run_started_at IS NULL;
    UPDATE agent_plans    SET captured_at = COALESCE(approved_at, created_at)
      WHERE captured_at IS NULL;
  `);
  // clearSession used to delete agent_plans without plan_revisions, so existing
  // databases carry revisions for sessions that no longer exist.
  database.exec(`
    DELETE FROM plan_revisions
      WHERE session_id NOT IN (SELECT id FROM sessions);
    DELETE FROM plan_state
      WHERE session_id NOT IN (SELECT id FROM sessions);
  `);

  const current = database
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get('schema_version') as { value: string } | undefined;

  if (!current) {
    database
      .prepare('INSERT INTO meta (key, value) VALUES (?, ?)')
      .run('schema_version', String(WORKSPACE_SCHEMA_VERSION));
  } else if (Number(current.value) !== WORKSPACE_SCHEMA_VERSION) {
    logger.info(
      `Workspace schema v${current.value} -> v${WORKSPACE_SCHEMA_VERSION} (migrations run here)`,
    );
    database
      .prepare('UPDATE meta SET value = ? WHERE key = ?')
      .run(String(WORKSPACE_SCHEMA_VERSION), 'schema_version');
  }
}
