/**
 * What Google publishes, and which of it an app asked for. Pure: no network, no
 * disk — building the request URL, reading the answer, and filtering it down.
 *
 * The CSS2 API already ships one pre-subset `woff2` per unicode range, which is
 * why Janux does no glyph-level subsetting of its own: declaring `subsets` is a
 * filter over what Google already split up.
 */
import type { FontConfig } from 'janux';

/** One `@font-face` as Google published it, before it is self-hosted. */
export interface GoogleFace {
  subset: string;
  weight: number;
  style: string;
  url: string;
  unicodeRange: string;
  preload: boolean;
}

export const DEFAULT_WEIGHTS = [400];
export const DEFAULT_STYLES = ['normal'];
export const DEFAULT_SUBSETS = ['latin'];

const BLOCK = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
const SRC_URL = /url\((https:[^)]+)\)/;

/** `ital,wght@0,400;1,400` only when italics were asked for — the plain axis is what most apps get. */
function axisFor(weights: number[], styles: string[]): string {
  if (!styles.includes('italic')) return `wght@${weights.join(';')}`;
  const itals = ['normal', 'italic'].filter((style) => styles.includes(style)).map((style) => (style === 'italic' ? 1 : 0));

  return `ital,wght@${itals.flatMap((ital) => weights.map((weight) => `${ital},${weight}`)).join(';')}`;
}

export function googleCssUrl(config: FontConfig): string {
  const weights = [...(config.weights ?? DEFAULT_WEIGHTS)].sort((first, second) => first - second);
  const axis = axisFor(weights, config.styles ?? DEFAULT_STYLES);
  const family = `${config.family.replaceAll(' ', '+')}:${axis}`;

  return `https://fonts.googleapis.com/css2?family=${family}&display=${config.display ?? 'swap'}`;
}

function declaration(body: string, name: string): string | undefined {
  return new RegExp(`${name}:\\s*([^;]+);`).exec(body)?.[1]?.trim();
}

/** Google labels each block with its subset in a comment — the only place that name appears. */
export function parseGoogleCss(css: string): GoogleFace[] {
  return [...css.matchAll(BLOCK)].map(([, subset, body]) => ({
    subset: subset!,
    weight: Number(declaration(body!, 'font-weight')),
    style: declaration(body!, 'font-style') ?? 'normal',
    url: SRC_URL.exec(body!)?.[1] ?? '',
    unicodeRange: declaration(body!, 'unicode-range') ?? '',
    preload: false,
  }));
}

/** The file metrics are measured from, and the one worth preloading: primary subset, lightest upright weight. */
export function primaryFace(faces: GoogleFace[], config: FontConfig): GoogleFace {
  const primary = (config.subsets ?? DEFAULT_SUBSETS)[0];
  const upright = faces.filter((face) => face.subset === primary && face.style === 'normal');

  return [...upright].sort((first, second) => first.weight - second.weight)[0] ?? faces[0]!;
}

/**
 * Exactly what was declared, with one face marked critical. The request already
 * asks for these weights, but trusting the answer to match is how a page ships a
 * weight nobody uses — and a preload for every subset the family covers pushes
 * the file that is needed behind the ones that are not.
 */
export function selectFaces(faces: GoogleFace[], config: FontConfig): GoogleFace[] {
  const subsets = config.subsets ?? DEFAULT_SUBSETS;
  const weights = config.weights ?? DEFAULT_WEIGHTS;
  const styles = config.styles ?? DEFAULT_STYLES;
  const wanted = (face: GoogleFace) =>
    subsets.includes(face.subset) && weights.includes(face.weight) && styles.includes(face.style);
  const selected = faces.filter(wanted);
  const critical = config.preload === false ? undefined : primaryFace(selected, config);

  return selected.map((face) => ({ ...face, preload: face === critical }));
}

/** A font that resolved to no faces at all is a typo, not a page that should ship without it. */
export function nothingSelected(config: FontConfig): string {
  const subsets = (config.subsets ?? DEFAULT_SUBSETS).join('/');
  const weights = (config.weights ?? DEFAULT_WEIGHTS).join('/');
  const styles = (config.styles ?? DEFAULT_STYLES).join('/');

  return `Janux fonts: "${config.family}" published no face matching subsets ${subsets}, weights ${weights}, styles ${styles}`;
}
