/**
 * Claude Code harness controls — the body of the Claude card in
 * Settings › Agent › Harnesses.
 *
 * Claude Code needs no authentication UI (Limboo reuses the CLI's own local
 * login and stores no Anthropic credentials), so this carries only the two
 * knobs that decide HOW an Anthropic model runs: the documented rollback to
 * the direct Claude Agent SDK, and adapter log forwarding.
 */
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { Field, Toggle } from '../controls';

export function ClaudeCodeControls() {
  const harness = useSettingsStore((s) => s.settings.agent.harness);
  const update = useSettingsStore((s) => s.update);
  const set = <K extends keyof typeof harness>(key: K, value: (typeof harness)[K]): void =>
    void update({ agent: { harness: { [key]: value } } });

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
