/**
 * IPC for the release document. Exactly one channel, and it writes a file.
 *
 * The release document is otherwise entirely renderer-side and read-only: the
 * manifest is compiled into the bundle, so there is no fetch, no parse, and no
 * main-process manager. Export is the single exception, and it follows the
 * `graph:save` contract — the renderer supplies CONTENT, never a path. Main
 * opens the save dialog and writes wherever the user chose, so this handler has
 * no path to validate, no traversal surface, and no way to reach a location the
 * user did not pick themselves.
 *
 * Registered through the `handle()` wrapper, so it inherits the sender-origin
 * check that rejects any frame that is not our own renderer.
 */
import { BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import { IpcChannels } from '@shared/ipc-channels';
import { RELEASE_LIMITS } from '@shared/constants';
import type { ReleaseExportResult } from '@shared/types';
import { logger } from '../logger';
import { handle } from './registry';

/** A version string safe to put in a default filename. */
const VERSION_RE = /^[0-9A-Za-z.+-]{1,64}$/;

export function registerReleaseHandlers(): void {
  handle<[unknown, unknown], ReleaseExportResult>(
    IpcChannels.releaseExport,
    async (_e, version: unknown, markdown: unknown) => {
      if (typeof version !== 'string' || !VERSION_RE.test(version)) {
        throw new Error('release: invalid version');
      }
      if (typeof markdown !== 'string' || markdown.length === 0) {
        throw new Error('release: nothing to export');
      }
      // The renderer builds this from a manifest that was compiled into the
      // same bundle, so it is bounded by construction — but it arrives over IPC
      // and is written to disk, so it is bounded here too.
      if (markdown.length > RELEASE_LIMITS.markdownMax) {
        throw new Error('release: export exceeds the size limit');
      }

      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      const opts = {
        title: 'Export release notes',
        defaultPath: `limboo-${version}-release-notes.md`,
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'All files', extensions: ['*'] },
        ],
      };
      const result = win
        ? await dialog.showSaveDialog(win, opts)
        : await dialog.showSaveDialog(opts);
      // Cancelling is a normal outcome, not an error.
      if (result.canceled || !result.filePath) return { saved: false };

      await fs.writeFile(result.filePath, markdown, 'utf8');
      logger.info(`Release notes for ${version} exported to ${result.filePath}`);
      return { saved: true, path: result.filePath };
    },
  );
}
