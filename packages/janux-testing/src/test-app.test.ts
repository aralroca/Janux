import { afterEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { mockApi, resetApiMocks } from '@janux/server';
import { catalog } from './__fixtures__/harness-app/src/server/catalog.api';
import { createTestApp } from './test-app';

const FIXTURE = join(import.meta.dirname, '__fixtures__/harness-app');

afterEach(resetApiMocks);

describe('createTestApp renders a route through its layout chain', () => {
  it('wraps the page in the root _layout', async () => {
    const app = await createTestApp(FIXTURE);
    const page = await app.render('/');

    expect(page.status).toBe(200);
    expect(page.html).toContain('data-shell="root"');
    expect(page.html).toContain('home page');
    app.close();
  });

  it('stacks nested _layouts and passes params to the page', async () => {
    const app = await createTestApp(FIXTURE);
    const page = await app.render('/products/42');

    expect(page.html).toContain('data-shell="root"');
    expect(page.html).toContain('data-shell="products"');
    expect(page.html).toContain('product 42');
    app.close();
  });
});

describe('createTestApp runs the app middleware', () => {
  it('lets the middleware intercept the request', async () => {
    const app = await createTestApp(FIXTURE);
    const page = await app.render('/admin');

    expect(page.status).toBe(403);
    expect(page.html).toBe('middleware: no user');
    app.close();
  });

  it('passes through when the middleware declines', async () => {
    const app = await createTestApp(FIXTURE);
    const page = await app.render('/admin', { headers: { 'x-user': 'ada' } });

    expect(page.status).toBe(200);
    expect(page.html).toContain('admin area');
    app.close();
  });
});

describe('createTestApp resolves the request ctx', () => {
  it('builds ctx from the request via src/ctx.ts', async () => {
    const app = await createTestApp(FIXTURE);
    const page = await app.render('/', { headers: { 'x-user': 'ada' } });

    expect(page.html).toContain('user:ada');
    app.close();
  });

  it('lets the test force ctx values over the resolved ones', async () => {
    const app = await createTestApp(FIXTURE, { ctx: { user: 'forced' } });
    const page = await app.render('/', { headers: { 'x-user': 'ada' } });

    expect(page.html).toContain('user:forced');
    app.close();
  });
});

describe('createTestApp exposes the page manifest', () => {
  it('lists the route patterns and the api tools of the rendered page', async () => {
    const app = await createTestApp(FIXTURE);
    const manifest = (await app.manifest('/products/42')) as { routes: string[]; tools: { name: string }[] };

    expect(manifest.routes).toContain('/products/[id]');
    expect(manifest.tools.map((tool) => tool.name)).toContain('api.catalog.catalog');
    app.close();
  });
});

describe('createTestApp honors mockApi during SSR', () => {
  it('renders the mocked api result inside the page island', async () => {
    mockApi(catalog, () => ({ items: ['mock-x', 'mock-y'] }));
    const app = await createTestApp(FIXTURE);
    const page = await app.render('/products/1');

    expect(page.html).toContain('items:mock-x,mock-y');
    expect(page.html).not.toContain('real-a');
    app.close();
  });
});

describe('createTestApp cleans up after itself', () => {
  it('close() restores the previously published app root', async () => {
    const previous = process.env.JANUX_APP_ROOT;
    const app = await createTestApp(FIXTURE);

    app.close();

    expect(process.env.JANUX_APP_ROOT).toBe(previous);
  });
});
