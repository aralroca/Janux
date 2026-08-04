---
title: Testing
description: "Three levels, one story: components as function calls, routes through their real layout chain, and browser tests that wait for quiescence instead of sleeping."
---

# Testing

Janux tests at three levels, and none of them needs a `sleep`.

| Level | What it runs | What you import |
|---|---|---|
| **Component** | intents, guards, effects, sources, events — as plain function calls | `createInstance` from `janux` |
| **Route** | a page through its `_layout` chain, middleware and `ctx`, server-side | `createTestApp` from `@janux/testing` |
| **End to end** | a real browser against the built app | `test` / `expect` from `@janux/testing/playwright` |

Run the first two with `janux test` (which is `bun test`, from your app root) and the third with `bunx playwright test`. Janux ships no test runner: `bun:test` and Playwright already exist.

## Level 1 — components

`createInstance` gives you the whole runtime without a browser.

```ts
import { expect, it } from 'bun:test';
import { createInstance } from 'janux';
import { TaskBoard } from '../src/components/TaskBoard';

it('adds and toggles tasks', async () => {
  const board = createInstance(TaskBoard);

  await board.intents.add({ title: 'Ship v0.2' });
  await board.intents.toggle({ id: board.snapshot().tasks[0].id });

  expect(board.snapshot().tasks[0].done).toBe(true);
  expect(board.derived.remaining).toBe(0);
});
```

### The agent face is the same pipeline

Guards included — this is what a real agent hits:

```ts
it('clearDone needs human approval from agents', async () => {
  let proposal;
  const board = createInstance(TaskBoard, { onProposal: (p) => (proposal = p) });

  const result = await board.intents.clearDone({}, { origin: 'agent' });

  expect(result.status).toBe('proposal');          // nothing applied yet
  await proposal.execute();                         // the "human" approves
  expect(board.snapshot().tasks).toEqual([]);
});
```

Invalid input is a test too: `expect(board.intents.add({ title: '' })).rejects.toThrow(/below min/)`.

### Effects, sources and `settled()`

```ts
it('persists after the debounce', async () => {
  const board = createInstance(TaskBoard);

  await board.attach();                              // starts effects & sources
  await board.intents.add({ title: 'x' });
  await board.settled();                             // waits out the 400ms debounce
  await board.dispose();
});
```

`attach()` is only needed when the test exercises effects, sources or lifecycle — pure intent tests skip it. `settled()` is the idea all three levels share: **wait for quiet, never for a duration**.

## Level 2 — routes

`createTestApp` boots the same server `janux start` runs, in-process: routes, `_layout` chains, middleware, `src/ctx.ts` and `api()` modules loaded straight from your app root. No build, no port, no browser.

```ts
import { afterAll, beforeAll, expect, it } from 'bun:test';
import { join } from 'node:path';
import { createTestApp, type TestApp } from '@janux/testing';

// Not `new URL(...).pathname`: on Windows that reads `/C:/...`, which resolves
// against the drive again and points nowhere.
const ROOT = join(import.meta.dirname, '..');

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp(ROOT);
});

afterAll(() => app.close());

it('wraps the page in its layout chain', async () => {
  const page = await app.render('/pricing');

  expect(page.status).toBe(200);
  expect(page.html).toContain('data-shell="root"');       // src/routes/_layout
  expect(page.html).toContain('data-shell="marketing"');  // src/routes/(marketing)/_layout
});
```

`render()` returns the **fully streamed** HTML, so whatever a suspense boundary resolved to is already in `page.html` — assert with `toContain`, nothing to await.

### Middleware and ctx

Middleware runs exactly as in production, and `ctx` can be forced for the test:

```ts
it('the middleware blocks anonymous requests', async () => {
  expect((await app.render('/admin')).status).toBe(403);
  expect((await app.render('/admin', { headers: { 'x-user': 'ada' } })).status).toBe(200);
});

it('renders as a signed-in user without touching the session', async () => {
  const signedIn = await createTestApp(ROOT, { ctx: { user: 'Ada' } });

  expect((await signedIn.render('/')).html).toContain('Ada');
  signedIn.close();
});
```

### The manifest is testable too

The agent surface of a page is data, so assert on it like any other output:

```ts
it('advertises the right tools, with the right guards', async () => {
  const manifest = await app.manifest('/shop');
  const guards = new Map(manifest.tools.map((tool) => [tool.name, tool.guard]));

  expect(guards.get('cart.addItem')).toBe('auto');
  expect(guards.get('cart.checkout')).toBe('confirm');   // spends money: humans approve
});
```

### Mocking `api()`

Mock at the boundary, not per test. `mockApi` replaces a tool's `run` and leaves the rest of the pipeline — guard, input validation, output validation, audit — exactly as in production:

```ts
import { afterEach, expect, it } from 'bun:test';
import { mockApi, resetApiMocks } from '@janux/testing';
import { catalog } from '../src/server/shop.api';

afterEach(resetApiMocks);

it('renders whatever the catalog api returns', async () => {
  mockApi(catalog, () => ({ products: [{ id: 'p9', name: 'Mocked Lamp', price: 1000 }] }));

  expect((await app.render('/shop')).html).toContain('Mocked Lamp');
});
```

Because the contract still applies, a mock that returns the wrong shape fails the test instead of quietly rendering nonsense. Wire names work too — `mockApi('shop.catalog', …)` — for tools you would rather not import.

## Level 3 — end to end

The fixtures start your built app and hand you a `goto` that resolves when the page is **quiet**:

```ts
import { join } from 'node:path';
import { expect, test } from '@janux/testing/playwright';

test.use({ janux: { root: join(import.meta.dirname, '..') } });

test('the cart survives a click', async ({ goto, page, settled }) => {
  await goto('/shop');                    // navigated AND settled
  await page.click('text=Add to cart');
  await settled();                        // sources, effects, debounces: drained

  await expect(page.locator('.cart-badge output')).toHaveText('1');
});
```

> **This is the whole argument.** Other frameworks wait a guessed number of milliseconds and hope. Janux components declare their pending work, so the runtime *knows* when it is idle: `settled()` is an observable fact, not a bet. Tests stop being flaky because they stop guessing.

Run them with `bunx playwright test` after `janux build`. The app is served in its own Bun process, so `bun` must be on PATH.

### Driving the agent surface

The `agent` fixture calls tools the way a real agent does — same guards, same proposals:

```ts
test('an agent cannot check out on its own', async ({ goto, agent, page }) => {
  await goto('/shop');
  const proposal = await agent.call('cart.checkout');

  expect(proposal.status).toBe('proposal');            // parked for a human
  await agent.approve(proposal.id);
  await expect(page.locator('.receipt')).toBeVisible();
});
```

### Without the fixtures

For suites that drive the browser themselves, the same barrier is a function: `settled(page)` and `gotoSettled(page, url)`, plus `startTestServer(root)` and `launchBrowser()` / `openPage(browser)`. That is what Janux's own e2e suite uses — see the [testing API](/docs/reference/testing-api).

## Which level?

Start at the level that owns the behavior:

- **Domain logic, guards, derived state** → component. Fastest, and if a rule is hard to test here it usually belongs in `state` rather than the view.
- **Layouts, params, middleware, redirects, status codes, the manifest** → route. Still milliseconds, no browser.
- **Hydration, real clicks, navigation, view transitions, scroll** → e2e. Slowest; keep it for what genuinely needs a browser.

> **Tip:** if a behavior is hard to test without a browser, that is usually a smell — domain state living in the view instead of `state`.
