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
import { RuntimeIndicatorsSection } from './RuntimeIndicatorsSection';

export function RuntimePanel() {
  return (
    <div className="flex flex-col gap-5">
      <RuntimeIndicatorsSection />
    </div>
  );
}
