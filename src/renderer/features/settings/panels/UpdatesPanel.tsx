/**
 * Updates — control the in-app updater (electron-updater + GitHub releases) and
 * show its live status. Auto-update only runs in a packaged build; in dev / a
 * browser preview the main manager reports `disabled` and the actions no-op.
 */
import { RefreshCw } from 'lucide-react';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { useUpdateStore } from '@/renderer/stores/useUpdateStore';
import { UpdateAction } from '@/renderer/features/updates/UpdateAction';
import { Section, Field, SegmentedControl, Toggle } from '../controls';

const STAGE_LABEL: Record<string, string> = {
  idle: 'Up to date',
  disabled: 'Unavailable in this build',
  checking: 'Checking for updates…',
  available: 'Update available',
  'not-available': 'Up to date',
  downloading: 'Downloading…',
  downloaded: 'Ready to install',
  installing: 'Installing…',
  error: 'Update check failed',
};

export function UpdatesPanel() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const status = useUpdateStore((s) => s.status);
  const busy = useUpdateStore((s) => s.busy);
  const check = useUpdateStore((s) => s.check);
  const install = useUpdateStore((s) => s.install);

  const disabled = status.stage === 'disabled';
  const beta = settings.updates.channel === 'beta';

  return (
    <Section
      title="Updates"
      hint="Limboo updates over HTTPS from its GitHub releases and verifies the signed installer before applying. No update credentials are stored."
    >
      <Field
        id="updateStatus"
        label="Status"
        hint={
          // A failed install that left a runnable command is more useful as the
          // command than as the error alone.
          status.stage === 'error' && status.manualCommand
            ? `${status.error ?? 'The update could not be applied.'} Run: ${status.manualCommand}`
            : status.stage === 'error' && status.error
            ? status.error
            : // Say WHY self-update is off (dev build, Microsoft Store install,
              // unsigned macOS app, unsupported Linux packaging) rather than
              // leave a greyed-out panel with no explanation.
              status.stage === 'disabled' && status.disabledReason
              ? status.disabledReason
              : status.version && (status.stage === 'available' || status.stage === 'downloaded')
                ? `Limboo ${status.version}${status.prerelease ? ' (beta)' : ''} ${
                    status.stage === 'downloaded' ? 'downloaded' : 'available'
                  }`
                : // A prerelease build says so here, because "1.4.0-beta.1"
                  // alone does not tell a user they are off the stable channel.
                  status.runningPrerelease
                  ? `Current version ${status.currentVersion || '—'} · beta — not a released build`
                  : `Current version ${status.currentVersion || '—'}${
                      status.channel === 'beta' ? ' · subscribed to beta updates' : ''
                    }`
        }
      >
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted">
            {status.stage === 'downloading' && status.resuming
              ? 'Resuming…'
              : (STAGE_LABEL[status.stage] ?? status.stage)}
          </span>
          {status.stage === 'downloading' && (
            <span className="text-[12px] tabular-nums text-faint">{status.percent ?? 0}%</span>
          )}
        </div>
      </Field>

      <Field id="updateCheck" label="Check for updates" hint="Look for a newer release now.">
        {status.stage === 'downloaded' || status.stage === 'installing' ? (
          <UpdateAction
            size="sm"
            label={status.stage === 'installing' ? 'Installing…' : 'Restart & install'}
            icon={RefreshCw}
            busy={status.stage === 'installing'}
            onClick={() => void install()}
          />
        ) : (
          <UpdateAction
            size="sm"
            tone="secondary"
            label="Check now"
            icon={RefreshCw}
            busy={busy || status.stage === 'checking'}
            disabled={disabled}
            onClick={() => void check()}
          />
        )}
      </Field>

      <Field
        id="updateAutoCheck"
        label="Check automatically"
        hint="Look for updates shortly after launch and hourly."
      >
        <Toggle
          checked={settings.updates.autoCheck}
          disabled={disabled}
          onChange={(autoCheck) => void update({ updates: { autoCheck } })}
        />
      </Field>

      <Field
        id="updateAutoDownload"
        label="Download automatically"
        hint={
          beta
            ? 'Download an available update in the background. Ignored on the beta channel — a beta is always offered as a link you choose to click, never fetched in advance.'
            : 'Download an available update in the background; otherwise wait for you.'
        }
      >
        <Toggle
          checked={settings.updates.autoDownload}
          disabled={disabled || beta}
          onChange={(autoDownload) => void update({ updates: { autoDownload } })}
        />
      </Field>

      <Field
        id="updateChannel"
        label="Update channel"
        hint="Stable receives released versions only. Beta additionally offers prereleases — builds that are not yet released, are still being tested, and may contain bugs or lose data. A beta is never downloaded automatically: you are shown its release notes and choose. Switching back to Stable stops new beta offers; it does not downgrade the build you are running."
      >
        <SegmentedControl
          value={settings.updates.channel}
          disabled={disabled}
          options={[
            { value: 'stable', label: 'Stable' },
            { value: 'beta', label: 'Beta' },
          ]}
          onChange={(channel) => void update({ updates: { channel } })}
        />
      </Field>
    </Section>
  );
}
