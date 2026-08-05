import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { isBuilt, launchBrowser, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * The acceptance case for resumable streams: reload the docs site while the
 * copilot is mid-answer and the answer carries on instead of disappearing.
 *
 * Everything here is real except the model — the mount, the retention log, the
 * browser and the reload are the shipped ones. The provider is scripted through
 * `globalThis.fetch` because `startTestServer` runs the app *in this process*:
 * that puts a deterministic, pausable turn behind `/_janux/llm` with no
 * test-only code in the app itself, and it is the only way to hold a turn open
 * across a reload on purpose.
 */

const APP = appRoot('apps/docs');
const BUILT = isBuilt(APP);
const PAGE = '/docs/getting-started/what-is-janux';
const PROVIDER = 'https://openrouter.ai/api/v1/chat/completions';

/** Two halves, so the second can be proven to arrive after the page was thrown away. */
const FIRST = 'Islands are the interactive parts of a Janux page. ';
const SECOND = 'Everything else ships as plain HTML with no JavaScript at all.';

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;
const originalFetch = globalThis.fetch;
const savedEnv = new Map<string, string | undefined>();

/** Turns arriving at the fake provider, so a resume can be proven not to buy one. */
let turns = 0;
let releaseRest: (() => void) | undefined;
/** Resolves once the first half is on the wire — the moment it is safe to reload. */
let halfSent: Promise<void>;
let markHalfSent: (() => void) | undefined;

function scriptedTurn(): Response {
  const encoder = new TextEncoder();
  const rest = new Promise<void>((resolve) => {
    releaseRest = resolve;
  });
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const say = (content: string) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));

      // Paced like a real model rather than dumped at once: the panel throttles
      // painting to a few frames a second, so a burst would put one word on
      // screen and this suite would be asserting on the throttle.
      for (const word of FIRST.split(' ')) {
        say(`${word} `);
        await Bun.sleep(90);
      }
      markHalfSent?.();
      // The turn is deliberately still open here: the reload happens next, and
      // what it must not do is end it.
      await rest;
      say(SECOND);
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

beforeAll(async () => {
  savedEnv.set('OPENROUTER_API_KEY', process.env.OPENROUTER_API_KEY);
  process.env.OPENROUTER_API_KEY = 'test-key';
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);

    if (!url.startsWith(PROVIDER)) return originalFetch(input, init);
    turns += 1;

    return scriptedTurn();
  }) as typeof fetch;
  if (!BUILT) return;
  ({ url: BASE, stop } = await startTestServer(APP));
  browser = await launchBrowser();
});

afterAll(async () => {
  stop?.();
  globalThis.fetch = originalFetch;
  savedEnv.forEach((value, key) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
});

const answerText = (page: Page) =>
  page.evaluate(() => document.querySelector('.copilot-panel .chat li.assistant')?.textContent ?? '');

async function askSomething(page: Page): Promise<void> {
  await page.locator('.copilot-toggle').click();
  await page.waitForSelector('.copilot-panel input[name="text"]');
  // The copilot builds (and loads the docs index) before it will send.
  await page.waitForFunction(() => {
    const field = document.querySelector<HTMLInputElement>('.copilot-panel input[name="text"]');

    return field?.placeholder === 'Ask about Janux';
  });
  await page.fill('.copilot-panel input[name="text"]', 'What is an island?');
  await page.press('.copilot-panel input[name="text"]', 'Enter');
}

describe.skipIf(!BUILT)('the copilot answer survives a reload (apps/docs)', () => {
  it('carries on writing the answer the reload interrupted, without buying a second turn', async () => {
    const page = await browser!.newPage();

    halfSent = new Promise<void>((resolve) => {
      markHalfSent = resolve;
    });
    turns = 0;
    await page.goto(`${BASE}${PAGE}`, { waitUntil: 'networkidle' });
    await askSomething(page);
    await halfSent;
    // The half-written answer is on screen; this is the state a reload destroys.
    await page.waitForFunction((half) => {
      const node = document.querySelector('.copilot-panel .chat li.assistant');

      return (node?.textContent ?? '').includes(half);
    }, 'Islands are the interactive');

    expect(await answerText(page)).toContain('Islands are the interactive');

    await page.reload({ waitUntil: 'domcontentloaded' });
    // Reopened by the page itself: nothing in the test clicks Ask AI again.
    await page.waitForSelector('.copilot-panel .chat li.assistant', { timeout: 20_000 });
    // Only now does the rest of the turn get written, so the tail below is
    // provably generated after the page that asked for it was thrown away.
    releaseRest?.();

    await page.waitForFunction(
      (tail) => (document.querySelector('.copilot-panel .chat li.assistant')?.textContent ?? '').includes(tail),
      'plain HTML with no JavaScript',
      { timeout: 20_000 },
    );
    const resumed = await answerText(page);

    // The whole answer, both halves, in one bubble — the half written before the
    // reload and the half generated after it.
    expect(resumed).toContain('Islands are the interactive parts');
    expect(resumed).toContain('plain HTML with no JavaScript at all');
    // The question is back too, so the exchange reads as a conversation.
    expect(await page.textContent('.copilot-panel .chat li.user')).toBe('What is an island?');
    // The point of the whole feature: one turn was generated, not two.
    expect(turns).toBe(1);
    await page.close();
  }, TIMEOUT);

  /**
   * The same mechanism from the other direction: a tab that never asked the
   * question can still watch the answer, because the stream id is shared across
   * the origin and the mount will hand the turn to whoever owns it. Both tabs
   * live in one context on purpose — separate contexts do not share storage,
   * which is exactly the isolation this feature relies on elsewhere.
   */
  it('lets a second tab follow the answer the first one asked for', async () => {
    const context = await browser!.newContext();
    const first = await context.newPage();

    halfSent = new Promise<void>((resolve) => {
      markHalfSent = resolve;
    });
    turns = 0;
    await first.goto(`${BASE}${PAGE}`, { waitUntil: 'networkidle' });
    await askSomething(first);
    await halfSent;

    const second = await context.newPage();

    await second.goto(`${BASE}${PAGE}`, { waitUntil: 'domcontentloaded' });
    await second.waitForSelector('.copilot-panel .chat li.assistant', { timeout: 20_000 });
    releaseRest?.();

    await second.waitForFunction(
      (tail) => (document.querySelector('.copilot-panel .chat li.assistant')?.textContent ?? '').includes(tail),
      'plain HTML with no JavaScript',
      { timeout: 20_000 },
    );

    expect(await answerText(second)).toContain('Islands are the interactive parts');
    // One turn, two readers.
    expect(turns).toBe(1);
    await context.close();
  }, TIMEOUT);

  it('leaves a page with nothing in flight completely alone', async () => {
    // A fresh context: no shared storage, so there is genuinely nothing to resume.
    const context = await browser!.newContext();
    const page = await context.newPage();
    const before = turns;

    await page.goto(`${BASE}${PAGE}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // No panel, no bubbles, and above all no model call on an ordinary visit —
    // an eagerly mounted island must stay as quiet as a lazy one used to be.
    expect(await page.locator('.copilot-panel').count()).toBe(0);
    expect(turns).toBe(before);
    await context.close();
  }, TIMEOUT);
});
