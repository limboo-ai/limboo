/**
 * A fenced code block in the conversation: Shiki-highlighted, with a language
 * badge, a persistent copy button, gutter line numbers (added in CSS from
 * Shiki's per-line spans), and horizontal scroll that never disrupts the
 * surrounding message. While a message is still streaming we render plain text
 * (highlighting kicks in once the block settles) to avoid re-highlighting on
 * every token.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/renderer/lib/cn';
import { highlightCode } from '@/renderer/lib/highlight';

export function CodeBlock({
  code,
  lang,
  streaming = false,
  startLine,
  label,
  className,
}: {
  code: string;
  lang?: string;
  streaming?: boolean;
  /** First line's real number in the source file — offsets the gutter counter. */
  startLine?: number;
  /** Replaces the language badge (e.g. the path a Read tool actually read). */
  label?: string;
  className?: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    if (streaming) {
      setHtml(null);
      return;
    }
    void highlightCode(code, lang).then((result) => {
      if (alive) setHtml(result);
    });
    return () => {
      alive = false;
    };
  }, [code, lang, streaming]);

  const copy = () => {
    void window.limboo?.system?.clipboardWrite(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  // The gutter counter starts at 1 by default; an offset read (Read with an
  // `offset`) starts wherever the file actually did.
  const gutter =
    startLine && startLine > 1
      ? ({ ['--limboo-code-start' as string]: String(startLine - 1) } as CSSProperties)
      : undefined;

  return (
    <div className={cn('my-2 overflow-hidden rounded-xl border border-line bg-[#0a0a0a]', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line/70 bg-surface px-3 py-1">
        <span
          className={cn(
            'min-w-0 truncate font-mono text-[10px] tracking-wider text-faint',
            label ? '' : 'uppercase',
          )}
          title={label}
        >
          {label || lang || 'text'}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:bg-elevated hover:text-fg"
        >
          {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {html ? (
        <div
          className="limboo-code overflow-x-auto text-[12.5px]"
          style={gutter}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className={cn('limboo-code overflow-x-auto px-3 py-2.5 text-[12.5px]')} style={gutter}>
          <code className="font-mono text-fg">{code}</code>
        </pre>
      )}
    </div>
  );
}
