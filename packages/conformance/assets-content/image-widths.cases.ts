import type { Case } from '../support/case';

/**
 * Which ladder entries a `width`-wide image offers.
 *
 * The rule is one line — every candidate up to `width × 2`, or the smallest
 * entry when none fits — but the interesting part is the boundary. `160` is the
 * first layout width for which `320` genuinely fits; `159` gets the same single
 * candidate through the *other* branch, the one that stops a `srcset` from
 * coming out empty. A refactor that drops the fallback keeps `160` passing and
 * breaks every avatar on the page.
 */
export interface ImageWidthsCase {
  /** Layout width in CSS pixels, as authored on `<Image width>`. */
  width: number;
  /** The candidates, in ladder order. */
  expected: number[];
}

export type ImageWidthsRow = Case<ImageWidthsCase>;

const ALL = [320, 640, 960, 1280, 1920];

export const IMAGE_WIDTHS_CASES: ImageWidthsRow[] = [
  { id: 'asset-widths-exact-half-of-first', src: 'janux', width: 160, expected: [320] },
  { id: 'asset-widths-below-first-falls-back', src: 'janux', width: 159, expected: [320] },
  { id: 'asset-widths-one-pixel', src: 'janux', width: 1, expected: [320] },
  { id: 'asset-widths-zero', src: 'janux', width: 0, expected: [320] },
  { id: 'asset-widths-negative', src: 'janux', width: -5, expected: [320] },
  { id: 'asset-widths-fractional-below-first', src: 'janux', width: 0.5, expected: [320] },
  { id: 'asset-widths-fractional-crossing-first', src: 'janux', width: 160.5, expected: [320] },
  { id: 'asset-widths-nan-falls-back', src: 'janux', width: Number.NaN, expected: [320] },
  { id: 'asset-widths-just-under-second', src: 'janux', width: 319, expected: [320] },
  { id: 'asset-widths-exact-half-of-second', src: 'janux', width: 320, expected: [320, 640] },
  { id: 'asset-widths-typical-card', src: 'janux', width: 480, expected: [320, 640, 960] },
  { id: 'asset-widths-just-under-fourth', src: 'janux', width: 639, expected: [320, 640, 960] },
  { id: 'asset-widths-exact-half-of-fourth', src: 'janux', width: 640, expected: [320, 640, 960, 1280] },
  { id: 'asset-widths-just-under-largest', src: 'janux', width: 959, expected: [320, 640, 960, 1280] },
  { id: 'asset-widths-exact-half-of-largest', src: 'janux', width: 960, expected: ALL },
  { id: 'asset-widths-beyond-the-ladder', src: 'janux', width: 4000, expected: ALL },
  { id: 'asset-widths-absurd-layout', src: 'janux', width: Number.MAX_SAFE_INTEGER, expected: ALL },
  { id: 'asset-widths-infinite-layout', src: 'janux', width: Number.POSITIVE_INFINITY, expected: ALL },
];
