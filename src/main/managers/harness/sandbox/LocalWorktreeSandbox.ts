/**
 * A `HarnessV1SandboxProvider` backed by the session's REAL git worktree.
 *
 * Every shipped AI SDK sandbox provider is remote (Vercel) or a local
 * emulation with its own filesystem. Limboo can use neither: it is local-first
 * and makes exactly two kinds of outbound request (CLAUDE.md §1), so the user's
 * repository must never leave the machine — and the agent must edit the actual
 * worktree, because Limboo's whole model is that a session IS a worktree that
 * git, the diff viewer, checkpoints and the Work Graph all observe directly.
 * A provider that copied files in and out would desynchronise all of them.
 *
 * So this provider is a thin, guarded adapter over local `fs` and
 * `child_process` rooted at the worktree. "The sandbox" is this machine, which
 * is exactly why the guards below are not optional.
 *
 * ── The working-directory trick ──────────────────────────────────────────
 * The framework composes a session's cwd as
 * `posix.join(defaultWorkingDirectory, workDir ?? '<harnessId>-<sessionId>')`
 * and REJECTS `workDir: '.'`, so the session always lands in a SUBDIRECTORY of
 * whatever this provider reports as its default. Reporting the worktree root
 * would therefore put the agent in `<worktree>/claude-code-<id>/` — an empty
 * folder inside the repo, not the repo.
 *
 * Hence `defaultWorkingDirectory` is a Limboo-owned STATE ROOT under userData
 * and the caller passes `workDir = basename(worktree)`, which that root holds
 * as a link to the real worktree — so the join lands exactly on the worktree
 * while the adapter's own `.harness-bootstrap` / `.agent-runs` directories
 * stay inside userData and never appear in `git status`. See `stateRoot.ts`
 * for why the link has to be real on disk and why the worktree's plain PARENT
 * is not good enough (a non-worktree session's parent is the user's own
 * projects directory).
 *
 * ── What is guarded, and why each guard exists ───────────────────────────
 *  - Every path resolves through {@link resolvePath}: canonicalized, confined
 *    to the worktree (or the read-only attachments dir), and refused outright
 *    for any `crownJewelPaths()` entry. Layer 1 (`decideToolUse`) governs what
 *    the MODEL may ask for; this governs what the harness process can reach
 *    regardless of who asked.
 *  - `destroy()` NEVER touches disk. `WorktreeManager` owns worktree lifecycle;
 *    a provider that deleted "its" sandbox root would delete the user's work.
 *  - `restricted()` reports the jail's real state, never an optimistic `true`.
 *  - Ports are loopback-only and re-asserted after the bridge starts, and the
 *    bridge's hardcoded `0.0.0.0` bind is rewritten as its file is written.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { crownJewelPaths, type EffectiveSandbox } from '../../sandbox/policy';
import { killTree } from '../../agent/killTree';
import { augmentedPath } from '../toolchain';
import { resolveJail } from './jail';
import { patchBootstrapFile } from './patchBridge';
import { assertLoopbackOnly, reserveLoopbackPort, type PortReservation } from './ports';
import { canFallBackToParent, prepareStateRoot } from './stateRoot';

/** Everything the provider needs, injected — never a manager reference. */
export interface LocalSandboxDeps {
  /** The session's effective execution root; `null` refuses the session. */
  resolveRoot(sessionId: string): string | null;
  /** The resolved provider-neutral policy for this session. */
  resolveSandbox(sessionId: string, cwd: string): EffectiveSandbox;
  /** This session's attachment staging dir, mounted read-only when present. */
  attachmentsDirFor?(sessionId: string): string | undefined;
  /**
   * Credential env var NAMES the harness that will actually run needs (never
   * values).
   *
   * Each is forwarded to the child only when already present in the host
   * environment. Limboo stores no provider credential — this exists so a user
   * whose shell has `ANTHROPIC_API_KEY` can authenticate, without the app ever
   * holding, echoing or persisting the value.
   *
   * Takes the SESSION, because the harness follows the MODEL rather than
   * `settings.agent.harness.id` — that field is only the choice for Anthropic
   * models, where a harness and the direct SDK path both exist. Reading it
   * unconditionally handed a Codex or Pi run Claude's key names and none of
   * its own, so those runs could never authenticate.
   */
  envKeysFor?(sessionId: string): readonly string[];
  /**
   * Limboo's worktree root (`{userData}/worktrees` by default).
   *
   * Consulted only to decide whether a session may fall back to
   * `path.dirname(root)` when the state-root link cannot be created — see
   * `stateRoot.ts` `canFallBackToParent`.
   */
  worktreeRoot(): string;
  /** Structured diagnostics (already-redacted detail only). */
  diag?(severity: 'debug' | 'info' | 'warning' | 'error', label: string, detail?: string): void;
}

/**
 * The adapter state directories permitted as SIBLINGS of the worktree.
 *
 * Third-party constants, re-verified in @ai-sdk/harness-claude-code@1.0.94:
 * `BOOTSTRAP_DIR = ".harness-bootstrap/claude-code"` and the per-session
 * `.agent-runs/<sessionId>/bridge`, both resolved against the sandbox's
 * `defaultWorkingDirectory`. Kept as literals rather than a prefix rule so a
 * rename in a future adapter version fails loudly at the first write.
 */
const HARNESS_STATE_DIRS = new Set(['.harness-bootstrap', '.agent-runs']);

/** Grace period before a spawned process tree is SIGKILLed. */
const KILL_GRACE_MS = 5_000;
/** Cap on captured `run()` output, mirroring the Cursor stream reader. */
const MAX_CAPTURE = 4 * 1024 * 1024;

/** Environment keys a child may inherit. Never a raw `process.env` splat. */
const ENV_ALLOWLIST = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'TZ', 'TERM',
  'TMPDIR', 'TEMP', 'TMP',
  'SystemRoot', 'SystemDrive', 'windir', 'COMSPEC', 'PATHEXT',
  'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'ProgramData', 'ProgramFiles',
  'HOMEDRIVE', 'HOMEPATH', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
];

/**
 * The child's environment: the platform allowlist, plus the specific credential
 * variables this harness needs.
 *
 * `extraKeys` is a SECOND, explicitly-named list rather than a widening of
 * `ENV_ALLOWLIST`, so a review diff reads "we now forward ANTHROPIC_API_KEY to
 * the harness bridge" instead of "we splatted process.env". A key is forwarded
 * only when it is already present on the host — Limboo stores no provider
 * credential, accepts none over IPC, and puts none in argv; this is pure
 * passthrough of what the user's own shell already has.
 *
 * PATH is the one key not passed through verbatim. An Electron app launched from
 * a `.desktop` entry or the Dock inherits a much smaller PATH than the user's
 * shell, so the bootstrap child would fail to find a pnpm/bun/nvm-node that IS
 * installed. `augmentedPath()` prepends the user-local tool directories that
 * exist — DISCOVERY of what is already there, never provisioning, so CLAUDE.md
 * §1 is untouched. It must match what `probeCommand` resolves against, or the
 * preflight check and the child would disagree about the same machine.
 */
function baseEnv(extraKeys: readonly string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of [...ENV_ALLOWLIST, ...extraKeys]) {
    const v = process.env[key];
    if (typeof v === 'string') out[key] = v;
  }
  out.PATH = augmentedPath();
  return out;
}

/** True when `target` is `root` or lies beneath it. */
function contains(root: string, target: string): boolean {
  if (target === root) return true;
  const rel = path.relative(root, target);
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Longest existing ancestor, so a not-yet-created path can still be resolved. */
function realpathNearest(p: string): string {
  let cur = path.resolve(p);
  for (;;) {
    try {
      return path.join(fs.realpathSync(cur), path.relative(cur, path.resolve(p)));
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return path.resolve(p);
      cur = parent;
    }
  }
}

/** One live session. */
class LocalSandboxSession {
  readonly ports: number[] = [];
  private readonly reservations = new Map<number, PortReservation>();
  private readonly children = new Set<ReturnType<typeof spawn>>();
  private readonly jail = resolveJail(this.eff);
  private stopped = false;

  constructor(
    readonly id: string,
    /** The worktree's PARENT — see the working-directory note in the header. */
    readonly defaultWorkingDirectory: string,
    private readonly worktree: string,
    private readonly eff: EffectiveSandbox,
    private readonly attachmentsDir: string | undefined,
    /** Credential env vars this harness needs — forwarded only if already set. */
    private readonly envKeys: readonly string[],
    private readonly diag: NonNullable<LocalSandboxDeps['diag']>,
  ) {}

  readonly description =
    'Local worktree sandbox: the agent operates directly on the session\'s git ' +
    'worktree on this machine. Paths outside it are not reachable.';

  /**
   * Resolve a harness-supplied path and refuse anything outside the worktree.
   *
   * Order matters: canonicalize FIRST (so a symlink inside the worktree that
   * points out is caught), then confine, then refuse crown jewels absolutely —
   * the last check is not conditional on the first two, because a crown jewel
   * reachable through some future carve-out must still be refused.
   */
  private resolvePath(p: string, forWrite: boolean): string {
    if (typeof p !== 'string' || p.length === 0 || p.includes('\0')) {
      throw new Error('Invalid sandbox path.');
    }
    const abs = path.isAbsolute(p) ? path.resolve(p) : path.resolve(this.worktree, p);
    const real = realpathNearest(abs);
    const realWorktree = realpathNearest(this.worktree);

    for (const jewel of crownJewelPaths()) {
      const rj = realpathNearest(jewel);
      if (contains(rj, real) || real.startsWith(`${rj}-`)) {
        throw new Error(`Refused: ${path.basename(p)} is a protected Limboo file.`);
      }
    }

    if (contains(realWorktree, real)) return real;

    // The adapter's own state, which lives OUTSIDE the worktree by design.
    //
    // `@ai-sdk/harness-claude-code` resolves its bootstrap and per-run bridge
    // state against `defaultWorkingDirectory` — which this provider reports as
    // the worktree's PARENT — so they land as siblings of the worktree:
    //   .harness-bootstrap/<harnessId>/   (installed CLI + marker)
    //   .agent-runs/<sessionId>/bridge/   (per-run bridge state)
    // That placement is exactly what keeps `git status` clean, and the guard
    // above refused it, so the harness path could not start at all.
    //
    // The carve-out is deliberately narrow: only these two LITERAL first
    // segments, both dot-prefixed, so it can never collide with a sibling
    // worktree (slugs come from `sanitizeBranchName`, which cannot emit a
    // leading dot). The crown-jewel loop above already ran unconditionally, so
    // nothing here can reach a protected file. Both names are third-party
    // constants re-verified in @ai-sdk/harness-claude-code@1.0.94 — an upgrade
    // that renames them fails loudly at the first write rather than silently
    // writing somewhere else.
    const realState = realpathNearest(this.defaultWorkingDirectory);
    if (contains(realState, real)) {
      const [segment] = path.relative(realState, real).split(path.sep);
      if (HARNESS_STATE_DIRS.has(segment)) return real;
    }

    if (this.attachmentsDir) {
      const ra = realpathNearest(this.attachmentsDir);
      if (contains(ra, real)) {
        // Staged attachments are a READ carve-out. Writes are refused under
        // the standing policy; reads always pass, which is the whole point of
        // mounting them.
        if (forWrite && this.eff.readOnlyAttachments) {
          throw new Error('Refused: staged attachments are read-only.');
        }
        return real;
      }
    }
    throw new Error('Refused: path is outside the session workspace.');
  }

  /**
   * Resolve a WORKING DIRECTORY for a spawned command.
   *
   * Everything {@link resolvePath} permits, plus the state root itself. That
   * one addition is what makes the harness bootstrap possible at all: the
   * framework's `applyBootstrapRecipe` runs `mkdir -p "$BOOTSTRAP_DIR"` with
   * `workingDirectory` set to `defaultWorkingDirectory`, and `resolvePath`
   * refused it — its state-dir carve-out admits `<state>/.harness-bootstrap/…`
   * but not `<state>`, because `path.relative(state, state)` is `''` and an
   * empty first segment is in no allow-list. So the very first command of the
   * one-time setup failed, every time, with "path is outside the session
   * workspace" — which is how a harness that had been "installed" for months
   * had never once completed its install.
   *
   * Kept SEPARATE from `resolvePath` rather than widening it: file I/O must go
   * on refusing this directory, so the harness cannot read or write the state
   * root's own entries (a sibling session's `.agent-runs`, say) through the
   * file API.
   *
   * It grants no reach that did not already exist. A cwd is not file access,
   * and these guards cover the file-I/O API rather than shell commands — a
   * command already launched with `cwd = worktree` can `cd ..` on its own. The
   * layer that would contain a shell command is the OS jail, which `jail.ts`
   * documents as a deliberate no-op today.
   */
  private resolveCwd(p: string): string {
    const abs = path.isAbsolute(p) ? path.resolve(p) : path.resolve(this.worktree, p);
    if (realpathNearest(abs) === realpathNearest(this.defaultWorkingDirectory)) {
      return this.defaultWorkingDirectory;
    }
    return this.resolvePath(p, false);
  }

  /* ---------------------------------------------------------------- */
  /* File I/O                                                          */
  /* ---------------------------------------------------------------- */

  readonly readFile = async (o: { path: string }): Promise<ReadableStream<Uint8Array> | null> => {
    const bytes = await this.readBinaryFile(o);
    if (bytes == null) return null;
    return Readable.toWeb(Readable.from(Buffer.from(bytes))) as ReadableStream<Uint8Array>;
  };

  readonly readBinaryFile = async (o: { path: string }): Promise<Uint8Array | null> => {
    const target = this.resolvePath(o.path, false);
    try {
      return new Uint8Array(await fsp.readFile(target));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  };

  readonly readTextFile = async (o: {
    path: string;
    encoding?: string;
    startLine?: number;
    endLine?: number;
  }): Promise<string | null> => {
    const bytes = await this.readBinaryFile(o);
    if (bytes == null) return null;
    const text = Buffer.from(bytes).toString((o.encoding as BufferEncoding) || 'utf8');
    if (o.startLine == null && o.endLine == null) return text;
    const lines = text.split('\n');
    return lines.slice(Math.max(0, (o.startLine ?? 1) - 1), o.endLine ?? lines.length).join('\n');
  };

  readonly writeFile = async (o: {
    path: string;
    content: ReadableStream<Uint8Array>;
  }): Promise<void> => {
    const chunks: Buffer[] = [];
    for await (const c of Readable.fromWeb(o.content as never)) chunks.push(Buffer.from(c));
    await this.writeBinaryFile({ path: o.path, content: new Uint8Array(Buffer.concat(chunks)) });
  };

  readonly writeBinaryFile = async (o: { path: string; content: Uint8Array }): Promise<void> => {
    const target = this.resolvePath(o.path, true);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, o.content);
  };

  readonly writeTextFile = async (o: {
    path: string;
    content: string;
    encoding?: string;
  }): Promise<void> => {
    // THE bind-address mitigation: the adapter hands us the bridge's source to
    // write, so its hardcoded `host: "0.0.0.0"` is rewritten here, in transit,
    // before it can ever listen. Throws (refusing the run) if the literal is
    // gone — see patchBridge.ts for why that must not become a warning.
    const { content, patched } = patchBootstrapFile(o.path, o.content);
    if (patched) {
      this.diag('info', 'Pinned the agent bridge to loopback', path.basename(o.path));
    }
    await this.writeBinaryFile({
      path: o.path,
      content: new Uint8Array(Buffer.from(content, (o.encoding as BufferEncoding) || 'utf8')),
    });
  };

  /* ---------------------------------------------------------------- */
  /* Processes                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * The interface hands us a shell COMMAND STRING (the adapter shell-quotes it
   * itself), so a shell is unavoidable. It is invoked as an explicit argv
   * member — `sh -c <cmd>` with `shell: false` — never Node's `shell: true`,
   * which is the implicit-interpolation footgun CLAUDE.md §6 forbids. Commands
   * the MODEL authors do not arrive here; they run through Claude Code's own
   * Bash tool inside the bridge, which routes back through `decideToolUse`.
   */
  private launch(o: {
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
  }): ReturnType<typeof spawn> {
    const cwd = o.workingDirectory ? this.resolveCwd(o.workingDirectory) : this.worktree;
    // Hand the reserved bridge port over to whatever is about to run.
    //
    // `reserveLoopbackPort` HOLDS its listener open on purpose — that is what
    // closes the probe-then-race window a plain "find a free port" helper
    // leaves. But the harness bridge binds that same port itself, so the hold
    // has to end before any child starts or the bridge dies with EADDRINUSE
    // (see the third rejected option in patchBridge.ts's header). Releasing
    // here, at the last instant before `spawn`, keeps the window as narrow as
    // it can be while still letting the bridge bind.
    this.releasePortReservations();
    const [shellCmd, shellFlag] =
      process.platform === 'win32' ? [process.env.COMSPEC || 'cmd.exe', '/d/s/c'] : ['/bin/sh', '-c'];
    const argv = [...this.jail.argv, shellCmd, shellFlag, o.command];
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env: { ...baseEnv(this.envKeys), ...(o.env ?? {}) },
      shell: false,
      windowsHide: true,
    });
    this.children.add(child);
    child.once('exit', () => this.children.delete(child));
    return child;
  }

  readonly spawn = async (o: {
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
  }): Promise<{
    pid?: number;
    stdout: ReadableStream<Uint8Array>;
    stderr: ReadableStream<Uint8Array>;
    wait(): PromiseLike<{ exitCode: number }>;
    kill(): PromiseLike<void>;
  }> => {
    const child = this.launch(o);
    const stop = (): void => killTree(child, KILL_GRACE_MS);
    o.abortSignal?.addEventListener('abort', stop, { once: true });
    return {
      pid: child.pid,
      stdout: Readable.toWeb(child.stdout ?? Readable.from([])) as ReadableStream<Uint8Array>,
      stderr: Readable.toWeb(child.stderr ?? Readable.from([])) as ReadableStream<Uint8Array>,
      wait: () =>
        new Promise<{ exitCode: number }>((resolve) => {
          child.once('close', (code) => resolve({ exitCode: code ?? 0 }));
        }),
      kill: async () => stop(),
    };
  };

  readonly run = async (o: {
    command: string;
    workingDirectory?: string;
    env?: Record<string, string>;
    abortSignal?: AbortSignal;
  }): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
    const child = this.launch(o);
    const stop = (): void => killTree(child, KILL_GRACE_MS);
    o.abortSignal?.addEventListener('abort', stop, { once: true });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => {
      if (stdout.length < MAX_CAPTURE) stdout += d.toString('utf8');
    });
    child.stderr?.on('data', (d: Buffer) => {
      if (stderr.length < MAX_CAPTURE) stderr += d.toString('utf8');
    });
    const exitCode = await new Promise<number>((resolve) => {
      child.once('close', (code) => resolve(code ?? 0));
      child.once('error', () => resolve(1));
    });
    return { exitCode, stdout, stderr };
  };

  /* ---------------------------------------------------------------- */
  /* Ports / lifecycle                                                 */
  /* ---------------------------------------------------------------- */

  /**
   * ALWAYS loopback. This is the URL the adapter opens its control channel on,
   * so it is also the last place a non-local host could sneak in — hence the
   * exposure check AND the runtime `assertLoopbackOnly` assertion, both of
   * which every port accessor shares by going through here.
   *
   * `https` deliberately resolves to `http`: there is no certificate for
   * 127.0.0.1 and nothing to protect in transit on a loopback socket the
   * bridge token already authenticates.
   */
  private async loopbackUrl(o: { port: number; protocol?: 'http' | 'https' | 'ws' }): Promise<string> {
    if (!this.ports.includes(o.port)) {
      throw new Error(`Port ${o.port} is not exposed by this sandbox.`);
    }
    await assertLoopbackOnly(o.port);
    return `${o.protocol === 'ws' ? 'ws' : 'http'}://127.0.0.1:${o.port}`;
  }

  /**
   * The port accessor the adapter actually calls.
   *
   * The adapter reaches for `getPortEndpoint` — not the deprecated
   * `getPortUrl` — at both its attach and its fresh-spawn paths. At 1.0.80 it
   * called it UNCONDITIONALLY and had no fallback, so implementing only
   * `getPortUrl` meant every claude-code run died with a TypeError the moment
   * its bridge came up. 1.0.94 feature-detects instead
   * (`'getPortEndpoint' in sandboxSession`), which turns that crash into a
   * silent downgrade to the deprecated path — so this is still the method that
   * decides which branch a run takes, and it is now the one that keeps the
   * provider on the supported side of a deprecation.
   *
   * Both stay: the interface still declares `getPortUrl`, and a future adapter
   * may call either.
   *
   * `headers` is deliberately absent. It exists on the interface for providers
   * that gate a public tunnel with an auth header; a loopback socket has
   * nothing to add, and inventing one would be a claim about a protection that
   * is not there.
   */
  readonly getPortEndpoint = async (o: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }): Promise<{ url: string }> => ({ url: await this.loopbackUrl(o) });

  /** @deprecated by the framework; kept because the interface still declares it. */
  readonly getPortUrl = async (o: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }): Promise<string> => this.loopbackUrl(o);

  readonly setPorts = async (ports: readonly number[]): Promise<void> => {
    // Full-replacement semantics per the interface contract.
    for (const [port, res] of this.reservations) {
      if (!ports.includes(port)) {
        res.release();
        this.reservations.delete(port);
      }
    }
    this.ports.length = 0;
    for (const p of ports) {
      if (p !== 0 && !this.reservations.has(p)) {
        // A caller-chosen port is only honoured if we can hold it on loopback.
        const res = await reserveLoopbackPort();
        this.reservations.set(res.port, res);
        this.ports.push(res.port);
      } else {
        this.ports.push(p);
      }
    }
  };

  /**
   * Reserve a loopback port for the bridge and EXPOSE it.
   *
   * The exposure half is the point. A bridge-backed adapter reads
   * `sandboxSession.ports[0]` to decide where its bridge should listen, and
   * refuses the whole run when the array is empty
   * (`HarnessCapabilityUnsupportedError: "The claude-code harness needs a TCP
   * port exposed by the sandbox."`). This method existed and had no caller, so
   * `ports` was always `[]` and no bridge-backed harness could ever start.
   */
  async allocatePort(): Promise<PortReservation> {
    const res = await reserveLoopbackPort();
    this.reservations.set(res.port, res);
    this.ports.push(res.port);
    return res;
  }

  /**
   * Drop the holding listeners while KEEPING the ports exposed.
   *
   * `ports` is what the adapter reads; `reservations` is only how we held them
   * against the rest of the machine until something was ready to bind. See the
   * call site in {@link launch}.
   */
  private releasePortReservations(): void {
    for (const res of this.reservations.values()) res.release();
    this.reservations.clear();
  }

  readonly setNetworkPolicy = async (policy: unknown): Promise<void> => {
    // Limboo's policy is authoritative; a request to LOOSEN it is refused
    // rather than applied (the same rule withSessionSandboxJson follows).
    // Nothing is enforced until the jail lands, so this only records intent.
    this.diag('debug', 'Sandbox network policy requested', JSON.stringify(policy).slice(0, 200));
  };

  /**
   * A filesystem/exec-only view. Callers that get this must not be able to
   * stop the sandbox or change its network policy.
   */
  readonly restricted = (): unknown => ({
    description: this.description,
    readFile: this.readFile,
    readBinaryFile: this.readBinaryFile,
    readTextFile: this.readTextFile,
    writeFile: this.writeFile,
    writeBinaryFile: this.writeBinaryFile,
    writeTextFile: this.writeTextFile,
    spawn: this.spawn,
    run: this.run,
  });

  /** Whether a kernel-enforced boundary is genuinely in effect. Never lies. */
  isRestricted(): boolean {
    return this.jail.restricted;
  }

  readonly stop = async (): Promise<void> => {
    if (this.stopped) return;
    this.stopped = true;
    for (const child of this.children) killTree(child, KILL_GRACE_MS);
    this.children.clear();
    this.releasePortReservations();
    this.ports.length = 0;
  };

  /**
   * Release resources. **Deletes nothing.** The "sandbox root" is the user's
   * real worktree and `WorktreeManager` owns its lifecycle — an `rm -rf` here
   * would destroy their work. There is deliberately no filesystem call in this
   * method; do not add one.
   */
  readonly destroy = async (): Promise<void> => {
    await this.stop();
  };
}

/** The provider. One instance for the app; sessions are keyed by session id. */
export class LocalWorktreeSandboxProvider {
  readonly specificationVersion = 'harness-sandbox-v1' as const;
  readonly providerId = 'limboo-local-worktree';
  /** Bridge-backed adapters ask for one port; we hand out loopback ones. */
  readonly bridgePorts = 1;

  private readonly sessions = new Map<string, LocalSandboxSession>();

  constructor(private readonly deps: LocalSandboxDeps) {}

  /** The `workDir` a caller must pass so the session lands ON the worktree. */
  workDirFor(sessionId: string): string | null {
    const root = this.deps.resolveRoot(sessionId);
    return root ? path.basename(root) : null;
  }

  readonly createSession = async (options?: {
    sessionId?: string;
  }): Promise<LocalSandboxSession> => {
    const sessionId = options?.sessionId;
    if (!sessionId) throw new Error('The local sandbox requires a session id.');
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;

    const root = this.deps.resolveRoot(sessionId);
    // REFUSE rather than fall back. A default of `process.cwd()` (or the
    // userData root) would silently point the agent at the wrong tree — the
    // worst possible failure mode for a provider whose entire job is
    // confinement.
    if (!root) {
      throw new Error(
        `No execution root resolved for session ${sessionId}; refusing to start a sandbox.`,
      );
    }

    const session = new LocalSandboxSession(
      sessionId,
      // A Limboo-owned state root under userData that holds a link to the
      // worktree — the framework appends a subdirectory to this. See the
      // working-directory note in the module header and `stateRoot.ts`.
      this.stateRootFor(root),
      root,
      this.deps.resolveSandbox(sessionId, root),
      this.deps.attachmentsDirFor?.(sessionId),
      this.deps.envKeysFor?.(sessionId) ?? [],
      this.deps.diag ?? ((): void => undefined),
    );
    // Expose a loopback port BEFORE the adapter reads `ports`. A bridge-backed
    // harness refuses the run outright when the array is empty, so this is not
    // an optimisation — it is what makes such a harness startable at all.
    await session.allocatePort();
    this.sessions.set(sessionId, session);
    return session;
  };

  /**
   * The directory this provider reports as `defaultWorkingDirectory`.
   *
   * Normally `{userData}/harness-state/<bucket>`, with a link to the execution
   * root inside it (see `stateRoot.ts`). If the link cannot be created, fall
   * back to the worktree's parent ONLY when that parent is already inside
   * Limboo's worktree root — which is what shipped before and is still under
   * userData. For a plain session the parent is the user's own projects
   * directory, so writing adapter state there is refused instead: littering
   * `.harness-bootstrap/` beside somebody's repository is not a degraded mode,
   * it is the failure this whole arrangement exists to prevent.
   */
  private stateRootFor(root: string): string {
    try {
      return prepareStateRoot(root).stateRoot;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (canFallBackToParent(root, this.deps.worktreeRoot())) {
        this.deps.diag?.(
          'warning',
          'Harness state root unavailable; using the worktree parent',
          detail,
        );
        return path.dirname(root);
      }
      throw new Error(
        'Limboo could not prepare a private directory for the agent harness, and ' +
          'this session is not worktree-backed — so the harness would have to write ' +
          'its runtime beside your repository. Create a worktree for this session, ' +
          `or fix the state directory. Reason: ${detail}`,
      );
    }
  }

  readonly resumeSession = async (options: { sessionId: string }): Promise<LocalSandboxSession> => {
    const found = this.sessions.get(options.sessionId);
    if (found) return found;
    // Cold start after a restart: rebuild from the same resolvers. The worktree
    // is durable, so "resume" is just "create again against the same root".
    return this.createSession({ sessionId: options.sessionId });
  };

  /** Drop a session's resources (never its files). */
  async release(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    this.sessions.delete(sessionId);
    await s.destroy();
  }

  /** Release every session — called on app quit. */
  async dispose(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.release(id)));
  }
}

export type { LocalSandboxSession };
