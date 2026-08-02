import type { Case } from '../support/case';
import type { ImageFormat } from '../../janux/src/image/urls';

/**
 * The `srcset` attribute the browser actually parses.
 *
 * A `srcset` is a comma-separated list of `<url> <descriptor>` pairs, so the
 * two separators — the comma between candidates and the space before the
 * descriptor — are the only structure it has. Every row here is about keeping
 * that structure intact while the candidates vary: the list is emitted in the
 * order it was given (not sorted), the descriptor is always `<width>w`, and a
 * path carrying a space or a comma is encoded in *every* candidate rather than
 * in the first one someone noticed.
 */
export interface SrcSetCase {
  /** The source path as authored. */
  path: string;
  /** Candidate widths, in the order `imageWidths` produced them. */
  widths: number[];
  format: ImageFormat;
  expected: string;
}

export type SrcSetRow = Case<SrcSetCase>;

export const SRCSET_CASES: SrcSetRow[] = [
  {
    id: 'asset-srcset-single-candidate-has-no-comma',
    src: 'janux',
    path: '/a.png',
    widths: [320],
    format: 'avif',
    expected: '/_janux/image/a.png/320.avif 320w',
  },
  {
    id: 'asset-srcset-separator-is-comma-space',
    src: 'janux',
    path: '/a.png',
    widths: [320, 640],
    format: 'avif',
    expected: '/_janux/image/a.png/320.avif 320w, /_janux/image/a.png/640.avif 640w',
  },
  {
    id: 'asset-srcset-full-ladder',
    src: 'janux',
    path: '/h.jpg',
    widths: [320, 640, 960, 1280, 1920],
    format: 'webp',
    expected:
      '/_janux/image/h.jpg/320.webp 320w, /_janux/image/h.jpg/640.webp 640w, /_janux/image/h.jpg/960.webp 960w, ' +
      '/_janux/image/h.jpg/1280.webp 1280w, /_janux/image/h.jpg/1920.webp 1920w',
  },
  {
    id: 'asset-srcset-keeps-the-order-it-was-given',
    src: 'janux',
    path: '/a.png',
    widths: [960, 320],
    format: 'avif',
    expected: '/_janux/image/a.png/960.avif 960w, /_janux/image/a.png/320.avif 320w',
  },
  {
    /** No dedupe here: `imageWidths` owns the ladder, this owns the formatting. */
    id: 'asset-srcset-repeats-a-repeated-width',
    src: 'astro:core-image#properly-deduplicate-srcset-images',
    path: '/a.png',
    widths: [320, 320],
    format: 'avif',
    expected: '/_janux/image/a.png/320.avif 320w, /_janux/image/a.png/320.avif 320w',
  },
  {
    /** Only reachable if a caller bypasses `imageWidths`, which never returns empty. */
    id: 'asset-srcset-no-widths-is-an-empty-attribute',
    src: 'janux',
    path: '/a.png',
    widths: [],
    format: 'avif',
    expected: '',
  },
  {
    /**
     * The historical bug: the space ends the first candidate where its
     * descriptor should start, so the browser drops the whole attribute — not
     * one candidate. Every candidate has to carry the encoded name.
     */
    id: 'asset-srcset-space-encoded-in-every-candidate',
    src: 'janux',
    path: '/my photo.jpg',
    widths: [320, 640],
    format: 'webp',
    expected: '/_janux/image/my%20photo.jpg/320.webp 320w, /_janux/image/my%20photo.jpg/640.webp 640w',
  },
  {
    id: 'asset-srcset-comma-encoded-in-every-candidate',
    src: 'janux',
    path: '/a,b.png',
    widths: [320, 640],
    format: 'avif',
    expected: '/_janux/image/a%2Cb.png/320.avif 320w, /_janux/image/a%2Cb.png/640.avif 640w',
  },
  {
    id: 'asset-srcset-descriptor-follows-a-non-ladder-width',
    src: 'janux',
    path: '/a.png',
    widths: [77],
    format: 'webp',
    expected: '/_janux/image/a.png/77.webp 77w',
  },
  {
    id: 'asset-srcset-nested-path-repeats-in-full',
    src: 'janux',
    path: '/deep/nested/dir/a.jpeg',
    widths: [320, 640],
    format: 'avif',
    expected: '/_janux/image/deep/nested/dir/a.jpeg/320.avif 320w, /_janux/image/deep/nested/dir/a.jpeg/640.avif 640w',
  },
  {
    id: 'asset-srcset-non-ascii-encoded-in-every-candidate',
    src: 'janux',
    path: '/café.png',
    widths: [320, 640],
    format: 'webp',
    expected: '/_janux/image/caf%C3%A9.png/320.webp 320w, /_janux/image/caf%C3%A9.png/640.webp 640w',
  },
];
