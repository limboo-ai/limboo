/**
 * MCP store — the renderer-side mirror of the main-process McpManager. Holds the
 * active-scope server list (global + active workspace) with live runtime, and
 * mirrors `mcp:servers-changed` (full list) + `mcp:server-status` (one server's
 * runtime) pushes. All mutations go through `window.limboo.mcp`; in a plain
 * browser preview (no preload) it degrades to empty state. Secrets never cross —
 * the list carries only the `secret: true` flag, never a plaintext value.
 */
import { create } from 'zustand';
import type { McpLogLine, McpProbeResult, McpServerInfo, McpServerInput } from '@shared/types';
import { useUIStore } from './useUIStore';

interface McpState {
  servers: McpServerInfo[];
  hydrated: boolean;

  hydrate: () => void;
  load: () => Promise<void>;
  add: (input: McpServerInput) => Promise<McpServerInfo | null>;
  update: (id: string, input: McpServerInput) => Promise<McpServerInfo | null>;
  remove: (id: string) => Promise<void>;
  setEnabled: (id: string, on: boolean) => Promise<void>;
  connect: (id: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  test: (id: string) => Promise<McpProbeResult | null>;
  refreshTools: (id: string) => Promise<void>;
  logs: (id: string) => Promise<McpLogLine[]>;
  importFromProviders: () => Promise<void>;
  exportToProject: (ids: string[]) => Promise<void>;
}

function mcpApi() {
  return window.limboo?.mcp;
}

function toastError(title: string, err: unknown): void {
  useUIStore.getState().addToast({
    title,
    description: err instanceof Error ? err.message : String(err),
    tone: 'danger',
  });
}

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    const api = mcpApi();
    if (!api) return;
    api.onServersChanged(({ servers }) => set({ servers }));
    api.onServerStatus(({ id, runtime }) =>
      set((s) => ({
        servers: s.servers.map((srv) => (srv.id === id ? { ...srv, runtime } : srv)),
      })),
    );
    void get().load();
  },

  load: async () => {
    const api = mcpApi();
    if (!api) return;
    try {
      set({ servers: await api.list() });
    } catch {
      /* no workspace / db — leave empty */
    }
  },

  add: async (input) => {
    try {
      const server = await mcpApi()?.add(input);
      return server ?? null;
    } catch (err) {
      toastError('Could not add MCP server', err);
      return null;
    }
  },

  update: async (id, input) => {
    try {
      const server = await mcpApi()?.update(id, input);
      return server ?? null;
    } catch (err) {
      toastError('Could not save MCP server', err);
      return null;
    }
  },

  remove: async (id) => {
    try {
      await mcpApi()?.remove(id);
    } catch (err) {
      toastError('Could not remove MCP server', err);
    }
  },

  setEnabled: async (id, on) => {
    try {
      await mcpApi()?.setEnabled(id, on);
    } catch (err) {
      toastError('Could not update MCP server', err);
    }
  },

  connect: async (id) => {
    try {
      await mcpApi()?.connect(id);
    } catch (err) {
      toastError('Could not connect MCP server', err);
    }
  },

  disconnect: async (id) => {
    try {
      await mcpApi()?.disconnect(id);
    } catch (err) {
      toastError('Could not disconnect MCP server', err);
    }
  },

  test: async (id) => {
    try {
      return (await mcpApi()?.test(id)) ?? null;
    } catch (err) {
      toastError('Connection test failed', err);
      return null;
    }
  },

  refreshTools: async (id) => {
    try {
      await mcpApi()?.refreshTools(id);
    } catch (err) {
      toastError('Could not refresh tools', err);
    }
  },

  logs: async (id) => {
    try {
      return (await mcpApi()?.logs(id)) ?? [];
    } catch {
      return [];
    }
  },

  importFromProviders: async () => {
    try {
      const n = (await mcpApi()?.importFromProviders()) ?? 0;
      useUIStore.getState().addToast({
        title: n > 0 ? `Imported ${n} MCP server(s)` : 'No new MCP servers found',
        tone: n > 0 ? 'success' : 'info',
      });
    } catch (err) {
      toastError('Import failed', err);
    }
  },

  exportToProject: async (ids) => {
    try {
      const res = await mcpApi()?.exportToProject(ids);
      const wrote = [res?.cursor && '.cursor/mcp.json', res?.claude && '.mcp.json'].filter(Boolean);
      useUIStore.getState().addToast({
        title: wrote.length ? `Exported to ${wrote.join(' + ')}` : 'Nothing exported',
        tone: wrote.length ? 'success' : 'info',
      });
    } catch (err) {
      toastError('Export failed', err);
    }
  },
}));
