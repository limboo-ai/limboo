/**
 * IPC handlers for the in-app updater. Reached from the renderer through
 * `window.limboo.updates.*`. All handlers go through the `handle()` wrapper, so
 * they inherit the sender-origin validation that rejects foreign frames.
 */
import { IpcChannels } from '@shared/ipc-channels';
import type { UpdateInstallResult, UpdateStatus } from '@shared/types';
import type { AutoUpdateManager } from '../managers/AutoUpdateManager';
import { handle } from './registry';

export function registerUpdateHandlers(updates: AutoUpdateManager): void {
  handle<[], UpdateStatus>(IpcChannels.updateGetState, () => updates.getState());
  handle<[], UpdateStatus>(IpcChannels.updateCheck, () => updates.check());
  handle<[], void>(IpcChannels.updateDownload, () => updates.download());
  // Returns the outcome rather than void: an install can refuse for several
  // reasons and the renderer has to be able to tell the user which.
  handle<[], UpdateInstallResult>(IpcChannels.updateInstall, () => updates.install());
}
