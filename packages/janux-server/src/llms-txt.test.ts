import { describe, expect, it } from 'bun:test';
import { jsx, schema, str } from 'janux';
import { api } from './api';
import { buildLlmsTxt, expandPattern } from './llms-txt';
import { createJanuxServer } from './server';

describe('expandPattern', () => {
  it('substitutes every dynamic segment per params record, URI-encoded', () => {
    const paths = expandPattern('/docs/[section]/[slug]', [
      { section: 'guide', slug: 'getting-started' },
      { section: 'more', slug: 'a b' },
    ]);

    expect(paths).toEqual(['/docs/guide/getting-started', '/docs/more/a%20b']);
  });

  it('drops records missing a param', () => {
    expect(expandPattern('/docs/[section]/[slug]', [{ section: 'guide' }])).toEqual([]);
  });
});

describe('buildLlmsTxt', () => {
  it('renders title, pages and annotated tools', () => {
    const output = buildLlmsTxt(
      { title: 'Shop', description: 'A demo shop.' },
      ['/', '/cart'],
      [
        { name: 'api.shop.catalog', description: 'List products', guard: 'auto' },
        { name: 'api.shop.pay', description: 'Charge the cart', guard: 'confirm' },
      ],
    );

    expect(output).toContain('# Shop');
    expect(output).toContain('> A demo shop.');
    expect(output).toContain('- [/cart](/cart)');
    expect(output).toContain('- [api.shop.catalog](/_janux/api/shop.catalog): List products');
    expect(output).toContain('- [api.shop.pay](/_janux/api/shop.pay): Charge the cart (requires human approval)');
  });

  it('is byte-stable for an app without pages or tools', () => {
    expect(buildLlmsTxt({}, [], [])).toBe('# Janux app\n');
  });
});

describe('GET /llms.txt', () => {
  const apis = {
    pay: api({ description: 'Charge', input: schema({ total: str() }), guard: 'confirm', run: () => ({}) }),
    hidden: api({ guard: 'forbidden', run: () => 'secret' }),
  };

  it('serves the index when llmsTxt is configured, excluding forbidden tools', async () => {
    const server = createJanuxServer({
      routes: { '/': () => jsx('main', {}) },
      apis: { shop: apis },
      title: 'Shop',
      llmsTxt: { description: 'A demo shop.' },
    });
    const res = await server.fetch(new Request('http://test/llms.txt'));
    const body = await res.text();

    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(body).toContain('# Shop');
    expect(body).toContain('api.shop.pay');
    expect(body).not.toContain('hidden');
    expect(await (await server.fetch(new Request('http://test/llms.txt'))).text()).toBe(body);
  });

  it('expands dynamic fs routes via staticParams and keeps the pattern without it', async () => {
    const server = createJanuxServer({
      routesDir: `${import.meta.dirname}/__fixtures__/routes`,
      llmsTxt: {},
    });
    const body = await (await server.fetch(new Request('http://test/llms.txt'))).text();

    expect(body).toContain('- [/orders/1](/orders/1)');
    expect(body).toContain('- [/orders/2](/orders/2)');
    expect(body).not.toContain('[id]');
    expect(body).toContain('- [/tags/[tag]](/tags/[tag])');
  });

  it('listPages returns concrete paths, keeping unexpandable patterns', async () => {
    const server = createJanuxServer({ routesDir: `${import.meta.dirname}/__fixtures__/routes` });

    expect(await server.listPages()).toEqual(['/about', '/evil', '/orders/1', '/orders/2', '/tags/[tag]']);
  });

  it('404s when llmsTxt is not configured', async () => {
    const server = createJanuxServer({ routes: { '/': () => jsx('main', {}) } });

    expect((await server.fetch(new Request('http://test/llms.txt'))).status).toBe(404);
  });
});
