/**
 * ConversationRail — the conversation's PreviewRail: one tick per message block
 * (a user prompt and everything the agent did in reply), pinned to the right
 * edge of the chat scroller. Hovering a tick raises the pyramid and floats a
 * preview of that prompt; clicking jumps the scroller to it.
 *
 * It appears on its own once a conversation is long enough to be worth
 * navigating ({@link MIN_TURNS}) — below that the scroll bar is a better
 * affordance and the rail would just be chrome.
 *
 * The "current" tick is driven by an IntersectionObserver over the turn
 * anchors, so scrolling by any means (wheel, keyboard, auto-follow while the
 * agent streams) keeps the rail in sync.
 */
import { useEffect, useMemo, useState } from 'react';
import { PreviewRail, type PreviewRailItem } from '@/renderer/components/ui';
import { useAgentStore, EMPTY_SNAPSHOT } from '@/renderer/stores/useAgentStore';
import { relativeTime } from '@/renderer/lib/format';
import { turnAnchorId } from './ConversationView';

/** Below this many prompts the rail stays out of the way. */
const MIN_TURNS = 3;

export function ConversationRail({ sessionId }: { sessionId: string }) {
  const messages = useAgentStore((s) => (s.bySession[sessionId] ?? EMPTY_SNAPSHOT).messages);
  const [activeId, setActiveId] = useState<string | null>(null);

  const items = useMemo<PreviewRailItem[]>(() => {
    const now = Date.now();
    return messages
      .filter((m) => m.role === 'user')
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => {
        const text = m.text.trim();
        const firstBreak = text.indexOf('\n');
        const label = (firstBreak > 0 ? text.slice(0, firstBreak) : text).slice(0, 120);
        const rest = firstBreak > 0 ? text.slice(firstBreak + 1).trim() : '';
        return {
          id: m.id,
          label: label || 'Prompt',
          description: rest ? rest.slice(0, 200) : undefined,
          meta: relativeTime(m.createdAt, now),
        };
      });
  }, [messages]);

  // Track which turn owns the viewport. `rootMargin` biases the choice toward
  // the top of the scroller so the tick matches what the user is reading.
  useEffect(() => {
    if (items.length < MIN_TURNS) return;
    const nodes = items
      .map((item) => document.getElementById(turnAnchorId(item.id)))
      .filter((el): el is HTMLElement => !!el);
    if (!nodes.length) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute('data-turn-id');
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        // The first item (in conversation order) that is on screen.
        const first = items.find((item) => visible.has(item.id));
        if (first) setActiveId(first.id);
      },
      { rootMargin: '-8% 0px -60% 0px', threshold: 0 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [items]);

  if (items.length < MIN_TURNS) return null;

  const jump = (id: string) => {
    document
      .getElementById(turnAnchorId(id))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(id);
  };

  return (
    <div className="animate-fade-in pointer-events-none absolute inset-y-0 right-2 z-20 flex items-center">
      <PreviewRail
        items={items}
        activeId={activeId ?? undefined}
        onSelect={jump}
        align="end"
        label="Jump to a message"
      />
    </div>
  );
}
