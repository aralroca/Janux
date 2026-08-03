import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser } from 'playwright';
import { TIMEOUT, appRoot, isBuilt, launchBrowser, openPage, serveBuilt } from './support/app';

/**
 * The acceptance test for the image primitive, against the archetype that needs
 * it most: `output: "static"`, where there is no server left to optimize
 * anything at request time.
 *
 * The two claims are (1) the build emits variants the HTML actually references
 * — checked by resolving every candidate on the page against the filesystem,
 * not by trusting a naming convention — and (2) a page whose above-the-fold
 * image is 675px tall still measures CLS 0 in a real Chrome.
 */

const APP = 'examples/with-images';
const DIST = join(appRoot(APP), 'dist/client');
const BUILT = isBuilt(APP);

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ base: BASE, stop } = await serveBuilt(APP));
  browser = await launchBrowser();
});

afterAll(() => stop?.());

const distPage = () => readFileSync(join(DIST, 'index.html'), 'utf8');
const matches = (pattern: RegExp) => [...distPage().matchAll(pattern)].map((match) => match[1]!);
/** Every candidate URL on the page, across every `srcset`. */
const candidates = () => matches(/srcSet="([^"]*)"/g).flatMap((set) => set.split(', ').map((part) => part.split(' ')[0]!));

describe.if(BUILT)(`${APP}: what the static build leaves on disk`, () => {
  it('references only variants that exist — no candidate on the page can 404', () => {
    const missing = [...new Set(candidates())].filter((url) => !existsSync(join(DIST, url.slice(1))));

    expect(candidates().length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('offers avif and webp for every optimized image, original kept as the fallback', () => {
    const urls = candidates();

    expect(urls.some((url) => url.endsWith('.avif'))).toBe(true);
    expect(urls.some((url) => url.endsWith('.webp'))).toBe(true);
    expect(distPage()).toContain('src="/photos/aurora.jpg"');
    expect(existsSync(join(DIST, 'photos/aurora.jpg'))).toBe(true);
  });

  it('is smaller in avif than the source it came from', () => {
    const source = Bun.file(join(DIST, 'photos/aurora.jpg')).size;

    expect(Bun.file(join(DIST, '_janux/image/photos/aurora.jpg/1280.avif')).size).toBeLessThan(source);
  });

  /** The anti-CLS contract, asserted on the markup: no `<img>` may ship without its box. */
  it('gives every img a width and a height', () => {
    const tags = [...distPage().matchAll(/<img[^>]*>/g)].map((match) => match[0]);

    expect(tags.length).toBeGreaterThan(0);
    expect(tags.filter((tag) => !/width="\d+"/.test(tag) || !/height="\d+"/.test(tag))).toEqual([]);
  });

  it('loads the hero eagerly at high priority and everything else lazily', () => {
    expect(distPage()).toContain('loading="eager"');
    expect(distPage()).toContain('fetchPriority="high"');
    expect(distPage().match(/loading="lazy"/g)?.length).toBeGreaterThan(1);
  });

  it('ships no client runtime — an image hydrates nothing', () => {
    expect(distPage()).not.toContain('<script type="module"');
    expect(existsSync(join(DIST, 'client.js'))).toBe(false);
  });
});

describe.if(BUILT)(`${APP}: in a real browser`, () => {
  it(
    'picks a modern variant rather than the original',
    async () => {
      const { page } = await openPage(browser!);

      await page.goto(BASE, { waitUntil: 'load' });
      const current = await page.locator('.hero img').evaluate((img: HTMLImageElement) => img.currentSrc);

      expect(current).toContain('/_janux/image/photos/aurora.jpg/');
      expect(current.endsWith('.avif') || current.endsWith('.webp')).toBe(true);
      await page.close();
    },
    TIMEOUT,
  );

  it(
    'shifts nothing while it loads, above the fold included',
    async () => {
      const { page, errors } = await openPage(browser!);

      await page.addInitScript(() => {
        (window as any).__cls = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as any[]) if (!entry.hadRecentInput) (window as any).__cls += entry.value;
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForLoadState('networkidle');

      expect(await page.evaluate(() => (window as any).__cls)).toBe(0);
      expect(errors).toEqual([]);
      await page.close();
    },
    TIMEOUT,
  );
});

/**
 * The other half of CLS. A webfont that swaps in at a different width reflows
 * every line it touches, so the build ships the file itself, preloads it, and
 * declares a fallback stretched to the real font's metrics — all of it inside a
 * static export, with no server to produce any of it at request time.
 */
describe.if(BUILT)(`${APP}: the self-hosted font`, () => {
  it('prerenders the preload and the @font-face, ahead of the stylesheet', () => {
    const html = distPage();
    const preload = /<link rel="preload" id="jx-font-0" href="([^"]+)"[^>]*as="font"[^>]*crossorigin>/.exec(html);

    expect(preload?.[1]).toMatch(/^\/_janux\/font\/.+\.woff2$/);
    expect(html.indexOf('id="jx-fonts"')).toBeLessThan(html.indexOf('id="jx-style-0"'));
    expect(existsSync(join(DIST, preload![1]!.slice(1)))).toBe(true);
  });

  it('adjusts the fallback with metrics read from the file it shipped', () => {
    expect(distPage()).toContain("@font-face{font-family:'Inter Fallback';src:local('Arial');");
    expect(distPage()).toMatch(/size-adjust:[\d.]+%;ascent-override:[\d.]+%;descent-override:[\d.]+%/);
  });

  it('self-hosts one file for both declared weights, and links it from both', () => {
    const files = readdirSync(join(DIST, '_janux/font')).filter((name) => name.endsWith('.woff2'));
    const faces = distPage().match(/@font-face\{font-family:'Inter';/g);

    expect(files).toHaveLength(1);
    expect(faces).toHaveLength(2);
  });

  it(
    'renders in the real font, with the fallback stretched to match',
    async () => {
      const { page } = await openPage(browser!);

      await page.goto(BASE, { waitUntil: 'networkidle' });
      const used = await page.evaluate(() => {
        const loaded = [...(document.fonts as any)].filter((face: any) => face.status === 'loaded');

        return {
          families: loaded.map((face: any) => face.family),
          body: getComputedStyle(document.body).fontFamily,
        };
      });

      expect(used.families).toContain('Inter');
      expect(used.body).toContain('Inter');
      await page.close();
    },
    TIMEOUT,
  );
});
