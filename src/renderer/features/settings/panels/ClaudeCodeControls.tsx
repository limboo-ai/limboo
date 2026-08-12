/**
 * Claude Code harness controls — the body of the Claude card in
 * Settings › Agent › Harnesses.
 *
 * Claude Code needs no authentication UI (Limboo reuses the CLI's own local
 * login and stores no Anthropic credentials), so this carries the knobs that
 * decide HOW an Anthropic model runs, plus the one-time approval for the
 * harness's setup step.
 *
 * The setup commands are read from the ADAPTER, never hardcoded here — a
 * consent surface that shows something other than what will run is worse than
 * no consent surface. Approving stores a fingerprint of those exact commands,
 * so an adapter upgrade that changes them asks again.
 */
import { useEffect, useState } from 'react';
import type { HarnessBootstrapInfo } from '@shared/types';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { ActionButton, Field, StackedField, Toggle } from '../controls';

export function ClaudeCodeControls() {
  const harness = useSettingsStore((s) => s.settings.agent.harness);
  const update = useSettingsStore((s) => s.update);
  const set = <K extends keyof typeof harness>(key: K, value: (typeof harness)[K]): void =>
    void update({ agent: { harness: { [key]: value } } });

  const [info, setInfo] = useState<HarnessBootstrapInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const next = await window.limboo?.agent?.harnessBootstrapPlan?.();
      setInfo(next ?? null);
    } finally {
      setLoading(false);
    }
  };

  // Only ask main when the harness path is actually selectable — loading the
  // adapter is real work, and there is nothing to approve while the legacy SDK
  // path is in use.
  useEffect(() => {
    if (harness.legacyClaudeSdk) {
      setInfo(null);
      return;
    }
    void load();
    // Re-reads when the stored ack changes so the state reflects an approval.
  }, [harness.legacyClaudeSdk, harness.bootstrapAck, harness.id]);

  const plan = info?.plan ?? null;
  const needsAck = !!plan && !info?.acked;

  return (
    <div className="flex flex-col gap-1">
      <Field
        id="harnessLegacySdk"
        label="Use the direct Claude Agent SDK"
        hint="Runs Anthropic models through Limboo's own Claude Agent SDK integration instead of the AI SDK harness. The documented rollback while the harness path settles — the harness packages are experimental. On by default."
      >
        <Toggle
          checked={harness.legacyClaudeSdk}
          onChange={(v) => set('legacyClaudeSdk', v)}
          label="Legacy SDK path"
        />
      </Field>

      {!harness.legacyClaudeSdk && (
        <StackedField
          id="harnessBootstrap"
          label="One-time setup"
          hint="Before its first session the harness installs the Claude Code CLI into its own directory beside your worktree — never into your repository. This reaches the npm registry from this machine, so it needs your approval once. Review the exact commands below."
        >
          {info && !info.available ? (
            <p className="text-[12px] text-danger">
              {info.error ?? 'The harness adapter could not be loaded.'}
            </p>
          ) : plan ? (
            <div className="flex flex-col gap-2">
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-line bg-surface-2 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-fg">
                {plan.commands.join('\n\n')}
              </pre>
              <div className="flex items-center gap-1.5">
                {needsAck ? (
                  <ActionButton
                    label="Approve these commands"
                    primary
                    onClick={() => set('bootstrapAck', plan.fingerprint)}
                  />
                ) : (
                  <>
                    <span className="text-[11px] text-success">Approved.</span>
                    <ActionButton label="Revoke" danger onClick={() => set('bootstrapAck', '')} />
                  </>
                )}
                <ActionButton label={loading ? 'Checking…' : 'Recheck'} onClick={() => void load()} />
              </div>
              {needsAck && harness.bootstrapAck !== '' && (
                <p className="text-[11px] text-warning">
                  These commands changed since you approved them, so approval is needed again.
                </p>
              )}
            </div>
          ) : (
            <p className="text-[12px] text-faint">
              {loading ? 'Checking…' : 'This harness needs no setup step.'}
            </p>
          )}
        </StackedField>
      )}

      <Field
        id="harnessDebug"
        label="Adapter diagnostics"
        hint="Forward the harness adapter's own log lines into the Agent Console. Verbose — useful when a run fails before streaming starts."
      >
        <Toggle
          checked={harness.debug}
          onChange={(v) => set('debug', v)}
          label="Forward adapter logs"
        />
      </Field>
    </div>
  );
}
