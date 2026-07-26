/**
 * The release's changelog sections, one collapsible card per category.
 *
 * Ordered by consequence (`RELEASE_CATEGORY_ORDER`), not by the order they were
 * written: what breaks first, what is a security fix second, then the ordinary
 * Keep a Changelog progression. Someone opening this document after an update
 * wants to know whether anything just changed under them before they want to
 * read the feature list.
 *
 * Item text is rendered through the house `Markdown` component — the same
 * `remark-gfm` + `rehype-sanitize` pipeline the conversation uses, with no
 * `rehype-raw` and with links routed to `system.openExternal`. Changelog bullets
 * contain inline code, links and emphasis, and re-implementing a subset of that
 * here would be a second, less-reviewed renderer for the same content.
 *
 * Categories are identified by their NAME and nothing else — no glyph, no tone.
 * `RELEASE_CATEGORY_LABEL` already says "Breaking changes", "Security", "Fixed";
 * a red triangle in front of the word "Breaking" is the word again, in a form
 * that carries less. Consequence is expressed by ORDER (the most consequential
 * card is the first one you read), which survives colour-blindness, a
 * screenshot, and the Markdown export.
 */
import {
  RELEASE_CATEGORY_LABEL,
  RELEASE_CATEGORY_ORDER,
  type ReleaseCategory,
  type ReleaseSection,
} from '@shared/release';
import { Markdown } from '@/renderer/features/workspace/Markdown';
import { ReleaseSectionCard } from './ReleaseSectionCard';

/** Sort sections by consequence, keeping any unknown category at the end. */
export function orderSections(sections: ReleaseSection[]): ReleaseSection[] {
  const rank = (c: ReleaseCategory) => {
    const i = RELEASE_CATEGORY_ORDER.indexOf(c);
    return i === -1 ? RELEASE_CATEGORY_ORDER.length : i;
  };
  return [...sections].sort((a, b) => rank(a.category) - rank(b.category));
}

/** Case-insensitive substring match over an item's lead and body. */
function matches(query: string, lead: string | null, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (lead ?? '').toLowerCase().includes(q) || text.toLowerCase().includes(q);
}

export function ReleaseHighlights({
  sections,
  filter,
  collapsed,
  onToggle,
}: {
  sections: ReleaseSection[];
  filter: string;
  collapsed: Partial<Record<ReleaseCategory, boolean>>;
  onToggle: (category: ReleaseCategory) => void;
}) {
  const ordered = orderSections(sections);

  return (
    <>
      {ordered.map((section) => {
        const items = section.items.filter((i) => matches(filter, i.lead, i.text));
        // A filter that hides every item in a section hides the section — an
        // empty card would read as "nothing here in this release", which is a
        // different statement from "nothing here matched".
        if (filter && items.length === 0) return null;

        return (
          <ReleaseSectionCard
            key={`${section.category}:${section.title}`}
            title={RELEASE_CATEGORY_LABEL[section.category] ?? section.title}
            count={items.length}
            collapsed={!!collapsed[section.category]}
            forceOpen={!!filter}
            onToggle={() => onToggle(section.category)}
            copyText={section.markdown}
          >
            <ul className="flex flex-col gap-3">
              {items.map((item, i) => (
                <li key={i} className="flex flex-col gap-0.5">
                  {item.lead && (
                    <span className="text-[12.5px] font-medium text-fg">{item.lead}</span>
                  )}
                  <div className="text-muted">
                    <Markdown text={item.text} />
                  </div>
                </li>
              ))}
            </ul>
          </ReleaseSectionCard>
        );
      })}
    </>
  );
}
