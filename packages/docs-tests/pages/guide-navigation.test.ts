import { describe, expect, it } from 'bun:test';
import { component, defineConfig, jsx } from 'janux';
import { createJanuxServer } from '@janux/server';
import { docExample } from '../doc-example';

/**
 * guide/navigation.md's navigation config, run against the real server: the
 * page tells people which knobs exist and what each one does to the document,
 * so each claim is checked by serving a page with that config.
 */

const shell = component({
  name: 'shell',
  view: () => jsx('nav', { children: jsx('a', { href: '/other', children: 'Other' }) }),
});

const serve = async (navigation?: Parameters<typeof defineConfig>[0]['navigation']) => {
  const server = createJanuxServer({
    routes: { '/': () => jsx(shell as any, {}) },
    runtimeUrl: '/client.js',
    navigation,
  });

  return (await server.fetch(new Request('http://test/'))).text();
};

const rulesIn = (html: string) => JSON.parse(html.match(/type="speculationrules"[^>]*>([^<]+)</)![1]!);

describe('guide/navigation.md', () => {
  it('emits hover-eagerness speculation rules for internal links by default', async () => {
    const rules = rulesIn(await serve());

    expect(rules.prefetch[0]).toEqual({ where: { href_matches: '/*' }, eagerness: 'moderate' });
  });

  // The config block the page shows, verbatim in shape.
  it('applies the documented eagerness and exclude options', async () => {
    const config = defineConfig({
      navigation: {
        spa: true,
        prefetch: { ttl: 60_000 },
        speculationRules: { eagerness: 'moderate', exclude: ['/logout', '/checkout/*'] },
      },
    });
    const html = await serve(config.navigation);
    const rules = rulesIn(html);

    expect(rules.prefetch[0].where.and).toEqual([
      { href_matches: '/*' },
      { not: { href_matches: '/logout' } },
      { not: { href_matches: '/checkout/*' } },
    ]);
    // And the client gets the prefetch TTL it must honour.
    expect(html).toContain('"ttl":60000');
  });

  it('speculationRules: false leaves the document without the script', async () => {
    expect(await serve({ speculationRules: false })).not.toContain('speculationrules');
  });
});

/**
 * § Redirects & rewrites, run rather than read: the config block on the page is
 * imported as written and handed to a real server, so the URLs the guide claims
 * are answered are the URLs this asserts.
 */
describe('guide/navigation.md — redirects & rewrites', () => {
  const served = async () => {
    const config = (await docExample('apps/docs/content/guide/navigation.md', 5)).default;
    const server = createJanuxServer({
      routes: {
        '/wiki/routing': () => jsx('main', { children: 'Wiki article' }),
        '/docs/deploy': () => jsx('main', { children: 'Docs page' }),
        '/pricing': () => jsx('main', { children: 'Pricing' }),
      },
      redirects: config.redirects,
      rewrites: config.rewrites,
    });

    return (path: string) => server.fetch(new Request(`http://test${path}`));
  };

  it('answers the documented legacy URLs with the documented statuses', async () => {
    const get = await served();
    const moved = await get('/kb/routing');

    expect(moved.status).toBe(308);
    expect(moved.headers.get('location')).toBe('/wiki/routing');
    // The catch-all carries its whole tail, and an explicit status is honoured.
    expect((await get('/legacy-docs/deploy')).headers.get('location')).toBe('/docs/deploy');
    expect((await get('/plans')).status).toBe(301);
    expect((await get('/plans')).headers.get('location')).toBe('/pricing');
  });

  it('serves the documented rewrite without telling the browser', async () => {
    const get = await served();
    const response = await get('/handbook/deploy');

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(await response.text()).toContain('Docs page');
  });

  /** The precedence line the page prints, for the one pair that actually competes. */
  it('resolves a declared redirect before the locale redirect', async () => {
    const config = (await docExample('apps/docs/content/guide/navigation.md', 5)).default;
    const server = createJanuxServer({
      routes: { '/wiki/routing': () => jsx('main', { children: 'Wiki article' }) },
      i18n: { locales: ['en', 'es'], defaultLocale: 'en', messages: { en: {}, es: {} } },
      redirects: config.redirects,
    });

    expect((await server.fetch(new Request('http://test/kb/routing'))).headers.get('location')).toBe('/wiki/routing');
  });
});

/** The § Not found & server errors table, one assertion per column. */
describe('guide/navigation.md — _404 and _500', () => {
  const app = createJanuxServer({ routesDir: `${import.meta.dir}/../__fixtures__/routes` });
  const get = (path: string) => app.fetch(new Request(`http://test${path}`));

  it('_404 answers an unmatched URL with a 404, inside the layout', async () => {
    const response = await get('/nothing/here');
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(html).toContain('This page does not exist');
    expect(html).toContain('class="app-shell"');
  });

  it('_404 also answers the page that called notFound()', async () => {
    const missing = await get('/posts/nope');
    const found = await get('/posts/hello');

    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain('This page does not exist');
    expect(found.status).toBe(200);
  });

  it('_500 answers a page that threw, with the error and without the layout', async () => {
    const response = await get('/boom');
    const html = await response.text();

    expect(response.status).toBe(500);
    expect(html).toContain('page exploded');
    expect(html).not.toContain('app-shell');
  });
});
