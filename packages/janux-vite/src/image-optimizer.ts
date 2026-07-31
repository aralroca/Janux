/**
 * The one optimizer, used from both ends of the app's life.
 *
 * `janux build` writes every variant `<Image>` can link to (`writeImageVariants`),
 * so a production server serves files off disk and a static export needs no
 * server at all. `janux dev` answers the same URLs on demand (`imageResponse`),
 * so what a page looks like while you write it is what it looks like shipped.
 *
 * Neither end asks the other what exists: both derive the URLs from `janux`'s
 * pure `variantUrl`/`parseVariantUrl`, which is what keeps them honest.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { IMAGE_FORMATS, IMAGE_WIDTHS, isOptimizable, parseVariantUrl, variantUrl, type ImageFormat } from 'janux';
import { resolvePublicFile } from './static-files';

/** Encoded bytes, in the narrower view type `Response` accepts as a body. */
type Bytes = Uint8Array<ArrayBuffer>;

/** Dev only: an encode is ~100ms and a page reload asks for the same URL again. Keyed by mtime, so edits win. */
const encoded = new Map<string, Bytes>();

async function sharp() {
  return (await import('sharp')).default;
}

/**
 * `withoutEnlargement` is why a srcset can name a width larger than the source:
 * the candidate still exists, it just stops at the pixels the file has.
 */
async function encode(file: string, width: number, format: ImageFormat): Promise<Bytes> {
  const pipeline = (await sharp())(file).resize({ width, withoutEnlargement: true });

  return new Uint8Array(await pipeline.toFormat(format).toBuffer());
}

/** Widths grouped by the encode they share — everything past the source's own width is the same picture. */
async function encodesFor(file: string): Promise<Map<number, number[]>> {
  const { width = 0 } = await (await sharp())(file).metadata();

  return Map.groupBy(IMAGE_WIDTHS, (asked) => Math.min(asked, width || asked));
}

async function writeVariants(outDir: string, src: string, file: string, target: number, asked: number[]): Promise<void> {
  await Promise.all(
    IMAGE_FORMATS.map(async (format) => {
      const bytes = await encode(file, target, format);

      await Promise.all(asked.map((width) => Bun.write(join(outDir, variantUrl(src, width, format)), bytes)));
    }),
  );
}

async function writeSource(outDir: string, src: string, file: string): Promise<void> {
  const groups = await encodesFor(file);

  await Promise.all([...groups].map(([target, asked]) => writeVariants(outDir, src, file, target, asked)));
}

/** Public-relative paths of every image worth re-encoding, as URLs (`/photos/hero.jpg`). */
function imageSources(publicDir: string): string[] {
  if (!existsSync(publicDir)) return [];

  return readdirSync(publicDir, { recursive: true })
    .map((name) => `/${String(name).replaceAll('\\', '/')}`)
    .filter(isOptimizable);
}

/** Every variant every page could link to, written under `outDir`. Returns the number of sources processed. */
export async function writeImageVariants(root: string, outDir: string): Promise<number> {
  const publicDir = join(root, 'public');
  const sources = imageSources(publicDir);

  await Promise.all(sources.map((src) => writeSource(outDir, src, join(publicDir, src.slice(1)))));

  return sources.length;
}

/** The dev answer to a variant URL, or `undefined` when the request is not one Janux would have emitted. */
export async function imageResponse(root: string, pathname: string): Promise<Response | undefined> {
  const variant = parseVariantUrl(pathname);
  const file = variant && resolvePublicFile(root, variant.src);

  if (!variant || !file) return undefined;
  const key = `${pathname}:${statSync(file).mtimeMs}`;
  const bytes = encoded.get(key) ?? (await encode(file, variant.width, variant.format));

  encoded.set(key, bytes);

  return new Response(bytes, { headers: { 'content-type': `image/${variant.format}` } });
}
