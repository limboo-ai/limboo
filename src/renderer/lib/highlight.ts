/**
 * Thin wrapper over a cached Shiki highlighter. We build the highlighter on
 * Shiki's **JavaScript RegExp engine** (`shiki/engine/javascript`) rather than
 * the default WASM Oniguruma engine: the production CSP is `script-src 'self'
 * blob:` (no `unsafe-eval`, no `wasm-unsafe-eval`), so WASM instantiation is
 * blocked and the WASM engine silently fails — leaving code blocks unhighlighted
 * in packaged builds. The JS engine needs neither WASM nor `unsafe-eval`, so it
 * works under the strict CSP. Languages are loaded lazily on first use and cached.
 *
 * Returns themed HTML (one `<span class="line">` per line, which the CSS turns
 * into gutter line numbers) or `null` when highlighting fails entirely — callers
 * fall back to plain text.
 */
import { createHighlighter, type Highlighter } from 'shiki';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/** Tuned to read well on the pure-black surface. */
const THEME = 'github-dark-default';

let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>();

/** Lazily create the singleton highlighter (JS engine, no WASM). */
function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [THEME],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

/** Ensure `lang` is loaded; return the usable language id (falls back to text). */
async function ensureLang(hl: Highlighter, lang: string): Promise<string> {
  if (!lang || lang === 'text') return 'text';
  if (loadedLangs.has(lang)) return lang;
  try {
    await hl.loadLanguage(lang as Parameters<Highlighter['loadLanguage']>[0]);
    loadedLangs.add(lang);
    return lang;
  } catch {
    // Unknown/unsupported grammar — render as uncolored plaintext.
    return 'text';
  }
}

export async function highlightCode(code: string, lang?: string): Promise<string | null> {
  const requested = (lang || '').toLowerCase().trim();
  try {
    const hl = await getHighlighter();
    const language = await ensureLang(hl, requested);
    return hl.codeToHtml(code, { lang: language, theme: THEME });
  } catch {
    // Total failure (engine/theme) — let the caller show plain text.
    return null;
  }
}

/**
 * One themed token. A deliberately plain, serializable shape rather than Shiki's
 * `ThemedToken` — the diff renderer memoizes and structurally compares these, and
 * keeping Shiki's types out of the component tree means the highlighter can be
 * swapped without touching a single component.
 */
export interface HlToken {
  content: string;
  color?: string;
  italic?: boolean;
  bold?: boolean;
  underline?: boolean;
}

/** Shiki's `FontStyle` bitflags (it exports them as a const enum we can't import). */
const FONT_ITALIC = 1;
const FONT_BOLD = 2;
const FONT_UNDERLINE = 4;

/**
 * Tokenize `code` into one `HlToken[]` per line, for renderers that own their own
 * per-line markup (the diff editor puts each line in its own grid row, so it
 * cannot use `codeToHtml`'s single `<pre>`).
 *
 * Runs on the same singleton highlighter as {@link highlightCode}, so it inherits
 * the JS-RegExp-engine choice that keeps highlighting working under the packaged
 * CSP. Returns `null` on any failure — callers render plain text.
 */
export async function highlightLines(code: string, lang?: string): Promise<HlToken[][] | null> {
  const requested = (lang || '').toLowerCase().trim();
  if (!requested || requested === 'text') return null;
  try {
    const hl = await getHighlighter();
    const language = await ensureLang(hl, requested);
    if (language === 'text') return null;
    const lines = hl.codeToTokensBase(code, {
      // `language` is a runtime-validated id from `ensureLang` (it either loaded
      // or fell back to 'text'), which the bundled-language union can't express.
      lang: language as Parameters<Highlighter['codeToTokensBase']>[1]['lang'],
      theme: THEME,
      includeExplanation: false,
    });
    return lines.map((line) =>
      line.map((token) => {
        const style = token.fontStyle ?? 0;
        const out: HlToken = { content: token.content };
        if (token.color) out.color = token.color;
        if (style & FONT_ITALIC) out.italic = true;
        if (style & FONT_BOLD) out.bold = true;
        if (style & FONT_UNDERLINE) out.underline = true;
        return out;
      }),
    );
  } catch {
    return null;
  }
}
