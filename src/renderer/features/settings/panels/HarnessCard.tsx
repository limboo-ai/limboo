/**
 * One harness in Settings › Agent › Harnesses.
 *
 * Replaces the two hand-rolled provider cards with a single shape: the shared
 * {@link ProviderStatusRow} on top (icon, name, live status, status pill) and a
 * slot beneath for whatever that harness needs configured. Previously the
 * Claude row was an inline status row with a hardcoded string while Cursor was
 * a 321-line bespoke card, so the two could not look alike or stay in step.
 *
 * A harness with no adapter renders as "Not available" rather than being
 * hidden: this section is the DISCOVERY surface, and silently omitting a
 * harness makes "not installed" indistinguishable from "does not exist".
 * (CLAUDE.md's "the UI never knows which agent is running" rule governs the
 * conversation surfaces — Settings is where the choice is made.)
 */
import type { ReactNode } from 'react';
import { HARNESS_LABELS } from '@shared/constants';
import type { AgentProvider } from '@shared/constants';
import type { LifecycleMeta } from '@/renderer/features/agent/status';
import { ProviderStatusRow } from './ProviderCard';

/** Which provider icon a harness shows. */
const HARNESS_PROVIDER: Record<string, AgentProvider> = {
  'claude-code': 'anthropic',
  'cursor-cli': 'cursor',
};

export function HarnessCard({
  harnessId,
  statusLine,
  meta,
  children,
}: {
  harnessId: string;
  statusLine: string;
  meta: LifecycleMeta;
  children?: ReactNode;
}) {
  const label = HARNESS_LABELS[harnessId] ?? harnessId;
  const provider = HARNESS_PROVIDER[harnessId] ?? 'anthropic';
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-3">
      <ProviderStatusRow provider={provider} name={label} statusLine={statusLine} meta={meta} />
      {children}
    </div>
  );
}
