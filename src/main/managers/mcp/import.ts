/**
 * Read-only discovery of servers already configured for either provider, so the
 * MCP workspace can surface them without the user re-entering anything. Parses
 * (never writes) the documented locations:
 *   - Cursor: <root>/.cursor/mcp.json, ~/.cursor/mcp.json
 *   - Claude: <root>/.mcp.json, ~/.claude.json (projects[<root>] + top-level)
 * Prototype-pollution keys are dropped; imported values (including ${env:…} /
 * ${VAR} interpolation) are kept verbatim as NON-secret — the user can promote
 * one to a stored secret afterward. Limboo never owns these files; the registry
 * is the source of truth and injects config per run.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { McpServerInput, McpSource, McpTransport } from '@shared/types';

export interface ImportCandidate {
  input: McpServerInput;
  source: McpSource;
}

const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

function readObject(file: string): Record<string, unknown> | null {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function strMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (UNSAFE.has(k)) continue;
    if (typeof val === 'string') out[k] = val;
  }
  return out;
}

function toInput(name: string, def: unknown): McpServerInput | null {
  if (UNSAFE.has(name) || !def || typeof def !== 'object') return null;
  const d = def as Record<string, unknown>;
  const command = typeof d.command === 'string' ? d.command : undefined;
  const url = typeof d.url === 'string' ? d.url : undefined;
  const type = typeof d.type === 'string' ? d.type : undefined;
  if (command) {
    return {
      name,
      transport: 'stdio',
      command,
      args: strArray(d.args),
      env: strMap(d.env),
      cwd: typeof d.cwd === 'string' ? d.cwd : undefined,
    };
  }
  if (url) {
    const transport: McpTransport = type === 'sse' ? 'sse' : 'http';
    return { name, transport, url, headers: strMap(d.headers) };
  }
  return null;
}

function collect(
  servers: unknown,
  source: McpSource,
  seen: Set<string>,
  out: ImportCandidate[],
): void {
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return;
  for (const [name, def] of Object.entries(servers as Record<string, unknown>)) {
    if (seen.has(name)) continue;
    const input = toInput(name, def);
    if (!input) continue;
    seen.add(name);
    out.push({ input, source });
  }
}

export function importProviderConfigs(
  root: string,
  opts: { cursor: boolean; claude: boolean },
): ImportCandidate[] {
  const out: ImportCandidate[] = [];
  const seen = new Set<string>();
  const home = os.homedir();

  if (opts.cursor) {
    for (const file of [path.join(root, '.cursor', 'mcp.json'), path.join(home, '.cursor', 'mcp.json')]) {
      const obj = readObject(file);
      if (obj) collect(obj.mcpServers, 'imported-cursor', seen, out);
    }
  }

  if (opts.claude) {
    const projectMcp = readObject(path.join(root, '.mcp.json'));
    if (projectMcp) collect(projectMcp.mcpServers, 'imported-claude', seen, out);

    const claudeJson = readObject(path.join(home, '.claude.json'));
    if (claudeJson) {
      const projects = claudeJson.projects;
      if (projects && typeof projects === 'object') {
        const forRoot = (projects as Record<string, unknown>)[root];
        if (forRoot && typeof forRoot === 'object') {
          collect((forRoot as Record<string, unknown>).mcpServers, 'imported-claude', seen, out);
        }
      }
      collect(claudeJson.mcpServers, 'imported-claude', seen, out);
    }
  }

  return out;
}
