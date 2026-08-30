/**
 * Types shared across the main, preload, and renderer processes. These describe
 * the data that crosses the IPC boundary plus the core domain models the UI is
 * shaped around. Phase 1 ships no agent/git/terminal logic, but the models are
 * intentionally shaped so later phases can feed real data in without redesign.
 */

/** Recursive partial — used for settings patches that cross the IPC boundary. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/* ------------------------------------------------------------------ */
/* Window state                                                        */
/* ------------------------------------------------------------------ */

/** Persisted window geometry, restored on the next launch. */
export interface WindowStateData {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

/** Visual density of UI rows/controls. */
export type UiDensity = 'comfortable' | 'compact';

/**
 * The right activity drawer tabs. Mirrors the rail in the UI.
 *
 * The integrated terminal is deliberately absent: it is its own full-height
 * column inside the workspace card (`settings.layout.terminalOpen`), not a
 * drawer tab.
 */
export type ActivityTab =
  | 'files'
  | 'changes'
  | 'git'
  | 'memory'
  | 'tasks'
  | 'console'
  | 'graph';

/** Kinds of center-column workspace document that survive a restart. */
/**
 * The active harness's one-time setup plan, as shown for approval.
 *
 * Secret-free by construction: command strings and file names the adapter
 * declares about itself, nothing derived from the environment.
 */
export interface HarnessBootstrapInfo {
  /** False when the adapter could not be loaded at all. */
  available: boolean;
  harnessId: string;
  /**
   * `null` when this harness installs nothing — there is nothing to approve.
   *
   * `dir` is where the files are written and the commands are RUN — relative to
   * the sandbox root, never absolute (an absolute one would carry the home
   * directory into the renderer). Showing it is not decoration: the commands
   * only work in that directory, because that is where the adapter just wrote
   * the lockfile they install from.
   */
  plan: {
    commands: string[];
    files: string[];
    dir?: string;
    fingerprint: string;
  } | null;
  /** True when the current plan's fingerprint matches the stored approval. */
  acked: boolean;
  /**
   * Set when the adapter HAS a setup step but could not describe it.
   *
   * A different claim from `plan: null`, and deliberately its own field: the two
   * used to be the same value, so a broken adapter rendered as "this harness
   * needs no setup step" while runs silently lost the consent gate.
   */
  planError?: string;
  /**
   * Per-tool prerequisite status for this plan's commands, in invocation order.
   *
   * Tool names and code-supplied remedies only — never a resolved path, which
   * would leak the home directory into the renderer.
   */
  prerequisites?: { tool: string; found: boolean; hint: string }[];
  error?: string;
}

export type PersistedDocumentKind = 'diff' | 'file';

/**
 * One restorable center-column document. The `conversation` document is implicit
 * (always present, never closable) and so is never persisted.
 */
export interface PersistedDocument {
  sessionId: string;
  kind: PersistedDocumentKind;
  /** Repo-relative path of the reviewed file. */
  path: string;
  /** Whether the diff is the staged (index) side. */
  staged: boolean;
  /** Comparison base, when the document was opened against something other than HEAD. */
  baseRef?: string;
  pinned: boolean;
}

/**
 * Persistent, user-facing preferences. NOTE: there is intentionally NO light
 * theme — Limboo is pure-black, dark-only by product rule. "Appearance" here is
 * limited to density / font scaling / motion, never a color scheme.
 */
export interface AppSettings {
  /** Schema version so future migrations can upgrade older settings files. */
  version: number;
  appearance: {
    density: UiDensity;
    /** UI font scale multiplier, clamped on read (e.g. 0.85–1.3). */
    fontScale: number;
    /** Honor reduced-motion / disable non-essential animations. */
    reducedMotion: boolean;
    /** Chat/LLM-stream typeface — an id from the CHAT_FONTS allowlist. */
    chatFont: string;
  };
  layout: {
    /** Left sessions sidebar width in px. */
    leftWidth: number;
    /** Right activity drawer width in px. */
    rightWidth: number;
    /** Currently open drawer tab, or null when the drawer is collapsed. */
    activeTab: ActivityTab | null;
    /** Whether the left sessions sidebar is collapsed to a thin rail. */
    sessionsCollapsed: boolean;
    /** Whether the integrated terminal panel is open. */
    terminalOpen: boolean;
    /** Integrated terminal panel width in px. */
    terminalWidth: number;
    /** Git workspace drawer width in px (wider default than other tabs). */
    gitWidth: number;
    /** Work Graph drawer width in px (widest default — it renders a canvas). */
    graphWidth: number;
    /**
     * Open center-column workspace documents, restored on launch. Only the tab
     * SET is persisted — never the per-document view state (scroll offset, folds,
     * selected hunk). Those describe a diff whose shape may have changed while
     * the app was closed, and restoring a stale offset is worse than not
     * restoring one. Bounded by `DOCUMENT_LIMITS.maxPersisted`.
     */
    documents: PersistedDocument[];
  };
  behavior: {
    /** Keep running in the tray when the last window closes. */
    minimizeToTray: boolean;
    /** Show desktop notifications for long-running / completed work. */
    notifications: boolean;
  };
  /**
   * Coding-agent orchestration preferences. Limboo never stores Anthropic
   * credentials — Claude Code owns its own authentication. An optional Cursor
   * API key is held encrypted via Electron `safeStorage` in a main-process-only
   * file under `userData/secrets/` — never in this settings file, never sent to
   * the renderer. These knobs only shape how the local agent process is driven.
   */
  agent: {
    /** Anthropic model id passed to the Claude Code runtime. */
    model: string;
    /** Extended-thinking budget. */
    thinking: 'off' | 'on' | 'adaptive';
    /**
     * How tool calls are gated:
     * - `approve-edits`: writes/commands prompt; reads run freely.
     * - `approve-all`:   every gated tool prompts.
     * - `auto`:          nothing prompts (still path-guarded to the workspace).
     */
    permissionMode: 'approve-edits' | 'approve-all' | 'auto';
    /** Offer the built-in WebSearch tool to the agent. */
    webSearch: boolean;
    /** Auto-approve read-only tools (read/glob/grep/websearch) inside the workspace. */
    autoApproveReads: boolean;
    /** Maximum internal agent turns before the run yields. */
    maxTurns: number;
    /** How chatty the agent diagnostics console + main log are. */
    logVerbosity: 'quiet' | 'normal' | 'verbose';
    /**
     * Connection-monitoring / reliability knobs. These shape how the manager
     * supervises the Claude Code capability — heartbeat cadence, automatic
     * recovery, and connectivity notifications. None of them touch credentials.
     */
    connection: {
      /** Heartbeat re-verification interval (ms). 0 disables the heartbeat. */
      heartbeatInterval: number;
      /** Base delay before a recovery retry (ms); grows with exponential backoff. */
      reconnectDelay: number;
      /** Max transparent recovery attempts before surfacing a `failed` state. */
      maxRecoveryAttempts: number;
      /** Consecutive heartbeat failures before entering `reconnecting`. */
      heartbeatFailureThreshold: number;
      /** Idle window (ms) after which an idle run baseline is refreshed. 0 disables. */
      idleTimeout: number;
      /** Re-probe + reset to ready automatically after a recoverable capability error. */
      autoRestart: boolean;
      /** Persist sdk session ids + diagnostics across app restarts. */
      sessionPersistence: boolean;
      /** Desktop notifications for connectivity transitions (reconnect / rate-limit). */
      connectivityNotifications: boolean;
    };
    /**
     * Plan Mode preferences — the review-first workflow where the agent proposes
     * a plan before touching the repository. None of these touch credentials.
     */
    plan: {
      /** Composer default permission mode when a session has no remembered mode. */
      defaultMode: SessionPermissionMode;
      /** Require a second confirmation click before execution begins. */
      requireSecondaryConfirm: boolean;
      /** Default format used by the plan Download action. */
      defaultExportFormat: 'md' | 'txt' | 'pdf';
      /** Show the plan metadata row (affected files, task count, risk). */
      showEstimates: boolean;
      /** Render architectural reasoning alongside tasks. */
      showReasoning: boolean;
      /** Highlight high-risk steps. */
      highlightRisk: boolean;
      /** Surface a Git-checkpoint hint under Live progress during execution. */
      showCheckpointsOnTasks: boolean;
      /** Keep previous plan revisions so iterations can be compared/restored. */
      retainPlanHistory: boolean;
      /** Max plan revisions kept per session (older ones are pruned). */
      historyLimit: number;
      /** Save a completed plan into the Local Memory system for future retrieval. */
      savePlansToMemory: boolean;
      /** Allow manual reordering of tasks after approval (best-effort UI only). */
      allowManualReorder: boolean;
      /** Fire a desktop notification when a plan phase completes. */
      notifyOnPhaseComplete: boolean;
      /**
       * How long a parked ExitPlanMode approval holds the provider run open
       * before it degrades to detached approval. Bounded by
       * `PLAN_LIMITS.parkTimeoutMs`.
       */
      parkTimeoutMs: number;
      /**
       * Steer the agent (via `planModeInstructions`) to write its plan down
       * before presenting it, so the approval gate has real text to show.
       * Turning this off restores the CLI's default plan-mode workflow body.
       */
      restateInMessage: boolean;
      /** Strip secret-shaped material from plan markdown before it is persisted. */
      redactSecrets: boolean;
    };
    /**
     * Integrated-terminal preferences. Appearance + behavior knobs for the
     * workspace terminal panel; the per-workspace shell + command-approval policy
     * live on {@link WorkspaceConfig} instead.
     */
    terminal: {
      /** Shell binary override (empty = per-workspace / OS default). */
      shell: string;
      /** Terminal font family (empty = the app mono token). */
      fontFamily: string;
      /** Terminal font size in px. */
      fontSize: number;
      /** Cursor shape. */
      cursorStyle: 'block' | 'bar' | 'underline';
      /** Blink the cursor. */
      cursorBlink: boolean;
      /** Scrollback buffer length in lines. */
      scrollback: number;
      /** Copy the selection to the clipboard automatically on mouse-up. */
      copyOnSelect: boolean;
      /** Ask for confirmation before killing a terminal with a live process. */
      confirmKill: boolean;
      /** Mirror agent-run shell commands into the integrated terminal. */
      mirrorAgentCommands: boolean;
    };
    /**
     * Cursor provider preferences (authentication only). No secrets live here —
     * the API key is safeStorage-encrypted in a main-only file.
     */
    cursor: {
      /** Which auth path the health probe prefers when both are available. */
      preferredAuth: 'auto' | 'api-key' | 'cli-login';
      /** Print the login URL instead of auto-opening a browser (NO_OPEN_BROWSER). */
      manualBrowserLogin: boolean;
      /**
       * Explicit `cursor-agent` executable path. When set it is the ONLY
       * candidate (fail-closed — no PATH fallback); blank = probe PATH +
       * default install dirs. Validated in the main process (absolute,
       * exists, is a file).
       */
      executablePath: string;
      /**
       * Session hooks bridge (interactive per-tool prompts). `auto` writes a
       * session-scoped hooks.json per run (capability-gated — only ever
       * tightens); `off` skips it. The deny-first cli.json posture applies
       * either way.
       */
      hooks: 'auto' | 'off';
      /**
       * Model ids discovered via `cursor-agent models`, persisted so provider
       * routing survives a restart before the first probe. Charset-validated
       * and capped in the main process; never trusted for anything but
       * routing/picker display.
       */
      discoveredModels: string[];
    };
    /**
     * Provider-Neutral Hook Engine — the governance/audit layer between every
     * coding provider and every subsystem. `enabled` gates only the emission of
     * observability events; it NEVER gates enforcement (the permission gate
     * always runs). `audit` shapes how much reaches the Hooks panel.
     */
    hookEngine: {
      /** Emit normalized lifecycle events onto the governance bus + audit log. */
      enabled: boolean;
      /** Audit verbosity: nothing, lifecycle+gate only, or every observe phase. */
      audit: 'off' | 'lifecycle' | 'verbose';
    };
    /**
     * Subagent orchestration — how much of a delegated worker's execution the
     * conversation shows. There is deliberately no "open subagents in a panel"
     * option: the stream is the only orchestration surface (see
     * `docs/architecture/subsystems/subagents.md`).
     */
    subagents: {
      /** Render the inline subagent row. Off folds workers back into plain tool chips. */
      inlineActivity: boolean;
      /**
       * Ask the provider to forward the worker's own transcript
       * (`forwardSubagentText`). Off keeps only the returned summary; the SDK
       * then emits just the worker's tool_use/tool_result blocks.
       */
      forwardText: boolean;
      /**
       * Ask the provider for periodic AI-written progress lines
       * (`agentProgressSummaries`). Costs a small periodic fork of the worker's
       * conversation; off falls back to stage labels derived from tool names.
       */
      progressSummaries: boolean;
      /** Cap on the stored returned summary, in characters. */
      summaryMax: number;
      /** Cap on the stored forwarded transcript, in characters. */
      transcriptMax: number;
      /** Cap on each rolled-up list (tools, MCP servers, changed files). */
      rollupMax: number;
      /** How many finished subagent runs to keep per session. */
      retainRuns: number;
    };
    /**
     * Provider-neutral OS-level Sandbox (defense-in-depth Layer 3). Limboo owns
     * one sandbox policy and translates it into whichever agent runs: Claude's
     * Agent-SDK `Options.sandbox` (bubblewrap/Seatbelt) and Cursor's
     * `.cursor/sandbox.json` + `--sandbox` flag. The sandbox is *containment*,
     * never *authorization* — the permission gate (`decideToolUse`) is always
     * the authority and runs on top. The writable root is always the session
     * worktree and userData/secrets are always denied regardless of these knobs.
     */
    sandbox: {
      /** `auto` = sandbox when the OS supports it; `disabled` = no OS jail. */
      mode: 'auto' | 'enabled' | 'disabled';
      /**
       * Network egress policy for sandboxed commands. `all` keeps the network
       * open (filesystem is still jailed); `allowlist` permits only
       * {@link allowedDomains}; `off` blocks all network.
       */
      network: 'all' | 'allowlist' | 'off';
      /** Domains reachable when `network === 'allowlist'` (wildcards allowed). */
      allowedDomains: string[];
      /** Extra writable directories granted beyond the session worktree. */
      allowWritePaths: string[];
      /**
       * Commands that run OUTSIDE the jail (e.g. `docker *`, tools incompatible
       * with bubblewrap), still gated by the permission engine. Claude-only —
       * maps to the SDK's `sandbox.excludedCommands`; Cursor has no equivalent.
       */
      excludedCommands: string[];
      /** Mount the session's attachment staging dir read-only inside the jail. */
      readOnlyAttachments: boolean;
      /**
       * Strict mode. When true a run is blocked if the sandbox cannot start
       * (missing bubblewrap, unsupported platform); when false it degrades to
       * an unsandboxed run with a surfaced timeline note.
       */
      failIfUnavailable: boolean;
      /**
       * Force a specific provider's native sandbox instead of the one that
       * matches the running agent. `auto` = follow the active provider.
       */
      providerOverride: 'auto' | 'claude-native' | 'cursor-native';
    };
    /**
     * Which agent HARNESS runs the selected model, and how.
     *
     * A harness is *how* a model runs; the provider is *who* serves it. They
     * are not the same axis: Anthropic models can run through either the AI
     * SDK's `claude-code` harness or Limboo's direct Claude Agent SDK path,
     * while Cursor has no AI SDK adapter at all and stays a native runtime.
     */
    harness: {
      /** Registry id (`main/managers/agent/harnessRegistry.ts`). */
      id: string;
      /**
       * Run Anthropic models through the direct Claude Agent SDK instead of
       * the harness. The documented rollback while the harness path settles —
       * the harness packages are experimental and exact-pinned.
       */
      legacyClaudeSdk: boolean;
      /**
       * Sandbox provider for harness runs. `local-worktree` is the ONLY
       * permitted value and `SettingsManager.normalize` re-asserts it: a
       * remote sandbox would ship the user's repository off the machine,
       * which CLAUDE.md §1 forbids. The field exists so that constraint is
       * explicit and enforced rather than merely implied by there being no
       * alternative wired up.
       */
      sandboxProvider: 'local-worktree';
      /** Forward adapter log lines into the Agent Console. */
      debug: boolean;
      /**
       * Fingerprint of the harness bootstrap commands the user approved.
       *
       * A bridge-backed harness installs its agent CLI before the first
       * session, which reaches the npm registry from this machine (CLAUDE.md
       * §1, third item). That is gated like repo-authored `limboo.json`
       * commands: the verbatim commands are shown and approved once, and the
       * ack is keyed to a hash of those exact commands — so an adapter upgrade
       * that changes what runs re-prompts, because what was approved is no
       * longer what would execute. Empty = not approved; runs are refused.
       *
       * Deliberately NOT a boolean "allow network": the user approves specific
       * commands, not a standing permission.
       */
      bootstrapAck: string;
    };
  };
  /**
   * Git integration preferences. Local-only — no network, no tokens. Commit
   * identity falls back to the global git config when left blank.
   */
  git: {
    /** Commit author name (blank = inherit global git config). */
    userName: string;
    /** Commit author email (blank = inherit global git config). */
    userEmail: string;
    /** Default commit message template / prefix. */
    commitMessageTemplate: string;
    /** Offer a suggested commit message derived from the conversation. */
    suggestCommitFromConversation: boolean;
    /** Automatically create a checkpoint before high-impact agent operations. */
    autoCheckpoint: boolean;
    /** Max checkpoints to keep per session (older ones are pruned). */
    maxCheckpoints: number;
    /** Confirm before switching branches when the working tree is dirty. */
    confirmBranchSwitchWithChanges: boolean;
    /** Which git operations require explicit confirmation in the UI. */
    commandApproval: 'destructive' | 'all' | 'none';
    /**
     * Push preferences. Limboo never stores remote credentials — push relies on
     * the user's existing git credential helper / SSH agent, so a missing
     * credential fails fast with a clear message rather than hanging.
     */
    push: {
      /** First push of a branch publishes it with `-u origin <branch>`. */
      autoSetUpstream: boolean;
      /** Require an explicit confirmation before a force push (--force-with-lease). */
      confirmForcePush: boolean;
    };
    /** Pull strategy. `ff-only` avoids silent merge commits; `rebase` replays. */
    pull: {
      strategy: 'ff-only' | 'rebase';
    };
    /**
     * Contributor profile photos in commit history and the GitHub sub-tab.
     *
     * This is a NETWORK switch, not a cosmetic one: it is the only thing in
     * Limboo besides the coding agent that makes an outbound request. When it
     * is off, nothing is fetched and every author renders as initials. See
     * `main/managers/gh/avatars.ts` for exactly what is and is not sent.
     */
    avatars: {
      enabled: boolean;
    };
    /**
     * Git worktree preferences — a session may own an isolated worktree (its own
     * directory + branch) so parallel sessions never contend for one working
     * tree. ALL worktree + hook settings live here in the Git category.
     */
    worktrees: {
      /** Offer "New session in worktree" and worktree-backed flows. */
      enabled: boolean;
      /** Absolute root for worktree checkouts ('' = {userData}/worktrees). */
      root: string;
      /** Prefix for auto-generated worktree branches (e.g. limboo/<slug>). */
      branchPrefix: string;
      /** Run the repo's setup hooks (limboo.json) after a worktree is created. */
      autoSetup: boolean;
      /** Require explicit confirmation before running setup/teardown hooks. */
      confirmHooks: boolean;
      /** Run teardown hooks + remove the worktree directory when archiving. */
      teardownOnArchive: boolean;
    };
    /**
     * Scripts & Services supervision — long-running dev processes (servers,
     * workers) owned by a session, auto-assigned a loopback port and optionally
     * exposed through the local *.localhost reverse proxy.
     */
    services: {
      /** Lowest / highest port auto-assigned to a supervised service. */
      portRangeStart: number;
      portRangeEnd: number;
      /** Expose services through the loopback-only *.localhost reverse proxy. */
      proxyEnabled: boolean;
      /** Loopback port the reverse proxy listens on. */
      proxyPort: number;
    };
  };
  /**
   * Local Memory System — a provider-independent platform service that preserves
   * project knowledge (decisions, conventions, preferences, solutions, notes) in
   * the on-device database and injects the most relevant entries into the agent
   * prompt before it reaches the harness. Fully local: no network, no embeddings
   * API. Retrieval is SQLite FTS5/BM25 fused with recency / confidence / usage.
   */
  memory: {
    /** Master switch for the memory subsystem (capture + retrieval + UI). */
    enabled: boolean;
    /** Inject ranked, relevant memories into the agent's system context. */
    injectIntoPrompt: boolean;
    /** Max memories injected into a single prompt (ranked, budget-capped). */
    maxInjected: number;
    /**
     * How new memories are created from activity (commits, conversations):
     * - `propose`: surface as pending proposals the user accepts/dismisses.
     * - `auto`:    silently store high-confidence candidates.
     * - `off`:     only manually-authored notes are stored.
     */
    autoCapture: 'propose' | 'auto' | 'off';
    /** In `propose` mode, candidates at/above this confidence auto-accept (0 disables). */
    autoAcceptConfidence: number;
    /** Decay + archive stale memories over time. */
    expiry: {
      enabled: boolean;
      /** Days of disuse after which an unpinned memory is flagged stale. */
      staleDays: number;
    };
  };
  /**
   * Search Engine — a core platform service that maintains a continuously-updated,
   * on-device index (files, content, symbols) and federates every other subsystem
   * (memory, git, sessions, commands, …) behind one query interface. Fully local:
   * no network, no embeddings API — retrieval is SQLite FTS5/BM25 fused with fuzzy
   * + trigram substring matching. These knobs live alongside Memory (both are the
   * app's retrieval layer). Settings are surfaced in the Memory settings category.
   */
  search: {
    /** Master switch for background indexing + the Search UI + context injection. */
    enabled: boolean;
    /** Index file contents (not just paths + symbols) for full-text search. */
    indexContents: boolean;
    /** Also index files matched by the workspace ignore rules (node_modules, …). */
    includeIgnored: boolean;
    /** Max file size (KiB) whose contents are indexed; larger files index path-only. */
    maxFileSizeKb: number;
    /** Supply ranked project context (files/symbols/docs) to the agent's prompt. */
    injectContext: boolean;
    /** Max context items injected into a single prompt (ranked, budget-capped). */
    maxInjected: number;
    /** Max results shown per source group in the Search UI. */
    maxResultsPerGroup: number;
    /**
     * Per-subsystem include/exclude for Global Search. Turning a noisy source off
     * removes its group from results without touching the index. Files/symbols/docs
     * come from the on-device index; the rest are federated from their managers.
     */
    sources: {
      files: boolean;
      symbols: boolean;
      docs: boolean;
      memory: boolean;
      commits: boolean;
      /** Branches + tags (git refs). */
      branches: boolean;
      sessions: boolean;
    };
    /** Real-time as-you-type debounce: instant (0ms) · fast (90ms) · balanced (200ms). */
    liveDelay: 'instant' | 'fast' | 'balanced';
    /** Recent-search ring length kept per scope (bounded by SEARCH_LIMITS.historyMax). */
    historyLimit: number;
    /** Fuzzy/typo-tolerant (substring) matching; off = strict prefix matching. */
    fuzzy: boolean;
    /** Title-bar search box opens the modal on click; off = only the ⌘P/Ctrl+P shortcut. */
    openOnClick: boolean;
  };
  /**
   * Resume Pipeline — repository revalidation when a session is activated.
   * Compares the current repo state against the session's last snapshot and,
   * when they diverge, surfaces a structured delta (banner + dialog) and
   * injects a one-shot `<repository-delta>` block into the next agent prompt.
   * Fully local: bounded, argv-only git — never blocks session switching.
   */
  resume: {
    /** Master switch for snapshots + revalidation + the delta UI. */
    enabled: boolean;
    /** Inject the pending repository delta into the next agent prompt. */
    injectDelta: boolean;
    /** Max commit subjects listed in a delta (counts stay exact). */
    maxCommitsInDelta: number;
    /** Days before an untouched session skips revalidation (0 = always run). */
    staleThresholdDays: number;
  };
  /**
   * Work Graph — the Directed Acyclic Work Graph. A provider-neutral platform
   * service owned by the app: both adapters' event streams are normalized into
   * one typed, queryable graph of the work itself, so a session can be
   * navigated by structure instead of by scrolling a transcript.
   */
  graph: {
    /** Master switch. When off, nothing is ingested — zero rows, zero cost. */
    enabled: boolean;
    /** Persist to SQLite. When off the graph is live but in-memory only. */
    persist: boolean;
    /**
     * Delta-coalescing window (ms). A burst of tool calls becomes one IPC push
     * instead of one per event. 0 flushes synchronously (dev/debug).
     */
    updateFrequency: number;

    /** Max nodes retained per session (ring-capped; oldest pruned). */
    retentionPerSession: number;
    /** Days before a node is swept (0 = keep forever). */
    retentionDays: number;
    /** Fold completed runs older than N days into one summary row (0 = off). */
    collapseRunsOlderThan: number;
    /** Drop nodes left orphaned by an interrupted run when the run ends. */
    pruneOnSessionEnd: boolean;

    /** `lanes` = one node per row (git-graph); `compact` merges sibling reads. */
    layoutAlgorithm: 'lanes' | 'compact';
    /** What drives node color. */
    nodeColoring: 'kind' | 'status' | 'provider';
    /** Label edges with their relationship kind. */
    showEdgeLabels: boolean;
    /** Draw semantic (non-spine) edges for the selected node's neighborhood. */
    showSemanticEdges: boolean;
    /** Draw heuristic edges (verified-by, sequential depends-on) — always dashed. */
    showDerivedEdges: boolean;
    /** Show file/diff previews in the node inspector. */
    artifactPreviews: boolean;
    /** Node-appear transitions. Forced off under `appearance.reducedMotion`. */
    animate: boolean;
    /** Replay/animation speed multiplier; scales the replay step interval. */
    animationSpeed: number;

    /** Group the outline/list view. */
    outlineGroupBy: 'none' | 'kind' | 'tool' | 'file';
    /** Collapse a subagent's children into their parent node. */
    groupSubagents: boolean;
    /** Auto-collapse branches whose every node has completed. */
    autoCollapseCompleted: boolean;
    /** Max traversal depth for queries and the semantic-edge neighborhood. */
    maxDepth: number;

    /** Hard cap on nodes held for one session in the renderer. */
    maxNodes: number;
    /** Max parallel lanes before overflow shares the last lane. */
    maxLanes: number;
    /** Node count above which row windowing kicks in. */
    virtualizeThreshold: number;

    /** Selecting a node navigates the conversation/panels, and vice versa. */
    timelineSync: boolean;
    /** Render git checkpoints as graph nodes alongside commits. */
    checkpointIntegration: boolean;
    /** Which event sources contribute nodes. */
    overlays: {
      git: boolean;
      terminal: boolean;
      mcp: boolean;
      memory: boolean;
      file: boolean;
      search: boolean;
      service: boolean;
    };

    /** Default format for the panel's export action. */
    exportFormat: GraphExportTarget;
    /**
     * Scope of an export action. `session` exports the whole graph; `selection`
     * exports the selected node's bounded subgraph (the existing depth-capped
     * traversal), so a large session can be shared one investigation at a time.
     */
    exportScope: GraphExportScope;
    /**
     * Join each run's Runtime Telemetry rollup (duration, tokens, estimated
     * cost, peak context) into the export. Applies to the tabular/structured
     * formats only — a Mermaid or DOT diagram has no column to put a number in.
     */
    exportTelemetry: boolean;
  };
  /**
   * Runtime Telemetry — the Runtime Inspector's behaviour. Provider-neutral:
   * every knob describes how Limboo DISPLAYS what a provider already reported,
   * never what it fetches. Nothing here adds a network call, and no provider is
   * ever polled — the numbers ride the same event stream that drives the
   * conversation.
   */
  runtime: {
    /** Master switch. Off = no ingestion, no rows, no pushes, no indicator. */
    enabled: boolean;
    /**
     * Persist usage history to SQLite. Off = live-only. This is the enterprise
     * policy switch: it stops writes AND makes history reads return empty, so
     * disabling it is genuinely off rather than merely hidden.
     */
    persist: boolean;
    /** Snapshot-coalescing window (ms). A burst becomes one IPC push. */
    updateFrequency: number;
    /**
     * Clock-driven refresh while the inspector is open (0 = off). Refreshes
     * reset countdowns and elapsed tool timers. NO provider is ever polled.
     */
    idleRefreshMs: number;
    /** Days of usage history kept (0 = keep forever). */
    retentionDays: number;
    /** Run rollups kept per session. */
    retainRuns: number;

    /* --- the indicator --- */
    /** Show the ring at all. Off keeps ingestion but hides the surface. */
    indicator: boolean;
    /** Which surface the ring mounts on. */
    anchor: 'composer' | 'header';
    /** Keep the inspector open without hovering. */
    pinned: boolean;
    ringSize: number;
    ringStroke: number;
    /** Render the rounded percentage inside the ring. */
    ringLabel: boolean;
    /** What the ring's arc measures. */
    ringMetric: 'context-used' | 'context-remaining';
    animation: 'none' | 'subtle' | 'full';

    /* --- the inspector --- */
    /** Compact narrows the card and folds the supporting disclosures away. */
    layout: 'compact' | 'expanded';
    /** Show values Limboo estimated from character counts (always labelled). */
    showEstimates: boolean;
    tokenDisplay: 'absolute' | 'percent';
    /** Distinguish context segments by border and weight, not hue alone. */
    highContrast: boolean;

    /* --- thresholds, as percent of context REMAINING --- */
    warnRemainingPct: number;
    criticalRemainingPct: number;
    /** Desktop notification when remaining crosses this (0 = off). */
    notifyRemainingPct: number;
  };
  /**
   * Attachment Manager — user-supplied files attached in the composer become
   * session-owned staged copies under `userData/attachments/<sessionId>/`. The
   * agent reads them on demand through its tool loop (never inlined wholesale);
   * images can additionally ride the prompt as vision blocks. Attaching never
   * executes anything and archives are never extracted.
   */
  attachments: {
    /** Master switch for attaching files (composer button, drop, paste). */
    enabled: boolean;
    /** Per-file size cap (MB). */
    maxFileSizeMB: number;
    /** Files attachable to a single message. */
    maxFilesPerMessage: number;
    /** Total attachments a session may accumulate. */
    maxTotalPerSession: number;
    /** Per-category attach permissions (archives are off by default). */
    categories: {
      images: boolean;
      documents: boolean;
      code: boolean;
      archives: boolean;
    };
    images: {
      /** Send attached images to the model as vision content blocks. */
      attachAsVision: boolean;
      /** Downscale images above this size (MB) before the vision send. */
      downscaleThresholdMB: number;
    };
    /** Index text attachments into the Search Engine (hook point; off = never). */
    autoIndex: boolean;
    /** Executables/scripts: refuse outright, or stage flagged with a warning. */
    elevatedRiskPolicy: 'block' | 'warn';
  };
  /**
   * In-app auto-update (electron-updater + GitHub releases). Only ever active in
   * a packaged build; a no-op in dev. Limboo downloads updates over HTTPS from
   * its own GitHub Releases and verifies the signed installer before applying.
   */
  updates: {
    /** Check GitHub for a newer release shortly after launch (and hourly). */
    autoCheck: boolean;
    /** Download an available update automatically (else wait for the user). */
    autoDownload: boolean;
    /**
     * The last app version whose release notes the user has seen, `''` before
     * they have seen any. Written when the What's New tab is CLOSED, not when
     * it opens — so notes are never marked read on a launch nobody looked at.
     * Any mismatch with the running version opens the tab exactly once.
     */
    lastSeenVersion: string;
    /**
     * Which releases this install is offered.
     *
     * `stable` sees only full releases. `beta` additionally sees prereleases —
     * tags carrying a suffix (`v1.4.0-beta.1`), which every publisher already
     * marks as a GitHub prerelease.
     *
     * A beta offer is NEVER auto-downloaded, whatever {@link autoDownload} says.
     * An unreleased build is a decision the user should make per version, not one
     * a background preference makes for them — so on this channel the update
     * strip offers a link and waits. Once a beta IS installed it updates like any
     * other build, because at that point the user has already chosen the channel.
     */
    channel: 'stable' | 'beta';
  };
  /**
   * Voice subsystem — speech is another input/output modality for the SAME
   * agent session (never a separate conversation). Speech processing is fully
   * local (sherpa-onnx: Kokoro TTS, Parakeet STT, Silero VAD); models are
   * downloaded on demand into userData. Workspace-independent: speech
   * preferences belong to the user, not a repository.
   */
  voice: {
    /** Master switch for the voice subsystem (capture + playback + UI). */
    enabled: boolean;
    input: {
      /** Microphone device id ('' = system default). */
      deviceId: string;
      /**
       * How recording starts/stops:
       * - `push-to-talk`: record only while the hotkey/button is held.
       * - `toggle`:       click to start, click to stop (manual endpoint).
       * - `auto`:         click to start; VAD silence detection auto-stops.
       */
      activation: 'push-to-talk' | 'toggle' | 'auto';
      /** VAD speech-probability threshold (higher = less sensitive). */
      sensitivity: number;
      /** Trailing silence (ms) that ends an utterance in `auto` mode. */
      silenceMs: number;
      /** Spoken language hint (Parakeet v2 is English-only). */
      language: string;
      /** Keep the model's automatic punctuation in transcripts. */
      autoPunctuation: boolean;
    };
    output: {
      /** Speak agent responses at all. */
      enabled: boolean;
      /** Speaker/output device id ('' = system default). */
      deviceId: string;
      /** Kokoro speaker id (0–10). */
      speakerId: number;
      /** Speech rate multiplier. */
      speed: number;
      /** Playback volume (0–1, renderer gain). */
      volume: number;
      /** Begin speaking sentences while the response is still streaming. */
      streamWhileGenerating: boolean;
      /** Speak only replies to spoken prompts, or every agent reply. */
      speakWhen: 'voice-initiated' | 'always';
    };
    /** Which streamed content is eligible for speech. */
    playbackEvents: {
      finalAnswers: boolean;
      whileToolsRun: boolean;
      planningUpdates: boolean;
      taskCompletion: boolean;
      notifications: boolean;
    };
    /** What a new voice input does to in-flight speech playback. */
    interruption: 'stop' | 'pause' | 'ignore';
    shortcuts: {
      /** Toggle voice capture (combo, `Mod` = Cmd/Ctrl). */
      toggle: string;
      /** Push-to-talk hold combo. */
      pushToTalk: string;
    };
    models: {
      /** Download missing speech models automatically (opt-in; default off). */
      autoDownload: boolean;
      /** Re-download a model when the app ships a newer pinned revision. */
      autoUpdate: boolean;
      /** Never touch the network for voice (also blocks manual downloads). */
      offlineOnly: boolean;
    };
  };
  /**
   * MCP (Model Context Protocol) platform — Limboo owns a provider-independent
   * MCP registry so Claude Code and Cursor consume the SAME servers, secrets,
   * and permissions instead of each maintaining its own config. Individual
   * server definitions live in the on-device database (not this file); these are
   * the global platform preferences. No secrets here — server credentials are
   * safeStorage-encrypted in the main-process secret store, never sent to the
   * renderer and never written to a config file in plaintext.
   */
  mcp: {
    /** Master switch for the MCP subsystem (registry + probes + injection + UI). */
    enabled: boolean;
    /** Health-probe / heartbeat cadence (ms) for enabled servers. 0 disables. */
    heartbeatInterval: number;
    /** Deadline for a single connect / tools-list probe (ms). */
    probeTimeout: number;
    /**
     * Default trust for a newly added server:
     * - `ask`:     every tool call prompts through the permission gate.
     * - `trusted`: the server's tools are auto-approved (still path-guarded).
     */
    defaultTrust: 'ask' | 'trusted';
    /**
     * Default Plan & Ask access for a newly added server — the per-server
     * `planAccess` starting point, so someone running a fleet of read-only
     * servers sets the posture once instead of per server.
     *
     * Applies only when the incoming definition omits `planAccess`; an imported
     * or marketplace definition still cannot widen its own reach.
     */
    defaultPlanAccess: McpPlanAccess;
    /**
     * Allow probing/using remote MCP servers that resolve to private, loopback,
     * or link-local addresses. Off by default (SSRF hardening); a per-server
     * override covers legitimate local HTTP servers. The cloud-metadata IP
     * (169.254.169.254) is always blocked regardless of this switch.
     */
    allowPrivateNetwork: boolean;
    /** Discover + import existing provider mcp.json files into the registry (read-only). */
    autoImport: {
      cursor: boolean;
      claude: boolean;
    };
    /** Inject enabled servers into Claude runs (options.mcpServers). */
    injectIntoClaude: boolean;
    /** Inject enabled servers into Cursor runs (generated .cursor/mcp.json). */
    injectIntoCursor: boolean;
    /** How chatty MCP diagnostics are (probe failures, spawn errors). */
    logVerbosity: 'quiet' | 'normal' | 'verbose';
  };
}

/** A dotted-path key into {@link AppSettings} (kept loose for ergonomics). */
export type SettingsKey = string;

/* ------------------------------------------------------------------ */
/* MCP (Model Context Protocol) platform                               */
/* ------------------------------------------------------------------ */

/** Transport an MCP server speaks. `http` = Streamable HTTP (the spec name). */
export type McpTransport = 'stdio' | 'http' | 'sse';

/** How/whether a configured server is probed on activation. */
export type McpStartup = 'eager' | 'on-demand';

/** Whether the server's tools auto-approve or prompt through the permission gate. */
export type McpTrust = 'ask' | 'trusted';

/**
 * How far a server's tools may reach inside the read-only session modes
 * (`plan` / `ask`), which otherwise deny every non-read tool outright.
 *
 *   block     — never (the tool is denied, as before this setting existed)
 *   annotated — only tools whose server-declared `readOnlyHint` is true
 *   all       — the user asserts the whole server is read-only
 *
 * Deliberately ORTHOGONAL to `McpTrust`: trust answers "auto-approve?", this
 * answers "do I believe this server's read-only claims?". Coupling them would
 * force a user who only wants read-only planning access to also grant blanket
 * auto-approval in every mode.
 */
export type McpPlanAccess = 'block' | 'annotated' | 'all';

/** Restart policy for a crashed stdio server. */
export type McpRestartPolicy = 'never' | 'on-failure';

/** Where a server definition originated (drives the source badge in the UI). */
export type McpSource = 'user' | 'imported-cursor' | 'imported-claude' | 'marketplace';

/** Auto-assigned logical grouping for the MCP workspace list. */
export type McpCategory =
  | 'version-control'
  | 'search'
  | 'memory'
  | 'documentation'
  | 'cloud'
  | 'issue-tracker'
  | 'database'
  | 'browser'
  | 'container'
  | 'monitoring'
  | 'ai'
  | 'deployment'
  | 'communication'
  | 'filesystem'
  | 'productivity'
  | 'custom';

/** Live connection status of a server (mirrors the SDK's mcp_servers status). */
export type McpServerStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'needs-auth'
  | 'error';

/** One discovered tool exposed by a server. */
export interface McpToolInfo {
  name: string;
  description?: string;
  /**
   * The server's own `annotations.readOnlyHint` (MCP spec), narrowed by
   * `destructiveHint`. This is a HINT the SERVER asserts about itself, never
   * enforcement — a server can claim read-only and write anyway. Absent means
   * "not claimed" (the spec's default is `false`). Consulted only when the user
   * has set that server's `planAccess` to `'annotated'`; the permission gate
   * still runs on top.
   */
  readOnly?: boolean;
}

/**
 * A named env var / header value. `secret: true` means the real value lives in
 * the main-process secret store (safeStorage) under `mcp-<serverId>-<key>` and
 * only its presence crosses to the renderer — never the value itself.
 */
export interface McpFieldValue {
  /** Plain (non-secret) value, or '' when this is a secret reference. */
  value: string;
  /** True when the value is held encrypted in the secret store. */
  secret: boolean;
}

/**
 * Provider-neutral MCP server definition (durable, no plaintext secrets).
 * Persisted in the `mcp_servers` DB table; secret env/header values are held
 * separately in the secret store and referenced here with `secret: true`.
 */
export interface McpServerConfig {
  id: string;
  /** null/undefined = global (all workspaces); else the owning workspace id. */
  workspaceId?: string | null;
  /** Stable machine name used in the mcp__<name>__<tool> namespace. */
  name: string;
  /** Human label shown in the UI. */
  displayName: string;
  transport: McpTransport;
  /** stdio only — executable, args, env. */
  command?: string;
  args: string[];
  env: Record<string, McpFieldValue>;
  cwd?: string;
  /** http/sse only — endpoint + headers. */
  url?: string;
  headers: Record<string, McpFieldValue>;
  enabled: boolean;
  startup: McpStartup;
  trust: McpTrust;
  /** How far this server's tools reach inside the read-only plan/ask modes. */
  planAccess: McpPlanAccess;
  /** Per-tool-call wall-clock cap (ms). */
  timeoutMs: number;
  restartPolicy: McpRestartPolicy;
  /** Which providers see this server. */
  providers: { claude: boolean; cursor: boolean };
  /** Permit private/loopback/link-local hosts for this remote server (SSRF opt-in). */
  allowPrivateNetwork: boolean;
  category: McpCategory;
  /** Lucide icon id or a marketplace icon key. */
  icon: string;
  source: McpSource;
  createdAt: number;
  updatedAt: number;
}

/** Live runtime state for a server (never persisted; broadcast to the renderer). */
export interface McpServerRuntime {
  status: McpServerStatus;
  /** Discovered tools from the last successful probe. */
  tools: McpToolInfo[];
  /** Last probe round-trip (ms), when known. */
  latencyMs?: number;
  /** Last successful heartbeat / probe timestamp. */
  lastProbeAt?: number;
  /** Human-readable last error (secret-free). */
  error?: string;
}

/** Config + live runtime — the shape the renderer consumes. */
export interface McpServerInfo extends McpServerConfig {
  runtime: McpServerRuntime;
}

/**
 * A server spec supplied by the renderer to add/update. Secret env/header values
 * arrive under `secretEnv`/`secretHeaders` (name -> plaintext) and are moved into
 * the secret store by the main process — never persisted in the row, never echoed.
 */
export interface McpServerInput {
  workspaceId?: string | null;
  name: string;
  displayName?: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  startup?: McpStartup;
  trust?: McpTrust;
  planAccess?: McpPlanAccess;
  timeoutMs?: number;
  restartPolicy?: McpRestartPolicy;
  providers?: { claude: boolean; cursor: boolean };
  allowPrivateNetwork?: boolean;
  category?: McpCategory;
  icon?: string;
  /** Secret env values (name -> plaintext) — stored encrypted, never returned. */
  secretEnv?: Record<string, string>;
  /** Secret header values (name -> plaintext) — stored encrypted, never returned. */
  secretHeaders?: Record<string, string>;
  /** Preserve existing secret keys not resent (edit flow). */
  keepSecrets?: string[];
}

/** Result of a "test connection" probe surfaced to the UI. */
export interface McpProbeResult {
  ok: boolean;
  status: McpServerStatus;
  tools: McpToolInfo[];
  latencyMs?: number;
  error?: string;
}

/** One line from a server's diagnostic log ring (secret-free). */
export interface McpLogLine {
  at: number;
  level: 'info' | 'warn' | 'error';
  text: string;
}

/* ------------------------------------------------------------------ */
/* Auto-update (electron-updater)                                      */
/* ------------------------------------------------------------------ */

/** Lifecycle stage of the in-app updater, mirrored into the renderer. */
export type UpdateStage =
  | 'idle'
  | 'disabled'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  // The installer is running and we have NOT quit yet. Only reachable on the
  // Linux package-manager path, where the privileged install is an async child
  // we own (and can therefore report on) rather than a handoff-then-die.
  | 'installing'
  | 'error';

/** The full updater status pushed to the renderer on every transition. */
export interface UpdateStatus {
  stage: UpdateStage;
  /** The currently running app version. */
  currentVersion: string;
  /** The newer version offered (available / downloading / downloaded). */
  version?: string;
  /** Release notes for the offered version (plain text, truncated). */
  notes?: string;
  /** Download progress, 0–100 (downloading stage only). */
  percent?: number;
  /** True while continuing a previously-interrupted download (resume, not start). */
  resuming?: boolean;
  /** Last error message (error stage only). */
  error?: string;
  /**
   * A shell command the user can run themselves to finish the update, offered
   * whenever the app could not apply it (today: the Linux package-manager path).
   * Composed ENTIRELY in the main process from the staged path electron-updater
   * reports — never renderer-supplied, never echoed back across IPC into a spawn.
   * It is display/clipboard text only.
   */
  manualCommand?: string;
  /** Epoch ms of the last check. */
  checkedAt?: number;
  /**
   * Why self-update is unavailable (`disabled` stage only) — a dev build, a
   * Microsoft Store install, an unsigned macOS app, a Linux packaging format
   * the app cannot replace, and so on. Written for the user, shown verbatim.
   */
  disabledReason?: string;
  /**
   * The channel this install is subscribed to, echoed so the renderer never has
   * to read settings to know how to phrase an offer.
   */
  channel?: 'stable' | 'beta';
  /**
   * True when the OFFERED version is a prerelease (its tag carries a suffix).
   *
   * Drives two things the UI must not infer: the warning that the build is not
   * yet released and may contain bugs, and the fact that it is offered as a
   * link to click rather than fetched in the background.
   */
  prerelease?: boolean;
  /**
   * True when the RUNNING build is itself a prerelease. Independent of
   * {@link prerelease}, which describes the offer — a beta install can be
   * offered a stable release, and both facts are displayed differently.
   */
  runningPrerelease?: boolean;
}

/**
 * Outcome of a `Restart & install` request. The install path has several ways to
 * refuse (nothing staged, updates disabled, the installer failed to launch), and
 * every one of them used to be silent — the renderer surfaces this instead.
 */
export interface UpdateInstallResult {
  ok: boolean;
  error?: string;
  /** See {@link UpdateStatus.manualCommand} — the "do it yourself" escape hatch. */
  manualCommand?: string;
}

/**
 * Locally observable facts about the running build, read from the process by
 * main.
 *
 * These exist because the release manifest cannot answer them. A manifest
 * describes the artifact that was PUBLISHED; this describes the process that is
 * RUNNING, and the two can legitimately differ — an unpackaged development
 * build, a self-built binary, a macOS copy whose signature was stripped by the
 * way it was moved. The release document renders them in a separate group for
 * exactly that reason: one is a claim about a download, the other is a
 * measurement of what is executing.
 */
export interface BuildInfo {
  /** `app.getVersion()` — the tag-stamped version in packaged builds. */
  appVersion: string;
  /** False in development, and in any build run from source. */
  packaged: boolean;
  platform: NodeJS.Platform;
  arch: string;
  electron: string;
  chrome: string;
  node: string;
  /**
   * macOS code-signing authority when it could be read, else null. Null is not
   * "unsigned" — it is also every non-macOS platform and every case where
   * `codesign` could not be run. The UI must not render it as a failure.
   */
  macSignature: string | null;
}

/** Outcome of writing a release document to a user-chosen path. */
export interface ReleaseExportResult {
  saved: boolean;
  path?: string;
}

/* ------------------------------------------------------------------ */
/* App info                                                            */
/* ------------------------------------------------------------------ */

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  platform: NodeJS.Platform;
}

/* ------------------------------------------------------------------ */
/* Domain models (UI-facing)                                           */
/* ------------------------------------------------------------------ */

export type SessionStatus = 'active' | 'idle' | 'done';

/**
 * Composer execution mode. `plan` runs the agent read-only to propose an
 * implementation strategy for review; `implement` lets it modify the repository.
 * Internal to the main process (plan lifecycle, run bookkeeping); the renderer +
 * IPC speak {@link SessionPermissionMode} instead.
 */
export type AgentMode = 'plan' | 'implement';

/**
 * The harness-aligned permission mode the composer exposes as a single selector,
 * matching Claude Code's `Shift+Tab` cycle vocabulary:
 * - `plan`        → read-only analysis; the agent proposes a plan (SDK `plan`).
 * - `ask`         → read-only exploration/Q&A; no plan lifecycle, no edits
 *                   (Cursor `--mode ask`; Claude enforced via `decideToolUse`).
 * - `default`     → asks before edits/commands (SDK `default`).
 * - `acceptEdits` → auto-approves file edits; commands still prompt (SDK `acceptEdits`).
 * `bypassPermissions` is intentionally NOT exposed (this is a local, safety-first
 * app). The coarser auto/approve-all knobs live in Settings › Agent as advanced
 * enforcement layered on top by `canUseTool`.
 */
export type SessionPermissionMode = 'plan' | 'ask' | 'default' | 'acceptEdits';

/**
 * A development workspace — the primary unit of software engineering in Limboo.
 * Owned by the main-process SessionManager and persisted to SQLite. Every
 * session belongs to exactly one workspace (`workspaceId`) and bundles its
 * conversation, activity, and metadata so work can be paused and resumed.
 */
export interface Session {
  id: string;
  /** The workspace that owns this session. */
  workspaceId: string;
  title: string;
  branch: string;
  status: SessionStatus;
  /** Epoch ms the session was created. */
  createdAt: number;
  /** Epoch ms of last activity; the UI formats this relatively. */
  updatedAt: number;
  adds: number;
  dels: number;
  unread: number;
  pinned: boolean;
  /** Archived sessions are hidden from the primary list but fully preserved. */
  archived: boolean;
  /** Epoch ms when soft-deleted (moved to trash), or null when live. */
  deletedAt: number | null;
  /** Last composer permission mode used for this session (drives the selector). */
  mode?: SessionPermissionMode;
  /**
   * Absolute path of the session's dedicated git worktree, or null when the
   * session works directly in the shared workspace checkout. A worktree-backed
   * session is an isolated engineering environment: its own directory + branch,
   * so parallel sessions never contend for one working tree.
   */
  worktreePath: string | null;
  /** Branch checked out in the session's worktree (null without a worktree). */
  worktreeBranch: string | null;
  /** Lifecycle of the session's worktree directory. */
  worktreeStatus: WorktreeStatus;
  /** The ref the worktree branch was created from (recreate/duplicate base). */
  baseRef: string | null;
  /** User-defined sidebar folder (grouping); null = ungrouped. */
  folder: string | null;
  /** Orthogonal user-defined tags (bounded + sanitized in the main process). */
  tags: string[];
}

/** Lifecycle of a session's git worktree directory. */
export type WorktreeStatus = 'none' | 'creating' | 'ready' | 'missing' | 'removing';

/** One entry parsed from `git worktree list --porcelain`, joined to sessions. */
export interface WorktreeInfo {
  path: string;
  /** Checked-out branch ref (short name), absent when detached/bare. */
  branch?: string;
  head?: string;
  detached: boolean;
  locked: boolean;
  prunable: boolean;
  /** The Limboo session that owns this worktree, when one does. */
  sessionId?: string;
  sessionTitle?: string;
}

/**
 * Everything a session owns, summarized before permanent removal so the user
 * can preserve selected resources (branch / worktree) while removing the rest.
 */
export interface SessionDependencies {
  worktree: { path: string; exists: boolean; dirty: boolean } | null;
  branch: { name: string; exists: boolean } | null;
  terminals: number;
  checkpoints: number;
  memoryLinks: number;
  hasPlan: boolean;
}

/** Options accompanying a session delete (what to do with owned resources). */
export interface SessionDeleteOptions {
  /** Remove the worktree directory (forced when dirty only if user confirmed). */
  removeWorktree?: boolean;
  /** Also delete the worktree branch (default: keep it). */
  deleteBranch?: boolean;
  /** Force worktree removal even when the tree is dirty. */
  force?: boolean;
}

/** Renderer-supplied patch for a session update (rename / pin / archive / organize). */
export interface SessionUpdate {
  title?: string;
  pinned?: boolean;
  archived?: boolean;
  /** Sidebar folder; null clears the grouping. */
  folder?: string | null;
  tags?: string[];
}

/** Sort order for the sessions sidebar. */
export type SessionSort = 'recent' | 'created' | 'title';

export type FileChangeStatus = 'added' | 'modified' | 'deleted';

export interface FileChange {
  path: string;
  status: FileChangeStatus;
  adds: number;
  dels: number;
}

/** Execution state of a single plan task (mirrors TodoWrite's status). */
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface TaskItem {
  id: string;
  label: string;
  done: boolean;
  /** Richer status from TodoWrite; `done` stays in sync for back-compat. */
  status?: TaskStatus;
}

export interface ActivityItem {
  id: string;
  label: string;
  /** Epoch ms; formatted relatively in the UI. */
  at: number;
}

/* ------------------------------------------------------------------ */
/* Git (deep integration)                                              */
/* ------------------------------------------------------------------ */

/** Per-file working-tree status, normalized from git porcelain XY codes. */
export type GitFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'conflicted';

/** A single changed path in the working tree (index and/or worktree side). */
export interface GitFileChange {
  path: string;
  /** Previous path for renames/copies. */
  oldPath?: string;
  /** Overall display status. */
  status: GitFileStatus;
  /** Has staged (index) changes. */
  staged: boolean;
  /** Has unstaged (worktree) changes. */
  unstaged: boolean;
  /** Line additions / deletions (working tree + index), 0 for untracked/binary. */
  adds: number;
  dels: number;
}

/** Live repository status — the dashboard the Git workspace renders. */
/* ------------------------------------------------------------------ */
/* GitHub CLI (`gh`) — optional, detected, never a dependency           */
/* ------------------------------------------------------------------ */

/**
 * Classification of the local GitHub CLI. `error` covers a gh that exists but
 * could not be interrogated (timeout, unreadable config) — deliberately
 * distinct from `not-authenticated`, which is a definite answer.
 */
export type GhStatus = 'not-installed' | 'not-authenticated' | 'authenticated' | 'error';

/** One host `gh` knows about. Never carries a token — see `gh/exec.ts`. */
export interface GhHost {
  host: string;
  login: string;
  active: boolean;
}

/**
 * The local GitHub CLI's state. Limboo stores NO GitHub credentials: this is a
 * read-only view of what the CLI already has, and every field here is safe to
 * show. There is deliberately no token field of any kind.
 */
export interface GhState {
  status: GhStatus;
  /** `gh --version` output, when it answered. */
  version?: string;
  /** The active account, when authenticated. */
  account?: { login: string; host: string };
  hosts?: GhHost[];
  /** The workspace's GitHub remote, when it has one. */
  repo?: { nameWithOwner: string; host: string };
  /**
   * True when auth had to be read from `gh auth status`'s human-readable
   * output because this CLI predates the `--json` flag. Degraded, not failed.
   */
  legacyAuthParse?: boolean;
  /** Redacted, length-capped reason when `status` is `error`. */
  error?: string;
  checkedAt: number;
}

/** A pull request as listed by `gh pr list --json …`. */
export interface GhPullRequest {
  number: number;
  title: string;
  /** `OPEN` | `CLOSED` | `MERGED` as gh reports it. */
  state: string;
  author?: string;
  headRefName?: string;
  baseRefName?: string;
  url: string;
  isDraft: boolean;
  updatedAt: string;
  /** `APPROVED` | `CHANGES_REQUESTED` | `REVIEW_REQUIRED`, when gh reports it. */
  reviewDecision?: string;
}

/** An issue as listed by `gh issue list --json …`. */
export interface GhIssue {
  number: number;
  title: string;
  state: string;
  author?: string;
  url: string;
  labels: string[];
  updatedAt: string;
}

/**
 * Whether a usable `git` binary exists on this machine.
 *
 * Separate from {@link GitStatus} on purpose: a failed `git` spawn and an
 * uninitialised folder both produce `isRepo: false`, so without this the UI
 * cannot tell "install git" from "run git init" — and offers the second when
 * only the first would help.
 */
export interface GitEnvironment {
  available: boolean;
  /** Parsed version string (e.g. `2.45.2`), when git answered. */
  version?: string;
  /** Reported by main so the renderer can pick install guidance without guessing. */
  platform: NodeJS.Platform;
  /** Redacted, length-capped failure reason when `available` is false. */
  error?: string;
  /** Epoch ms of the probe that produced this result. */
  checkedAt: number;
}

export interface GitStatus {
  isRepo: boolean;
  branch?: string;
  /** Configured upstream ref (e.g. origin/main), if any. */
  upstream?: string;
  ahead: number;
  behind: number;
  hasRemote: boolean;
  detached: boolean;
  files: GitFileChange[];
  clean: boolean;
}

export type GitDiffLineKind = 'context' | 'add' | 'del' | 'hunk' | 'meta';

export interface GitDiffLine {
  kind: GitDiffLineKind;
  text: string;
  /** 1-based line numbers in the old / new file (absent for hunk/meta rows). */
  oldLine?: number;
  newLine?: number;
}

export interface GitDiffHunk {
  header: string;
  lines: GitDiffLine[];
}

/** A parsed unified diff for one file. */
export interface GitFileDiff {
  path: string;
  oldPath?: string;
  binary: boolean;
  /** True when the file is staged-side (the diff was computed with --cached). */
  staged: boolean;
  hunks: GitDiffHunk[];
  /** Detected language hint for syntax highlighting (file extension based). */
  language?: string;
  /** Set when the real diff exceeded the size cap and was elided. */
  truncated?: boolean;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  body?: string;
  author: string;
  email: string;
  /** Author date, epoch ms. */
  at: number;
  /** Decorations (branch/tag refs) pointing at this commit. */
  refs: string[];
}

export interface GitCommitDetail {
  commit: GitCommit;
  files: GitFileChange[];
}

export interface GitBranch {
  name: string;
  current: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
}

export interface GitTag {
  name: string;
  hash: string;
  subject?: string;
}

export interface GitBlameLine {
  line: number;
  hash: string;
  shortHash: string;
  author: string;
  at: number;
  summary: string;
}

/** A lightweight, session-scoped recovery point stored as a dedicated git ref. */
export interface GitCheckpoint {
  id: string;
  sessionId: string;
  workspaceId: string;
  ref: string;
  commit: string;
  label: string;
  auto: boolean;
  /**
   * The user turn this checkpoint guards — set on the automatic checkpoint the
   * agent takes before its first repository mutation of a run. It is what makes
   * "revert to this message" resolvable without asking the user to match a
   * timestamp against a checkpoint list.
   */
  messageId?: string;
  files: string[];
  createdAt: number;
}

/**
 * What a checkpoint restore actually did.
 *
 * Restoring used to return a bare boolean, which could not distinguish "reverted
 * eleven files" from "the ref was already the working tree" — and could not
 * report the files it deleted, now that a restore is a true tree reset rather
 * than a content-only revert.
 */
export interface CheckpointRestoreResult {
  ok: boolean;
  /** Files whose contents were rolled back to the checkpoint. */
  filesReverted: number;
  /** Files created after the checkpoint and therefore removed. */
  filesRemoved: number;
  /** HEAD after the restore (the restore never moves HEAD; this is for display). */
  head: string | null;
  branch: string | null;
  /** True when HEAD moved between the checkpoint and now (commit / rebase / pull). */
  diverged: boolean;
  /** Set when the restore could not run; the workspace is untouched. */
  error?: string;
}

/**
 * What reverting the conversation to a message WOULD do — rendered verbatim in
 * the confirmation before anything is touched. Every count is measured, never
 * estimated; `checkpoint` is null when no recoverable anchor exists, and the
 * revert is refused rather than approximated.
 */
export interface ConversationRevertPreview {
  sessionId: string;
  messageId: string;
  checkpoint: GitCheckpoint | null;
  /** Messages that would be dropped from the transcript (this one survives). */
  messagesDropped: number;
  /** Activity rows that would be dropped alongside them. */
  activityDropped: number;
  filesReverted: number;
  filesRemoved: number;
  /** True when the session's provider resume token would be invalidated. */
  resetsProviderSession: boolean;
  /** Why the revert is unavailable, when it is. */
  blocked?: string;
}

/** The outcome of an executed conversation revert. */
export interface ConversationRevertResult {
  ok: boolean;
  restore?: CheckpointRestoreResult;
  messagesDropped: number;
  activityDropped: number;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Resume Pipeline                                                     */
/* ------------------------------------------------------------------ */

/**
 * Revalidation phase of a session's resume pipeline. `checking` while the
 * bounded git comparison runs, `clean` when the repo matches the snapshot,
 * `delta` when it diverged (banner + pending prompt injection), `idle` when
 * revalidation hasn't run / failed (failures degrade to "no delta").
 */
export type ResumePhase = 'idle' | 'checking' | 'clean' | 'delta';

/** One commit in a repository delta (subject capped, newest first). */
export interface RepoDeltaCommit {
  hash: string;
  subject: string;
  author: string;
  at: number;
}

/** Coarse category a changed path is bucketed into for the delta summary. */
export type RepoDeltaFileCategory =
  | 'manifest'
  | 'config'
  | 'migration'
  | 'source'
  | 'doc'
  | 'other';

/** One changed file in a repository delta ('dirty' = uncommitted). */
export interface RepoDeltaFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'dirty';
  category: RepoDeltaFileCategory;
  /** Pre-rename path for 'renamed' entries (the path at the snapshot HEAD). */
  oldPath?: string;
}

/**
 * Structured repository delta between a session's last snapshot and the repo's
 * current state — computed entirely in the main process from bounded, argv-only
 * git. Persisted per session so the one-shot prompt injection survives an app
 * restart between detection and the next prompt.
 */
export interface RepoDelta {
  sessionId: string;
  /** When the snapshot this delta was computed against was taken. */
  snapshotAt: number;
  branchChanged: boolean;
  fromBranch: string | null;
  toBranch: string | null;
  headMoved: boolean;
  fromHead: string | null;
  toHead: string | null;
  /** Exact rev-list counts (the commit list below is capped). */
  commitsAhead: number;
  commitsBehind: number;
  commits: RepoDeltaCommit[];
  /** Snapshot HEAD unreachable / not an ancestor (rebase, amend, gc). */
  historyRewritten: boolean;
  /** The effective execution root changed (worktree recreated/detached). */
  rootChanged: boolean;
  /** Committed-range + dirty files merged (capped; true total below). */
  files: RepoDeltaFile[];
  filesTotal: number;
  /** Dependency manifests / migrations that changed (flagged specially). */
  manifestChanges: string[];
  /** Symbol-level adds/removes/signature-changes per changed file (Phase B). */
  symbols?: { path: string; added: string[]; removed: string[]; changed?: string[] }[];
  /** Importer counts for changed files (Phase B reference layer). */
  refImpacts?: { path: string; importers: number }[];
  /** Memories downgraded because their referents vanished (Phase C). */
  downgradedMemories?: { id: string; title: string }[];
}

/** Live revalidation state pushed to the renderer per session. */
export interface ResumeState {
  sessionId: string;
  phase: ResumePhase;
  /** One-line human summary ("12 commits, 34 files changed"). */
  summary?: string;
  /** When the pending delta was detected (phase 'delta' only). */
  deltaAt?: number;
}

/** Result of a guarded branch checkout — surfaces dirty-tree pre-flight info. */
export interface GitCheckoutResult {
  ok: boolean;
  /** Set when the checkout was refused because the working tree is dirty. */
  blockedByDirty?: boolean;
  changedFiles?: number;
  error?: string;
}

/**
 * Result of `git push`. Known git stderr signatures are decoded into flags so
 * the UI can guide the user (publish a branch, pull first, configure creds)
 * instead of surfacing a raw error. Limboo stores no credentials.
 */
export interface GitPushResult {
  ok: boolean;
  /** The branch was published with `-u origin <branch>` (first push). */
  setUpstream?: boolean;
  /** Push rejected because the remote has commits we don't (non-fast-forward). */
  rejected?: boolean;
  /** A pull/fetch is needed before pushing. */
  needsPull?: boolean;
  /** The branch has no upstream and auto-set-upstream is off. */
  noUpstream?: boolean;
  /** The repository has no remote configured. */
  noRemote?: boolean;
  /** Push failed because no credentials are configured for the remote. */
  authFailed?: boolean;
  /** Commits pushed (ahead count consumed), best-effort. */
  pushed?: number;
  error?: string;
}

/**
 * Context assembled in the MAIN process for AI commit-message generation. It is
 * built entirely from `runGit` output (never renderer-supplied) and size-capped
 * by `GIT_LIMITS.commitGen` before it reaches the sub-agent prompt.
 */
export interface GitCommitContext {
  /** Resolved repo root (worktree-aware) the one-shot run uses as cwd. */
  root: string;
  branch?: string;
  /** Staged files (capped at commitGen.filesMax). */
  files: Array<{ path: string; status: GitFileStatus; adds?: number; dels?: number; binary?: boolean }>;
  /** Staged unified diff, capped at commitGen.diffCharsMax and redacted. */
  diff: string;
  diffTruncated: boolean;
  /** Recent commit subjects (newest first) for style inference, redacted. */
  recentSubjects: string[];
}

/** One frame of the streaming AI commit-message proposal. */
export interface GitCommitMessageStreamEvent {
  workspaceId: string;
  requestId: string;
  kind: 'delta' | 'done' | 'error' | 'canceled';
  /** delta: appended chunk; done: the FULL authoritative message (replace). */
  text?: string;
  /** Set when kind === 'error' (already redacted). */
  error?: string;
}

/** Terminal result of a commit-message generation request. */
export interface GenerateCommitMessageResult {
  ok: boolean;
  message?: string;
  reason?: 'no-staged' | 'agent-unavailable' | 'busy' | 'rate-limited' | 'canceled' | 'error';
  error?: string;
}

/** Result of `git pull` — decodes fast-forward / conflict / divergence cases. */
export interface GitPullResult {
  ok: boolean;
  /** Remote work was integrated (fast-forward or rebase succeeded). */
  updated?: boolean;
  /** Already up to date — nothing to integrate. */
  upToDate?: boolean;
  /** The pull could not fast-forward and the strategy forbade a merge. */
  notFastForward?: boolean;
  /** The pull/rebase stopped on conflicts that need manual resolution. */
  conflicts?: boolean;
  /** Files left in a conflicted state, if known. */
  files?: string[];
  /** No remote / no upstream to pull from. */
  noUpstream?: boolean;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Local Memory System                                                 */
/* ------------------------------------------------------------------ */

/**
 * Memory tiers, shortest-lived to most durable. Higher tiers outrank lower ones
 * during retrieval so architectural knowledge surfaces before transient detail.
 */
export type MemoryTier =
  | 'session' // transient, current-session context
  | 'workspace' // repository characteristics shared across sessions
  | 'project' // durable product knowledge (rules, domain, requirements)
  | 'preference' // how the developer prefers to work
  | 'convention' // recurring coding standards / patterns
  | 'decision' // architecture decisions (first-class, with rationale)
  | 'solution' // reusable implementation knowledge
  | 'note'; // manually-authored note

/** Where a memory came from. Manual notes are trusted highest. */
export type MemorySource =
  | 'manual'
  | 'auto'
  | 'commit'
  | 'conversation'
  | 'review'
  | 'terminal'
  | 'import';

/** Lifecycle of a memory. Only `active` rows are ever injected into a prompt. */
export type MemoryStatus = 'active' | 'archived' | 'proposed' | 'rejected';

/** A single unit of durable project knowledge. */
export interface Memory {
  id: string;
  /** Owning workspace, or null for global/user-scope (preferences). */
  workspaceId: string | null;
  tier: MemoryTier;
  title: string;
  body: string;
  source: MemorySource;
  /** 0..1 confidence the entry is intentional, durable knowledge. */
  confidence: number;
  pinned: boolean;
  status: MemoryStatus;
  /** How many times this memory has been retrieved into a prompt. */
  useCount: number;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** Epoch ms after which the memory is considered stale (null = never). */
  expiresAt: number | null;
  /** Originating session, commit, or file (for "navigate back to source"). */
  sessionId: string | null;
  commitHash: string | null;
  filePath: string | null;
}

/** A memory plus an FTS snippet + score, returned from search/retrieval. */
export interface MemoryHit extends Memory {
  /** Highlighted snippet around the match (search) — plain body otherwise. */
  snippet?: string;
  /** Composite rank score (debug / ordering only). */
  score?: number;
}

/** Renderer-supplied fields when creating a memory. */
export interface MemoryCreateInput {
  workspaceId: string | null;
  tier: MemoryTier;
  title: string;
  body: string;
  source?: MemorySource;
  confidence?: number;
  pinned?: boolean;
  sessionId?: string | null;
  /** Workspace-relative file this memory is about (drives a 'file' back-link). */
  filePath?: string | null;
  /** Symbols this memory references, each `path#name` (drives 'symbol' links). */
  symbolRefs?: string[];
}

/** Renderer-supplied patch when editing a memory (all optional). */
export interface MemoryUpdateInput {
  title?: string;
  body?: string;
  tier?: MemoryTier;
  pinned?: boolean;
  confidence?: number;
}

/** Filters for listing memories in the Memory panel. */
export interface MemoryListFilter {
  workspaceId: string | null;
  tiers?: MemoryTier[];
  /** Include archived rows (default false). */
  includeArchived?: boolean;
  limit?: number;
}

/* ------------------------------------------------------------------ */
/* Search Engine — unified, cross-subsystem retrieval                  */
/* ------------------------------------------------------------------ */

/**
 * The kind of object a search hit represents — i.e. which subsystem owns it.
 * `file` / `symbol` come from the SearchManager's own FTS index; the rest are
 * federated from the subsystem that already owns them (memory, git, sessions,
 * commands, settings, saved searches).
 */
export type SearchKind =
  | 'file'
  | 'symbol'
  | 'doc'
  | 'memory'
  | 'commit'
  | 'branch'
  | 'tag'
  | 'session'
  | 'terminal'
  | 'diagnostic'
  | 'command'
  | 'setting'
  | 'saved'
  /**
   * Release notes. Federated from the manifest compiled into the build, not
   * indexed: the corpus is a handful of documents that cannot change while the
   * process runs, so an index would only add something able to go stale.
   */
  | 'release';

/** A language-aware symbol classification (best-effort, from the regex extractor). */
export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'enum'
  | 'type'
  | 'constant'
  | 'variable'
  | 'struct'
  | 'trait'
  | 'module';

/** One unified search result, regardless of which subsystem produced it. */
export interface SearchHit {
  /** Stable id for React keys — `${kind}:${ref}`. */
  id: string;
  kind: SearchKind;
  /** Primary label (file name, symbol name, memory title, commit subject, …). */
  title: string;
  /** Secondary line (directory, signature, snippet, author/date, …). */
  subtitle?: string;
  /** Workspace-relative path when the hit maps to a file (file/symbol/doc). */
  path?: string;
  /** 1-indexed line for symbol/doc hits. */
  line?: number;
  /** Symbol classification for `symbol` hits. */
  symbolKind?: SymbolKind;
  /** Detected language for file/symbol hits. */
  lang?: string;
  /**
   * Opaque, kind-specific reference used to open the hit (commit hash, memory id,
   * command id, session id, branch name, …). For files this is the path.
   */
  ref: string;
  /** Composite rank score (ordering/debug only). */
  score?: number;
}

/** A group of hits sharing a `SearchKind`, for the grouped results UI. */
export interface SearchGroup {
  kind: SearchKind;
  label: string;
  hits: SearchHit[];
  /** True when more hits exist than were returned (per-group cap hit). */
  truncated?: boolean;
}

/** Inline filters that narrow a global/scoped search. */
export interface SearchFilter {
  /** Restrict to these kinds (empty/undefined = all). */
  kinds?: SearchKind[];
  /** Restrict file/symbol hits to this language. */
  lang?: string;
  /** Restrict symbol hits to this classification. */
  symbolKind?: SymbolKind;
  /** Hard cap on total hits returned. */
  limit?: number;
  /** Fuzzy/substring matching; when false, symbol search is prefix-only (strict). */
  fuzzy?: boolean;
}

/** Options for a search request, always scoped to a workspace (or global). */
export interface SearchQueryOptions extends SearchFilter {
  workspaceId: string | null;
}

/** A persisted, re-runnable saved search. */
export interface SavedSearch {
  id: string;
  workspaceId: string | null;
  name: string;
  query: string;
  filter: SearchFilter;
  createdAt: number;
}

/** A recent-search entry (most-recent-first). */
export interface SearchHistoryEntry {
  query: string;
  at: number;
}

/** Progress of an in-flight search index pass (mirrors IndexProgress). */
export interface SearchIndexProgress {
  workspaceId: string;
  phase: 'indexing' | 'done';
  processed: number;
  total: number;
  percent: number;
}

/* ------------------------------------------------------------------ */
/* Workspace (Phase 2)                                                 */
/* ------------------------------------------------------------------ */

/**
 * Lifecycle of a workspace, modeled as a state machine so every subsystem knows
 * which operations are legal at each stage. The coding agent, for example, may
 * only receive prompts once a workspace is `ready`.
 */
export type WorkspaceLifecycle =
  | 'created'
  | 'validated'
  | 'opening'
  | 'loading'
  | 'ready'
  | 'busy'
  | 'closing'
  | 'error';

/** Overall health surfaced on workspace cards. */
export type WorkspaceHealth = 'ok' | 'warning' | 'error' | 'unknown';

/** A detected package manager. */
export type PackageManager =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'bun'
  | 'cargo'
  | 'go'
  | 'maven'
  | 'gradle'
  | 'pip'
  | 'unknown';

/**
 * Structured identity of a project, computed once by the detection pipeline and
 * cached so subsystems never re-inspect the filesystem just to read it.
 */
export interface WorkspaceMetadata {
  /** Detected programming languages, most-prevalent first. */
  languages: string[];
  /** Detected package managers. */
  packageManagers: PackageManager[];
  /** Detected frameworks / notable config (e.g. "Vite", "Docker", "ESLint"). */
  frameworks: string[];
  /** Whether a `.git` repository was found at the root. */
  hasGit: boolean;
  /** Active git branch, if any. */
  branch?: string;
  /** Whether a Dockerfile / compose file was found. */
  hasDocker: boolean;
}

/**
 * Per-workspace configuration — independent from every other workspace and from
 * global {@link AppSettings}. Describes how the app should behave inside this
 * project. Extended in later phases (agent params, indexing schedules, …).
 */
export interface WorkspaceConfig {
  /** Directories excluded from walking / indexing / search. */
  ignoredDirs: string[];
  /** Require explicit approval before the agent runs terminal commands. */
  approveTerminalCommands: boolean;
  /** Preferred shell for terminal sessions (empty = OS default). */
  preferredShell: string;
  /**
   * Permission mode every new session in this workspace starts in. Overrides the
   * global `agent.plan.defaultMode`. The desktop equivalent of a repo's
   * `.claude/settings.json` `permissions.defaultMode`. Undefined = inherit global.
   */
  planDefaultMode?: SessionPermissionMode;
  /**
   * SHA-256 of the repo's limboo.json hooks the user has acknowledged. Repo
   * config is untrusted until acknowledged: setup/teardown hooks only run when
   * this matches the current config (or the user just confirmed the commands).
   */
  hooksAckHash?: string;
}

/* ------------------------------------------------------------------ */
/* Worktree repo config + Scripts & Services                           */
/* ------------------------------------------------------------------ */

/**
 * The repo-authored `limboo.json` at the workspace/worktree root: worktree
 * setup/teardown hooks, named scripts, and supervised services. Parsed and
 * strictly validated in the main process (size-capped, whitelisted names,
 * length-capped commands, prototype-pollution rejected) — see
 * `managers/worktree/config.ts`.
 */
export interface RepoConfig {
  /** Commands run sequentially right after a worktree is created. */
  setup: string[];
  /** Commands run before a worktree is removed (archive / delete). */
  teardown: string[];
  /** On-demand named commands (test, lint, migrate, …). */
  scripts: Record<string, string>;
  /** Long-running processes supervised per session. */
  services: Record<string, RepoServiceConfig>;
}

export interface RepoServiceConfig {
  command: string;
  /** Start automatically when the session's worktree comes up. */
  autoStart: boolean;
  /** Respawn policy after an unexpected exit. */
  restart: 'no' | 'on-failure';
}

export type ServiceStatus = 'starting' | 'running' | 'exited' | 'crashed' | 'stopped';

/** A supervised service instance owned by one session. */
export interface ServiceInfo {
  sessionId: string;
  name: string;
  status: ServiceStatus;
  /** Loopback port assigned from the configured range (null until started). */
  port: number | null;
  /** Direct URL (http://127.0.0.1:<port>) once running. */
  url: string | null;
  /** Deterministic *.localhost URL when the reverse proxy is enabled. */
  proxyUrl: string | null;
  /** Terminal streaming this service's output. */
  terminalId: string | null;
  /** Consecutive on-failure respawns since the last clean start. */
  restarts: number;
  autoStart: boolean;
}

/** Repo config + acknowledgment state, as served to the renderer. */
export interface RepoConfigState {
  config: RepoConfig | null;
  /** SHA-256 over the hooks portion — pass back to run what was displayed. */
  hash: string;
  /** True when the workspace has already acknowledged these hooks. */
  acked: boolean;
}

/** Groundable repository statistics (no indexing/search engine required yet). */
export interface WorkspaceStats {
  fileCount: number;
  /** Total size on disk in bytes (bounded walk; excludes ignored dirs). */
  sizeBytes: number;
  /** Language → file count. */
  languageBreakdown: Record<string, number>;
  /** Declared dependency count from the primary manifest, if any. */
  dependencyCount: number;
  /** Git commit count on the active branch, if a repo. */
  commitCount?: number;
}

/**
 * A development workspace: the app's complete representation of a project. The
 * central source of truth every other subsystem references.
 */
export interface Workspace {
  id: string;
  name: string;
  path: string;
  /** Deterministic icon descriptor (initial + accent hue), rendered on-palette. */
  icon: WorkspaceIcon;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  favorite: boolean;
  lifecycle: WorkspaceLifecycle;
  health: WorkspaceHealth;
  metadata: WorkspaceMetadata;
  config: WorkspaceConfig;
}

/** A background-less, on-palette project glyph. */
export interface WorkspaceIcon {
  /** 1–2 character label (derived from the project name). */
  initials: string;
  /** Hue (0–360) for the accent ring/text; never a filled background. */
  hue: number;
}

/** Result of the create/open validation pipeline. */
export interface WorkspaceValidationResult {
  ok: boolean;
  /** Human-readable diagnostics when `ok` is false. */
  errors: string[];
  /** Non-fatal warnings (still openable). */
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* File System Layer (Phase 4 — read + watch + index foundation)       */
/* ------------------------------------------------------------------ */

/** Whether a tree node is a file or a directory. */
export type FileNodeType = 'file' | 'dir';

/**
 * One node in the synchronized directory tree maintained by the File System
 * Layer. Paths are workspace-relative (POSIX `/` separators) so the renderer can
 * key/render them consistently across platforms. The root node uses `path: ''`.
 */
export interface FileNode {
  /** Workspace-relative path (POSIX separators). Empty string for the root. */
  path: string;
  /** Base name of the entry. */
  name: string;
  type: FileNodeType;
  /** File size in bytes (files only; omitted for dirs). */
  size?: number;
  /** True when the entry is a symlink (never followed — see security notes). */
  isSymlink?: boolean;
  /** True when the walk hit the entry cap and stopped descending here. */
  truncated?: boolean;
  /** Child nodes (dirs only), sorted dirs-first then alphabetically. */
  children?: FileNode[];
}

/** A full directory-tree snapshot for one workspace. */
export interface FileTree {
  workspaceId: string;
  root: FileNode;
  /** Total file + directory nodes contained in the tree. */
  nodeCount: number;
  /** True when the walk was capped (the tree is partial). */
  truncated: boolean;
  /** Epoch ms the tree was built. */
  builtAt: number;
}

/** Phase of an indexing pass (drives the progress UI). */
export type IndexPhase = 'counting' | 'building' | 'done';

/** Progress of an indexing pass, pushed to the renderer as it proceeds. */
export interface IndexProgress {
  workspaceId: string;
  phase: IndexPhase;
  /** Entries processed so far. */
  processed: number;
  /** Best-effort total (from the counting pass); 0 until known. */
  total: number;
  /** Integer 0–100; reaches 100 when `phase === 'done'`. */
  percent: number;
}

/** Result of a centralized File Reader read. */
export interface FileReadResult {
  /** Workspace-relative path (POSIX separators). */
  path: string;
  /** UTF-8 text content; omitted when binary or too large to return. */
  content?: string;
  /** Detected encoding (currently always 'utf-8' when text is returned). */
  encoding: 'utf-8';
  /** True when binary content was detected (content is withheld). */
  isBinary: boolean;
  /** Size on disk in bytes. */
  size: number;
  /** True when the file exceeded the read cap and content was withheld. */
  tooLarge: boolean;
}

/** App-level interaction recorded by the File History (distinct from git). */
export interface FileHistoryEntry {
  /** Workspace-relative path (POSIX separators). */
  path: string;
  action: 'read' | 'index' | 'change' | 'write' | 'create' | 'delete' | 'rename' | 'copy';
  /** Epoch ms. */
  at: number;
}

/** Result of a File Writer mutation. */
export interface FileWriteResult {
  /** Workspace-relative POSIX path of the (final) target. */
  path: string;
  /** Size on disk in bytes after the write (files only). */
  size?: number;
  /** True when the entry did not exist before the operation. */
  created: boolean;
}

/** Options accepted by the File Writer mutation channels. */
export interface FsMutationOptions {
  /** Allow replacing an existing destination (write/rename/copy). */
  overwrite?: boolean;
  /** Allow deleting a non-empty directory (fs:delete only). */
  recursive?: boolean;
}

/* ------------------------------------------------------------------ */
/* Integrated Terminal — workspace-scoped PTY sessions                 */
/* ------------------------------------------------------------------ */

/** Lifecycle state of a managed terminal's underlying PTY. */
export type TerminalStatus = 'running' | 'exited' | 'crashed';

/** Who opened a terminal — a user action or the coding agent. */
export type TerminalOrigin = 'user' | 'agent' | 'hook' | 'service';

/**
 * A managed terminal session. The PTY itself lives in the main process
 * (node-pty); this is the metadata the renderer renders and persists.
 */
export interface TerminalSession {
  id: string;
  workspaceId: string;
  /** User-facing label (editable). */
  title: string;
  /** Working directory the PTY was spawned in (always inside the workspace root). */
  cwd: string;
  /** Resolved shell binary path (e.g. /bin/zsh). */
  shell: string;
  status: TerminalStatus;
  origin: TerminalOrigin;
  /** The session this terminal belongs to (worktree terminals / hooks / services). */
  sessionId?: string;
  createdAt: number;
  /** Exit code, once the PTY has exited. */
  exitCode?: number;
}

/** A chunk of raw PTY output (VT byte stream) for one terminal. */
export interface TerminalChunk {
  terminalId: string;
  data: string;
}

/** A terminal's PTY exit notification. */
export interface TerminalExit {
  terminalId: string;
  exitCode: number;
  signal?: number;
}

/** Options accepted when creating a terminal. */
export interface TerminalCreateOptions {
  /** Optional label; a default ("Terminal N") is assigned when omitted. */
  title?: string;
  /** Initial PTY size. */
  cols?: number;
  rows?: number;
  /** Marks an agent-initiated terminal (used for the mirror flow). */
  origin?: TerminalOrigin;
  /** Owning session — a worktree-backed session's terminals spawn in its worktree. */
  sessionId?: string;
}

/** Status of a mirrored agent command record. */
export type TerminalCommandStatus = 'running' | 'done' | 'error';

/**
 * A coding-agent shell command mirrored into the integrated terminal. The Agent
 * SDK does not stream tool stdout, so the command is echoed on `tool-start`
 * (status `running`) and completed on `tool-end` (output + exit). This is a
 * record surfaced in the terminal, not a live PTY stream.
 */
export interface TerminalCommandRecord {
  terminalId: string;
  /** The agent session that initiated the command. */
  sessionId: string;
  /** The agent tool-call id this record mirrors. */
  callId: string;
  /** The command text the agent ran. */
  command: string;
  /** Final command output (filled on completion); omitted while running. */
  output?: string;
  status: TerminalCommandStatus;
  exitCode?: number;
  startedAt: number;
  endedAt?: number;
}

/* ------------------------------------------------------------------ */
/* Coding agent (Claude Code orchestration)                            */
/* ------------------------------------------------------------------ */

/**
 * Axis A — the lifecycle of the local Claude Code *capability* (process-
 * spawnable, auth valid, SDK loadable, reachable). This is independent of any
 * single request's outcome: a failed prompt must NOT push this to a fatal state
 * while the capability is still healthy.
 */
export type AgentLifecycleStatus =
  | 'starting' // first install/auth/SDK probe in flight
  | 'initializing' // probe passed, wiring heartbeat
  | 'ready' // healthy & idle — the steady state
  | 'busy' // a run is mid-flight (pre-stream: connecting/handshake)
  | 'streaming' // a run is actively emitting tokens / tool calls
  | 'awaiting-permission' // a run is blocked on a renderer approval
  | 'reconnecting' // transient failure(s); recovery loop retrying
  | 'rate-limited' // provider rate/session limit hit; capability intact
  | 'auth-required' // auth invalid/expired; needs the user to sign in again
  | 'offline' // host network unreachable (heartbeat connectivity probe)
  | 'not-installed' // Claude Code is not authenticated / available
  | 'failed'; // recovery exhausted / unrecoverable capability error

/**
 * @deprecated Transitional alias kept so existing imports compile during the
 * dual-state migration. New code should use {@link AgentLifecycleStatus}.
 */
export type AgentRuntimeStatus = AgentLifecycleStatus;

/** Axis B — terminal classification of the most recent (or active) run. */
export type RequestOutcome =
  | 'success'
  | 'failed' // generic transport/process error after recovery
  | 'cancelled' // user stopped the run
  | 'rate-limited' // hit a provider session/rate limit
  | 'tool-rejected' // a gated tool was denied and the run could not continue
  | 'auth-required' // auth failure surfaced mid-run
  | 'context-overflow'; // context window exceeded

/** Phase of the active run (drives progress UI, distinct from outcome). */
export type RequestPhase =
  | 'idle' // no active run
  | 'submitting' // user turn recorded, query() not yet streaming
  | 'connecting' // query() spawned, awaiting first SDK message
  | 'streaming' // tokens / tool calls flowing
  | 'awaiting-permission'
  | 'awaiting-plan-approval' // ExitPlanMode parked; execution blocked on a human
  | 'recovering' // recovery loop re-attempting this run
  | 'done'; // completed (see outcome)

/**
 * Phases in which a session's run counts as "in flight" — the single definition
 * of busy, shared by both processes. Main uses it to prove a phase against the
 * live run map; the renderer uses it to gate every busy/disabled control. They
 * used to be separate literals, which is exactly how a window could inherit a
 * phase main no longer believed in.
 */
export const RUNNING_REQUEST_PHASES: readonly RequestPhase[] = [
  'submitting',
  'connecting',
  'streaming',
  'recovering',
  'awaiting-permission',
  'awaiting-plan-approval',
];

/**
 * Phases in which the run is parked on a human and the UI must stay usable.
 *
 * `RUNNING_REQUEST_PHASES` gates every busy/disabled control, so a parked
 * approval would disable the very buttons being waited on. Surfaces that
 * present the decision subtract this set from "busy".
 */
export const AWAITING_USER_REQUEST_PHASES: readonly RequestPhase[] = [
  'awaiting-permission',
  'awaiting-plan-approval',
];

/** Live state of the active run, mirrored to the renderer. */
export interface RequestState {
  /** Session whose run this describes, or null when idle. */
  sessionId: string | null;
  phase: RequestPhase;
  /** Terminal outcome once `phase === 'done'`; null while in flight. */
  outcome: RequestOutcome | null;
  /** Current recovery attempt (0 when not recovering). */
  attempt: number;
  maxAttempts: number;
  /** Short human reason for failed / rate-limited / auth-required outcomes. */
  detail?: string;
}

/** Parsed provider rate-limit, surfaced while lifecycle === 'rate-limited'. */
export interface RateLimitInfo {
  /** Raw message as detected from the SDK (already redacted). */
  message: string;
  /** Epoch ms when the limit is expected to reset, if parseable. */
  resetsAt?: number;
  /** IANA tz string if the provider message named one (e.g. Africa/Nairobi). */
  timezone?: string;
}

/** Result of detecting the locally-installed Claude Code CLI. */
export interface AgentInstall {
  installed: boolean;
  version?: string;
  /** Human-readable diagnostic when detection failed. */
  error?: string;
}

/** The agent's global state, broadcast to every window on change. */
export interface AgentState {
  /** Axis A — capability health. */
  lifecycle: AgentLifecycleStatus;
  install: AgentInstall;
  /**
   * Axis B — the active / last run, kept for back-compat with anything that
   * only cares about the most-recently-touched session. Multi-session UI must
   * use {@link requestsBySession} instead — sessions can run concurrently, and
   * this single field cannot represent more than one at a time.
   */
  request: RequestState;
  /** Session id whose run is currently active, if any. */
  activeSessionId: string | null;
  /** Per-session run phase — the source of truth once more than one session
   *  can be in flight at once (see CLAUDE.md multi-session concurrency notes). */
  requestsBySession: Record<string, RequestState>;
  /** Every tool approval currently awaiting a renderer decision, across all sessions. */
  pendingPermissions: PermissionRequest[];
  /** Every `AskUserQuestion` clarification currently awaiting renderer answers, across all sessions. */
  pendingClarifications: ClarificationRequest[];
  /** Present while lifecycle === 'rate-limited'. */
  rateLimit?: RateLimitInfo;
  /** Last capability-level error (NOT a request-level failure). */
  error?: string;
  /**
   * Last Cursor run's bridge capability probe: did the session hooks / the
   * limboo MCP servers actually connect over the per-run pipe? `null` =
   * the layer wasn't registered for that run; absent = no Cursor run yet.
   */
  cursorBridge?: { hooksActive: boolean | null; mcpActive: boolean | null; at: number };
  /**
   * Whether Cursor default/acceptEdits runs execute interactively (`--force`
   * gated per-tool through the hooks bridge) or stay propose-only. `active`
   * flips true once the hooks bridge has been verified for the resolved CLI
   * version; absent = no Cursor runtime probed yet.
   */
  cursorInteractive?: { active: boolean; cliVersion: string | null };
  /** Heartbeat bookkeeping for the UI ("last checked 3s ago"). */
  heartbeat: {
    lastOkAt: number | null;
    consecutiveFailures: number;
  };
}

/* ------------------------------------------------------------------ */
/* Cursor provider — authentication only (no run capability yet)       */
/* ------------------------------------------------------------------ */

/**
 * Classification of the local Cursor CLI / credential state. Computed entirely
 * from local signals (PATH resolution, credential *presence*, and
 * `cursor-agent status --format json`) — no network probes, and the secret
 * itself is never read for classification.
 */
export type CursorAuthStatus =
  | 'unknown' // never probed yet
  | 'not-installed' // cursor-agent not found on PATH
  | 'not-authenticated' // CLI present, no login and no API key
  | 'authenticated-cli' // the CLI reports a signed-in Cursor account
  | 'authenticated-api-key'; // a CURSOR_API_KEY is configured (env or encrypted)

/** Phase of an in-flight interactive `cursor-agent login` child. */
export type CursorLoginPhase =
  | 'idle'
  | 'launching' // spawn issued, no signal yet
  | 'waiting-browser' // CLI opened the user's browser; awaiting completion
  | 'waiting-manual-url' // NO_OPEN_BROWSER mode; URL captured for the UI
  | 'verifying' // login child exited; re-probing auth state
  | 'failed';

/**
 * The Cursor provider's auth state, broadcast to every window on change.
 * NEVER carries the API key or any credential material — only presence
 * booleans, whitelisted account scalars, and redacted diagnostics.
 */
export interface CursorAuthState {
  status: CursorAuthStatus;
  /** `cursor-agent --version` output, when resolvable. */
  cliVersion?: string;
  /** Whitelisted scalars from `status --format json` (never the raw payload). */
  account?: { email?: string; name?: string };
  /** API-key presence metadata — the key itself never leaves the main process. */
  apiKey: {
    configured: boolean;
    /** Where the key comes from: the process env or the encrypted SecretStore. */
    source?: 'env' | 'encrypted';
    /** Epoch ms the encrypted key was last written (SecretStore metadata). */
    updatedAt?: number;
  };
  /** Interactive login progress (single-flight). */
  login: {
    phase: CursorLoginPhase;
    /** Validated https login URL captured in manual-browser mode. */
    url?: string;
    /** Short redacted reason when phase === 'failed'. */
    error?: string;
  };
  /** Whether Electron safeStorage encryption is available on this OS. */
  encryptionAvailable: boolean;
  /** Epoch ms of the last completed probe. */
  lastCheckedAt?: number;
  /** Human-readable diagnostic from the last probe (already redacted). */
  error?: string;
  /**
   * How the CLI was resolved (local paths only, no secrets) — feeds the
   * Settings › Agent › Troubleshooting section. `node` = the native Windows
   * layout spawned directly as node.exe + index.js.
   */
  exec?: {
    path: string;
    kind: 'exe' | 'cmd' | 'node';
    source?: 'override' | 'path' | 'where' | 'install-dir';
  };
  /**
   * Model ids from `cursor-agent models` (charset-validated, deduped,
   * capped). Absent until the first authenticated probe fetches them.
   */
  models?: string[];
}

/** Outcome of a `cursor-agent update` self-update run. */
export interface CursorUpdateResult {
  ok: boolean;
  /** Short redacted summary (version line or failure reason). */
  message: string;
}

/** Severity for a diagnostics console line. */
export type DiagnosticSeverity = 'debug' | 'info' | 'warning' | 'error';

/** Category groups diagnostics in the Agent Console rail / filter. */
export type DiagnosticCategory =
  | 'lifecycle' // init, handshake, attach, termination
  | 'request' // prompt submit, completion, cancel
  | 'tool' // tool exec / approval
  | 'stream' // streaming start/stop
  | 'recovery' // reconnect attempt / outcome
  | 'auth' // auth change
  | 'rate-limit' // limit hit / cleared
  | 'heartbeat'; // periodic health probe

/**
 * One structured line in the Agent Console. Append-only, optionally persisted.
 * `detail` is the expandable technical payload (already redacted) shown when the
 * user opens the row — never raw secrets.
 */
export interface AgentDiagnostic {
  id: string;
  /** Session scope, or null for capability-global events (heartbeat, auth). */
  sessionId: string | null;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  /** Short one-line label. */
  label: string;
  /** Expandable, multi-line technical detail (redacted). */
  detail?: string;
  /** Epoch ms; formatted relatively in the UI. */
  at: number;
}

export type ChatRole = 'user' | 'assistant';

/** One conversation turn rendered in the center column. */
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  text: string;
  /** True while assistant tokens are still streaming in. */
  streaming: boolean;
  createdAt: number;
  /** Files the user attached to this turn (hydrated main-side; user role only). */
  attachments?: AttachmentMeta[];
  /**
   * How to RENDER this turn when that should differ from what was SENT.
   *
   * Some prompts are orchestration, not conversation: approving a plan sends the
   * whole plan document wrapped in `<approved-plan>` tags, and regenerating one
   * sends a re-planning instruction. `send()` persists and broadcasts every
   * prompt as a visible user turn, and the user bubble renders text verbatim, so
   * those turns used to surface as thousands of characters of raw Markdown plus
   * literal XML tags in a chat bubble.
   *
   * `text` is the one-line summary to show; `body` is an optional Markdown
   * document rendered beneath it. Absent means "render `text` as before", so
   * every ordinary prompt is completely unaffected.
   *
   * This is a **renderer hint only**. It never changes what reaches the provider,
   * and the raw view still reveals the true sent text — nothing is hidden from
   * someone auditing the transcript.
   */
  display?: { text: string; body?: string };
}

/* ------------------------------------------------------------------ */
/* Attachment Manager                                                  */
/* ------------------------------------------------------------------ */

/** Coarse file classification driving icons, category gates, and handling. */
export type AttachmentCategory = 'image' | 'code' | 'document' | 'data' | 'archive' | 'other';

/**
 * Lifecycle of an attachment: `uploading` while hashing/staging, `ready` once
 * staged, `referenced` when sent with a message, `read` once the agent actually
 * opened it through a read tool, `error` when staging failed.
 */
export type AttachmentStatus = 'uploading' | 'ready' | 'referenced' | 'read' | 'error';

/** How the file entered the workspace. */
export type AttachmentOrigin = 'pick' | 'drop' | 'paste';

/** Elevated = executable/script/installer class; staged only under `warn` policy. */
export type AttachmentRisk = 'safe' | 'elevated';

/** Metadata record for one session-owned attachment (the staged copy is on disk). */
export interface AttachmentMeta {
  id: string;
  sessionId: string;
  workspaceId: string;
  /** Sanitized display name (original basename). */
  name: string;
  /** On-disk name inside the session staging dir (`<hash12>-<name>`). */
  storedName: string;
  mime: string;
  category: AttachmentCategory;
  size: number;
  sha256: string;
  status: AttachmentStatus;
  origin: AttachmentOrigin;
  risk: AttachmentRisk;
  /** Null while a composer draft; set when sent with a user message. */
  messageId: string | null;
  /** Tiny base64 data-URL thumbnail (images only, capped). */
  thumb?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/** Staging progress pushed while a file is hashed + copied. */
export interface AttachmentProgress {
  sessionId: string;
  id: string;
  /** 0–100. */
  percent: number;
}

/** Risk class used to gate a tool call. */
export type ToolRisk = 'read' | 'write' | 'command';
export type ToolCallStatus = 'running' | 'done' | 'denied' | 'error';

/**
 * The execution record of ONE spawned subagent, carried on the `Agent`/`Task`
 * tool call that spawned it.
 *
 * Subagents are deliberately NOT a UI surface of their own: Claude Code's model
 * is that a subagent works in its own context window and returns only a
 * distilled result to the parent, so the conversation stream is the only place
 * the user observes one. Everything here exists to let a single inline row in
 * that stream expand into "what did this worker actually do" without opening a
 * second conversation, a panel, or a window.
 *
 * ## Where the fields come from
 *
 * Two sources, and the distinction matters for honesty:
 *
 *  - **Reported** — the Agent SDK's `task_started` / `task_progress` /
 *    `task_notification` messages, joined to this call by their `tool_use_id`.
 *    These are measurements (`usage.duration_ms`, `tool_uses`, `total_tokens`)
 *    and the provider's own progress prose. Authoritative when present.
 *  - **Rolled up** — derived in the main process from the worker's own child
 *    tool calls (those whose {@link AgentToolCall.parentCallId} is this call's
 *    id), because the renderer must never re-derive orchestration facts.
 *
 * A field neither source filled stays undefined and is **omitted** from the UI
 * rather than defaulted. Cursor reports nothing here, so a Cursor run leaves
 * every field unset and the surface degrades to nothing.
 */
export interface SubagentInfo {
  /**
   * The subagent definition's name — the Agent tool's `subagent_type` input
   * (e.g. `Explore`, `Plan`, `general-purpose`, or a custom/plugin-scoped name).
   * Undefined when the provider does not report one.
   */
  type?: string;
  /** The short task description the parent gave the worker (Agent tool `description`). */
  description?: string;
  /**
   * Model the subagent ran on, when the provider reports it. Claude resolves a
   * subagent's model from several sources and only sometimes echoes the result,
   * so this is best-effort and rendered only when present.
   */
  model?: string;
  /** True when the provider launched this worker as a non-blocking background task. */
  background?: boolean;
  /* NOTE: there is deliberately no `worktree` field. Claude Code's
   * `isolation: worktree` puts a subagent in a temporary worktree it manages
   * internally and never reports — not in the Agent tool input, not in the
   * `task_*` stream. Limboo's WorktreeManager resolves the SESSION's root, which
   * is the parent's checkout, not the worker's isolated copy. Showing it would
   * be a confident wrong answer, so the field does not exist. */
  /** Distinct tool names the worker invoked, in first-use order. */
  tools?: string[];
  /** Distinct MCP server names the worker reached (`mcp__<server>__<tool>`). */
  mcpServers?: string[];
  /** Count of read-shaped calls the worker made (Read/Glob/LS/NotebookRead). */
  filesRead?: number;
  /**
   * Files the worker modified, with their diffstat — so the completion row can
   * show `+adds/-dels` and open each one's diff. Paths alone were not enough to
   * render anything but a link.
   */
  filesChanged?: FileChange[];
  /** Permission prompts raised inside this worker: how many, and how many denied. */
  permissions?: { prompted: number; denied: number };
  /** Count of memory lookups the worker performed via the shared memory tools. */
  memoryLookups?: number;
  /**
   * Verification the worker ran — test, lint, typecheck and build commands
   * recognized from its shell calls. Empty (not zero) when it ran none, so the
   * row can omit the line rather than claim "0 validation steps".
   */
  validations?: Array<{ kind: SubagentValidationKind; command: string; ok: boolean }>;

  /* --- Reported by the provider (see the type doc) --------------------- */

  /** The SDK task id, when the `task_*` stream identified this worker. */
  taskId?: string;
  /**
   * The provider's own one-line progress description, refreshed while the
   * worker runs (`task_progress.summary`, enabled by `agentProgressSummaries`).
   * Present-tense and model-written — e.g. "Analyzing authentication module".
   */
  progress?: string;
  /** The tool the worker was last seen running (`task_progress.last_tool_name`). */
  lastTool?: string;
  /** Measured wall-clock duration. Preferred over `endedAt - startedAt`. */
  durationMs?: number;
  /** Measured count of tool invocations. Preferred over the rolled-up list length. */
  toolUses?: number;
  /** Tokens the worker consumed — the real cost of the delegation. */
  totalTokens?: number;
  /**
   * Terminal status as the provider reported it. `stopped` is distinct from
   * `failed`: the user or the harness ended the worker, it did not error.
   */
  outcome?: 'completed' | 'failed' | 'stopped';
  /** Provider-reported error text when the worker failed. */
  error?: string;
  /**
   * The worker's forwarded transcript — its own narration, available only when
   * `forwardSubagentText` is on.
   *
   * **This is untrusted content.** It is model output that Limboo renders
   * verbatim, so it is bounded, stored as data, and must never be merged into a
   * system prompt or fed to a context provider. It is NOT the worker's
   * reasoning: thinking blocks are excluded, and no affordance may imply the
   * chain of thought is available.
   */
  transcript?: string;
  /**
   * The worker's final message — the Agent tool result the parent actually
   * receives. This is the distilled summary, never the worker's reasoning:
   * neither provider exposes a subagent's internal chain of thought, and this
   * field must not be used to imply otherwise.
   */
  summary?: string;
}

/** A verification step recognized from a worker's shell commands. */
export type SubagentValidationKind = 'test' | 'lint' | 'typecheck' | 'build';

/** An agent tool invocation, shown inline in the conversation. */
export interface AgentToolCall {
  id: string;
  sessionId: string;
  /** Raw tool name (e.g. `Read`, `Edit`, `Bash`, `WebSearch`). */
  name: string;
  risk: ToolRisk;
  /** One-line human summary (e.g. `Edit src/app.ts`). */
  summary: string;
  /**
   * Optional expandable detail surfaced in the conversation tool card — e.g. the
   * web-search query, the fetched URL, the command text, or a short diff.
   */
  detail?: string;
  /** For web tools: the target URL or search query, shown inline in chat. */
  target?: string;
  /**
   * For file-editing tools (Write/Edit/MultiEdit): the change summary
   * (path + status + add/del line counts) so the stream can render `+adds/-dels`
   * and a Created/Edited/Deleted indicator inline.
   */
  change?: FileChange;
  /**
   * For file-editing tools: truncated before/after content + language id so the
   * conversation stream can render a Shiki-highlighted diff on expand. `before` is
   * empty for creates, `after` empty for deletes.
   */
  edit?: { before: string; after: string; lang?: string };
  /**
   * For file-reading tools (Read): the truncated content the tool actually
   * returned + language id, so the stream can render the same Shiki-highlighted
   * code block the model saw instead of just the path. Arrives on `tool-end`
   * (the content only exists once the tool has run). `startLine` is the file's
   * real first line so the gutter matches the file when the read was offset.
   */
  read?: { content: string; lang?: string; startLine?: number; truncated?: boolean };
  /**
   * The `Agent`/`Task` tool call this call was made INSIDE, when it originated
   * in a subagent's context — the Claude Agent SDK's `parent_tool_use_id`, which
   * it sets on every assistant/result message from a spawned subagent. Absent
   * for the main agent's own calls, and absent for Cursor print mode, whose
   * stream carries no derivable parent linkage. The Work Graph uses it to nest a
   * subagent's work under the node that spawned it instead of splicing it into
   * the main spine, and the conversation stream uses it to fold that work into
   * one inline subagent row instead of interleaving it with the parent's.
   */
  parentCallId?: string;
  /**
   * Present only on the `Agent`/`Task` call that SPAWNED a subagent — the
   * rolled-up execution record of that worker. See {@link SubagentInfo}.
   */
  subagent?: SubagentInfo;
  status: ToolCallStatus;
  startedAt: number;
  endedAt?: number;
}

/** A pending approval the renderer must resolve before the tool runs. */
export interface PermissionRequest {
  id: string;
  sessionId: string;
  tool: string;
  risk: ToolRisk;
  summary: string;
  /** Operation preview: command text, file path, or a short diff snippet. */
  detail?: string;
  /**
   * The spawning `Agent`/`Task` call id when this prompt was raised from inside
   * a subagent, so the approval can name the worker that asked instead of
   * appearing to come from the main conversation. Best-effort: it is resolved
   * from the run's single in-flight subagent, so it is set only when exactly one
   * worker is running — never guessed between concurrent workers.
   */
  parentCallId?: string;
  /** The worker's definition name, when {@link parentCallId} resolved. */
  subagentType?: string;
  createdAt: number;
}

/** The renderer's answer to a {@link PermissionRequest}. */
export interface PermissionDecision {
  id: string;
  behavior: 'allow' | 'deny';
  /** Remember this choice for the rest of the session (best-effort). */
  remember?: boolean;
  /** Optional reason surfaced back to the agent on deny. */
  message?: string;
}

/** One selectable choice within a {@link ClarificationQuestion}. */
export interface ClarificationOption {
  label: string;
  description: string;
}

/**
 * A single clarifying question generated by the agent's `AskUserQuestion` tool.
 * The agent authors these; the app only renders and collects answers.
 */
export interface ClarificationQuestion {
  /** The full question text to display. */
  question: string;
  /** Short label for the question (≤12 chars per the SDK). */
  header: string;
  /** 2–4 choices. */
  options: ClarificationOption[];
  /** When true, multiple options may be selected. */
  multiSelect: boolean;
}

/**
 * A pending `AskUserQuestion` the renderer must answer before the run resumes.
 * Unlike a {@link PermissionRequest}, this transfers control to the user: the
 * agent's `canUseTool` callback stays paused until the answers come back.
 */
export interface ClarificationRequest {
  id: string;
  sessionId: string;
  /** 1–4 questions. */
  questions: ClarificationQuestion[];
  createdAt: number;
}

/**
 * The renderer's answer to a {@link ClarificationRequest}. `answers` is keyed by
 * each question's text; the value is the selected option label(s) or free text.
 * `response` is an optional general reply that dismisses the structured questions.
 */
export interface ClarificationDecision {
  id: string;
  answers: Record<string, string | string[]>;
  response?: string;
}

export type AgentActivityType =
  | 'prompt'
  | 'tool'
  | 'file-change'
  | 'permission'
  | 'clarification'
  | 'result'
  | 'error'
  | 'status'
  | 'git';

/** The git operations that become a conversation-stream entry. */
export type GitActivityKind =
  | 'commit'
  | 'stage'
  | 'unstage'
  | 'discard'
  | 'checkout'
  | 'branch'
  | 'tag'
  | 'fetch'
  | 'push'
  | 'pull'
  | 'init'
  | 'checkpoint-create'
  | 'checkpoint-restore'
  | 'checkpoint-delete';

/**
 * Structured detail for a `git` activity entry, so the stream row can offer
 * real actions (open the diff, view the commit, restore the checkpoint) rather
 * than making the renderer scrape them back out of a label.
 *
 * Provider-neutral by construction: `origin` distinguishes the AGENT from the
 * USER and nothing here records which coding provider was running.
 */
export interface GitActivityPayload {
  kind: GitActivityKind;
  origin: 'agent' | 'user';
  ok: boolean;
  /** Repo-relative paths the operation touched. */
  paths?: string[];
  branch?: string;
  /** Ref the operation targeted (branch/tag name), when different from `branch`. */
  ref?: string;
  /** Short commit hash, for "View Commit". */
  commit?: string;
  /** Checkpoint id, for "Restore Checkpoint". */
  checkpointId?: string;
  /** Terminal to reveal, for "Focus Terminal". */
  terminalId?: string;
  /** The equivalent command, redacted — for "Copy Command". */
  command?: string;
  adds?: number;
  dels?: number;
}

/** An immutable, audit-style entry in the Activity feed. */
export interface AgentActivityItem {
  id: string;
  sessionId: string;
  type: AgentActivityType;
  label: string;
  detail?: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
  /**
   * Structured detail for `type: 'git'` entries. Rides inside the existing
   * `agent_activity.payload` JSON column, so this needs no schema migration.
   */
  git?: GitActivityPayload;
  /** Epoch ms; formatted relatively in the UI. */
  at: number;
}

/**
 * Lifecycle of a Plan Mode artifact. The transition table, the predicates and
 * the legacy normalizer all live in `src/shared/plan.ts` — this is only the
 * vocabulary.
 *
 * - `planning`         — the agent is doing read-only analysis, plan not ready yet.
 * - `waiting-approval` — plan captured, execution BLOCKED pending the user's decision.
 * - `approved`         — the approval transaction committed; the agent has not been released yet.
 * - `implementing`     — released; the agent is executing the plan.
 * - `completed`        — the implementation run that carried this plan finished successfully.
 * - `rejected`         — a human declined the plan.
 * - `archived`         — superseded, abandoned, or ended by something other than a human decision.
 * - `ready`            — @deprecated legacy name for `waiting-approval`. Normalized on read,
 *                        never written; kept in the union so pre-migration rows type-check.
 */
export type PlanStatus =
  | 'planning'
  | 'waiting-approval'
  | 'approved'
  | 'implementing'
  | 'completed'
  | 'rejected'
  | 'archived'
  | 'ready';

/**
 * Progress of the session activation pipeline — the ordered rebinding of every
 * root-bound service (watcher, git, search, memory, MCP, services, agent) that
 * a session switch triggers.
 *
 * The renderer switches optimistically and shows this as a ribbon rather than
 * gating on it: blocking the UI on a cold search index would be worse than
 * briefly-stale data. A terminal `ready`/`error` is always emitted, so the
 * ribbon cannot stick.
 */
export interface SessionActivationState {
  /** The session being activated, or null when no workspace is active. */
  sessionId: string | null;
  phase: 'idle' | 'activating' | 'ready' | 'error';
  /** Which step is running. Absent on terminal phases. */
  step?: 'workspace' | 'worktree' | 'files' | 'git' | 'search' | 'memory' | 'mcp';
  /** What triggered this activation. */
  reason: 'boot' | 'session' | 'workspace' | 'worktree';
  /** Set on `ready` when the search index is still rebuilding in the background. */
  searchIndexing?: boolean;
  /** Set on `error`. Already a message, never a raw path. */
  error?: string;
}

/**
 * How a pending plan can be released.
 *
 * - `live` — the provider run is still alive with its `ExitPlanMode` permission
 *   callback parked, so approving resolves that callback and the SAME turn
 *   continues into implementation.
 * - `detached` — there is nothing left to unblock, so approving starts a fresh
 *   run carrying the plan text. The only possible path after an app restart (a
 *   parked promise dies with the process) and the only path Cursor ever has.
 */
export type PlanApprovalPath = 'live' | 'detached';

/**
 * What the user chose at the approval gate. These map onto the choices Claude
 * Code's own plan prompt offers — notably `keep-planning`, documented as "stay
 * in plan mode and tell Claude what to change", which is a deny carrying
 * feedback rather than an interrupt.
 *
 * The transition table and predicates live in `src/shared/plan.ts`.
 */
export type PlanDecisionKind = 'approve' | 'keep-planning' | 'reject' | 'archive' | 'edit';

/** Why a plan stopped being active. `rejected` alone cannot say this. */
export type PlanEndReason =
  | 'user-rejected'
  | 'user-archived'
  | 'run-error'
  | 'run-cancelled'
  | 'superseded'
  | 'restart'
  | 'park-timeout';

/**
 * Where the plan markdown came from. Recorded because the sources differ wildly
 * in fidelity: the plan file and the tool output are authoritative, assistant
 * text is a reconstruction, and `placeholder` means we genuinely could not read it.
 */
export type PlanTextSource =
  | 'plan-file'
  | 'tool-output'
  | 'tool-input'
  | 'assistant-text'
  | 'result-text'
  | 'placeholder';

/** Best-effort planning metadata shown in the plan header. */
export interface PlanMeta {
  /** Number of files the plan expects to touch (derived from the run). */
  affectedFiles?: number;
  /** Number of checklist tasks. */
  taskCount?: number;
  /** Coarse risk estimate. */
  risk?: 'low' | 'medium' | 'high';
  /** Detected frameworks (from the workspace metadata). */
  frameworks?: string[];
  /** Why the plan left its active state. Absent while active. */
  endReason?: PlanEndReason;
  /** Provenance of {@link SessionPlan.markdown}. */
  textSource?: PlanTextSource;
  /** Checkpoint guarding the tree at approval, when one was taken. */
  checkpointId?: string;
  /** Set when the pre-implementation checkpoint could not be taken. */
  checkpointError?: string;
}

/**
 * A Plan Mode artifact: the agent's proposed implementation strategy for a
 * session. Persisted to SQLite so an unfinished plan survives an app restart.
 */
export interface SessionPlan {
  sessionId: string;
  status: PlanStatus;
  /**
   * Monotonic revision of THIS session's plan, 1-based. Bumped by every
   * transition. Every mutating plan IPC carries the rev the renderer believes
   * it is acting on, and main refuses a mismatch — so a stale window can never
   * approve a plan that has since been replaced.
   */
  rev: number;
  /** Short human title for the plan (derived from the first heading / prompt). */
  title: string;
  /** The raw plan markdown the agent produced. */
  markdown: string;
  meta: PlanMeta;
  createdAt: number;
  /** Epoch ms of the last transition. */
  updatedAt: number;
  /**
   * Whether a pending plan can be released in-turn. See `PlanApprovalPath` in
   * `src/shared/plan.ts` — this is `detached` after a restart and always
   * `detached` on Cursor.
   */
  approvalPath: PlanApprovalPath;
  /**
   * Epoch ms the CURRENT planning pass began. Distinct from `createdAt`, which
   * survives re-captures: milestone derivation needs the boundary of this pass,
   * or a regenerated plan replays the previous pass's tool calls.
   */
  runStartedAt: number;
  /** Epoch ms the plan markdown was captured. */
  capturedAt?: number;
  /** Epoch ms the user approved execution, if approved. */
  approvedAt?: number;
  /** Basename of the plan file inside Limboo's plans directory, when one exists. */
  planFile?: string;
  /** Pinned plans are preserved even after a new plan begins. */
  pinned?: boolean;
}

/**
 * A historical snapshot of a {@link SessionPlan}, captured whenever the plan is
 * regenerated or re-captured. Lets the user compare and restore across iterative
 * planning cycles. Persisted to the `plan_revisions` table.
 */
export interface PlanRevision {
  /** Stable id for this revision row. */
  id: string;
  sessionId: string;
  /** Monotonic revision number within the session (1-based). */
  rev: number;
  /** The plan status at the moment it was snapshotted. */
  status: PlanStatus;
  title: string;
  markdown: string;
  meta: PlanMeta;
  /** Why this snapshot was taken (`superseded`, `keep-planning`, `approved`, …). */
  reason?: string;
  /** Epoch ms the revision was recorded. */
  createdAt: number;
}

/** Everything the renderer needs to render a session when it (re)mounts. */
export interface AgentSessionSnapshot {
  messages: ChatMessage[];
  activity: AgentActivityItem[];
  changes: FileChange[];
  tasks: TaskItem[];
  toolCalls: AgentToolCall[];
  /** The active Plan Mode artifact for this session, if any. */
  plan?: SessionPlan | null;
}

/**
 * The structured event stream the main process pushes as the agent works.
 * The renderer applies each event to {@link AgentSessionSnapshot}-shaped state —
 * it never scrapes raw output.
 */
export type AgentEvent =
  | { kind: 'message-start'; sessionId: string; message: ChatMessage }
  | { kind: 'message-delta'; sessionId: string; messageId: string; text: string }
  | { kind: 'message-done'; sessionId: string; message: ChatMessage }
  | { kind: 'tool-start'; sessionId: string; call: AgentToolCall }
  | {
      kind: 'tool-end';
      sessionId: string;
      callId: string;
      status: ToolCallStatus;
      /** Read-tool content preview (see {@link AgentToolCall.read}). */
      read?: AgentToolCall['read'];
    }
  | { kind: 'file-change'; sessionId: string; change: FileChange }
  | { kind: 'activity'; sessionId: string; item: AgentActivityItem }
  | { kind: 'tasks'; sessionId: string; tasks: TaskItem[] }
  /**
   * The whole plan, after every transition. `seq` is a per-session monotonic
   * counter mirroring {@link RuntimePush} — the payload is complete, so a
   * receiver that spots a gap simply refetches rather than trying to replay.
   */
  | { kind: 'plan'; sessionId: string; plan: SessionPlan; seq: number }
  /** The session has no plan (cleared, reverted, or switched away from). */
  | { kind: 'plan-reset'; sessionId: string }
  | { kind: 'result'; sessionId: string; ok: boolean; text: string }
  | { kind: 'error'; sessionId: string; message: string; outcome: RequestOutcome }
  | { kind: 'request-state'; sessionId: string; request: RequestState }
  | { kind: 'diagnostic'; diagnostic: AgentDiagnostic };

/* ------------------------------------------------------------------ */
/* Runtime Telemetry                                                   */
/*                                                                     */
/* A provider-neutral platform service owned by the app — the fifth    */
/* peer of Memory / Search / Resume / Work Graph. Every metric is an   */
/* OPTIONAL capability the adapter reports. The renderer NEVER         */
/* branches on provider: it renders what the snapshot contains and     */
/* omits what is absent (the "omit what was not measured" rule that    */
/* {@link SubagentInfo} and the release document already follow).      */
/*                                                                     */
/* This is an ORTHOGONAL peer to {@link AgentEvent}: AgentEvent is the */
/* render stream and is frozen. Telemetry rides its own narrow sink    */
/* because its sources fire per API request, per delta frame and per   */
/* tool heartbeat — volume no render-bus consumer should have to       */
/* filter out forever.                                                  */
/* ------------------------------------------------------------------ */

/**
 * Where a number came from.
 *
 * `measured`  — the provider reported it (`message_start.usage`, `modelUsage`,
 *               `rate_limit_info`), or it is a measured total minus measured
 *               parts.
 * `estimated` — Limboo counted the CHARACTERS of a block it composed itself
 *               and divided by {@link TELEMETRY_LIMITS.charsPerToken}. The
 *               content is measured; the tokenization is not. Always labelled
 *               as an estimate in the UI — never presented as precision.
 */
export type MetricOrigin = 'measured' | 'estimated';

/**
 * Metric families a provider adapter may or may not report. The renderer gates
 * every section on one of these rather than on the provider id, so a third
 * adapter contributes its sections for free and hides the rest automatically.
 */
export type RuntimeCapabilityKey =
  /** Live prompt size plus a provider-supplied context window. */
  | 'contextWindow'
  /** Cumulative input/output/cache token counts for the run. */
  | 'tokenUsage'
  /** A CLIENT-SIDE cost estimate. Never billing data. */
  | 'costEstimate'
  /** Short rolling request window (Claude: `five_hour`). */
  | 'requestQuota'
  /** Long rolling windows (Claude: `seven_day*`). */
  | 'quotaWindows'
  /** Time-to-first-token and generation speed. */
  | 'latency'
  /** Context-compaction boundary events. */
  | 'compaction'
  /** Per-tool elapsed-time heartbeats. */
  | 'toolProgress'
  /** Extended-thinking token estimates. */
  | 'thinkingTokens'
  /** API retry attempts. */
  | 'retries';

export type RuntimeCapabilities = Record<RuntimeCapabilityKey, boolean>;

/** One contributor to the composed context window. */
export type ContextSegmentId =
  /** MEASURED RESIDUAL: provider preset + tool schemas + everything unattributed. */
  | 'system'
  /** User + assistant turns Limboo persisted for this session. */
  | 'conversation'
  /** Built-in tool_result payloads Limboo observed. */
  | 'tools'
  /** MCP tool_result payloads (`mcp__*` calls). */
  | 'mcp'
  /** The `<project-memory>` block Limboo injected. */
  | 'memory'
  /** The `<project-context>` block Limboo injected. */
  | 'search'
  /** The `<repository-delta>` block Limboo injected. */
  | 'resume'
  /** The per-turn `<attachments>` manifest. */
  | 'attachments'
  /** `maxOutputTokens` held back for the reply (measured). */
  | 'reserved';

export interface ContextSegment {
  id: ContextSegmentId;
  tokens: number;
  origin: MetricOrigin;
  /** For `estimated` segments: the exact character count Limboo measured. */
  chars?: number;
}

/** Live context-window accounting for a session. */
export interface RuntimeContext {
  /**
   * Prompt tokens for the most recent API request — the live, MEASURED
   * "context consumed" number. Sum of `input_tokens`,
   * `cache_read_input_tokens` and `cache_creation_input_tokens` from
   * `message_start.usage`, deduplicated by `message.id` (parallel tool calls
   * emit several assistant messages sharing one id, which Anthropic documents
   * and which would otherwise multiply this number).
   */
  usedTokens: number;
  /**
   * The provider's own context budget for the active model
   * (`modelUsage[model].contextWindow`). ABSENT until at least one run has
   * completed for that model — there is deliberately no hardcoded model table
   * and none may be added. While absent the ring renders INDETERMINATE, never
   * 0%: "not measured yet" must not look like "empty context".
   */
  windowTokens?: number;
  /** `modelUsage[model].maxOutputTokens` — the completion reservation. */
  reservedTokens?: number;
  remainingTokens?: number;
  pctUsed?: number;
  /**
   * Auto-compaction threshold, OBSERVED rather than assumed: the `pre_tokens`
   * of the first `compact_boundary` with `trigger: 'auto'` seen for this model.
   * The SDK reports no threshold, so this stays absent until it happens.
   */
  autoCompactTokens?: number;
  /** Per-contributor attribution. Empty when {@link attributionDegraded}. */
  segments: ContextSegment[];
  /**
   * True when the estimated segments summed ABOVE the measured total (cache
   * reads, a compaction, or a resumed transcript Limboo never saw). The UI then
   * drops the split and renders a single measured bar plus a note. This is the
   * fail-honest path: a split scaled to fit would be a fabrication.
   */
  attributionDegraded?: boolean;
  /** Limboo's OWN retrieval budgets — fully measured, Limboo-owned numbers. */
  retrieval?: {
    memoryChars: number;
    memoryBudgetChars: number;
    searchChars: number;
    searchBudgetChars: number;
  };
  /** Median prompt growth per API request. Requires >= 3 samples. */
  tokensPerTurn?: number;
  /** `remaining / tokensPerTurn`. Absent when growth is <= 0 (a compaction). */
  predictedTurnsRemaining?: number;
  compactions?: {
    count: number;
    lastTrigger: 'manual' | 'auto';
    lastPreTokens: number;
    lastPostTokens?: number;
    at: number;
  };
  at: number;
}

/** One rolling quota window, as the provider reported it. */
export interface RuntimeQuotaWindow {
  /** The provider's own identifier, verbatim (`five_hour`, `seven_day_opus`…). */
  kind: string;
  status: 'allowed' | 'allowed_warning' | 'rejected';
  /** 0–1 as reported. Absent when the provider omitted it. */
  utilization?: number;
  resetsAt?: number;
  isUsingOverage?: boolean;
  surpassedThreshold?: number;
  errorCode?: string;
  at: number;
}

/** Per-run measurements. */
export interface RuntimeRun {
  runId: string;
  model: string;
  /** Inline union rather than an import: `types.ts` deliberately has no imports. */
  provider: 'anthropic' | 'cursor';
  /** Composer mode captured AT RUN START, never read from current settings. */
  mode: SessionPermissionMode;
  startedAt: number;
  durationMs?: number;
  durationApiMs?: number;
  ttftMs?: number;
  numTurns?: number;
  tokens?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    /**
     * TRUE when these came from `modelUsage` (which INCLUDES subagent
     * requests); false when from `usage` (which EXCLUDES them). The two are
     * never mixed into one field — Anthropic documents that `usage`
     * undercounts as soon as nesting occurs.
     */
    includesSubagents: boolean;
  };
  /**
   * CLIENT-SIDE ESTIMATE from the SDK's bundled price table — NOT billing data
   * (Anthropic's own docs say so explicitly). The field name carries the
   * disclaimer so no renderer can quietly label it "Cost".
   */
  costEstimateUsd?: number;
  /** Output tokens/sec, measured live off the MAIN stream's `message_delta`. */
  tokensPerSecond?: number;
  /** The SDK's own word for this figure is "estimated". Labelled as such. */
  thinkingTokensEstimate?: number;
  retries?: { attempt: number; maxRetries: number; lastStatus: number | null; at: number };
  providerStatus?: 'compacting' | 'requesting';
  permissionDenials?: number;
  apiErrorStatus?: number;
}

/** A tool the provider is currently reporting progress for. */
export interface RuntimeToolActivity {
  callId: string;
  /** Tool NAME only, capped. Never its input. */
  name: string;
  elapsedSeconds: number;
  /** Present only for a subagent's own tool (SDK `parent_tool_use_id`). */
  parentCallId?: string;
}

/** Limboo-owned environment facts. Every field traces to a Limboo manager. */
export interface RuntimeEnvironment {
  /** The `agent_provider_sessions` row for the active provider. */
  providerSessionId?: string;
  /** WorktreeManager. `path` is RELATIVE to the workspace root, never absolute. */
  worktree?: { branch: string; path: string };
  /** AttachmentManager — count only. */
  attachmentCount?: number;
  /** McpManager — connected / total. */
  mcp?: { connected: number; total: number };
  /** SearchManager index status. */
  index?: { indexed: boolean; files: number };
  /** Memories / search hits injected into the last prompt (counts only). */
  memoryInjected?: number;
  searchInjected?: number;
}

/**
 * The normalized, capability-gated runtime snapshot. Provider-neutral by
 * construction: the renderer reads {@link capabilities} and {@link notes} and
 * never the provider id, so a section hides itself when the running adapter
 * cannot measure it — with no conditional renderer logic per provider.
 */
export interface RuntimeSnapshot {
  sessionId: string;
  provider: 'anthropic' | 'cursor';
  capabilities: RuntimeCapabilities;
  /**
   * Main-supplied "why not" copy for each false capability, so the renderer can
   * EXPLAIN a missing metric without knowing which provider is running.
   */
  notes?: Partial<Record<RuntimeCapabilityKey, string>>;
  /** True while a run is live — drives the ring's animation. */
  live: boolean;
  context?: RuntimeContext;
  quota?: RuntimeQuotaWindow[];
  run?: RuntimeRun;
  tools?: RuntimeToolActivity[];
  environment?: RuntimeEnvironment;
  /**
   * Ingestion health — the same honesty valve as {@link WorkGraphHealth}. Every
   * capture path swallows its failures so telemetry can never break a run,
   * which is exactly why a stream that stopped recording must be visible here
   * rather than looking like a quiet session.
   */
  health?: { failures: number; lastError?: string };
  at: number;
}

/** One persisted quota-trend point. */
export interface RuntimeUsagePoint {
  at: number;
  utilization: number;
  status: 'allowed' | 'allowed_warning' | 'rejected';
}

export interface RuntimeUsageHistory {
  windowKind: string;
  points: RuntimeUsagePoint[];
  /** True when persistence is disabled by policy — the UI says so in words. */
  disabled: boolean;
}

/** Renderer-facing push. Mirrors {@link WorkGraphPush}'s seq + reset valve. */
export type RuntimePush =
  | { kind: 'snapshot'; sessionId: string; seq: number; snapshot: RuntimeSnapshot }
  | { kind: 'reset'; sessionId: string | null };

export type RuntimeExportFormat = 'json' | 'csv';

/* ------------------------------------------------------------------ */
/* Provider-Neutral Hook Engine                                        */
/*                                                                     */
/* A normalized lifecycle taxonomy that both provider adapters (Claude */
/* SDK, Cursor CLI) emit into one governance bus. This is an ORTHOGONAL */
/* peer to {@link AgentEvent} — AgentEvent drives the renderer render   */
/* stream; HookEvent drives the audit/governance stream. The engine    */
/* holds no policy: gate decisions delegate to AgentManager's           */
/* provider-neutral permission core. See docs / CLAUDE.md §8.           */
/* ------------------------------------------------------------------ */

/**
 * A normalized agent-lifecycle phase — a superset of Claude Code's ~31 hook
 * events and Cursor's 6, mapped to one vocabulary so both providers produce an
 * identical audit trail. Gate phases carry a decision; observe phases fan-out
 * only.
 */
export type HookPhase =
  // Blocking gate phases (a dispatch returns a decision):
  | 'pre-tool-use' // Claude PreToolUse / Cursor preToolUse+beforeShell+beforeRead+beforeMCP
  | 'permission-request' // an interactive human approval is about to be requested
  // Observe / notify phases (fan-out only, no decision):
  | 'session-start'
  | 'session-end'
  | 'prompt-submit'
  | 'post-tool-use'
  | 'file-edit' // Cursor afterFileEdit / a workspace FS mutation
  | 'shell-exec' // a command mirrored to the integrated terminal
  | 'mcp-exec'
  | 'checkpoint'
  | 'run-finished' // Claude Stop / Cursor stop
  | 'subagent-start' // Claude-only (Cursor CLI print mode has no subagents)
  | 'subagent-stop';

/** The subset of {@link HookPhase} that block and resolve to a decision. */
export type HookGatePhase = Extract<HookPhase, 'pre-tool-use' | 'permission-request'>;

/**
 * One normalized lifecycle event on the governance bus. Every string field is
 * REDACTED and length-bounded in the main process before it is persisted to the
 * `hook_audit` table or broadcast to the renderer — raw tool input (which may
 * carry secrets or `.env` contents) never reaches this shape unsanitized.
 */
export interface HookEvent {
  id: string;
  phase: HookPhase;
  sessionId: string;
  /** Which provider produced the run this event belongs to. */
  provider: 'anthropic' | 'cursor';
  /** Epoch ms. */
  at: number;
  /** Neutral tool identity for tool phases (Claude-shaped, e.g. `Bash`). */
  tool?: string;
  /** Redacted, bounded one-line summary (clamped to ACTIVITY_LIMITS.labelMax). */
  summary?: string;
  /** Redacted, bounded detail (clamped to ACTIVITY_LIMITS.detailMax). */
  detail?: string;
  severity?: DiagnosticSeverity;
  /** Set for gate phases — the decision the policy core returned. */
  decision?: 'allow' | 'deny' | 'ask';
  /** True when a gate resolved without prompting a human (auto/remembered). */
  auto?: boolean;
}

/**
 * The normalized result a blocking {@link HookGatePhase} dispatch returns. The
 * engine adapts the SDK's `PermissionResult` to/from this shape at the boundary;
 * the Cursor-wire `HookDecision` (bridge/pipeServer) stays separate.
 */
export interface HookDecisionResult {
  decision: 'allow' | 'deny' | 'ask';
  reason?: string;
  updatedInput?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Work Graph — the Directed Acyclic Work Graph (DAWG)                 */
/*                                                                     */
/* Limboo's own STRUCTURAL record of engineering work, and the third    */
/* peer of {@link AgentEvent} (the render stream) and {@link HookEvent} */
/* (the governance stream). Neither Claude nor Cursor exposes a work    */
/* graph — both are conversation-driven — but both emit enough          */
/* structure (tool calls, plans, file edits, shell runs, MCP calls,     */
/* results) for the host to derive one. So the graph is owned entirely  */
/* by Limboo and is provider-neutral by construction: every adapter,    */
/* present and future, contributes nodes through the SAME normalized    */
/* event layer. See docs/architecture/subsystems/work-graph.md.         */
/* ------------------------------------------------------------------ */

/**
 * What one vertex of the work graph represents. Every kind carries its own
 * typed {@link WorkGraphNode.meta}, which is what makes the graph QUERYABLE
 * without replaying a conversation.
 *
 * Note there is deliberately no `dependency` kind — a dependency is the
 * `depends-on` EDGE. No provider exposes a dependency object, so a node for it
 * would be a vertex with no data of its own.
 */
export type WorkGraphNodeKind =
  | 'objective' // the user request that opened a run (the run root)
  | 'planning' // a SessionPlan artifact reached `ready`
  | 'task' // one TodoWrite checklist item
  | 'subagent' // a Claude `Task` tool call — the lane-forking node
  | 'investigation' // a read-risk tool call (Read/Glob/Grep/WebFetch/…)
  | 'search' // a limboo_search MCP tool call
  | 'memory' // a memory retrieval / write
  | 'mcp' // any other `mcp__*` tool call
  | 'terminal' // a command execution (agent Bash, user PTY, service, script)
  | 'git' // commit / checkpoint / branch / tag / checkout / push / pull
  | 'file' // a workspace file mutation
  | 'approval' // a permission gate, or a plan approve/reject
  | 'artifact' // a plan doc, a diff, an attachment, a commit object
  | 'completion' // the run's terminal result
  | 'service'; // a supervised service transition

/**
 * How two nodes relate. `follows`/`contains` are the STRUCTURAL SPINE — the only
 * edges the lane layouter walks, and the reason the graph reads like a git
 * history. Everything else is a semantic overlay drawn on demand.
 */
export type WorkGraphEdgeKind =
  // Structural spine:
  | 'follows'
  | 'contains' // subagent → its children; objective → its run body
  // Semantic overlay (the engineering vocabulary):
  | 'generated'
  | 'depends-on'
  | 'implemented-in'
  | 'verified-by'
  | 'blocked-by'
  | 'reviewed-by'
  | 'produced-artifact';

/** Lifecycle of one graph node. Mirrors {@link ToolCallStatus} where relevant. */
export type WorkGraphNodeStatus = 'running' | 'done' | 'error' | 'denied' | 'skipped';

/**
 * The bidirectional-navigation join key: what existing entity this node stands
 * for. Persisted as two indexed columns (`ref_kind` / `ref_id`) so "reveal the
 * node for this commit" is an index lookup, not a scan. Selecting a node
 * navigates to the referenced surface; the referenced surface can reveal the
 * node.
 */
export type WorkGraphRef =
  | { kind: 'message'; id: string } // ChatMessage.id
  | { kind: 'tool'; id: string } // AgentToolCall.id
  | { kind: 'commit'; id: string } // git commit hash
  | { kind: 'checkpoint'; id: string } // git_checkpoints.id
  | { kind: 'terminal'; id: string } // TerminalSession.id
  | { kind: 'memory'; id: string } // memories.id
  | { kind: 'file'; id: string } // workspace-relative path
  | { kind: 'mcp'; id: string } // MCP server name
  | { kind: 'plan'; id: string } // sessionId (agent_plans is 1:1)
  | { kind: 'service'; id: string } // service name
  | { kind: 'worktree'; id: string } // worktree branch name
  | { kind: 'attachment'; id: string }; // attachment file name

/**
 * One edge. `derived` is the honesty valve: `follows`/`contains`/`generated`/
 * `reviewed-by`/`produced-artifact`/`implemented-in` are read straight off a
 * provider event (exact), while `verified-by` and the sequential `depends-on`
 * are INFERRED. Derived edges render dashed and are independently filterable,
 * so a heuristic can never masquerade as a fact.
 */
export interface WorkGraphEdge {
  id: string;
  sessionId: string;
  /** Source node id. */
  src: string;
  /** Destination node id. */
  dst: string;
  kind: WorkGraphEdgeKind;
  /** True when inferred by a heuristic rather than read from an event. */
  derived: boolean;
  /** Epoch ms. */
  createdAt: number;
}

/** Fields every node carries, regardless of kind. */
export interface WorkGraphNodeBase {
  id: string;
  sessionId: string;
  workspaceId: string | null;
  /** The `objective` node id this belongs to (a run root refers to itself). */
  runId: string;
  kind: WorkGraphNodeKind;
  /** Which adapter produced it; `limboo` = app-originated (git, services, FS). */
  provider: 'anthropic' | 'cursor' | 'limboo';
  status: WorkGraphNodeStatus;
  /** Redacted, clamped to GRAPH_LIMITS.titleMax. */
  title: string;
  /** Redacted, clamped to GRAPH_LIMITS.detailMax. */
  detail?: string;
  ref?: WorkGraphRef;
  /** Epoch ms. */
  startedAt: number;
  endedAt?: number;
  /**
   * Monotonic per-session insertion counter. The layouter sorts by
   * `(startedAt, seq)`, so this is what makes node order TOTAL and stable
   * across reloads even when two events share a millisecond.
   */
  seq: number;
}

/**
 * A typed vertex of the work graph. The `meta` discriminant is the whole point:
 * because every node kind carries its own structured payload, the graph answers
 * questions ("every task blocked by authentication", "commits created after a
 * failed command") by traversal rather than by re-reading a transcript.
 */
export type WorkGraphNode =
  | (WorkGraphNodeBase & {
      kind: 'objective';
      meta: {
        prompt: string;
        mode: SessionPermissionMode;
        model: string;
        attachmentCount: number;
      };
    })
  | (WorkGraphNodeBase & {
      kind: 'planning';
      meta: {
        planTitle: string;
        taskCount: number;
        affectedFiles?: number;
        risk?: 'low' | 'medium' | 'high';
        planStatus: PlanStatus;
      };
    })
  | (WorkGraphNodeBase & {
      kind: 'task';
      meta: { label: string; taskStatus: TaskStatus; index: number };
    })
  | (WorkGraphNodeBase & {
      kind: 'subagent';
      meta: {
        toolName: string;
        childCount: number;
        /** The worker's definition name (`subagent_type`), when reported. */
        subagentType?: string;
        /** Wall-clock time the worker ran, filled in on `tool-end`. */
        durationMs?: number;
      };
    })
  | (WorkGraphNodeBase & {
      kind: 'investigation';
      meta: { tool: string; target?: string; resultChars?: number };
    })
  | (WorkGraphNodeBase & {
      kind: 'search';
      meta: { tool: string; query?: string; hitCount?: number; durationMs?: number };
    })
  | (WorkGraphNodeBase & {
      kind: 'memory';
      meta: {
        op: 'retrieve' | 'create' | 'accept' | 'use';
        memoryIds: string[];
        tiers: MemoryTier[];
        scores?: number[];
      };
    })
  | (WorkGraphNodeBase & {
      kind: 'mcp';
      meta: {
        server: string;
        tool: string;
        /** True for Limboo's own in-process servers (limboo_memory/limboo_search). */
        internal: boolean;
        params?: string;
        durationMs?: number;
      };
    })
  | (WorkGraphNodeBase & {
      kind: 'terminal';
      meta: {
        command: string;
        origin: TerminalOrigin;
        terminalId?: string;
        /**
         * Real PTY exit code. UNDEFINED for agent commands — the Agent SDK does
         * not stream tool stdout, so an agent Bash call resolves to done/error
         * only. Never synthesize a 0 here.
         */
        exitCode?: number;
        durationMs?: number;
        approval?: { decision: 'allow' | 'deny'; auto: boolean };
      };
    })
  | (WorkGraphNodeBase & {
      kind: 'git';
      meta: {
        op:
          | 'commit'
          | 'checkpoint'
          | 'checkpoint-deleted'
          | 'branch'
          | 'tag'
          | 'checkout'
          | 'push'
          | 'pull'
          | 'fetch'
          | 'init'
          | 'restore'
          | 'worktree-created'
          | 'worktree-removed';
        hash?: string;
        branch?: string;
        checkpointId?: string;
        /** Remote name for push/pull/fetch; never a URL (URLs carry credentials). */
        remote?: string;
        files: FileChange[];
        adds: number;
        dels: number;
      };
    })
  | (WorkGraphNodeBase & {
      kind: 'file';
      meta: { change: FileChange; tool?: string; hasPreview: boolean };
    })
  | (WorkGraphNodeBase & {
      kind: 'approval';
      meta: {
        subject: 'tool' | 'plan';
        tool?: string;
        risk?: ToolRisk;
        decision: 'allow' | 'deny' | 'ask';
        /** True when resolved without prompting a human (auto / remembered). */
        auto: boolean;
      };
    })
  | (WorkGraphNodeBase & {
      kind: 'artifact';
      meta: {
        artifactKind: 'plan' | 'diff' | 'attachment' | 'commit' | 'doc' | 'binary';
        path?: string;
        bytes?: number;
        mime?: string;
        /** Files covered, for a `diff` artifact (a resume delta). */
        fileCount?: number;
      };
    })
  | (WorkGraphNodeBase & {
      kind: 'completion';
      meta: {
        ok: boolean;
        outcome?: RequestOutcome;
        durationMs: number;
        toolCount: number;
        fileCount: number;
      };
    })
  | (WorkGraphNodeBase & {
      kind: 'service';
      meta: { name: string; state: ServiceStatus; port?: number; url?: string };
    });

/**
 * Export formats the MAIN process renders from the stored graph. Pure data
 * transforms, so they are always complete — unlike the two image formats, which
 * can only be produced from the canvas the renderer drew.
 */
export type GraphExportFormat =
  | 'json'
  | 'md'
  | 'mermaid'
  | 'dot'
  | 'csv'
  | 'html'
  /** One JSON object per line — the form you stream and `grep`. */
  | 'ndjson'
  /** GraphML, for Gephi / yEd / Cytoscape. */
  | 'graphml'
  /** PlantUML, for toolchains that render `.puml` but not Mermaid. */
  | 'puml';

/** Every format the export UI offers, including the renderer-drawn images. */
export type GraphExportTarget = GraphExportFormat | 'svg' | 'png';

/**
 * How much of the graph an export covers.
 *
 * `selection` reuses the existing bounded, depth-capped traversal rather than
 * introducing a second walk — "export what I am looking at" is the same query
 * the panel already runs to focus a node.
 */
export type GraphExportScope = 'session' | 'selection';

/**
 * Per-run rollup for the Work Graph's statistics view. Joined to
 * {@link RuntimeRun} by `runId`, which is why the two subsystems agree without
 * either one reaching into the other's storage.
 */
export interface GraphRunStat {
  runId: string;
  title: string;
  startedAt: number;
  nodes: number;
  edges: number;
  tools: number;
  errors: number;
  durationMs?: number;
  /** From Runtime Telemetry when available; omitted when never measured. */
  tokens?: number;
  /** CLIENT-SIDE estimate (see {@link RuntimeRun.costEstimateUsd}). */
  costEstimateUsd?: number;
  peakContextTokens?: number;
}

/**
 * Recording health, surfaced in the panel.
 *
 * Every error path in the graph subsystem is a swallowed log line — which is
 * correct (the graph must never break a run) but left a graph that had silently
 * stopped recording indistinguishable from a quiet session. This is the honest
 * signal: the panel says so instead of implying an empty graph means no work.
 */
export interface WorkGraphHealth {
  /** Consecutive persist failures. 0 = healthy. */
  failures: number;
  /** Last persist error message, redacted and clamped. */
  lastError?: string;
  /** Edges dropped because an endpoint no longer exists (ring-pruned). */
  droppedEdges: number;
}

/** A session's whole persisted graph, used to hydrate the panel on mount. */
export interface WorkGraphSnapshot {
  sessionId: string;
  nodes: WorkGraphNode[];
  edges: WorkGraphEdge[];
  /** The delta sequence this snapshot is current as of. */
  seq: number;
  /**
   * True when this is not the whole history: either the read window cut rows,
   * or the retention ring already deleted the start of the session. The panel
   * surfaces it so a trimmed graph never reads as a complete one.
   */
  truncated: boolean;
  /** Recording health at snapshot time; absent means healthy. */
  health?: WorkGraphHealth;
}

/**
 * The renderer-facing push. `nodes` in a delta are UPSERTS — a node is small, so
 * re-sending it on completion is cheaper than a patch protocol and removes a
 * whole class of merge bugs. `seq` is monotonic per session; on observing a gap
 * the renderer refetches via `graph:get` instead of rendering a torn graph.
 */
export type WorkGraphPush =
  | {
      kind: 'delta';
      sessionId: string;
      seq: number;
      nodes: WorkGraphNode[];
      edges: WorkGraphEdge[];
      /** Node ids the retention ring deleted; the renderer drops them. */
      removed?: string[];
      /** Present only when unhealthy, so a healthy push costs nothing. */
      health?: WorkGraphHealth;
    }
  | { kind: 'reset'; sessionId: string | null; health?: WorkGraphHealth };

/**
 * A structural traversal request. Answered as an FTS seed set (the text
 * predicate) followed by a BOUNDED recursive closure over the edge table —
 * neither alone answers the product's questions. `depth` and `limit` are
 * clamped in the main process: an unbounded `WITH RECURSIVE` over a large graph
 * would be a renderer-triggerable main-process hang.
 */
export interface WorkGraphQuery {
  /** Free text matched against node title+detail via FTS5 BM25. */
  text?: string;
  /** Restrict the seed set to these node kinds. */
  kinds?: WorkGraphNodeKind[];
  /** Restrict traversal to these edge kinds. */
  edgeKinds?: WorkGraphEdgeKind[];
  /**
   * Restrict the seed set to these statuses. Without it "failed commands" was
   * unexpressible — the canned query of that name could only filter to terminal
   * nodes and then return the successful ones too.
   */
  statuses?: WorkGraphNodeStatus[];
  /** Seed only nodes started at or after this epoch ms. */
  since?: number;
  /** Seed only nodes started at or before this epoch ms. */
  until?: number;
  /** Walk toward descendants (`down`) or ancestors (`up`). */
  direction: 'up' | 'down';
  /** Start the traversal from one node instead of an FTS seed set. */
  fromNodeId?: string;
  /** Include heuristic edges (verified-by, sequential depends-on). */
  includeDerived: boolean;
  depth: number;
  limit: number;
}

/** The result of a {@link WorkGraphQuery} — a subgraph, not a flat list. */
export interface WorkGraphQueryResult {
  nodes: WorkGraphNode[];
  edges: WorkGraphEdge[];
  /** Node ids that matched the seed predicate directly (vs. reached by walking). */
  seeds: string[];
  /** True when `limit` or `depth` cut the traversal short. */
  truncated: boolean;
}

/* ------------------------------------------------------------------ */
/* Voice subsystem — local STT/TTS as a modality of the agent session  */
/* ------------------------------------------------------------------ */

/** Registry ids of the downloadable local speech models. */
export type VoiceModelId = 'kokoro-en-v0_19' | 'parakeet-tdt-0.6b-v2-int8' | 'silero-vad';

/** What a speech model does. */
export type VoiceModelKind = 'tts' | 'stt' | 'vad';

/** Install/download lifecycle of one local speech model. */
export type VoiceModelPhase =
  | 'not-installed'
  | 'downloading'
  | 'paused'
  | 'verifying'
  | 'extracting'
  | 'installed'
  | 'error';

/**
 * Live state of one downloadable speech model, pushed to the renderer while a
 * download/verify/extract is in flight and after install-state changes.
 */
export interface VoiceModelState {
  id: VoiceModelId;
  kind: VoiceModelKind;
  label: string;
  description: string;
  phase: VoiceModelPhase;
  /** Total archive size in bytes (registry estimate until headers arrive). */
  totalBytes: number;
  /** Bytes received so far (downloading / paused). */
  receivedBytes?: number;
  /** Overall progress 0–100 (download 0–95, verify 95–98, extract 98–100). */
  percent?: number;
  /** Current transfer speed (bytes/sec, smoothed). */
  bytesPerSec?: number;
  /** Estimated seconds remaining for the download. */
  etaSec?: number;
  /** Epoch ms the model finished installing. */
  installedAt?: number;
  /** Size on disk of the installed model. */
  installedBytes?: number;
  /** Pinned registry revision installed (for auto-update checks). */
  rev?: number;
  /** A newer pinned revision is available. */
  updateAvailable?: boolean;
  /** Human-readable failure (phase === 'error'). */
  error?: string;
}

/** Runtime phase of the voice orchestrator. */
export type VoicePhase =
  | 'idle' // nothing active
  | 'unavailable' // required models missing or the speech worker failed
  | 'starting' // worker fork / model warm-up in flight
  | 'listening' // mic open, waiting for speech (VAD auto mode)
  | 'recording' // speech in progress (or toggle/PTT active)
  | 'transcribing' // utterance ended, STT running
  | 'speaking'; // TTS playback in flight

/** The voice runtime state, broadcast to the renderer on every transition. */
export interface VoiceState {
  phase: VoicePhase;
  /** Session the capture / playback is bound to, or null when idle. */
  sessionId: string | null;
  /** Which required models are installed and loadable. */
  modelsReady: { stt: boolean; tts: boolean; vad: boolean };
  /** Human-readable failure detail (phase === 'unavailable'). */
  error?: string;
}

/** A finished utterance transcript, pushed just before it goes to the agent. */
export interface VoiceTranscript {
  sessionId: string;
  text: string;
  /**
   * Whether this is the final transcript for the utterance. Offline models
   * always emit final=true; the field future-proofs streaming STT.
   */
  final: boolean;
  /** Length of the recognized audio (ms). */
  durationMs: number;
}

/** One synthesized PCM chunk pushed to the renderer for Web Audio playback. */
export interface VoiceTtsChunk {
  /** Groups the chunks of one spoken sentence/utterance. */
  utteranceId: string;
  sessionId: string;
  /** Sample rate of the PCM (24000 for Kokoro). */
  sampleRate: number;
  /** Mono Int16 PCM samples. */
  pcm: ArrayBuffer;
  /** Chunk ordinal within the utterance. */
  seq: number;
  /** True on the final chunk of the utterance. */
  last: boolean;
}

/* ------------------------------------------------------------------ */
/* Commands (palette + shortcuts + native menu)                        */
/* ------------------------------------------------------------------ */

/**
 * A stable identifier for a command that the renderer can run. These are
 * dispatched from the command palette, keyboard shortcuts, and native
 * menu/tray items (via the `command:invoke` event).
 */
export type CommandId =
  | 'session.new'
  | 'session.newInWorktree'
  | 'session.duplicate'
  | 'session.nextTab'
  | 'session.prevTab'
  | 'document.close'
  | 'document.reopenClosed'
  | 'document.next'
  | 'document.prev'
  | 'updates.releaseNotes'
  | 'updates.releaseHistory'
  | 'updates.copyRelease'
  | 'updates.exportRelease'
  | 'diff.toggleSplit'
  | 'drawer.toggleFiles'
  | 'drawer.toggleChanges'
  | 'drawer.toggleTasks'
  | 'sidebar.toggle'
  | 'palette.open'
  | 'search.open'
  | 'settings.open'
  | 'view.reload'
  | 'workspace.open'
  | 'workspace.new'
  | 'workspace.switch'
  | 'workspace.reindex'
  | 'agent.stop'
  | 'agent.newSession'
  | 'agent.planMode'
  | 'agent.implementMode'
  | 'plan.approve'
  | 'plan.keepPlanning'
  | 'plan.reject'
  | 'plan.archive'
  | 'terminal.toggle'
  | 'terminal.new'
  | 'worktree.prune'
  | 'voice.toggle';
