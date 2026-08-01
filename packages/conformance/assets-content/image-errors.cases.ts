import type { Case } from '../support/case';
import type { ImageProps } from '../../janux/src/image/image';

/**
 * The four author mistakes `<Image>` refuses to paper over.
 *
 * Each one has a silent failure mode that costs more than the crash: a remote
 * URL treated as a local file gives a `<picture>` whose every candidate 404s, a
 * relative `src` resolves against whatever page happens to be rendering it, and
 * a malformed ratio becomes `height="NaN"` — a box of nothing, which is exactly
 * the layout shift the component exists to prevent.
 *
 * The message is part of the contract: it names the offending value and the way
 * out, because these throw at render time, in a component the author did not
 * write.
 */
export interface ImageErrorCase {
  props: ImageProps;
  /** The exact message thrown. */
  expected: string;
}

export type ImageErrorRow = Case<ImageErrorCase>;

const remote = (value: string) =>
  `Janux <Image>: "${value}" is remote, so there is no file to optimize — pass \`unoptimized\` to link it as-is.`;
const relative = (value: string) =>
  `Janux <Image>: "${value}" must be an absolute path into public/, like "/hero.jpg".`;
const ratio = (value: unknown) => `Janux <Image>: aspectRatio "${value}" is not a ratio like 16/9 or 1.5.`;

export const IMAGE_ERROR_CASES: ImageErrorRow[] = [
  {
    id: 'asset-error-remote-without-unoptimized',
    src: 'janux',
    props: { src: 'https://cdn.test/pic.jpg', alt: 'r', width: 300, height: 150 },
    expected: remote('https://cdn.test/pic.jpg'),
  },
  {
    id: 'asset-error-protocol-relative-without-unoptimized',
    src: 'janux',
    props: { src: '//cdn.test/pic.jpg', alt: 'r', width: 300, height: 150 },
    expected: remote('//cdn.test/pic.jpg'),
  },
  {
    id: 'asset-error-data-uri-without-unoptimized',
    src: 'janux',
    props: { src: 'data:image/png;base64,iVBORw0KGgo=', alt: 'd', width: 10, height: 10 },
    expected: remote('data:image/png;base64,iVBORw0KGgo='),
  },
  {
    id: 'asset-error-bare-filename-is-not-a-public-path',
    src: 'janux',
    props: { src: 'hero.jpg', alt: 'b', width: 300, height: 150 },
    expected: relative('hero.jpg'),
  },
  {
    id: 'asset-error-dot-relative-is-not-a-public-path',
    src: 'janux',
    props: { src: './hero.jpg', alt: 'b', width: 300, height: 150 },
    expected: relative('./hero.jpg'),
  },
  {
    id: 'asset-error-parent-relative-is-not-a-public-path',
    src: 'janux',
    props: { src: '../hero.jpg', alt: 'b', width: 300, height: 150 },
    expected: relative('../hero.jpg'),
  },
  {
    id: 'asset-error-empty-src',
    src: 'janux',
    props: { src: '', alt: 'e', width: 300, height: 150 },
    expected: relative(''),
  },
  {
    id: 'asset-error-ratio-is-not-a-number',
    src: 'astro:core-image#error-if-no-height',
    props: { src: '/h.png', alt: 'x', width: 100, aspectRatio: 'wide' as `${number}/${number}` },
    expected: ratio('wide'),
  },
  {
    /** `16/0` is Infinity, which would divide the width down to a zero-height box. */
    id: 'asset-error-ratio-with-a-zero-denominator',
    src: 'janux',
    props: { src: '/h.png', alt: 'x', width: 100, aspectRatio: '16/0' },
    expected: ratio('16/0'),
  },
  {
    id: 'asset-error-ratio-with-a-zero-numerator',
    src: 'janux',
    props: { src: '/h.png', alt: 'x', width: 100, aspectRatio: '0/9' },
    expected: ratio('0/9'),
  },
  {
    id: 'asset-error-negative-ratio',
    src: 'janux',
    props: { src: '/h.png', alt: 'x', width: 100, aspectRatio: -2 },
    expected: ratio(-2),
  },
  {
    id: 'asset-error-zero-ratio',
    src: 'janux',
    props: { src: '/h.png', alt: 'x', width: 100, aspectRatio: 0 },
    expected: ratio(0),
  },
  {
    id: 'asset-error-empty-ratio',
    src: 'janux',
    props: { src: '/h.png', alt: 'x', width: 100, aspectRatio: '' as `${number}/${number}` },
    expected: ratio(''),
  },
  {
    id: 'asset-error-infinite-ratio',
    src: 'janux',
    props: { src: '/h.png', alt: 'x', width: 100, aspectRatio: Number.POSITIVE_INFINITY },
    expected: ratio(Number.POSITIVE_INFINITY),
  },
  {
    /** The source is checked before the box, so a remote URL reports the useful error first. */
    id: 'asset-error-source-is-checked-before-the-ratio',
    src: 'janux',
    props: { src: 'https://cdn.test/a.jpg', alt: 'x', width: 100, aspectRatio: 'nonsense' as `${number}/${number}` },
    expected: remote('https://cdn.test/a.jpg'),
  },
];
