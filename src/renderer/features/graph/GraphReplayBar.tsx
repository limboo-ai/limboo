/**
 * Historical replay — scrub the graph back through its own construction.
 *
 * Every node carries a real timestamp, so replay needs no extra recording: it
 * is just a filter on `startedAt`. This is a VIEWER CONTROL, not a setting —
 * there is nothing to persist, so it lives here rather than in the settings
 * panel.
 */
import { Pause, Play, SkipForward } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { IconButton } from '@/renderer/components/ui/IconButton';
import { Slider } from '@/renderer/features/settings/controls';
import { relativeTime } from '@/renderer/lib/format';
import { useSettingsStore } from '@/renderer/stores/useSettingsStore';

/**
 * Milliseconds between replay steps at 1x. The `graph.animationSpeed` setting
 * scales this — it used to be a hardcoded constant with a shipped speed control
 * that drove nothing.
 */
const STEP_MS = 220;

interface GraphReplayBarProps {
  /** Node timestamps, ascending — the positions the scrubber can stop at. */
  stamps: number[];
  /** Current cutoff, or null when replay is off (show everything). */
  cutoff: number | null;
  onChange: (cutoff: number | null) => void;
}

export function GraphReplayBar({ stamps, cutoff, onChange }: GraphReplayBarProps) {
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const speed = useSettingsStore((s) => s.settings.graph.animationSpeed);
  const stepMs = Math.max(30, Math.round(STEP_MS / Math.max(speed, 0.1)));

  const index = cutoff === null ? stamps.length - 1 : upperBound(stamps, cutoff);

  // Advance while playing; stop automatically at the end rather than looping,
  // which would make it unclear whether the run had finished.
  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      const at = cutoff === null ? stamps.length - 1 : upperBound(stamps, cutoff);
      if (at >= stamps.length - 1) {
        setPlaying(false);
        onChange(null);
        return;
      }
      onChange(stamps[at + 1]);
    }, stepMs);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [playing, cutoff, stamps, onChange, stepMs]);

  if (stamps.length < 2) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-line px-2 py-1.5">
      <IconButton
        label={playing ? 'Pause replay' : 'Replay this session'}
        size="sm"
        onClick={() => {
          if (!playing && cutoff === null) onChange(stamps[0]);
          setPlaying((v) => !v);
        }}
      >
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </IconButton>

      {/*
        The house Slider, not a raw range input. `.limboo-slider` is the WRAPPER
        class — it expects the track/fill/thumb children this component provides
        — so putting it on a bare `<input type="range">` produced an unstyled
        native control with none of the token palette, ticks, focus ring, or
        reduced-motion handling.
      */}
      <Slider
        min={0}
        max={Math.max(stamps.length - 1, 0)}
        step={1}
        value={index}
        showTicks={false}
        aria-label="Replay position"
        className="min-w-0 flex-1"
        onChange={(next) => {
          setPlaying(false);
          onChange(next >= stamps.length - 1 ? null : stamps[next]);
        }}
      />

      <span className="shrink-0 tabular-nums text-[10px] text-faint">
        {index + 1}/{stamps.length}
        {cutoff !== null && ` · ${relativeTime(cutoff)}`}
      </span>

      {cutoff !== null && (
        <IconButton
          label="Show the whole graph"
          size="sm"
          onClick={() => {
            setPlaying(false);
            onChange(null);
          }}
        >
          <SkipForward size={13} />
        </IconButton>
      )}
    </div>
  );
}

/** Index of the last stamp <= `value`. Stamps are ascending. */
function upperBound(stamps: number[], value: number): number {
  let lo = 0;
  let hi = stamps.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (stamps[mid] <= value) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}
