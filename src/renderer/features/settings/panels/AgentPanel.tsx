/**
 * Coding-agent settings. Limboo orchestrates the local, already-authenticated
 * Claude Code (via the Claude Agent SDK) — it never stores Anthropic credentials.
 * This panel shows the live connection status (lifecycle-aware) and the knobs
 * that shape how the agent is driven: model, thinking, permissions, web search,
 * turn budget, and the connection-monitoring / reliability controls.
 */
import { useEffect, useState } from 'react';
import {
  AGENT_LIMITS,
  AGENT_MODELS,
  DEFAULT_SETTINGS,
  HARNESSES_WITHOUT_READ_GATING,
  HARNESS_LABELS,
  PROVIDER_HARNESS,
  resolveModelRouting,
} from '@shared/constants';
import { cn } from '@/renderer/lib/cn';
import { ProviderIcon } from '@/renderer/components/brand/ProviderIcon';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';
import { useAgentStore } from '@/renderer/stores/useAgentStore';
import { lifecycleMeta } from '@/renderer/features/agent/status';
import { useAgentModels } from '@/renderer/features/agent/models';
import { Field, Section, SegmentedControl, Slider, StackedField, TextInput, Toggle } from '../controls';
import { HarnessCard } from './HarnessCard';
import { CursorAuthControls, useCursorStatus } from './CursorProviderCard';
import { ClaudeCodeControls } from './ClaudeCodeControls';
import { AgentTroubleshooting } from './AgentTroubleshooting';

export function AgentPanel() {
  const agent = useSettingsStore((s) => s.settings.agent);
  const update = useSettingsStore((s) => s.update);
  const lifecycle = useAgentStore((s) => s.lifecycle);
  const install = useAgentStore((s) => s.install);
  const models = useAgentModels();
  const cursorStatus = useCursorStatus();

  // DERIVED, never retyped: the hint used to read "Default Sonnet 4.6" while
  // the actual default had moved on to Opus 5. A hardcoded copy of a value
  // that lives elsewhere goes stale silently.
  const defaultModelLabel =
    AGENT_MODELS.find((m) => m.value === DEFAULT_SETTINGS.agent.model)?.label ??
    DEFAULT_SETTINGS.agent.model;

  // The harness serving the SELECTED model, and whether it can honour
  // `autoApproveReads` at all (the AI SDK harnesses cannot — see the shared
  // constant). Only used to tell the truth in a hint; the toggle still writes.
  const activeProvider = resolveModelRouting(agent.model).provider;
  const activeHarnessId = activeProvider ? PROVIDER_HARNESS[activeProvider] : null;
  const activeHarnessLabel = activeHarnessId ? HARNESS_LABELS[activeHarnessId] ?? activeHarnessId : 'Unknown model';
  const readGatingUnavailable =
    !!activeHarnessId &&
    agent.harness.id === activeHarnessId &&
    !agent.harness.legacyClaudeSdk &&
    HARNESSES_WITHOUT_READ_GATING.includes(activeHarnessId);

  const meta = lifecycleMeta(lifecycle, install.installed);
  const claudeActive = activeHarnessId === 'claude-code';
  const cursorActive = activeHarnessId === 'cursor-cli';
  const claudeStatusLine = install.installed
    ? claudeActive
      ? 'Active — reusing your local Claude Code login.'
      : 'Available — not selected for the current model.'
    : install.error ?? 'Not connected.';
  const cursorStatusLine = cursorActive
    ? `Active — ${cursorStatus.line}`
    : cursorStatus.meta.label === 'Connected'
      ? `Available — ${cursorStatus.line}. Not selected for the current model.`
      : `Not selected — ${cursorStatus.line}`;
  const availableMeta = { ...lifecycleMeta('ready', true), label: 'Available' };
  const claudeMeta = claudeActive ? meta : install.installed ? availableMeta : meta;
  const cursorMeta =
    cursorActive || cursorStatus.meta.label !== 'Connected'
      ? cursorStatus.meta
      : { ...cursorStatus.meta, label: 'Available' };
  const harnessCards = [
    <HarnessCard key="claude-code" harnessId="claude-code" statusLine={claudeStatusLine} meta={claudeMeta}>
      <ClaudeCodeControls />
    </HarnessCard>,
    <HarnessCard key="cursor-cli" harnessId="cursor-cli" statusLine={cursorStatusLine} meta={cursorMeta}>
      <CursorAuthControls />
    </HarnessCard>,
  ];
  if (cursorActive) harnessCards.reverse();
  const set = <K extends keyof typeof agent>(key: K, value: (typeof agent)[K]) =>
    void update({ agent: { [key]: value } });
  const setSandbox = <K extends keyof typeof agent.sandbox>(
    key: K,
    value: (typeof agent.sandbox)[K],
  ) => void update({ agent: { sandbox: { [key]: value } } });

  return (
    <div className="flex flex-col gap-5">
      <Section
        title="Harnesses"
        hint="The coding agents Limboo can drive. A harness is HOW a model runs; picking a model in the composer selects its harness. Claude Code reuses its own local login; Cursor connects via CLI sign-in or an encrypted API key — no provider credentials are stored by this app."
      >
        {!activeHarnessId && (
          <p className="px-2 text-[11px] text-warning">
            Unknown model selected. Pick a known model before sending prompts.
          </p>
        )}
        {harnessCards}
      </Section>

      <Section title="Model & thinking">
        <StackedField
          id="model"
          label="Model"
          hint={`Which model the agent runs — the harness follows the model. Default ${defaultModelLabel}.`}
        >
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
          hint={
            readGatingUnavailable
              ? `Let the agent read, search, and look things up without prompting. Default on — reads can't modify your project. Not enforced on ${activeHarnessLabel}: its runtime allows built-in file reads unconditionally, so turning this off will not make it ask.`
              : "Let the agent read, search, and look things up without prompting. Default on — reads can't modify your project."
          }
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
