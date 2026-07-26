/**
 * Two token colours in GitHub's themes don't clear 4.5:1 as body-sized code
 * text, measured against every surface they land on: the light orange (3.49 on
 * white — it lands on `state`, `input`, `intents`) and the dark comment grey
 * (3.05 on the page background). Darkened/lightened in place, same hue, so the
 * themes still read as GitHub's.
 *
 * They live here because the site highlights code twice — server-side for the
 * docs' snippets (`server/markdown.ts`) and inside Monaco for the playground —
 * and the playground shipped the unfixed pair for months: eighteen contrast
 * failures in an audit, in an editor the docs claim is accessible.
 * palette.test.ts asserts the replacements.
 */
export const CONTRAST_FIXES = {
  'github-light': { '#e36209': '#bd4b00' },
  'github-dark': { '#6a737d': '#8b949e' },
} as const;

type ThemeName = keyof typeof CONTRAST_FIXES;

interface TextMateTheme {
  name?: string;
  tokenColors?: { settings?: { foreground?: string } }[];
  colors?: Record<string, string>;
}

/** The same replacements, applied to a TextMate theme Monaco will consume. */
export function withContrastFixes<T extends TextMateTheme>(theme: T, name: ThemeName): T {
  const fixes: Record<string, string> = CONTRAST_FIXES[name];
  const tokenColors = theme.tokenColors?.map((token) => {
    const foreground = token.settings?.foreground;

    return foreground && fixes[foreground.toLowerCase()]
      ? { ...token, settings: { ...token.settings, foreground: fixes[foreground.toLowerCase()] } }
      : token;
  });

  /*
   * The current line's tint has to go for the same reason the docs' snippets
   * have none in light mode: GitHub's red sits at 4.57:1 on white, so any
   * background behind it drops the line under AA. A border marks the line
   * instead — the affordance without the arithmetic.
   */
  return {
    ...theme,
    tokenColors,
    colors: { ...theme.colors, 'editor.lineHighlightBackground': '#00000000', 'editor.lineHighlightBorder': '#0000001a' },
  };
}
