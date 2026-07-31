import { describe, expect, it } from 'bun:test';
import { IMAGE_FORMATS, IMAGE_WIDTHS, jsx, parseVariantUrl, renderToString, variantUrl } from 'janux';
import { docExample } from '../doc-example';

const PAGE = 'apps/docs/content/guide/images.md';
const render = async (index: number, component: string) => {
  const module = await docExample(PAGE, index);

  return (await renderToString(jsx(module[component] ?? module.default, {}), {})).html;
};

/**
 * guide/images.md is a page a reader copies verbatim, and every claim on it is
 * about markup: which attributes land, which candidates the srcset names, and
 * what happens to a source the optimizer refuses. Compiling the snippets proves
 * none of that — so they are rendered.
 */
describe('guide/images.md', () => {
  it('the first snippet renders the documented picture: avif, webp, and the original as fallback', async () => {
    const html = await render(0, 'default');

    expect(html).toContain('<source type="image/avif"');
    expect(html).toContain('<source type="image/webp"');
    expect(html).toContain('src="/photos/hero.jpg"');
  });

  it('renders exactly the attributes the page prints for a priority image', async () => {
    const html = await render(0, 'default');

    expect(html).toContain('width="1200"');
    expect(html).toContain('height="675"');
    expect(html).toContain('loading="eager"');
    expect(html).toContain('fetchPriority="high"');
    expect(html).toContain('decoding="async"');
  });

  /** The page says 1200 / (16/9) → 675. If that arithmetic drifts, the box is wrong. */
  it('derives the height from aspectRatio exactly as the comment claims', async () => {
    expect(await render(1, 'Hero')).toContain('height="675"');
  });

  it('honours the fluid sizes the banner snippet passes', async () => {
    expect(await render(2, 'Banner')).toContain('sizes="(max-width: 70rem) 100vw, 70rem"');
  });

  it('lazy-loads a pass-through remote image, box intact, and never links a variant for it', async () => {
    const html = await render(3, 'Avatar');

    expect(html).toContain('src="https://cdn.example.com/a.jpg"');
    expect(html).toContain('width="64"');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain('<picture>');
  });

  it('documents the real ladder and the real formats', () => {
    expect([...IMAGE_WIDTHS]).toEqual([320, 640, 960, 1280, 1920]);
    expect([...IMAGE_FORMATS]).toEqual(['avif', 'webp']);
  });

  it('builds the variant URL the page prints, and reads it back', () => {
    const url = variantUrl('/photos/hero.jpg', 640, 'avif');

    expect(url).toBe('/_janux/image/photos/hero.jpg/640.avif');
    expect(parseVariantUrl(url)).toEqual({ src: '/photos/hero.jpg', width: 640, format: 'avif' });
  });
});
