import type { ActivityTab, AppSettings, WorkspaceConfig } from './types';

/**
 * Bumped whenever the {@link AppSettings} shape changes incompatibly.
 *
 * v27 — the Activity and Hooks drawer tabs were removed, and the integrated
 * terminal became its own column (`layout.terminalOpen`) instead of a drawer
 * tab. `SettingsManager.normalize` migrates a persisted `layout.activeTab`
 * naming any of the three.
 *
 * v28 — `git.avatars` added. The deep-merge supplies the default, so there is
 * no data migration; the bump exists so the new key's presence is dated.
 *
 * v30 — `agent.harness` added (harness id, the legacy-SDK rollback, the pinned
 * sandbox provider, adapter debug). The deep-merge supplies the defaults, so
 * again no data migration. **29 is deliberately skipped**: installs in the
 * wild already carry a settings.json stamped 29 from a parallel build, and
 * reusing the number would make "already migrated" and "written by something
 * else" indistinguishable.
 */
export const SETTINGS_VERSION = 30;

/**
 * Every valid right-drawer tab id, in display order. The renderer's
 * `features/activity/tabs.ts` attaches the labels and icons; this list is the
 * shared half so MAIN can validate a renderer-authored `layout.activeTab`
 * without importing React.
 */
export const ACTIVITY_TAB_IDS: readonly ActivityTab[] = [
  'files',
  'changes',
  'git',
  'memory',
  'tasks',
  'console',
  'graph',
];

/**
 * The agent providers Limboo can run (Claude Code = Anthropic via the Agent
 * SDK, Cursor = the cursor-agent CLI in print mode). The provider follows the
 * selected model — picking a Composer model routes runs through the Cursor
 * runtime adapter.
 */
export type AgentProvider = 'anthropic' | 'cursor';

/**
 * Selectable agent models (id + short label + provider). The Anthropic ids are
 * the current catalog aliases (most capable first) — aliases track the latest
 * snapshot server-side, so no date suffixes except where the settings default
 * historically shipped one (Haiku 4.5, kept for persisted-settings compat).
 */
export const AGENT_MODELS = [
  { value: 'claude-fable-5', label: 'Fable 5', provider: 'anthropic' },
  { value: 'claude-opus-5', label: 'Opus 5', provider: 'anthropic' },
  { value: 'claude-opus-4-8', label: 'Opus 4.8', provider: 'anthropic' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7', provider: 'anthropic' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6', provider: 'anthropic' },
  { value: 'claude-opus-4-5', label: 'Opus 4.5', provider: 'anthropic' },
  { value: 'claude-sonnet-5', label: 'Sonnet 5', provider: 'anthropic' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6', provider: 'anthropic' },
  { value: 'claude-sonnet-4-5', label: 'Sonnet 4.5', provider: 'anthropic' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', provider: 'anthropic' },
  { value: 'composer-2', label: 'Composer 2', provider: 'cursor' },
  { value: 'composer-2.5', label: 'Composer 2.5', provider: 'cursor' },
] as const;

/**
 * Harness id → display label, for both processes.
 *
 * The full descriptors (module specifiers, capabilities, sandbox requirements)
 * live in `main/managers/agent/harnessRegistry.ts` and are MAIN-ONLY — the
 * renderer must never see a module specifier, the same rule
 * `PROVIDER_CAPABILITIES` follows. Only the id/label pair crosses, because the
 * Settings and Composer pickers need something to render.
 */
export const HARNESS_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  'cursor-cli': 'Cursor',
};

/** The harness ids that serve a provider, renderer-safe. */
export const PROVIDER_HARNESS: Record<AgentProvider, string> = {
  anthropic: 'claude-code',
  cursor: 'cursor-cli',
};

/**
 * Harness ids whose built-in READ tools cannot be routed through Limboo's
 * permission gate — the renderer-safe half of `HarnessCapabilities.gatesReads`.
 *
 * The AI SDK harnesses gate edits and shell commands but never reads: their
 * permission modes have no "ask about reads" setting, and the only lever over a
 * built-in read denies it outright instead of asking. So `autoApproveReads` is
 * inert on those paths, and the settings UI must say that plainly rather than
 * render a control that looks like it works. Same posture as Cursor's "not
 * reported by this provider" — state the limit, never fake the capability.
 */
export const HARNESSES_WITHOUT_READ_GATING: readonly string[] = ['claude-code'];

/**
 * Charset guard for an Anthropic model id before it reaches the Agent SDK.
 * Settings normally only ever hold picker values, but the model string is
 * persisted user data — never trust it verbatim (CLAUDE.md §6 input
 * validation). Lowercase alphanumerics plus `.-` and a bounded length cover
 * every published Claude id without hardcoding the catalog.
 */
export const ANTHROPIC_MODEL_ID_RE = /^[a-z0-9][a-z0-9.-]{2,63}$/;

/**
 * Cursor model ids discovered at runtime via `cursor-agent models`. Each
 * process registers its own copy (main from the auth probe / persisted
 * settings, renderer from the broadcast auth state + hydrate). Consulted by
 * {@link providerForModel} AFTER the static list, so a discovered id can
 * never re-route a built-in Anthropic model.
 */
const dynamicCursorModels = new Set<string>();

/** Register runtime-discovered Cursor model ids (validated by the caller). */
export function registerCursorModels(ids: readonly string[]): void {
  for (const id of ids) {
    if (typeof id === 'string' && CURSOR_MODEL_ID_RE.test(id)) dynamicCursorModels.add(id);
  }
}

/**
 * Forget every runtime-discovered id. The registry used to be append-only, so
 * signing out of Cursor or switching accounts left stale ids routing to a
 * provider that no longer serves them. Callers REPLACE (clear + register) so
 * there is no window where the set is empty and a live model mis-routes.
 */
export function clearCursorModels(): void {
  dynamicCursorModels.clear();
}

/**
 * Every id known to be a Cursor model: the static catalog plus whatever the
 * running process has registered. This is the SINGLE routing set — the run-time
 * validation in `runCursorOnce` consults it too, so "what routes to Cursor" and
 * "what Cursor will accept" can no longer disagree (they used to: validation
 * additionally read the auth cache, so an id in the cache but not the registry
 * routed to Claude and never reached the check that would have caught it).
 */
export function cursorModelSet(): Set<string> {
  const out = new Set<string>(dynamicCursorModels);
  for (const m of AGENT_MODELS) if (m.provider === 'cursor') out.add(m.value);
  return out;
}

/**
 * Route a model id to its provider, or report that nothing claims it.
 *
 * There is deliberately no "default" provider. `providerForModel` used to
 * answer `'anthropic'` for any unrecognised id, which meant a Cursor model that
 * had not been registered yet was handed to the Claude SDK — and because
 * `buildOptions` validated by charset rather than provider, it ran and streamed
 * as Claude Code with no error anywhere. An unknown id must be a named failure,
 * not a guess.
 */
export function resolveModelRouting(
  model: string,
): { provider: AgentProvider } | { provider: null; reason: string } {
  const known = AGENT_MODELS.find((m) => m.value === model)?.provider;
  if (known) return { provider: known };
  if (dynamicCursorModels.has(model)) return { provider: 'cursor' };
  return {
    provider: null,
    reason: `"${model.slice(0, 80)}" is not a known model for any configured provider`,
  };
}

/**
 * Resolve the provider that serves a given model id.
 *
 * Convenience wrapper over {@link resolveModelRouting} for the many callers
 * that only need a label or a capability lookup and cannot act on "unknown".
 * **Do not use it to choose an execution path** — it collapses unknown into
 * `'anthropic'`, which is exactly the bug `resolveModelRouting` exists to
 * prevent. Dispatch and option-building must call `resolveModelRouting`.
 */
export function providerForModel(model: string): AgentProvider {
  return resolveModelRouting(model).provider ?? 'anthropic';
}

/** Bounds the main process clamps agent settings against. */
export const AGENT_LIMITS = {
  maxTurns: { min: 1, max: 100, default: 24 },
  /** Cap on a single prompt the renderer may submit. */
  promptMax: 100_000,
  /** Cap on the plan markdown captured from ExitPlanMode (renderer-displayed). */
  planMarkdownMax: 262_144,
  /**
   * Cap on the plan markdown re-injected into the approval prompt. Far smaller
   * than {@link planMarkdownMax}: that bound protects a stored/rendered
   * document, this one rides in a conversation turn.
   */
  planPromptMax: 24_000,
  /**
   * Ceiling on suspend/continue rounds in one harness run.
   *
   * A harness gates built-in tools by suspending the turn and asking, so one
   * round is spent per gated tool call — `maxTurns` is what actually bounds the
   * work. This exists only so an adapter that keeps asking cannot spin forever;
   * exceeding it is reported, never a silent stop.
   */
  maxApprovalRounds: 400,
} as const;

/**
 * Bounds for subagent execution records.
 *
 * Every one of these caps a value that rides a per-event payload AND a persisted
 * row: a worker that runs away must not be able to grow either without limit.
 * The transcript cap is the strictest-feeling one on purpose — it holds
 * forwarded model output, which is untrusted content Limboo renders verbatim.
 */
export const SUBAGENT_LIMITS = {
  summaryMax: { min: 500, max: 64_000, default: 4_000 },
  transcriptMax: { min: 1_000, max: 262_144, default: 32_000 },
  rollupMax: { min: 8, max: 512, default: 64 },
  retainRuns: { min: 10, max: 2_000, default: 200 },
  /** Cap on a single rolled-up string (tool name, MCP server, path, command). */
  fieldMax: 512,
} as const;

/** Caps for the audit-style agent activity feed (label + detail truncation). */
export const ACTIVITY_LIMITS = {
  /** Max chars kept for an activity item's detail line. */
  detailMax: 160,
  /** Max chars kept for an activity item's label / short prompt echo. */
  labelMax: 120,
} as const;

/** Bounds for the Provider-Neutral Hook Engine audit log + gate dispatch. */
export const HOOK_LIMITS = {
  /** Max audit rows retained per session (ring-capped; oldest pruned). */
  auditRingPerSession: 500,
  /** Deadline for a blocking gate dispatch before it fails closed (deny). */
  gateTimeoutMs: 30_000,
  /** Max chars kept for a hook event's summary line. */
  summaryMax: 120,
  /** Max chars kept for a hook event's detail line. */
  detailMax: 160,
} as const;

/** Bounds the main process clamps agent connection-monitoring settings against. */
export const AGENT_CONNECTION_LIMITS = {
  heartbeatInterval: { min: 0, max: 600_000, default: 30_000 },
  reconnectDelay: { min: 250, max: 60_000, default: 1_000 },
  maxRecoveryAttempts: { min: 0, max: 10, default: 3 },
  heartbeatFailureThreshold: { min: 1, max: 10, default: 2 },
  idleTimeout: { min: 0, max: 1_800_000, default: 300_000 },
} as const;

/**
 * Bounds + caps for the provider-neutral OS-level Sandbox (Layer 3). The
 * writable root is always the session worktree and userData/secrets are always
 * denied — these caps only bound the user-configurable *widenings* (extra
 * write paths / network allowlist), which are persisted user data and must be
 * sanitized before they reach a sandbox config or argv (CLAUDE.md §6).
 */
export const SANDBOX_LIMITS = {
  /** Max network-allowlist domains kept (older/extra entries dropped). */
  maxAllowedDomains: 64,
  /** Max chars for a single allowlist domain before it is rejected. */
  domainMax: 253,
  /** Max extra writable paths a user may grant beyond the worktree. */
  maxAllowWritePaths: 32,
  /** Max chars for a single extra writable path before it is rejected. */
  writePathMax: 1_024,
  /** Max Claude `excludedCommands` entries (commands run outside the jail). */
  maxExcludedCommands: 64,
  /** Max chars for a single excluded-command pattern before it is rejected. */
  excludedCommandMax: 256,
} as const;

/** A network-allowlist domain must match this before it reaches any sandbox. */
export const SANDBOX_DOMAIN_RE = /^[A-Za-z0-9*]([A-Za-z0-9.*-]{0,251}[A-Za-z0-9])?$/;

/**
 * Bounds + caps for the Cursor provider (authentication only). All
 * `cursor-agent` invocations are argv-only and bounded by these caps; the API
 * key is validated leniently (the `crsr_` prefix is not contractual).
 */
export const CURSOR_LIMITS = {
  /** Accepted API-key length range (lenient — format not guaranteed by docs). */
  apiKeyMin: 8,
  apiKeyMax: 512,
  /** Deadline for a `cursor-agent status --format json` probe. */
  statusTimeoutMs: 10_000,
  /** Deadline for the `cursor-agent --version` / PATH resolution probe. */
  versionTimeoutMs: 5_000,
  /** A stuck interactive `cursor-agent login` child is killed after this. */
  loginTimeoutMs: 300_000,
  /** Cap on captured CLI stdout/stderr (bytes). */
  outputMax: 64 * 1024,
  /** Cap on the manual-login URL captured from the CLI's stdout. */
  loginUrlMax: 2_048,
  /** A single stream-json NDJSON line beyond this is dropped, never buffered. */
  ndjsonLineMax: 2_097_152,
  /** Bounded tail of a run child's stderr kept for error classification. */
  stderrTailMax: 8_192,
  /** Grace between SIGTERM and SIGKILL when stopping a run child (posix). */
  killGraceMs: 3_000,
  /** Cap on the terminal result text kept from a run. */
  runResultTextMax: 262_144,
  /** Discovered model list is re-fetched at most this often. */
  modelsTtlMs: 3_600_000,
  /** Max chars for a single discovered model id. */
  modelIdMax: 64,
  /** Max discovered model ids kept per fetch. */
  modelsMax: 50,
  /** Deadline for a `cursor-agent update` self-update run. */
  updateTimeoutMs: 180_000,
  /** Max chars for a `--resume` chat id before it is dropped as corrupt. */
  resumeIdMax: 200,
  /** Max chars for the user-configured executable path override. */
  execPathMax: 1_024,
  /** Max concurrent connections the per-run bridge pipe accepts. */
  bridgeMaxConnections: 8,
  /** Max buffered bytes for one bridge line before the socket is dropped. */
  bridgeLineMax: 4_194_304,
  /**
   * Deadline for one bridge request (an interactive permission prompt can
   * legitimately wait on the user — keep this generous).
   */
  bridgeRequestTimeoutMs: 600_000,
  /** `timeout` (seconds) written into the generated hooks.json entries. */
  hookTimeoutSecs: 600,
} as const;

/** A discovered Cursor model id must match this before it is trusted anywhere. */
export const CURSOR_MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** A stored Cursor `--resume` chat id must match this before reaching argv. */
export const CURSOR_RESUME_ID_RE = /^[A-Za-z0-9._-]{1,200}$/;

/**
 * Cursor-owned destinations the UI may open via `shell.openExternal` (single
 * source of truth — keep these on cursor.com so the generic https validation
 * in systemHandlers is the only other gate needed).
 */
export const CURSOR_URLS = {
  docs: 'https://cursor.com/docs/cli/overview',
  install: 'https://cursor.com/docs/cli/installation',
  dashboard: 'https://cursor.com/dashboard',
  apiKeys: 'https://cursor.com/dashboard/api',
} as const;

/**
 * Bounds + caps for the provider-independent MCP platform. Server definitions
 * are persisted user data (DB) that ride into a child-process spawn or a
 * generated provider config file — every renderer-supplied field is clamped /
 * charset-validated against these caps before use (CLAUDE.md §6). Secrets live
 * in the safeStorage secret store, never in the row and never on argv.
 */
export const MCP_LIMITS = {
  /** Max configured servers total (defense against runaway import). */
  maxServers: 100,
  /** Max chars for a server machine name (used in the mcp__<name>__ namespace). */
  nameMax: 64,
  /** Max chars for a human display name. */
  displayNameMax: 120,
  /** Max chars for a stdio server command. */
  commandMax: 1_024,
  /** Max argv entries for a stdio server. */
  maxArgs: 64,
  /** Max chars for a single argv entry. */
  argMax: 4_096,
  /** Max env / header entries. */
  maxEnv: 64,
  /** Max chars for an env / header key. */
  keyMax: 256,
  /** Max chars for a non-secret env / header value. */
  valueMax: 8_192,
  /** Max chars for a remote server URL. */
  urlMax: 2_048,
  /** Max chars for a working directory. */
  cwdMax: 1_024,
  /** Max chars for a secret value accepted from the renderer (never persisted). */
  secretMax: 8_192,
  /** Per-tool-call wall-clock cap bounds (ms). */
  timeoutMs: { min: 1_000, max: 600_000, default: 60_000 },
  /** Health-probe / heartbeat cadence bounds (ms); 0 disables. */
  heartbeatInterval: { min: 0, max: 3_600_000, default: 60_000 },
  /** Single connect / tools-list probe deadline bounds (ms). */
  probeTimeout: { min: 1_000, max: 120_000, default: 15_000 },
  /** Max tools cached per server. */
  maxTools: 500,
  /**
   * Max fully-qualified MCP tool names spliced into a plan run's `allowedTools`.
   * That list exists only to get past the Agent SDK's own plan-mode block, so it
   * stays small and bounded — see `McpManager.planAllowedToolsFor`.
   */
  maxPlanAllowedTools: 256,
  /** A single MCP client stdio line beyond this is dropped, never buffered. */
  clientLineMax: 4_194_304,
  /** Max log lines kept in the per-server ring buffer. */
  logRingMax: 500,
} as const;

/**
 * A server machine name must match this before it reaches the `mcp__<name>__`
 * tool namespace or a generated provider config. Letters/digits/`_`/`-`, bounded.
 */
export const MCP_SERVER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * Server names reserved by Limboo's own in-process servers and the providers'
 * built-in servers — a user/imported server may never register under these.
 */
export const MCP_RESERVED_NAMES: ReadonlySet<string> = new Set([
  'limboo_memory',
  'limboo_search',
  'workspace',
  'claude-in-chrome',
  'computer-use',
]);

/** Hard limits the renderer and main process both clamp against. */
export const LAYOUT_LIMITS = {
  left: { min: 200, max: 420, default: 264 },
  right: { min: 240, max: 560, default: 320 },
  terminal: { min: 320, max: 900, default: 480 },
  /** The Git workspace drawer benefits from a wider default (diffs/history). */
  git: { min: 360, max: 1_000, default: 560 },
  /** The Work Graph is a canvas — it needs the widest default of any tab. */
  graph: { min: 380, max: 1_200, default: 640 },
} as const;

/** Bounds for the integrated terminal subsystem (main + renderer both clamp). */
export const TERMINAL_LIMITS = {
  /** Max concurrent terminals per workspace. */
  maxPerWorkspace: 12,
  /** In-memory PTY scrollback ring (lines) kept for replay on rehydrate. */
  scrollbackLines: 5_000,
  /** Max bytes accepted in a single `terminal:write` from the renderer. */
  writeBytesMax: 8_192,
  /** Terminal title length cap. */
  titleMax: 80,
  /** PTY grid bounds. */
  cols: { min: 2, max: 1_000, default: 80 },
  rows: { min: 1, max: 1_000, default: 24 },
  /** Font-size bounds for the terminal appearance setting. */
  fontSize: { min: 9, max: 24, default: 13 },
} as const;

/** Bounds + caps for the git subsystem (main + renderer clamp against these). */
export const GIT_LIMITS = {
  /** Checkpoints kept per session before older ones are pruned. */
  maxCheckpoints: { min: 1, max: 200, default: 50 },
  /** Commits fetched in a single history page. */
  logPageSize: 100,
  /** Max bytes of raw diff output parsed for one file (elided past this). */
  diffBytesMax: 1_500_000,
  /** Commit message length cap accepted from the renderer. */
  commitMessageMax: 20_000,
  /** Branch / tag / checkpoint label length cap. */
  refNameMax: 255,
  /** Paths accepted in one patch export request. */
  patchPathsMax: 200,
  /** Path length accepted from the renderer for a patch request. */
  patchPathMax: 4096,
  /** Timeout (ms) for network git ops (push / pull / fetch). */
  networkTimeoutMs: 120_000,
  /** Caps for AI commit-message generation context (main-side enforced). */
  commitGen: {
    /** Max chars of staged diff text included in the prompt. */
    diffCharsMax: 60_000,
    /** Recent log subjects included for commit-style inference. */
    subjectsMax: 20,
    /** Max staged file entries listed in the prompt. */
    filesMax: 200,
    /** Cap on the final proposed message (post-processed). */
    messageMax: 2_000,
  },
} as const;

/**
 * Bounds for the optional GitHub CLI integration.
 *
 * There is deliberately NO `settings.gh` key: detection is automatic and the
 * feature self-hides when `gh` is absent, so there is nothing for a user to
 * configure. Authentication belongs entirely to the CLI — Limboo stores no
 * GitHub credential (see `main/managers/gh/exec.ts`).
 */
export const GH_LIMITS = {
  /** Max PRs / issues fetched in one list request. */
  listMax: 50,
  /** Default list page size. */
  listDefault: 20,
  /** Per-argv-element length cap. */
  argMax: 256,
  /** Max argv elements handed to `gh`. */
  argvMax: 16,
  /** Timeout (ms) for a `gh` invocation. */
  timeoutMs: 12_000,
  /** Max captured output bytes. */
  maxBuffer: 4 * 1024 * 1024,
  /** How long an auth classification stays fresh. */
  authTtlMs: 60_000,
  /** How long a PR/issue list stays fresh (a keystroke must not spawn a process). */
  listTtlMs: 20_000,
  /**
   * How long the commit-email → GitHub-account map stays fresh. Long: the
   * mapping for existing commits never changes, and this is the only call that
   * reaches api.github.com.
   */
  authorsTtlMs: 30 * 60 * 1_000,
  /** Title/label length caps applied before anything reaches the renderer. */
  titleMax: 200,
  /** Redacted error string cap. */
  errorMax: 240,
  /** Max characters of a comment body the agent may post to a PR or issue. */
  commentBodyMax: 8_000,
} as const;

/**
 * Bounds for contributor avatars.
 *
 * This is the only subsystem that makes an outbound request other than the
 * coding agent itself, so every one of these is a security bound, not a tuning
 * knob. See `main/managers/gh/avatars.ts` for the policy they enforce.
 */
export const AVATAR_LIMITS = {
  /** Requested pixel size. Larger than the release document's 48 — these render bigger. */
  px: 64,
  /**
   * Hard cap on the downloaded image, enforced on the header AND while streaming.
   *
   * Deliberately EQUAL to `RELEASE_LIMITS.avatarBytesMax`, because
   * `isEmbeddedAvatar` — the shared screen every avatar passes before it reaches
   * an `<img src>` — derives its length ceiling from that constant. A larger cap
   * here would mean main happily fetching images the renderer then rejects,
   * which looks exactly like "avatars are broken" and gives no clue why.
   */
  bytesMax: 24_576,
  /** Per-request timeout. */
  timeoutMs: 8_000,
  /** Max simultaneous downloads — a 100-commit history must not open 100 sockets. */
  maxConcurrent: 6,
  /** Entries retained in the in-memory cache. */
  cacheMax: 256,
  /** How long a resolved avatar stays fresh. */
  ttlMs: 6 * 60 * 60 * 1_000,
  /** How long a MISS stays cached, so a 404 is not refetched every render. */
  negativeTtlMs: 30 * 60 * 1_000,
  /** Max identities accepted in one batch request from the renderer. */
  batchMax: 120,
} as const;

/**
 * Bounds for the diff review editor (renderer-local: the diff data itself is
 * already capped main-side by `GIT_LIMITS.diffBytesMax`).
 */
export const DIFF_LIMITS = {
  /** Row count above which the review editor windows its rows. */
  virtualizeThreshold: 800,
  /** Rows rendered above/below the viewport when windowing. */
  overscanRows: 20,
  /** Unchanged-context runs longer than this collapse to a single expander. */
  contextFoldRun: 12,
  /** Context lines kept visible on each side of a collapsed run. */
  contextFoldEdge: 3,
  /**
   * Per-side token cap for the intra-line word diff. The LCS is O(n·m), so a
   * minified line must fall back to a whole-line tint rather than block the
   * main thread.
   */
  wordDiffMaxTokens: 400,
  /** Tokenized diff sides cached in the renderer (LRU). */
  tokenCacheMax: 50,
  /** Chars of a single diff side we will hand to the highlighter. */
  highlightCharsMax: 400_000,
} as const;

/** Bounds for the center-column workspace document tabs. */
export const DOCUMENT_LIMITS = {
  /** Open document tabs persisted into settings and restored on launch. */
  maxPersisted: 12,
  /** Depth of the reopen-closed-tab stack (per session, in memory). */
  reopenMax: 10,
  /** Open documents held per session before the oldest unpinned one is evicted. */
  maxPerSession: 24,
  /** Path length accepted for a persisted document entry. */
  pathMax: 4096,
} as const;

/**
 * Bounds for the release manifest. The generator clamps to these, so a
 * malformed or runaway `CHANGELOG.md` can never balloon the app bundle: the
 * changelog grows without bound by design, and the payload compiled from it
 * must not. The renderer re-reads these only to render "+N more" affordances.
 */
export const RELEASE_LIMITS = {
  /** Full manifests compiled into the build. History indexes every version. */
  keepManifests: 5,
  /** `### …` blocks kept per release. */
  maxSections: 16,
  /** Bullets kept per section. */
  maxItemsPerSection: 200,
  maxContributors: 200,
  maxPullRequests: 300,
  maxMergedBranches: 200,
  maxAssets: 120,
  /**
   * Contributors whose forge account CI will resolve (real name + avatar). Far
   * below `maxContributors` on purpose: each one costs a network round trip at
   * build time and adds an embedded image to the bundle, so the long tail keeps
   * its git-derived name and a monogram.
   */
  maxAvatars: 24,
  /** Edge length requested from the forge — matches the 28px render at 2×. */
  avatarPx: 48,
  /**
   * Raw bytes accepted for one avatar before base64. A 48px avatar is 1–4 KB;
   * this is generous headroom, not a target. Anything larger is dropped rather
   * than compiled into every copy of the app.
   */
  avatarBytesMax: 24576,
  /** Cap for any single short field (lead-in, title, summary, name). */
  textMax: 4096,
  /** Cap for a section's raw Markdown, and for a whole release's Markdown. */
  markdownMax: 262144,
} as const;

/**
 * Bounds + caps for the Git worktree + Scripts & Services subsystem (main +
 * renderer both clamp). Slugs stay short so the default worktree root under
 * userData leaves Windows MAX_PATH headroom for deep node_modules trees.
 */
export const WORKTREE_LIMITS = {
  /** Random slug length (a-z0-9 only, generated main-side). */
  slugLength: 8,
  /** Branch name length cap (also re-checked by sanitizeRef). */
  branchMax: 200,
  /** Worktree root path length cap. */
  rootPathMax: 4096,
  /** Max worktrees Limboo manages per repository. */
  maxPerRepo: 32,
  /** Timeout (ms) for `git worktree add/remove` (fresh checkouts can be slow). */
  gitTimeoutMs: 60_000,
  /** Timeout (ms) for one setup/teardown hook command (npm install is slow). */
  hookTimeoutMs: 600_000,
  /** limboo.json repo-config size cap (bytes). */
  configBytesMax: 65_536,
  /** Script / service name cap (validated against ^[a-z0-9-]+$). */
  nameMax: 32,
  /** Hook / script / service command string cap. */
  commandMax: 2_048,
  /** Max setup + teardown commands and scripts per repo config. */
  maxCommands: 16,
  /** Max supervised services per repo config. */
  maxServices: 8,
  /** Auto-assigned service port bounds (never below the privileged range). */
  portRangeStart: { min: 1_024, max: 65_000, default: 42_000 },
  portRangeEnd: { min: 1_024, max: 65_535, default: 42_999 },
  /** Loopback reverse-proxy port. */
  proxyPort: { min: 1_024, max: 65_535, default: 4_040 },
  /** Max consecutive on-failure respawns before a service is marked crashed. */
  maxRestarts: 5,
} as const;

/** Bounds + caps for the Local Memory System (main + renderer both clamp). */
export const MEMORY_LIMITS = {
  /** Memory title length cap accepted from the renderer. */
  titleMax: 200,
  /** Memory body length cap accepted from the renderer. */
  bodyMax: 20_000,
  /** Free-text search query length cap. */
  queryMax: 512,
  /** Hard ceiling on rows returned by a list / search call. */
  listMax: 500,
  /** Memories injected into a single prompt (count). */
  maxInjected: { min: 0, max: 24, default: 8 },
  /** Approx character budget for the injected memory context block. */
  injectCharBudget: 6_000,
  /** Confidence threshold (0..1) for proposal auto-accept. */
  autoAcceptConfidence: { min: 0, max: 1, default: 0.92 },
  /** Days of disuse before an unpinned memory is flagged stale. */
  staleDays: { min: 7, max: 3_650, default: 180 },
} as const;

/** Bounds + caps for the Search Engine (main + renderer both clamp). */
export const SEARCH_LIMITS = {
  /** Free-text query length cap accepted from the renderer. */
  queryMax: 512,
  /** Saved-search name length cap. */
  savedNameMax: 120,
  /** Hard ceiling on total hits returned by a single global search. */
  resultsMax: 500,
  /** Rows returned per source group in the UI. */
  maxResultsPerGroup: { min: 3, max: 50, default: 12 },
  /** Context items injected into a single agent prompt. */
  maxInjected: { min: 0, max: 24, default: 10 },
  /** Approx character budget for the injected `<project-context>` block. */
  injectCharBudget: 4_000,
  /** Files above this size (KiB) index path-only (contents skipped). */
  maxIndexFileKb: { min: 16, max: 4_096, default: 512 },
  /** Chars of file content stored in the FTS index per file (head of file). */
  contentIndexChars: 200_000,
  /** Cap on symbols extracted per file (avoids pathological generated files). */
  maxSymbolsPerFile: 400,
  /** Cap on import/reference edges extracted per file (dependency layer). */
  maxRefsPerFile: 200,
  /** Recent-search history ring length (hard ceiling). */
  historyMax: 50,
  /** User-configurable recent-search ring length (clamped to historyMax). */
  historyLimit: { min: 5, max: 50, default: 25 },
  /** Saved searches per scope. */
  savedMax: 200,
  /** TTL (ms) for the cached git federation snapshot (log/branches/tags). */
  gitCacheTtlMs: 15_000,
} as const;

/**
 * Bounds + caps for the Resume Pipeline (main + renderer both clamp).
 * Repository revalidation on session activation + the one-shot
 * `<repository-delta>` prompt block — all git work is argv-only and bounded.
 */
export const RESUME_LIMITS = {
  /** Commit subjects listed in a delta (rev-list counts stay exact). */
  maxCommitsInDelta: { min: 1, max: 100, default: 25 },
  /** Changed files carried in a delta (true total kept separately). */
  maxFilesInDelta: 400,
  /** Dirty-status entries folded into the snapshot dirty hash. */
  maxDirtyEntries: 500,
  /** Dirty-file summaries stored per snapshot row (paths only). */
  maxDirtyFilesStored: 100,
  /** Approx character budget for the injected `<repository-delta>` block. */
  injectCharBudget: 4_000,
  /**
   * Whole-revalidation deadline; a miss degrades to "no delta". Enrichment
   * yields cooperatively before this fires; the hard stop covers cold-cache
   * git spawns on large repos (Windows first runs regularly exceeded 10s).
   */
  revalidateTimeoutMs: 30_000,
  /** Days before an untouched session skips revalidation (0 = always run). */
  staleThresholdDays: { min: 0, max: 365, default: 0 },
  /** Commit-subject length cap inside a delta. */
  subjectMax: 120,
  /** Changed source files whose symbols are blob-diffed per delta. */
  maxSymbolDeltaFiles: 30,
  /** Byte cap on either side of a symbol blob diff (old blob / new file). */
  maxSymbolFileBytes: 524_288,
  /** Symbol names kept per added/removed/changed bucket per file. */
  maxSymbolsPerFile: 40,
  /** Unfinished plan items appended to the injected delta block. */
  maxPlanItemsInjected: 10,
  /** Character cap per injected plan item line. */
  planItemCharMax: 200,
} as const;

/**
 * Bounds for the Work Graph. `{min, max, default}` members are user-configurable
 * (clamped on every read); bare numbers are hard caps the user cannot raise.
 */
export const GRAPH_LIMITS = {
  /** Nodes retained per session (ring-capped; oldest pruned, edges cascade). */
  retentionPerSession: { min: 200, max: 50_000, default: 5_000 },
  /** Days before a node is swept (0 = keep forever). */
  retentionDays: { min: 0, max: 365, default: 30 },
  /** Days before a completed run folds into a summary row (0 = off). */
  collapseRunsOlderThan: { min: 0, max: 365, default: 0 },
  /** Nodes the renderer holds for one session. */
  maxNodes: { min: 200, max: 50_000, default: 10_000 },
  /** Parallel lanes before overflow shares the last lane with a +N badge. */
  maxLanes: { min: 4, max: 64, default: 16 },
  /** Traversal depth for queries + the semantic-edge neighborhood. */
  maxDepth: { min: 1, max: 32, default: 8 },
  /** Node count above which row windowing kicks in. */
  virtualizeThreshold: { min: 50, max: 5_000, default: 300 },
  /** Delta-coalescing window in ms (0 = flush synchronously). */
  updateFrequency: { min: 0, max: 2_000, default: 120 },
  /** Nodes one query may return. Bounds the recursive CTE. */
  queryLimit: { min: 10, max: 2_000, default: 200 },
  /** Canvas zoom range. */
  zoom: { min: 0.25, max: 4, default: 1 },
  /** Replay/animation speed multiplier (1 = one node every ~220 ms). */
  animationSpeed: { min: 0.25, max: 4, default: 1 },
  /**
   * Node ceiling for the synchronous layout fallback used when a Web Worker
   * cannot be created. Above this the panel refuses rather than blocking the
   * UI thread — never a hang.
   */
  syncLayoutMax: 1_500,
  /** Nodes in one delta push; overflow forces a reset + refetch instead. */
  maxDeltaNodes: 500,
  /** Max chars kept for a node's title. */
  titleMax: 120,
  /** Max chars kept for a node's detail line. */
  detailMax: 400,
  /** Max chars accepted for a query's free-text predicate. */
  textMax: 200,
  /** Max chars of a node's serialized JSON payload (defense in depth). */
  payloadMax: 8_000,
  /**
   * Max edge rows one read may load. `snapshot`/`edgesFor` used to run an
   * unbounded `SELECT *` and filter in JS, so a long session could pull the
   * whole edge table into the main process on every panel open.
   */
  edgeReadMax: 20_000,
  /** Max edges in one delta push; overflow forces a reset like `maxDeltaNodes`. */
  maxDeltaEdges: 2_000,
  /** Max bytes one `graph:export`/`graph:save` result may produce. */
  exportBytesMax: 25_000_000,
  /** Consecutive persist failures before the panel shows a health banner. */
  healthFailureThreshold: 3,
  /** Max sessions one batch export may cover. */
  batchSessionsMax: 50,
} as const;

/**
 * Bounds + caps for Runtime Telemetry. `{min,max,default}` entries are
 * user-configurable and clamped on every read; bare numbers are hard caps.
 *
 * Every ring/cap here exists because the sources are high-frequency: a
 * `message_delta` arrives many times a second and a `tool_progress` heartbeat
 * once per second per tool. Observability must never be able to grow memory,
 * the database, or the IPC volume without limit.
 */
export const TELEMETRY_LIMITS = {
  /** Snapshot-coalescing window (ms). A burst of deltas becomes one push. */
  updateFrequency: { min: 100, max: 5_000, default: 250 },
  /** Clock-driven refresh while the inspector is open (0 = off). */
  idleRefreshMs: { min: 0, max: 60_000, default: 5_000 },
  /** Days of usage history kept (0 = keep forever). */
  retentionDays: { min: 0, max: 365, default: 90 },
  /** Run rollups kept per session. */
  retainRuns: { min: 10, max: 2_000, default: 200 },
  ringSize: { min: 14, max: 28, default: 18 },
  ringStroke: { min: 2, max: 6, default: 4 },
  /** Percent of context REMAINING below which the ring turns warning. */
  warnRemainingPct: { min: 5, max: 50, default: 25 },
  /** Percent of context REMAINING below which the ring turns danger. */
  criticalRemainingPct: { min: 1, max: 25, default: 10 },
  /** Notify below this percent remaining (0 = off). */
  notifyRemainingPct: { min: 0, max: 50, default: 15 },

  /* --- hard caps --- */
  /** One persisted quota sample per window per bucket. */
  sampleBucketMs: 5 * 60_000,
  /** Max trend points one history read returns. */
  historyPoints: 180,
  /** Max in-flight tool rows carried on a snapshot. */
  maxToolRows: 8,
  /**
   * Ring of recently-seen assistant `message.id`s, used to deduplicate
   * `message_start`. Parallel tool calls emit several assistant messages
   * sharing one id with identical usage — Anthropic documents this, and
   * without the dedupe the context gauge multiplies by the fan-out width.
   */
  seenMessageIds: 64,
  /** Ring of prompt-growth samples backing the remaining-turns projection. */
  growthSamples: 32,
  /** Minimum growth samples before a projection is offered at all. */
  growthMinSamples: 3,
  /** Max chars kept for a tool name on a snapshot (never its input). */
  toolNameMax: 64,
  /** Max chars kept for a health error line (redacted first). */
  errorMax: 200,
  /**
   * Divisor turning a MEASURED character count into an ESTIMATED token count.
   * A constant, not a measurement — which is precisely why every segment
   * derived from it is labelled an estimate in the UI. There is deliberately
   * no bundled tokenizer: a tokenizer dependency for a hover card is not
   * justified, and it would still be wrong for cached and compacted content.
   */
  charsPerToken: 3.6,
  /** Max bytes one `runtime:export` result may produce. */
  exportBytesMax: 8_000_000,
} as const;

/** Bounds + caps for the Voice subsystem (main + renderer both clamp). */
export const VOICE_LIMITS = {
  /** VAD speech-probability threshold. */
  sensitivity: { min: 0.1, max: 0.95, default: 0.5 },
  /** Trailing silence (ms) ending an utterance in auto mode. */
  silenceMs: { min: 300, max: 5_000, default: 1_200 },
  /** TTS speech-rate multiplier. */
  speed: { min: 0.5, max: 2, default: 1 },
  /** Playback volume (renderer gain). */
  volume: { min: 0, max: 1, default: 1 },
  /** Kokoro speaker id (kokoro-en-v0_19 ships 11 voices). */
  speakerId: { min: 0, max: 10, default: 0 },
  /** Max bytes accepted per `voice:audio-chunk` message from the renderer. */
  audioChunkBytesMax: 16_384,
  /** Max buffered utterance audio (bytes of 16 kHz Int16 ≈ 5 minutes). */
  utteranceBytesMax: 9_600_000,
  /** Text cap for a single TTS synthesis job (one sentence/segment). */
  ttsTextMax: 2_000,
  /** Hard ceiling on a model archive download (bytes). */
  downloadBytesMax: 2_147_483_648,
  /** Max entries accepted while extracting a model archive. */
  extractEntryMax: 4_096,
  /** Min interval (ms) between download-progress pushes to the renderer. */
  progressThrottleMs: 150,
} as const;

/**
 * Bounds + caps for the Attachment Manager (main + renderer both clamp).
 * Attachments are session-owned staged copies under
 * `userData/attachments/<sessionId>/` — never executed, never extracted.
 */
export const ATTACHMENT_LIMITS = {
  /** Per-file size cap the user can tune (MB). */
  maxFileSizeMB: { min: 1, max: 100, default: 25 },
  /** Files attachable to a single message. */
  maxFilesPerMessage: { min: 1, max: 20, default: 10 },
  /** Total attachments a session may accumulate. */
  maxTotalPerSession: { min: 10, max: 500, default: 100 },
  /** Messages API hard cap per image content block (decoded bytes). */
  imageVisionMaxBytes: 5 * 1024 * 1024,
  /** Threshold (MB) above which an image is downscaled before vision send. */
  downscaleThresholdMB: { min: 1, max: 5, default: 3 },
  /** Longest edge (px) of the chip thumbnail. */
  thumbEdgePx: 96,
  /** Cap on the stored thumbnail data URL (chars). */
  thumbDataUrlMax: 65_536,
  /** Display-name length cap (sanitized basename). */
  nameMax: 120,
  /** Source-path length cap accepted from the renderer. */
  pathMax: 4096,
  /** Attachment id length cap. */
  idMax: 64,
  /** Char budget of the `<attachments>` manifest appended to a prompt. */
  manifestCharBudget: 4_000,
  /** Max bytes accepted for one pasted (in-memory) image over IPC. */
  pasteBytesMax: 32 * 1024 * 1024,
  /** Min interval (ms) between staging-progress pushes to the renderer. */
  progressThrottleMs: 100,
} as const;

/**
 * Extensions classified as elevated risk (executables / scripts / installers).
 * Attaching NEVER executes anything; policy `block` refuses these, `warn`
 * stages them flagged so the UI shows a warning tone.
 */
export const ATTACHMENT_ELEVATED_EXTENSIONS = [
  'exe', 'dll', 'msi', 'scr', 'com', 'bat', 'cmd', 'ps1', 'psm1', 'vbs',
  'vbe', 'jse', 'wsf', 'jar', 'lnk', 'sh', 'app', 'dmg', 'pkg', 'deb', 'rpm',
] as const;

/** Archive extensions — attachable when enabled, but never auto-extracted. */
export const ATTACHMENT_ARCHIVE_EXTENSIONS = [
  'zip', 'tar', 'gz', 'tgz', '7z', 'rar', 'bz2', 'xz', 'zst',
] as const;

export const FONT_SCALE_LIMITS = { min: 0.85, max: 1.3, default: 1 } as const;

/**
 * Chat/LLM-stream fonts offered in Settings › Appearance. `family` is the CSS
 * family name (empty = pure system fallback stack); `google` is the Google
 * Fonts css2 family query used to load it (absent = no network load). This is
 * an ALLOWLIST: the main process rejects any `chatFont` id not listed here, so
 * a renderer-supplied value can never inject arbitrary CSS or URLs.
 */
export const CHAT_FONTS = [
  { id: 'roboto', label: 'Roboto', family: '"Roboto"', google: 'Roboto:ital,wght@0,100..900;1,100..900' },
  { id: 'inter', label: 'Inter', family: '"Inter"', google: 'Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900' },
  { id: 'open-sans', label: 'Open Sans', family: '"Open Sans"', google: 'Open+Sans:ital,wght@0,300..800;1,300..800' },
  { id: 'lato', label: 'Lato', family: '"Lato"', google: 'Lato:ital,wght@0,300;0,400;0,700;1,400' },
  { id: 'source-sans-3', label: 'Source Sans 3', family: '"Source Sans 3"', google: 'Source+Sans+3:ital,wght@0,200..900;1,200..900' },
  { id: 'noto-sans', label: 'Noto Sans', family: '"Noto Sans"', google: 'Noto+Sans:ital,wght@0,100..900;1,100..900' },
  { id: 'ibm-plex-sans', label: 'IBM Plex Sans', family: '"IBM Plex Sans"', google: 'IBM+Plex+Sans:ital,wght@0,100..700;1,100..700' },
  { id: 'system', label: 'System default', family: '' },
] as const;

/** Offline / pre-load fallback stack appended after every chat font. */
export const CHAT_FONT_FALLBACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Minimum window size enforced by the main process. */
export const WINDOW_MIN = { width: 1024, height: 640 } as const;

/** Default window size used on first launch (no persisted state yet). */
export const WINDOW_DEFAULT = { width: 1440, height: 900 } as const;

/** The single source of truth for default settings. */
export const DEFAULT_SETTINGS: AppSettings = {
  version: SETTINGS_VERSION,
  appearance: {
    density: 'comfortable',
    fontScale: FONT_SCALE_LIMITS.default,
    reducedMotion: false,
    chatFont: 'roboto',
  },
  layout: {
    leftWidth: LAYOUT_LIMITS.left.default,
    rightWidth: LAYOUT_LIMITS.right.default,
    activeTab: 'files',
    sessionsCollapsed: false,
    terminalOpen: false,
    terminalWidth: LAYOUT_LIMITS.terminal.default,
    gitWidth: LAYOUT_LIMITS.git.default,
    graphWidth: LAYOUT_LIMITS.graph.default,
    documents: [],
  },
  behavior: {
    minimizeToTray: false,
    notifications: true,
  },
  agent: {
    model: 'claude-opus-5',
    thinking: 'adaptive',
    permissionMode: 'approve-edits',
    webSearch: true,
    autoApproveReads: true,
    maxTurns: AGENT_LIMITS.maxTurns.default,
    logVerbosity: 'normal',
    connection: {
      heartbeatInterval: AGENT_CONNECTION_LIMITS.heartbeatInterval.default,
      reconnectDelay: AGENT_CONNECTION_LIMITS.reconnectDelay.default,
      maxRecoveryAttempts: AGENT_CONNECTION_LIMITS.maxRecoveryAttempts.default,
      heartbeatFailureThreshold: AGENT_CONNECTION_LIMITS.heartbeatFailureThreshold.default,
      idleTimeout: AGENT_CONNECTION_LIMITS.idleTimeout.default,
      autoRestart: true,
      sessionPersistence: true,
      connectivityNotifications: true,
    },
    plan: {
      defaultMode: 'plan',
      requireSecondaryConfirm: false,
      defaultExportFormat: 'md',
      showEstimates: true,
      showReasoning: true,
      highlightRisk: true,
      showCheckpointsOnTasks: true,
      retainPlanHistory: true,
      historyLimit: 20,
      savePlansToMemory: false,
      allowManualReorder: false,
      notifyOnPhaseComplete: false,
    },
    terminal: {
      shell: '',
      fontFamily: '',
      fontSize: TERMINAL_LIMITS.fontSize.default,
      cursorStyle: 'block',
      cursorBlink: true,
      scrollback: TERMINAL_LIMITS.scrollbackLines,
      copyOnSelect: false,
      confirmKill: true,
      mirrorAgentCommands: true,
    },
    cursor: {
      preferredAuth: 'auto',
      manualBrowserLogin: false,
      executablePath: '',
      hooks: 'auto',
      discoveredModels: [],
    },
    sandbox: {
      mode: 'auto',
      network: 'all',
      allowedDomains: [],
      allowWritePaths: [],
      excludedCommands: [],
      readOnlyAttachments: true,
      failIfUnavailable: false,
      providerOverride: 'auto',
    },
    harness: {
      id: 'claude-code',
      // Ships OFF. The harness path lands behind this switch so it can be
      // exercised without changing a single existing install's behaviour;
      // flipping the default is its own deliberate step.
      legacyClaudeSdk: true,
      sandboxProvider: 'local-worktree',
      debug: false,
    },
    hookEngine: {
      enabled: true,
      audit: 'lifecycle',
    },
    subagents: {
      inlineActivity: true,
      forwardText: true,
      progressSummaries: true,
      summaryMax: SUBAGENT_LIMITS.summaryMax.default,
      transcriptMax: SUBAGENT_LIMITS.transcriptMax.default,
      rollupMax: SUBAGENT_LIMITS.rollupMax.default,
      retainRuns: SUBAGENT_LIMITS.retainRuns.default,
    },
  },
  git: {
    userName: '',
    userEmail: '',
    commitMessageTemplate: '',
    suggestCommitFromConversation: true,
    autoCheckpoint: true,
    maxCheckpoints: GIT_LIMITS.maxCheckpoints.default,
    confirmBranchSwitchWithChanges: true,
    commandApproval: 'destructive',
    push: {
      autoSetUpstream: true,
      confirmForcePush: true,
    },
    pull: {
      strategy: 'ff-only',
    },
    avatars: {
      enabled: true,
    },
    worktrees: {
      enabled: true,
      root: '',
      branchPrefix: 'limboo',
      autoSetup: true,
      confirmHooks: true,
      teardownOnArchive: false,
    },
    services: {
      portRangeStart: WORKTREE_LIMITS.portRangeStart.default,
      portRangeEnd: WORKTREE_LIMITS.portRangeEnd.default,
      proxyEnabled: false,
      proxyPort: WORKTREE_LIMITS.proxyPort.default,
    },
  },
  memory: {
    enabled: true,
    injectIntoPrompt: true,
    maxInjected: MEMORY_LIMITS.maxInjected.default,
    autoCapture: 'propose',
    autoAcceptConfidence: 0,
    expiry: {
      enabled: true,
      staleDays: MEMORY_LIMITS.staleDays.default,
    },
  },
  search: {
    enabled: true,
    indexContents: true,
    includeIgnored: false,
    maxFileSizeKb: SEARCH_LIMITS.maxIndexFileKb.default,
    injectContext: true,
    maxInjected: SEARCH_LIMITS.maxInjected.default,
    maxResultsPerGroup: SEARCH_LIMITS.maxResultsPerGroup.default,
    sources: {
      files: true,
      symbols: true,
      docs: true,
      memory: true,
      commits: true,
      branches: true,
      sessions: true,
    },
    liveDelay: 'fast',
    historyLimit: SEARCH_LIMITS.historyLimit.default,
    fuzzy: true,
    openOnClick: true,
  },
  resume: {
    enabled: true,
    injectDelta: true,
    maxCommitsInDelta: RESUME_LIMITS.maxCommitsInDelta.default,
    staleThresholdDays: RESUME_LIMITS.staleThresholdDays.default,
  },
  graph: {
    enabled: true,
    persist: true,
    updateFrequency: GRAPH_LIMITS.updateFrequency.default,

    retentionPerSession: GRAPH_LIMITS.retentionPerSession.default,
    retentionDays: GRAPH_LIMITS.retentionDays.default,
    collapseRunsOlderThan: GRAPH_LIMITS.collapseRunsOlderThan.default,
    pruneOnSessionEnd: true,

    layoutAlgorithm: 'lanes',
    nodeColoring: 'kind',
    showEdgeLabels: false,
    showSemanticEdges: true,
    showDerivedEdges: true,
    artifactPreviews: true,
    animate: true,
    animationSpeed: GRAPH_LIMITS.animationSpeed.default,

    outlineGroupBy: 'none',
    groupSubagents: false,
    autoCollapseCompleted: false,
    maxDepth: GRAPH_LIMITS.maxDepth.default,

    maxNodes: GRAPH_LIMITS.maxNodes.default,
    maxLanes: GRAPH_LIMITS.maxLanes.default,
    virtualizeThreshold: GRAPH_LIMITS.virtualizeThreshold.default,

    timelineSync: true,
    checkpointIntegration: true,
    overlays: {
      git: true,
      terminal: true,
      mcp: true,
      memory: true,
      file: true,
      search: true,
      service: true,
    },

    exportFormat: 'json',
    exportScope: 'session',
    exportTelemetry: false,
  },
  runtime: {
    enabled: true,
    persist: true,
    updateFrequency: TELEMETRY_LIMITS.updateFrequency.default,
    idleRefreshMs: TELEMETRY_LIMITS.idleRefreshMs.default,
    retentionDays: TELEMETRY_LIMITS.retentionDays.default,
    retainRuns: TELEMETRY_LIMITS.retainRuns.default,

    indicator: true,
    anchor: 'composer',
    pinned: false,
    ringSize: TELEMETRY_LIMITS.ringSize.default,
    ringStroke: TELEMETRY_LIMITS.ringStroke.default,
    ringLabel: false,
    ringMetric: 'context-used',
    animation: 'subtle',

    // The inspector is a hover card inside an `overflow-hidden` workspace card,
    // so its height is a hard constraint rather than a preference. It shows the
    // context window and nothing else — the one resource that matters
    // continuously during a long session — which is why there is no section
    // ordering or collapsed-section state left to persist.
    layout: 'expanded',
    showEstimates: true,
    tokenDisplay: 'percent',
    highContrast: false,

    warnRemainingPct: TELEMETRY_LIMITS.warnRemainingPct.default,
    criticalRemainingPct: TELEMETRY_LIMITS.criticalRemainingPct.default,
    notifyRemainingPct: TELEMETRY_LIMITS.notifyRemainingPct.default,
  },
  mcp: {
    enabled: true,
    heartbeatInterval: MCP_LIMITS.heartbeatInterval.default,
    probeTimeout: MCP_LIMITS.probeTimeout.default,
    defaultTrust: 'ask',
    defaultPlanAccess: 'annotated',
    allowPrivateNetwork: false,
    autoImport: {
      cursor: true,
      claude: true,
    },
    injectIntoClaude: true,
    injectIntoCursor: true,
    logVerbosity: 'normal',
  },
  attachments: {
    enabled: true,
    maxFileSizeMB: ATTACHMENT_LIMITS.maxFileSizeMB.default,
    maxFilesPerMessage: ATTACHMENT_LIMITS.maxFilesPerMessage.default,
    maxTotalPerSession: ATTACHMENT_LIMITS.maxTotalPerSession.default,
    categories: {
      images: true,
      documents: true,
      code: true,
      archives: false,
    },
    images: {
      attachAsVision: true,
      downscaleThresholdMB: ATTACHMENT_LIMITS.downscaleThresholdMB.default,
    },
    autoIndex: false,
    elevatedRiskPolicy: 'block',
  },
  updates: {
    autoCheck: true,
    autoDownload: true,
    // Empty on a fresh install: the very first launch shows the notes for the
    // version it shipped with, which is the correct introduction to the app.
    lastSeenVersion: '',
  },
  voice: {
    enabled: true,
    input: {
      deviceId: '',
      activation: 'auto',
      sensitivity: VOICE_LIMITS.sensitivity.default,
      silenceMs: VOICE_LIMITS.silenceMs.default,
      language: 'en',
      autoPunctuation: true,
    },
    output: {
      enabled: true,
      deviceId: '',
      speakerId: VOICE_LIMITS.speakerId.default,
      speed: VOICE_LIMITS.speed.default,
      volume: VOICE_LIMITS.volume.default,
      streamWhileGenerating: true,
      speakWhen: 'voice-initiated',
    },
    playbackEvents: {
      finalAnswers: true,
      whileToolsRun: false,
      planningUpdates: false,
      taskCompletion: true,
      notifications: false,
    },
    interruption: 'stop',
    shortcuts: {
      toggle: 'Mod+Shift+M',
      pushToTalk: 'Mod+Space',
    },
    models: {
      autoDownload: false,
      autoUpdate: false,
      offlineOnly: false,
    },
  },
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/* ------------------------------------------------------------------ */
/* Workspace (Phase 2)                                                 */
/* ------------------------------------------------------------------ */

/** Bumped whenever the workspace DB schema changes incompatibly. */
export const WORKSPACE_SCHEMA_VERSION = 18;

/** Input caps the main process enforces on renderer-supplied session values. */
export const SESSION_LIMITS = {
  titleMax: 200,
  idMax: 128,
} as const;

/** Default values for a freshly created session. */
export const SESSION_DEFAULTS = {
  title: 'New session',
  branch: 'main',
  status: 'active',
} as const;

/** Input caps the main process enforces on renderer-supplied workspace values. */
export const WORKSPACE_LIMITS = {
  nameMax: 200,
  pathMax: 4096,
} as const;

/* ------------------------------------------------------------------ */
/* File System Layer (Phase 4)                                         */
/* ------------------------------------------------------------------ */

/**
 * Bounds the File System Layer enforces so a hostile or simply enormous tree can
 * never stall the main process or exfiltrate large/binary blobs through a read.
 */
export const FS_LIMITS = {
  /** Hard ceiling on tree nodes per index pass (mirrors the stats walk cap). */
  maxTreeEntries: 50_000,
  /** Max directory depth the walker/watcher will descend. */
  maxDepth: 24,
  /** Max bytes a single `fs:readFile` may return as text (2 MiB). */
  maxReadBytes: 2 * 1024 * 1024,
  /** Bytes sniffed from the head of a file for binary (NUL) detection. */
  binarySniffBytes: 8_000,
  /** Min interval (ms) between progress pushes to the renderer. */
  progressThrottleMs: 80,
  /** Debounce (ms) coalescing watcher bursts into one tree push. */
  watchDebounceMs: 250,
  /** Bounded length of the per-workspace in-memory File History ring. */
  historyMax: 200,
  /** Per-relative-path length cap for `fs:readFile` requests. */
  relPathMax: 4096,
  /** Max bytes a single `fs:writeFile` may accept (matches the read cap). */
  maxWriteBytes: 2 * 1024 * 1024,
  /** Max entries a recursive copy/delete may touch (bounded like the tree walk). */
  maxCopyEntries: 10_000,
  /** Changed-path batches larger than this fall back to a full search reindex. */
  incrementalIndexMax: 50,
  /** Cap on distinct paths accumulated per watcher debounce window. */
  watchBatchMax: 500,
} as const;

/** Directories never walked for stats and excluded by default from indexing. */
export const DEFAULT_IGNORED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.cache',
  'target',
  'vendor',
  '.venv',
  '__pycache__',
  // Limboo's reserved workspace namespace (per-run Cursor attachment staging;
  // transient — created at run start and removed in the run's finally).
  '.limboo',
] as const;

/** Default per-workspace configuration applied on create/open. */
export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  ignoredDirs: [...DEFAULT_IGNORED_DIRS],
  approveTerminalCommands: true,
  preferredShell: '',
  // Undefined = inherit the global agent.plan.defaultMode.
  planDefaultMode: undefined,
};

/**
 * System roots a workspace may never point at. The user's home directory itself
 * is also rejected (checked dynamically in the validator).
 */
export const FORBIDDEN_WORKSPACE_PATHS = [
  '/',
  '/etc',
  '/sys',
  '/proc',
  '/dev',
  '/bin',
  '/boot',
  '/usr',
  '/var',
  '/root',
] as const;
