/**
 * IPC handlers for Runtime Telemetry. Registered through `handle()`, so every
 * call inherits sender-origin validation.
 *
 * The entire surface takes STRING IDS, ENUM LITERALS and ONE BOOLEAN — nothing
 * else. No renderer-supplied object crosses this boundary, so there is no
 * prototype-pollution surface to defend here at all (CLAUDE.md §6), and there
 * is no path to validate because the renderer never supplies one: `save` opens
 * the dialog in main and writes where the USER chose, the same contract
 * `graph:save` follows.
 *
 * Read + maintenance only. Snapshots are produced in main from the provider
 * event streams; the renderer never submits a measurement.
 */
import { IpcChannels } from '@shared/ipc-channels';
import { SESSION_LIMITS } from '@shared/constants';
import type { RuntimeExportFormat, RuntimeSnapshot, RuntimeUsageHistory } from '@shared/types';
import { handle } from './registry';
import type { RuntimeTelemetryManager } from '../managers/telemetry/RuntimeTelemetryManager';

function assertSessionId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || id.length === 0 || id.length > SESSION_LIMITS.idMax) {
    throw new Error('runtime: invalid session id');
  }
}

/** Membership check against a literal list — never a pattern match. */
const EXPORT_FORMATS: readonly string[] = ['json', 'csv'];

function assertExportFormat(v: unknown): asserts v is RuntimeExportFormat {
  if (typeof v !== 'string' || !EXPORT_FORMATS.includes(v)) {
    throw new Error('runtime: unsupported export format');
  }
}

export function registerRuntimeHandlers(runtime: RuntimeTelemetryManager): void {
  handle(
    IpcChannels.runtimeGetSnapshot,
    (_e, sessionId: unknown): RuntimeSnapshot | null => {
      assertSessionId(sessionId);
      return runtime.getSnapshot(sessionId);
    },
  );

  handle(
    IpcChannels.runtimeGetHistory,
    (_e, sessionId: unknown): RuntimeUsageHistory[] => {
      assertSessionId(sessionId);
      return runtime.getHistory(sessionId);
    },
  );

  /**
   * Whether any window currently shows the inspector. Gates how often a live
   * run pushes: with nothing watching, main keeps ingesting so history stays
   * complete but broadcasts only at run boundaries.
   */
  handle(IpcChannels.runtimeSetWatching, (e, watching: unknown): void => {
    // The SENDER identifies the watcher, so main can retire the entry itself
    // when that renderer is destroyed or navigates. A renderer that never gets
    // to send `false` therefore cannot pin the app at full push rate.
    runtime.setWatching(e.sender, watching === true);
  });

  handle(IpcChannels.runtimeExport, (_e, sessionId: unknown, format: unknown): string => {
    assertSessionId(sessionId);
    assertExportFormat(format);
    return runtime.export(sessionId, format);
  });

  handle(
    IpcChannels.runtimeSave,
    async (
      _e,
      sessionId: unknown,
      format: unknown,
    ): Promise<{ saved: boolean; path?: string }> => {
      assertSessionId(sessionId);
      assertExportFormat(format);
      return runtime.save(sessionId, format);
    },
  );

  /** Privacy action: erase every persisted telemetry row. */
  handle(IpcChannels.runtimeClearHistory, (): void => {
    runtime.clearHistory();
  });
}
