import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { component, createInstance, effect, intent, jsx, schema, str } from 'janux';
import { createTestApp, mockApi, resetApiMocks } from '@janux/testing';
import { TaskBoard, attachedBoard } from './__fixtures__/task-board';
import { catalog } from '../../janux-testing/src/__fixtures__/harness-app/src/server/catalog.api';

/**
 * recipes/testing-components.md promises three levels and no sleeps. The
 * component snippets run against the tutorial's board; the route snippets run
 * against the harness's own fixture app (a root `_layout`, a nested one,
 * middleware, `src/ctx.ts` and an api-backed island) — the same mechanisms the
 * page shows against a reader's app.
 */

const APP = resolve(import.meta.dir, '../../janux-testing/src/__fixtures__/harness-app');

describe('recipes/testing-components.md — level 1, components', () => {
  it('the basics snippet: intents, snapshot and derived, with no attach()', async () => {
    const board = createInstance(TaskBoard);

    await board.intents.add({ title: 'Ship v0.2' });
    await board.intents.toggle({ id: (board.snapshot().tasks as any)[0].id });

    expect((board.snapshot().tasks as any)[0].done).toBe(true);
    expect(board.derived.remaining).toBe(0);
  });

  it('the agent-face snippet: a proposal, then a human approval', async () => {
    let proposal: any;
    const board = createInstance(TaskBoard, { onProposal: (received: any) => (proposal = received) } as any);

    await board.intents.add({ title: 'done thing' });
    await board.intents.toggle({ id: (board.snapshot().tasks as any)[0].id });
    const result: any = await board.intents.clearDone({}, { origin: 'agent' });

    expect(result.status).toBe('proposal');
    await proposal.execute();

    expect(board.snapshot().tasks).toEqual([]);
  });

  it('invalid input rejects with the documented message', async () => {
    const board = createInstance(TaskBoard);

    await expect(board.intents.add({ title: '' })).rejects.toThrow(/below min/);
  });

  it('attach() + settled() wait out a debounced effect; dispose() stops it', async () => {
    const saves: string[][] = [];
    const Board = component({
      name: 'tasks-persisted',
      state: schema({ title: str().default('') }),
      intents: { add: intent({ input: schema({ title: str() }), run: ({ state, input }: any) => (state.title = input.title) }) },
      effects: {
        persist: effect({
          description: 'Saves tasks to the server after changes settle',
          when: (state: any) => state.title,
          debounce: '40ms',
          run: ({ state }: any) => {
            saves.push([state.title]);
          },
        }),
      },
      view: () => jsx('p', {}),
    });
    const board = createInstance(Board);

    await board.attach();
    saves.length = 0;
    await board.intents.add({ title: 'a' });
    await board.intents.add({ title: 'b' });
    await board.settled();

    expect(saves).toEqual([['b']]); // rapid edits collapsed into one save
    await board.dispose();
  });

  it('a store-less board still exposes its agent surface through attach()', async () => {
    const board = await attachedBoard();

    // Without a `key`, an instance's uri has no fragment — SSR adds #default.
    expect(board.uri).toBe('ui://tasks');
    expect(Object.keys(board.intents).sort()).toEqual(['add', 'clearDone', 'toggle']);
  });
});

describe('recipes/testing-components.md — level 2, routes', () => {
  afterEach(resetApiMocks);

  it('renders a page through its layout chain, fully streamed', async () => {
    const app = await createTestApp(APP);
    const page = await app.render('/products/7');

    expect(page.status).toBe(200);
    expect(page.html).toContain('data-shell="root"');
    expect(page.html).toContain('data-shell="products"');
    // The island's source resolved before the assertion: no waiting, no sleep.
    expect(page.html).toContain('items:real-a,real-b');
    app.close();
  });

  it('runs the app middleware exactly as production does', async () => {
    const app = await createTestApp(APP);

    expect((await app.render('/admin')).status).toBe(403);
    expect((await app.render('/admin', { headers: { 'x-user': 'ada' } })).status).toBe(200);
    app.close();
  });

  it('forces ctx for the test without touching the session', async () => {
    const app = await createTestApp(APP, { ctx: { user: 'Ada' } });

    expect((await app.render('/')).html).toContain('user:Ada');
    app.close();
  });

  it('exposes the page manifest as assertable data', async () => {
    const app = await createTestApp(APP);
    const manifest = (await app.manifest('/products/7')) as { routes: string[]; tools: { name: string }[] };

    expect(manifest.routes).toContain('/products/[id]');
    expect(manifest.tools.map((tool) => tool.name)).toContain('api.catalog.catalog');
    app.close();
  });

  it('mocks api() at the boundary, with the contract still enforced', async () => {
    mockApi(catalog, () => ({ items: ['Mocked Lamp'] }));
    const app = await createTestApp(APP);

    // The output schema still applies to a mock — see api-mocks.test.ts for the refusal.
    expect((await app.render('/products/7')).html).toContain('items:Mocked Lamp');
    app.close();
  });
});

describe('recipes/testing-components.md — level 3, end to end', () => {
  /** The runner itself is driven by e2e/playwright-fixtures.e2e.test.ts; here we pin the surface the page imports. */
  it('publishes test, expect and the fixtures the page uses', async () => {
    const playwright = await import('@janux/testing/playwright');

    expect(typeof playwright.test).toBe('function');
    expect(typeof playwright.expect).toBe('function');
  });

  it('publishes the standalone barrier for suites that drive the browser themselves', async () => {
    const testing = await import('@janux/testing');

    expect(['settled', 'gotoSettled', 'startTestServer', 'launchChrome', 'openPage'].every((name) => name in testing)).toBe(true);
  });
});
