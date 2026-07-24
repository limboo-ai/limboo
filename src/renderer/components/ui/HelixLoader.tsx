/**
 * Helix loader — two columns of dots weaving left↔right with a per-row phase
 * offset, giving a DNA-strand shimmer. Used as the session-live + generate/
 * stream indicator. Pure CSS (keyframe `limboo-helix` + `.limboo-helix-dot` in
 * styles/index.css); each row renders two dots running the animation in
 * antiphase (one delayed by half the cycle). Colour comes from an inline
 * `color` (dots are `background: currentColor`) so it stays on-token, and the
 * global reduced-motion switch collapses it to a static state.
 */
import { cn } from '@/renderer/lib/cn';

export function HelixLoader({
  size = 28,
  speed = 1,
  invert = false,
  label = 'Loading',
  className,
}: {
  /** Square size in px; the dots and amplitude scale from it. */
  size?: number;
  /** Seconds per weave cycle. */
  speed?: number;
  /** Render in the base (dark) colour instead of the accent — for accent backgrounds. */
  invert?: boolean;
  label?: string;
  className?: string;
}) {
  // Fewer rows at tiny inline sizes so the strand stays legible, not a blob.
  const ROWS = size <= 16 ? 5 : 7;
  const dot = size * 0.16;
  const amp = size * 0.3;
  const left = size / 2 - dot / 2;

  return (
    <span
      role="status"
      aria-label={label}
      className={cn('relative inline-block shrink-0 align-middle', className)}
      style={{
        width: size,
        height: size,
        color: invert ? 'var(--color-base)' : 'var(--color-accent)',
        // consumed by the keyframe / .limboo-helix-dot in styles/index.css
        ['--helix-speed' as string]: `${speed}s`,
        ['--helix-amp' as string]: `${amp}px`,
      }}
    >
      {Array.from({ length: ROWS }, (_, r) => {
        const top = (r / (ROWS - 1)) * (size - dot);
        const rowDelay = (r / ROWS) * speed;
        const common = { width: dot, height: dot, left, top } as const;
        return (
          <span key={r}>
            <span className="limboo-helix-dot" style={{ ...common, animationDelay: `${rowDelay}s` }} />
            <span
              className="limboo-helix-dot"
              style={{ ...common, animationDelay: `${rowDelay - speed / 2}s` }}
            />
          </span>
        );
      })}
      <span className="sr-only">{label}</span>
    </span>
  );
}
