import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser } from 'playwright';
import { TIMEOUT, appRoot, isBuilt, launchChrome, openPage, serveBuilt, ssrApp } from './support/app';

/**
 * Sass against the with-sass example. The claim under test is that naming the
 * entry `src/styles.scss` is the entire setup: the build has to compile it and
 * still emit the one sheet the shell links, `/styles.css`.
 */

const BUILT = isBuilt('examples/with-sass');
const ACCENTS = ['ocean', 'moss', 'ember', 'plum'];

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ base: BASE, stop } = await serveBuilt('examples/with-sass'));
  browser = await launchChrome();
});

afterAll(async () => {
  stop?.();
});

describe('sass SSR (examples/with-sass)', () => {
  it('links the compiled sheet at /styles.css, not the .scss entry', async () => {
    const { get } = await ssrApp('examples/with-sass');
    const html = await (await get('/')).text();

    const links = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(([tag]) => tag);

    expect(links).toHaveLength(1);
    expect(links[0]).toContain('href="/styles.css"');
    // The prose names the .scss entry; no <link> may point at it.
    expect(links[0]).not.toContain('.scss');
    expect(html).toContain('data-active="ocean"');
  });
});

describe.skipIf(!BUILT)('sass build output (examples/with-sass)', () => {
  const css = () => readFileSync(join(appRoot('examples/with-sass'), 'dist/client/styles.css'), 'utf8');

  it('generates every variant class from the @each loop', () => {
    const compiled = css();

    ACCENTS.forEach((accent) => expect(compiled).toContain(`.accent-${accent}`));
    expect(compiled).toContain('#d1442f');
  });

  it('leaves no Sass syntax behind: nesting is flattened and the mixin inlined', () => {
    const compiled = css();

    expect(compiled).toContain('main h1');
    expect(compiled).toContain('.card h2');
    expect(compiled).not.toContain('@each');
    expect(compiled).not.toContain('@mixin');
    expect(compiled).not.toContain('@use');
  });
});

describe.skipIf(!BUILT)('accent switching in Chrome (examples/with-sass)', () => {
  it('applies the generated class when the accent changes', async () => {
    const { page, errors } = await openPage(browser!);

    await page.goto(BASE);
    await page.waitForSelector('.card[data-active="ocean"]');

    const heading = () => page.evaluate(() => getComputedStyle(document.querySelector('.card h2')!).color);

    expect(await heading()).toBe('rgb(0, 98, 255)');

    await page.click('[data-accent="ember"]');
    await page.waitForSelector('.card[data-active="ember"]');
    expect(await heading()).toBe('rgb(209, 68, 47)');

    await page.click('[data-accent="plum"]');
    await page.waitForSelector('.card[data-active="plum"]');
    expect(await heading()).toBe('rgb(123, 63, 191)');
    expect(errors).toEqual([]);
  }, TIMEOUT);
});
