/**
 * "What's New" lifecycle: decide whether this launch is the first on a new
 * version, open the tab once when it is, and remember the dismissal.
 *
 * The rule the whole feature rests on: the notes appear when the running
 * version differs from the last one the user acknowledged, and closing the tab
 * acknowledges it. Nothing else opens it automatically.
 *
 * Two guards keep that honest:
 *
 *  - **Only when notes actually exist for this build.** A development build
 *    reports the placeholder version from `package.json`, which has no
 *    changelog section; without this check every dev launch would open an empty
 *    tab that could never be dismissed into a stable state.
 *  - **Only once per app run.** The auto-open effect re-runs whenever its
 *    dependencies change, and the version is not marked seen until the tab is
 *    closed — so without a run-scoped latch, closing the tab would immediately
 *    reopen it.
 */
import { useEffect, useRef } from 'react';
import { releaseNotesFor } from '@shared/releaseNotes.generated';
import { documentId, useDocumentStore, type DocumentRef } from '@/renderer/stores/useDocumentStore';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { useUpdateStore } from '@/renderer/stores/useUpdateStore';

/**
 * Whether this app run has already auto-opened the notes. Module scope, not
 * component state: `CenterWorkspace` remounts on layout changes, and a remount
 * must not re-open a tab the user just closed.
 */
let autoOpenedThisRun = false;

/** The ref for a version's notes — one place, so id derivation cannot drift. */
export function releaseNotesRef(version: string): DocumentRef {
  return { kind: 'release-notes', version };
}

export interface ReleaseNotesState {
  /** The running app version, `''` before the update store has hydrated. */
  version: string;
  /** True when this build carries notes the user has not acknowledged. */
  unseen: boolean;
  /** Whether this build carries notes at all (false in dev). */
  available: boolean;
  /** Record the running version as seen. Idempotent. */
  markSeen: () => void;
}

export function useReleaseNotes(): ReleaseNotesState {
  // `currentVersion` is re-stamped by main on every status emit, so it is
  // available without a separate `app.getInfo()` round trip.
  const version = useUpdateStore((s) => s.status.currentVersion) ?? '';
  const lastSeen = useSettingsStore((s) => s.settings.updates.lastSeenVersion);
  const settingsHydrated = useSettingsStore((s) => s.hydrated);
  const update = useSettingsStore((s) => s.update);

  const available = !!version && !!releaseNotesFor(version);
  const unseen = settingsHydrated && available && version !== lastSeen;

  const markSeen = () => {
    if (!version || version === lastSeen) return;
    void update({ updates: { lastSeenVersion: version } });
  };

  return { version, unseen, available, markSeen };
}

/**
 * Drive the tab: open it once on a new version, and mark the version seen when
 * it is closed. Mounted once from `CenterWorkspace`.
 *
 * Dismissal is detected as an open→closed transition rather than by wiring a
 * callback into the tab's close button, so EVERY route to closing it — the X,
 * middle-click, "close others", "close all", the command palette — counts as
 * acknowledgement. A close button that only worked when clicked directly would
 * be the kind of gap that silently reopens the tab forever.
 */
export function useReleaseNotesTab(sessionId: string | null): void {
  const { version, unseen, markSeen } = useReleaseNotes();
  const promote = useDocumentStore((s) => s.promote);
  // Derived through `documentId` rather than re-spelling the id here: that
  // function exists precisely so the format cannot drift, and a hand-built id
  // that stopped matching would leave the tab looking permanently closed —
  // which silently reopens it on every launch.
  const isOpen = useDocumentStore((s) =>
    sessionId ? !!s.bySession[sessionId]?.docs[documentId(releaseNotesRef(version))] : false,
  );
  const wasOpen = useRef(false);

  // Open once, when there is a session to open it in.
  useEffect(() => {
    if (!sessionId || !unseen || autoOpenedThisRun) return;
    autoOpenedThisRun = true;
    promote(sessionId, releaseNotesRef(version));
  }, [sessionId, unseen, version, promote]);

  // Closing the tab is the dismissal.
  useEffect(() => {
    if (isOpen) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      markSeen();
    }
  });
}
