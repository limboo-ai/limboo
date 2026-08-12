/**
 * Settings as a workspace document — an editor tab in the center column, the
 * way VS Code's settings editor is a tab rather than a dialog.
 *
 * Shares the catalog, the nav rail, the panels and the highlight context with
 * {@link SettingsModal}; only the chrome differs. Shell shape follows the other
 * documents (`DiffWorkspace`, `ReleaseNotesDocument`, `SubagentWorkspace`): a
 * `h-9` identity row over the body, so every document in the column reads the
 * same. It is the FIRST two-pane document, so it establishes one rule: the
 * identity row spans the full width and the split begins beneath it. The
 * alternative — a header per pane — would make one document read as two.
 *
 * NO BASELINE, NO DISCARD, NO FOOTER, and that asymmetry with the modal is
 * deliberate. The modal offers a revert because its X / backdrop / Escape are
 * AMBIGUOUS gestures: the user may not have meant to commit. A tab has no
 * ambiguous close — settings write through immediately, and closing a tab is no
 * more a cancel than closing a diff is. Worse, this component remounts on every
 * tab switch (`key={activeDoc.id}` in CenterWorkspace), so a mount-scoped
 * baseline would silently mean "revert to whatever it was when you last looked
 * at this tab". Do not "fix" this by hoisting a baseline into a store.
 * Restoring defaults lives where it already does: General › Restore defaults.
 */
import { Settings2 } from 'lucide-react';
import { SettingsHighlightContext } from './controls';
import { SettingsNav } from './SettingsNav';
import { useSettingsNavState } from './useSettingsNavState';

export function SettingsDocument({ initialCategory }: { initialCategory?: string }) {
  const nav = useSettingsNavState(initialCategory);
  const Panel = nav.category.Panel;

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      {/* Identity row — full width, above the split. */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <Settings2 size={13} className="shrink-0 text-muted" />
        <span className="text-[12px] font-semibold text-fg">Settings</span>
        <span className="truncate text-[11px] text-faint">· {nav.category.label}</span>
      </div>

      <div className="flex min-h-0 flex-1">
        <SettingsNav
          query={nav.query}
          setQuery={nav.setQuery}
          activeId={nav.activeId}
          onSelectCategory={nav.selectCategory}
          onSelectField={nav.selectField}
        />
        {/* Measured like the other documents so long panels do not run edge to
            edge on a wide window. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mx-auto flex max-w-3xl flex-col">
            <SettingsHighlightContext.Provider value={nav.highlight}>
              <Panel />
            </SettingsHighlightContext.Provider>
          </div>
        </div>
      </div>
    </section>
  );
}
