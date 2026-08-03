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
