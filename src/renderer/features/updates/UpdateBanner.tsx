/**
 * UpdateBanner — a full-width bottom strip that appears only when the in-app
 * updater has something actionable: a new version available, a download in
 * progress, an install running, a downloaded update ready, or a failure. Purely
 * presentational; all logic lives in the main-process AutoUpdateManager mirrored
 * through useUpdateStore.
 *
 * Dark-only, token-driven (bg-elevated / border-line / text-fg / accent) — no new
 * colors, no gradients. Anchored to the bottom edge, spanning the window width,
 * above the Toaster.
 *
 * Three states carry real weight:
 * - `downloading` shows a determinate hairline across the top edge, so progress
 *   is legible without reading the number.
 * - `installing` exists because the Linux package install is something the app
 *   now RUNS and waits on rather than hands off. It is deliberately
 *   non-dismissible: a privileged install in flight is not something to hide.
 * - `error` can carry a `manualCommand` — the exact shell line that finishes the
 *   update when the in-app install could not. That command is main-process
 *   output rendered as text and copied to the clipboard; it is never executed
 *   from here.
 */
import {
  AlertCircle,
  ArrowUpCircle,
  Check,
  Copy,
  Download,
  FileText,
  RefreshCw,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { CircularProgress } from '@/renderer/components/ui';
import { useDocumentStore } from '@/renderer/stores/useDocumentStore';
import { useSessionStore } from '@/renderer/stores/useSessionStore';
import { useUpdateStore } from '@/renderer/stores/useUpdateStore';
import { UpdateAction } from './UpdateAction';
import { releaseNotesRef } from './useReleaseNotes';

export function UpdateBanner() {
  const status = useUpdateStore((s) => s.status);
  // Documents are session-scoped, so the notes can only be opened as a tab when
  // a session exists. With none, the button is simply not offered — the strip's
  // own subtitle already carries the warning.
  const sessionId = useSessionStore((s) => s.selectedId);
  const dismissed = useUpdateStore((s) => s.dismissed);
  const busy = useUpdateStore((s) => s.busy);
  const check = useUpdateStore((s) => s.check);
  const download = useUpdateStore((s) => s.download);
  const install = useUpdateStore((s) => s.install);
  const dismiss = useUpdateStore((s) => s.dismiss);
  const [copied, setCopied] = useState(false);

  // Only surface actionable stages. Checking / not-available / idle / disabled
  // stay quiet here. `error` DOES surface: an update that fails mid-flight used
  // to make the strip vanish, which reads as "it worked" — the opposite of true.
  const actionable =
    status.stage === 'available' ||
    status.stage === 'downloading' ||
    status.stage === 'installing' ||
    status.stage === 'downloaded' ||
    status.stage === 'error';
  if (!actionable || dismissed) return null;

  const failed = status.stage === 'error';
  const installing = status.stage === 'installing';
  const percent = status.percent ?? 0;
  const versionLabel = status.version ? `Limboo ${status.version}` : 'A new version';
  // A failure that left an update staged (the Linux package path) is worth
  // retrying directly; anything else restarts from the check, since we cannot
  // assume the download itself is sound.
  const retryInstall = failed && Boolean(status.manualCommand);
  // A prerelease offer is presented differently: it is not yet released, it was
  // deliberately NOT downloaded in the background, and the release notes are the
  // thing to read before deciding. `prerelease` describes the OFFER — a beta
  // install can be offered a stable build, and that case reads as normal.
  const betaOffer = status.stage === 'available' && status.prerelease === true;

  /** Open the offered version's release notes as a workspace document. */
  const openReleaseNotes = (version: string): void => {
    if (!sessionId) return;
    useDocumentStore.getState().promote(sessionId, releaseNotesRef(version));
  };

  const copyCommand = (): void => {
    if (!status.manualCommand) return;
    void window.limboo?.system.clipboardWrite(status.manualCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center">
      <div className="pointer-events-auto relative flex w-full items-center gap-3 border-t border-line bg-elevated px-4 py-2.5 shadow-lg">
        {/* Determinate hairline along the top edge — the strip's own progress
            bar, so movement is visible without parsing the percentage. */}
        {status.stage === 'downloading' && (
          <div
            className="absolute inset-x-0 top-0 h-px bg-accent transition-[width] duration-300"
            style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
            aria-hidden
          />
        )}

        {/* Leading indicator — ring + live % while downloading, otherwise an icon. */}
        {status.stage === 'downloading' ? (
          <CircularProgress value={percent} size={30} showLabel className="shrink-0" />
        ) : installing ? (
          <RefreshCw size={20} className="shrink-0 animate-spin text-accent" />
        ) : failed ? (
          <AlertCircle size={20} className="shrink-0 text-danger" />
        ) : (
          <ArrowUpCircle size={20} className="shrink-0 text-accent" />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium text-fg">
            {failed
              ? 'Update failed'
              : installing
                ? 'Installing update…'
                : status.stage === 'downloaded'
                  ? 'Update ready to install'
                  : status.stage === 'downloading'
                    ? status.resuming
                      ? 'Resuming update…'
                      : 'Downloading update…'
                    : betaOffer
                      ? 'Beta update available'
                      : 'Update available'}
          </span>
          <span className="truncate text-[11px] text-muted">
            {failed
              ? (status.error ?? 'The update could not be applied.')
              : installing
                ? `${versionLabel} — this may ask for your password`
                : status.stage === 'downloaded'
                  ? `${versionLabel} — restart to finish`
                  : status.stage === 'downloading'
                    ? `${versionLabel} · ${percent}%`
                    : betaOffer
                      ? `${versionLabel} is a beta — not yet released, and may contain bugs`
                      : `${versionLabel} is available to download`}
          </span>
          {/* The escape hatch: when the app could not install the update itself,
              show the command that will. Read-only text — copying it is the only
              action, and running it is the user's call in their own terminal. */}
          {failed && status.manualCommand && (
            <code className="mt-1 truncate rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
              {status.manualCommand}
            </code>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {failed && status.manualCommand && (
            <UpdateAction
              label={copied ? 'Copied' : 'Copy command'}
              icon={copied ? Check : Copy}
              tone="secondary"
              onClick={copyCommand}
            />
          )}
          {/* Read before deciding. A prerelease is the one offer where the
              notes are load-bearing, so they are one click away. */}
          {betaOffer && status.version && sessionId && (
            <UpdateAction
              label="Release notes"
              icon={FileText}
              tone="secondary"
              onClick={() => openReleaseNotes(status.version as string)}
            />
          )}
          {(status.stage === 'available' || failed) && (
            <UpdateAction
              label={failed ? 'Try again' : betaOffer ? 'Download beta' : 'Download'}
              icon={failed ? RefreshCw : Download}
              busy={busy}
              onClick={() => void (retryInstall ? install() : failed ? check() : download())}
            />
          )}
          {status.stage === 'downloading' && (
            <span className="text-[12px] tabular-nums text-muted">{percent}%</span>
          )}
          {(status.stage === 'downloaded' || installing) && (
            <UpdateAction
              label={installing ? 'Installing…' : 'Restart & install'}
              icon={RefreshCw}
              busy={installing}
              onClick={() => void install()}
            />
          )}
          {/* An install in flight is not dismissible — hiding it would leave a
              privileged operation running with nothing on screen to explain it. */}
          {!installing && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismiss}
              className="rounded p-1 text-faint transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
