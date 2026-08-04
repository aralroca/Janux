import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser } from 'playwright';
import { isBuilt, launchBrowser, openPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * A picture authored at its intrinsic size — `width="1400"` on a 760px column —
 * pushes the whole document sideways, and takes the table of contents off the
 * screen with it. That is a layout fact, so no amount of asserting the markup
 * catches it: only an engine that has laid the page out can say the document
 * scrolls. It shipped that way on `/docs/more/templates`.
 *
 * The pages are found rather than listed: any page that grows an image is
 * covered here without anyone remembering to add it.
 */

const BUILT = isBuilt(appRoot('apps/docs'));
const CONTENT = join(appRoot('apps/docs'), 'content');
const ARTICLE = /<article[^>]*>([\s\S]*?)<\/article>/;
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

let stop: (() => void) | undefined;
let browser: Browser | undefined;
let BASE = '';
let pages: string[] = [];

beforeAll(async () => {
  if (!BUILT) return;
  const served = await startTestServer(appRoot('apps/docs'));

  BASE = served.url;
  stop = served.stop;
  browser = await launchBrowser();
  pages = await pagesRenderingAnImage();
}, TIMEOUT);

afterAll(() => {
  stop?.();
});

/** Every doc URL the content tree defines. */
function docPaths(): string[] {
  return readdirSync(CONTENT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((section) =>
      readdirSync(join(CONTENT, section.name))
        .filter((file) => file.endsWith('.md'))
        .map((file) => `/docs/${section.name}/${file.replace(/\.md$/, '')}`),
    );
}

/** …narrowed to the ones whose article really renders an `<img>` — a fenced example is only text. */
async function pagesRenderingAnImage(): Promise<string[]> {
  const rendered = await Promise.all(
    docPaths().map(async (path) => {
      const article = ARTICLE.exec(await (await fetch(`${BASE}${path}`)).text());

      return article?.[1]?.includes('<img') ? path : null;
    }),
  );

  return rendered.filter((path): path is string => path !== null);
}

describe.skipIf(!BUILT)('images fit the page they are on (apps/docs)', () => {
  it('has pages with images to check', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  VIEWPORTS.forEach(({ name, width, height }) => {
    it(
      `never makes the document scroll sideways on a ${name}`,
      async () => {
        const { page } = await openPage(browser!);
        const sideways: string[] = [];

        await page.setViewportSize({ width, height });

        for (const path of pages) {
          await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
          const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

          if (over > 0) sideways.push(`${path} +${over}px`);
        }

        await page.close();
        expect(sideways).toEqual([]);
      },
      TIMEOUT,
    );
  });

  /**
   * The half that is easy to lose: the width/height attributes stay on the tag
   * to reserve the box, so a `max-width` without `height: auto` narrows the
   * picture while keeping the authored height — squashed, not scaled.
   */
  it(
    'scales pictures instead of squashing them',
    async () => {
      const { page } = await openPage(browser!);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${BASE}${pages[0]}`, { waitUntil: 'load' });
      const drift = await page.$$eval('article img', async (nodes) => {
        const images = nodes as HTMLImageElement[];

        // Lazy and below the fold, so their natural size is not known yet.
        await Promise.all(
          images.map((img) => {
            img.loading = 'eager';

            return img.complete || new Promise((loaded) => img.addEventListener('load', loaded, { once: true }));
          }),
        );

        return images.map((img) => img.naturalWidth / img.naturalHeight - img.clientWidth / img.clientHeight);
      });

      await page.close();
      expect(drift.length).toBeGreaterThan(0);
      drift.forEach((off) => expect(Math.abs(off)).toBeLessThan(0.01));
    },
    TIMEOUT,
  );
});
