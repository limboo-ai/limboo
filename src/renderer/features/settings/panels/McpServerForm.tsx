/**
 * Add / edit form for one MCP server. Shared by the "Add server" flow and the
 * inline edit in {@link McpServerRow}. Transport-aware (stdio vs remote), with a
 * dedicated encrypted-secret section: secret values are write-only (never shown
 * back, matching SecretInput), and existing secrets are preserved unless removed.
 * Purely presentational — it emits an {@link McpServerInput}; all validation +
 * secret storage happen in the main process.
 */
import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { McpCategory, McpServerInfo, McpServerInput, McpTransport } from '@shared/types';
import { cn } from '@/renderer/lib/cn';
import { ActionButton, SecretInput, SegmentedControl, Select, StackedField, TextInput, Toggle } from '../controls';

const CATEGORY_OPTIONS: { value: McpCategory; label: string }[] = [
  { value: 'custom', label: 'Custom' },
  { value: 'version-control', label: 'Version control' },
  { value: 'issue-tracker', label: 'Issue tracker' },
  { value: 'database', label: 'Database' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'deployment', label: 'Deployment' },
  { value: 'container', label: 'Container' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'communication', label: 'Communication' },
  { value: 'browser', label: 'Browser' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'ai', label: 'AI' },
  { value: 'search', label: 'Search' },
  { value: 'memory', label: 'Memory' },
  { value: 'filesystem', label: 'File system' },
  { value: 'productivity', label: 'Productivity' },
];

const TIMEOUT_OPTIONS = [
  { value: 15000, label: '15s' },
  { value: 30000, label: '30s' },
  { value: 60000, label: '1m' },
  { value: 120000, label: '2m' },
  { value: 300000, label: '5m' },
];

interface SecretRow {
  id: string;
  name: string;
  value: string;
}

let secretRowSeq = 0;

function nonSecretPairs(map: Record<string, { value: string; secret: boolean }> | undefined, sep: string): string {
  if (!map) return '';
  return Object.entries(map)
    .filter(([, v]) => !v.secret)
    .map(([k, v]) => `${k}${sep}${v.value}`)
    .join('\n');
}

function existingSecretKeys(map: Record<string, { value: string; secret: boolean }> | undefined): string[] {
  return map ? Object.keys(map).filter((k) => map[k].secret) : [];
}

function parsePairs(text: string, sep: RegExp): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(sep);
    if (!m) continue;
    const key = m[1].trim();
    if (key) out[key] = m[2].trim();
  }
  return out;
}

export function McpServerForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: McpServerInfo;
  onSubmit: (input: McpServerInput) => void | Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [transport, setTransport] = useState<McpTransport>(initial?.transport ?? 'stdio');
  const [command, setCommand] = useState(initial?.command ?? '');
  const [argsText, setArgsText] = useState((initial?.args ?? []).join('\n'));
  const [cwd, setCwd] = useState(initial?.cwd ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [envText, setEnvText] = useState(nonSecretPairs(initial?.env, '='));
  const [headersText, setHeadersText] = useState(nonSecretPairs(initial?.headers, ': '));
  const [trust, setTrust] = useState(initial?.trust ?? 'ask');
  const [startup, setStartup] = useState(initial?.startup ?? 'on-demand');
  const [claude, setClaude] = useState(initial?.providers.claude ?? true);
  const [cursor, setCursor] = useState(initial?.providers.cursor ?? true);
  const [timeoutMs, setTimeoutMs] = useState(initial?.timeoutMs ?? 60000);
  const [allowPrivate, setAllowPrivate] = useState(initial?.allowPrivateNetwork ?? false);
  const [category, setCategory] = useState<McpCategory>(initial?.category ?? 'custom');

  const stdio = transport === 'stdio';
  const secretMap = stdio ? initial?.env : initial?.headers;
  const [keptSecrets, setKeptSecrets] = useState<string[]>(() => existingSecretKeys(secretMap));
  const [secretRows, setSecretRows] = useState<SecretRow[]>([]);

  const originalSecrets = useMemo(() => existingSecretKeys(secretMap), [secretMap]);

  const addSecretRow = () =>
    setSecretRows((rows) => [...rows, { id: `s${secretRowSeq++}`, name: '', value: '' }]);
  const updateSecretRow = (id: string, patch: Partial<SecretRow>) =>
    setSecretRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeSecretRow = (id: string) => setSecretRows((rows) => rows.filter((r) => r.id !== id));

  const canSubmit = name.trim().length > 0 && (stdio ? command.trim().length > 0 : url.trim().length > 0);

  const submit = () => {
    if (!canSubmit || submitting) return;
    const secretEntries: Record<string, string> = {};
    for (const r of secretRows) {
      if (r.name.trim() && r.value) secretEntries[r.name.trim()] = r.value;
    }
    const input: McpServerInput = {
      name: name.trim(),
      displayName: displayName.trim() || name.trim(),
      transport,
      trust,
      startup,
      providers: { claude, cursor },
      timeoutMs,
      allowPrivateNetwork: allowPrivate,
      category,
      enabled: initial?.enabled ?? false,
      keepSecrets: keptSecrets,
    };
    if (stdio) {
      input.command = command.trim();
      input.args = argsText.split('\n').map((l) => l.trim()).filter(Boolean);
      input.cwd = cwd.trim() || undefined;
      input.env = parsePairs(envText, /^([^=]+)=(.*)$/);
      input.secretEnv = secretEntries;
    } else {
      input.url = url.trim();
      input.headers = parsePairs(headersText, /^([^:]+):(.*)$/);
      input.secretHeaders = secretEntries;
    }
    void onSubmit(input);
  };

  return (
    <div className="flex flex-col gap-1">
      <StackedField label="Name" hint="Machine name used in the mcp__<name>__ tool namespace.">
        <TextInput value={name} placeholder="github" onChange={setName} />
      </StackedField>
      <StackedField label="Display name">
        <TextInput value={displayName} placeholder="GitHub" onChange={setDisplayName} />
      </StackedField>
      <StackedField label="Transport">
        {editing ? (
          <span className="text-[12px] text-faint">{transport} (fixed after creation)</span>
        ) : (
          <SegmentedControl<McpTransport>
            value={transport}
            onChange={setTransport}
            options={[
              { value: 'stdio', label: 'stdio (local)' },
              { value: 'http', label: 'HTTP' },
              { value: 'sse', label: 'SSE' },
            ]}
          />
        )}
      </StackedField>

      {stdio ? (
        <>
          <StackedField label="Command" hint="Executable — argv only, no shell.">
            <TextInput value={command} placeholder="npx" onChange={setCommand} />
          </StackedField>
          <StackedField label="Arguments" hint="One per line.">
            <textarea
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/path'}
              className="w-full rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[12px] text-fg placeholder:text-faint focus:border-line-strong focus:outline-none"
            />
          </StackedField>
          <StackedField label="Working directory" hint="Optional.">
            <TextInput value={cwd} placeholder="(server default)" onChange={setCwd} />
          </StackedField>
          <StackedField label="Environment variables" hint="One KEY=VALUE per line (non-secret).">
            <textarea
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              rows={2}
              spellCheck={false}
              placeholder="NODE_ENV=production"
              className="w-full rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[12px] text-fg placeholder:text-faint focus:border-line-strong focus:outline-none"
            />
          </StackedField>
        </>
      ) : (
        <>
          <StackedField label="URL" hint="Streamable HTTP or SSE endpoint.">
            <TextInput value={url} placeholder="https://api.example.com/mcp" onChange={setUrl} />
          </StackedField>
          <StackedField label="Headers" hint="One Name: Value per line (non-secret).">
            <textarea
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              rows={2}
              spellCheck={false}
              placeholder="X-Api-Version: 2024-01"
              className="w-full rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[12px] text-fg placeholder:text-faint focus:border-line-strong focus:outline-none"
            />
          </StackedField>
        </>
      )}

      <StackedField
        label={stdio ? 'Secret environment values' : 'Secret headers'}
        hint="Encrypted with the OS keychain — never written to a config file or shown again."
      >
        <div className="flex flex-col gap-1.5">
          {originalSecrets.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {originalSecrets.map((key) => {
                const kept = keptSecrets.includes(key);
                return (
                  <span
                    key={key}
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
                      kept ? 'border-line bg-surface-2 text-muted' : 'border-line bg-surface-2 text-faint line-through',
                    )}
                  >
                    {key}
                    <button
                      type="button"
                      aria-label={kept ? `Remove ${key}` : `Keep ${key}`}
                      onClick={() =>
                        setKeptSecrets((k) => (kept ? k.filter((x) => x !== key) : [...k, key]))
                      }
                      className="text-faint hover:text-fg"
                    >
                      <X size={10} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {secretRows.map((row) => (
            <div key={row.id} className="flex items-center gap-1.5">
              <TextInput
                value={row.name}
                placeholder={stdio ? 'GITHUB_TOKEN' : 'Authorization'}
                onChange={(v) => updateSecretRow(row.id, { name: v })}
              />
              <SecretInput
                value={row.value}
                placeholder="secret value"
                onChange={(v) => updateSecretRow(row.id, { value: v })}
              />
              <button
                type="button"
                aria-label="Remove secret"
                onClick={() => removeSecretRow(row.id)}
                className="text-faint hover:text-danger"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addSecretRow}
            className="flex w-fit items-center gap-1 text-[11px] text-muted hover:text-fg"
          >
            <Plus size={12} /> Add secret
          </button>
        </div>
      </StackedField>

      <StackedField label="Trust" hint="Trusted servers auto-approve their tool calls (still gated by mode).">
        <SegmentedControl
          value={trust}
          onChange={setTrust}
          options={[
            { value: 'ask', label: 'Ask each time' },
            { value: 'trusted', label: 'Trusted' },
          ]}
        />
      </StackedField>
      <StackedField label="Startup">
        <SegmentedControl
          value={startup}
          onChange={setStartup}
          options={[
            { value: 'on-demand', label: 'On demand' },
            { value: 'eager', label: 'Probe on activate' },
          ]}
        />
      </StackedField>
      <div className="flex items-center gap-4 px-2 py-1">
        <span className="text-[12px] text-muted">Visible to</span>
        <label className="flex items-center gap-1.5 text-[12px] text-fg">
          <Toggle checked={claude} onChange={setClaude} aria-label="Visible to Claude" /> Claude
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-fg">
          <Toggle checked={cursor} onChange={setCursor} aria-label="Visible to Cursor" /> Cursor
        </label>
      </div>
      <StackedField label="Tool timeout">
        <Select value={timeoutMs} onChange={setTimeoutMs} options={TIMEOUT_OPTIONS} />
      </StackedField>
      <StackedField label="Category">
        <Select value={category} onChange={(v) => setCategory(v as McpCategory)} options={CATEGORY_OPTIONS} />
      </StackedField>
      {!stdio && (
        <div className="flex items-center justify-between gap-4 px-2 py-1">
          <div className="flex min-w-0 flex-col">
            <span className="text-[12px] text-fg">Allow private / loopback hosts</span>
            <span className="text-[11px] text-faint">
              Off blocks private IPs (SSRF hardening). Enable for a local server on 127.0.0.1.
            </span>
          </div>
          <Toggle checked={allowPrivate} onChange={setAllowPrivate} aria-label="Allow private hosts" />
        </div>
      )}

      <div className="mt-2 flex justify-end gap-2">
        <ActionButton label="Cancel" onClick={onCancel} />
        <ActionButton label={editing ? 'Save' : 'Add server'} onClick={submit} primary />
      </div>
    </div>
  );
}
