import { describe, expect, it } from 'bun:test';
import {
  IMAGE_FORMATS,
  IMAGE_ROUTE,
  IMAGE_WIDTHS,
  imageSrcSet,
  imageWidths,
  isOptimizable,
  isRemote,
  parseVariantUrl,
  variantUrl,
} from './urls';

describe('image widths', () => {
  it('offers every ladder width up to twice the layout width, for the 2× screen', () => {
    expect(imageWidths(640)).toEqual([320, 640, 960, 1280]);
  });

  it('stops at the largest ladder width, however big the layout asks', () => {
    expect(imageWidths(4000)).toEqual([...IMAGE_WIDTHS]);
  });

  it('never renders an empty srcset: a tiny avatar still gets the smallest variant', () => {
    expect(imageWidths(40)).toEqual([320]);
  });
});

describe('variant urls', () => {
  it('keeps the source path and appends width + format, so the URL is derivable by both sides', () => {
    expect(variantUrl('/photos/hero.jpg', 640, 'avif')).toBe('/_janux/image/photos/hero.jpg/640.avif');
  });

  it('renders a width-descriptor srcset the browser can pick from', () => {
    expect(imageSrcSet('/hero.png', [320, 640], 'webp')).toBe(
      '/_janux/image/hero.png/320.webp 320w, /_janux/image/hero.png/640.webp 640w',
    );
  });

  it('round-trips: what the component emits is what the optimizer is asked for', () => {
    const url = variantUrl('/a/b/c.jpeg', 1920, 'webp');

    expect(parseVariantUrl(url)).toEqual({ src: '/a/b/c.jpeg', width: 1920, format: 'webp' });
  });

  /**
   * A space is the descriptor separator inside a `srcset`, and `#` starts a
   * fragment: an unencoded filename does not make one candidate wrong, it makes
   * the whole attribute unparseable.
   */
  it('encodes a path that would otherwise break the srcset it lands in', () => {
    expect(variantUrl('/photos/my photo #2.jpg', 640, 'avif')).toBe(
      '/_janux/image/photos/my%20photo%20%232.jpg/640.avif',
    );
  });

  it('round-trips an encoded path as the pathname a public file is resolved from', () => {
    const url = variantUrl('/photos/my photo.jpg', 640, 'avif');

    expect(parseVariantUrl(url)?.src).toBe('/photos/my%20photo.jpg');
  });
});

/**
 * The parser is the trust boundary: the dev middleware turns whatever a request
 * asks for into a file read, so anything outside the ladder Janux itself emits
 * is refused rather than encoded on demand.
 */
describe('parsing a variant url', () => {
  it.each([
    ['not the image route', '/_janux/manifest'],
    ['a width nobody emits', '/_janux/image/hero.png/999.avif'],
    ['a format nobody emits', '/_janux/image/hero.png/640.gif'],
    ['a traversal attempt', '/_janux/image/../../etc/passwd/640.avif'],
    ['a source that is not optimizable', '/_janux/image/logo.svg/640.avif'],
    ['no source at all', '/_janux/image/640.avif'],
  ])('refuses %s', (_why, pathname) => {
    expect(parseVariantUrl(pathname)).toBeUndefined();
  });

  it('starts at the route prefix the component builds URLs from', () => {
    expect(IMAGE_ROUTE).toBe('/_janux/image');
  });
});

describe('classifying a source', () => {
  it.each([
    ['/hero.png', true],
    ['/photos/a.JPEG', true],
    ['/hero.webp', true],
    ['/logo.svg', false],
    ['/loop.gif', false],
    ['/hero', false],
  ])('%s is optimizable: %p', (src, expected) => {
    expect(isOptimizable(src)).toBe(expected);
  });

  it.each([
    ['https://cdn.example.com/a.png', true],
    ['http://example.com/a.png', true],
    ['//cdn.example.com/a.png', true],
    ['data:image/png;base64,AAAA', true],
    ['/local.png', false],
  ])('%s is remote: %p', (src, expected) => {
    expect(isRemote(src)).toBe(expected);
  });
});

describe('the emitted set', () => {
  it('offers avif before webp, so the browser takes the smaller one first', () => {
    expect(IMAGE_FORMATS).toEqual(['avif', 'webp']);
  });
});
