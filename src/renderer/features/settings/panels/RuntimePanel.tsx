/**
 * Settings › Runtime — the Runtime Telemetry indicator and inspector.
 *
 * Lifted out of the Agent panel, where it sat only by placement: it writes
 * `settings.runtime`, not `settings.agent`, and at 384 lines and 24 field ids
 * it was more than a third of that panel's weight while configuring a
 * different subsystem. Runtime Telemetry is a platform service — a peer of
 * Memory, Search, Resume and the Work Graph, each of which already has its own
 * category — so this is where it belongs.
 *
 * The section itself is unchanged; only its home moved.
 */
import { AGENT_CONNECTION_LIMITS } from '@shared/constants';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { Field, Section, Select, Slider, StackedField, Toggle } from '../controls';
import { RuntimeIndicatorsSection } from './RuntimeIndicatorsSection';

export function RuntimePanel() {
  const agent = useSettingsStore((s) => s.settings.agent);
  const update = useSettingsStore((s) => s.update);
  const setConn = <K extends keyof typeof agent.connection>(
    key: K,
    value: (typeof agent.connection)[K],
  ) => void update({ agent: { connection: { [key]: value } } });

  return (
    <div className="flex flex-col gap-5">
      <RuntimeIndicatorsSection />

      <Section
        title="Connection & reliability"
        hint="How Limboo supervises the connected coding agent — shared by every provider. A failed request never marks the agent dead; these knobs govern heartbeat checks and automatic recovery."
      >
        <Field
          id="heartbeatInterval"
          label="Heartbeat interval"
          hint="How often Limboo verifies the agent is healthy (a lightweight auth/SDK check, never a model call). Default 30s. Off disables monitoring."
        >
          <Select
            value={agent.connection.heartbeatInterval}
            options={[
              { value: 0, label: 'Off' },
              { value: 15_000, label: 'Every 15s' },
              { value: 30_000, label: 'Every 30s' },
              { value: 60_000, label: 'Every 1m' },
              { value: 120_000, label: 'Every 2m' },
            ]}
            onChange={(v) => setConn('heartbeatInterval', v)}
          />
        </Field>
        <StackedField
          id="heartbeatFailureThreshold"
          label={`Heartbeat failures before reconnecting · ${agent.connection.heartbeatFailureThreshold}`}
          hint="Consecutive failed heartbeats tolerated before showing Reconnecting. Default 2 — absorbs brief OS scheduling hiccups without alarming you."
        >
          <Slider
            min={AGENT_CONNECTION_LIMITS.heartbeatFailureThreshold.min}
            max={AGENT_CONNECTION_LIMITS.heartbeatFailureThreshold.max}
            step={1}
            value={agent.connection.heartbeatFailureThreshold}
            onChange={(v) => setConn('heartbeatFailureThreshold', v)}
            aria-label="Heartbeat failures before reconnecting"
          />
        </StackedField>
        <StackedField
          id="maxRecoveryAttempts"
          label={`Max recovery attempts · ${agent.connection.maxRecoveryAttempts}`}
          hint="How many times Limboo transparently retries a run after a transient failure before surfacing an error. Default 3. 0 disables auto-recovery."
        >
          <Slider
            min={AGENT_CONNECTION_LIMITS.maxRecoveryAttempts.min}
            max={AGENT_CONNECTION_LIMITS.maxRecoveryAttempts.max}
            step={1}
            value={agent.connection.maxRecoveryAttempts}
            onChange={(v) => setConn('maxRecoveryAttempts', v)}
            aria-label="Max recovery attempts"
          />
        </StackedField>
        <Field
          id="reconnectDelay"
          label="Reconnect delay"
          hint="Base wait before the first recovery retry (grows with exponential backoff). Default 1s. Lower recovers faster but retries more aggressively."
        >
          <Select
            value={agent.connection.reconnectDelay}
            options={[
              { value: 500, label: '0.5s' },
              { value: 1_000, label: '1s' },
              { value: 2_000, label: '2s' },
              { value: 5_000, label: '5s' },
            ]}
            onChange={(v) => setConn('reconnectDelay', v)}
          />
        </Field>
        <Field
          id="idleTimeout"
          label="Idle refresh"
          hint="After this idle window Limboo refreshes its health baseline. Default 5m. Off keeps background work to a minimum."
        >
          <Select
            value={agent.connection.idleTimeout}
            options={[
              { value: 0, label: 'Off' },
              { value: 60_000, label: '1m' },
              { value: 300_000, label: '5m' },
              { value: 600_000, label: '10m' },
              { value: 1_800_000, label: '30m' },
            ]}
            onChange={(v) => setConn('idleTimeout', v)}
          />
        </Field>
        <Field
          id="autoRestart"
          label="Auto-restart after crashes"
          hint="Re-probe and return to Ready automatically after a recoverable capability error. Default on. Risk: none — it never re-runs your prompt without asking."
        >
          <Toggle checked={agent.connection.autoRestart} onChange={(v) => setConn('autoRestart', v)} />
        </Field>
        <Field
          id="sessionPersistence"
          label="Persist sessions & diagnostics"
          hint="Keep conversation continuity and the diagnostics console across app restarts. Default on. Off reduces on-disk footprint."
        >
          <Toggle checked={agent.connection.sessionPersistence} onChange={(v) => setConn('sessionPersistence', v)} />
        </Field>
        <Field
          id="connectivityNotifications"
          label="Connectivity notifications"
          hint="Desktop notifications when the agent reconnects or hits a usage limit. Default on."
        >
          <Toggle
            checked={agent.connection.connectivityNotifications}
            onChange={(v) => setConn('connectivityNotifications', v)}
          />
        </Field>
      </Section>
    </div>
  );
}
