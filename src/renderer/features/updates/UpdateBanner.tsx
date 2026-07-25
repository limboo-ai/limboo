/**
 * UpdateBanner — a full-width bottom strip that appears only when the in-app
 * updater has something actionable: a new version available, a download in
 * progress, or a downloaded update ready to install. Purely presentational; all
 * logic lives in the main-process AutoUpdateManager mirrored through
 * useUpdateStore.
 *
 * Dark-only, token-driven (bg-elevated / border-line / text-fg / accent) — no new
 * colors, no gradients. Anchored to the bottom edge, spanning the window width,
 * above the Toaster. While downloading it shows a determinate CircularProgress
 * ring with the live percentage. The X dismisses the strip (renderer-only); the
 * Settings-icon badge stays lit so the update is still reachable.
 */
import { AlertCircle, ArrowUpCircle, Download, RefreshCw, X } from 'lucide-react';
import { CircularProgress } from '@/renderer/components/ui';
import { useUpdateStore } from '@/renderer/stores/useUpdateStore';
import { cn } from '@/renderer/lib/cn';

export function UpdateBanner() {
  const status = useUpdateStore((s) => s.status);
  const dismissed = useUpdateStore((s) => s.dismissed);
  const busy = useUpdateStore((s) => s.busy);
  const check = useUpdateStore((s) => s.check);
  const download = useUpdateStore((s) => s.download);
  const install = useUpdateStore((s) => s.install);
  const dismiss = useUpdateStore((s) => s.dismiss);

  // Only surface actionable stages. Checking / not-available / idle / disabled
  // stay quiet here. `error` DOES surface: an update that fails mid-flight used
  // to make the strip vanish, which reads as "it worked" — the opposite of true.
  const actionable =
    status.stage === 'available' ||
    status.stage === 'downloading' ||
    status.stage === 'downloaded' ||
    status.stage === 'error';
  if (!actionable || dismissed) return null;

  const failed = status.stage === 'error';
  const percent = status.percent ?? 0;
  const versionLabel = status.version ? `Limboo ${status.version}` : 'A new version';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center">
      <div className="pointer-events-auto flex w-full items-center gap-3 border-t border-line bg-elevated px-4 py-2.5 shadow-lg">
        {/* Leading indicator — ring + live % while downloading, otherwise an icon. */}
        {status.stage === 'downloading' ? (
          <CircularProgress value={percent} size={30} showLabel className="shrink-0" />
        ) : failed ? (
          <AlertCircle size={20} className="shrink-0 text-danger" />
        ) : (
          <ArrowUpCircle size={20} className="shrink-0 text-accent" />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium text-fg">
            {failed
              ? 'Update failed'
              : status.stage === 'downloaded'
                ? 'Update ready to install'
                : status.stage === 'downloading'
                  ? status.resuming
                    ? 'Resuming update…'
                    : 'Downloading update…'
                  : 'Update available'}
          </span>
          <span className="truncate text-[11px] text-muted">
            {failed
              ? (status.error ?? 'The update could not be applied.')
              : status.stage === 'downloaded'
                ? `${versionLabel} — restart to finish`
                : status.stage === 'downloading'
                  ? `${versionLabel} · ${percent}%`
                  : `${versionLabel} is available to download`}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {(status.stage === 'available' || failed) && (
            <button
              type="button"
              disabled={busy}
              // A failure can come from either half of the flow, so retrying
              // restarts from the check rather than assuming a download is valid.
              onClick={() => void (failed ? check() : download())}
              className={cn(
                'flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-base transition-opacity hover:opacity-90',
                'disabled:opacity-50',
              )}
            >
              {failed ? <RefreshCw size={14} /> : <Download size={14} />}
              {failed ? 'Try again' : 'Download'}
            </button>
          )}
          {status.stage === 'downloading' && (
            <span className="text-[12px] tabular-nums text-muted">{percent}%</span>
          )}
          {status.stage === 'downloaded' && (
            <button
              type="button"
              onClick={() => void install()}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-base transition-opacity hover:opacity-90"
            >
              <RefreshCw size={14} /> Restart & install
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismiss}
            className="rounded p-1 text-faint transition-colors hover:text-fg"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
