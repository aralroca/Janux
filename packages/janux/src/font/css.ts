/**
 * The CSS half of the font pipeline: pure, dependency-free, and the only thing
 * that reaches the browser.
 *
 * A webfont costs layout twice — once when the fallback paints and once when
 * the real file swaps in — and the second one is the shift Lighthouse reports.
 * The fix is not to hide the text: it is to make the fallback occupy the same
 * space. `size-adjust` stretches the system font to the webfont's average glyph
 * width, and the ascent/descent overrides restate its vertical metrics against
 * that already-adjusted em, so the line box does not move either.
 *
 * See https://developer.mozilla.org/docs/Web/CSS/@font-face/size-adjust.
 */

/** Where self-hosted font files live, under the framework's own namespace. */
export const FONT_ROUTE = '/_janux/font';

/** Head metrics of a real font file, in font units. */
export interface FontMetrics {
  unitsPerEm: number;
  ascent: number;
  descent: number;
  lineGap: number;
  /** Average advance width, weighted by letter frequency — what `size-adjust` compares. */
  xWidthAvg: number;
}

/** The four descriptors that make a fallback occupy the webfont's space. */
export interface FontOverrides {
  sizeAdjust: string;
  ascentOverride: string;
  descentOverride: string;
  lineGapOverride: string;
}

/** The generic family a fallback is measured against. */
export type GenericFamily = 'sans-serif' | 'serif' | 'monospace';

export interface ResolvedFontFace {
  weight: number;
  style: string;
  /** Self-hosted URL of the woff2 the build wrote. */
  url: string;
  unicodeRange: string;
  /** Whether this file is needed for the first paint, and so worth a `<link rel=preload>`. */
  preload: boolean;
}

/** One declared font, once the resolver has downloaded it and measured it. */
export interface ResolvedFont {
  family: string;
  display: string;
  fallback: GenericFamily;
  /** CSS custom property carrying the stack, e.g. `--font-sans`. */
  variable?: string;
  overrides: FontOverrides;
  faces: ResolvedFontFace[];
}

/** The system font each generic family actually resolves to on the majority of installs. */
const SYSTEM_FALLBACK: Record<GenericFamily, string> = {
  'sans-serif': 'Arial',
  serif: 'Times New Roman',
  monospace: 'Courier New',
};

/** Two decimals is the precision browsers act on; `Number` drops the trailing zeros. */
function percent(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

/**
 * Every override is stated against the *adjusted* em, not the original one —
 * `size-adjust` has already scaled it, so an ascent expressed against the raw
 * `unitsPerEm` would be applied twice.
 */
export function fallbackOverrides(font: FontMetrics, fallback: FontMetrics): FontOverrides {
  const sizeAdjust = font.xWidthAvg / font.unitsPerEm / (fallback.xWidthAvg / fallback.unitsPerEm);
  const em = font.unitsPerEm * sizeAdjust;

  return {
    sizeAdjust: percent(sizeAdjust * 100),
    ascentOverride: percent((font.ascent / em) * 100),
    descentOverride: percent((Math.abs(font.descent) / em) * 100),
    lineGapOverride: percent((font.lineGap / em) * 100),
  };
}

/** One `@font-face` per subset: the `unicode-range` is what stops a page loading Cyrillic it never shows. */
function realFace(font: ResolvedFont, face: ResolvedFontFace): string {
  return (
    `@font-face{font-family:'${font.family}';font-style:${face.style};font-weight:${face.weight};` +
    `font-display:${font.display};src:url(${face.url}) format('woff2');unicode-range:${face.unicodeRange}}`
  );
}

/** The adjusted alias of the system font — what the browser paints before the webfont arrives. */
function fallbackFace(font: ResolvedFont): string {
  const { sizeAdjust, ascentOverride, descentOverride, lineGapOverride } = font.overrides;

  return (
    `@font-face{font-family:'${font.family} Fallback';src:local('${SYSTEM_FALLBACK[font.fallback]}');` +
    `size-adjust:${sizeAdjust};ascent-override:${ascentOverride};` +
    `descent-override:${descentOverride};line-gap-override:${lineGapOverride}}`
  );
}

/** The stack, named once so the app never has to repeat "font, its fallback, the generic". */
function variableRule(font: ResolvedFont): string[] {
  if (!font.variable) return [];

  return [`:root{${font.variable}:'${font.family}','${font.family} Fallback',${font.fallback}}`];
}

export function fontFaceCss(fonts: ResolvedFont[]): string {
  return fonts
    .flatMap((font) => [...font.faces.map((face) => realFace(font, face)), fallbackFace(font), ...variableRule(font)])
    .join('\n');
}

/** Deduped: several faces can share one file (a variable font), and that is still one fetch. */
export function fontPreloadHrefs(fonts: ResolvedFont[]): string[] {
  return [...new Set(fonts.flatMap((font) => font.faces.filter((face) => face.preload).map((face) => face.url)))];
}
