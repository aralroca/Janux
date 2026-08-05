import { describe, expect, it } from 'bun:test';
import { jsx } from 'janux';
import { api } from './api';
import { createJanuxServer, type ServerOptions } from './server';

/**
 * The declared rules where they actually run: `handleRequest`, the one point
 * every URL passes through, before the route is resolved. What the unit tests
 * check about matching, these check about *placement* — which of the things
 * that can answer a request gets to answer first.
 */

const routes: ServerOptions['routes'] = {
  '/': () => jsx('main', { children: 'Home' }),
  '/docs': () => jsx('main', { children: 'Docs' }),
  '/posts/hello': () => jsx('main', { children: 'Hello post' }),
};

const serve = (options: Partial<ServerOptions> = {}) => {
  const server = createJanuxServer({ routes, runtimeUrl: '/client.js', ...options });

  return (path: string, init?: RequestInit) => server.fetch(new Request(`http://test${path}`, init));
};

describe('redirects', () => {
  const get = serve({ redirects: [{ from: '/blog/[slug]', to: '/posts/[slug]' }, { from: '/old', to: '/', status: 301 }] });

  it('answers a legacy URL with the status and Location it declared', async () => {
    const response = await get('/blog/hello');

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('/posts/hello');
    // A redirect has nothing to say beyond where to go.
    expect(await response.text()).toBe('');
  });

  it('takes an explicit status', async () => {
    expect((await get('/old')).status).toBe(301);
  });

  it('leaves every other URL to the router', async () => {
    const response = await get('/docs');

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(await response.text()).toContain('Docs');
  });
});

describe('rewrites', () => {
  const get = serve({ rewrites: [{ from: '/help/[...path]', to: '/[...path]' }] });

  it('serves the internal route without telling the browser', async () => {
    const response = await get('/help/docs');

    expect(response.status).toBe(200);
    // No Location: the address bar keeps `/help/docs`, which is the whole point.
    expect(response.headers.get('location')).toBeNull();
    expect(await response.text()).toContain('Docs');
  });

  it('still 404s when the rewritten path has no route either', async () => {
    expect((await get('/help/nothing')).status).toBe(404);
  });
});

/**
 * Design invariant 4: guards are enforced at the invocation pipeline. A rewrite
 * that could address `/_janux/*` would be a URL-shaped way past it, so the
 * framework surface is unreachable from a rule — including when the path is
 * assembled from what the visitor typed.
 */
describe('a rewrite cannot reach the framework surface', () => {
  const get = serve({ rewrites: [{ from: '/proxy/[...path]', to: '/[...path]' }] });

  it('does not serve /_janux/manifest through a rewrite', async () => {
    const direct = await get('/_janux/manifest?path=/');
    const proxied = await get('/proxy/_janux/manifest?path=/');

    expect(direct.status).toBe(200);
    expect(await direct.json()).toHaveProperty('tools');
    // The rewrite refuses, so this is an ordinary miss — not the manifest.
    expect(proxied.status).toBe(404);
  });

  /**
   * The one that matters: `/_janux/api/*` is where a tool actually runs, behind
   * the guard the invocation pipeline enforces. A rewrite must not be able to
   * carry a request there under a URL of the app's own.
   */
  it('does not reach an api tool through a rewrite, so no guard is skipped', async () => {
    let ran = 0;
    const server = createJanuxServer({
      routes,
      apis: { vault: { open: api({ description: 'Opens the vault', run: () => ((ran += 1), 'secret') }) } },
      rewrites: [{ from: '/proxy/[...path]', to: '/[...path]' }],
    });
    const call = (path: string) =>
      server.fetch(new Request(`http://test${path}`, { method: 'POST', headers: { origin: 'http://test' }, body: '{}' }));
    const direct = await call('/_janux/api/vault.open');
    const proxied = await call('/proxy/_janux/api/vault.open');

    // The tool is reachable at its own address…
    expect(direct.status).toBe(200);
    expect(ran).toBe(1);
    // …and nowhere else. The rewrite refused, so this never reached the pipeline.
    expect(proxied.status).toBe(404);
    expect(ran).toBe(1);
  });

  it('does not take the framework surface off the air with a greedy rule', async () => {
    const greedy = serve({ redirects: [{ from: '/[...all]', to: '/moved/[...all]' }] });

    expect((await greedy('/_janux/manifest?path=/')).status).toBe(200);
    expect((await greedy('/docs')).status).toBe(308);
  });
});

/**
 * Precedence, written down: `src/middleware.ts` (the app's own escape hatch) →
 * declared redirects → declared rewrites → the i18n locale redirect → the
 * route. A legacy URL is therefore answered as itself, not as its localized
 * form, and a migration map does not have to be written once per locale.
 */
describe('precedence', () => {
  const i18n = { locales: ['en', 'es'], defaultLocale: 'en', messages: { en: {}, es: {} } };

  it('a declared redirect resolves before the locale redirect', async () => {
    const get = serve({ i18n, redirects: [{ from: '/old-home', to: '/home' }] });
    const response = await get('/old-home');

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('/home');
  });

  it('the locale redirect still answers everything the rules did not', async () => {
    const get = serve({ i18n, redirects: [{ from: '/old-home', to: '/home' }] });
    const response = await get('/somewhere');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/en/somewhere');
  });

  it('middleware runs first, so the app can still answer a URL a rule claims', async () => {
    const get = serve({
      redirects: [{ from: '/gate', to: '/' }],
      middleware: (req) => (new URL(req.url).pathname === '/gate' ? new Response('held', { status: 403 }) : undefined),
    });
    const response = await get('/gate');

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('held');
  });
});
