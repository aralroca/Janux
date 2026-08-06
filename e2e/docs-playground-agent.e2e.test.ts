import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Page, type Browser } from 'playwright';
import { isBuilt, launchBrowser, openPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * The playground's whole promise is "this is what an agent sees" — and for a
 * long time an agent could see it without being able to touch it: the preview
 * runs in a sandboxed frame, so the example's intents were in that document's
 * manifest and not on this page's WebMCP surface. Ask AI, asked to press +1,
 * had nothing to call and narrated its way around the problem instead.
 *
 * So this drives the page the way an agent does: through
 * `document.modelContext`, the surface the docs advertise, with no clicking.
 */

const BUILT = isBuilt(appRoot('apps/docs'));

let stop: (() => void) | undefined;
let browser: Browser | undefined;
let BASE = '';

beforeAll(async () => {
  if (!BUILT) return;
  const served = await startTestServer(appRoot('apps/docs'));

  BASE = served.url;
  stop = served.stop;
  browser = await launchBrowser();
}, TIMEOUT);

afterAll(() => {
  stop?.();
});

/** The playground, with the example compiled and its agent panel rendered. */
async function openPlayground(): Promise<Page> {
  const { page } = await openPage(browser!);

  await page.goto(`${BASE}/playground`);
  await page.waitForSelector('#pg-agent .tool-row', { timeout: TIMEOUT });
  await page.frameLocator('#pg-preview iframe').locator('h1').waitFor({ timeout: TIMEOUT });

  return page;
}

const playgroundTools = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    (document as any).modelContext.listTools().map((tool: any) => tool.name).filter((name: string) => name.startsWith('playground_')),
  );

/** One tool call, exactly as a WebMCP client makes it. Returns the parsed result. */
async function callTool(page: Page, name: string, input: unknown): Promise<any> {
  const envelope: any = await page.evaluate(
    ([tool, args]) => (document as any).modelContext.callTool(tool, args),
    [name, input] as const,
  );

  return JSON.parse(envelope.content[0].text);
}

/**
 * A guarded call does not answer until a human decides, so it is started and
 * collected separately — holding an `evaluate` open across the click that
 * settles it is what the assertion would otherwise have to do.
 */
const startCall = (page: Page, name: string, input: unknown): Promise<void> =>
  page.evaluate(
    ([tool, args]) => {
      (window as any).__parked = (document as any).modelContext.callTool(tool, args);
    },
    [name, input] as const,
  );

const collectCall = async (page: Page): Promise<any> =>
  JSON.parse((await page.evaluate(() => (window as any).__parked)).content[0].text);

/** The copilot panel open and ready to be the approval surface. */
async function openChat(page: Page): Promise<void> {
  await page.click('.copilot-toggle');
  await page.waitForSelector('.copilot-panel input[name="text"]', { timeout: TIMEOUT });
}

const counter = (page: Page): Promise<string> =>
  page.frameLocator('#pg-preview iframe').locator('h1').innerText();

/** The preview repaints on its own clock; the assertion waits for it rather than racing it. */
const waitForCounter = (page: Page, value: string): Promise<unknown> =>
  page.waitForFunction(
    (expected) =>
      document.querySelector<HTMLIFrameElement>('#pg-preview iframe')!.contentDocument!.querySelector('h1')!
        .textContent === expected,
    value,
    { timeout: TIMEOUT },
  );

describe.skipIf(!BUILT)('an agent can operate the playground (apps/docs)', () => {
  it(
    'puts the preview frame\'s tools on this page, guards and all',
    async () => {
      const page = await openPlayground();

      expect(await playgroundTools(page)).toEqual([
        'playground_counter_inc',
        'playground_counter_dec',
        'playground_counter_reset',
      ]);
      const reset = await page.evaluate(
        () => (document as any).modelContext.listTools().find((tool: any) => tool.name === 'playground_counter_reset').description,
      );

      expect(reset).toContain('approve');
      await page.close();
    },
    TIMEOUT,
  );

  it(
    'runs the intent inside the frame and reports the state it caused',
    async () => {
      const page = await openPlayground();

      expect(await counter(page)).toBe('0');
      const result = await callTool(page, 'playground_counter_inc', { by: 3 });

      // The state rides back with the result: one round trip tells the model
      // what it did *and* what the page now looks like.
      expect(result.state).toEqual({ count: 3 });
      await waitForCounter(page, '3');
      await page.close();
    },
    TIMEOUT,
  );

  it(
    'moves the simulated cursor to the control it operated',
    async () => {
      const page = await openPlayground();

      await callTool(page, 'playground_counter_inc', { by: 1 });
      // Inside the frame, where the button is — the same feedback a real app gets.
      await page.waitForFunction(
        () =>
          document
            .querySelector<HTMLIFrameElement>('#pg-preview iframe')!
            .contentDocument!.getElementById('janux-agent-cursor')
            ?.classList.contains('on') === true,
        { timeout: TIMEOUT },
      );
      await page.close();
    },
    TIMEOUT,
  );

  it(
    'proposes instead of acting when the intent is confirm-guarded',
    async () => {
      const page = await openPlayground();

      await callTool(page, 'playground_counter_inc', { by: 2 });
      await startCall(page, 'playground_counter_reset', {});
      await page.waitForSelector('#pg-agent .proposal-card', { timeout: TIMEOUT });

      // Proposed, not run — and the caller is still waiting on the human.
      expect(await counter(page)).toBe('2');

      await page.click('#pg-agent .proposal-actions .approve');
      await waitForCounter(page, '0');

      expect((await collectCall(page)).approved).toBe(true);
      await page.close();
    },
    TIMEOUT,
  );

  it(
    'asks for the approval in the chat, and holds the call until the reader answers',
    async () => {
      const page = await openPlayground();

      await callTool(page, 'playground_counter_inc', { by: 4 });
      await openChat(page);
      await startCall(page, 'playground_counter_reset', {});
      // The complaint this fixes: the agent pane's card is behind the open chat.
      await page.waitForSelector('.copilot-panel .proposal-card', { timeout: TIMEOUT });

      expect(await counter(page)).toBe('4');

      await page.click('.copilot-panel .proposal-card .approve');
      await waitForCounter(page, '0');

      expect((await collectCall(page)).approved).toBe(true);
      expect(await page.locator('.copilot-panel .proposal-card').count()).toBe(0);
      await page.close();
    },
    TIMEOUT,
  );

  it(
    'runs nothing when the reader rejects it in the chat',
    async () => {
      const page = await openPlayground();

      await callTool(page, 'playground_counter_inc', { by: 5 });
      await openChat(page);
      await startCall(page, 'playground_counter_reset', {});
      await page.waitForSelector('.copilot-panel .proposal-card', { timeout: TIMEOUT });
      await page.click('.copilot-panel .proposal-card .reject');
      const result = await collectCall(page);

      expect(result.approved).toBe(false);
      expect(await counter(page)).toBe('5');
      await page.close();
    },
    TIMEOUT,
  );

  it(
    'swaps the surface with the example, and takes it away on the way out',
    async () => {
      const page = await openPlayground();
      const second = await page.evaluate(() => (document.querySelectorAll('#pg-example option')[1] as HTMLOptionElement).value);

      await page.selectOption('#pg-example', second);
      await page.waitForFunction(
        (previous) =>
          (document as any).modelContext
            .listTools()
            .every((tool: any) => tool.name !== previous),
        'playground_counter_inc',
        { timeout: TIMEOUT },
      );

      expect((await playgroundTools(page)).length).toBeGreaterThan(0);

      // Leaving the page must not leave tools behind pointing at a frame that is gone.
      await page.click('header a[href^="/docs"]');
      await page.waitForFunction(
        () => (document as any).modelContext.listTools().every((tool: any) => !tool.name.startsWith('playground_')),
        { timeout: TIMEOUT },
      );
      await page.close();
    },
    TIMEOUT,
  );
});

/**
 * The docs site is where both feedback layers are documented, so it has to run
 * them: it shipped the glow and not the cursor, and Ask AI switching the theme
 * moved nothing the reader could follow.
 */
describe.skipIf(!BUILT)('the docs site shows the agent cursor (apps/docs)', () => {
  it(
    'travels the cursor to the control a tool call operates',
    async () => {
      const { page } = await openPage(browser!);

      await page.goto(`${BASE}/docs/getting-started/what-is-janux`);
      await page.waitForFunction(() => Boolean((window as any).janux), { timeout: TIMEOUT });

      expect(await page.locator('#janux-agent-cursor').count()).toBe(0);
      await page.evaluate(() => (window as any).janux.call('theme.cycle', {}));
      await page.waitForSelector('#janux-agent-cursor.on', { timeout: TIMEOUT });
      await page.close();
    },
    TIMEOUT,
  );
});
