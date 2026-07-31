import { describe, expect, it } from 'bun:test';
import { fallbackOverrides, fontFaceCss, fontPreloadHrefs, type ResolvedFont } from 'janux';
import { docExample } from '../doc-example';

const PAGE = 'apps/docs/content/guide/fonts.md';
/** Inter and Arial, as capsize reads them out of the real files. */
const INTER = { unitsPerEm: 2048, ascent: 1984, descent: -494, lineGap: 0, xWidthAvg: 978 };
const ARIAL = { unitsPerEm: 2048, ascent: 1854, descent: -434, lineGap: 67, xWidthAvg: 913 };

/**
 * guide/fonts.md prints four exact percentages and a `:root` rule. Those are
 * the page's whole claim — that the adjusted fallback occupies the webfont's
 * space — so they are computed here rather than trusted.
 */
describe('guide/fonts.md', () => {
  it('the documented config is a real one the framework accepts', async () => {
    const config = (await docExample(PAGE, 0)).default;

    expect(config.fonts).toEqual([
      { family: 'Inter', weights: [400, 600, 700], subsets: ['latin'], variable: '--font-sans' },
    ]);
  });

  it('produces exactly the overrides the page prints for Inter over Arial', () => {
    expect(fallbackOverrides(INTER, ARIAL)).toEqual({
      sizeAdjust: '107.12%',
      ascentOverride: '90.44%',
      descentOverride: '22.52%',
      lineGapOverride: '0%',
    });
  });

  it('renders the fallback face and the custom property the page shows', () => {
    const css = fontFaceCss([fontFor(WEIGHTS)]);

    expect(css).toContain("@font-face{font-family:'Inter Fallback';src:local('Arial');");
    expect(css).toContain("size-adjust:107.12%;ascent-override:90.44%;descent-override:22.52%;line-gap-override:0%}");
    expect(css).toContain(":root{--font-sans:'Inter','Inter Fallback',sans-serif}");
  });

  it('preloads one file, as the options table claims', () => {
    expect(fontPreloadHrefs([fontFor(WEIGHTS)])).toEqual(['/_janux/font/inter-latin-abc.woff2']);
  });
});

/** The three declared weights, as Google serves them: one variable file behind all of them. */
const WEIGHTS = [400, 600, 700];

function fontFor(weights: number[]): ResolvedFont {
  return {
    family: 'Inter',
    display: 'swap',
    fallback: 'sans-serif',
    variable: '--font-sans',
    overrides: fallbackOverrides(INTER, ARIAL),
    faces: weights.map((weight, index) => ({
      weight,
      style: 'normal',
      url: '/_janux/font/inter-latin-abc.woff2',
      unicodeRange: 'U+0000-00FF',
      preload: index === 0,
    })),
  };
}
