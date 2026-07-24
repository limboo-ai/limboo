/**
 * MCP Servers settings — the management workspace for the provider-independent
 * MCP platform. Lists every configured server (global + active workspace),
 * grouped by auto-assigned category, each a {@link McpServerRow} with live
 * status + operational controls. Add servers inline, import the ones already in
 * the repo's provider configs, and tune the global MCP preferences. Both Claude
 * and Cursor consume this one registry — the UI never mentions a provider.
 */
import { useEffect, useMemo, useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { MCP_LIMITS } from '@shared/constants';
import type { McpCategory, McpServerInput } from '@shared/types';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { useMcpStore } from '@/renderer/stores/useMcpStore';
import { Field, Section, SegmentedControl, Select, Toggle } from '../controls';
import { McpServerRow } from './McpServerRow';
import { McpServerForm } from './McpServerForm';

const CATEGORY_LABEL: Record<McpCategory, string> = {
  'version-control': 'Version control',
  search: 'Search',
  memory: 'Memory',
  documentation: 'Documentation',
  cloud: 'Cloud platforms',
  'issue-tracker': 'Issue trackers',
  database: 'Databases',
  browser: 'Browsers',
  container: 'Containers',
  monitoring: 'Monitoring',
  ai: 'AI services',
  deployment: 'Deployment',
  communication: 'Communication',
  filesystem: 'File systems',
  productivity: 'Productivity',
  custom: 'Custom tools',
};

const HEARTBEAT_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 30000, label: '30s' },
  { value: 60000, label: '1m' },
  { value: 300000, label: '5m' },
  { value: 900000, label: '15m' },
];

export function McpPanel() {
  const mcp = useSettingsStore((s) => s.settings.mcp);
  const update = useSettingsStore((s) => s.update);
  const servers = useMcpStore((s) => s.servers);
  const hydrate = useMcpStore((s) => s.hydrate);
  const add = useMcpStore((s) => s.add);
  const importFromProviders = useMcpStore((s) => s.importFromProviders);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const set = <K extends keyof typeof mcp>(key: K, value: (typeof mcp)[K]) =>
    void update({ mcp: { [key]: value } });

  const grouped = useMemo(() => {
    const map = new Map<McpCategory, typeof servers>();
    for (const s of servers) {
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return [...map.entries()].sort((a, b) => CATEGORY_LABEL[a[0]].localeCompare(CATEGORY_LABEL[b[0]]));
  }, [servers]);

  const onAdd = async (input: McpServerInput) => {
    const created = await add(input);
    if (created) setAdding(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <Section
        title="Servers"
        hint="Model Context Protocol servers Limboo makes available to every coding agent. One registry — Claude and Cursor both connect to the same servers, secrets, and permissions."
      >
        <div className="flex items-center gap-2 px-2 py-1">
          <button
            type="button"
            data-field-id="mcpAddServer"
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1 rounded-md border border-accent/50 bg-elevated px-2 py-1 text-[11px] text-fg hover:border-accent"
          >
            <Plus size={12} /> Add server
          </button>
          <button
            type="button"
            data-field-id="mcpImport"
            onClick={() => void importFromProviders()}
            className="flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-[11px] text-muted hover:text-fg"
          >
            <Download size={12} /> Import from repo
          </button>
          <span className="ml-auto text-[11px] text-faint">
            {servers.length}/{MCP_LIMITS.maxServers}
          </span>
        </div>

        {adding && (
          <div className="rounded-md border border-line-strong bg-surface-2 p-3">
            <McpServerForm onCancel={() => setAdding(false)} onSubmit={onAdd} />
          </div>
        )}

        {servers.length === 0 && !adding && (
          <div className="rounded-md border border-dashed border-line px-3 py-8 text-center">
            <p className="text-[12px] text-muted">No MCP servers yet.</p>
            <p className="mt-1 text-[11px] text-faint">
              Add one, or import the servers already configured in this repo.
            </p>
          </div>
        )}

        {grouped.map(([category, list]) => (
          <div key={category} className="flex flex-col gap-1.5">
            <span className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
              {CATEGORY_LABEL[category]}
            </span>
            {list.map((server) => (
              <McpServerRow key={server.id} server={server} />
            ))}
          </div>
        ))}
      </Section>

      <Section title="MCP preferences">
        <Field id="mcpEnabled" label="Enable MCP" hint="Master switch for the registry, health probes, and injection.">
          <Toggle checked={mcp.enabled} onChange={(v) => set('enabled', v)} aria-label="Enable MCP" />
        </Field>
        <Field
          id="mcpDefaultTrust"
          label="Default trust for new servers"
          hint="Trusted servers auto-approve their tool calls; ask prompts each time."
        >
          <SegmentedControl
            value={mcp.defaultTrust}
            onChange={(v) => set('defaultTrust', v)}
            options={[
              { value: 'ask', label: 'Ask' },
              { value: 'trusted', label: 'Trusted' },
            ]}
          />
        </Field>
        <Field
          id="mcpAllowPrivate"
          label="Allow private / loopback hosts"
          hint="Off blocks remote servers resolving to private IPs (SSRF hardening). The cloud-metadata IP is always blocked."
        >
          <Toggle checked={mcp.allowPrivateNetwork} onChange={(v) => set('allowPrivateNetwork', v)} aria-label="Allow private hosts" />
        </Field>
        <Field id="mcpHeartbeat" label="Health-probe interval" hint="How often enabled servers are re-probed.">
          <Select value={mcp.heartbeatInterval} onChange={(v) => set('heartbeatInterval', v)} options={HEARTBEAT_OPTIONS} />
        </Field>
        <Field id="mcpInjectClaude" label="Inject into Claude runs">
          <Toggle checked={mcp.injectIntoClaude} onChange={(v) => set('injectIntoClaude', v)} aria-label="Inject into Claude" />
        </Field>
        <Field id="mcpInjectCursor" label="Inject into Cursor runs">
          <Toggle checked={mcp.injectIntoCursor} onChange={(v) => set('injectIntoCursor', v)} aria-label="Inject into Cursor" />
        </Field>
        <Field id="mcpAutoImportCursor" label="Auto-detect Cursor mcp.json" hint="Discover servers from .cursor/mcp.json when a workspace opens.">
          <Toggle checked={mcp.autoImport.cursor} onChange={(v) => update({ mcp: { autoImport: { cursor: v } } })} aria-label="Auto-detect Cursor" />
        </Field>
        <Field id="mcpAutoImportClaude" label="Auto-detect Claude .mcp.json">
          <Toggle checked={mcp.autoImport.claude} onChange={(v) => update({ mcp: { autoImport: { claude: v } } })} aria-label="Auto-detect Claude" />
        </Field>
      </Section>
    </div>
  );
}
