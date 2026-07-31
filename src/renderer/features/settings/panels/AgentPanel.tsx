/**
 * Coding-agent settings. Limboo orchestrates the local, already-authenticated
 * Claude Code (via the Claude Agent SDK) — it never stores Anthropic credentials.
 * This panel shows the live connection status (lifecycle-aware) and the knobs
 * that shape how the agent is driven: model, thinking, permissions, web search,
 * turn budget, and the connection-monitoring / reliability controls.
 */
import { useEffect, useState } from 'react';
import { AGENT_CONNECTION_LIMITS, AGENT_LIMITS } from '@shared/constants';
import { cn } from '@/renderer/lib/cn';
import { ProviderIcon } from '@/renderer/components/brand/ProviderIcon';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { useAgentStore } from '@/renderer/stores/useAgentStore';
import { lifecycleMeta } from '@/renderer/features/agent/status';
import { useAgentModels } from '@/renderer/features/agent/models';
import { Field, Section, Select, SegmentedControl, Slider, StackedField, TextInput, Toggle } from '../controls';
import { ProviderStatusRow } from './ProviderCard';
import { CursorProviderCard } from './CursorProviderCard';
import { AgentTroubleshooting } from './AgentTroubleshooting';
import { RuntimeIndicatorsSection } from './RuntimeIndicatorsSection';

export function AgentPanel() {
  const agent = useSettingsStore((s) => s.settings.agent);
  const update = useSettingsStore((s) => s.update);
  const lifecycle = useAgentStore((s) => s.lifecycle);
  const install = useAgentStore((s) => s.install);
  const models = useAgentModels();

  const meta = lifecycleMeta(lifecycle, install.installed);
  const set = <K extends keyof typeof agent>(key: K, value: (typeof agent)[K]) =>
    void update({ agent: { [key]: value } });
  const setConn = <K extends keyof typeof agent.connection>(
    key: K,
    value: (typeof agent.connection)[K],
  ) => void update({ agent: { connection: { [key]: value } } });
  const setSandbox = <K extends keyof typeof agent.sandbox>(
    key: K,
    value: (typeof agent.sandbox)[K],
  ) => void update({ agent: { sandbox: { [key]: value } } });

  return (
    <div className="flex flex-col gap-5">
      <Section
        title="Providers"
        hint="The coding agents Limboo can orchestrate. Claude Code reuses its own local login; Cursor connects via CLI sign-in or an encrypted API key — Anthropic keys never pass through this app."
      >
        <ProviderStatusRow
          provider="anthropic"
          name="Claude Code"
          statusLine={
            install.installed
              ? 'Connected — reusing your local Claude Code login.'
              : install.error ?? 'Not connected.'
          }
          meta={meta}
        />
        <CursorProviderCard />
      </Section>

      <Section title="Model & thinking">
        <StackedField id="model" label="Model" hint="Which model the agent runs — the provider follows the model. Default Sonnet 4.6.">
          <div className="flex flex-wrap gap-1.5">
            {models.map((m) => {
              const active = agent.model === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => set('model', m.value)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors',
                    active
                      ? 'border-accent/50 bg-elevated text-fg'
                      : 'border-line bg-surface-2 text-muted hover:text-fg',
                  )}
                >
                  <ProviderIcon provider={m.provider} size={13} className={active ? 'text-accent' : 'text-faint'} />
                  {m.label}
                </button>
              );
            })}
          </div>
        </StackedField>
        <Field id="thinking" label="Extended thinking" hint="How much the agent reasons before acting. Default Adaptive.">
          <SegmentedControl
            value={agent.thinking}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'on', label: 'On' },
              { value: 'adaptive', label: 'Adaptive' },
            ]}
            onChange={(value) => set('thinking', value)}
          />
        </Field>
      </Section>

      <Section title="Permissions & tools" hint="Control which agent actions need your approval before they run.">
        <Field
          id="permissionMode"
          label="Approval policy"
          hint="Edits & commands (default) prompts for writes and shell; Everything prompts for all tools; Auto runs without prompting (still path-guarded to the workspace) — use with care."
        >
          <SegmentedControl
            value={agent.permissionMode}
            options={[
              { value: 'approve-edits', label: 'Edits & commands' },
              { value: 'approve-all', label: 'Everything' },
              { value: 'auto', label: 'Auto' },
            ]}
            onChange={(value) => set('permissionMode', value)}
          />
        </Field>
        <Field
          id="autoApproveReads"
          label="Auto-approve reads"
          hint="Let the agent read, search, and look things up without prompting. Default on — reads can't modify your project."
        >
          <Toggle checked={agent.autoApproveReads} onChange={(v) => set('autoApproveReads', v)} />
        </Field>
        <Field
          id="webSearch"
          label="Web search"
          hint="Allow the built-in web search / fetch tools. Default on. Turning this off keeps the agent fully offline-local."
        >
          <Toggle checked={agent.webSearch} onChange={(v) => set('webSearch', v)} />
        </Field>
        <StackedField
          id="maxTurns"
          label={`Max turns per run · ${agent.maxTurns}`}
          hint="Upper bound on the agent's internal steps before it yields back to you. Default 24. Higher allows longer autonomous runs."
        >
          <Slider
            min={AGENT_LIMITS.maxTurns.min}
            max={AGENT_LIMITS.maxTurns.max}
            step={1}
            value={agent.maxTurns}
            onChange={(v) => set('maxTurns', v)}
            showTicks={false}
            aria-label="Max turns per run"
          />
        </StackedField>
      </Section>

      <Section
        title="Sandbox"
        hint="OS-level containment applied to whichever agent runs (Claude via the Agent SDK, Cursor via its CLI). The filesystem is always jailed to the session worktree and Limboo's own data is always denied — these knobs only widen writes or tighten the network. Containment sits beneath the approval policy above; it never replaces it."
      >
        <Field
          id="sandboxMode"
          label="Sandbox"
          hint="Auto enables the OS jail when the platform supports it (bubblewrap on Linux/WSL2, Seatbelt on macOS); Disabled turns it off. Unavailable platforms degrade gracefully unless Strict is on."
        >
          <SegmentedControl
            value={agent.sandbox.mode}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'enabled', label: 'Enabled' },
              { value: 'disabled', label: 'Disabled' },
            ]}
            onChange={(value) => setSandbox('mode', value)}
          />
        </Field>
        <Field
          id="sandboxNetwork"
          label="Network"
          hint="Allowlist permits only the domains you list; Off blocks all network. All keeps the network open — Cursor still isolates the filesystem, but Claude's OS jail can't keep the network open (it jails network + filesystem together), so under All, Claude stays on its standard permission guards. Pick Allowlist or Off to engage Claude's full OS jail."
        >
          <SegmentedControl
            value={agent.sandbox.network}
            options={[
              { value: 'all', label: 'All' },
              { value: 'allowlist', label: 'Allowlist' },
              { value: 'off', label: 'Off' },
            ]}
            onChange={(value) => setSandbox('network', value)}
          />
        </Field>
        {agent.sandbox.network === 'allowlist' && (
          <StackedField
            id="sandboxAllowedDomains"
            label="Allowed domains"
            hint="Comma- or newline-separated. Wildcards like *.github.com are allowed. Only these hosts are reachable from sandboxed commands."
          >
            <ListInput
              value={agent.sandbox.allowedDomains}
              placeholder="github.com, *.npmjs.org"
              onCommit={(v) => setSandbox('allowedDomains', v)}
            />
          </StackedField>
        )}
        <StackedField
          id="sandboxWritePaths"
          label="Extra writable paths"
          hint="Absolute directories the agent may write outside the worktree (comma- or newline-separated). The worktree is always writable; secrets, the database, and config files are never writable (paths pointing at them are dropped)."
        >
          <ListInput
            value={agent.sandbox.allowWritePaths}
            placeholder="/tmp/build"
            onCommit={(v) => setSandbox('allowWritePaths', v)}
          />
        </StackedField>
        <StackedField
          id="sandboxExcludedCommands"
          label="Excluded commands"
          hint="Commands that run outside the sandbox (comma- or newline-separated) — for tools incompatible with it, e.g. docker. They still pass through the approval policy. Claude only; Cursor has no per-command exclusion."
        >
          <ListInput
            value={agent.sandbox.excludedCommands}
            placeholder="docker *, terraform"
            onCommit={(v) => setSandbox('excludedCommands', v)}
          />
        </StackedField>
        <Field
          id="sandboxReadOnlyAttachments"
          label="Read-only attachments"
          hint="Mount the session's attachment staging directory read-only inside the jail. Default on."
        >
          <Toggle
            checked={agent.sandbox.readOnlyAttachments}
            onChange={(v) => setSandbox('readOnlyAttachments', v)}
          />
        </Field>
        <Field
          id="sandboxFailIfUnavailable"
          label="Strict — block if unavailable"
          hint="Block a run when the sandbox can't start (missing bubblewrap or an unsupported OS) instead of degrading to an unsandboxed run. Also closes the escape hatch — a command can never pop out to run unsandboxed (it must be sandboxed or listed in Excluded commands). Default off."
        >
          <Toggle
            checked={agent.sandbox.failIfUnavailable}
            onChange={(v) => setSandbox('failIfUnavailable', v)}
          />
        </Field>
        <Field
          id="sandboxProviderOverride"
          label="Provider sandbox"
          hint="Auto uses the native sandbox of whichever agent runs. Pin to only sandbox Claude runs or only Cursor runs."
        >
          <SegmentedControl
            value={agent.sandbox.providerOverride}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'claude-native', label: 'Claude' },
              { value: 'cursor-native', label: 'Cursor' },
            ]}
            onChange={(value) => setSandbox('providerOverride', value)}
          />
        </Field>
      </Section>

      <Section
        title="Plan Mode"
        hint="Plan Mode is the review-first workflow — the agent analyzes read-only and proposes a plan you approve before any files change. Its settings now live in the dedicated Plan & Tasks category."
      >
        <p className="text-[12px] text-faint">
          Configure Plan-mode defaults, the Task Panel, execution, and plan history under
          <span className="text-muted"> Settings › Plan &amp; Tasks</span>.
        </p>
      </Section>

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

      {/* Runtime Indicators sits between reliability and delegation: it is the
          surface that tells you how the running agent is doing right now. */}
      <RuntimeIndicatorsSection />

      <Section
        title="Subagents"
        hint="When the agent delegates work — research, review, testing — the worker appears as one inline activity in the conversation, expandable into its execution record. There is deliberately no separate subagent panel: a subagent runs in its own context window and returns only a distilled result, so a second surface would duplicate the timeline and the Tasks drawer."
      >
        <Field
          id="subagentInline"
          label="Inline activity"
          hint="Show a delegation as its own row with live progress and an expandable execution record. Off folds a worker's calls back into ordinary tool chips."
        >
          <Toggle
            checked={agent.subagents.inlineActivity}
            onChange={(v) => set('subagents', { ...agent.subagents, inlineActivity: v })}
            aria-label="Show subagents as inline activity"
          />
        </Field>
        <Field
          id="subagentProgress"
          label="Live progress summaries"
          hint="Ask the provider for a present-tense description of what a worker is doing (“Analyzing authentication module”), refreshed while it runs. Costs a small periodic fork of the worker's conversation. Off falls back to progress derived from the tools it calls."
        >
          <Toggle
            checked={agent.subagents.progressSummaries}
            onChange={(v) => set('subagents', { ...agent.subagents, progressSummaries: v })}
            aria-label="Request subagent progress summaries"
          />
        </Field>
        <Field
          id="subagentForwardText"
          label="Capture the worker's transcript"
          hint="Keep a worker's own narration inside its row. It never enters the main conversation and is never fed back to the agent — it is stored as data you can read. Reasoning is not included: neither provider exposes a subagent's chain of thought."
        >
          <Toggle
            checked={agent.subagents.forwardText}
            onChange={(v) => set('subagents', { ...agent.subagents, forwardText: v })}
            aria-label="Forward subagent transcripts"
          />
        </Field>
      </Section>

      <Section
        title="Hook Engine"
        hint="The provider-neutral governance layer. Every governed action (session, prompt, tool gate, file edit, shell, checkpoint) is recorded to the session's audit trail — identically whether Claude or Cursor is running. The trail feeds the Work Graph and session diagnostics. This only affects what is recorded; it never weakens enforcement (the permission gate always runs)."
      >
        <Field
          id="hookEngineEnabled"
          label="Governance audit"
          hint="Record normalized lifecycle events to the audit trail. Turning this off stops the recording but does not change what the agent is or isn't allowed to do."
        >
          <Toggle
            checked={agent.hookEngine.enabled}
            onChange={(v) => set('hookEngine', { ...agent.hookEngine, enabled: v })}
            aria-label="Enable the Hook Engine governance audit"
          />
        </Field>
        <Field
          id="hookEngineAudit"
          label="Audit detail"
          hint="Lifecycle keeps session, prompt, tool-gate, checkpoint, and subagent events. Verbose adds every per-tool observe event (post-tool, shell, file edit). Off records nothing."
        >
          <SegmentedControl
            value={agent.hookEngine.audit}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'lifecycle', label: 'Lifecycle' },
              { value: 'verbose', label: 'Verbose' },
            ]}
            onChange={(value) => set('hookEngine', { ...agent.hookEngine, audit: value })}
          />
        </Field>
      </Section>

      <Section title="Diagnostics" hint="How much detail the Agent Console and main log capture.">
        <Field
          id="logVerbosity"
          label="Log verbosity"
          hint="Verbose includes low-level debug lines (handshakes, stream start/stop). Default Normal. Quiet keeps only warnings and errors."
        >
          <SegmentedControl
            value={agent.logVerbosity}
            options={[
              { value: 'quiet', label: 'Quiet' },
              { value: 'normal', label: 'Normal' },
              { value: 'verbose', label: 'Verbose' },
            ]}
            onChange={(value) => set('logVerbosity', value)}
          />
        </Field>
      </Section>

      <AgentTroubleshooting />
    </div>
  );
}

/**
 * Comma/newline-separated list editor backed by a `string[]` setting. Holds a
 * transient text buffer while typing and commits the parsed, de-duped list on
 * blur (the main process re-validates/caps every entry, so this is display-only
 * convenience). Reseeds when the persisted value changes (e.g. Reset).
 */
function ListInput({
  value,
  placeholder,
  onCommit,
}: {
  value: string[];
  placeholder?: string;
  onCommit: (value: string[]) => void;
}) {
  const [text, setText] = useState(value.join(', '));
  useEffect(() => setText(value.join(', ')), [value]);
  const commit = () => {
    const parsed = [...new Set(text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean))];
    onCommit(parsed);
  };
  return (
    <TextInput value={text} placeholder={placeholder} onChange={setText} onBlur={commit} />
  );
}
