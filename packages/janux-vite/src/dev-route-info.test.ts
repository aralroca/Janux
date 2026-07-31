import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { DEV_ROUTE_PATH, devRouteHandler, devRouteInfo, devRouteResponse } from './dev-route-info';

/**
 * What the dev overlay cannot know from the browser: which route file answered
 * the URL, and which `_layout` chain wrapped it. Both live in the router, which
 * only exists server-side — so `janux dev` answers the question over HTTP, and
 * only `janux dev`: nothing here is reachable from a built app.
 */

const SHOP = join(import.meta.dir, '../../../examples/shop');

describe('devRouteInfo', () => {
  it('names the route file that answered the path, relative to the app root', () => {
    const info = devRouteInfo(SHOP, join(SHOP, 'src/routes'), '/shop');

    expect(info).toEqual({ path: '/shop', pattern: '/shop', file: 'src/routes/shop.tsx', layouts: [], params: {} });
  });

  it('reports the params a dynamic route matched', () => {
    const info = devRouteInfo(SHOP, join(SHOP, 'src/routes'), '/orders/abc123');

    expect(info.pattern).toBe('/orders/[id]');
    expect(info.params).toEqual({ id: 'abc123' });
  });

  /** A path nothing matches is still worth reporting — that IS the explanation. */
  it('reports an unmatched path without a route or layouts', () => {
    const info = devRouteInfo(SHOP, join(SHOP, 'src/routes'), '/nothing/here');

    expect(info).toEqual({ path: '/nothing/here', pattern: undefined, file: undefined, layouts: [], params: {} });
  });

  it('lists the layout chain outermost first, relative to the app root', () => {
    const app = join(import.meta.dir, '__fixtures__/layout-app');
    const info = devRouteInfo(app, join(app, 'src/routes'), '/admin/users');

    expect(info.pattern).toBe('/admin/users');
    expect(info.layouts).toEqual(['src/routes/_layout.tsx', 'src/routes/admin/_layout.tsx']);
  });
});

describe('the dev route endpoint', () => {
  const respond = (url: string) => devRouteResponse(SHOP, join(SHOP, 'src/routes'), url);

  it('answers the asked path as JSON', async () => {
    const response = respond(`${DEV_ROUTE_PATH}?path=/orders/abc123`)!;

    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toMatchObject({ pattern: '/orders/[id]', params: { id: 'abc123' } });
  });

  it('defaults to the root path when none is asked for', async () => {
    expect(await respond(DEV_ROUTE_PATH)!.json()).toMatchObject({ path: '/' });
  });

  /** Every other URL belongs to the app; the middleware must pass it straight on. */
  it('claims nothing but its own path', () => {
    expect(respond('/shop')).toBeUndefined();
    expect(respond('/_janux/manifest')).toBeUndefined();
  });
});

/**
 * The dev server loads `src/matchers.ts` and routes with it (see
 * `loadServerOptions`). An endpoint that rebuilt the router with only the
 * built-ins would report a perfectly good `[post=slug]` route as unmatched —
 * a diagnostic that lies about supported routing is worse than none.
 */
describe('the dev route endpoint and the app’s own matchers', () => {
  const app = join(import.meta.dir, '__fixtures__/matcher-app');
  const loadMatchers = async () => ({ slug: (value: string) => /^[a-z-]+$/.test(value) });

  it('resolves a typed route using a matcher the app declared', async () => {
    const response = await devRouteHandler(
      app,
      { routesDir: join(app, 'src/routes'), matchersModule: join(app, 'src/matchers.ts') },
      loadMatchers,
      `${DEV_ROUTE_PATH}?path=/blog/hello-world`,
    );

    expect(await response!.json()).toMatchObject({
      pattern: '/blog/[post=slug]',
      file: 'src/routes/blog/[post=slug].tsx',
      params: { post: 'hello-world' },
    });
  });

  /** The matcher has to actually be applied, not merely accepted. */
  it('leaves a path the matcher rejects unmatched', async () => {
    const response = await devRouteHandler(
      app,
      { routesDir: join(app, 'src/routes'), matchersModule: join(app, 'src/matchers.ts') },
      loadMatchers,
      `${DEV_ROUTE_PATH}?path=/blog/NOT_A_SLUG`,
    );

    const body = (await response!.json()) as Record<string, unknown>;

    // `Response.json()` drops undefined keys, so an unmatched path simply has
    // no pattern and no file — which is exactly what the overlay renders as "—".
    expect(body.pattern).toBeUndefined();
    expect(body.file).toBeUndefined();
    expect(body).toMatchObject({ path: '/blog/NOT_A_SLUG', layouts: [] });
  });

  it('needs no matchers module, and claims nothing but its own path', async () => {
    const bare = { routesDir: join(app, 'src/routes') };

    expect(await devRouteHandler(app, bare, loadMatchers, '/shop')).toBeUndefined();
    expect(await (await devRouteHandler(app, bare, loadMatchers, DEV_ROUTE_PATH))!.json()).toMatchObject({ path: '/' });
  });
});
