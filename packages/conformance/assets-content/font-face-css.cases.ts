import type { Case } from '../support/case';
import { fallbackOverrides, type ResolvedFont, type ResolvedFontFace } from '../../janux/src/font/css';

/**
 * The stylesheet a page inlines, byte for byte.
 *
 * Three things share one string here, and the order between them is the
 * contract: the real `@font-face` per subset, the adjusted alias of the system
 * font that paints until those arrive, and the custom property naming the whole
 * stack. A family with several subsets emits several real faces and exactly one
 * fallback face — one alias, however many files.
 *
 * The quoting rows are the reason this is an exact-string table. A family name
 * is interpolated into a CSS string four times, and CSS has no error recovery
 * worth the name: one unescaped apostrophe does not break one declaration, it
 * ends the string early and takes the rest of the stylesheet with it. That is
 * the same failure shape as an unencoded space in a `srcset`.
 */
export interface FontCssCase {
  fonts: ResolvedFont[];
  expected: string;
}

export type FontCssRow = Case<FontCssCase>;

const SQUARE = { unitsPerEm: 1000, ascent: 800, descent: -200, lineGap: 0, xWidthAvg: 500 };
const OVERRIDES = fallbackOverrides(SQUARE, SQUARE);
/** `size-adjust:100%;ascent-override:80%;descent-override:20%;line-gap-override:0%` */
const ADJUST = `size-adjust:${OVERRIDES.sizeAdjust};ascent-override:${OVERRIDES.ascentOverride};` +
  `descent-override:${OVERRIDES.descentOverride};line-gap-override:${OVERRIDES.lineGapOverride}`;

const face = (over: Partial<ResolvedFontFace> = {}): ResolvedFontFace => ({
  weight: 400,
  style: 'normal',
  url: '/_janux/font/f.woff2',
  unicodeRange: 'U+0000-00FF',
  preload: false,
  ...over,
});

const font = (over: Partial<ResolvedFont> = {}): ResolvedFont => ({
  family: 'Fam',
  display: 'swap',
  fallback: 'sans-serif',
  overrides: OVERRIDES,
  faces: [face()],
  ...over,
});

const real = (over: Partial<ResolvedFontFace> = {}, family = 'Fam', display = 'swap') => {
  const { weight, style, url, unicodeRange } = face(over);

  return `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};font-display:${display};` +
    `src:url(${url}) format('woff2');unicode-range:${unicodeRange}}`;
};

const alias = (family = 'Fam', local = 'Arial') => `@font-face{font-family:'${family} Fallback';src:local('${local}');${ADJUST}}`;

export const FONT_CSS_CASES: FontCssRow[] = [
  {
    id: 'asset-fontcss-one-face-plus-its-alias',
    src: 'astro:fonts#Includes-styles',
    fonts: [font()],
    expected: `${real()}\n${alias()}`,
  },
  {
    /** Every subset is its own file, and the `unicode-range` is what stops a page fetching Cyrillic it never shows. */
    id: 'asset-fontcss-one-alias-however-many-subsets',
    src: 'janux',
    fonts: [font({ faces: [face({ url: '/latin.woff2' }), face({ url: '/cyrillic.woff2', unicodeRange: 'U+0301, U+0400-045F' })] })],
    expected: `${real({ url: '/latin.woff2' })}\n${real({ url: '/cyrillic.woff2', unicodeRange: 'U+0301, U+0400-045F' })}\n${alias()}`,
  },
  {
    /** One variable file answering every weight: the same URL twice is still one fetch, and both faces are declared. */
    id: 'asset-fontcss-variable-file-declared-per-weight',
    src: 'janux',
    fonts: [font({ faces: [face({ weight: 400 }), face({ weight: 700 })] })],
    expected: `${real({ weight: 400 })}\n${real({ weight: 700 })}\n${alias()}`,
  },
  {
    id: 'asset-fontcss-weight-range-passes-through',
    src: 'janux',
    fonts: [font({ faces: [face({ weight: '100 900' as unknown as number })] })],
    expected: `${real({ weight: '100 900' as unknown as number })}\n${alias()}`,
  },
  {
    id: 'asset-fontcss-italic-style-passes-through',
    src: 'janux',
    fonts: [font({ faces: [face({ style: 'italic' })] })],
    expected: `${real({ style: 'italic' })}\n${alias()}`,
  },
  {
    id: 'asset-fontcss-oblique-with-an-angle',
    src: 'janux',
    fonts: [font({ faces: [face({ style: 'oblique 14deg' })] })],
    expected: `${real({ style: 'oblique 14deg' })}\n${alias()}`,
  },
  {
    id: 'asset-fontcss-display-optional-passes-through',
    src: 'janux',
    fonts: [font({ display: 'optional' })],
    expected: `${real({}, 'Fam', 'optional')}\n${alias()}`,
  },
  {
    id: 'asset-fontcss-serif-alias-is-times',
    src: 'janux',
    fonts: [font({ fallback: 'serif' })],
    expected: `${real()}\n${alias('Fam', 'Times New Roman')}`,
  },
  {
    id: 'asset-fontcss-monospace-alias-is-courier',
    src: 'janux',
    fonts: [font({ fallback: 'monospace' })],
    expected: `${real()}\n${alias('Fam', 'Courier New')}`,
  },
  {
    /** The stack, named once, so an app never repeats "font, its fallback, the generic". */
    id: 'asset-fontcss-custom-property-carries-the-whole-stack',
    src: 'janux',
    fonts: [font({ variable: '--font-sans' })],
    expected: `${real()}\n${alias()}\n:root{--font-sans:'Fam','Fam Fallback',sans-serif}`,
  },
  {
    id: 'asset-fontcss-custom-property-names-its-own-generic',
    src: 'janux',
    fonts: [font({ fallback: 'monospace', variable: '--font-mono' })],
    expected: `${real()}\n${alias('Fam', 'Courier New')}\n:root{--font-mono:'Fam','Fam Fallback',monospace}`,
  },
  {
    /** Each font's own block stays contiguous: faces, alias, property, then the next font. */
    id: 'asset-fontcss-two-fonts-keep-their-blocks-contiguous',
    src: 'janux',
    fonts: [
      font({ variable: '--font-sans' }),
      font({ family: 'Mono', fallback: 'monospace', variable: '--font-mono', faces: [face({ url: '/m.woff2' })] }),
    ],
    expected:
      `${real()}\n${alias()}\n:root{--font-sans:'Fam','Fam Fallback',sans-serif}\n` +
      `${real({ url: '/m.woff2' }, 'Mono')}\n${alias('Mono', 'Courier New')}\n:root{--font-mono:'Mono','Mono Fallback',monospace}`,
  },
  {
    /** A font whose files have not resolved still gets its alias: the fallback is what paints. */
    id: 'asset-fontcss-no-faces-still-declares-the-alias',
    src: 'janux',
    fonts: [font({ faces: [] })],
    expected: alias(),
  },
  {
    id: 'asset-fontcss-no-fonts-is-an-empty-stylesheet',
    src: 'janux',
    fonts: [],
    expected: '',
  },
  {
    /**
     * An apostrophe in a family name is not exotic — it is how half the type
     * foundries name a face. Unescaped, it closes the string it sits in and the
     * declaration after it becomes garbage, so the whole stylesheet is lost.
     */
    id: 'asset-fontcss-apostrophe-in-a-family-is-escaped',
    src: 'janux',
    fonts: [font({ family: "Bob's Font", variable: '--f' })],
    expected:
      `${real({}, "Bob\\'s Font")}\n@font-face{font-family:'Bob\\'s Font Fallback';src:local('Arial');${ADJUST}}\n` +
      ":root{--f:'Bob\\'s Font','Bob\\'s Font Fallback',sans-serif}",
  },
  {
    /** A backslash escapes whatever follows it, so it has to escape itself first. */
    id: 'asset-fontcss-backslash-in-a-family-is-escaped',
    src: 'janux',
    fonts: [font({ family: 'Back\\slash' })],
    expected: `${real({}, 'Back\\\\slash')}\n@font-face{font-family:'Back\\\\slash Fallback';src:local('Arial');${ADJUST}}`,
  },
  {
    id: 'asset-fontcss-spaces-and-digits-in-a-family-are-fine',
    src: 'janux',
    fonts: [font({ family: 'IBM Plex Sans 2' })],
    expected: `${real({}, 'IBM Plex Sans 2')}\n${alias('IBM Plex Sans 2')}`,
  },
  {
    id: 'asset-fontcss-non-ascii-family-passes-through',
    src: 'janux',
    fonts: [font({ family: 'Noto Sans 日本語' })],
    expected: `${real({}, 'Noto Sans 日本語')}\n${alias('Noto Sans 日本語')}`,
  },
  {
    id: 'asset-fontcss-absolute-url-passes-through',
    src: 'janux',
    fonts: [font({ faces: [face({ url: 'https://cdn.test/f.woff2' })] })],
    expected: `${real({ url: 'https://cdn.test/f.woff2' })}\n${alias()}`,
  },
  {
    id: 'asset-fontcss-multi-range-subset-passes-through-verbatim',
    src: 'janux',
    fonts: [font({ faces: [face({ unicodeRange: 'U+0460-052F, U+1C80-1C88, U+20B4' })] })],
    expected: `${real({ unicodeRange: 'U+0460-052F, U+1C80-1C88, U+20B4' })}\n${alias()}`,
  },
];
