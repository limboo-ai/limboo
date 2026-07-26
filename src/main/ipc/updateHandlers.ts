/**
 * IPC handlers for the in-app updater. Reached from the renderer through
 * `window.limboo.updates.*`. All handlers go through the `handle()` wrapper, so
 * they inherit the sender-origin validation that rejects foreign frames.
 */
import { app } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { BuildInfo, UpdateInstallResult, UpdateStatus } from '@shared/types';
import type { AutoUpdateManager } from '../managers/AutoUpdateManager';
import { macSigningAuthority } from '../managers/AutoUpdateManager';
import { handle } from './registry';

export function registerUpdateHandlers(updates: AutoUpdateManager): void {
  handle<[], UpdateStatus>(IpcChannels.updateGetState, () => updates.getState());
  handle<[], UpdateStatus>(IpcChannels.updateCheck, () => updates.check());
  handle<[], void>(IpcChannels.updateDownload, () => updates.download());
  // Returns the outcome rather than void: an install can refuse for several
  // reasons and the renderer has to be able to tell the user which.
  handle<[], UpdateInstallResult>(IpcChannels.updateInstall, () => updates.install());

  /**
   * Facts about the running build, for the release document's integrity block.
   *
   * Read-only and takes no arguments, so there is nothing to validate. The
   * macOS signing probe reuses the updater's own `codesign` call rather than
   * shelling out a second time — it is the same question, and two probes that
   * could disagree about whether this build is signed would be worse than one.
   */
  handle<[], BuildInfo>(IpcChannels.updateGetBuildInfo, () => ({
    appVersion: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? '',
    macSignature: macSigningAuthority(),
  }));
}
