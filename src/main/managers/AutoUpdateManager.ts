/**
 * AutoUpdateManager — the in-app updater, owned by the app (not the agent).
 *
 * Wraps `electron-updater` against this repo's GitHub Releases. electron-builder
 * publishes the per-platform `latest*.yml` metadata + installers; this manager
 * fetches that feed over HTTPS, surfaces every lifecycle transition to the
 * renderer as a single {@link UpdateStatus}, and applies the update on the
 * user's command. Limboo stores no update credentials — the feed is public.
 *
 * Hardening / boundaries:
 * - Active ONLY in a packaged build. In dev electron-updater has no
 *   `app-update.yml`, so we report `disabled` and never touch the network.
 * - The GitHub feed is HTTPS-only and host-fixed (no renderer-supplied URLs), so
 *   there is no SSRF surface to allowlist here.
 * - Every reason we refuse to update is reported to the renderer as
 *   {@link UpdateStatus.disabledReason} — a silent "nothing happens" button is
 *   the worst possible outcome for an updater.
 *
 * Why the updater instance is constructed explicitly (see {@link createUpdater}):
 * electron-updater's `autoUpdater` singleton picks the Linux implementation from
 * `{resources}/package-type`, and that file OVERRIDES the AppImage default. Our
 * hybrid `--prepackaged` build hands one staged app dir to every Linux target, so
 * electron-builder's FpmTarget can leave a stale `deb`/`rpm` marker inside the
 * AppImage. Choosing the implementation ourselves — APPIMAGE env first, marker
 * second — makes the decision deterministic and independent of build ordering.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import type { AppUpdater, ProgressInfo, UpdateInfo } from 'electron-updater';
import type { SettingsManager } from './SettingsManager';
import type { NotificationManager } from './NotificationManager';
import type { AppSettings, UpdateInstallResult, UpdateStatus } from '@shared/types';
import { IpcEvents } from '@shared/ipc-channels';
import { logger } from '../logger';
import { readJson, writeJson } from '../storage';
import { getMainWindow } from '../window/createWindow';

// electron-updater is CommonJS; the concrete updater classes ride on the default
// export alongside the auto-dispatched `autoUpdater` singleton (unused here).
const { AppImageUpdater, DebUpdater, MacUpdater, NsisUpdater, PacmanUpdater, RpmUpdater } =
  electronUpdater;

/** The GitHub project that serves releases — must match electron-builder.yml. */
const FEED = { provider: 'github', owner: 'limboo-ai', repo: 'limboo' } as const;

/** Re-check cadence once the app has settled (ms). */
const POLL_INTERVAL = 60 * 60 * 1000; // hourly
const INITIAL_DELAY = 8_000; // let the window finish hydrating first

/**
 * How long to wait for `app.quit()` to actually tear the process down after the
 * installer has been handed off, before forcing the exit. electron-updater has
 * already spawned the installer (or the new AppImage) by this point, so the only
 * thing a stuck quit achieves is blocking the update it just started.
 */
const QUIT_WATCHDOG_MS = 4_000;

/**
 * Persisted marker of an in-flight download. Written when a download starts and
 * cleared once it finishes (or errors). If it survives a restart it means the
 * previous download was interrupted — so the next matching `update-available`
 * resumes the partial from electron-updater's cache instead of starting over.
 */
const DOWNLOAD_MARKER = 'update-download.json';
interface DownloadMarker {
  version: string;
}

/**
 * Set once the user has committed to installing. `src/main/index.ts` reads it so
 * a `second-instance` event fired by the relaunching copy of the app is ignored
 * rather than treated as "focus the existing window".
 */
let quittingForUpdate = false;

/** True from the moment `quitAndInstall` is handed the installer. */
export function isQuittingForUpdate(): boolean {
  return quittingForUpdate;
}

/** Why the updater is inactive, in words the user can act on. */
type DisabledReason = string;

interface Enablement {
  updater: AppUpdater | null;
  reason?: DisabledReason;
}

export class AutoUpdateManager {
  private status: UpdateStatus;
  private readonly updater: AppUpdater | null;
  /**
   * The version electron-updater has actually staged on disk. Tracked separately
   * from {@link UpdateStatus.stage} because the hourly poll re-emits
   * `update-available` for the same version and would otherwise move the stage
   * off `downloaded`, turning the install button into a silent no-op.
   */
  private downloadedVersion: string | null = null;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private initialTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly settings: SettingsManager,
    private readonly notifications: NotificationManager,
  ) {
    this.status = { stage: 'idle', currentVersion: app.getVersion() };

    const { updater, reason } = resolveUpdater();
    this.updater = updater;

    if (!updater) {
      logger.info('[updater] disabled:', reason);
      this.status = { stage: 'disabled', currentVersion: app.getVersion(), disabledReason: reason };
      return;
    }

    logger.info(`[updater] using ${updater.constructor.name}`);

    updater.logger = {
      info: (m: unknown) => logger.info('[updater]', m),
      warn: (m: unknown) => logger.warn('[updater]', m),
      error: (m: unknown) => logger.error('[updater]', m),
      // Drop verbose debug chatter (electron-updater calls this a lot).
      debug: (m: unknown) => void m,
    };
    updater.autoDownload = this.settings.getAll().updates.autoDownload;
    updater.autoInstallOnAppQuit = true;
    // We never publish a web installer (nsis.differentialPackage is off), so opt
    // out explicitly rather than let electron-updater warn on every download.
    updater.disableWebInstaller = true;
    // No `.exe.blockmap` is published either, so a differential attempt on
    // Windows is a guaranteed round-trip to a 404 before falling back.
    if (process.platform === 'win32') updater.disableDifferentialDownload = true;
    updater.setFeedURL(FEED);

    this.wireEvents();

    // Re-tune auto-download live as the user flips the preference.
    this.settings.onChange((s: AppSettings) => {
      updater.autoDownload = s.updates.autoDownload;
    });
  }

  /** Begin the initial check + hourly poll, gated on the user's autoCheck pref. */
  start(): void {
    if (!this.updater) return;
    if (!this.settings.getAll().updates.autoCheck) return;
    this.initialTimer = setTimeout(() => void this.check(), INITIAL_DELAY);
    this.pollTimer = setInterval(() => {
      // Never poll over a staged update: re-checking re-emits `update-available`
      // and would move the stage off `downloaded` while the user is looking at
      // the "Restart & install" button.
      if (this.downloadedVersion) return;
      if (this.settings.getAll().updates.autoCheck) void this.check();
    }, POLL_INTERVAL);
  }

  dispose(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.initialTimer) clearTimeout(this.initialTimer);
    getMainWindow()?.setProgressBar(-1);
  }

  getState(): UpdateStatus {
    return this.status;
  }

  /** Check GitHub for a newer release. No-op (returns current state) in dev. */
  async check(): Promise<UpdateStatus> {
    if (!this.updater) return this.status;
    try {
      await this.updater.checkForUpdates();
    } catch (err) {
      this.emit({ stage: 'error', error: errorMessage(err) });
    }
    return this.status;
  }

  /** Manually start the download (used when autoDownload is off). */
  async download(): Promise<void> {
    if (!this.updater) return;
    try {
      await this.updater.downloadUpdate();
    } catch (err) {
      this.emit({ stage: 'error', error: errorMessage(err) });
    }
  }

  /**
   * Quit and apply a downloaded update.
   *
   * Two platform details matter here and are the reason this is not a one-liner:
   *
   * 1. `isSilent` on Windows. electron-updater passes `--updated /S --force-run`
   *    to the NSIS installer when silent; without `/S` our assisted (multi-page)
   *    installer re-runs the whole wizard, which reads as "nothing happened".
   *    Note `BaseUpdater.quitAndInstall` DISCARDS `isForceRunAfter` unless
   *    `isSilent` is true, falling back to `autoRunAppAfterInstall` (true).
   *
   * 2. The single-instance lock. `doInstall()` spawns the replacement process
   *    SYNCHRONOUSLY (AppImage) while `app.quit()` is deferred to `setImmediate`.
   *    The child then loses the `requestSingleInstanceLock()` race against the
   *    still-running parent and quits itself — the app disappears and never comes
   *    back. Releasing the lock before handing off is the fix; it must happen
   *    before, not during, `before-quit`.
   */
  async install(): Promise<UpdateInstallResult> {
    if (!this.updater) {
      const error = this.status.disabledReason ?? 'Updates are not available in this build.';
      logger.warn('[updater] install ignored:', error);
      return { ok: false, error };
    }
    if (!this.downloadedVersion) {
      const error = 'No update has been downloaded yet.';
      logger.warn('[updater] install ignored: nothing staged');
      return { ok: false, error };
    }

    logger.info(`[updater] installing ${this.downloadedVersion} — releasing instance lock`);
    quittingForUpdate = true;
    app.releaseSingleInstanceLock();

    try {
      // Windows: silent so the assisted wizard does not re-run. Everywhere else
      // the flag is ignored and `autoRunAppAfterInstall` drives the relaunch.
      const silent = process.platform === 'win32';
      this.updater.quitAndInstall(silent, true);
    } catch (err) {
      quittingForUpdate = false;
      const error = errorMessage(err);
      logger.error('[updater] quitAndInstall threw:', error);
      this.emit({ stage: 'error', error });
      return { ok: false, error };
    }

    // The installer is running detached at this point. If our own teardown wedges
    // — a disposer that hangs, a handle that never closes — forcing the exit is
    // strictly better than sitting on the old version with an installer waiting.
    setTimeout(() => {
      logger.warn('[updater] still alive after quitAndInstall; forcing exit');
      app.exit(0);
    }, QUIT_WATCHDOG_MS).unref?.();

    return { ok: true };
  }

  private wireEvents(): void {
    const updater = this.updater;
    if (!updater) return;

    updater.on('checking-for-update', () => {
      this.emit({ stage: 'checking', checkedAt: Date.now() });
    });
    updater.on('update-available', (info: UpdateInfo) => {
      // A surviving marker for this same version means the previous download was
      // interrupted — resume it rather than treat it as a fresh start.
      const resuming = this.readMarker()?.version === info.version;
      this.emit({ stage: 'available', version: info.version, notes: releaseNotes(info), resuming });
      this.notifications.notify({
        title: 'Update available',
        body: `Limboo ${info.version} is available to download.`,
      });
      // Auto-resume a partial even when the user has NOT enabled auto-start of
      // fresh downloads ("resume, not start"). When autoDownload is on,
      // electron-updater resumes from its cache on its own.
      if (resuming && !updater.autoDownload) void this.download();
    });
    updater.on('update-not-available', () => {
      this.emit({ stage: 'not-available' });
    });
    updater.on('download-progress', (p: ProgressInfo) => {
      // First progress event of a run: record the marker so an interruption is
      // resumable on the next launch.
      if (!this.readMarker() && this.status.version) {
        this.writeMarker({ version: this.status.version });
      }
      this.emit({
        stage: 'downloading',
        percent: Math.round(p.percent),
        resuming: this.status.resuming,
      });
    });
    updater.on('update-downloaded', (info: UpdateInfo) => {
      this.clearMarker();
      this.downloadedVersion = info.version;
      this.emit({ stage: 'downloaded', version: info.version, notes: releaseNotes(info), resuming: false });
      this.notifications.notify({
        title: 'Update ready',
        body: `Limboo ${info.version} has been downloaded. Restart to install.`,
      });
    });
    updater.on('error', (err: Error) => {
      // Abort: the partial (if any) stays on disk for electron-updater to reuse,
      // but drop our marker so we don't loop trying to auto-resume a bad download.
      this.clearMarker();
      this.downloadedVersion = null;
      this.emit({ stage: 'error', error: errorMessage(err) });
    });
    // AppImage updates land under the NEW release's filename and delete the old
    // file, so any .desktop entry or dock pin aimed at the old path is now dead.
    // Say so rather than let it look like the update failed.
    updater.on('appimage-filename-updated', (path: string) => {
      logger.info('[updater] AppImage installed at', path);
      this.notifications.notify({
        title: 'Update installed',
        body: `Limboo now lives at ${path}. Update any shortcut that pointed at the old file.`,
      });
    });
  }

  private readMarker(): DownloadMarker | null {
    return readJson<DownloadMarker | null>(DOWNLOAD_MARKER, null);
  }

  private writeMarker(marker: DownloadMarker): void {
    writeJson(DOWNLOAD_MARKER, marker);
  }

  private clearMarker(): void {
    writeJson(DOWNLOAD_MARKER, null);
  }

  /** Merge a transition into the status and push the full object to renderers. */
  private emit(patch: Partial<UpdateStatus>): void {
    this.status = {
      ...this.status,
      ...patch,
      currentVersion: app.getVersion(),
    };
    // A new check supersedes any stale error/version once it resolves.
    if (patch.stage === 'not-available' || patch.stage === 'checking') {
      this.status.error = undefined;
    }
    // Drive the OS taskbar progress button so download progress is visible
    // without switching to the window; clear it whenever we're not downloading.
    const progressWin = getMainWindow();
    if (progressWin) {
      if (this.status.stage === 'downloading' && typeof this.status.percent === 'number') {
        progressWin.setProgressBar(this.status.percent / 100);
      } else {
        progressWin.setProgressBar(-1);
      }
    }
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IpcEvents.updateStatus, this.status);
      }
    }
  }
}

/**
 * Decide whether this build can update itself, and with which implementation.
 * Every `null` return carries a reason the UI can show verbatim.
 */
function resolveUpdater(): Enablement {
  if (!app.isPackaged) {
    return { updater: null, reason: 'Automatic updates only run in a packaged build.' };
  }
  // A Microsoft Store (MSIX) install is updated by the Store, not by us. Writing
  // into the package would be rejected anyway.
  if (process.windowsStore) {
    return {
      updater: null,
      reason: 'This build was installed from the Microsoft Store, which manages its own updates.',
    };
  }
  // electron-updater reads `<resources>/app-update.yml` on checkForUpdates();
  // if it's absent (e.g. an older installer or a plain Forge package that
  // predates the packaging fix) that call throws ENOENT. Disable gracefully
  // rather than surface a non-actionable error — a reinstall restores the file.
  if (!existsSync(join(process.resourcesPath, 'app-update.yml'))) {
    return {
      updater: null,
      reason: 'This install is missing its update metadata. Reinstall Limboo to restore it.',
    };
  }
  return createUpdater();
}

/**
 * Construct the platform's updater. Deliberately does NOT use electron-updater's
 * auto-dispatched singleton — see the file header for why the Linux dispatch is
 * unsafe in a `--prepackaged` build.
 */
function createUpdater(): Enablement {
  if (process.platform === 'win32') return { updater: new NsisUpdater() };

  if (process.platform === 'darwin') {
    // Squirrel.Mac refuses to install an update into an app it cannot verify, so
    // an unsigned or ad-hoc-signed build can never self-update. Detect it here
    // and say so, instead of offering a button that fails after a 240 MB
    // download. Resolves itself the moment a Developer ID build ships.
    if (!isMacSignedForUpdates()) {
      return {
        updater: null,
        reason:
          'Automatic updates need a code-signed build. Download the latest DMG to update manually.',
      };
    }
    return { updater: new MacUpdater() };
  }

  // Linux. The AppImage env var is authoritative: if we are running as an
  // AppImage, that is what has to be replaced, whatever marker file is baked in.
  if (process.env.APPIMAGE) return { updater: new AppImageUpdater() };

  switch (readPackageType()) {
    case 'deb':
      return { updater: new DebUpdater() };
    case 'rpm':
      return { updater: new RpmUpdater() };
    case 'pacman':
      return { updater: new PacmanUpdater() };
    default:
      return {
        updater: null,
        reason: 'This Linux build cannot self-update. Install the update from your package manager.',
      };
  }
}

/** Read electron-builder's `{resources}/package-type` marker, if present. */
function readPackageType(): string | null {
  try {
    const marker = join(process.resourcesPath, 'package-type');
    if (!existsSync(marker)) return null;
    return readFileSync(marker, 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * The signing authority `codesign` reports for the running macOS app, or null
 * on any other platform and whenever the probe cannot be run.
 *
 * Null is deliberately NOT the same as "unsigned": it also covers every
 * non-darwin platform and a `codesign` that failed to execute. Callers must not
 * render it as a failure — see `BuildInfo.macSignature`.
 */
export function macSigningAuthority(): string | null {
  if (process.platform !== 'darwin') return null;
  try {
    const result = spawnSync('codesign', ['-dv', '--verbose=2', app.getPath('exe')], {
      encoding: 'utf8',
      timeout: 5_000,
    });
    // codesign writes its report to stderr.
    const report = `${result.stderr ?? ''}${result.stdout ?? ''}`;
    return /^Authority=(.+)$/m.exec(report)?.[1]?.trim() ?? null;
  } catch (err) {
    logger.warn('[updater] codesign probe failed:', err);
    return null;
  }
}

/**
 * True when the running macOS app carries a real Developer ID signature (not
 * ad-hoc, not unsigned). One cheap `codesign` call at construction time.
 */
function isMacSignedForUpdates(): boolean {
  return /^Developer ID Application/.test(macSigningAuthority() ?? '');
}

/** electron-updater release notes can be a string or a list of per-version notes. */
function releaseNotes(info: UpdateInfo): string | undefined {
  const notes = info.releaseNotes;
  if (!notes) return undefined;
  const text =
    typeof notes === 'string'
      ? notes
      : notes.map((n) => (typeof n === 'string' ? n : n.note ?? '')).join('\n');
  // Strip HTML tags GitHub may include, then cap length for the renderer.
  return text.replace(/<[^>]*>/g, '').trim().slice(0, 2000) || undefined;
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 500);
}
