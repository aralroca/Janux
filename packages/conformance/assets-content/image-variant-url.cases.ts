import type { Case } from '../support/case';
import type { ImageFormat } from '../../janux/src/image/urls';

/**
 * The variant URL, character by character.
 *
 * It is a pure function of `(path, width, format)`, which is what lets the
 * component emit a `srcset` nothing registered and the build emit files nothing
 * rendered. So every character class a path may carry has to survive the trip:
 * separators stay separators, and everything a `srcset` or a URL would read as
 * syntax gets percent-encoded — one unescaped space does not corrupt a single
 * candidate, it makes the entire attribute unparseable.
 *
 * `encodeURIComponent` is the encoder, so its unreserved set (`-_.!~*'()`)
 * passes through verbatim and everything else does not. Those rows are here
 * because a hand-rolled "escape the space" replacement passes the obvious test
 * and still ships a broken `?` or `#`.
 *
 * The field is `path`, not `src`: `src` is the corpus's own credit column.
 */
export interface VariantUrlCase {
  /** The source path exactly as an app authored it on `<Image src>`. */
  path: string;
  width: number;
  format: ImageFormat;
  expected: string;
}

export type VariantUrlRow = Case<VariantUrlCase>;

export const VARIANT_URL_CASES: VariantUrlRow[] = [
  { id: 'asset-url-root-level-file', src: 'janux', path: '/hero.png', width: 320, format: 'avif', expected: '/_janux/image/hero.png/320.avif' },
  { id: 'asset-url-nested-directories', src: 'janux', path: '/photos/2026/07/hero.jpg', width: 640, format: 'webp', expected: '/_janux/image/photos/2026/07/hero.jpg/640.webp' },
  { id: 'asset-url-largest-ladder-width', src: 'janux', path: '/a.jpeg', width: 1920, format: 'avif', expected: '/_janux/image/a.jpeg/1920.avif' },
  { id: 'asset-url-webp-source-and-target', src: 'janux', path: '/a.webp', width: 960, format: 'webp', expected: '/_janux/image/a.webp/960.webp' },
  {
    id: 'asset-url-space-becomes-percent-twenty',
    src: 'astro:core-image#Supports-special-characters-in-file-name',
    path: '/my photo.jpg',
    width: 640,
    format: 'avif',
    expected: '/_janux/image/my%20photo.jpg/640.avif',
  },
  { id: 'asset-url-hash-would-start-a-fragment', src: 'janux', path: '/take #2.png', width: 320, format: 'avif', expected: '/_janux/image/take%20%232.png/320.avif' },
  { id: 'asset-url-question-mark-would-start-a-query', src: 'janux', path: '/what?.png', width: 320, format: 'avif', expected: '/_janux/image/what%3F.png/320.avif' },
  { id: 'asset-url-ampersand-encoded', src: 'janux', path: '/a&b.png', width: 320, format: 'avif', expected: '/_janux/image/a%26b.png/320.avif' },
  { id: 'asset-url-plus-is-not-a-space', src: 'janux', path: '/a+b.png', width: 320, format: 'avif', expected: '/_janux/image/a%2Bb.png/320.avif' },
  { id: 'asset-url-percent-is-encoded-again', src: 'janux', path: '/a%20b.png', width: 320, format: 'avif', expected: '/_janux/image/a%2520b.png/320.avif' },
  { id: 'asset-url-comma-would-split-a-srcset', src: 'janux', path: '/a,b.png', width: 320, format: 'avif', expected: '/_janux/image/a%2Cb.png/320.avif' },
  { id: 'asset-url-colon-encoded', src: 'janux', path: '/a:b.png', width: 320, format: 'avif', expected: '/_janux/image/a%3Ab.png/320.avif' },
  { id: 'asset-url-semicolon-encoded', src: 'janux', path: '/a;b.png', width: 320, format: 'avif', expected: '/_janux/image/a%3Bb.png/320.avif' },
  { id: 'asset-url-equals-encoded', src: 'janux', path: '/a=b.png', width: 320, format: 'avif', expected: '/_janux/image/a%3Db.png/320.avif' },
  { id: 'asset-url-at-sign-encoded', src: 'janux', path: '/logo@2x.png', width: 320, format: 'avif', expected: '/_janux/image/logo%402x.png/320.avif' },
  { id: 'asset-url-square-brackets-encoded', src: 'janux', path: '/a[1].png', width: 320, format: 'avif', expected: '/_janux/image/a%5B1%5D.png/320.avif' },
  { id: 'asset-url-double-quote-encoded', src: 'janux', path: '/a"b.png', width: 320, format: 'avif', expected: '/_janux/image/a%22b.png/320.avif' },
  { id: 'asset-url-angle-brackets-encoded', src: 'janux', path: '/a<b>.png', width: 320, format: 'avif', expected: '/_janux/image/a%3Cb%3E.png/320.avif' },
  { id: 'asset-url-backslash-encoded', src: 'janux', path: '/a\\b.png', width: 320, format: 'avif', expected: '/_janux/image/a%5Cb.png/320.avif' },
  { id: 'asset-url-non-ascii-utf8-encoded', src: 'janux', path: '/fotos/café.png', width: 320, format: 'avif', expected: '/_janux/image/fotos/caf%C3%A9.png/320.avif' },
  { id: 'asset-url-cjk-utf8-encoded', src: 'janux', path: '/写真.png', width: 320, format: 'avif', expected: '/_janux/image/%E5%86%99%E7%9C%9F.png/320.avif' },
  { id: 'asset-url-astral-plane-surrogate-pair', src: 'janux', path: '/🙂.png', width: 320, format: 'avif', expected: '/_janux/image/%F0%9F%99%82.png/320.avif' },
  { id: 'asset-url-apostrophe-passes-through', src: 'janux', path: "/bob's.png", width: 320, format: 'avif', expected: "/_janux/image/bob's.png/320.avif" },
  { id: 'asset-url-parentheses-pass-through', src: 'janux', path: '/shot(1).png', width: 320, format: 'avif', expected: '/_janux/image/shot(1).png/320.avif' },
  { id: 'asset-url-tilde-and-bang-pass-through', src: 'janux', path: '/~a!b.png', width: 320, format: 'avif', expected: '/_janux/image/~a!b.png/320.avif' },
  { id: 'asset-url-dashes-and-underscores-pass-through', src: 'janux', path: '/a-b_c.png', width: 320, format: 'avif', expected: '/_janux/image/a-b_c.png/320.avif' },
  { id: 'asset-url-uppercase-extension-kept', src: 'janux', path: '/HERO.PNG', width: 320, format: 'avif', expected: '/_janux/image/HERO.PNG/320.avif' },
  { id: 'asset-url-directory-with-a-dot', src: 'janux', path: '/v1.2/a.png', width: 320, format: 'avif', expected: '/_janux/image/v1.2/a.png/320.avif' },
  { id: 'asset-url-off-ladder-width-is-not-the-encoders-job', src: 'janux', path: '/a.png', width: 77, format: 'avif', expected: '/_janux/image/a.png/77.avif' },
];
