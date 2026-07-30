import { describe, expect, it } from 'bun:test';
import { join, resolve } from 'node:path';
import { api, createJanuxServer } from '@janux/server';
import { jsx, schema, str } from 'janux';

/**
 * recipes/deploying.md makes two mechanical claims a test can settle: which
 * pages a static export contains (dynamic routes need `staticParams`), and that
 * pending agent proposals are in-memory and capped — the reason the page tells
 * you to use sticky sessions behind a load balancer.
 */

const ROUTES = resolve(import.meta.dir, '../../janux-server/src/__fixtures__/routes');

function server(extra: Record<string, unknown> = {}) {
  return createJanuxServer({
    routesDir: ROUTES,
    loadRoute: (filePath) => import(filePath),
    routes: { '/': () => jsx('h1', { children: 'home' }) },
    ...extra,
  });
}

describe('recipes/deploying.md — what a static export contains', () => {
  it('expands a dynamic route through staticParams and keeps the pattern without it', async () => {
    const pages = await server().listPages();

    expect(pages).toContain('/orders/1');
    expect(pages).toContain('/orders/2'); // staticParams enumerated them
    expect(pages).toContain('/tags/[tag]'); // no staticParams → still a pattern
  });

  it('a page that is still a pattern is what `janux build` skips with a warning', async () => {
    const pages = await server().listPages();
    const skipped = pages.filter((page) => page.includes('['));
    const concrete = pages.filter((page) => !page.includes('['));

    expect(skipped).toEqual(['/tags/[tag]']);
    expect(concrete).toContain('/'); // the routes map entry prerenders too
  });

  it('with i18n every page is emitted once per locale', async () => {
    const pages = await server({
      i18n: { locales: ['en', 'es'], defaultLocale: 'en', messages: { en: {}, es: {} } },
    }).listPages();

    expect(pages).toContain('/en');
    expect(pages).toContain('/es');
    expect(pages).toContain('/en/orders/1');
    expect(pages).toContain('/es/orders/1');
  });
});

describe('recipes/deploying.md — pending proposals are in-memory and capped', () => {
  const app = () =>
    createJanuxServer({
      apis: {
        shop: {
          pay: api({
            description: 'Charge the card',
            input: schema({ total: str() }),
            guard: 'confirm',
            run: ({ input }: any) => ({ charged: input.total }),
          }),
        },
      },
    });

  const propose = (instance: ReturnType<typeof app>, total: string) =>
    instance
      .fetch(
        new Request('http://test/_janux/api/shop.pay', {
          method: 'POST',
          body: JSON.stringify({ total }),
          headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'x-janux-origin': 'agent' },
        }),
      )
      .then((response) => response.json() as any);

  it('evicts the oldest once 100 are pending, so the map cannot grow unbounded', async () => {
    const instance = app();
    const first: any = await propose(instance, '1');
    const ids = await Promise.all(Array.from({ length: 120 }, (_, index) => propose(instance, String(index + 2))));
    const approveFirst = await instance.fetch(
      new Request('http://test/_janux/approve', {
        method: 'POST',
        body: JSON.stringify({ id: first.result.id }),
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      }),
    );

    expect(approveFirst.status).toBe(404); // evicted: proposals do not survive forever
    const last = ids.at(-1)!;
    const approveLast = await instance.fetch(
      new Request('http://test/_janux/approve', {
        method: 'POST',
        body: JSON.stringify({ id: last.result.id }),
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      }),
    );

    expect(await approveLast.json()).toMatchObject({ ok: true });
  });

  it('a second server instance shares nothing — hence sticky sessions', async () => {
    const one = app();
    const other = app();
    const proposal: any = await propose(one, '10');
    const onOther = await other.fetch(
      new Request('http://test/_janux/approve', {
        method: 'POST',
        body: JSON.stringify({ id: proposal.result.id }),
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      }),
    );

    expect(onOther.status).toBe(404);
  });
});
