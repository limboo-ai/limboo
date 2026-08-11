/**
 * Drives a run through Vercel AI SDK 7's `HarnessAgent`.
 *
 * The structural twin of `CursorRuntime`: same `start(spec, bridge)` shape,
 * same "the runtime only translates; AgentManager owns everything else"
 * contract. That is what lets `runOnce` dispatch to either without anything
 * downstream — events, persistence, plan artifacts, the Work Graph, Runtime
 * Telemetry, the permission dialogs — knowing which one ran.
 *
 * Three couplings are deliberately narrow, because these packages are
 * experimental and exact-pinned: the option shapes live in `types.ts`, the
 * wire translation lives in `translate.ts`, and the module loading lives in
 * `index.ts`. Nothing else in the app imports the AI SDK.
 */
import { AGENT_LIMITS } from '@shared/constants';
import type { SessionPermissionMode } from '@shared/types';
import type { EffectiveSandbox } from '../sandbox/policy';
import type { ProviderRunBridge } from '../agent/providerBridge';
import { loadHarness } from './index';
import {
  resolveApproval,
  type HarnessApprovalContinuation,
  type HarnessApprovalDeps,
} from './approval';
import {
  assertBootstrapConsent,
  assertBootstrapPossible,
  readBootstrapPlan,
} from './bootstrap';
import { HarnessUngatedError } from './errors';
import { harnessPermissionMode } from './permissions';
import { newTranslateContext, translatePart, type HarnessApprovalRequest } from './translate';
import type { HarnessAdapterFlags, HarnessSession, HarnessToolApproval } from './types';

/**
 * Ceiling on suspend/continue rounds in one run. Not a policy — `stopWhen`
 * bounds the real work — just a stop against an adapter that keeps asking.
 */
const MAX_APPROVAL_ROUNDS = AGENT_LIMITS.maxApprovalRounds;

/** Everything one harness run needs, resolved up front. */
export interface HarnessRunSpec {
  sessionId: string;
  harnessId: string;
  /** Prompt text (already composed; context rides `instructions`). */
  prompt: string;
  /** The session's effective execution root. */
  cwd: string;
  mode: SessionPermissionMode;
  model: string;
  maxTurns: number;
  /** Memory + Search + Resume blocks, joined — the `systemPrompt.append` twin. */
  instructions?: string;
  /** Omit web tools when `settings.agent.webSearch` is off. */
  inactiveTools?: string[];
  /** Vision blocks, when the turn carries images. */
  messages?: unknown;
  /**
   * Native-format MCP server definitions. Limboo's own `limboo_memory` /
   * `limboo_search` are served by the SAME plain tools and the SAME stdio
   * bridge Cursor uses, so both agents query one index and better-sqlite3 stays
   * in a single process.
   */
  mcpServers?: Record<string, unknown>;
  /** Human label, for the refusal message when the adapter cannot be gated. */
  harnessLabel?: string;
  /**
   * Fingerprint of the bootstrap commands the user has approved. Must match the
   * adapter's current plan or the run is refused — see `bootstrap.ts`.
   */
  bootstrapAck?: string;
  /**
   * The custom/host-tool router. Built-in tools are gated by `permissionMode`
   * instead; this map is only consulted for tools Limboo supplies itself.
   */
  toolApproval?: HarnessToolApproval;
  /** How a permission request is answered — the delegation into Layer 1. */
  approval: HarnessApprovalDeps;
  sandbox: EffectiveSandbox;
  /** Prior session token for a multi-turn conversation. */
  resumeFrom?: unknown;
  /** `basename(worktree)` — see LocalWorktreeSandbox's working-directory note. */
  workDir: string;
  debug?: boolean;
  abort: AbortController;
}

export interface HarnessRunOutcome {
  /** Provider session id captured from the stream, for resume storage. */
  sessionToken?: string;
  result?: { ok: boolean; text: string };
}

export interface HarnessRunHandle {
  close(): void;
  done: Promise<HarnessRunOutcome>;
}

export class HarnessRuntime {
  private readonly live = new Set<HarnessSession>();

  constructor(private readonly sandboxProvider: unknown) {}

  async start(spec: HarnessRunSpec, bridge: ProviderRunBridge): Promise<HarnessRunHandle> {
    const { HarnessAgent, adapter, createAdapter, stepCountIs } = await loadHarness(spec.harnessId);

    bridge.onSandboxStatus?.('preparing', 'Preparing isolated execution environment…');

    // `model` and `maxTurns` are ADAPTER-level settings: they configure the
    // underlying CLI, not the agent loop, so they only take effect through the
    // factory. Passing them to the HarnessAgent constructor instead would let
    // the CLI quietly fall back to its own default model — a run on a model the
    // user did not select. `stopWhen` still bounds the loop on top.
    const harness = createAdapter
      ? createAdapter({
          model: spec.model,
          maxTurns: spec.maxTurns,
          ...(spec.mcpServers ? { mcpServers: spec.mcpServers } : {}),
        })
      : adapter;
    if (!createAdapter) {
      bridge.diag(
        'lifecycle',
        'warning',
        'Harness adapter exposes no factory — the model could not be pinned',
        `harness ${spec.harnessId}`,
      );
    }

    // Built-in tool keys belong to the ADAPTER, and `validateToolNames` throws
    // `NoSuchToolError` at construction on any it does not recognise — so an
    // unrecognised name here crashes the run before its first turn instead of
    // just failing to filter. Validate against the adapter's own key set and
    // drop the rest, so a stale name degrades to "not filtered" and says so.
    const flags = harness as HarnessAdapterFlags;
    const builtinKeys = flags.builtinTools ? Object.keys(flags.builtinTools) : null;
    let inactiveTools = spec.inactiveTools;
    if (inactiveTools && builtinKeys) {
      const known = new Set(builtinKeys);
      const dropped = inactiveTools.filter((t) => !known.has(t));
      if (dropped.length > 0) {
        inactiveTools = inactiveTools.filter((t) => known.has(t));
        bridge.diag(
          'lifecycle',
          'warning',
          'Ignored unknown built-in tool names',
          `${dropped.join(', ')} — not exposed by ${spec.harnessId}; those tools stay enabled.`,
        );
      }
      if (inactiveTools.length === 0) inactiveTools = undefined;
    }

    // PREFLIGHT — refuse an adapter that cannot be gated.
    //
    // `permissionMode` only produces approval requests if the adapter declares
    // it can emit them. Without that, built-in write/edit/bash would execute
    // with Limboo's permission gate bypassed entirely — and there is no setting
    // that recovers it. That is not a degraded mode worth offering, so the run
    // is refused. The framework raises its own error here too, but its message
    // recommends `allow-all`, which is precisely the unsafe remedy.
    if (flags.supportsBuiltinToolApprovals !== true) {
      throw new HarnessUngatedError(spec.harnessLabel ?? spec.harnessId);
    }

    // PREFLIGHT — the one-time setup step, if this adapter has one.
    //
    // It installs the agent CLI, which reaches the npm registry from the user's
    // machine (CLAUDE.md §1, third item). Three things must hold before a run
    // may proceed, in this order: the user has approved these exact commands,
    // the sandbox network policy permits the download, and the tools the
    // commands invoke exist. Each failure is named — the alternative is a
    // bootstrap that times out inside the sandbox with nothing to act on.
    const bootstrap = await readBootstrapPlan(harness);
    if (bootstrap) {
      const label = spec.harnessLabel ?? spec.harnessId;
      assertBootstrapConsent(bootstrap, spec.bootstrapAck ?? '', label);
      assertBootstrapPossible(bootstrap, spec.sandbox);
      bridge.onSandboxStatus?.('preparing', 'Preparing the agent runtime…');
    }

    const agent = new HarnessAgent({
      harness,
      sandbox: this.sandboxProvider,
      id: spec.sessionId,
      // THE gate for built-in tools. Never 'allow-all' — see permissions.ts.
      permissionMode: harnessPermissionMode(spec.mode),
      // The three context producers arrive pre-joined, exactly as they are for
      // Claude's single systemPrompt.append — same content, same budget, same
      // one-shot resume-delta semantics.
      instructions: spec.instructions,
      stopWhen: stepCountIs(spec.maxTurns),
      inactiveTools,
      toolApproval: spec.toolApproval,
      sandboxConfig: {
        // Lands the session ON the worktree rather than in a subdirectory of
        // it — the framework rejects '.' and always appends a path segment.
        workDir: spec.workDir,
      },
      debug: spec.debug,
      onLog: (line) => bridge.diag('stream', 'debug', 'harness', safeLine(line)),
    });

    const session = await agent.createSession(
      spec.resumeFrom != null
        ? { sessionId: spec.sessionId, resumeFrom: spec.resumeFrom }
        : { sessionId: spec.sessionId },
    );
    this.live.add(session);
    bridge.onSandboxStatus?.('ready', 'Workspace boundary established.');

    const ctx = newTranslateContext();
    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      // Prefer suspendTurn: it preserves an unfinished turn so the next send
      // can continue it (what makes plan-approve-then-implement work). stop()
      // is the fallback, and abort is the backstop.
      void Promise.resolve(session.suspendTurn?.() ?? session.stop?.()).catch(() => undefined);
      if (!spec.abort.signal.aborted) spec.abort.abort();
    };
    spec.abort.signal.addEventListener('abort', close, { once: true });

    const done = (async (): Promise<HarnessRunOutcome> => {
      try {
        // THE APPROVAL LOOP.
        //
        // When the adapter needs permission for a built-in tool it finishes the
        // stream and suspends the turn — the stream CLOSES rather than waiting.
        // So a single `for await` is structurally incapable of completing any
        // run that touches a file: it would drain the frames up to the first
        // write, see the stream end, and report success having done nothing.
        //
        // Each round therefore drains a stream, collects the approval requests
        // it surfaced, answers them through Limboo's gate, and resumes. The
        // requests are resolved AFTER the drain, never inside it: the stream is
        // already closing, the gate can block on a user dialog for minutes, and
        // batching is also correct if an adapter ever emits two at once.
        let result = await agent.stream({
          session,
          ...(spec.messages != null ? { messages: spec.messages } : { prompt: spec.prompt }),
        });

        for (let round = 0; ; round += 1) {
          const pending: HarnessApprovalRequest[] = [];
          for await (const part of result.stream) {
            if (spec.abort.signal.aborted) break;
            const req = translatePart(part, bridge, ctx, spec.cwd);
            if (req) pending.push(req);
          }
          if (spec.abort.signal.aborted || pending.length === 0) break;

          if (round >= MAX_APPROVAL_ROUNDS) {
            // A ceiling, not a policy: `stopWhen` bounds the real work. This
            // exists so a misbehaving adapter cannot spin forever, and it is
            // reported rather than silently ending the run.
            bridge.diag(
              'request',
              'warning',
              'Stopped after too many permission rounds',
              `${MAX_APPROVAL_ROUNDS} rounds; the harness kept asking for approval.`,
            );
            break;
          }

          const continuations: HarnessApprovalContinuation[] = [];
          for (const req of pending) {
            continuations.push(await resolveApproval(req, spec.approval));
          }
          if (spec.abort.signal.aborted) break;
          result = await agent.continueStream({
            session,
            toolApprovalContinuations: continuations,
          });
        }

        // A stream that ends without a `finish` frame still has to settle, or
        // the composer stays "streaming" for the session's lifetime.
        if (!ctx.finished) {
          bridge.finishStreaming();
          bridge.onResult(true, ctx.text);
        }
        return { result: { ok: ctx.ok, text: ctx.text } };
      } finally {
        this.live.delete(session);
        spec.abort.signal.removeEventListener('abort', close);
      }
    })();

    return { close, done };
  }

  /** Park every live session on quit; never deletes anything. */
  async dispose(): Promise<void> {
    await Promise.all(
      [...this.live].map((s) => Promise.resolve(s.stop?.()).catch(() => undefined)),
    );
    this.live.clear();
  }
}

/** Adapter log lines are untrusted text — bound them before they reach a log. */
function safeLine(line: unknown): string {
  const text = typeof line === 'string' ? line : JSON.stringify(line);
  return (text ?? '').slice(0, 500);
}
