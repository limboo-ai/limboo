/**
 * Runtime path resolution for the standalone bridge scripts
 * (hookRunner.cjs / mcpBridge.cjs). They are emitted BESIDE main.js by the
 * main Vite build (see vite.main.config.ts) and unpacked from the asar in
 * packaged builds (electron-builder `asarUnpack`) so `cursor-agent` can spawn
 * them from a real on-disk path — the same constraint as the Claude SDK
 * binary (an asar-internal path is not executable).
 */
import { app } from 'electron';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ASAR_SEG = `${path.sep}app.asar${path.sep}`;
const UNPACKED_SEG = `${path.sep}app.asar.unpacked${path.sep}`;

export type BridgeScript = 'hookRunner.cjs' | 'mcpBridge.cjs';

/** Absolute on-disk path of a bridge script, or null when unresolvable. */
export function bridgeScriptPath(name: BridgeScript): string | null {
  const candidates = [
    // Packaged / dev build output: the script is emitted beside main.js.
    path.join(__dirname, name).replace(ASAR_SEG, UNPACKED_SEG),
    // Dev fallback: resolve straight from the source tree.
    path.join(app.getAppPath(), 'src', 'main', 'managers', 'cursor', 'bridge', name),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/**
 * The command used to execute a bridge script.
 *
 * Prefers a REAL `node` on PATH, falling back to Electron-as-node. The fallback
 * only works if `ELECTRON_RUN_AS_NODE` survives from the `cursor-agent` child
 * into the hook grandchild — and if the CLI sanitizes its environment before
 * running user-configured hook commands (a reasonable thing for it to do), the
 * Electron binary boots as a GUI app instead: it never reads stdin, never
 * writes a decision, and every tool call blocks for the full hook timeout.
 * A real node has no such dependency. The runner detects and names the failed
 * fallback rather than hanging (see hookRunner.cjs).
 *
 * Probed once and memoised; resolution is argv-only and never uses a shell.
 */
let nodeCommand: string | null = null;

export function bridgeNodeCommand(): string {
  if (nodeCommand) return nodeCommand;
  nodeCommand = probeSystemNode() ?? process.execPath;
  return nodeCommand;
}

/** True when the resolved command is Electron-as-node rather than real node. */
export function bridgeNeedsElectronAsNode(): boolean {
  return bridgeNodeCommand() === process.execPath;
}

function probeSystemNode(): string | null {
  const exe = process.platform === 'win32' ? 'node.exe' : 'node';
  const finder = process.platform === 'win32' ? 'where.exe' : 'which';
  let candidate: string | null = null;
  try {
    const out = spawnSync(finder, [exe], { encoding: 'utf8', timeout: 3_000, shell: false });
    if (out.status === 0 && typeof out.stdout === 'string') {
      candidate = out.stdout.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? null;
    }
  } catch {
    return null;
  }
  if (!candidate || !path.isAbsolute(candidate)) return null;
  try {
    if (!fs.statSync(candidate).isFile()) return null;
    // Confirm it actually runs as node before trusting it with the gate.
    const v = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 3_000, shell: false });
    if (v.status !== 0 || !/^v\d+\./.test((v.stdout || '').trim())) return null;
  } catch {
    return null;
  }
  return candidate;
}
