#!/usr/bin/env node
/**
 * Limboo hook runner — the tiny process Cursor spawns for every registered
 * hook (preToolUse / beforeShellExecution / beforeReadFile / afterFileEdit /
 * subagentStart / subagentStop). It reads the hook payload from stdin,
 * forwards it over Limboo's per-run bridge pipe, and writes the decision JSON
 * to stdout.
 *
 * MUST stay self-contained (node:net / node:process only — no imports from
 * the app bundle): it is emitted as a standalone asset beside main.js and
 * executed via `ELECTRON_RUN_AS_NODE=1 <electron> hookRunner.cjs`, including
 * from inside a packaged app where the main bundle lives in an asar. That is
 * also why HOOK_EVENTS below is duplicated from `../hooks.ts` rather than
 * imported — keep the two lists in sync.
 *
 * FAIL CLOSED: any failure — missing env, pipe unreachable, bad token,
 * timeout, malformed reply — prints {"permission":"deny"} and exits 2 (Cursor
 * treats exit 2 as a hard block; hooks.json additionally sets failClosed).
 * Fail-closed is correct, but it must fire only on a REAL failure: a runner
 * that cannot identify the event denies everything the agent tries to do, so
 * the event is resolved from argv first (which Limboo writes) and only then
 * from the payload, across every spelling the CLI might use.
 */
'use strict';

const net = require('node:net');

const PIPE = process.env.LIMBOO_BRIDGE_PIPE || '';
const TOKEN = process.env.LIMBOO_BRIDGE_TOKEN || '';
const TIMEOUT_MS = 10 * 60 * 1000; // interactive approval can take a while
const STDIN_TIMEOUT_MS = 30 * 1000; // the CLI writes the payload immediately
const MAX_INPUT = 2 * 1024 * 1024;
const MAX_REPLY = 1 * 1024 * 1024;

/** Mirrors HOOK_EVENTS in ../hooks.ts — the only accepted `--event` values. */
const HOOK_EVENTS = [
  'preToolUse',
  'beforeShellExecution',
  'beforeReadFile',
  'afterFileEdit',
  'subagentStart',
  'subagentStop',
];

let settled = false;

/**
 * Write the decision and exit. Uses the write callback rather than a bare
 * `process.exit()`: stdout to a pipe is asynchronous on POSIX, so exiting
 * synchronously can truncate the JSON — and a truncated ALLOW reads as empty
 * stdout, which `failClosed` treats as a block.
 */
function finish(permission, extra) {
  if (settled) return;
  settled = true;
  const out = Object.assign({ permission }, extra || {});
  const code = permission === 'allow' ? 0 : 2;
  let body;
  try {
    body = JSON.stringify(out);
  } catch {
    body = '{"permission":"deny"}';
  }
  try {
    process.stdout.write(body, () => process.exit(code));
  } catch {
    process.exit(code);
  }
  // Belt and braces: if stdout never drains, do not hang the agent forever.
  setTimeout(() => process.exit(code), 2000).unref();
}

function denyAndExit(message) {
  finish('deny', { agentMessage: message || 'Limboo bridge unavailable.' });
}

// Booting as a GUI Electron app instead of as node means ELECTRON_RUN_AS_NODE
// did not survive into this grandchild. Nothing here can recover in-process,
// and hanging would cost the agent a full hook timeout on EVERY tool call —
// so fail fast and name the cause.
if (process.versions && process.versions.electron && !process.env.ELECTRON_RUN_AS_NODE) {
  denyAndExit('Limboo bridge runner started without ELECTRON_RUN_AS_NODE.');
}

if (!PIPE || !TOKEN) denyAndExit('Limboo bridge environment missing.');

/** The event name from our own argv (`--event <name>`), validated. */
function eventFromArgv() {
  const argv = process.argv;
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--event' && typeof argv[i + 1] === 'string') {
      return HOOK_EVENTS.indexOf(argv[i + 1]) >= 0 ? argv[i + 1] : '';
    }
    if (typeof argv[i] === 'string' && argv[i].startsWith('--event=')) {
      const v = argv[i].slice('--event='.length);
      return HOOK_EVENTS.indexOf(v) >= 0 ? v : '';
    }
  }
  return '';
}

/** Fallback: whichever spelling of the event key the payload happens to use. */
function eventFromPayload(payload) {
  const keys = ['hook_event_name', 'hookEventName', 'event', 'eventName', 'hook_event', 'type'];
  for (const key of keys) {
    if (typeof payload[key] === 'string' && payload[key].trim()) return payload[key].trim();
  }
  return '';
}

// The read phase needs its own timer: the bridge timer below is only armed
// once stdin closes, so a stream that never ends used to hang until Cursor's
// own 600s timeout — ten minutes per tool call.
let stdin = '';
const stdinTimer = setTimeout(
  () => denyAndExit('Timed out reading the hook payload.'),
  STDIN_TIMEOUT_MS,
);
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  stdin += chunk;
  if (stdin.length > MAX_INPUT) {
    clearTimeout(stdinTimer);
    denyAndExit('Hook payload too large.');
  }
});
process.stdin.on('error', () => {
  clearTimeout(stdinTimer);
  denyAndExit('Failed to read the hook payload.');
});
process.stdin.on('end', () => {
  clearTimeout(stdinTimer);
  let payload;
  try {
    payload = JSON.parse(stdin);
  } catch {
    denyAndExit('Malformed hook payload.');
    return;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    denyAndExit('Malformed hook payload.');
    return;
  }

  const event = eventFromArgv() || eventFromPayload(payload);
  const socket = net.connect(PIPE);
  const timer = setTimeout(() => {
    socket.destroy();
    denyAndExit('Limboo did not answer in time.');
  }, TIMEOUT_MS);

  let buffer = '';
  socket.setEncoding('utf8');
  socket.on('error', () => {
    clearTimeout(timer);
    denyAndExit('Limboo bridge unreachable.');
  });
  socket.on('connect', () => {
    socket.write(JSON.stringify({ token: TOKEN, role: 'hook' }) + '\n');
    socket.write(JSON.stringify({ id: 1, kind: 'hook', event, payload }) + '\n');
  });
  socket.on('data', (chunk) => {
    buffer += chunk;
    if (buffer.length > MAX_REPLY) {
      clearTimeout(timer);
      socket.destroy();
      denyAndExit('Bridge reply too large.');
      return;
    }
    const nl = buffer.indexOf('\n');
    if (nl < 0) return;
    clearTimeout(timer);
    socket.end();

    let reply;
    try {
      reply = JSON.parse(buffer.slice(0, nl));
    } catch {
      denyAndExit('Malformed bridge reply.');
      return;
    }
    if (!reply || reply.ok !== true || !reply.result || typeof reply.result !== 'object') {
      denyAndExit(reply && typeof reply.error === 'string' ? reply.error : 'Bridge refused.');
      return;
    }
    const decision = reply.result;
    const extra = {};
    if (typeof decision.agentMessage === 'string' && decision.agentMessage) {
      extra.agentMessage = decision.agentMessage;
    }
    if (typeof decision.userMessage === 'string' && decision.userMessage) {
      extra.userMessage = decision.userMessage;
    }
    finish(decision.permission === 'allow' ? 'allow' : 'deny', extra);
  });
  socket.on('close', () => {
    // Reply already handled above; a close without one is a failure.
    if (buffer.indexOf('\n') < 0) {
      clearTimeout(timer);
      denyAndExit('Bridge closed early.');
    }
  });
});
