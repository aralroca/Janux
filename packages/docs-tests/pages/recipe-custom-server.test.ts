import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { api, createJanuxServer } from '@janux/server';
import { sendFetchResponse, toFetchRequest } from '@janux/vite';
import { jsx, schema, str } from 'janux';
import { docExample } from '../doc-example';

/**
 * recipes/custom-server.md is a wrapper around server.fetch, so the wrapper is
 * what runs here: the documented handler is extracted and driven with real
 * Requests — static-first ordering, the framework paths it delegates, the
 * middleware that reaches /_janux/*, and the node adapter round trip.
 */

const STUB = {
  "import { prodServerOptions } from '@janux/cli';":
    'const prodServerOptions = async (root: string) => (globalThis as any).__serverOptions(root);',
};

const ping = api({ input: schema({ name: str() }), run: ({ input }: any) => `pong:${input.name}` });
const routes = {
  '/': ({ ctx }: any) => jsx('h1', { children: `home:${ctx.user ?? 'anon'}` }),
  '/about': () => jsx('p', { children: 'about' }),
};

let root: string;
let options: Record<string, unknown> = {};
let handler: (request: Request) => Promise<Response>;

(globalThis as any).__serverOptions = async () => options;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'janux-custom-server-'));
  await Bun.write(join(root, 'dist/client/hello.txt'), 'static bytes');
  options = { routes, apis: { shop: { ping } }, ctxFor: (req: Request) => ({ user: req.headers.get('x-user') }) };
  const { createHandler } = await docExample('apps/docs/content/recipes/custom-server.md', 0, STUB);

  handler = await createHandler(root);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

const get = (path: string, headers?: Record<string, string>) =>
  handler(new Request(`http://localhost${path}`, { headers }));

describe('recipes/custom-server.md', () => {
  it('renders a page through the wrapped server', async () => {
    const response = await get('/');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<h1>home:anon</h1>');
  });

  it('serves the built asset before delegating', async () => {
    expect(await (await get('/hello.txt')).text()).toBe('static bytes');
  });

  it('server.fetch itself never reads from disk — that is why the order is yours', async () => {
    const bare = createJanuxServer(options as any);

    expect((await bare.fetch(new Request('http://localhost/hello.txt'))).status).toBe(404);
  });

  it('delegates the framework paths: api envelope, manifest and .md projection', async () => {
    const invoked = await handler(
      new Request('http://localhost/_janux/api/shop.ping', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
        body: JSON.stringify({ name: 'ada' }),
      }),
    );

    expect(await invoked.json()).toEqual({ ok: true, result: 'pong:ada' });

    const manifest: any = await (await get('/_janux/manifest?path=/')).json();

    expect(manifest.routes).toContain('/about');
    expect(await (await get('/about.md')).text()).toContain('about');
  });

  it('404s an unknown path', async () => {
    expect((await get('/nope')).status).toBe(404);
  });

  it('ctxFor builds the ctx the route reads', async () => {
    expect(await (await get('/', { 'x-user': 'ada' })).text()).toContain('<h1>home:ada</h1>');
  });

  it('ServerOptions.middleware short-circuits before routing, /_janux/* included', async () => {
    const guarded = createJanuxServer({
      ...(options as any),
      middleware: (req: Request) =>
        new URL(req.url).pathname.startsWith('/_janux/') ? new Response('Forbidden', { status: 403 }) : undefined,
    });

    expect((await guarded.fetch(new Request('http://localhost/_janux/manifest?path=/'))).status).toBe(403);
    expect((await guarded.fetch(new Request('http://localhost/'))).status).toBe(200);
  });

  it('the node adapter round-trips req/res through the same handler', async () => {
    const nodeReq = { method: 'GET', url: '/', headers: { host: 'localhost' } } as any;
    const response = await handler(await toFetchRequest(nodeReq));
    const written: { status?: number; body: string } = { body: '' };
    const decoder = new TextDecoder();
    // Pages stream, so the adapter writes chunk by chunk and ends empty.
    const nodeRes = {
      writeHead: (status: number) => (written.status = status),
      once: () => undefined,
      write: (chunk: Uint8Array) => (written.body += decoder.decode(chunk, { stream: true })),
      end: () => undefined,
    } as any;

    await sendFetchResponse(nodeRes, response);

    expect(written.status).toBe(200);
    expect(written.body).toContain('<h1>home:anon</h1>');
  });
});
