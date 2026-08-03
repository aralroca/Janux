---
title: Testing API
description: "Everything importable from @janux/testing: the route harness, api() mocks, server helpers and the settled-based Playwright fixtures."
---

# Testing API

`@janux/testing` extends the component-level story (`createInstance`, in the core) to routes and full apps. The [testing recipe](/docs/recipes/testing-components) shows the three levels in use; this page is the surface itself.

## `createTestApp(root, options?)`

The route-level harness: the same server `janux start` runs, in-process — routes, `_layout` chains, middleware, `src/ctx.ts` and `api()` modules loaded straight from `root`, no build and no port.

```
createTestApp(root: string, options?: TestAppOptions): Promise<TestApp>

interface TestAppOptions {
  ctx?: Record<string, unknown>;   // forced over what src/ctx.ts resolves
}

interface TestApp {
  server: JanuxServer;   // the full server underneath: listPages(), manifestFor(), apiTools
  fetch(path: string, init?: RequestInit): Promise<Response>;
  render(path: string, init?: RequestInit): Promise<RenderedPage>;  // { status, headers, html }
  manifest(path: string): Promise<unknown>;  // islands, tools, route patterns
  close(): void;
}
```

`render()` returns the fully streamed HTML (`RenderedPage.html`), so what a suspense boundary resolves to is already there — assert with `toContain`, no waiting. `manifest()` answers through the real `/_janux/manifest` endpoint, ctx resolution included.

## `mockApi(target, run)`

Replaces the `run` of an `api()` tool while the rest of the invocation pipeline — guard, input validation, output validation, audit — stays exactly as in production.

```
mockApi(target: CallableApi | string, run: ApiDef['run']): () => void
```

- `target` is the imported `api()` value itself, or a wire name (`"shop.catalog"`) for the collected HTTP boundary.
- Returns a restore function that removes just that mock.
- Guards still refuse agent calls, schemas still validate — a mock cannot smuggle an invalid shape past the contract. (Re-exported from `@janux/server`, where the pipeline lives.)

## `resetApiMocks()`

Drops every registered mock at once — call it from `afterEach`.

## `startTestServer(root, options?)`

Serves the built app like `janux start` does — static assets from `dist/client` first, the app after — on an auto-assigned port.

```
startTestServer(root: string, options?: TestServerOptions): Promise<TestServer>  // { url, stop() }

interface TestServerOptions {
  observe?: (req: Request, res: Response) => void;   // every request, paired with its response
}
```

Behind it, `@janux/cli` exposes the same building blocks (`prodServerOptions`, `staticResponse`) for custom wiring.

## `startNodeServer(root, port)`

Serves a `janux-node` build the way a deployment does: `node build/index.js`, in its own process, no Bun anywhere in it. Returns `{ url, output, stop() }` — `output.text` accumulates the server's stdout.

## `isBuilt(root)` / `hasNodeBuild(root)`

Whether `janux build` (respectively the node adapter) ran for the app — suites that need artifacts skip cleanly otherwise.

## `settled(page, options?)` / `gotoSettled(page, url, options?)`

The quiescence barrier: resolves when the page's Janux runtime reports no pending work — sources, effects, debounced intents, in-flight navigations, suspense boundaries. `gotoSettled` is `page.goto` + the barrier. Default `timeout`: 10 s.

This is the call that replaces every sleep in an e2e suite: quiet is observable, so waiting a guessed number of milliseconds is never needed.

## `@janux/testing/playwright` — `test` / `expect`

Fixtures for the Playwright runner: one server per worker for the built app named by `test.use({ janux: { root } })`, `baseURL` pointed at it, and a `goto(path)` that resolves only when the page is **quiet** — the settled barrier instead of a guessed `waitForTimeout`. The `settled()` fixture re-arms the barrier after an interaction, and `agent` drives the page's agent surface (`call` / `approve` / `reject`) the way a real agent does, through `window.janux`.

The app is served in its own Bun process (the Playwright runner is Node; a Janux server is Bun-first), so `bun` must be on PATH. Run `janux build` for the app first — the fixtures serve `dist/client` like `janux start` does.

```
import { expect, test } from '@janux/testing/playwright';

test.use({ janux: { root: new URL('..', import.meta.url).pathname } });

test('checkout stays quiet', async ({ goto, page, settled, agent }) => {
  await goto('/cart');                 // navigated AND settled
  await page.click('text=Add');
  await settled();                     // drained: sources, effects, debounces
  await expect(page.locator('output')).toHaveText('1');
  await agent.call('cart.checkout');   // the agent face, same page
});
```

## `launchBrowser()` / `openPage(browser)`

One shared browser for the whole test process (launch/teardown churn is what makes `goto` flake under load), and a page that records uncaught `pageerror`s for the final assertion: `openPage` returns `{ page, errors }`.

Which engine it launches comes from `JANUX_E2E_BROWSER` — `chromium`, `firefox` or `webkit`. Unset means Chromium on the branded Chrome channel, so a suite run by hand behaves as it always has; a name it does not recognize is refused rather than quietly swapped for another engine. Janux's own CI runs the browser suite once per engine by setting it.
