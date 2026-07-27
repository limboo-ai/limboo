/**
 * Client-side text download.
 *
 * Deliberately renderer-only: an object URL + a synthetic anchor click hands the
 * bytes to Chromium's own download path, so no filesystem IPC is involved and
 * the renderer never learns (or supplies) a destination path. Anything that must
 * write to a chosen location — a patch, a graph export — goes through main and
 * its `dialog.showSaveDialog` instead; this is for "give me a copy of what is
 * already on screen".
 */

/** Trigger a download of `text` as `filename`. */
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Filesystem-safe slug for a generated filename. Never empty. */
export function slugify(s: string, fallback = 'export'): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || fallback
  );
}
