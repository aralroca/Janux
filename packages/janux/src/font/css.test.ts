import { describe, expect, it } from 'bun:test';
import { fallbackOverrides, fontFaceCss, fontPreloadHrefs, type ResolvedFont } from './css';

/** Inter and Arial, both measured from the real files (capsize). */
const INTER = { unitsPerEm: 2048, ascent: 1984, descent: -494, lineGap: 0, xWidthAvg: 978 };
const ARIAL = { unitsPerEm: 2048, ascent: 1854, descent: -434, lineGap: 67, xWidthAvg: 913 };

const inter = (overrides: Partial<ResolvedFont> = {}): ResolvedFont => ({
  family: 'Inter',
  display: 'swap',
  fallback: 'sans-serif',
  variable: '--font-sans',
  overrides: fallbackOverrides(INTER, ARIAL),
  faces: [
    {
      weight: 400,
      style: 'normal',
      url: '/_janux/font/inter-400-latin.woff2',
      unicodeRange: 'U+0000-00FF, U+0131',
      preload: true,
    },
    {
      weight: 400,
      style: 'normal',
      url: '/_janux/font/inter-400-cyrillic.woff2',
      unicodeRange: 'U+0301, U+0400-045F',
      preload: false,
    },
  ],
  ...overrides,
});

/**
 * The whole point of the fallback face: while the webfont is still in flight the
 * browser paints Arial *stretched to Inter's proportions*, so the swap moves
 * nothing. The arithmetic is capsize's, and getting it wrong is invisible until
 * a Lighthouse run reports a layout shift.
 */
describe('fallback overrides', () => {
  const overrides = fallbackOverrides(INTER, ARIAL);

  it('stretches the fallback by the ratio of the two average glyph widths', () => {
    // (978/2048) / (913/2048) = 1.0712…
    expect(overrides.sizeAdjust).toBe('107.12%');
  });

  it('states ascent and descent as a fraction of the ALREADY adjusted em', () => {
    // 1984 / (2048 × 1.0712) and 494 / (2048 × 1.0712)
    expect(overrides.ascentOverride).toBe('90.44%');
    expect(overrides.descentOverride).toBe('22.52%');
  });

  it('carries the line gap across too, zero included', () => {
    expect(overrides.lineGapOverride).toBe('0%');
  });

  it('leaves a font measured against itself completely unadjusted', () => {
    const same = fallbackOverrides(ARIAL, ARIAL);

    expect(same.sizeAdjust).toBe('100%');
    expect(same.ascentOverride).toBe('90.53%');
  });
});

describe('the @font-face css a page inlines', () => {
  const css = fontFaceCss([inter()]);

  it('declares the real font per subset, with the unicode range that selects it', () => {
    expect(css).toContain("@font-face{font-family:'Inter';font-style:normal;font-weight:400;font-display:swap;");
    expect(css).toContain('src:url(/_janux/font/inter-400-latin.woff2) format(\'woff2\');');
    expect(css).toContain('unicode-range:U+0000-00FF, U+0131}');
  });

  it('declares one adjusted fallback face aliasing the local system font', () => {
    expect(css).toContain("@font-face{font-family:'Inter Fallback';src:local('Arial');");
    expect(css).toContain('size-adjust:107.12%;ascent-override:90.44%;descent-override:22.52%;line-gap-override:0%}');
  });

  it('exposes the stack as a custom property, so the app never repeats it', () => {
    expect(css).toContain(":root{--font-sans:'Inter','Inter Fallback',sans-serif}");
  });

  it('maps each generic fallback onto the system font its metrics were measured against', () => {
    expect(fontFaceCss([inter({ fallback: 'serif' })])).toContain("src:local('Times New Roman')");
    expect(fontFaceCss([inter({ fallback: 'monospace' })])).toContain("src:local('Courier New')");
  });

  it('leaves out the custom property when the font does not ask for one', () => {
    expect(fontFaceCss([inter({ variable: undefined })])).not.toContain(':root{');
  });

  it('is empty for an app that declares no fonts', () => {
    expect(fontFaceCss([])).toBe('');
  });
});

/**
 * A preload is a promise that the file is needed for the first paint. Promising
 * it for every subset would push the critical one down the queue behind scripts
 * nobody on this page can read.
 */
describe('preload hrefs', () => {
  it('names only the faces the resolver marked critical', () => {
    expect(fontPreloadHrefs([inter()])).toEqual(['/_janux/font/inter-400-latin.woff2']);
  });

  it('is empty when nothing was marked', () => {
    const none = inter({ faces: inter().faces.map((face) => ({ ...face, preload: false })) });

    expect(fontPreloadHrefs([none])).toEqual([]);
  });
});
