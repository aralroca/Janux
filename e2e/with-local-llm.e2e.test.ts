import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { TIMEOUT, isBuilt, launchChrome, openPage, serveBuilt, ssrApp } from './support/app';

/**
 * What examples/with-local-llm exists to demonstrate: a copilot whose model
 * runs in the visitor's browser (localLlm over WebGPU) with serverLlm as the
 * fallback, swappable at runtime. Headless CI has no usable WebGPU, so these
 * tests exercise the MECHANICS — detection, fallback, toggle, consent gate and
 * clean degradation — by forcing `navigator.gpu` on/off. The real WebGPU run
 * is the README's manual check.
 */

const BUILT = isBuilt('examples/with-local-llm');
/** Everything `resolveModel` reads — scrubbed so `/_janux/llm` answers its setup card deterministically. */
const MODEL_ENV = ['JANUX_MODEL', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'OPENROUTER_API_KEY'];
const savedEnv = new Map<string, string | undefined>();

let server: Awaited<ReturnType<typeof ssrApp>>['server'];
let get: Awaited<ReturnType<typeof ssrApp>>['get'];
let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

const withoutWebGpu = (page: Page) =>
  page.addInitScript(() => {
    delete (Navigator.prototype as any).gpu;
  });

const withWebGpu = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({}) });
  });

const assistantMessages = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('#log .msg.assistant')].map((node) => node.textContent ?? ''));

beforeAll(async () => {
  MODEL_ENV.forEach((key) => {
    savedEnv.set(key, process.env[key]);
    delete process.env[key];
  });
  ({ server, get } = await ssrApp('examples/with-local-llm'));
  if (!BUILT) return;
  ({ base: BASE, stop } = await serveBuilt('examples/with-local-llm'));
  browser = await launchChrome();
});

afterAll(() => {
  stop?.();
  savedEnv.forEach((value, key) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
});

describe('examples/with-local-llm server side', () => {
  it('renders the task list and the copilot shell server-side, cloud-neutral', async () => {
    const html = await (await get('/')).text();

    expect(html).toContain('<title>Janux — local LLM copilot</title>');
    ['Ship the release notes', 'Review the onboarding PR', 'Book the offsite room'].forEach((task) =>
      expect(html).toContain(task),
    );
    expect(html).toContain('id="assistant-panel"');
    expect(html).toContain('id="brain-local"');
    expect(html).toContain('id="brain-cloud"');
    // SSR cannot know what the browser can run — it ships the neutral shell.
    expect(html).toContain('data-model-state="cloud"');
    expect(html).toContain('data-jxreset');
  });

  it('exposes the task tools to agents — and never the chat panel', async () => {
    const manifest: any = await (await get('/_janux/manifest')).json();
    const names = manifest.tools.map((tool: any) => tool.name);
    const toggle = manifest.tools.find((tool: any) => tool.name === 'tasks.toggle');

    expect(names).toContain('tasks.add');
    expect(names).toContain('tasks.toggle');
    expect(names).toContain('tasks.clearDone');
    expect(toggle.input.required).toEqual(['title']);
    // Every copilot intent is `forbidden`: the agent must not talk to itself.
    expect(names.filter((name: string) => name.startsWith('copilot.'))).toEqual([]);
  });

  it('answers /_janux/llm with the setup card when no model is configured', async () => {
    const response = await server.fetch(
      new Request('http://test/_janux/llm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      }),
    );
    const body: any = await response.json();

    expect(response.status).toBe(503);
    expect(body.type).toBe('setup');
    expect(body.message).toContain('JANUX_MODEL');
  });
});

describe.skipIf(!BUILT)('examples/with-local-llm in the browser', () => {
  it('without WebGPU, supportsLocalLlm() sends the panel to the cloud brain', async () => {
    const { page, errors } = await openPage(browser!);

    await withoutWebGpu(page);
    await page.goto(`${BASE}/`);
    await page.waitForSelector('#model-status[data-model-state="cloud"]');
    expect(await page.getAttribute('#assistant-panel', 'data-brain')).toBe('cloud');
    expect(await page.isDisabled('#brain-local')).toBe(true);
    expect(await page.textContent('#model-status')).toContain('No WebGPU');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('with WebGPU, it defaults to local — and never downloads without consent', async () => {
    const { page, errors } = await openPage(browser!);
    const downloads: string[] = [];

    page.on('request', (request) => request.url().includes('huggingface') && downloads.push(request.url()));
    await withWebGpu(page);
    await page.goto(`${BASE}/`);
    await page.waitForSelector('#model-status[data-model-state="idle"]');
    expect(await page.getAttribute('#assistant-panel', 'data-brain')).toBe('local');
    expect(await page.textContent('#load-model')).toContain('0.5');
    // A chat message in local mode asks for the download instead of starting it.
    await page.fill('form.ask input[name="text"]', 'add a task called buy oat milk');
    await page.click('form.ask button[type="submit"]');
    await page.waitForFunction(() => document.querySelectorAll('#log .msg.assistant').length >= 2);
    expect((await assistantMessages(page)).at(-1)).toContain('Load model');
    expect(downloads).toEqual([]);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the toggle swaps the brain at runtime, both ways', async () => {
    const { page, errors } = await openPage(browser!);

    await withWebGpu(page);
    await page.goto(`${BASE}/`);
    await page.waitForSelector('#model-status[data-model-state="idle"]');
    await page.click('#brain-cloud');
    await page.waitForSelector('#model-status[data-model-state="cloud"]');
    expect(await page.getAttribute('#assistant-panel', 'data-brain')).toBe('cloud');
    await page.click('#brain-local');
    await page.waitForSelector('#model-status[data-model-state="idle"]');
    expect(await page.getAttribute('#assistant-panel', 'data-brain')).toBe('local');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the cloud path without a key degrades to the setup card in the chat, no crash', async () => {
    const { page, errors } = await openPage(browser!);

    await withoutWebGpu(page);
    await page.goto(`${BASE}/`);
    await page.waitForSelector('#model-status[data-model-state="cloud"]');
    await page.fill('form.ask input[name="text"]', 'what is still open?');
    await page.click('form.ask button[type="submit"]');
    await page.waitForFunction(() => document.querySelectorAll('#log .msg.assistant').length >= 2);
    expect((await assistantMessages(page)).at(-1)).toContain('No model configured');
    // The panel stays usable: the failed run released the busy gate.
    expect(await page.getAttribute('form.ask input[name="text"]', 'placeholder')).not.toContain('Thinking');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
