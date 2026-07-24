/**
 * One MCP server row in the MCP workspace list. Collapsed: category icon + name
 * + transport/tool-count status line + a shared status pill (mcpStatusMeta) +
 * enable toggle. Expanded: details, discovered tools, and the operational
 * controls (connect/disconnect, test, refresh tools, edit, remove). Editing
 * reuses {@link McpServerForm}. Mirrors the ProviderStatusRow / ServicesStrip
 * idioms — token colors only, no off-palette styling.
 */
import { useState } from 'react';
import {
  Boxes,
  Brain,
  ChevronDown,
  ChevronRight,
  Cloud,
  Database,
  FileSearch,
  FolderTree,
  GitBranch,
  Globe,
  KeyRound,
  ListChecks,
  Loader2,
  MessageSquare,
  RotateCcw,
  Rocket,
  ScrollText,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Container,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import type { McpCategory, McpLogLine, McpProbeResult, McpServerInfo } from '@shared/types';
import { cn } from '@/renderer/lib/cn';
import { mcpStatusMeta } from '@/renderer/features/agent/status';
import { useMcpStore } from '@/renderer/stores/useMcpStore';
import { ActionButton, Toggle } from '../controls';
import { McpServerForm } from './McpServerForm';

const CATEGORY_ICON: Record<McpCategory, LucideIcon> = {
  'version-control': GitBranch,
  search: Search,
  memory: Brain,
  documentation: FileSearch,
  cloud: Cloud,
  'issue-tracker': ListChecks,
  database: Database,
  browser: Globe,
  container: Container,
  monitoring: Activity,
  ai: Sparkles,
  deployment: Rocket,
  communication: MessageSquare,
  filesystem: FolderTree,
  productivity: Boxes,
  custom: Server,
};

const LOG_LEVEL_COLOR: Record<McpLogLine['level'], string> = {
  info: 'text-muted',
  warn: 'text-warning',
  error: 'text-danger',
};

export function McpServerRow({ server }: { server: McpServerInfo }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [probe, setProbe] = useState<McpProbeResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logLines, setLogLines] = useState<McpLogLine[] | null>(null);
  const setEnabled = useMcpStore((s) => s.setEnabled);
  const test = useMcpStore((s) => s.test);
  const refreshTools = useMcpStore((s) => s.refreshTools);
  const logs = useMcpStore((s) => s.logs);
  const remove = useMcpStore((s) => s.remove);
  const update = useMcpStore((s) => s.update);

  const runTest = async () => {
    setTesting(true);
    try {
      setProbe(await test(server.id));
    } finally {
      setTesting(false);
    }
  };

  const loadLogs = async () => {
    setLogLines(await logs(server.id));
  };

  const toggleLogs = () => {
    setShowLogs((v) => {
      const next = !v;
      if (next) void loadLogs();
      return next;
    });
  };

  const meta = mcpStatusMeta(server.runtime.status);
  const Icon = CATEGORY_ICON[server.category] ?? Server;
  const toolCount = server.runtime.tools.length;
  const detail = server.transport === 'stdio' ? server.command : server.url;

  return (
    <div className="rounded-md border border-line bg-surface-2">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Collapse' : 'Expand'}
          className="text-faint hover:text-fg"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-elevated text-muted">
          <Icon size={16} />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 text-[13px] text-fg">
            {server.displayName}
            {server.trust === 'trusted' && <ShieldCheck size={11} className="text-success" aria-label="Trusted" />}
          </span>
          <span className="truncate text-[11px] text-faint">
            {server.transport} · {toolCount} tool{toolCount === 1 ? '' : 's'}
            {server.runtime.error ? ` · ${server.runtime.error}` : detail ? ` · ${detail}` : ''}
          </span>
        </div>
        <span
          title={server.runtime.error ?? meta.label}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-elevated px-2 py-0.5 text-[10px] text-muted"
        >
          <meta.icon size={12} className={cn(meta.text, meta.spin && 'animate-spin')} aria-hidden />
          {meta.label}
        </span>
        <Toggle
          checked={server.enabled}
          onChange={(on) => void setEnabled(server.id, on)}
          aria-label={`${server.enabled ? 'Disable' : 'Enable'} ${server.displayName}`}
        />
      </div>

      {open && (
        <div className="border-t border-line px-3 py-3">
          {editing ? (
            <McpServerForm
              initial={server}
              onCancel={() => setEditing(false)}
              onSubmit={async (input) => {
                const saved = await update(server.id, input);
                if (saved) setEditing(false);
              }}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                {server.providers.claude && <Badge>Claude</Badge>}
                {server.providers.cursor && <Badge>Cursor</Badge>}
                {server.source !== 'user' && <Badge muted>imported</Badge>}
                {server.workspaceId ? <Badge muted>workspace</Badge> : <Badge muted>global</Badge>}
                {server.runtime.latencyMs != null && server.runtime.status === 'connected' && (
                  <Badge muted>{server.runtime.latencyMs}ms</Badge>
                )}
              </div>

              {toolCount > 0 && (
                <div className="flex flex-wrap gap-1">
                  {server.runtime.tools.slice(0, 24).map((t) => (
                    <span
                      key={t.name}
                      title={t.description}
                      className="rounded border border-line bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted"
                    >
                      {t.name}
                    </span>
                  ))}
                  {toolCount > 24 && <span className="text-[10px] text-faint">+{toolCount - 24} more</span>}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {server.enabled ? (
                  <ActionButton label="Disconnect" onClick={() => void setEnabled(server.id, false)} />
                ) : (
                  <ActionButton label="Connect" onClick={() => void setEnabled(server.id, true)} primary />
                )}
                <ActionButton label={testing ? 'Testing…' : 'Test'} onClick={() => void runTest()} />
                <button
                  type="button"
                  onClick={() => void refreshTools(server.id)}
                  className="flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-[11px] text-muted hover:text-fg"
                >
                  <RotateCcw size={11} /> Refresh tools
                </button>
                <button
                  type="button"
                  onClick={toggleLogs}
                  aria-pressed={showLogs}
                  className={cn(
                    'flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-[11px] hover:text-fg',
                    showLogs ? 'text-fg' : 'text-muted',
                  )}
                >
                  <ScrollText size={11} /> Logs
                </button>
                <ActionButton label="Edit" onClick={() => setEditing(true)} />
                {confirmRemove ? (
                  <>
                    <ActionButton label="Confirm remove" onClick={() => void remove(server.id)} danger />
                    <ActionButton label="Keep" onClick={() => setConfirmRemove(false)} />
                  </>
                ) : (
                  <ActionButton label="Remove" onClick={() => setConfirmRemove(true)} danger />
                )}
              </div>

              {probe && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  {testing ? (
                    <Loader2 size={12} className="animate-spin text-accent" aria-hidden />
                  ) : probe.ok ? (
                    <span className="text-success">
                      OK · {probe.tools.length} tool{probe.tools.length === 1 ? '' : 's'}
                      {probe.latencyMs != null ? ` · ${probe.latencyMs}ms` : ''}
                    </span>
                  ) : probe.status === 'needs-auth' ? (
                    <span className="flex items-center gap-1 text-warning">
                      <KeyRound size={12} aria-hidden /> Authentication required
                    </span>
                  ) : (
                    <span className="text-danger">{probe.error ?? 'Connection failed'}</span>
                  )}
                </div>
              )}

              {showLogs && (
                <div className="max-h-40 overflow-y-auto rounded-md border border-line bg-elevated p-2">
                  {logLines === null ? (
                    <span className="text-[10px] text-faint">Loading logs…</span>
                  ) : logLines.length === 0 ? (
                    <span className="text-[10px] text-faint">No log entries yet.</span>
                  ) : (
                    <div className="flex flex-col gap-0.5 font-mono text-[10px]">
                      {logLines.map((line, i) => (
                        <div key={i} className="flex gap-2">
                          <span className="shrink-0 text-faint">
                            {new Date(line.at).toLocaleTimeString()}
                          </span>
                          <span className={LOG_LEVEL_COLOR[line.level]}>{line.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Badge({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        'rounded-full border border-line bg-elevated px-2 py-0.5 text-[10px]',
        muted ? 'text-faint' : 'text-muted',
      )}
    >
      {children}
    </span>
  );
}
