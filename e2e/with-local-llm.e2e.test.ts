import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { TIMEOUT, isBuilt, launchBrowser, openPage, serveBuilt, ssrApp } from './support/app';

/**
 * What examples/with-local-llm exists to demonstrate: a copilot whose model
 * runs in the visitor's browser (localLlm over WebGPU) with serverLlm as the
 * fallback, swappable at runtime. Headless CI has no usable WebGPU, so these
 * tests fake `navigator.gpu` to exercise the mechanics — probe-based
 * detection (`probeLocalLlm` asks for a real adapter), fallback, toggle,
 * consent gate and clean degradation — plus one REAL local turn driven by a
 * scripted provider injected through `localLlm({ provider })`. Only the
 * actual GPU inference remains the README's manual check.
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

/** Headless CI's trap: `navigator.gpu` exists but no adapter is usable — the probe must land on cloud. */
const withUnusableWebGpu = (page: Page) =>
  page.addInitScript(() => {
    const gpu = { requestAdapter: async () => null };

    Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => gpu });
  });

/** A stable fake gpu whose probe succeeds — `probeLocalLlm` caches per `navigator.gpu` object. */
const withWebGpu = (page: Page) =>
  page.addInitScript(() => {
    const gpu = { requestAdapter: async () => ({}) };

    Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => gpu });
  });

/** The `localLlm({ provider })` seam: a transformers-js-shaped provider answering a two-turn script. */
const withScriptedProvider = (page: Page) =>
  page.addInitScript(() => {
    const usage = {
      inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 0, text: 0, reasoning: undefined },
      raw: undefined,
    };
    const reply = (content: unknown[]) => ({
      content,
      finishReason: { unified: 'stop', raw: undefined },
      usage,
      warnings: [],
    });
    const call = {
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'tasks_add',
      input: JSON.stringify({ title: 'buy oat milk' }),
    };
    let turn = 0;
    const model = {
      specificationVersion: 'v3',
      provider: 'stub',
      modelId: 'stub',
      supportedUrls: {},
      createSessionWithProgress: async (onProgress: (fraction: number) => void) => onProgress(1),
      doGenerate: async () =>
        turn++ === 0
          ? reply([call])
          : // Verbatim shape a chat-template model produces: reasoning block and
            // turn terminator around the answer. The user must never read them.
            reply([{ type: 'text', text: '<think>\nCall the tool.\n</think> Added "buy oat milk" to the list.<|im_end|>' }]),
    };

    (window as any).__localLlmProvider = { transformersJS: () => model };
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
  browser = await launchBrowser();
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
        // The browser-side agent loop calls this from the app's own page.
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
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
  it('headless-style WebGPU (gpu present, no usable adapter) probes to the cloud brain', async () => {
    const { page, errors } = await openPage(browser!);

    await withUnusableWebGpu(page);
    await page.goto(`${BASE}/`);
    await page.waitForSelector('#model-status[data-model-state="cloud"]');
    expect(await page.getAttribute('#assistant-panel', 'data-brain')).toBe('cloud');
    expect(await page.isDisabled('#brain-local')).toBe(true);
    expect(await page.textContent('#model-status')).toContain('No usable WebGPU');
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

  it('a real local turn end to end — a scripted provider stands in for the GPU model', async () => {
    const { page, errors } = await openPage(browser!);
    const downloads: string[] = [];

    page.on('request', (request) => request.url().includes('huggingface') && downloads.push(request.url()));
    await withWebGpu(page);
    await withScriptedProvider(page);
    await page.goto(`${BASE}/`);
    await page.waitForSelector('#model-status[data-model-state="idle"]');
    await page.click('#load-model');
    await page.waitForSelector('#model-status[data-model-state="ready"]');
    await page.fill('form.ask input[name="text"]', 'add a task called buy oat milk');
    await page.click('form.ask button[type="submit"]');
    await page.waitForFunction(() => document.querySelectorAll('#log .msg.assistant').length >= 2);
    // The model's tool call really ran: the task is on the list and the answer reports it.
    const answer = (await assistantMessages(page)).at(-1) ?? '';

    expect(answer).toContain('buy oat milk');
    // …and what the user reads is the answer, not the model's stage directions.
    expect(answer).not.toContain('<think>');
    expect(answer).not.toContain('im_end');
    expect(answer.trim().startsWith('Added')).toBe(true);
    expect(await page.textContent('#task-list')).toContain('buy oat milk');
    expect(downloads).toEqual([]);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the cloud path without a key degrades to the setup card in the chat, no crash', async () => {
    const { page, errors } = await openPage(browser!);

    await withUnusableWebGpu(page);
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
