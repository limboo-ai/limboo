/**
 * `mcp_servers` table access — the durable half of the MCP registry. Every
 * statement uses bound parameters (CLAUDE.md §6, never string-interpolated SQL).
 * JSON columns (args / env / headers / providers / tools) are parsed defensively
 * and prototype-pollution keys are dropped on read. No secrets live in the row:
 * env/header values flagged `secret` carry an empty value and the real value is
 * held in the SecretStore.
 */
import type Database from 'better-sqlite3';
import type {
  McpFieldValue,
  McpServerConfig,
  McpToolInfo,
  McpTransport,
  McpStartup,
  McpTrust,
  McpRestartPolicy,
  McpCategory,
  McpSource,
} from '@shared/types';
import { MCP_LIMITS } from '@shared/constants';

interface DbServerRow {
  id: string;
  workspace_id: string | null;
  name: string;
  display_name: string;
  transport: string;
  command: string | null;
  args_json: string;
  env_json: string;
  cwd: string | null;
  url: string | null;
  headers_json: string;
  enabled: number;
  startup: string;
  trust: string;
  plan_access: string;
  timeout_ms: number;
  restart_policy: string;
  providers_json: string;
  allow_private_network: number;
  category: string;
  icon: string;
  source: string;
  tools_json: string;
  created_at: number;
  updated_at: number;
}

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

function parseArray(json: string): unknown[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parseStringArray(json: string, max: number): string[] {
  return parseArray(json)
    .filter((x): x is string => typeof x === 'string')
    .slice(0, max);
}

function parseFieldMap(json: string): Record<string, McpFieldValue> {
  const out: Record<string, McpFieldValue> = {};
  let obj: Record<string, unknown>;
  try {
    const v = JSON.parse(json);
    obj = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (UNSAFE.has(k) || !v || typeof v !== 'object') continue;
    const value = (v as { value?: unknown }).value;
    const secret = (v as { secret?: unknown }).secret;
    out[k] = { value: typeof value === 'string' ? value : '', secret: !!secret };
  }
  return out;
}

function parseTools(json: string): McpToolInfo[] {
  return parseArray(json)
    .filter((t): t is { name: string; description?: unknown; readOnly?: unknown } => !!t && typeof t === 'object' && typeof (t as { name?: unknown }).name === 'string')
    .map((t) => ({
      name: t.name,
      description: typeof t.description === 'string' ? t.description : undefined,
      // Strict identity, never a truthy coercion: this flag feeds a permission
      // decision, so a hand-edited row holding "false" must not read as true.
      ...(t.readOnly === true ? { readOnly: true as const } : {}),
    }))
    .slice(0, MCP_LIMITS.maxTools);
}

function parseProviders(json: string): { claude: boolean; cursor: boolean } {
  try {
    const v = JSON.parse(json) as { claude?: unknown; cursor?: unknown };
    return { claude: v?.claude !== false, cursor: v?.cursor !== false };
  } catch {
    return { claude: true, cursor: true };
  }
}

export function rowToConfig(row: DbServerRow): McpServerConfig {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    displayName: row.display_name,
    transport: row.transport as McpTransport,
    command: row.command ?? undefined,
    args: parseStringArray(row.args_json, MCP_LIMITS.maxArgs),
    env: parseFieldMap(row.env_json),
    cwd: row.cwd ?? undefined,
    url: row.url ?? undefined,
    headers: parseFieldMap(row.headers_json),
    enabled: row.enabled === 1,
    startup: row.startup as McpStartup,
    trust: row.trust as McpTrust,
    // Whitelisted rather than cast: this column feeds the plan/ask permission
    // gate, so an unrecognized value must land on the most restrictive setting
    // instead of being trusted into the type.
    planAccess:
      row.plan_access === 'annotated' || row.plan_access === 'all' ? row.plan_access : 'block',
    timeoutMs: row.timeout_ms,
    restartPolicy: row.restart_policy as McpRestartPolicy,
    providers: parseProviders(row.providers_json),
    allowPrivateNetwork: row.allow_private_network === 1,
    category: row.category as McpCategory,
    icon: row.icon,
    source: row.source as McpSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Global (workspace_id NULL) + the given workspace's servers, newest first. */
export function listServers(db: Database.Database, workspaceId: string | null): McpServerConfig[] {
  const rows = db
    .prepare(
      `SELECT * FROM mcp_servers
       WHERE workspace_id IS NULL OR workspace_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(workspaceId) as DbServerRow[];
  return rows.map(rowToConfig);
}

/**
 * Every server row regardless of scope.
 *
 * Used only on a permission DENY path, to tell "no such server" apart from
 * "that server belongs to another workspace" so the message can say which.
 * Never use this to make an ALLOW decision — `listServers` is the scoped view.
 */
export function listAllServers(db: Database.Database): McpServerConfig[] {
  const rows = db.prepare('SELECT * FROM mcp_servers').all() as DbServerRow[];
  return rows.map(rowToConfig);
}

export function getServer(db: Database.Database, id: string): McpServerConfig | null {
  const row = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as DbServerRow | undefined;
  return row ? rowToConfig(row) : null;
}

export function countServers(db: Database.Database): number {
  const r = db.prepare('SELECT COUNT(*) AS n FROM mcp_servers').get() as { n: number };
  return r.n;
}

/** Is the (scope, name) pair already taken by another server? */
export function nameTaken(
  db: Database.Database,
  workspaceId: string | null,
  name: string,
  exceptId?: string,
): boolean {
  const row = db
    .prepare(
      `SELECT id FROM mcp_servers
       WHERE name = ? AND ((workspace_id IS NULL AND ? IS NULL) OR workspace_id = ?)
       LIMIT 1`,
    )
    .get(name, workspaceId, workspaceId) as { id: string } | undefined;
  return !!row && row.id !== exceptId;
}

/**
 * Insert or update a server row.
 *
 * `tools_json` is written on INSERT only — the UPDATE branch deliberately leaves
 * it alone. It is owned by `setToolsCache` (a probe result), not by the config
 * the user just edited, and clobbering it on every save would drop the cached
 * `readOnly` hints that `planAccess: 'annotated'` reads. That would make an
 * enabled server fail closed in plan/ask after each edit until the next probe
 * landed — and stay closed if the probe failed.
 */
export function upsertServer(db: Database.Database, cfg: McpServerConfig): void {
  db.prepare(
    `INSERT INTO mcp_servers (
       id, workspace_id, name, display_name, transport, command, args_json, env_json,
       cwd, url, headers_json, enabled, startup, trust, plan_access, timeout_ms, restart_policy,
       providers_json, allow_private_network, category, icon, source, tools_json,
       created_at, updated_at
     ) VALUES (
       @id, @workspace_id, @name, @display_name, @transport, @command, @args_json, @env_json,
       @cwd, @url, @headers_json, @enabled, @startup, @trust, @plan_access, @timeout_ms, @restart_policy,
       @providers_json, @allow_private_network, @category, @icon, @source, @tools_json,
       @created_at, @updated_at
     )
     ON CONFLICT(id) DO UPDATE SET
       workspace_id = @workspace_id, name = @name, display_name = @display_name,
       transport = @transport, command = @command, args_json = @args_json, env_json = @env_json,
       cwd = @cwd, url = @url, headers_json = @headers_json, enabled = @enabled,
       startup = @startup, trust = @trust, plan_access = @plan_access,
       timeout_ms = @timeout_ms, restart_policy = @restart_policy,
       providers_json = @providers_json, allow_private_network = @allow_private_network,
       category = @category, icon = @icon, source = @source,
       updated_at = @updated_at`,
  ).run({
    id: cfg.id,
    workspace_id: cfg.workspaceId ?? null,
    name: cfg.name,
    display_name: cfg.displayName,
    transport: cfg.transport,
    command: cfg.command ?? null,
    args_json: JSON.stringify(cfg.args),
    env_json: JSON.stringify(cfg.env),
    cwd: cfg.cwd ?? null,
    url: cfg.url ?? null,
    headers_json: JSON.stringify(cfg.headers),
    enabled: cfg.enabled ? 1 : 0,
    startup: cfg.startup,
    trust: cfg.trust,
    plan_access: cfg.planAccess,
    timeout_ms: cfg.timeoutMs,
    restart_policy: cfg.restartPolicy,
    providers_json: JSON.stringify(cfg.providers),
    allow_private_network: cfg.allowPrivateNetwork ? 1 : 0,
    category: cfg.category,
    icon: cfg.icon,
    source: cfg.source,
    tools_json: JSON.stringify([]),
    created_at: cfg.createdAt,
    updated_at: cfg.updatedAt,
  });
}

export function setToolsCache(db: Database.Database, id: string, tools: McpToolInfo[]): void {
  db.prepare('UPDATE mcp_servers SET tools_json = ? WHERE id = ?').run(
    JSON.stringify(tools.slice(0, MCP_LIMITS.maxTools)),
    id,
  );
}

export function setEnabledRow(db: Database.Database, id: string, enabled: boolean, updatedAt: number): void {
  db.prepare('UPDATE mcp_servers SET enabled = ?, updated_at = ? WHERE id = ?').run(
    enabled ? 1 : 0,
    updatedAt,
    id,
  );
}

export function deleteServer(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
}

/** Cached tools from the row (used for pre-probe display). */
export function cachedTools(db: Database.Database, id: string): McpToolInfo[] {
  const row = db.prepare('SELECT tools_json FROM mcp_servers WHERE id = ?').get(id) as
    | { tools_json: string }
    | undefined;
  return row ? parseTools(row.tools_json) : [];
}
