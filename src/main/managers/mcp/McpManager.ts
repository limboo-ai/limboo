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
import {
  cachedTools,
  countServers,
  deleteServer,
  getServer,
  listServers,
  nameTaken,
  setEnabledRow,
  setToolsCache,
  upsertServer,
} from './registry';
import { prepareServer } from './validate';
import { probeStdioServer } from './client/stdioClient';
import { probeHttpServer } from './client/httpClient';
import type { ProbeOutcome } from './client/protocol';
import { importProviderConfigs } from './import';

/** Config the Claude Agent SDK consumes (options.mcpServers). */
export interface ClaudeMcpInjection {
  servers: Record<string, unknown>;
  allowedTools: string[];
}

/** Config the Cursor runtime consumes (merged into .cursor/mcp.json). */
export interface CursorMcpInjection {
  userServers: Record<string, unknown>;
  allowRules: string[];
  /** Env vars carrying resolved secret values, referenced as ${env:NAME} in the file. */
  secretEnv: Record<string, string>;
}

export class McpManager {
  private readonly runtime = new Map<string, McpServerRuntime>();
  private readonly logsRing = new Map<string, McpLogLine[]>();
  private readonly probing = new Set<string>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private unsubscribeSettings: (() => void) | null = null;

  constructor(
    private readonly secrets: SecretStore,
    private readonly settings: SettingsManager,
    private readonly workspace: WorkspaceManager,
  ) {}

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
  claudeServersFor(): ClaudeMcpInjection {
    const s = this.settings.getAll().mcp;
    if (!s.enabled || !s.injectIntoClaude) return { servers: {}, allowedTools: [] };
    const servers: Record<string, unknown> = {};
    const allowedTools: string[] = [];
    for (const cfg of this.injectable('claude')) {
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
  cursorSpecFor(): CursorMcpInjection {
    const s = this.settings.getAll().mcp;
    if (!s.enabled || !s.injectIntoCursor) return { userServers: {}, allowRules: [], secretEnv: {} };
    const userServers: Record<string, unknown> = {};
    const allowRules: string[] = [];
    const secretEnv: Record<string, string> = {};
    for (const cfg of this.injectable('cursor')) {
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
    }
    return { userServers, allowRules, secretEnv };
  }

  /** `mcp__<name>__` prefixes of trusted, enabled, in-scope servers (both providers). */
  trustedToolMatchers(): string[] {
    if (!this.settings.getAll().mcp.enabled) return [];
    return this.scoped()
      .filter((c) => c.enabled && c.trust === 'trusted')
      .map((c) => `mcp__${c.name}__`);
  }

  /* --------------------------------------------------------------- internals */

  private scoped(): McpServerConfig[] {
    return listServers(getDb(), this.activeWorkspaceId());
  }

  private injectable(provider: 'claude' | 'cursor'): McpServerConfig[] {
    return this.scoped().filter((c) => c.enabled && c.providers[provider]);
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
    const resolved = path.resolve(file);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) return false;
    try {
      let existing: Record<string, unknown> = {};
      try {
        const raw = fs.readFileSync(resolved, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          existing = parsed as Record<string, unknown>;
        }
      } catch {
        /* new file */
      }
      const mcpServers =
        existing.mcpServers && typeof existing.mcpServers === 'object' && !Array.isArray(existing.mcpServers)
          ? (existing.mcpServers as Record<string, unknown>)
          : {};
      for (const [name, def] of Object.entries(servers)) {
        if (name === '__proto__' || name === 'constructor' || name === 'prototype') continue;
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
}
