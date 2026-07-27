/**
 * Copy-to-clipboard with a settled confirmation tick.
 *
 * Clipboard access goes through the preload bridge
 * (`window.limboo.system.clipboardWrite`) rather than `navigator.clipboard` —
 * main owns the native integration and caps the payload. The timer is cleared on
 * unmount: a section can be collapsed, or a message re-rendered by a streaming
 * delta, while the tick is still showing.
 *
 * `value` may be a function so callers can compute the text AT CLICK TIME. That
 * is what lets a copy action capture a message that is still streaming instead
 * of whatever it happened to contain when the button rendered.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/renderer/lib/cn';

export function CopyButton({
  value,
  label,
  size = 12,
  className,
}: {
  value: string | (() => string);
  label: string;
  size?: number;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        void window.limboo?.system?.clipboardWrite(typeof value === 'function' ? value() : value);
        setDone(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 1200);
      }}
      className={cn(
        'shrink-0 rounded p-1 text-faint transition-colors hover:bg-surface-2 hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        done && 'text-success',
        className,
      )}
    >
      {done ? <Check size={size} /> : <Copy size={size} />}
    </button>
  );
}
