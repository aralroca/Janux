import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IMAGE_FORMATS, IMAGE_WIDTHS } from 'janux';
import { imageResponse, writeImageVariants } from './image-optimizer';

const APP = join(import.meta.dir, '__fixtures__/image-app');
const SOURCE = join(APP, 'public/photos/hero.jpg');
const VARIANTS = '_janux/image/photos/hero.jpg';

let outDir = '';

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'janux-image-'));
  await writeImageVariants(APP, outDir);
});

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('writing the variants a build ships', () => {
  it('emits every ladder width in every modern format, so no srcset candidate can 404', () => {
    const expected = IMAGE_FORMATS.flatMap((format) => IMAGE_WIDTHS.map((width) => `${width}.${format}`));

    expect(readdirSync(join(outDir, VARIANTS)).sort()).toEqual(expected.sort());
  });

  it('lands under the exact path <Image> links to', () => {
    expect(statSync(join(outDir, VARIANTS, '640.avif')).isFile()).toBe(true);
  });

  it('is smaller than the original — the reason any of this exists', () => {
    const original = statSync(SOURCE).size;

    expect(statSync(join(outDir, VARIANTS, '960.avif')).size).toBeLessThan(original);
  });

  /**
   * The fixture is 1000px wide and the ladder goes to 1920. Upscaling would ship
   * bytes with no detail in them, but the file still has to exist: the component
   * derives the srcset from the layout width, which knows nothing about the source.
   */
  it('never upscales past the source, yet still writes the file the srcset names', async () => {
    const sharp = (await import('sharp')).default;
    // The bytes, not the path: a sharp instance holds its input file open until
    // it is finalized, and Windows refuses to remove a directory that still has
    // an open handle in it — the teardown below would fail with EBUSY.
    const big = await sharp(readFileSync(join(outDir, VARIANTS, '1920.webp'))).metadata();

    expect(big.width).toBe(1000);
  });

  it('leaves alone what it cannot improve: an svg is already vector', () => {
    expect(readdirSync(join(outDir, '_janux/image'))).toEqual(['photos']);
  });
});

describe('serving a variant on demand, the way janux dev does', () => {
  it('answers with the encoded bytes and the format it was asked for', async () => {
    const response = await imageResponse(APP, `/${VARIANTS}/320.avif`);

    expect(response?.headers.get('content-type')).toBe('image/avif');
    expect((await response!.bytes()).length).toBeGreaterThan(0);
  });

  it.each([
    ['a path that is not an image request', '/photos/hero.jpg'],
    ['a width outside the ladder', `/${VARIANTS}/999.avif`],
    ['a traversal attempt', '/_janux/image/../../../etc/hosts.jpg/320.avif'],
    ['a source that does not exist', '/_janux/image/nope.jpg/320.avif'],
  ])('passes on %s instead of encoding it', async (_why, pathname) => {
    expect(await imageResponse(APP, pathname)).toBeUndefined();
  });
});

/**
 * A space in a filename is not exotic, and it is the character that separates a
 * `srcset` candidate from its width descriptor — so the encoded URL has to reach
 * a real file at both ends, not just look right in the markup.
 */
describe('a source whose name needs encoding', () => {
  const encoded = '_janux/image/photos/wide%20shot.jpg';

  it('writes the variants at the encoded path the srcset names', () => {
    expect(statSync(join(outDir, encoded, '640.webp')).isFile()).toBe(true);
  });

  it('serves it in dev too, decoding back to the file on disk', async () => {
    const response = await imageResponse(APP, `/${encoded}/640.webp`);

    expect(response?.headers.get('content-type')).toBe('image/webp');
  });
});
