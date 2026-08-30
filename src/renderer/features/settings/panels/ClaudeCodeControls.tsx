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
 *
 * EVERY BRANCH BELOW MAKES A DIFFERENT CLAIM, and they used to be one. The
 * "installs nothing" line was the else-leg of a single ternary, so it also
 * rendered for a request still in flight, a rejected IPC, a different harness
 * being selected, and an adapter that threw while describing itself — the last
 * of which shipped, and printed "This harness needs no setup step." directly
 * under a paragraph describing the setup step. Keep the states apart.
 */
import { useEffect, useState } from 'react';
import type { HarnessBootstrapInfo } from '@shared/types';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { ActionButton, Field, StackedField, Toggle } from '../controls';

/** The harness this card describes. Never the globally-selected one. */
const HARNESS_ID = 'claude-code';

type LoadState = 'idle' | 'loading' | 'ready' | 'failed';

export function ClaudeCodeControls() {
  const harness = useSettingsStore((s) => s.settings.agent.harness);
  const update = useSettingsStore((s) => s.update);
  const set = <K extends keyof typeof harness>(key: K, value: (typeof harness)[K]): void =>
    void update({ agent: { harness: { [key]: value } } });

  const [info, setInfo] = useState<HarnessBootstrapInfo | null>(null);
  const [state, setState] = useState<LoadState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setState('loading');
    setLoadError(null);
    try {
      const call = window.limboo?.agent?.harnessBootstrapPlan;
      if (!call) {
        // No bridge (a plain browser preview, or a preload that failed to load).
        // Emphatically not "this harness installs nothing".
        setInfo(null);
        setLoadError('The app bridge is unavailable, so the setup step cannot be read.');
        setState('failed');
        return;
      }
      const next = await call(HARNESS_ID);
      setInfo(next ?? null);
      setState('ready');
    } catch (err) {
      // Without this the rejection was unhandled AND the panel fell through to
      // the "needs no setup step" line — the worst possible reading of a failure.
      setInfo(null);
      setLoadError(err instanceof Error ? err.message : String(err));
      setState('failed');
    }
  };

  // Only ask main when the harness path is actually selectable — loading the
  // adapter is real work, and there is nothing to approve while the legacy SDK
  // path is in use.
  useEffect(() => {
    if (harness.legacyClaudeSdk) {
      setInfo(null);
      setState('idle');
      setLoadError(null);
      return;
    }
    void load();
    // Re-reads when the stored ack changes so the state reflects an approval.
  }, [harness.legacyClaudeSdk, harness.bootstrapAck]);

  const plan = info?.plan ?? null;
  const needsAck = !!plan && !info?.acked;
  const missing = (info?.prerequisites ?? []).filter((p) => !p.found);
  const busy = state === 'loading';
  // `planError` is the adapter failing to describe its setup; `error` is the
  // adapter failing to load; `loadError` is the IPC itself failing.
  const failure = info?.planError ?? (info && !info.available ? info.error : null) ?? loadError;

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
          // The hint renders unconditionally (see StackedField), so it must stay
          // true in every state below. The sentence describing the npm install
          // belongs to the plan branch, which is the only place that install is
          // a fact — putting it here is what made the panel contradict itself.
          hint="What this harness does once, before its first session — read from the adapter itself, never hardcoded here."
        >
          {failure ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12px] leading-relaxed text-danger">
                {info?.planError
                  ? 'This harness has a setup step but could not describe it, so runs are refused ' +
                    'until it can. Approving commands Limboo cannot read is not something it will ' +
                    'ask you to do.'
                  : 'The harness adapter could not be loaded.'}
              </p>
              <p className="break-words font-mono text-[11px] leading-relaxed text-faint">
                {failure}
              </p>
              <div>
                <ActionButton label={busy ? 'Checking…' : 'Retry'} onClick={() => void load()} />
              </div>
            </div>
          ) : plan ? (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] leading-relaxed text-faint">
                Before its first session the harness installs the Claude Code CLI into its own
                directory beside your worktree — never into your repository. This reaches the npm
                registry from this machine, so it needs your approval once. These are the exact
                commands that will run.
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-line bg-surface-2 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-fg">
                {plan.commands.join('\n\n')}
              </pre>
              {missing.length > 0 && (
                <div className="flex flex-col gap-1 rounded-md border border-line bg-surface-2 px-2 py-1.5">
                  {missing.map((p) => (
                    <p key={p.tool} className="text-[11px] leading-relaxed text-warning">
                      <span className="font-mono">{p.tool}</span> is not installed or not on PATH.{' '}
                      <span className="text-faint">{p.hint}</span>
                    </p>
                  ))}
                  <p className="text-[11px] leading-relaxed text-faint">
                    You can still approve these commands — approval is consent, not capability —
                    but the run will be refused until the tool is present.
                  </p>
                </div>
              )}
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
                <ActionButton label={busy ? 'Checking…' : 'Recheck'} onClick={() => void load()} />
              </div>
              {needsAck && harness.bootstrapAck !== '' && (
                <p className="text-[11px] text-warning">
                  These commands changed since you approved them, so approval is needed again.
                </p>
              )}
            </div>
          ) : (
            <p className="text-[12px] text-faint">
              {state === 'ready'
                ? 'This harness installs nothing — there is nothing to approve.'
                : 'Reading the adapter’s setup step…'}
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
