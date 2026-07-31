import { describe, expect, it } from 'bun:test';
import { renderToString } from '../render/server';
import { Image } from './image';

const html = async (node: unknown) => (await renderToString(node)).html;

describe('<Image> on a local asset', () => {
  it('offers avif and webp, and keeps the original as the fallback the browser can always take', async () => {
    const markup = await html(<Image src="/hero.jpg" alt="A hero" width={640} height={360} />);

    expect(markup).toContain('<source type="image/avif" srcSet="/_janux/image/hero.jpg/320.avif 320w');
    expect(markup).toContain('<source type="image/webp" srcSet="/_janux/image/hero.jpg/320.webp 320w');
    expect(markup).toContain('src="/hero.jpg"');
    expect(markup.startsWith('<picture>')).toBe(true);
  });

  /** The whole point: a browser that has the box before it has the bytes never reflows. */
  it('always writes width and height, so the box is reserved before the bytes arrive', async () => {
    const markup = await html(<Image src="/hero.jpg" alt="A hero" width={640} height={360} />);

    expect(markup).toContain('width="640"');
    expect(markup).toContain('height="360"');
  });

  it('derives the height from an aspect ratio, so the reservation survives a resize', async () => {
    const markup = await html(<Image src="/hero.jpg" alt="A hero" width={1200} aspectRatio="16/9" />);

    expect(markup).toContain('width="1200"');
    expect(markup).toContain('height="675"');
  });

  it('takes a numeric ratio too', async () => {
    const markup = await html(<Image src="/hero.jpg" alt="A hero" width={800} aspectRatio={2} />);

    expect(markup).toContain('height="400"');
  });

  it('defaults sizes to the layout width, so the browser picks a candidate rather than the largest', async () => {
    const markup = await html(<Image src="/hero.jpg" alt="A hero" width={640} height={360} />);

    expect(markup).toContain('sizes="640px"');
  });

  it('lets a fluid image state its own sizes', async () => {
    const markup = await html(
      <Image src="/hero.jpg" alt="A hero" width={1200} height={800} sizes="(max-width: 60rem) 100vw, 60rem" />,
    );

    expect(markup).toContain('sizes="(max-width: 60rem) 100vw, 60rem"');
    expect(markup).not.toContain('sizes="1200px"');
  });

  it('lazy-loads by default — an image below the fold is not worth a connection', async () => {
    const markup = await html(<Image src="/hero.jpg" alt="A hero" width={640} height={360} />);

    expect(markup).toContain('loading="lazy"');
    expect(markup).toContain('decoding="async"');
    expect(markup).not.toContain('fetchPriority');
  });

  it('drops the lazy hints for a priority image, which is usually the LCP element', async () => {
    const markup = await html(<Image src="/hero.jpg" alt="A hero" width={640} height={360} priority />);

    expect(markup).toContain('loading="eager"');
    expect(markup).toContain('fetchPriority="high"');
  });

  it('passes class and style through, because layout is the app\'s business', async () => {
    const markup = await html(
      <Image src="/hero.jpg" alt="A hero" width={640} height={360} class="card" style={{ borderRadius: '8px' }} />,
    );

    expect(markup).toContain('class="card"');
    expect(markup).toContain('style="border-radius:8px"');
  });

  it('emits no script, no marker and no island — an image hydrates nothing', async () => {
    const markup = await html(<Image src="/hero.jpg" alt="A hero" width={640} height={360} />);

    expect(markup).not.toContain('<script');
    expect(markup).not.toContain('data-jx');
  });
});

describe('<Image> on a source it cannot optimize', () => {
  it('renders a plain img for an svg — already optimal, and rasterizing it would be a downgrade', async () => {
    const markup = await html(<Image src="/logo.svg" alt="Logo" width={64} height={64} />);

    expect(markup).not.toContain('<picture>');
    expect(markup).toContain('src="/logo.svg"');
    expect(markup).toContain('width="64"');
  });

  it('renders a plain img when the app opts out explicitly', async () => {
    const markup = await html(<Image src="/hero.jpg" alt="A hero" width={64} height={64} unoptimized />);

    expect(markup).not.toContain('<picture>');
    expect(markup).toContain('src="/hero.jpg"');
  });

  it('serves a remote image unoptimized when asked, keeping the box reserved', async () => {
    const markup = await html(
      <Image src="https://cdn.example.com/a.jpg" alt="Remote" width={300} height={200} unoptimized />,
    );

    expect(markup).toContain('src="https://cdn.example.com/a.jpg"');
    expect(markup).toContain('height="200"');
  });
});

/**
 * A wrong `<Image>` must fail where the author can see it, not quietly ship a
 * `srcset` of 404s or an image with no reserved box.
 */
describe('<Image> refuses what it cannot deliver', () => {
  it('refuses a remote source without an explicit opt-out, instead of linking variants it will never emit', () => {
    expect(() => Image({ src: 'https://cdn.example.com/a.jpg', alt: 'Remote', width: 300, height: 200 })).toThrow(
      /unoptimized/,
    );
  });

  it('refuses a source that is not app-rooted, because there is no file to optimize', () => {
    expect(() => Image({ src: 'hero.jpg', alt: 'Hero', width: 300, height: 200 })).toThrow(/public/);
  });

  it('refuses an aspect ratio it cannot read, rather than rendering a box of NaN', () => {
    expect(() => Image({ src: '/hero.jpg', alt: 'Hero', width: 300, aspectRatio: '16/0' as never })).toThrow(
      /aspectRatio/,
    );
  });
});
