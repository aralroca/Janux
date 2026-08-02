/**
 * The URL contract between `<Image>` and the optimizer.
 *
 * Nothing is registered anywhere: a variant's URL is a pure function of the
 * source path, a width and a format, so the component can emit a `srcset`
 * without asking a build step what exists, and the build step can produce
 * exactly what pages reference without watching them render. That is what lets
 * one optimizer serve `janux dev` on demand and `janux build` ahead of time —
 * including `output: "static"`, where there is no server left to ask.
 *
 * The ladder is deliberately short. Every entry multiplies the encoding work
 * and the files a static export ships, and five widths already keep the step
 * between candidates under 2× across the range browsers actually pick from.
 */
export const IMAGE_WIDTHS = [320, 640, 960, 1280, 1920] as const;

/**
 * AVIF first: `<picture>` takes the first `<source>` the browser understands,
 * and AVIF is the smaller of the two everywhere it is supported.
 */
export const IMAGE_FORMATS = ['avif', 'webp'] as const;

export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/** Where variants live, under the framework's own namespace so no app path can collide. */
export const IMAGE_ROUTE = '/_janux/image';

/** A parsed variant request — what the optimizer needs to produce the bytes. */
export interface ImageVariant {
  /** The source as a URL pathname (still percent-encoded), which is what a public-file lookup takes. */
  src: string;
  width: number;
  format: ImageFormat;
}

/** Raster formats worth re-encoding. SVG is already optimal and GIF is usually animated. */
const OPTIMIZABLE = /\.(?:png|jpe?g|webp)$/i;
/** A scheme (`https:`, `data:`) or a protocol-relative `//host` — anything the app does not own. */
const REMOTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const VARIANT = /^(.+)\/(\d+)\.([a-z]+)$/;

export function isOptimizable(src: string): boolean {
  return OPTIMIZABLE.test(src);
}

export function isRemote(src: string): boolean {
  return REMOTE.test(src);
}

/**
 * The candidates a `width`-wide image offers. Twice the layout width is the
 * last one a 2× screen can use, so anything above it is bytes no device asks
 * for — and an image smaller than the smallest ladder entry still needs one
 * candidate, or the `srcset` would be empty.
 */
export function imageWidths(width: number): number[] {
  const fitting = IMAGE_WIDTHS.filter((candidate) => candidate <= width * 2);

  return fitting.length > 0 ? fitting : [IMAGE_WIDTHS[0]];
}

/**
 * Percent-encodes each segment, separators kept. A space would end a `srcset`
 * candidate where its width descriptor starts and a `#` would begin a fragment,
 * so one badly named file makes the whole attribute unparseable rather than one
 * candidate wrong.
 */
function encodePath(src: string): string {
  return src.split('/').map(encodeURIComponent).join('/');
}

export function variantUrl(src: string, width: number, format: ImageFormat): string {
  return `${IMAGE_ROUTE}${encodePath(src)}/${width}.${format}`;
}

export function imageSrcSet(src: string, widths: number[], format: ImageFormat): string {
  return widths.map((width) => `${variantUrl(src, width, format)} ${width}w`).join(', ');
}

/**
 * The path a file lookup would actually open, or `undefined` when the escaping
 * is broken. `variantUrl` only ever emits valid encoding, so a malformed escape
 * is by definition not a URL Janux produced.
 */
function decodedPath(src: string): string | undefined {
  try {
    return decodeURIComponent(src);
  } catch {
    return undefined;
  }
}

/**
 * A source Janux would itself have linked: optimizable, app-rooted, and inside
 * `public/`.
 *
 * The traversal check runs on the *decoded* path, because that is the string
 * the consumer opens a file with. `variantUrl` percent-encodes every segment,
 * so a `..` can never arrive literally — it arrives as `%2e%2e`, or hides its
 * separator as `..%2f`, and a check against the encoded form sees a segment
 * called `%2e%2e` and waves it through. Both separators count: a decoded `\`
 * walks up a directory too once a path join gets hold of it.
 */
function isKnownSource(src: string): boolean {
  const decoded = decodedPath(src);

  return decoded !== undefined && isOptimizable(src) && !isRemote(src) && !decoded.split(/[/\\]/).includes('..');
}

/** Whether the ladder would ever have produced this width and format. */
function isEmitted(width: number, format: string): boolean {
  return (IMAGE_WIDTHS as readonly number[]).includes(width) && (IMAGE_FORMATS as readonly string[]).includes(format);
}

/**
 * The inverse of `variantUrl`, and the trust boundary with it: under
 * `janux dev` this turns a URL into a file read and an encode, so a request for
 * anything Janux would not have emitted is refused rather than served.
 */
export function parseVariantUrl(pathname: string): ImageVariant | undefined {
  if (!pathname.startsWith(`${IMAGE_ROUTE}/`)) return undefined;
  const match = VARIANT.exec(pathname.slice(IMAGE_ROUTE.length));

  if (!match) return undefined;
  const [, src, digits, format] = match as unknown as [string, string, string, ImageFormat];
  const width = Number(digits);

  if (!isKnownSource(src) || !isEmitted(width, format)) return undefined;

  return { src, width, format };
}
