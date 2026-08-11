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
import type { SessionPermissionMode } from '@shared/types';
import type { EffectiveSandbox } from '../sandbox/policy';
import type { ProviderRunBridge } from '../agent/providerBridge';
import { loadHarness } from './index';
import { newTranslateContext, translatePart } from './translate';
import type { HarnessSession, HarnessToolApproval } from './types';

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
  /** Layer 1 delegation — see `approval.ts`. */
  toolApproval?: HarnessToolApproval;
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

    const agent = new HarnessAgent({
      harness,
      sandbox: this.sandboxProvider,
      id: spec.sessionId,
      // The three context producers arrive pre-joined, exactly as they are for
      // Claude's single systemPrompt.append — same content, same budget, same
      // one-shot resume-delta semantics.
      instructions: spec.instructions,
      stopWhen: stepCountIs(spec.maxTurns),
      inactiveTools: spec.inactiveTools,
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
        const { stream } = await agent.stream({
          session,
          ...(spec.messages != null ? { messages: spec.messages } : { prompt: spec.prompt }),
        });
        for await (const part of stream) {
          if (spec.abort.signal.aborted) break;
          translatePart(part, bridge, ctx);
        }
        // A stream that ends without a `finish` frame still has to settle, or
        // the composer stays "streaming" for the session's lifetime.
        if (!ctx.finished) {
          bridge.finishStreaming();
          bridge.onResult(true, ctx.text);
        }
        return {
          sessionToken: ctx.sessionId,
          result: { ok: ctx.ok, text: ctx.text },
        };
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
