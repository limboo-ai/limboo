/**
 * The nav state every Settings shell needs: which category is showing, the
 * search query, and the transient deep-search highlight.
 *
 * Extracted so the modal and the workspace document share ONE implementation of
 * category routing and jump-to-field, rather than each keeping its own copy that
 * can drift. Everything else about the two shells differs (chrome, close
 * semantics, whether there is a footer); this does not.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { SETTINGS_CATALOG, type SettingsCategory } from './catalog';

/** How long a jumped-to field stays highlighted. */
const HIGHLIGHT_MS = 1600;

export interface SettingsNavState {
  activeId: string;
  category: SettingsCategory;
  query: string;
  setQuery: (q: string) => void;
  highlight: string | null;
  selectCategory: (id: string) => void;
  selectField: (categoryId: string, fieldId: string) => void;
}

export function useSettingsNavState(initialCategory = 'general'): SettingsNavState {
  const [activeId, setActiveId] = useState(
    SETTINGS_CATALOG.some((c) => c.id === initialCategory) ? initialCategory : 'general',
  );
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const selectCategory = useCallback((id: string) => {
    setActiveId(id);
    setHighlight(null);
  }, []);

  const selectField = useCallback((categoryId: string, fieldId: string) => {
    setActiveId(categoryId);
    setHighlight(fieldId);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
  }, []);

  return {
    activeId,
    // Never undefined: an unknown id falls back to the first category rather
    // than rendering an empty pane.
    category: SETTINGS_CATALOG.find((c) => c.id === activeId) ?? SETTINGS_CATALOG[0],
    query,
    setQuery,
    highlight,
    selectCategory,
    selectField,
  };
}
