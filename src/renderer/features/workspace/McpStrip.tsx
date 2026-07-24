/**
 * Compact active-MCP strip, docked just below the Composer. Shows every MCP
 * server in scope with a live status dot, tool count, and a one-click
 * connect/disconnect toggle (enable drives injection into the next run). The
 * gear opens Settings ▸ MCP Servers for full management. Mirrors the
 * ServicesStrip idiom (h-8 row, status-dot map, IconButton controls, token
 * colors only). Renders nothing when no servers are configured — no layout shift.
 */
import { useEffect } from 'react';
import { Plug, Settings2, Unplug } from 'lucide-react';
import { IconButton } from '@/renderer/components/ui';
import { cn } from '@/renderer/lib/cn';
import { mcpStatusMeta } from '@/renderer/features/agent/status';
import { useMcpStore } from '@/renderer/stores/useMcpStore';
import { useUIStore } from '@/renderer/stores/useUIStore';

export function McpStrip() {
  const servers = useMcpStore((s) => s.servers);
  const hydrate = useMcpStore((s) => s.hydrate);
  const setEnabled = useMcpStore((s) => s.setEnabled);
  const openModal = useUIStore((s) => s.openModal);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (servers.length === 0) return null;

  return (
    <div className="flex h-8 shrink-0 items-center gap-3 overflow-x-auto border-t border-line bg-surface px-4">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-faint">MCP</span>
      {servers.map((server) => {
        const meta = mcpStatusMeta(server.runtime.status);
        const toolCount = server.runtime.tools.length;
        return (
          <div key={server.id} className="flex shrink-0 items-center gap-1.5 text-[11px]">
            <span className={cn('h-1.5 w-1.5 rounded-full', server.enabled ? meta.dot : 'bg-faint')} />
            <span className={cn('font-medium', server.enabled ? 'text-fg' : 'text-faint')}>
              {server.displayName}
            </span>
            {server.enabled && server.runtime.status === 'connected' && toolCount > 0 && (
              <span className="text-faint">{toolCount}</span>
            )}
            <IconButton
              label={server.enabled ? `Disconnect ${server.displayName}` : `Connect ${server.displayName}`}
              size="sm"
              onClick={() => void setEnabled(server.id, !server.enabled)}
            >
              {server.enabled ? <Unplug size={11} /> : <Plug size={11} />}
            </IconButton>
          </div>
        );
      })}
      <IconButton label="Manage MCP servers" size="sm" className="ml-auto" onClick={() => openModal('settings')}>
        <Settings2 size={11} />
      </IconButton>
    </div>
  );
}
