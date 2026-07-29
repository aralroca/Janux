import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser } from 'playwright';
import { TIMEOUT, isBuilt, launchChrome, openPage as newPage, serveBuilt, ssrApp } from './support/app';

/**
 * What examples/with-forms exists to demonstrate: one schema (str/int/money/
 * enums) drives the form UI, the api() endpoint and the agent tool. The form
 * intent receives FormData strings (the framework never coerces), converts and
 * validates them client-side for per-field errors, and delegates to the typed
 * api that persists — the same api an agent calls with real numbers.
 */

const APP = 'examples/with-forms';
const BUILT = isBuilt(APP);

let server: Awaited<ReturnType<typeof ssrApp>>['server'];
let get: Awaited<ReturnType<typeof ssrApp>>['get'];
let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

const post = (path: string, body: unknown) =>
  server.fetch(
    new Request(`http://test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const storedNames = async (base?: string) => {
  const url = `${base ?? 'http://test'}/_janux/api/registrations.listRegistrations`;
  const request = new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const body: any = await (base ? await fetch(request) : await server.fetch(request)).json();

  return body.result.registrations;
};

beforeAll(async () => {
  ({ server, get } = await ssrApp(APP));
  if (!BUILT) return;
  ({ base: BASE, stop } = await serveBuilt(APP));
  browser = await launchChrome();
});

afterAll(async () => {
  await browser?.close();
  stop?.();
});

describe('examples/with-forms server side', () => {
  it('renders the registration form server-side, idle and error-free', async () => {
    const html = await (await get('/')).text();

    expect(html).toContain('<title>Janux — validated forms</title>');
    expect(html).toContain('JanuxConf registration');
    ['name', 'attendees', 'donation', 'track'].forEach((field) => expect(html).toContain(`name="${field}"`));
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

    expect(stored).toMatchObject({ attendees: 4, donation: 500, track: 'backend' });
  });

  it('exposes both faces of the submit in the manifest, with their input schemas', async () => {
    const manifest: any = await (await get('/_janux/manifest')).json();
    const tools = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool]));
    const form = tools['registration.submit'];
    const typed = tools['api.registrations.register'];

    // The form's face: FormData semantics, every field a string.
    expect(form.guard).toBe('auto');
    expect(form.input.properties.attendees).toEqual({ type: 'string' });
    // The typed face: the same contract the server enforces, as JSON Schema.
    expect(typed.guard).toBe('auto');
    expect(typed.input.properties.name).toEqual({ type: 'string', minLength: 2, maxLength: 60 });
    expect(typed.input.properties.attendees).toEqual({ type: 'integer', minimum: 1, maximum: 8 });
    expect(typed.input.properties.donation).toEqual({ type: 'integer', format: 'money-minor-units', minimum: 0 });
    expect(typed.input.properties.track).toEqual({ enum: ['frontend', 'backend', 'ai'] });
    expect(typed.input.required).toEqual(['name', 'attendees', 'donation', 'track']);
  });
});

describe.skipIf(!BUILT)('examples/with-forms in the browser', () => {
  it('paints per-field errors on an invalid submit, without reloading', async () => {
    const { page, errors } = await newPage(browser!);

    await page.goto(`${BASE}/`);
    await page.evaluate(() => ((window as any).__samePage = true));
    await page.fill('input[name="name"]', 'A');
    await page.fill('input[name="attendees"]', '0');
    await page.fill('input[name="donation"]', '5');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-field="name"]');
    expect(await page.textContent('[data-field="name"]')).toBe('below min 2');
    expect(await page.textContent('[data-field="attendees"]')).toBe('below min 1');
    // No reload: the sentinel survives, and nothing was persisted.
    expect(await page.evaluate(() => (window as any).__samePage)).toBe(true);
    expect((await storedNames(BASE)).map((entry: any) => entry.name)).not.toContain('A');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('coerces the numeric inputs: the server stores a real int and cents', async () => {
    const { page, errors } = await newPage(browser!);

    await page.goto(`${BASE}/`);
    await page.fill('input[name="name"]', 'Ada Lovelace');
    await page.fill('input[name="attendees"]', '3');
    await page.fill('input[name="donation"]', '12.5');
    await page.selectOption('select[name="track"]', 'ai');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.ok');
    expect(await page.textContent('.ok')).toMatch(/ticket reg_\w+, spot #\d+/);
    const stored = (await storedNames(BASE)).find((entry: any) => entry.name === 'Ada Lovelace');

    expect(Number.isInteger(stored.attendees)).toBe(true);
    expect(stored).toMatchObject({ attendees: 3, donation: 1250, track: 'ai' });
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
