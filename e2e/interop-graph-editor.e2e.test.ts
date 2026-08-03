import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser, type Page } from 'playwright';
import { createTestApp, isBuilt, launchChrome, openPage as newPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * The graph-editor category: `@xyflow/react` mounted unchanged, in both
 * directions. `examples/with-web-agent` already mounts React Flow, but only
 * one way — island state flows in and nothing comes back. Here a node drag and
 * an edge drawn by hand land as `graph.moveNode` / `graph.connect`, which are
 * the same tools the agent calls.
 *
 * This is also the honest ❌-for-SSR row: React Flow measures the viewport on
 * mount, so `hydrate: 'only'` is the correct answer rather than a workaround.
 */

const APP = appRoot('examples/interop-graph-editor');
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
const summary = (page: Page) => page.locator('.graph-shell .graph-summary').textContent();

describe('examples/interop-graph-editor server side', () => {
  it('ships an empty host on purpose, with the graph still readable in the HTML', async () => {
    const app = await createTestApp(APP);
    const html = await (await app.fetch('/')).text();

    expect(html).toContain('<janux-foreign');
    expect(html).toContain('graph-canvas');
    expect(html).toContain('data-jxf-hydrate="only"');
    // No canvas in the HTML — React Flow needs a measured viewport…
    expect(html).not.toContain('react-flow__node');
    // …but the graph itself is server-rendered where it matters: the island's
    // own view, which is what an agent reads.
    expect(html).toContain('3 nodes · 1 edges');
  });

  it('exposes the whole editing vocabulary as tools, clear guarded', async () => {
    const app = await createTestApp(APP);
    const manifest: any = await (await app.fetch('/_janux/manifest')).json();
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards['graph.addNode']).toBe('auto');
    expect(guards['graph.connect']).toBe('auto');
    expect(guards['graph.moveNode']).toBe('auto');
    expect(guards['graph.clear']).toBe('confirm');
  });
});

describe.skipIf(!BUILT)('examples/interop-graph-editor in the browser', () => {
  it('mounts the canvas client-side with the state it was given', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.react-flow__node');
    expect(await page.locator('.react-flow__node').count()).toBe(3);
    expect(await page.locator('.react-flow__edge').count()).toBe(1);
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('dragging a node lands as the moveNode intent', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.react-flow__node[data-id="verify"]');

    const box = (await page.locator('.react-flow__node[data-id="verify"]').boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 30, { steps: 12 });
    await page.mouse.up();

    // The drag round-tripped: React Flow → onNodeDragStop(event, node) → the
    // mapper picked the SECOND argument → moveNode → island state. The state is
    // the assertion, not a CSS transform string: what this example claims is
    // that a pointer gesture becomes a typed, readable intent.
    await page.waitForFunction(
      async () => {
        const resource: any = await (window as any).janux.read('ui://graph#default');

        return (resource.state.nodes.find((node: any) => node.id === 'verify')?.x ?? 0) > 40;
      },
      null,
      { timeout: 5_000 },
    );
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the agent adds a node to the canvas by calling the same intent', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    await page.waitForSelector('.react-flow__node');
    await page.waitForSelector('.tool-row:has-text("graph.addNode") button');

    await page.click('.tool-row:has-text("graph.addNode") button');
    await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length === 4, null, {
      timeout: 5_000,
    });
    expect(await summary(page)).toContain('4 nodes');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);

  it('the guarded clear stays a proposal until a human approves it', async () => {
    const { page, errors } = await openPage();

    await page.goto(`${BASE}/`);
    // Attached, not visible: an SVG edge path has no layout box of its own.
    await page.waitForSelector('.react-flow__edge', { state: 'attached' });
    await page.waitForSelector('.tool-row:has-text("graph.clear") button');
    await page.click('.tool-row:has-text("graph.clear") button');

    await page.waitForSelector('.proposal-card');
    expect(await page.locator('.react-flow__edge').count()).toBe(1);

    await page.click('.proposal-card button.approve');
    await page.waitForFunction(() => document.querySelectorAll('.react-flow__edge').length === 0, null, {
      timeout: 5_000,
    });
    expect(await summary(page)).toContain('0 edges');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
