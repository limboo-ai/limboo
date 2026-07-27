/**
 * McpManager — the provider-independent MCP platform service, owned by the app
 * (not by any coding provider). It is the single owner of the MCP registry
 * (durable config in the `mcp_servers` table), the per-server secrets (in the
 * safeStorage SecretStore), the live runtime state (status / tools / latency),
 * and the health-probe client. Both agents CONSUME it: Claude via
 * `options.mcpServers`, Cursor via a generated `.cursor/mcp.json` — the manager
 * produces both from one registry so they can never drift, and every resulting
 * tool call still flows through `decideToolUse`.
 *
 * Security (CLAUDE.md §6): no plaintext secret ever lives in a row, on argv, in
 * an IPC payload to the renderer, or in a log line. Secret env/header values are
 * resolved from the SecretStore only at spawn / config-build time. Remote probes
 * are SSRF-guarded (see client/httpClient). Names are validated + reserved-name
 * blocked; every field is capped in validate.ts.
 */
import { BrowserWindow } from 'electron';
import { randomUUID, createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IpcEvents } from '@shared/ipc-channels';
import { MCP_LIMITS, MCP_RESERVED_NAMES } from '@shared/constants';
import type {
  McpLogLine,
  McpProbeResult,
  McpServerConfig,
  McpServerInfo,
  McpServerInput,
  McpServerRuntime,
  McpServerStatus,
} from '@shared/types';
import { logger } from '../../logger';
import { getDb } from '../../db/database';
import type { SecretStore } from '../../secrets/SecretStore';
import type { SettingsManager } from '../SettingsManager';
import type { WorkspaceManager } from '../WorkspaceManager';
import type { SessionManager } from '../SessionManager';
import {
  cachedTools,
  countServers,
  deleteServer,
  getServer,
  listServers,
  listAllServers,
  nameTaken,
  setEnabledRow,
  setToolsCache,
  upsertServer,
} from './registry';
import { prepareServer, isUnsafeKey } from './validate';
import { probeStdioServer } from './client/stdioClient';
import { probeHttpServer } from './client/httpClient';
import type { ProbeOutcome } from './client/protocol';
import { importProviderConfigs } from './import';

/** Config the Claude Agent SDK consumes (options.mcpServers). */
export interface ClaudeMcpInjection {
  servers: Record<string, unknown>;
  allowedTools: string[];
}

/**
 * Why a tool may (or may not) run in a read-only session mode. The reason drives
 * the denial message — see `McpManager.planVerdictFor`.
 */
export type McpPlanVerdict =
  | { ok: true }
  | { ok: false; reason: 'mcp-disabled' }
  | { ok: false; reason: 'unknown-server' }
  /** The server exists but belongs to another workspace. */
  | { ok: false; reason: 'out-of-scope'; server: string }
  /** planAccess === 'block'. */
  | { ok: false; reason: 'blocked'; server: string }
  /** planAccess === 'annotated' but the server never declared this tool read-only. */
  | { ok: false; reason: 'not-annotated'; server: string };

/**
 * Longest-prefix match of a fully-qualified `mcp__<server>__<tool>` name.
 *
 * PREFIX-matched, never split on `__`: `MCP_SERVER_NAME_RE` permits underscores
 * in a server name, so `mcp__my__server__do__thing` is genuinely ambiguous.
 */
function matchPrefix(
  configs: McpServerConfig[],
  qualified: string,
): { cfg: McpServerConfig; tool: string } | null {
  let best: { cfg: McpServerConfig; tool: string } | null = null;
  for (const cfg of configs) {
    if (!cfg.enabled) continue;
    const prefix = `mcp__${cfg.name}__`;
    if (!qualified.startsWith(prefix)) continue;
    if (!best || cfg.name.length > best.cfg.name.length) {
      best = { cfg, tool: qualified.slice(prefix.length) };
    }
  }
  return best;
}

/** Config the Cursor runtime consumes (merged into .cursor/mcp.json). */
export interface CursorMcpInjection {
  userServers: Record<string, unknown>;
  allowRules: string[];
  /**
   * Extra `Mcp(...)` rules that apply ONLY to a plan/ask run — the tools the
   * user declared reachable in the read-only modes. Kept separate from
   * `allowRules` so the caller splices them per mode rather than always.
   */
  planAllowRules: string[];
  /** Env vars carrying resolved secret values, referenced as ${env:NAME} in the file. */
  secretEnv: Record<string, string>;
}

export class McpManager {
  private readonly runtime = new Map<string, McpServerRuntime>();
  private readonly logsRing = new Map<string, McpLogLine[]>();
  private readonly probing = new Set<string>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private unsubscribeSettings: (() => void) | null = null;
  /**
   * Setter-injected (mirrors `agent.setSessionManager` / `setSessionRootResolver`
   * in the composition root): McpManager is constructed before SessionManager is
   * wired, and must not hard-depend on it. Used only to resolve a session to its
   * workspace — see `scopeFor`.
   */
  private sessions: SessionManager | null = null;

  constructor(
    private readonly secrets: SecretStore,
    private readonly settings: SettingsManager,
    private readonly workspace: WorkspaceManager,
  ) {}

  /** Wire the session lookup used to resolve a run's workspace. See `scopeFor`. */
  setSessionManager(sessions: SessionManager): void {
    this.sessions = sessions;
  }

  /** Begin the heartbeat + probe eager servers. Called once after app-ready. */
  start(): void {
    this.unsubscribeSettings = this.settings.onChange(() => this.retuneHeartbeat());
    this.retuneHeartbeat();
    if (!this.settings.getAll().mcp.enabled) return;
    for (const cfg of this.scoped()) {
      if (cfg.enabled && cfg.startup === 'eager') void this.probe(cfg);
    }
  }

  dispose(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
  }

  /** Re-broadcast the active-scope list (e.g. after the active workspace changes). */
  refresh(): void {
    this.broadcastServers();
  }

  /* --------------------------------------------------------------- queries */

  list(): McpServerInfo[] {
    return this.scoped().map((cfg) => ({ ...cfg, runtime: this.runtimeFor(cfg.id) }));
  }

  get(id: string): McpServerInfo | null {
    const cfg = getServer(getDb(), id);
    return cfg ? { ...cfg, runtime: this.runtimeFor(id) } : null;
  }

  logs(id: string): McpLogLine[] {
    return this.logsRing.get(id) ?? [];
  }

  /* -------------------------------------------------------------- mutations */

  add(input: McpServerInput): McpServerInfo {
    const db = getDb();
    if (countServers(db) >= MCP_LIMITS.maxServers) {
      throw new Error(`Too many MCP servers (max ${MCP_LIMITS.maxServers}).`);
    }
    const prepared = prepareServer(input, { defaultTrust: this.settings.getAll().mcp.defaultTrust });
    if (nameTaken(db, prepared.fields.workspaceId, prepared.fields.name)) {
      throw new Error(`A server named "${prepared.fields.name}" already exists in this scope.`);
    }
    const id = randomUUID();
    const env = { ...prepared.env };
    const headers = { ...prepared.headers };
    this.storeSecrets(id, 'e', prepared.secretEnv, env);
    this.storeSecrets(id, 'h', prepared.secretHeaders, headers);
    const now = Date.now();
    const cfg: McpServerConfig = {
      id,
      ...prepared.fields,
      env,
      headers,
      source: 'user',
      createdAt: now,
      updatedAt: now,
    };
    upsertServer(db, cfg);
    this.broadcastServers();
    if (cfg.enabled) void this.probe(cfg);
    return { ...cfg, runtime: this.runtimeFor(id) };
  }

  update(id: string, input: McpServerInput): McpServerInfo {
    const db = getDb();
    const existing = getServer(db, id);
    if (!existing) throw new Error('Server not found.');
    const prepared = prepareServer(
      { ...input, workspaceId: existing.workspaceId ?? undefined },
      { defaultTrust: this.settings.getAll().mcp.defaultTrust },
    );
    if (nameTaken(db, prepared.fields.workspaceId, prepared.fields.name, id)) {
      throw new Error(`A server named "${prepared.fields.name}" already exists in this scope.`);
    }
    const env = { ...prepared.env };
    const headers = { ...prepared.headers };
    this.applySecretUpdate(id, 'e', existing.env, prepared.secretEnv, prepared.keepSecrets, env);
    this.applySecretUpdate(id, 'h', existing.headers, prepared.secretHeaders, prepared.keepSecrets, headers);
    const cfg: McpServerConfig = {
      ...existing,
      ...prepared.fields,
      env,
      headers,
      updatedAt: Date.now(),
    };
    upsertServer(db, cfg);
    this.broadcastServers();
    if (cfg.enabled) void this.probe(cfg);
    return { ...cfg, runtime: this.runtimeFor(id) };
  }

  remove(id: string): void {
    const db = getDb();
    const cfg = getServer(db, id);
    if (cfg) {
      for (const [k, fv] of Object.entries(cfg.env)) {
        if (fv.secret) this.safeRemoveSecret(this.secretName(id, 'e', k));
      }
      for (const [k, fv] of Object.entries(cfg.headers)) {
        if (fv.secret) this.safeRemoveSecret(this.secretName(id, 'h', k));
      }
    }
    deleteServer(db, id);
    this.runtime.delete(id);
    this.logsRing.delete(id);
    this.broadcastServers();
  }

  setEnabled(id: string, on: boolean): void {
    const db = getDb();
    const cfg = getServer(db, id);
    if (!cfg) return;
    setEnabledRow(db, id, on, Date.now());
    this.setStatus(id, { status: on ? 'connecting' : 'disconnected', error: undefined });
    this.broadcastServers();
    if (on) void this.probe({ ...cfg, enabled: true });
  }

  /** UI "connect" — enable + probe. */
  connect(id: string): void {
    this.setEnabled(id, true);
  }

  /** UI "disconnect" — disable (stops injection) + mark offline. */
  disconnect(id: string): void {
    this.setEnabled(id, false);
  }

  /** Manual "test connection" — probe now and return the outcome. */
  async test(id: string): Promise<McpProbeResult> {
    const cfg = getServer(getDb(), id);
    if (!cfg) return { ok: false, status: 'error', tools: [], error: 'Server not found.' };
    const outcome = await this.probe(cfg);
    return {
      ok: outcome.ok,
      status: outcome.ok ? 'connected' : outcome.authRequired ? 'needs-auth' : 'error',
      tools: outcome.tools,
      latencyMs: outcome.latencyMs,
      error: outcome.error,
    };
  }

  async refreshTools(id: string): Promise<McpServerInfo | null> {
    const cfg = getServer(getDb(), id);
    if (!cfg) return null;
    await this.probe(cfg);
    return this.get(id);
  }

  /** Import from the active workspace's provider config files. */
  importActive(): number {
    const ws = this.workspace.getActive();
    return ws ? this.importFromProviders(ws.path) : 0;
  }

  /** Export the given servers to the active workspace's committed config files. */
  exportActive(ids: string[]): { cursor: boolean; claude: boolean } {
    const ws = this.workspace.getActive();
    return ws ? this.exportToProject(ids, ws.path) : { cursor: false, claude: false };
  }

  /** Discover + import servers from the providers' existing config files. */
  importFromProviders(root: string): number {
    const s = this.settings.getAll().mcp;
    const candidates = importProviderConfigs(root, { cursor: s.autoImport.cursor, claude: s.autoImport.claude });
    const db = getDb();
    let added = 0;
    for (const c of candidates) {
      if (countServers(db) >= MCP_LIMITS.maxServers) break;
      if (MCP_RESERVED_NAMES.has(c.input.name)) continue;
      if (nameTaken(db, null, c.input.name)) continue;
      try {
        const prepared = prepareServer({ ...c.input, enabled: false }, { defaultTrust: s.defaultTrust });
        const id = randomUUID();
        const now = Date.now();
        upsertServer(db, {
          id,
          ...prepared.fields,
          env: prepared.env,
          headers: prepared.headers,
          source: c.source,
          createdAt: now,
          updatedAt: now,
        });
        added += 1;
      } catch (err) {
        logger.warn(`MCP import: skipped "${c.input.name}"`, err);
      }
    }
    if (added) this.broadcastServers();
    return added;
  }

  /**
   * Explicit "export to project" — write the selected servers into the repo's
   * committed provider config files so a team shares them. Secrets are written
   * as ${env:VAR} / ${VAR} references, never plaintext, so the file stays
   * commit-safe. This intentionally dirties the working tree (it is a user
   * action outside any run, unlike the git-clean per-run injection).
   */
  exportToProject(ids: string[], root: string): { cursor: boolean; claude: boolean } {
    const db = getDb();
    const selected = ids
      .map((id) => getServer(db, id))
      .filter((c): c is McpServerConfig => !!c);
    if (selected.length === 0) return { cursor: false, claude: false };

    const cursorServers: Record<string, unknown> = {};
    const claudeServers: Record<string, unknown> = {};
    for (const cfg of selected) {
      const envRef = (k: string, fv: { value: string; secret: boolean }, style: 'cursor' | 'claude') => {
        if (!fv.secret) return fv.value;
        const varName = `${cfg.name}_${k}`.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
        return style === 'cursor' ? `\${env:${varName}}` : `\${${varName}}`;
      };
      if (cfg.transport === 'stdio') {
        const cEnv: Record<string, string> = {};
        const kEnv: Record<string, string> = {};
        for (const [k, fv] of Object.entries(cfg.env)) {
          cEnv[k] = envRef(k, fv, 'cursor');
          kEnv[k] = envRef(k, fv, 'claude');
        }
        cursorServers[cfg.name] = { command: cfg.command, args: cfg.args, env: cEnv };
        claudeServers[cfg.name] = { command: cfg.command, args: cfg.args, env: kEnv };
      } else {
        const cHdr: Record<string, string> = {};
        const kHdr: Record<string, string> = {};
        for (const [k, fv] of Object.entries(cfg.headers)) {
          cHdr[k] = envRef(k, fv, 'cursor');
          kHdr[k] = envRef(k, fv, 'claude');
        }
        cursorServers[cfg.name] = { url: cfg.url, headers: cHdr };
        claudeServers[cfg.name] = { type: cfg.transport, url: cfg.url, headers: kHdr };
      }
    }
    const cursorOk = this.mergeIntoFile(path.join(root, '.cursor', 'mcp.json'), cursorServers, root);
    const claudeOk = this.mergeIntoFile(path.join(root, '.mcp.json'), claudeServers, root);
    return { cursor: cursorOk, claude: claudeOk };
  }

  /* ------------------------------------------------------ injection producers */

  /** Servers to inject into a Claude run (options.mcpServers) + trusted allow list. */
  claudeServersFor(sessionId: string, scope?: string | null): ClaudeMcpInjection {
    const s = this.settings.getAll().mcp;
    if (!s.enabled || !s.injectIntoClaude) return { servers: {}, allowedTools: [] };
    const servers: Record<string, unknown> = {};
    const allowedTools: string[] = [];
    for (const cfg of this.injectable('claude', sessionId, scope)) {
      if (cfg.transport === 'stdio') {
        servers[cfg.name] = { command: cfg.command, args: cfg.args, env: this.resolveEnv(cfg) };
      } else {
        servers[cfg.name] = { type: cfg.transport, url: cfg.url, headers: this.resolveHeaders(cfg) };
      }
      if (cfg.trust === 'trusted') allowedTools.push(`mcp__${cfg.name}__*`);
    }
    return { servers, allowedTools };
  }

  /** Servers to inject into a Cursor run (.cursor/mcp.json) + allow rules + secret env. */
  cursorSpecFor(sessionId: string, scope?: string | null): CursorMcpInjection {
    const s = this.settings.getAll().mcp;
    if (!s.enabled || !s.injectIntoCursor)
      return { userServers: {}, allowRules: [], planAllowRules: [], secretEnv: {} };
    const userServers: Record<string, unknown> = {};
    const allowRules: string[] = [];
    const planAllowRules: string[] = [];
    const secretEnv: Record<string, string> = {};
    for (const cfg of this.injectable('cursor', sessionId, scope)) {
      if (cfg.transport === 'stdio') {
        const env: Record<string, string> = {};
        for (const [k, fv] of Object.entries(cfg.env)) {
          env[k] = this.cursorRef(cfg.id, 'e', k, fv, secretEnv);
        }
        userServers[cfg.name] = { command: cfg.command, args: cfg.args, env };
      } else {
        const headers: Record<string, string> = {};
        for (const [k, fv] of Object.entries(cfg.headers)) {
          headers[k] = this.cursorRef(cfg.id, 'h', k, fv, secretEnv);
        }
        userServers[cfg.name] =
          cfg.transport === 'sse'
            ? { type: 'sse', url: cfg.url, headers }
            : { url: cfg.url, headers };
      }
      if (cfg.trust === 'trusted') allowRules.push(`Mcp(${cfg.name}:*)`);
      if (cfg.planAccess === 'all') {
        planAllowRules.push(`Mcp(${cfg.name}:*)`);
      } else if (cfg.planAccess === 'annotated') {
        for (const t of cachedTools(getDb(), cfg.id)) {
          if (t.readOnly === true) planAllowRules.push(`Mcp(${cfg.name}:${t.name})`);
        }
      }
    }
    return { userServers, allowRules, planAllowRules, secretEnv };
  }

  /** `mcp__<name>__` prefixes of trusted, enabled, in-scope servers (both providers). */
  trustedToolMatchers(sessionId: string, scope?: string | null): string[] {
    if (!this.settings.getAll().mcp.enabled) return [];
    return this.scoped(sessionId, scope)
      .filter((c) => c.enabled && c.trust === 'trusted')
      .map((c) => `mcp__${c.name}__`);
  }

  /**
   * May a plan/ask run read RESOURCES from this server?
   *
   * MCP resources are read-only by definition, but `ReadMcpResource` names a
   * SERVER — so allowing it blindly would reach straight past that server's
   * `planAccess: 'block'`. The per-server setting stays the single authority
   * over that server's data, tools and resources alike. Resources carry no
   * per-item readOnlyHint, so 'annotated' and 'all' both qualify.
   */
  resourceReadableIn(serverName: string, sessionId: string, scope?: string | null): boolean {
    if (!this.settings.getAll().mcp.enabled) return false;
    const cfg = this.scoped(sessionId, scope).find((c) => c.enabled && c.name === serverName);
    return !!cfg && cfg.planAccess !== 'block';
  }

  /**
   * Resolve a fully-qualified `mcp__<server>__<tool>` name back to its config.
   *
   * PREFIX-matched, never split on `__`: `MCP_SERVER_NAME_RE` permits underscores
   * in a server name, so `mcp__my__server__do__thing` is genuinely ambiguous.
   * Longest matching prefix wins, and the remainder is the tool name.
   */
  private resolveMcpTool(
    qualified: string,
    sessionId?: string,
    scope?: string | null,
  ): { cfg: McpServerConfig; tool: string } | null {
    if (!this.settings.getAll().mcp.enabled) return null;
    return matchPrefix(this.scoped(sessionId, scope), qualified);
  }

  /**
   * May this tool run inside a read-only session mode (`plan` / `ask`), and if
   * not, WHY?
   *
   * The reason is load-bearing, not decoration: a denial here used to blame the
   * `planAccess` setting unconditionally, which is simply wrong when the server
   * is unknown, out of scope, or merely untrusted — and it sent the user to a
   * settings field that was already correct.
   *
   * This answers "is it read-only", NOT "is it approved" — the permission gate
   * still runs on top, so a tool that qualifies here still prompts unless the
   * server is separately marked trusted.
   *
   * Reads the DURABLE tool cache rather than `this.runtime`, which is empty
   * after a restart until the server is probed again. An empty cache therefore
   * FAILS CLOSED: an enabled server is probed on add/update/enable/eager-start
   * and by the heartbeat, so "no cached tools" means it never connected, and
   * denying is the correct reading of that.
   */
  planVerdictFor(qualified: string, sessionId: string, scope?: string | null): McpPlanVerdict {
    if (!this.settings.getAll().mcp.enabled) return { ok: false, reason: 'mcp-disabled' };
    const hit = this.resolveMcpTool(qualified, sessionId, scope);
    if (!hit) {
      // Distinguish "no such server" from "wrong workspace". Unscoped lookup,
      // deny path only — never an input to an allow decision.
      const other = matchPrefix(listAllServers(getDb()), qualified);
      return other
        ? { ok: false, reason: 'out-of-scope', server: other.cfg.name }
        : { ok: false, reason: 'unknown-server' };
    }
    const server = hit.cfg.name;
    if (hit.cfg.planAccess === 'block') return { ok: false, reason: 'blocked', server };
    if (hit.cfg.planAccess === 'all') return { ok: true };
    const declared = cachedTools(getDb(), hit.cfg.id).some(
      (t) => t.name === hit.tool && t.readOnly === true,
    );
    return declared ? { ok: true } : { ok: false, reason: 'not-annotated', server };
  }

  /**
   * Fully-qualified tool names to put in a Claude PLAN run's `options.allowedTools`.
   *
   * This exists only to get past the Agent SDK's own plan-mode block, which
   * auto-denies `mcp__*` before `canUseTool` is ever consulted. Entries here
   * "execute automatically without asking the user for approval" (the SDK's own
   * words), so membership requires an explicit human decision — one of exactly
   * two, mirroring the MCP spec's trusted/untrusted split:
   *
   *   planAccess 'all'       — the USER asserted, per server and out of band,
   *                            that this server only reads. Their machine,
   *                            their claim; it stands on its own, and it is a
   *                            more deliberate act than clicking a mid-run
   *                            dialog. Trust is NOT additionally required.
   *   planAccess 'annotated' — the claim comes from the SERVER's own
   *                            readOnlyHint, and the spec says a client must
   *                            treat annotations as untrusted unless the server
   *                            is trusted. So this case DOES require
   *                            `trust: 'trusted'`.
   *
   * 'block' never qualifies. Nothing else reaches this list, so a run can never
   * silently skip a prompt the user did not already answer.
   *
   * Exact names, never a `mcp__<server>__*` wildcard: a wildcard would readmit
   * that server's WRITE tools past the SDK's block. The single exception is a
   * server the user declared read-only wholesale and which has no cached tools
   * to enumerate.
   */
  planAllowedToolsFor(sessionId: string, scope?: string | null): string[] {
    const s = this.settings.getAll().mcp;
    if (!s.enabled || !s.injectIntoClaude) return [];
    const out: string[] = [];
    for (const cfg of this.injectable('claude', sessionId, scope)) {
      if (cfg.planAccess === 'block') continue;
      if (cfg.planAccess === 'annotated' && cfg.trust !== 'trusted') continue;
      const tools = cachedTools(getDb(), cfg.id);
      if (cfg.planAccess === 'all') {
        if (tools.length === 0) out.push(`mcp__${cfg.name}__*`);
        else for (const t of tools) out.push(`mcp__${cfg.name}__${t.name}`);
      } else {
        for (const t of tools) {
          if (t.readOnly === true) out.push(`mcp__${cfg.name}__${t.name}`);
        }
      }
      if (out.length >= MCP_LIMITS.maxPlanAllowedTools) break;
    }
    return out.slice(0, MCP_LIMITS.maxPlanAllowedTools);
  }

  /* --------------------------------------------------------------- internals */

  private scoped(sessionId?: string, scope?: string | null): McpServerConfig[] {
    return listServers(getDb(), this.scopeFor(sessionId, scope));
  }

  private injectable(
    provider: 'claude' | 'cursor',
    sessionId?: string,
    scope?: string | null,
  ): McpServerConfig[] {
    return this.scoped(sessionId, scope).filter((c) => c.enabled && c.providers[provider]);
  }

  /**
   * The workspace whose MCP servers a call may see.
   *
   * Callers with no session — the UI list, the heartbeat, eager startup,
   * import/export — legitimately follow the ACTIVE workspace. A run-path caller
   * always passes a session, and resolves through that session's own workspace
   * (`sessions.workspace_id` is TEXT NOT NULL, so the session always knows).
   * `scope` is the workspace pinned on the run record at run start; it wins,
   * because the run's servers were injected from it and the live gate must
   * answer for the same set even if the active workspace changes mid-run.
   *
   * Same shape as `WorktreeManager.resolveSessionRoot`, including the
   * `workspace.getById` validity check so a stale id cannot silently collapse
   * the scope.
   *
   * The fallback is the ACTIVE workspace, not global-only. Narrowing looks
   * safer but is not: on the gate side a narrow scope fails closed (fine), but
   * on the INJECTION side it means the server is never registered with the
   * provider at all, so the model gets an opaque "no such tool" instead of a
   * gate decision. Both sides run through this one function precisely so they
   * cannot disagree — that disagreement is the bug this exists to prevent.
   */
  private scopeFor(sessionId?: string, scope?: string | null): string | null {
    if (scope && this.workspace.getById(scope)) return scope;
    if (!sessionId) return this.activeWorkspaceId();
    const ws = this.sessions?.get(sessionId)?.workspaceId;
    if (ws && this.workspace.getById(ws)) return ws;
    return this.activeWorkspaceId();
  }

  private activeWorkspaceId(): string | null {
    try {
      return this.workspace.getActive()?.id ?? null;
    } catch {
      return null;
    }
  }

  private runtimeFor(id: string): McpServerRuntime {
    let r = this.runtime.get(id);
    if (!r) {
      r = { status: 'disconnected', tools: cachedTools(getDb(), id) };
      this.runtime.set(id, r);
    }
    return r;
  }

  private setStatus(id: string, patch: Partial<McpServerRuntime>): void {
    const next: McpServerRuntime = { ...this.runtimeFor(id), ...patch };
    this.runtime.set(id, next);
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcEvents.mcpServerStatus, { id, runtime: next });
    }
  }

  private async probe(cfg: McpServerConfig): Promise<ProbeOutcome> {
    if (!this.settings.getAll().mcp.enabled) {
      return { ok: false, tools: [], latencyMs: 0, error: 'MCP is disabled in Settings.' };
    }
    if (this.probing.has(cfg.id)) {
      const r = this.runtimeFor(cfg.id);
      return { ok: r.status === 'connected', tools: r.tools, latencyMs: r.latencyMs ?? 0, error: r.error };
    }
    this.probing.add(cfg.id);
    this.setStatus(cfg.id, { status: 'connecting' });
    try {
      const timeoutMs = this.settings.getAll().mcp.probeTimeout;
      let outcome: ProbeOutcome;
      if (cfg.transport === 'stdio') {
        outcome = await probeStdioServer({
          command: cfg.command ?? '',
          args: cfg.args,
          env: this.resolveEnv(cfg),
          cwd: cfg.cwd,
          timeoutMs,
        });
      } else {
        outcome = await probeHttpServer({
          url: cfg.url ?? '',
          headers: this.resolveHeaders(cfg),
          timeoutMs,
          allowPrivate: cfg.allowPrivateNetwork || this.settings.getAll().mcp.allowPrivateNetwork,
        });
      }
      const status: McpServerStatus = outcome.ok
        ? 'connected'
        : outcome.authRequired
          ? 'needs-auth'
          : 'error';
      this.setStatus(cfg.id, {
        status,
        tools: outcome.ok ? outcome.tools : this.runtimeFor(cfg.id).tools,
        latencyMs: outcome.latencyMs,
        lastProbeAt: Date.now(),
        error: outcome.ok ? undefined : outcome.error,
      });
      if (outcome.ok) setToolsCache(getDb(), cfg.id, outcome.tools);
      this.log(
        cfg.id,
        outcome.ok ? 'info' : 'error',
        outcome.ok
          ? `Connected · ${outcome.tools.length} tool(s) · ${outcome.latencyMs}ms`
          : `Probe failed: ${outcome.error ?? 'unknown error'}`,
      );
      return outcome;
    } finally {
      this.probing.delete(cfg.id);
    }
  }

  private resolveEnv(cfg: McpServerConfig): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, fv] of Object.entries(cfg.env)) {
      out[k] = fv.secret ? this.secrets.getDecrypted(this.secretName(cfg.id, 'e', k)) ?? '' : fv.value;
    }
    return out;
  }

  private resolveHeaders(cfg: McpServerConfig): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, fv] of Object.entries(cfg.headers)) {
      out[k] = fv.secret ? this.secrets.getDecrypted(this.secretName(cfg.id, 'h', k)) ?? '' : fv.value;
    }
    return out;
  }

  /** Cursor field value: non-secret inline, secret as ${env:VAR} + real value into secretEnv. */
  private cursorRef(
    id: string,
    kind: 'e' | 'h',
    key: string,
    fv: { value: string; secret: boolean },
    secretEnv: Record<string, string>,
  ): string {
    if (!fv.secret) return fv.value;
    const value = this.secrets.getDecrypted(this.secretName(id, kind, key));
    if (value == null) return '';
    const varName = this.envVarFor(id, kind, key);
    secretEnv[varName] = value;
    return `\${env:${varName}}`;
  }

  private storeSecrets(
    id: string,
    kind: 'e' | 'h',
    secrets: Record<string, string>,
    out: Record<string, { value: string; secret: boolean }>,
  ): void {
    for (const [k, v] of Object.entries(secrets)) {
      if (this.safeSetSecret(this.secretName(id, kind, k), v)) {
        out[k] = { value: '', secret: true };
      }
    }
  }

  private applySecretUpdate(
    id: string,
    kind: 'e' | 'h',
    existing: Record<string, { value: string; secret: boolean }>,
    newSecrets: Record<string, string>,
    keepKeys: string[],
    out: Record<string, { value: string; secret: boolean }>,
  ): void {
    const keep = new Set(keepKeys);
    for (const [k, v] of Object.entries(newSecrets)) {
      if (this.safeSetSecret(this.secretName(id, kind, k), v)) out[k] = { value: '', secret: true };
    }
    for (const [k, fv] of Object.entries(existing)) {
      if (fv.secret && keep.has(k) && !(k in newSecrets)) out[k] = { value: '', secret: true };
    }
    for (const [k, fv] of Object.entries(existing)) {
      if (fv.secret && !out[k]?.secret) this.safeRemoveSecret(this.secretName(id, kind, k));
    }
  }

  private safeSetSecret(name: string, value: string): boolean {
    try {
      this.secrets.set(name, value);
      return true;
    } catch (err) {
      logger.warn(`MCP: could not store secret "${name}" (encryption unavailable?)`, err);
      return false;
    }
  }

  private safeRemoveSecret(name: string): void {
    try {
      this.secrets.remove(name);
    } catch {
      /* best-effort */
    }
  }

  private secretName(id: string, kind: 'e' | 'h', key: string): string {
    const h = createHash('sha1').update(`${kind}\0${key}`).digest('hex').slice(0, 20);
    return `mcp-${id}-${h}`;
  }

  private envVarFor(id: string, kind: 'e' | 'h', key: string): string {
    const h = createHash('sha1').update(`${kind}\0${key}`).digest('hex').slice(0, 12).toUpperCase();
    return `LIMBOO_MCP_${id.replace(/-/g, '').toUpperCase()}_${kind.toUpperCase()}_${h}`;
  }

  private log(id: string, level: McpLogLine['level'], text: string): void {
    const ring = this.logsRing.get(id) ?? [];
    ring.push({ at: Date.now(), level, text: text.slice(0, 400) });
    if (ring.length > MCP_LIMITS.logRingMax) ring.splice(0, ring.length - MCP_LIMITS.logRingMax);
    this.logsRing.set(id, ring);
  }

  private broadcastServers(): void {
    const servers = this.list();
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IpcEvents.mcpServersChanged, { servers });
    }
  }

  private retuneHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    const s = this.settings.getAll().mcp;
    if (!s.enabled || s.heartbeatInterval <= 0) return;
    this.heartbeatTimer = setInterval(() => this.heartbeat(), s.heartbeatInterval);
    if (typeof this.heartbeatTimer.unref === 'function') this.heartbeatTimer.unref();
  }

  private heartbeat(): void {
    for (const cfg of this.scoped()) {
      if (cfg.enabled && !this.probing.has(cfg.id)) void this.probe(cfg);
    }
  }

  /** Merge server entries into a provider config file under root (git-visible). */
  private mergeIntoFile(file: string, servers: Record<string, unknown>, root: string): boolean {
    // Resolve BOTH sides before comparing — an un-normalized `root` (e.g. one
    // containing `..`) must not defeat the containment check.
    const base = path.resolve(root);
    const resolved = path.resolve(file);
    if (resolved !== base && !resolved.startsWith(base + path.sep)) return false;
    // Symlink-escape guard: realpath the deepest EXISTING ancestor of the target
    // and require it to still sit inside the real base, so a symlinked `.cursor/`
    // (or any parent) pointing outside the repo can't redirect the write.
    if (!this.pathStaysInside(resolved, base)) return false;
    try {
      // Parse any existing file, then rebuild it prototype-safely: an on-disk
      // file is untrusted input, so a smuggled `__proto__`/`constructor` key
      // (top-level or under mcpServers) is dropped, never assigned.
      const existing = this.readSafeObject(resolved);
      const prior =
        existing.mcpServers && typeof existing.mcpServers === 'object' && !Array.isArray(existing.mcpServers)
          ? (existing.mcpServers as Record<string, unknown>)
          : {};
      const mcpServers: Record<string, unknown> = {};
      for (const [name, def] of Object.entries(prior)) {
        if (isUnsafeKey(name)) continue;
        mcpServers[name] = def;
      }
      for (const [name, def] of Object.entries(servers)) {
        if (isUnsafeKey(name)) continue;
        mcpServers[name] = def;
      }
      existing.mcpServers = mcpServers;
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
      return true;
    } catch (err) {
      logger.warn(`MCP export: could not write ${file}`, err);
      return false;
    }
  }

  /**
   * Read a JSON object file, returning a prototype-safe own-property copy (unsafe
   * keys stripped) or `{}` when absent/invalid. The parsed value is never trusted
   * wholesale — only its safe own keys are carried forward.
   */
  private readSafeObject(file: string): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (!isUnsafeKey(k)) out[k] = v;
        }
      }
    } catch {
      /* absent or invalid — treat as a new file */
    }
    return out;
  }

  /**
   * True if `target`'s real filesystem location stays inside `base`, following
   * symlinks on the deepest existing ancestor (the target itself may not exist).
   */
  private pathStaysInside(target: string, base: string): boolean {
    try {
      const realBase = fs.realpathSync(base);
      let ancestor = target;
      // Walk up to the first path that actually exists on disk.
      for (;;) {
        try {
          const real = fs.realpathSync(ancestor);
          return real === realBase || real.startsWith(realBase + path.sep);
        } catch {
          const parent = path.dirname(ancestor);
          if (parent === ancestor) return false; // reached the fs root
          ancestor = parent;
        }
      }
    } catch {
      // base itself is missing/unresolvable — fail closed.
      return false;
    }
  }
}
