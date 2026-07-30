import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { TIMEOUT, isBuilt, launchChrome, openPage as newPage, serveBuilt, ssrApp } from './support/app';

/**
 * The forms category: `react-hook-form` + `zod` mounted unchanged.
 *
 * The honest ⚠️ of the matrix. RHF keeps its own copy of the form state in
 * uncontrolled inputs — that is exactly why it is fast — so the island is NOT
 * the single owner here, and an agent writing the draft would be invisible to a
 * form that never re-reads it. The reconciliation is explicit (`reset(draft)` on
 * a new draft identity) rather than hidden, and this suite is what proves it
 * actually reaches the DOM.
 */

const APP = 'examples/interop-forms';
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
  stop?.();
});

const openPage = () => newPage(browser!);
const status = (page: Page) => page.locator('.signup-shell .signup-status').textContent();

describe('examples/interop-forms server side', () => {
  it('server-renders the form fields', async () => {
    const { get } = await ssrApp(APP);
    const html = await (await get('/')).text();

    expect(html).toContain('<janux-foreign');
    expect(html).toContain('signup-form');
    expect(html).toContain('class="signup"');
    expect(html).toContain('name="email"');
    expect(html).toContain('draft: — &lt;—&gt; on free');
  });

  it('exposes fill and submit as the agent surface, submit guarded', async () => {
    const { get } = await ssrApp(APP);
    const manifest: any = await (await get('/_janux/manifest')).json();
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards['signup.fill']).toBe('auto');
    // Signing someone up is a propose-don't-do action.
    expect(guards['signup.submit']).toBe('confirm');

    const fill = manifest.tools.find((tool: any) => tool.name === 'signup.fill');

    expect(fill.input.properties.field.enum).toEqual(['name', 'email', 'plan']);
  });
});

describe.skipIf(!BUILT)('examples/interop-forms in the browser', () => {
  it('zod validation stays entirely inside React', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.signup');
    await page.fill('input[name="name"]', 'A');
    await page.fill('input[name="email"]', 'not-an-email');
    await page.click('.submit');

    // The messages are zod's, rendered by RHF — Janux is not involved, and
    // nothing was submitted.
    await page.waitForSelector('.error');
    expect(await page.locator('.error').allTextContents()).toEqual([
      'Name needs at least 2 characters',
      'That is not an email address',
    ]);
    expect(await status(page)).toContain('draft:');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('a human submit runs the guarded intent directly', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.signup');
    await page.fill('input[name="name"]', 'Ada');
    await page.fill('input[name="email"]', 'ada@example.com');
    await page.selectOption('select[name="plan"]', 'pro');
    await page.click('.submit');

    // `confirm` parks an AGENT call as a proposal; a human click is the human
    // approval, so it executes.
    await page.waitForFunction(
      () => document.querySelector('.signup-shell .signup-status')?.textContent?.startsWith('accepted:'),
      null,
      { timeout: 5_000 },
    );
    expect(await status(page)).toBe('accepted: Ada <ada@example.com> on pro');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('an agent fill reaches the uncontrolled input, which is the whole caveat', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.signup');
    await page.waitForSelector('.tool-row:has-text("signup.fill") button');

    const example = await page.locator('.tool-row:has-text("signup.fill") code.example').textContent();
    const target = JSON.parse(example ?? '{}');

    await page.click('.tool-row:has-text("signup.fill") button');
    // RHF's inputs are uncontrolled: without the explicit reconciliation this
    // value would live in island state and never appear on screen.
    await page.waitForFunction(
      (want) => (document.querySelector(`[name="${want.field}"]`) as HTMLInputElement)?.value === want.value,
      target,
      { timeout: 5_000 },
    );
    expect(await status(page)).toContain(target.value);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('an agent submit parks as a proposal until a human approves it', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.signup');
    await page.waitForSelector('.tool-row:has-text("signup.submit") button');
    await page.click('.tool-row:has-text("signup.submit") button');

    await page.waitForSelector('.proposal-card');
    // Proposed, not executed: nobody has been signed up.
    expect(await status(page)).toContain('draft:');

    await page.click('.proposal-card button.approve');
    await page.waitForFunction(
      () => document.querySelector('.signup-shell .signup-status')?.textContent?.startsWith('accepted:'),
      null,
      { timeout: 5_000 },
    );
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
