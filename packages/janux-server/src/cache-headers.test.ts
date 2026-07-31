import { describe, expect, it, spyOn } from 'bun:test';
import { createJanuxServer, NAVIGATION_HEADER } from './server';

const ROUTES = `${import.meta.dirname}/__fixtures__/cache-routes`;
const API = `${import.meta.dirname}/__fixtures__/cache-api`;

const server = (options = {}) =>
  createJanuxServer({
    routesDir: ROUTES,
    httpHandlers: { dir: API, loadModule: (file: string) => import(file) },
    ...options,
  });

const get = (path: string, headers?: Record<string, string>) =>
  server().fetch(new Request(`http://test${path}`, { headers }));

describe('page cache headers', () => {
  it('is uncacheable unless a route says otherwise', async () => {
    const res = await get('/');

    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('cache-tag')).toBeNull();
  });

  it('emits what a CDN needs when the route declares a public policy', async () => {
    const res = await get('/catalog');

    expect(res.headers.get('cache-control')).toBe('public, max-age=10, s-maxage=300, stale-while-revalidate=3600');
    expect(res.headers.get('cache-tag')).toBe('catalog');
  });

  it('varies on the navigation header, so a CDN never serves the SPA body to a cold load', async () => {
    const res = await get('/catalog');

    expect(res.headers.get('vary')?.toLowerCase()).toContain(NAVIGATION_HEADER);
  });

  it('fills tag templates from the matched route params', async () => {
    const res = await get('/products/42');

    expect(res.headers.get('cache-tag')).toBe('catalog, product:42');
  });

  it('never caches a miss — a 404 under a cached pattern is not the page', async () => {
    const res = await get('/nope');

    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('writes tags under the header the configured CDN reads', async () => {
    const res = await server({ cache: { tagHeader: 'Surrogate-Key' } }).fetch(new Request('http://test/catalog'));

    expect(res.headers.get('surrogate-key')).toBe('catalog');
    expect(res.headers.get('cache-tag')).toBeNull();
  });
});

describe('http handler cache headers', () => {
  it('applies the same fail-safe to a handler that declares nothing', async () => {
    const res = await get('/api/nothing').catch(() => undefined);

    expect(res?.status).toBe(404);
  });

  it('honours a public policy declared on the handler module', async () => {
    const res = await get('/api/feed');

    expect(res.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=120');
    expect(res.headers.get('cache-tag')).toBe('feed');
  });

  it('downgrades a public response that carries a session cookie, and says so', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const res = await get('/api/signin');

      expect(res.headers.get('set-cookie')).toContain('session=');
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      expect(res.headers.get('cache-tag')).toBeNull();
      expect(warn.mock.calls.flat().join(' ')).toMatch(/set-cookie/i);
    } finally {
      warn.mockRestore();
    }
  });
});
