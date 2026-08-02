import {
  googleCssUrl,
  nothingSelected,
  parseGoogleCss,
  primaryFace,
  selectFaces,
} from '../../janux-vite/src/google-fonts';
import type { Case } from '../support/case';

/**
 * What the font primitive asks Google for, and which of the answer it keeps.
 *
 * Everything here is pure — no network, no disk — which is deliberate: the
 * whole self-hosting pipeline downstream of it is cached, so a wrong request or
 * a wrong filter is baked in on the first build and never retried. The two
 * failures worth pinning down are asking for the wrong thing (a family with a
 * space, an axis with no italics) and keeping the wrong thing (a subset the app
 * never asked for, a preload for every file instead of the one that matters).
 */

export interface FontRequestCase {
  config: { family: string; weights?: number[]; styles?: string[]; display?: string };
  /** The `family=` value the URL must carry, before `&display=`. */
  family: string;
  display?: string;
}

export type FontRequestRow = Case<FontRequestCase>;

export const FONT_REQUEST_CASES: FontRequestRow[] = [
  { id: 'build2-font-asks-for-regular-when-nothing-was-declared', src: 'janux', config: { family: 'Inter' }, family: 'Inter:wght@400' },
  { id: 'build2-font-sorts-the-weights-the-way-the-api-expects', src: 'janux', config: { family: 'Inter', weights: [700, 400] }, family: 'Inter:wght@400;700' },
  { id: 'build2-font-drops-the-italic-axis-when-only-upright-was-asked-for', src: 'janux', config: { family: 'Inter', weights: [400], styles: ['normal'] }, family: 'Inter:wght@400' },
  { id: 'build2-font-asks-only-for-italics-when-that-is-all-that-was-declared', src: 'janux', config: { family: 'Inter', weights: [400], styles: ['italic'] }, family: 'Inter:ital,wght@1,400' },
  { id: 'build2-font-crosses-every-style-with-every-weight', src: 'janux', config: { family: 'Inter', weights: [400, 700], styles: ['normal', 'italic'] }, family: 'Inter:ital,wght@0,400;0,700;1,400;1,700' },
  { id: 'build2-font-spells-a-multi-word-family-with-plus-signs', src: 'janux', config: { family: 'Noto Sans JP' }, family: 'Noto+Sans+JP:wght@400' },
  { id: 'build2-font-defaults-the-display-strategy-to-swap', src: 'janux', config: { family: 'Inter' }, family: 'Inter:wght@400', display: 'swap' },
  { id: 'build2-font-carries-a-declared-display-strategy-into-the-request', src: 'janux', config: { family: 'Inter', display: 'block' }, family: 'Inter:wght@400', display: 'block' },
];

/** One `@font-face` block as Google writes it, for a subset/weight/style. */
export interface FaceFixture {
  subset: string;
  weight: number;
  style: string;
  file: string;
}

export interface FaceSelectionCase {
  published: FaceFixture[];
  config: { family: string; subsets?: string[]; weights?: number[]; styles?: string[]; preload?: boolean };
  /** The kept faces as `<subset>/<weight>/<style>`, in order. */
  kept: string[];
  /** Which of the kept faces carries `preload`, as an index. `undefined` means none does. */
  preloaded?: number;
}

export type FaceSelectionRow = Case<FaceSelectionCase>;

const LATIN_400: FaceFixture = { subset: 'latin', weight: 400, style: 'normal', file: 'a' };
const LATIN_700: FaceFixture = { subset: 'latin', weight: 700, style: 'normal', file: 'b' };
const LATIN_400_ITALIC: FaceFixture = { subset: 'latin', weight: 400, style: 'italic', file: 'c' };
const GREEK_400: FaceFixture = { subset: 'greek', weight: 400, style: 'normal', file: 'd' };

export const FACE_SELECTION_CASES: FaceSelectionRow[] = [
  {
    id: 'build2-font-keeps-only-the-declared-subset',
    src: 'janux',
    published: [LATIN_400, GREEK_400],
    config: { family: 'Inter' },
    kept: ['latin/400/normal'],
    preloaded: 0,
  },
  {
    id: 'build2-font-keeps-only-the-declared-weight',
    src: 'janux',
    published: [LATIN_400, LATIN_700],
    config: { family: 'Inter', weights: [700] },
    kept: ['latin/700/normal'],
    preloaded: 0,
  },
  {
    id: 'build2-font-keeps-only-the-declared-style',
    src: 'janux',
    published: [LATIN_400, LATIN_400_ITALIC],
    config: { family: 'Inter', styles: ['italic'] },
    kept: ['latin/400/italic'],
    preloaded: 0,
  },
  {
    id: 'build2-font-preloads-the-lightest-upright-face-of-the-primary-subset',
    src: 'janux',
    published: [LATIN_700, LATIN_400, GREEK_400],
    config: { family: 'Inter', weights: [400, 700], subsets: ['latin', 'greek'] },
    kept: ['latin/700/normal', 'latin/400/normal', 'greek/400/normal'],
    preloaded: 1,
  },
  {
    id: 'build2-font-preloads-nothing-when-the-app-opted-out',
    src: 'janux',
    published: [LATIN_400],
    config: { family: 'Inter', preload: false },
    kept: ['latin/400/normal'],
  },
  {
    id: 'build2-font-keeps-every-declared-subset-in-the-order-google-published-them',
    src: 'janux',
    published: [GREEK_400, LATIN_400],
    config: { family: 'Inter', subsets: ['latin', 'greek'] },
    kept: ['greek/400/normal', 'latin/400/normal'],
    preloaded: 1,
  },
  {
    id: 'build2-font-selects-nothing-when-the-family-published-nothing-that-matches',
    src: 'janux',
    published: [LATIN_400],
    config: { family: 'Inter', weights: [500] },
    kept: [],
  },
];

export interface PrimaryFaceCase {
  published: FaceFixture[];
  config: { family: string; subsets?: string[] };
  /** The `file` of the face metrics are measured from. */
  file: string;
}

export type PrimaryFaceRow = Case<PrimaryFaceCase>;

export const PRIMARY_FACE_CASES: PrimaryFaceRow[] = [
  {
    id: 'build2-font-measures-the-lightest-upright-face-it-has',
    src: 'janux',
    published: [LATIN_700, LATIN_400],
    config: { family: 'Inter' },
    file: 'a',
  },
  {
    id: 'build2-font-never-measures-an-italic-when-an-upright-exists',
    src: 'janux',
    published: [LATIN_400_ITALIC, LATIN_700],
    config: { family: 'Inter' },
    file: 'b',
  },
  {
    id: 'build2-font-falls-back-to-the-first-face-when-the-primary-subset-published-none',
    src: 'janux',
    published: [LATIN_400, GREEK_400],
    config: { family: 'Inter', subsets: ['cyrillic'] },
    file: 'a',
  },
];

/** The parser reads its subset from the comment Google labels each block with. */
export interface CssParseCase {
  css: string;
  faces: { subset: string; weight: number; style: string; url: string; unicodeRange: string }[];
}

export type CssParseRow = Case<CssParseCase>;

export const CSS_PARSE_CASES: CssParseRow[] = [
  {
    id: 'build2-font-reads-the-subset-off-the-comment-that-labels-the-block',
    src: 'janux',
    css: "/* latin-ext */\n@font-face { font-style: normal; font-weight: 500; src: url(https://f/a.woff2) format('woff2'); unicode-range: U+0100-024F; }",
    faces: [{ subset: 'latin-ext', weight: 500, style: 'normal', url: 'https://f/a.woff2', unicodeRange: 'U+0100-024F' }],
  },
  {
    id: 'build2-font-reads-italic-blocks-as-italic',
    src: 'janux',
    css: "/* latin */\n@font-face { font-style: italic; font-weight: 700; src: url(https://f/b.woff2) format('woff2'); unicode-range: U+0000-00FF; }",
    faces: [{ subset: 'latin', weight: 700, style: 'italic', url: 'https://f/b.woff2', unicodeRange: 'U+0000-00FF' }],
  },
  {
    id: 'build2-font-defaults-a-block-with-no-style-to-upright',
    src: 'janux',
    css: '/* latin */\n@font-face { font-weight: 400; src: url(https://f/c.woff2); }',
    faces: [{ subset: 'latin', weight: 400, style: 'normal', url: 'https://f/c.woff2', unicodeRange: '' }],
  },
  {
    id: 'build2-font-reads-nothing-out-of-a-stylesheet-with-no-font-faces',
    src: 'janux',
    css: 'body { font-family: Inter; }',
    faces: [],
  },
];

/** The message a typo produces, rather than a page that ships without its font. */
export interface NothingSelectedCase {
  config: { family: string; subsets?: string[]; weights?: number[]; styles?: string[] };
  says: string[];
}

export type NothingSelectedRow = Case<NothingSelectedCase>;

export const NOTHING_SELECTED_CASES: NothingSelectedRow[] = [
  {
    id: 'build2-font-error-names-the-family-and-what-was-asked-of-it',
    src: 'janux',
    config: { family: 'Inter', subsets: ['greek'], weights: [500] },
    says: ['Inter', 'greek', '500', 'normal'],
  },
  {
    id: 'build2-font-error-falls-back-to-the-defaults-it-actually-used',
    src: 'janux',
    config: { family: 'Inter' },
    says: ['latin', '400', 'normal'],
  },
  {
    id: 'build2-font-error-lists-every-declared-value',
    src: 'janux',
    config: { family: 'Inter', subsets: ['latin', 'greek'], weights: [400, 700], styles: ['normal', 'italic'] },
    says: ['latin/greek', '400/700', 'normal/italic'],
  },
];

/** Re-exported so the runner does not import the resolver twice. */
export { googleCssUrl, nothingSelected, parseGoogleCss, primaryFace, selectFaces };
