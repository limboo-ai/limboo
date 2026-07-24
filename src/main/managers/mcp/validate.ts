/**
 * Validate + normalize a renderer-supplied {@link McpServerInput} into a durable
 * server definition (plus the plaintext secrets to encrypt separately). Every
 * field is a persisted value that rides into a child-process spawn or a
 * generated provider config, so each is charset-validated / length-capped here
 * (CLAUDE.md §6). Secrets never enter the returned `env`/`headers` maps — they
 * are flagged (`secret: true`) and their values returned separately for the
 * SecretStore. Throws a user-facing Error on any invalid field.
 */
import {
  MCP_LIMITS,
  MCP_RESERVED_NAMES,
  MCP_SERVER_NAME_RE,
} from '@shared/constants';
import type {
  McpCategory,
  McpFieldValue,
  McpRestartPolicy,
  McpServerInput,
  McpStartup,
  McpTransport,
  McpTrust,
} from '@shared/types';
import { categorizeServer } from './categorize';

/**
 * Property names that pollute `Object.prototype` when used as object keys.
 * Any renderer- or disk-sourced object merged into a plain object must skip
 * these (CLAUDE.md §6). Shared by the config importer, the registry JSON
 * parsers, and the export merge.
 */
export const UNSAFE_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/** True if `key` would pollute the prototype chain when used as an object key. */
export function isUnsafeKey(key: string): boolean {
  return UNSAFE_KEYS.has(key);
}

const TRANSPORTS: McpTransport[] = ['stdio', 'http', 'sse'];
const CATEGORIES: McpCategory[] = [
  'version-control', 'search', 'memory', 'documentation', 'cloud', 'issue-tracker',
  'database', 'browser', 'container', 'monitoring', 'ai', 'deployment',
  'communication', 'filesystem', 'productivity', 'custom',
];

export interface PreparedServer {
  fields: {
    workspaceId: string | null;
    name: string;
    displayName: string;
    transport: McpTransport;
    command: string | null;
    args: string[];
    cwd: string | null;
    url: string | null;
    enabled: boolean;
    startup: McpStartup;
    trust: McpTrust;
    timeoutMs: number;
    restartPolicy: McpRestartPolicy;
    providers: { claude: boolean; cursor: boolean };
    allowPrivateNetwork: boolean;
    category: McpCategory;
    icon: string;
  };
  /** Non-secret env values only (secret entries are added by the manager). */
  env: Record<string, McpFieldValue>;
  headers: Record<string, McpFieldValue>;
  /** Plaintext secret env/header values to encrypt — never persisted in a row. */
  secretEnv: Record<string, string>;
  secretHeaders: Record<string, string>;
  /** Existing secret keys to preserve (edit flow — value not resent). */
  keepSecrets: string[];
}

function str(v: unknown, max: number): string {
  return String(v ?? '').slice(0, max);
}

function validatePairs(
  raw: Record<string, string> | undefined,
  secret: boolean,
  label: string,
): { fields: Record<string, McpFieldValue>; secrets: Record<string, string> } {
  const fields: Record<string, McpFieldValue> = {};
  const secrets: Record<string, string> = {};
  const entries = Object.entries(raw ?? {});
  if (entries.length > MCP_LIMITS.maxEnv) {
    throw new Error(`Too many ${label} entries (max ${MCP_LIMITS.maxEnv}).`);
  }
  for (const [k, v] of entries) {
    const key = String(k);
    if (!key || key.length > MCP_LIMITS.keyMax) throw new Error(`Invalid ${label} key.`);
    if (secret) {
      const value = String(v ?? '');
      if (value.length > MCP_LIMITS.secretMax) throw new Error(`${label} secret too long.`);
      if (value.length === 0) continue; // empty secret = don't set
      secrets[key] = value;
      fields[key] = { value: '', secret: true };
    } else {
      fields[key] = { value: str(v, MCP_LIMITS.valueMax), secret: false };
    }
  }
  return { fields, secrets };
}

export function prepareServer(
  input: McpServerInput,
  opts: { defaultTrust: McpTrust },
): PreparedServer {
  if (!input || typeof input !== 'object') throw new Error('Invalid server payload.');

  const name = str(input.name, MCP_LIMITS.nameMax).trim();
  if (!MCP_SERVER_NAME_RE.test(name)) {
    throw new Error('Server name must be letters, digits, hyphens or underscores.');
  }
  if (MCP_RESERVED_NAMES.has(name)) throw new Error(`"${name}" is a reserved server name.`);

  const transport = input.transport;
  if (!TRANSPORTS.includes(transport)) throw new Error('Unknown transport.');

  let command: string | null = null;
  let args: string[] = [];
  let cwd: string | null = null;
  let url: string | null = null;

  if (transport === 'stdio') {
    command = str(input.command, MCP_LIMITS.commandMax).trim();
    if (!command) throw new Error('A stdio server needs a command.');
    const rawArgs = Array.isArray(input.args) ? input.args : [];
    if (rawArgs.length > MCP_LIMITS.maxArgs) throw new Error(`Too many arguments (max ${MCP_LIMITS.maxArgs}).`);
    args = rawArgs.map((a) => str(a, MCP_LIMITS.argMax));
    const rawCwd = str(input.cwd, MCP_LIMITS.cwdMax).trim();
    cwd = rawCwd || null;
  } else {
    const raw = str(input.url, MCP_LIMITS.urlMax).trim();
    if (!raw) throw new Error('A remote server needs a URL.');
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error('Invalid server URL.');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Server URL must be http or https.');
    }
    if (parsed.username || parsed.password) {
      throw new Error('Put credentials in a header, not the URL.');
    }
    url = raw;
  }

  const env = validatePairs(input.env, false, 'environment');
  const secretEnv = validatePairs(input.secretEnv, true, 'environment');
  const headers = validatePairs(input.headers, false, 'header');
  const secretHeaders = validatePairs(input.secretHeaders, true, 'header');

  const trust: McpTrust = input.trust === 'trusted' || input.trust === 'ask' ? input.trust : opts.defaultTrust;
  const startup: McpStartup = input.startup === 'eager' ? 'eager' : 'on-demand';
  const restartPolicy: McpRestartPolicy = input.restartPolicy === 'never' ? 'never' : 'on-failure';
  const category: McpCategory =
    input.category && CATEGORIES.includes(input.category)
      ? input.category
      : categorizeServer(name, command ?? undefined, url ?? undefined);

  const timeoutMs = Math.round(
    Math.min(MCP_LIMITS.timeoutMs.max, Math.max(MCP_LIMITS.timeoutMs.min, Number(input.timeoutMs) || MCP_LIMITS.timeoutMs.default)),
  );

  const keepSecrets = Array.isArray(input.keepSecrets)
    ? input.keepSecrets.filter((k): k is string => typeof k === 'string').slice(0, MCP_LIMITS.maxEnv * 2)
    : [];

  return {
    fields: {
      workspaceId: typeof input.workspaceId === 'string' && input.workspaceId ? input.workspaceId : null,
      name,
      displayName: str(input.displayName, MCP_LIMITS.displayNameMax).trim() || name,
      transport,
      command,
      args,
      cwd,
      url,
      enabled: input.enabled !== false,
      startup,
      trust,
      timeoutMs,
      restartPolicy,
      providers: {
        claude: input.providers?.claude !== false,
        cursor: input.providers?.cursor !== false,
      },
      allowPrivateNetwork: !!input.allowPrivateNetwork,
      category,
      icon: str(input.icon, 64).trim(),
    },
    env: env.fields,
    headers: headers.fields,
    secretEnv: secretEnv.secrets,
    secretHeaders: secretHeaders.secrets,
    keepSecrets,
  };
}
