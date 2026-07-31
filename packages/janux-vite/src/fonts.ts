/**
 * Self-hosting for the fonts an app declares: download once, measure the real
 * file, and leave behind everything serving needs.
 *
 * Every artifact is cached under `node_modules/.janux/fonts`, so the network is
 * touched once per font and never again — a build that re-downloads on every run
 * is a build that fails when the network does. What Google publishes and how it
 * is filtered lives in `google-fonts.ts`; this module is the I/O around it.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fallbackOverrides,
  FONT_ROUTE,
  fontFaceCss,
  fontPreloadHrefs,
  type FontConfig,
  type FontMetrics,
  type FontOverrides,
  type GenericFamily,
  type ResolvedFont,
  type ResolvedFontFace,
} from 'janux';
import { googleCssUrl, nothingSelected, parseGoogleCss, primaryFace, selectFaces, type GoogleFace } from './google-fonts';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * The CSS2 API answers by user agent: an unrecognized one gets TTF, with no
 * subset comments and no `unicode-range`. Asking as a current Chrome is what
 * makes it answer with the per-subset woff2 this whole pipeline is built on.
 */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Metrics of the system font each generic family stands in for, measured by capsize. */
const FALLBACK_METRICS: Record<GenericFamily, () => Promise<{ default: FontMetrics }>> = {
  'sans-serif': () => import('@capsizecss/metrics/arial'),
  serif: () => import('@capsizecss/metrics/timesNewRoman'),
  monospace: () => import('@capsizecss/metrics/courierNew'),
};

const BUILT_CSS = '_janux/font/fonts.css';
const BUILT_PRELOADS = '_janux/font/preloads.json';

export function fontCacheDir(root: string): string {
  return join(root, 'node_modules/.janux/fonts');
}

function slug(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 8);
}

/**
 * Named after the source file, not the weight it was asked for: Google ships
 * most families as one variable file covering the whole range, so several
 * declared weights point at the same URL — and one self-hosted copy per weight
 * would make the browser download the same bytes again for each of them.
 */
function fileNameFor(config: FontConfig, face: GoogleFace): string {
  return `${slug(config.family)}-${face.subset}-${digest(face.url)}.woff2`;
}

async function download(fetchImpl: Fetch, url: string, family: string): Promise<Uint8Array> {
  const response = await fetchImpl(url, { headers: { 'user-agent': BROWSER_UA } });

  if (!response.ok) throw new Error(`Janux fonts: could not fetch "${family}" — ${response.status} from ${url}`);

  return new Uint8Array(await response.arrayBuffer());
}

/** The cache in one place: present means never fetched again. */
async function cached(file: string, fetchOnce: () => Promise<Uint8Array>): Promise<Uint8Array> {
  if (existsSync(file)) return readFileSync(file);
  const bytes = await fetchOnce();

  await Bun.write(file, bytes);

  return bytes;
}

async function googleCss(dir: string, config: FontConfig, fetchImpl: Fetch): Promise<string> {
  const url = googleCssUrl(config);
  const file = join(dir, `${slug(config.family)}-${digest(url)}.css`);
  const bytes = await cached(file, () => download(fetchImpl, url, config.family));

  return new TextDecoder().decode(bytes);
}

async function hostFace(dir: string, config: FontConfig, face: GoogleFace, fetchImpl: Fetch): Promise<ResolvedFontFace> {
  const name = fileNameFor(config, face);

  await cached(join(dir, name), () => download(fetchImpl, face.url, config.family));

  return { weight: face.weight, style: face.style, url: `${FONT_ROUTE}/${name}`, unicodeRange: face.unicodeRange, preload: face.preload };
}

/** Measured from the downloaded file, then cached: parsing is cheap but the answer never changes. */
async function metricsOf(dir: string, config: FontConfig, face: GoogleFace): Promise<FontMetrics> {
  const file = join(dir, `${slug(config.family)}.metrics.json`);

  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as FontMetrics;
  const { fromBuffer } = await import('@capsizecss/unpack');
  const { unitsPerEm, ascent, descent, lineGap, xWidthAvg } = await fromBuffer(readFileSync(join(dir, fileNameFor(config, face))));

  await Bun.write(file, JSON.stringify({ unitsPerEm, ascent, descent, lineGap, xWidthAvg }));

  return { unitsPerEm, ascent, descent, lineGap, xWidthAvg };
}

/** What the app declared, defaults applied — everything that needs no file to know. */
function declaredShape(config: FontConfig): Pick<ResolvedFont, 'family' | 'display' | 'fallback' | 'variable'> {
  return {
    family: config.family,
    display: config.display ?? 'swap',
    fallback: config.fallback ?? 'sans-serif',
    variable: config.variable,
  };
}

/** The adjustment itself: the downloaded file's metrics against the generic family's. */
async function overridesFor(dir: string, config: FontConfig, selected: GoogleFace[]): Promise<FontOverrides> {
  const fallback = config.fallback ?? 'sans-serif';
  const metrics = await metricsOf(dir, config, primaryFace(selected, config));

  return fallbackOverrides(metrics, (await FALLBACK_METRICS[fallback]()).default);
}

async function resolveFont(dir: string, config: FontConfig, fetchImpl: Fetch): Promise<ResolvedFont> {
  const selected = selectFaces(parseGoogleCss(await googleCss(dir, config, fetchImpl)), config);

  if (selected.length === 0) throw new Error(nothingSelected(config));
  // Hosted before measured: `metricsOf` reads the file this puts on disk.
  const faces = await Promise.all(selected.map((face) => hostFace(dir, config, face, fetchImpl)));
  const overrides = await overridesFor(dir, config, selected);

  return { ...declaredShape(config), overrides, faces };
}

export async function resolveFonts(root: string, configs: FontConfig[], fetchImpl: Fetch = fetch): Promise<ResolvedFont[]> {
  if (configs.length === 0) return [];
  const dir = fontCacheDir(root);

  mkdirSync(dir, { recursive: true });

  return Promise.all(configs.map((config) => resolveFont(dir, config, fetchImpl)));
}

function copyFace(root: string, outDir: string, face: ResolvedFontFace): Promise<number> {
  const name = face.url.slice(FONT_ROUTE.length + 1);

  return Bun.write(join(outDir, FONT_ROUTE.slice(1), name), Bun.file(join(fontCacheDir(root), name)));
}

/**
 * The build's whole font output: the files, the finished CSS and the preload
 * list. Written once so that serving needs no resolver — which is what makes
 * `output: "static"` work at all, and what keeps `janux start` off the network.
 */
export async function writeFontAssets(root: string, configs: FontConfig[], outDir: string, fetchImpl: Fetch = fetch): Promise<number> {
  const fonts = await resolveFonts(root, configs, fetchImpl);

  if (fonts.length === 0) return 0;
  await Promise.all(fonts.flatMap((font) => font.faces.map((face) => copyFace(root, outDir, face))));
  await Bun.write(join(outDir, BUILT_CSS), fontFaceCss(fonts));
  await Bun.write(join(outDir, BUILT_PRELOADS), JSON.stringify(fontPreloadHrefs(fonts)));

  return fonts.length;
}

/** What a built app hands the shell. Absent before the first build, and for an app with no fonts. */
export function builtFontAssets(outDir: string): { fontFaces?: string; fontPreloads?: string[] } {
  const css = join(outDir, BUILT_CSS);

  if (!existsSync(css)) return {};

  return {
    fontFaces: readFileSync(css, 'utf8'),
    fontPreloads: JSON.parse(readFileSync(join(outDir, BUILT_PRELOADS), 'utf8')) as string[],
  };
}

/** A self-hosted font file straight out of the resolver's cache — dev has no build output to serve from. */
export function fontResponse(root: string, path: string): Response | undefined {
  if (!path.startsWith(`${FONT_ROUTE}/`)) return undefined;
  const name = path.slice(FONT_ROUTE.length + 1);
  const file = join(fontCacheDir(root), name);

  if (name.includes('/') || !existsSync(file)) return undefined;

  return new Response(readFileSync(file), { headers: { 'content-type': 'font/woff2' } });
}
