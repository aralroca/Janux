import type { Case } from '../support/case';
import { fallbackOverrides, type ResolvedFont, type ResolvedFontFace } from '../../janux/src/font/css';

/**
 * Which font files earn a `<link rel=preload>`.
 *
 * A preload is a promise that the file is needed for the first paint, and the
 * browser believes it: promising every subset pushes the one the page actually
 * renders down the queue behind Cyrillic nobody will see. So only the faces the
 * resolver marked critical appear here.
 *
 * The dedupe rows are the variable-font case. One family is one file for every
 * weight it offers, so a family declaring 400 and 700 produces two `@font-face`
 * rules pointing at one URL — and preloading that URL twice is a duplicate
 * request the browser has to reconcile, not a faster page.
 */
export interface FontPreloadCase {
  fonts: ResolvedFont[];
  /** The hrefs, in the order they were declared. */
  expected: string[];
}

export type FontPreloadRow = Case<FontPreloadCase>;

const SQUARE = { unitsPerEm: 1000, ascent: 800, descent: -200, lineGap: 0, xWidthAvg: 500 };

const face = (over: Partial<ResolvedFontFace> = {}): ResolvedFontFace => ({
  weight: 400,
  style: 'normal',
  url: '/latin.woff2',
  unicodeRange: 'U+0000-00FF',
  preload: false,
  ...over,
});

const font = (over: Partial<ResolvedFont> = {}): ResolvedFont => ({
  family: 'Fam',
  display: 'swap',
  fallback: 'sans-serif',
  overrides: fallbackOverrides(SQUARE, SQUARE),
  faces: [face()],
  ...over,
});

export const FONT_PRELOAD_CASES: FontPreloadRow[] = [
  {
    id: 'asset-preload-only-the-marked-face',
    src: 'astro:fonts#Includes-links-when-preloading',
    fonts: [font({ faces: [face({ preload: true }), face({ url: '/cyrillic.woff2' })] })],
    expected: ['/latin.woff2'],
  },
  {
    id: 'asset-preload-nothing-marked-is-no-links',
    src: 'astro:fonts#Can-filter-preloads',
    fonts: [font({ faces: [face(), face({ url: '/cyrillic.woff2' })] })],
    expected: [],
  },
  {
    id: 'asset-preload-no-fonts-at-all',
    src: 'janux',
    fonts: [],
    expected: [],
  },
  {
    id: 'asset-preload-a-font-with-no-faces',
    src: 'janux',
    fonts: [font({ faces: [] })],
    expected: [],
  },
  {
    /** The variable-font shape: two weights, one file, one preload. */
    id: 'asset-preload-dedupes-one-file-shared-by-two-weights',
    src: 'janux',
    fonts: [font({ faces: [face({ weight: 400, preload: true }), face({ weight: 700, preload: true })] })],
    expected: ['/latin.woff2'],
  },
  {
    /** Two families that resolved to the same file still ask for it once. */
    id: 'asset-preload-dedupes-across-families',
    src: 'janux',
    fonts: [font({ faces: [face({ preload: true })] }), font({ family: 'Other', faces: [face({ preload: true })] })],
    expected: ['/latin.woff2'],
  },
  {
    /** Declaration order, not sorted: the first file declared is the first one promised. */
    id: 'asset-preload-keeps-declaration-order',
    src: 'janux',
    fonts: [font({ faces: [face({ url: '/z.woff2', preload: true }), face({ url: '/a.woff2', preload: true })] })],
    expected: ['/z.woff2', '/a.woff2'],
  },
  {
    /** A dedupe keeps the *first* position, so a repeat later never reorders the list. */
    id: 'asset-preload-dedupe-keeps-the-first-position',
    src: 'janux',
    fonts: [
      font({ faces: [face({ url: '/a.woff2', preload: true }), face({ url: '/b.woff2', preload: true }), face({ url: '/a.woff2', style: 'italic', preload: true })] }),
    ],
    expected: ['/a.woff2', '/b.woff2'],
  },
  {
    id: 'asset-preload-collects-across-two-families',
    src: 'janux',
    fonts: [
      font({ faces: [face({ url: '/sans.woff2', preload: true })] }),
      font({ family: 'Mono', faces: [face({ url: '/mono.woff2', preload: true })] }),
    ],
    expected: ['/sans.woff2', '/mono.woff2'],
  },
  {
    /** A family whose critical subset is the second one declared still promises only that one. */
    id: 'asset-preload-skips-an-unmarked-first-subset',
    src: 'janux',
    fonts: [font({ faces: [face({ url: '/cyrillic.woff2' }), face({ url: '/latin.woff2', preload: true })] })],
    expected: ['/latin.woff2'],
  },
];
