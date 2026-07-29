import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { TIMEOUT, isBuilt, launchChrome, openPage as newPage, serveBuilt, ssrApp } from './support/app';

/**
 * What examples/interop-react exists to demonstrate: a plain React component
 * (hooks included) mounted unchanged through `foreign()` inside a
 * `<janux-foreign>` host. The state and the intents stay Janux — React renders
 * `state.bands` as props and its `onBand` callback dispatches the `setBand`
 * intent, so a slider move round-trips React → intent → state → props → React.
 */

const APP = 'examples/interop-react';
const BUILT = isBuilt(APP);

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ base: BASE, stop } = await serveBuilt(APP));
  browser = await launchChrome();
});

afterAll(async () => {
  await browser?.close();
  stop?.();
});

const openPage = () => newPage(browser!);

const levels = (page: Page) => page.locator('.mixer-shell .levels').textContent();

/** React ignores programmatic `.value` writes; the native setter + input event is what its onChange hears. */
const slideTo = (page: Page, index: number, value: string) =>
  page
    .locator('.mixer input[type="range"]')
    .nth(index)
    .evaluate((input, level) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;

      setter.call(input, level);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);

describe('examples/interop-react server side', () => {
  it('server-renders the React component inside the foreign host', async () => {
    const { get } = await ssrApp(APP);
    const html = await (await get('/')).text();

    expect(html).toContain('<janux-foreign');
    expect(html).toContain('mixer-canvas');
    // The React markup itself arrived from the server, before any JS ran.
    expect(html).toContain('class="mixer"');
    expect(html).toContain('type="range"');
    expect(html).toContain('low=5 mid=5 high=5');
  });

  it('exposes the Janux intents as the agent surface, reset guarded', async () => {
    const { get } = await ssrApp(APP);
    const manifest: any = await (await get('/_janux/manifest')).json();
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards['mixer.setBand']).toBe('auto');
    expect(guards['mixer.flat']).toBe('confirm');
  });
});

describe.skipIf(!BUILT)('examples/interop-react in the browser', () => {
  it('mounts React with working hooks: pressing a slider marks its band active', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    // `.band` markers only exist once the client React root mounted — waiting
    // on them (not on the SSR markup) is what proves hooks are live.
    await page.waitForFunction(() => document.querySelectorAll('.band').length === 3);
    expect(await page.locator('.band-active').count()).toBe(0);

    const slider = page.locator('.mixer input[type="range"]').first();

    await slider.dispatchEvent('pointerdown');
    await page.waitForFunction(() => document.querySelectorAll('.band-active').length === 1);
    await slider.dispatchEvent('pointerup');
    await page.waitForFunction(() => document.querySelectorAll('.band-active').length === 0);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('a React onChange dispatches the setBand intent and the state flows back as props', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.mixer input[type="range"]');
    await slideTo(page, 0, '9');

    // Janux state moved (the .levels line is Janux-rendered, not React)…
    await page.waitForFunction(
      () => document.querySelector('.mixer-shell .levels')?.textContent === 'low=9 mid=5 high=5',
      null,
      { timeout: 5_000 },
    );
    // …and flowed back into React as props: label text and slider value agree.
    expect(await page.locator('.band').first().textContent()).toContain('low: 9');
    expect(await page.locator('.mixer input[type="range"]').first().inputValue()).toBe('9');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the guarded flat intent stays a proposal until a human approves it', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.mixer input[type="range"]');
    await slideTo(page, 0, '9');
    await page.waitForFunction(
      () => document.querySelector('.mixer-shell .levels')?.textContent === 'low=9 mid=5 high=5',
      null,
      { timeout: 5_000 },
    );

    await page.waitForSelector('.tool-row:has-text("mixer.flat") button');
    await page.click('.tool-row:has-text("mixer.flat") button');
    await page.waitForSelector('.proposal-card');
    // Proposed, not executed: the bands did not move.
    expect(await levels(page)).toBe('low=9 mid=5 high=5');

    await page.click('.proposal-card button.approve');
    await page.waitForFunction(
      () => document.querySelector('.mixer-shell .levels')?.textContent === 'low=5 mid=5 high=5',
      null,
      { timeout: 5_000 },
    );
    // React re-rendered from the approved state change.
    expect(await page.locator('.mixer input[type="range"]').first().inputValue()).toBe('5');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
