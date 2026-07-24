/**
 * Session "agent run in flight" indicator. Renders the shared {@link HelixLoader}
 * (kept as a named wrapper so its call sites — session rows, the session header,
 * worktree tabs — stay unchanged). `invert` renders the base (dark) colour for
 * accent backgrounds; `disabled` hides it. Reduced-motion is honoured globally.
 */
import { cn } from '@/renderer/lib/cn';
import { HelixLoader } from './HelixLoader';

export function SessionSpinner({
  size = 16,
  invert,
  disabled,
  className,
}: {
  size?: number;
  invert?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  if (disabled) return null;
  return <HelixLoader size={size} invert={invert} className={cn(className)} label="Working" />;
}
