import type { Case } from '../support/case';
import type { FontMetrics, FontOverrides } from '../../janux/src/font/css';

/**
 * The arithmetic that makes the font swap move nothing.
 *
 * `size-adjust` stretches the system font until its average glyph width matches
 * the webfont's, and the ascent/descent/line-gap overrides then restate the
 * webfont's vertical metrics *against that already-stretched em*. The double
 * application is the whole trap: an ascent expressed against the raw
 * `unitsPerEm` is wrong by exactly the size-adjust factor, and the error is
 * invisible until a Lighthouse run reports the shift.
 *
 * Every expectation here was computed from the metrics independently of the
 * implementation, so a refactor that keeps the code self-consistent but drops
 * the adjusted-em normalisation fails these rows rather than moving with them.
 * The `unitsPerEm` mismatch rows are the proof: 500/1000 and 1024/2048 are the
 * same proportion, so the adjustment must be exactly 100%.
 */
export interface FontMetricsCase {
  /** The webfont being loaded. */
  font: FontMetrics;
  /** The system font the fallback will actually paint. */
  fallback: FontMetrics;
  expected: FontOverrides;
}

export type FontMetricsRow = Case<FontMetricsCase>;

const ARIAL: FontMetrics = { unitsPerEm: 2048, ascent: 1854, descent: -434, lineGap: 67, xWidthAvg: 913 };
const TIMES: FontMetrics = { unitsPerEm: 2048, ascent: 1825, descent: -443, lineGap: 87, xWidthAvg: 908 };
const SIMPLE: FontMetrics = { unitsPerEm: 1000, ascent: 800, descent: -200, lineGap: 0, xWidthAvg: 500 };

export const FONT_METRICS_CASES: FontMetricsRow[] = [
  {
    /** Roboto against Arial: wider glyphs, so the fallback is stretched past 100%. */
    id: 'asset-font-wider-webfont-stretches-the-fallback',
    src: 'janux',
    font: { unitsPerEm: 2048, ascent: 1900, descent: -500, lineGap: 0, xWidthAvg: 981 },
    fallback: ARIAL,
    expected: { sizeAdjust: '107.45%', ascentOverride: '86.34%', descentOverride: '22.72%', lineGapOverride: '0%' },
  },
  {
    id: 'asset-font-serif-pair-against-times',
    src: 'janux',
    font: { unitsPerEm: 2048, ascent: 1878, descent: -449, lineGap: 0, xWidthAvg: 1004 },
    fallback: TIMES,
    expected: { sizeAdjust: '110.57%', ascentOverride: '82.93%', descentOverride: '19.83%', lineGapOverride: '0%' },
  },
  {
    /** Same average width, different vertical metrics: no stretch, but the box still changes. */
    id: 'asset-font-equal-widths-need-no-stretch',
    src: 'janux',
    font: SIMPLE,
    fallback: { unitsPerEm: 1000, ascent: 833, descent: -300, lineGap: 0, xWidthAvg: 500 },
    expected: { sizeAdjust: '100%', ascentOverride: '80%', descentOverride: '20%', lineGapOverride: '0%' },
  },
  {
    /**
     * 500/1000 and 1024/2048 are the same proportion, so a correct
     * implementation reports no adjustment at all across a 2× unit mismatch.
     */
    id: 'asset-font-units-per-em-is-normalised-away',
    src: 'janux',
    font: { unitsPerEm: 1000, ascent: 750, descent: -250, lineGap: 0, xWidthAvg: 500 },
    fallback: { unitsPerEm: 2048, ascent: 1854, descent: -434, lineGap: 67, xWidthAvg: 1024 },
    expected: { sizeAdjust: '100%', ascentOverride: '75%', descentOverride: '25%', lineGapOverride: '0%' },
  },
  {
    /** A font measured against itself is left completely alone. */
    id: 'asset-font-identity-pair-is-unadjusted',
    src: 'janux',
    font: ARIAL,
    fallback: ARIAL,
    expected: { sizeAdjust: '100%', ascentOverride: '90.53%', descentOverride: '21.19%', lineGapOverride: '3.27%' },
  },
  {
    /** `descent-override` is a magnitude: a head table that stores it positive means the same thing. */
    id: 'asset-font-descent-sign-is-ignored',
    src: 'janux',
    font: { unitsPerEm: 1000, ascent: 800, descent: 200, lineGap: 0, xWidthAvg: 500 },
    fallback: SIMPLE,
    expected: { sizeAdjust: '100%', ascentOverride: '80%', descentOverride: '20%', lineGapOverride: '0%' },
  },
  {
    /** A non-zero line gap has to cross too, or every line box shifts instead of every glyph. */
    id: 'asset-font-line-gap-crosses-over',
    src: 'janux',
    font: { unitsPerEm: 1000, ascent: 800, descent: -200, lineGap: 200, xWidthAvg: 500 },
    fallback: SIMPLE,
    expected: { sizeAdjust: '100%', ascentOverride: '80%', descentOverride: '20%', lineGapOverride: '20%' },
  },
  {
    /** Thirds: two decimals is the precision browsers act on, so 33.333… truncates down. */
    id: 'asset-font-repeating-decimal-truncates',
    src: 'janux',
    font: { unitsPerEm: 3000, ascent: 1000, descent: -1000, lineGap: 1000, xWidthAvg: 1000 },
    fallback: { unitsPerEm: 3000, ascent: 1000, descent: -1000, lineGap: 1000, xWidthAvg: 1000 },
    expected: { sizeAdjust: '100%', ascentOverride: '33.33%', descentOverride: '33.33%', lineGapOverride: '33.33%' },
  },
  {
    /** …and rounds up when the third decimal says so, rather than truncating everything. */
    id: 'asset-font-third-decimal-rounds-up',
    src: 'janux',
    font: { unitsPerEm: 10000, ascent: 6666, descent: -3334, lineGap: 1, xWidthAvg: 5000 },
    fallback: { unitsPerEm: 10000, ascent: 8000, descent: -2000, lineGap: 0, xWidthAvg: 5000 },
    expected: { sizeAdjust: '100%', ascentOverride: '66.66%', descentOverride: '33.34%', lineGapOverride: '0.01%' },
  },
  {
    /** Twice the average width: the fallback doubles, and every override halves against it. */
    id: 'asset-font-double-width-halves-the-overrides',
    src: 'janux',
    font: { unitsPerEm: 1000, ascent: 1200, descent: -300, lineGap: 50, xWidthAvg: 900 },
    fallback: { unitsPerEm: 1000, ascent: 800, descent: -200, lineGap: 0, xWidthAvg: 450 },
    expected: { sizeAdjust: '200%', ascentOverride: '60%', descentOverride: '15%', lineGapOverride: '2.5%' },
  },
  {
    /** A very narrow webfont shrinks the fallback to a tenth and pushes the ascent past 100%. */
    id: 'asset-font-narrow-webfont-overrides-exceed-one-em',
    src: 'janux',
    font: { unitsPerEm: 1000, ascent: 800, descent: -200, lineGap: 0, xWidthAvg: 100 },
    fallback: { unitsPerEm: 1000, ascent: 800, descent: -200, lineGap: 0, xWidthAvg: 1000 },
    expected: { sizeAdjust: '10%', ascentOverride: '800%', descentOverride: '200%', lineGapOverride: '0%' },
  },
  {
    /** Trailing zeros are dropped: `50.00%` is noise in every byte of CSS that ships. */
    id: 'asset-font-trailing-zeros-are-dropped',
    src: 'janux',
    font: { unitsPerEm: 1000, ascent: 500, descent: -250, lineGap: 100, xWidthAvg: 500 },
    fallback: SIMPLE,
    expected: { sizeAdjust: '100%', ascentOverride: '50%', descentOverride: '25%', lineGapOverride: '10%' },
  },
  {
    id: 'asset-font-zero-ascent-is-still-a-value',
    src: 'janux',
    font: { unitsPerEm: 1000, ascent: 0, descent: 0, lineGap: 0, xWidthAvg: 500 },
    fallback: SIMPLE,
    expected: { sizeAdjust: '100%', ascentOverride: '0%', descentOverride: '0%', lineGapOverride: '0%' },
  },
  {
    /** A quarter-width font: exact, so no rounding artefacts anywhere in the set. */
    id: 'asset-font-quarter-width-adjusts-to-twenty-five-percent',
    src: 'janux',
    font: { unitsPerEm: 1000, ascent: 1000, descent: -500, lineGap: 250, xWidthAvg: 250 },
    fallback: SIMPLE,
    expected: { sizeAdjust: '50%', ascentOverride: '200%', descentOverride: '100%', lineGapOverride: '50%' },
  },
];
