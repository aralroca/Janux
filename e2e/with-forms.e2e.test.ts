import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser } from 'playwright';
import { createTestApp, isBuilt, launchBrowser, openPage as newPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * What examples/with-forms exists to demonstrate: ONE typed schema (str/int/
 * num/bool/enums) drives the form UI, the api() endpoint and the agent tool.
 * The form intent declares `coerce: 'form'`, so the strings FormData submits
 * are converted to what that schema means before the usual validation — and
 * the same intent accepts an agent's typed JSON, announced as such in the
 * manifest. Native HTML attributes mirror the schema for the human UX; the
 * schema stays the contract when they are bypassed.
 */

const APP = appRoot('examples/with-forms');
const BUILT = isBuilt(APP);

let app: Awaited<ReturnType<typeof createTestApp>>;
let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

const post = (path: string, body: unknown) =>
  app.server.fetch(
    new Request(`http://test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify(body),
    }),
  );

const storedNames = async (base?: string) => {
  const url = `${base ?? 'http://test'}/_janux/api/registrations.listRegistrations`;
  const request = new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    body: '{}',
  });
  const body: any = await (base ? await fetch(request) : await app.server.fetch(request)).json();

  return body.result.registrations;
};

beforeAll(async () => {
  app = await createTestApp(APP);
  if (!BUILT) return;
  ({ url: BASE, stop } = await startTestServer(APP));
  browser = await launchBrowser();
});

afterAll(async () => {
  stop?.();
});

describe('examples/with-forms server side', () => {
  it('renders the registration form server-side, idle and error-free', async () => {
    const html = await (await app.fetch('/')).text();

    expect(html).toContain('<title>Janux — validated forms</title>');
    expect(html).toContain('JanuxConf registration');
    ['name', 'attendees', 'donation', 'newsletter', 'track'].forEach((field) =>
      expect(html).toContain(`name="${field}"`),
    );
    ['frontend', 'backend', 'ai'].forEach((track) => expect(html).toContain(`<option value="${track}">`));
    expect(html).not.toContain('class="error"');
  });

  it('rejects an invalid POST with 400 and per-field paths, persisting nothing', async () => {
    const payload = { name: 'A', attendees: 2.5, donation: -50, track: 'cooking' };
    const response = await post('/_janux/api/registrations.register', payload);
    const body: any = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('name: below min 2');
    expect(body.error).toContain('attendees: expected int');
    expect(body.error).toContain('donation: below min 0');
    expect(body.error).toContain('track: expected one of: frontend, backend, ai');
    expect((await storedNames()).map((entry: any) => entry.name)).not.toContain('A');
  });

  it('persists a valid POST and answers the typed receipt', async () => {
    const payload = { name: 'Grace Hopper', attendees: 4, donation: 500, track: 'backend' };
    const body: any = await (await post('/_janux/api/registrations.register', payload)).json();

    expect(body.ok).toBe(true);
    expect(body.result.id).toMatch(/^reg_/);
    expect(body.result.spot).toBeGreaterThanOrEqual(1);
    const stored = (await storedNames()).find((entry: any) => entry.name === 'Grace Hopper');

    // The absent checkbox took its schema default — the api never coerces.
    expect(stored).toMatchObject({ attendees: 4, donation: 500, newsletter: false, track: 'backend' });
  });

  it('announces the SAME typed schema for the form intent and the api tool', async () => {
    const manifest: any = await (await app.fetch('/_janux/manifest')).json();
    const tools = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool]));
    const form = tools['registration.submit'];
    const typed = tools['api.registrations.register'];

    // `coerce: 'form'` never leaks into the contract: the agent sees real types.
    expect(form.guard).toBe('auto');
    expect(form.input).toEqual(typed.input);
    expect(typed.guard).toBe('auto');
    expect(typed.input.properties.name).toEqual({ type: 'string', minLength: 2, maxLength: 60 });
    expect(typed.input.properties.attendees).toEqual({ type: 'integer', minimum: 1, maximum: 8 });
    expect(typed.input.properties.donation).toEqual({ type: 'number', minimum: 0 });
    expect(typed.input.properties.newsletter).toEqual({ type: 'boolean', default: false });
    expect(typed.input.properties.track).toEqual({ enum: ['frontend', 'backend', 'ai'] });
    expect(typed.input.required).toEqual(['name', 'attendees', 'donation', 'track']);
  });
});

describe.skipIf(!BUILT)('examples/with-forms in the browser', () => {
  it('the schema-mirroring attributes block an invalid submit natively, without reloading', async () => {
    const { page, errors } = await newPage(browser!);

    await page.goto(`${BASE}/`);
    await page.evaluate(() => ((window as any).__samePage = true));
    await page.fill('input[name="name"]', 'A');
    await page.fill('input[name="attendees"]', '0');
    await page.fill('input[name="donation"]', '5');
    await page.click('button[type="submit"]');
    // min={1} mirrors int().min(1): the browser refuses before any intent runs.
    expect(await page.$eval('form', (form: any) => form.checkValidity())).toBe(false);
    expect(await page.evaluate(() => (window as any).__samePage)).toBe(true);
    expect((await storedNames(BASE)).map((entry: any) => entry.name)).not.toContain('A');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the schema still rejects when markup validation is bypassed — no reload, nothing stored', async () => {
    const { page, errors } = await newPage(browser!);

    await page.goto(`${BASE}/`);
    await page.evaluate(() => ((window as any).__samePage = true));
    await page.fill('input[name="name"]', 'Zed');
    await page.fill('input[name="attendees"]', '0');
    await page.fill('input[name="donation"]', '5');
    const detail = await page.evaluate(
      () =>
        new Promise((resolve) => {
          document.addEventListener('janux:error', (event: any) => resolve(event.detail), { once: true });
          const form = document.querySelector('form')!;

          form.noValidate = true;
          form.requestSubmit();
        }),
    );

    // "0" was coerced to 0 — and the schema, not the markup, had the final word.
    expect(String(detail)).toContain('attendees: below min 1');
    expect(await page.evaluate(() => (window as any).__samePage)).toBe(true);
    expect((await storedNames(BASE)).map((entry: any) => entry.name)).not.toContain('Zed');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('coerces the form strings: the server stores a real int, number and boolean', async () => {
    const { page, errors } = await newPage(browser!);

    await page.goto(`${BASE}/`);
    await page.fill('input[name="name"]', 'Ada Lovelace');
    await page.fill('input[name="attendees"]', '3');
    await page.fill('input[name="donation"]', '12.5');
    await page.check('input[name="newsletter"]');
    await page.selectOption('select[name="track"]', 'ai');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.ok');
    expect(await page.textContent('.ok')).toMatch(/ticket reg_\w+, spot #\d+/);
    const stored = (await storedNames(BASE)).find((entry: any) => entry.name === 'Ada Lovelace');

    expect(Number.isInteger(stored.attendees)).toBe(true);
    expect(stored).toMatchObject({ attendees: 3, donation: 12.5, newsletter: true, track: 'ai' });
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
