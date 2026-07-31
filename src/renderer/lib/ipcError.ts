/**
 * Shared IPC failure handling for the renderer stores.
 *
 * Main-process handlers signal refusal by THROWING, which Electron delivers to
 * the renderer as a rejected `invoke` wrapped in its own envelope. Left alone
 * that becomes an unhandled rejection that silently aborts the caller, so every
 * store that talks to a throwing handler needs the same two pieces — and they
 * live here rather than being copied per store.
 */
import { useUIStore } from '@/renderer/stores/useUIStore';

/**
 * Electron wraps a rejected `ipcRenderer.invoke` as
 * `Error invoking remote method 'git:x': Error: git: <reason>`. Strip the
 * envelope (and the subsystem prefix) so a toast shows the reason the main
 * process actually gave.
 */
export function cleanIpcError(message: string): string {
  const stripped = message.replace(/^Error invoking remote method '[^']*':\s*/, '');
  return stripped.replace(/^Error:\s*/, '').replace(/^[a-z][\w-]*:\s*/, '');
}

/**
 * Run an action that can REJECT rather than return a result object, surfacing
 * the failure as a toast instead of an unhandled rejection.
 */
export async function guardIpc<T>(title: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    useUIStore.getState().addToast({
      title,
      description: err instanceof Error ? cleanIpcError(err.message) : String(err),
      tone: 'danger',
    });
    return undefined;
  }
}
