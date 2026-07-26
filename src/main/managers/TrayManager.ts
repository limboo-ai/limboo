/**
 * TrayManager — adds a system tray icon so Limboo can keep running background
 * work while the window is hidden. Tray support varies by Linux desktop, so all
 * operations are guarded and failures are logged rather than thrown.
 *
 * {@link isActive} is load-bearing, not a convenience: `settings.behavior
 * .minimizeToTray` swallows the window's `close` event, and doing that on a
 * desktop where the tray never appeared would leave Limboo running with no
 * window, no icon, and no way to quit it. The close handler in `src/main/index.ts`
 * asks this class first and only hides when there is genuinely somewhere to hide.
 *
 * The show action goes through an injected callback rather than
 * {@link getMainWindow} alone, because the window can legitimately be GONE (the
 * user quit the last window on macOS, or `minimizeToTray` was off when they
 * closed it). "Show Limboo" that silently does nothing is the same class of bug
 * as an update button that installs nothing.
 */
import { Menu, Tray, nativeImage } from 'electron';
import { assetPath } from '../paths';
import { logger } from '../logger';
import { sendCommand } from '../sendCommand';
import { getMainWindow } from '../window/createWindow';

export interface TrayHooks {
  /** Focus the main window, creating one if it no longer exists. */
  showWindow: () => void;
  /** Quit for real — must flip the app's `isQuitting` flag first. */
  quit: () => void;
}

export class TrayManager {
  private tray: Tray | null = null;
  private hooks: TrayHooks | null = null;

  init(hooks: TrayHooks): void {
    this.hooks = hooks;
    try {
      const image = nativeImage.createFromPath(assetPath('tray.png'));
      if (image.isEmpty()) {
        logger.warn('Tray icon asset missing or empty; skipping tray.');
        return;
      }
      this.tray = new Tray(image);
      this.tray.setToolTip('Limboo');
      this.tray.setContextMenu(this.buildMenu());
      // Left-click does not fire under StatusNotifierItem (most modern Linux
      // desktops), which is why the context menu is the primary route. Harmless
      // and useful everywhere it does work.
      this.tray.on('click', () => this.showWindow());
    } catch (err) {
      logger.warn('Failed to initialize tray', err);
      this.tray = null;
    }
  }

  /**
   * True only when a tray icon really exists. Callers that change window
   * behaviour based on the tray MUST check this — see the class comment.
   */
  isActive(): boolean {
    return this.tray !== null && !this.tray.isDestroyed();
  }

  /** Rebuild the menu so Show/Hide reflects the window's current state. */
  refresh(): void {
    if (!this.isActive()) return;
    try {
      this.tray?.setContextMenu(this.buildMenu());
    } catch (err) {
      logger.warn('Failed to refresh tray menu', err);
    }
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  private showWindow(): void {
    this.hooks?.showWindow();
    this.refresh();
  }

  private hideWindow(): void {
    getMainWindow()?.hide();
    this.refresh();
  }

  private buildMenu(): Menu {
    const win = getMainWindow();
    const visible = win?.isVisible() ?? false;

    return Menu.buildFromTemplate([
      visible
        ? { label: 'Hide to Tray', click: () => this.hideWindow() }
        : { label: 'Show Limboo', click: () => this.showWindow() },
      { label: 'New Session', click: () => this.newSession() },
      { type: 'separator' },
      // Never bare `app.quit()`: the window's close handler vetoes a close while
      // `minimizeToTray` is on, so quitting has to announce itself first.
      { label: 'Quit', click: () => this.hooks?.quit() },
    ]);
  }

  /**
   * A command needs a window to arrive in — and a window that had to be CREATED
   * has no renderer listening yet, so dispatching immediately would drop the
   * command on the floor. Wait for the load when there is one to wait for.
   */
  private newSession(): void {
    this.hooks?.showWindow();
    const win = getMainWindow();
    if (win && win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', () => sendCommand('session.new'));
    } else {
      sendCommand('session.new');
    }
    this.refresh();
  }
}
