/**
 * SettingsManager — the single owner of persistent user preferences.
 *
 * Settings are stored as JSON under `userData/settings.json`, deep-merged with
 * defaults on load (so new keys appear automatically), clamped to valid ranges,
 * and broadcast to all renderers whenever they change.
 */
import { BrowserWindow } from 'electron';
import type { AppSettings, DeepPartial } from '@shared/types';
import {
  AGENT_CONNECTION_LIMITS,
  AGENT_LIMITS,
  ATTACHMENT_LIMITS,
  CHAT_FONTS,
  CURSOR_LIMITS,
  CURSOR_MODEL_ID_RE,
  DEFAULT_SETTINGS,
  FONT_SCALE_LIMITS,
  GIT_LIMITS,
  GRAPH_LIMITS,
  LAYOUT_LIMITS,
  MCP_LIMITS,
  MEMORY_LIMITS,
  RESUME_LIMITS,
  SANDBOX_DOMAIN_RE,
  SANDBOX_LIMITS,
  SEARCH_LIMITS,
  SETTINGS_VERSION,
  VOICE_LIMITS,
  WORKTREE_LIMITS,
  clamp,
} from '@shared/constants';
import { IpcEvents } from '@shared/ipc-channels';
import { screenExtraWritePath } from './sandbox/policy';
import { readJson, writeJson } from '../storage';
import { logger } from '../logger';

const FILE = 'settings.json';

export class SettingsManager {
  private settings: AppSettings;
  /** In-process listeners (e.g. the AgentManager re-tuning its heartbeat). */
  private readonly listeners = new Set<(settings: AppSettings) => void>();

  constructor() {
    const stored = readJson<Partial<AppSettings>>(FILE, {});
    this.settings = this.normalize(stored);
    // Persist back so the file always reflects the current (migrated) shape.
    writeJson(FILE, this.settings);
  }

  getAll(): AppSettings {
    return this.settings;
  }

  /** Subscribe to in-process settings changes. Returns an unsubscribe fn. */
  onChange(listener: (settings: AppSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Replace settings with a deep-merged patch. Returns the full, normalized
   * settings object and notifies renderers.
   */
  update(patch: DeepPartial<AppSettings>): AppSettings {
    this.settings = this.normalize(deepMerge(this.settings, patch));
    writeJson(FILE, this.settings);
    this.broadcast();
    return this.settings;
  }

  reset(): AppSettings {
    this.settings = { ...DEFAULT_SETTINGS };
    writeJson(FILE, this.settings);
    this.broadcast();
    return this.settings;
  }

  private broadcast(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IpcEvents.settingsChanged, this.settings);
      }
    }
    for (const listener of this.listeners) {
      try {
        listener(this.settings);
      } catch {
        /* a listener failure must never break settings propagation */
      }
    }
  }

  /** Merge with defaults, run migrations, and clamp numeric ranges. */
  private normalize(input: Partial<AppSettings>): AppSettings {
    const merged = deepMerge(DEFAULT_SETTINGS, (input ?? {}) as DeepPartial<AppSettings>);

    if (merged.version !== SETTINGS_VERSION) {
      logger.info(`Migrating settings v${merged.version} -> v${SETTINGS_VERSION}`);
      merged.version = SETTINGS_VERSION;
    }

    merged.appearance.fontScale = clamp(
      merged.appearance.fontScale,
      FONT_SCALE_LIMITS.min,
      FONT_SCALE_LIMITS.max,
    );
    // Allowlist — a renderer-supplied font id must never inject arbitrary CSS.
    if (!CHAT_FONTS.some((f) => f.id === merged.appearance.chatFont)) {
      merged.appearance.chatFont = DEFAULT_SETTINGS.appearance.chatFont;
    }
    merged.layout.leftWidth = clamp(
      merged.layout.leftWidth,
      LAYOUT_LIMITS.left.min,
      LAYOUT_LIMITS.left.max,
    );
    merged.layout.rightWidth = clamp(
      merged.layout.rightWidth,
      LAYOUT_LIMITS.right.min,
      LAYOUT_LIMITS.right.max,
    );
    merged.layout.graphWidth = clamp(
      merged.layout.graphWidth,
      LAYOUT_LIMITS.graph.min,
      LAYOUT_LIMITS.graph.max,
    );
    merged.agent.maxTurns = Math.round(
      clamp(merged.agent.maxTurns, AGENT_LIMITS.maxTurns.min, AGENT_LIMITS.maxTurns.max),
    );

    const c = merged.agent.connection;
    const L = AGENT_CONNECTION_LIMITS;
    c.heartbeatInterval = clamp(c.heartbeatInterval, L.heartbeatInterval.min, L.heartbeatInterval.max);
    c.reconnectDelay = clamp(c.reconnectDelay, L.reconnectDelay.min, L.reconnectDelay.max);
    c.maxRecoveryAttempts = Math.round(
      clamp(c.maxRecoveryAttempts, L.maxRecoveryAttempts.min, L.maxRecoveryAttempts.max),
    );
    c.heartbeatFailureThreshold = Math.round(
      clamp(c.heartbeatFailureThreshold, L.heartbeatFailureThreshold.min, L.heartbeatFailureThreshold.max),
    );
    c.idleTimeout = clamp(c.idleTimeout, L.idleTimeout.min, L.idleTimeout.max);

    // Cursor provider — whitelist the enums, coerce the toggle, cap the
    // executable-path override, and re-validate the persisted discovered-model
    // ids (a hand-edited settings.json must never smuggle junk into provider
    // routing or argv). No secrets here: the API key lives in the SecretStore.
    const cursor = merged.agent.cursor;
    if (!['auto', 'api-key', 'cli-login'].includes(cursor.preferredAuth)) {
      cursor.preferredAuth = 'auto';
    }
    cursor.manualBrowserLogin = !!cursor.manualBrowserLogin;
    if (!['auto', 'off'].includes(cursor.hooks)) {
      cursor.hooks = 'auto';
    }
    cursor.executablePath = String(cursor.executablePath ?? '')
      .trim()
      .slice(0, CURSOR_LIMITS.execPathMax);
    cursor.discoveredModels = (Array.isArray(cursor.discoveredModels) ? cursor.discoveredModels : [])
      .filter((id): id is string => typeof id === 'string' && CURSOR_MODEL_ID_RE.test(id))
      .slice(0, CURSOR_LIMITS.modelsMax);

    // Provider-neutral Sandbox (Layer 3) — whitelist the enums, coerce toggles,
    // and sanitize the two user-widenable arrays (network allowlist + extra
    // writable paths) since both flow into a real OS jail / argv. The writable
    // root and userData/secrets denials are NOT configurable here — they are
    // applied unconditionally in AgentManager.resolveSandboxConfig.
    // Migration (SETTINGS_VERSION 16 → 17): the old per-provider
    // `agent.cursor.sandbox` seeds the new shared `agent.sandbox.mode`.
    const sandbox = merged.agent.sandbox;
    const legacyCursorSandbox = (merged.agent.cursor as { sandbox?: unknown }).sandbox;
    if (
      typeof legacyCursorSandbox === 'string' &&
      ['auto', 'enabled', 'disabled'].includes(legacyCursorSandbox) &&
      (input?.agent as { sandbox?: unknown } | undefined)?.sandbox === undefined
    ) {
      sandbox.mode = legacyCursorSandbox as typeof sandbox.mode;
    }
    delete (merged.agent.cursor as { sandbox?: unknown }).sandbox;
    if (!['auto', 'enabled', 'disabled'].includes(sandbox.mode)) sandbox.mode = 'auto';
    if (!['all', 'allowlist', 'off'].includes(sandbox.network)) sandbox.network = 'all';
    if (!['auto', 'claude-native', 'cursor-native'].includes(sandbox.providerOverride)) {
      sandbox.providerOverride = 'auto';
    }
    sandbox.readOnlyAttachments = !!sandbox.readOnlyAttachments;
    sandbox.failIfUnavailable = !!sandbox.failIfUnavailable;
    sandbox.allowedDomains = (Array.isArray(sandbox.allowedDomains) ? sandbox.allowedDomains : [])
      .filter(
        (d): d is string =>
          typeof d === 'string' &&
          d.length <= SANDBOX_LIMITS.domainMax &&
          SANDBOX_DOMAIN_RE.test(d),
      )
      .slice(0, SANDBOX_LIMITS.maxAllowedDomains);
    sandbox.allowWritePaths = (
      Array.isArray(sandbox.allowWritePaths) ? sandbox.allowWritePaths : []
    )
      .filter(
        (p): p is string =>
          typeof p === 'string' && p.trim().length > 0 && p.length <= SANDBOX_LIMITS.writePathMax,
      )
      .map((p) => p.trim())
      // Reject any extra writable path that resolves into the crown-jewel floor
      // (secrets/db/config) or is `/` / the home dir — a hand-edited settings.json
      // must never re-widen writes into protected areas (same rule the runtime
      // re-applies in resolveSandboxConfig, defense in depth).
      .filter((p) => screenExtraWritePath(p))
      .slice(0, SANDBOX_LIMITS.maxAllowWritePaths);
    sandbox.excludedCommands = (
      Array.isArray(sandbox.excludedCommands) ? sandbox.excludedCommands : []
    )
      .filter(
        (c): c is string =>
          typeof c === 'string' &&
          c.trim().length > 0 &&
          c.length <= SANDBOX_LIMITS.excludedCommandMax,
      )
      .map((c) => c.trim())
      .slice(0, SANDBOX_LIMITS.maxExcludedCommands);

    // Hook Engine — coerce the toggle and whitelist the audit-verbosity enum.
    // `enabled` only gates emission of observability; it can never weaken the
    // permission gate (enforcement always runs in the main process).
    const hookEngine = merged.agent.hookEngine;
    hookEngine.enabled = !!hookEngine.enabled;
    if (!['off', 'lifecycle', 'verbose'].includes(hookEngine.audit)) {
      hookEngine.audit = 'lifecycle';
    }

    merged.git.maxCheckpoints = Math.round(
      clamp(merged.git.maxCheckpoints, GIT_LIMITS.maxCheckpoints.min, GIT_LIMITS.maxCheckpoints.max),
    );
    if (!['destructive', 'all', 'none'].includes(merged.git.commandApproval)) {
      merged.git.commandApproval = 'destructive';
    }
    if (!['ff-only', 'rebase'].includes(merged.git.pull.strategy)) {
      merged.git.pull.strategy = 'ff-only';
    }

    // Worktrees + Scripts & Services — coerce booleans, cap the root path, and
    // whitelist the branch prefix to git-ref-safe characters (a renderer-supplied
    // prefix must never smuggle flags or ref metacharacters into `git worktree`).
    const wt = merged.git.worktrees;
    wt.enabled = !!wt.enabled;
    wt.autoSetup = !!wt.autoSetup;
    wt.confirmHooks = !!wt.confirmHooks;
    wt.teardownOnArchive = !!wt.teardownOnArchive;
    wt.root = String(wt.root ?? '').slice(0, WORKTREE_LIMITS.rootPathMax);
    wt.branchPrefix = String(wt.branchPrefix ?? '')
      .replace(/[^A-Za-z0-9._/-]/g, '')
      .replace(/^[-/.]+/, '')
      .slice(0, 64);
    if (!wt.branchPrefix) wt.branchPrefix = DEFAULT_SETTINGS.git.worktrees.branchPrefix;

    const svc = merged.git.services;
    svc.proxyEnabled = !!svc.proxyEnabled;
    svc.portRangeStart = Math.round(
      clamp(svc.portRangeStart, WORKTREE_LIMITS.portRangeStart.min, WORKTREE_LIMITS.portRangeStart.max),
    );
    svc.portRangeEnd = Math.round(
      clamp(svc.portRangeEnd, WORKTREE_LIMITS.portRangeEnd.min, WORKTREE_LIMITS.portRangeEnd.max),
    );
    if (svc.portRangeEnd < svc.portRangeStart) svc.portRangeEnd = svc.portRangeStart;
    svc.proxyPort = Math.round(
      clamp(svc.proxyPort, WORKTREE_LIMITS.proxyPort.min, WORKTREE_LIMITS.proxyPort.max),
    );

    const mem = merged.memory;
    if (!['propose', 'auto', 'off'].includes(mem.autoCapture)) {
      mem.autoCapture = 'propose';
    }
    mem.maxInjected = Math.round(
      clamp(mem.maxInjected, MEMORY_LIMITS.maxInjected.min, MEMORY_LIMITS.maxInjected.max),
    );
    mem.autoAcceptConfidence = clamp(
      mem.autoAcceptConfidence,
      MEMORY_LIMITS.autoAcceptConfidence.min,
      MEMORY_LIMITS.autoAcceptConfidence.max,
    );
    mem.expiry.staleDays = Math.round(
      clamp(mem.expiry.staleDays, MEMORY_LIMITS.staleDays.min, MEMORY_LIMITS.staleDays.max),
    );

    // Search — clamp the recent-search ring, whitelist the live-search delay, and
    // coerce the boolean toggles (source switches, fuzzy, title-bar open behaviour).
    const search = merged.search;
    search.historyLimit = Math.round(
      clamp(search.historyLimit, SEARCH_LIMITS.historyLimit.min, SEARCH_LIMITS.historyLimit.max),
    );
    if (!['instant', 'fast', 'balanced'].includes(search.liveDelay)) {
      search.liveDelay = 'fast';
    }
    search.fuzzy = !!search.fuzzy;
    search.openOnClick = !!search.openOnClick;
    for (const key of Object.keys(search.sources) as (keyof typeof search.sources)[]) {
      search.sources[key] = !!search.sources[key];
    }

    // Plan Mode — the composer now speaks harness permission modes. Coerce the
    // legacy 'implement' default (pre-v9) to 'default' and reject stray values.
    const plan = merged.agent.plan;
    if (!['plan', 'ask', 'default', 'acceptEdits'].includes(plan.defaultMode as string)) {
      plan.defaultMode = plan.defaultMode === ('implement' as unknown) ? 'default' : 'plan';
    }
    plan.historyLimit = Math.round(clamp(plan.historyLimit, 1, 100));

    // Resume Pipeline — clamp the numeric knobs and coerce the toggles
    // (renderer-supplied values bound git work on every session activation).
    const resume = merged.resume;
    resume.enabled = !!resume.enabled;
    resume.injectDelta = !!resume.injectDelta;
    resume.maxCommitsInDelta = Math.round(
      clamp(
        resume.maxCommitsInDelta,
        RESUME_LIMITS.maxCommitsInDelta.min,
        RESUME_LIMITS.maxCommitsInDelta.max,
      ),
    );
    resume.staleThresholdDays = Math.round(
      clamp(
        resume.staleThresholdDays,
        RESUME_LIMITS.staleThresholdDays.min,
        RESUME_LIMITS.staleThresholdDays.max,
      ),
    );

    // Work Graph (SETTINGS_VERSION 18 -> 19: `settings.graph` introduced; the
    // deep-merge above supplies every default, so there is no data migration).
    // Clamp the numeric knobs and whitelist the enums — several of these bound
    // a recursive SQL traversal and the renderer's layout loop, so an
    // out-of-range value is a hang, not a cosmetic bug.
    const graph = merged.graph;
    const G = GRAPH_LIMITS;
    graph.enabled = !!graph.enabled;
    graph.persist = !!graph.persist;
    graph.pruneOnSessionEnd = !!graph.pruneOnSessionEnd;
    graph.showEdgeLabels = !!graph.showEdgeLabels;
    graph.showSemanticEdges = !!graph.showSemanticEdges;
    graph.showDerivedEdges = !!graph.showDerivedEdges;
    graph.artifactPreviews = !!graph.artifactPreviews;
    graph.animate = !!graph.animate;
    graph.animationSpeed = clamp(
      graph.animationSpeed,
      GRAPH_LIMITS.animationSpeed.min,
      GRAPH_LIMITS.animationSpeed.max,
    );
    graph.groupSubagents = !!graph.groupSubagents;
    graph.autoCollapseCompleted = !!graph.autoCollapseCompleted;
    graph.timelineSync = !!graph.timelineSync;
    graph.checkpointIntegration = !!graph.checkpointIntegration;
    for (const key of Object.keys(graph.overlays) as Array<keyof typeof graph.overlays>) {
      graph.overlays[key] = !!graph.overlays[key];
    }
    const roundClamp = (v: number, b: { min: number; max: number }): number =>
      Math.round(clamp(v, b.min, b.max));
    graph.updateFrequency = roundClamp(graph.updateFrequency, G.updateFrequency);
    graph.retentionPerSession = roundClamp(graph.retentionPerSession, G.retentionPerSession);
    graph.retentionDays = roundClamp(graph.retentionDays, G.retentionDays);
    graph.collapseRunsOlderThan = roundClamp(graph.collapseRunsOlderThan, G.collapseRunsOlderThan);
    graph.maxDepth = roundClamp(graph.maxDepth, G.maxDepth);
    graph.maxNodes = roundClamp(graph.maxNodes, G.maxNodes);
    graph.maxLanes = roundClamp(graph.maxLanes, G.maxLanes);
    graph.virtualizeThreshold = roundClamp(graph.virtualizeThreshold, G.virtualizeThreshold);
    if (!['lanes', 'compact'].includes(graph.layoutAlgorithm)) {
      graph.layoutAlgorithm = DEFAULT_SETTINGS.graph.layoutAlgorithm;
    }
    if (!['kind', 'status', 'provider'].includes(graph.nodeColoring)) {
      graph.nodeColoring = DEFAULT_SETTINGS.graph.nodeColoring;
    }
    if (!['none', 'kind', 'tool', 'file'].includes(graph.outlineGroupBy)) {
      graph.outlineGroupBy = DEFAULT_SETTINGS.graph.outlineGroupBy;
    }
    if (!['json', 'md', 'mermaid', 'dot', 'csv', 'html', 'svg', 'png'].includes(graph.exportFormat)) {
      graph.exportFormat = DEFAULT_SETTINGS.graph.exportFormat;
    }

    // Attachments — clamp the numeric caps, coerce the toggles, and whitelist
    // the elevated-risk policy (renderer-supplied values gate real file I/O).
    const att = merged.attachments;
    const A = ATTACHMENT_LIMITS;
    att.enabled = !!att.enabled;
    att.maxFileSizeMB = Math.round(
      clamp(att.maxFileSizeMB, A.maxFileSizeMB.min, A.maxFileSizeMB.max),
    );
    att.maxFilesPerMessage = Math.round(
      clamp(att.maxFilesPerMessage, A.maxFilesPerMessage.min, A.maxFilesPerMessage.max),
    );
    att.maxTotalPerSession = Math.round(
      clamp(att.maxTotalPerSession, A.maxTotalPerSession.min, A.maxTotalPerSession.max),
    );
    for (const key of Object.keys(att.categories) as (keyof typeof att.categories)[]) {
      att.categories[key] = !!att.categories[key];
    }
    att.images.attachAsVision = !!att.images.attachAsVision;
    att.images.downscaleThresholdMB = clamp(
      att.images.downscaleThresholdMB,
      A.downscaleThresholdMB.min,
      A.downscaleThresholdMB.max,
    );
    att.autoIndex = !!att.autoIndex;
    if (!['block', 'warn'].includes(att.elevatedRiskPolicy)) {
      att.elevatedRiskPolicy = 'block';
    }

    merged.updates.autoCheck = !!merged.updates.autoCheck;
    merged.updates.autoDownload = !!merged.updates.autoDownload;

    // Voice — clamp the numeric tuning knobs, whitelist the enums, and coerce
    // the boolean toggles (renderer-supplied strings must never reach the
    // speech worker or the download pipeline unchecked).
    const voice = merged.voice;
    const V = VOICE_LIMITS;
    voice.enabled = !!voice.enabled;
    voice.input.sensitivity = clamp(voice.input.sensitivity, V.sensitivity.min, V.sensitivity.max);
    voice.input.silenceMs = Math.round(
      clamp(voice.input.silenceMs, V.silenceMs.min, V.silenceMs.max),
    );
    if (!['push-to-talk', 'toggle', 'auto'].includes(voice.input.activation)) {
      voice.input.activation = 'auto';
    }
    voice.input.autoPunctuation = !!voice.input.autoPunctuation;
    voice.input.deviceId = String(voice.input.deviceId ?? '').slice(0, 256);
    voice.input.language = String(voice.input.language ?? 'en').slice(0, 16);
    voice.output.enabled = !!voice.output.enabled;
    voice.output.deviceId = String(voice.output.deviceId ?? '').slice(0, 256);
    voice.output.speakerId = Math.round(
      clamp(voice.output.speakerId, V.speakerId.min, V.speakerId.max),
    );
    voice.output.speed = clamp(voice.output.speed, V.speed.min, V.speed.max);
    voice.output.volume = clamp(voice.output.volume, V.volume.min, V.volume.max);
    voice.output.streamWhileGenerating = !!voice.output.streamWhileGenerating;
    if (!['voice-initiated', 'always'].includes(voice.output.speakWhen)) {
      voice.output.speakWhen = 'voice-initiated';
    }
    for (const key of Object.keys(voice.playbackEvents) as (keyof typeof voice.playbackEvents)[]) {
      voice.playbackEvents[key] = !!voice.playbackEvents[key];
    }
    if (!['stop', 'pause', 'ignore'].includes(voice.interruption)) {
      voice.interruption = 'stop';
    }
    voice.models.autoDownload = !!voice.models.autoDownload;
    voice.models.autoUpdate = !!voice.models.autoUpdate;
    voice.models.offlineOnly = !!voice.models.offlineOnly;

    // MCP platform — coerce the toggles, clamp the probe/heartbeat cadence, and
    // whitelist the enums. These are only the GLOBAL platform preferences; the
    // per-server definitions (with their own validated caps) live in the DB, and
    // secrets live in the SecretStore — nothing security-sensitive is here.
    const mcp = merged.mcp;
    mcp.enabled = !!mcp.enabled;
    mcp.heartbeatInterval = Math.round(
      clamp(mcp.heartbeatInterval, MCP_LIMITS.heartbeatInterval.min, MCP_LIMITS.heartbeatInterval.max),
    );
    mcp.probeTimeout = Math.round(
      clamp(mcp.probeTimeout, MCP_LIMITS.probeTimeout.min, MCP_LIMITS.probeTimeout.max),
    );
    if (!['ask', 'trusted'].includes(mcp.defaultTrust)) mcp.defaultTrust = 'ask';
    mcp.allowPrivateNetwork = !!mcp.allowPrivateNetwork;
    mcp.autoImport.cursor = !!mcp.autoImport.cursor;
    mcp.autoImport.claude = !!mcp.autoImport.claude;
    mcp.injectIntoClaude = !!mcp.injectIntoClaude;
    mcp.injectIntoCursor = !!mcp.injectIntoCursor;
    if (!['quiet', 'normal', 'verbose'].includes(mcp.logVerbosity)) mcp.logVerbosity = 'normal';

    return merged;
  }
}

/* ------------------------------------------------------------------ */
/* Deep-merge helpers                                                  */
/* ------------------------------------------------------------------ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keys that could pollute Object.prototype if copied during a merge. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(patch as object)) {
    // Never copy prototype-polluting keys, even though a renderer-supplied patch
    // should already have been rejected upstream (defense in depth).
    if (FORBIDDEN_KEYS.has(key)) continue;
    const patchVal = (patch as Record<string, unknown>)[key];
    const baseVal = (base as Record<string, unknown>)[key];
    if (patchVal === undefined) continue;
    out[key] =
      isPlainObject(baseVal) && isPlainObject(patchVal)
        ? deepMerge(baseVal, patchVal as DeepPartial<typeof baseVal>)
        : patchVal;
  }
  return out as T;
}
