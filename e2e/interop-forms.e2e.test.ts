import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { createTestApp, isBuilt, launchBrowser, openPage as newPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

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

const APP = appRoot('examples/interop-forms');
const BUILT = isBuilt(APP);

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ url: BASE, stop } = await startTestServer(APP));
  browser = await launchBrowser();
});

afterAll(async () => {
  stop?.();
});

const openPage = () => newPage(browser!);
const status = (page: Page) => page.locator('.signup-shell .signup-status').textContent();

describe('examples/interop-forms server side', () => {
  it('server-renders the form fields', async () => {
    const app = await createTestApp(APP);
    const html = await (await app.fetch('/')).text();

    expect(html).toContain('<janux-foreign');
    expect(html).toContain('signup-form');
    expect(html).toContain('class="signup"');
    expect(html).toContain('name="email"');
    expect(html).toContain('draft: — &lt;—&gt; on free');
  });

  it('exposes fill and submit as the agent surface, submit guarded', async () => {
    const app = await createTestApp(APP);
    const manifest: any = await (await app.fetch('/_janux/manifest')).json();
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

  it('the longest example payload stays inside its card', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.tool-row:has-text("signup.submit") code.example');

    // `signup.submit` carries the widest payload in the matrix, so it is the one
    // that shows an `inline-block` code block refusing to wrap.
    const overflow = await page.evaluate(() => {
      const row = [...document.querySelectorAll('.tool-row')].find((node) =>
        node.textContent?.includes('signup.submit'),
      )!;
      const code = row.querySelector('code.example')!;

      return {
        codeRight: Math.round(code.getBoundingClientRect().right),
        rowRight: Math.round(row.getBoundingClientRect().right),
        rowScroll: row.scrollWidth - row.clientWidth,
      };
    });

    expect(overflow.codeRight).toBeLessThanOrEqual(overflow.rowRight);
    expect(overflow.rowScroll).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the generated submit payload is a real signup, email included', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.tool-row:has-text("signup.submit") code.example');

    const example = await page.locator('.tool-row:has-text("signup.submit") code.example').textContent();
    const payload = JSON.parse(example ?? '{}');

    // The panel builds this from the schema. A generic "example" in an email
    // field makes the demo button submit a signup that could never be real.
    expect(payload.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    expect(payload.name).not.toBe('example');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('refuses an invalid email from the agent, which never went through zod', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.signup');

    // zod validates the HUMAN path, inside React. An agent calling the intent
    // is a second door onto the same state, and it has to be shut too.
    const outcome = await page.evaluate(async () => {
      const jx: any = (window as any).janux;
      const proposal: any = await jx.call('signup.submit', { name: 'Ada', email: 'nope', plan: 'free' });

      return await jx
        .approve(proposal.id)
        .then(() => 'accepted')
        .catch((error: unknown) => String(error));
    });

    expect(outcome).not.toBe('accepted');
    expect(outcome).toContain('nope');
    // Nobody was signed up.
    expect(await status(page)).toContain('draft:');
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
