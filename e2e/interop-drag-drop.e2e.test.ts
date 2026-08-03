import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { createTestApp, isBuilt, launchChrome, openPage as newPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * The drag-and-drop category: `@dnd-kit/core` + `/sortable` mounted unchanged.
 *
 * The strongest case in the matrix for the mapped `on:` form. dnd-kit's drag
 * event is a live object graph — DOM rects, measuring nodes, a native event —
 * so forwarding `args[0]` raw as an intent input is not merely wrong, it is
 * unserializable. The mapper turns a drag into `board.move { id, toIndex }`,
 * which is also the tool an agent calls: reordering without dragging anything.
 */

const APP = appRoot('examples/interop-drag-drop');
const BUILT = isBuilt(APP);

let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

beforeAll(async () => {
  if (!BUILT) return;
  ({ url: BASE, stop } = await startTestServer(APP));
  browser = await launchChrome();
});

afterAll(async () => {
  stop?.();
});

const openPage = () => newPage(browser!);
const order = (page: Page) => page.locator('.board-shell .board-order').textContent();

/**
 * dnd-kit's keyboard drag commits in stages: the pickup has to be live before
 * an arrow key means anything, so the wait is on the library's own dragging
 * marker rather than on a sleep. The drop is observed by the caller, through
 * the order the intent produced.
 */
/** dnd-kit's PointerSensor needs real movement past its 4px activation distance. */
async function dragCard(page: Page, id: string, deltaY: number): Promise<void> {
  const box = (await page.locator(`.card[data-card="${id}"]`).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  // Past the activation distance first, and only then to the target: dnd-kit
  // starts measuring on activation, so one big jump can land before it does.
  await page.mouse.move(x, y + 8, { steps: 4 });
  await page.waitForSelector('.card-dragging');
  await page.mouse.move(x, y + deltaY, { steps: 20 });
  await page.mouse.up();
}

describe('examples/interop-drag-drop server side', () => {
  it('server-renders the sortable list with its accessibility wiring intact', async () => {
    const { fetch: get } = await createTestApp(APP);
    const html = await (await get('/')).text();

    expect(html).toContain('<janux-foreign');
    expect(html).toContain('sortable-board');
    expect(html).toContain('class="board"');
    // dnd-kit's own a11y contract survives the server render — this is what
    // "mounted unchanged" is supposed to mean.
    expect(html).toContain('aria-roledescription="sortable"');
    expect(html).toContain('triage → build → review → ship');
  });

  it('exposes move as the agent surface with the real card ids, reset guarded', async () => {
    const { fetch: get } = await createTestApp(APP);
    const manifest: any = await (await get('/_janux/manifest')).json();
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards['board.move']).toBe('auto');
    expect(guards['board.reset']).toBe('confirm');

    const move = manifest.tools.find((tool: any) => tool.name === 'board.move');

    expect(move.input.properties.id.enum).toEqual(['triage', 'build', 'review', 'ship']);
  });
});

describe.skipIf(!BUILT)('examples/interop-drag-drop in the browser', () => {
  it('a real drag lands as the move intent', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.card[data-card="triage"]');
    expect(await order(page)).toBe('triage → build → review → ship');

    // Down past two cards: dnd-kit resolves the drop target, the mapper turns
    // its live event into two ids, and the intent rewrites the order.
    await dragCard(page, 'triage', 140);
    await page.waitForFunction(
      () => document.querySelector('.board-shell .board-order')?.textContent !== 'triage → build → review → ship',
      null,
      { timeout: 5_000 },
    );
    const moved = await order(page);

    expect(moved).not.toBe('triage → build → review → ship');
    // Nothing was lost or duplicated on the way through the intent.
    expect(moved!.split(' → ').sort()).toEqual(['build', 'review', 'ship', 'triage']);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the agent reorders the board without dragging anything', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.card[data-card="ship"]');
    await page.waitForSelector('.tool-row:has-text("board.move") button');

    const example = await page.locator('.tool-row:has-text("board.move") code.example').textContent();
    const target = JSON.parse(example ?? '{}');

    await page.click('.tool-row:has-text("board.move") button');
    await page.waitForFunction(
      (want) => {
        const cards = [...document.querySelectorAll('.card')].map((card) => card.getAttribute('data-card'));

        return cards[want.toIndex] === want.id;
      },
      target,
      { timeout: 5_000 },
    );
    // React re-rendered from the agent's call — no pointer events involved —
    // and the call actually moved something.
    expect(await order(page)).not.toBe('triage → build → review → ship');
    expect((await order(page))!.split(' → ')[target.toIndex]).toBe(target.id);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the guarded reset stays a proposal until a human approves it', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.card[data-card="triage"]');
    // Set up through the tool rather than a drag: what this test is about is
    // the guard, and a pointer gesture would only add flake to that question.
    await page.waitForSelector('.tool-row:has-text("board.move") button');
    await page.click('.tool-row:has-text("board.move") button');
    await page.waitForFunction(
      () => document.querySelector('.board-shell .board-order')?.textContent !== 'triage → build → review → ship',
      null,
      { timeout: 5_000 },
    );
    const reordered = await order(page);

    await page.waitForSelector('.tool-row:has-text("board.reset") button');
    await page.click('.tool-row:has-text("board.reset") button');
    await page.waitForSelector('.proposal-card');
    // Proposed, not executed: the order the agent set is still on screen.
    expect(await order(page)).toBe(reordered);

    await page.click('.proposal-card button.approve');
    await page.waitForFunction(
      () => document.querySelector('.board-shell .board-order')?.textContent === 'triage → build → review → ship',
      null,
      { timeout: 5_000 },
    );
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
