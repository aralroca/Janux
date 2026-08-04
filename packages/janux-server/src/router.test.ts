import { describe, expect, it } from 'bun:test';
import { createJanuxServer } from './server';
import { createFsRouter } from './router';

const APP = `${import.meta.dirname}/__fixtures__/app`;
const router = createFsRouter(APP);

describe('fs router — full segment grammar', () => {
  it('static beats dynamic at the same depth (route-sort spec)', () => {
    expect(router.match('/about')!.pattern).toBe('/about');
    expect(router.match('/whatever')!.pattern).toBe('/[page]');
  });

  it('typed matchers beat plain dynamics and gate the match', () => {
    expect(router.match('/users/123')!.pattern).toBe('/users/[id=integer]');
    expect(router.match('/users/123')!.params).toEqual({ id: '123' });
    expect(router.match('/users/ana')!.pattern).toBe('/users/[name]');
  });

  it('supports custom matchers', () => {
    const custom = createFsRouter(APP, { integer: (value) => value === '42' });

    expect(custom.match('/users/42')!.pattern).toBe('/users/[id=integer]');
    expect(custom.match('/users/123')!.pattern).toBe('/users/[name]');
  });

  it('nested dynamic segments collect every param', () => {
    expect(router.match('/console/t1/kyc/verifications')!.params).toEqual({
      team: 't1',
      app: 'kyc',
      feature: 'verifications',
    });
  });

  it('catch-all requires at least one segment and joins the rest', () => {
    expect(router.match('/files/a/b/c')!.params).toEqual({ path: 'a/b/c' });
    // Bare /files does NOT hit the catch-all (needs ≥1 segment) — it falls to /[page].
    expect(router.match('/files')!.pattern).toBe('/[page]');
  });

  it('optional catch-all matches the bare path too', () => {
    expect(router.match('/docs')!.params).toEqual({ slug: '' });
    expect(router.match('/docs/guide/router')!.params).toEqual({ slug: 'guide/router' });
  });

  it('(group) directories organize files without touching the URL', () => {
    const match = router.match('/pricing')!;

    expect(match.pattern).toBe('/pricing');
    expect(match.layouts).toHaveLength(2);
    expect(match.layouts[1]).toContain('(marketing)');
  });

  it('layout chains compose outermost → innermost', () => {
    // The router answers native paths; these name the directories forward-slash.
    const layouts = router.match('/console/t1')!.layouts.map((layout) => layout.replaceAll('\\', '/'));

    expect(layouts[0]).toContain('app/_layout');
    expect(layouts[1]).toContain('[team]/_layout');
  });
});

describe('layout composition (server render)', () => {
  const server = createJanuxServer({ routesDir: APP });

  it('wraps the page in its layout chain with params available', async () => {
    const response = await server.fetch(new Request('http://localhost/console/acme'));
    const html = await response.text();

    expect(html).toContain('class="root-shell"');
    expect(html).toContain('data-team="acme"');
    expect(html).toContain('Team acme');
    const rootIndex = html.indexOf('root-shell');
    const teamIndex = html.indexOf('team-shell');

    expect(rootIndex).toBeLessThan(teamIndex);
  });

  it('group layouts wrap their subtree only', async () => {
    const pricing = await (await server.fetch(new Request('http://localhost/pricing'))).text();
    const about = await (await server.fetch(new Request('http://localhost/about'))).text();

    expect(pricing).toContain('class="marketing"');
    expect(about).not.toContain('class="marketing"');
  });
});

describe('middleware', () => {
  it('short-circuits before routing', async () => {
    const server = createJanuxServer({
      routesDir: APP,
      middleware: (req) =>
        new URL(req.url).pathname === '/blocked'
          ? new Response('nope', { status: 403 })
          : undefined,
    });
    const blocked = await server.fetch(new Request('http://localhost/blocked'));
    const home = await server.fetch(new Request('http://localhost/about'));

    expect(blocked.status).toBe(403);
    expect(home.status).toBe(200);
  });
});
