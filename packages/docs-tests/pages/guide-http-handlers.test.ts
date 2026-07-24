import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJanuxServer } from '@janux/server';

/**
 * guide/http-handlers.md documents a file tree, a bag and three protocol rules.
 * The tree is built for real in a temp dir and served through createJanuxServer,
 * so the segment grammar, the { req, params, ctx, url } bag, the 405 + Allow
 * header, the HEAD→GET fallback and multipart uploads all run.
 */

function handlersApp() {
  const root = mkdtempSync(join(tmpdir(), 'janux-handlers-'));
  const write = (path: string, source: string) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), source);
  };

  write('healthcheck.ts', `export function GET() { return Response.json({ status: 'Healthy' }); }`);
  write(
    'orders/[id].ts',
    `export function GET({ params, ctx, url }) {
       return Response.json({ id: params.id, role: ctx.role ?? null, query: url.searchParams.get('q') });
     }`,
  );
  write('webhooks/stripe.ts', `export async function POST({ req }) {
       const event = await req.json();

       return new Response(null, { status: 204, headers: { 'x-event': event.type } });
     }`);
  write('upload.ts', `export async function POST({ req }) {
       const form = await req.formData();
       const file = form.get('file');

       return Response.json({ name: file.name, size: file.size });
     }`);
  write('files/[...rest].ts', `export function GET({ params }) { return Response.json({ rest: params.rest }); }`);

  return createJanuxServer({
    httpHandlers: { dir: root, loadModule: (file) => import(file) },
    ctxFor: (req) => ({ role: req.headers.get('x-role') ?? undefined }),
  });
}

const app = handlersApp();
const call = (path: string, init?: RequestInit) => app.fetch(new Request(`http://test${path}`, init));

describe('guide/http-handlers.md', () => {
  it('mounts the tree at /api and dispatches by method export', async () => {
    const response = await call('/api/healthcheck');

    expect(await response.json()).toEqual({ status: 'Healthy' });
  });

  it('gives the handler { req, params, ctx, url } — the same ctx pages get', async () => {
    const response = await call('/api/orders/o42?q=refund', { headers: { 'x-role': 'admin' } });

    expect(await response.json()).toEqual({ id: 'o42', role: 'admin', query: 'refund' });
  });

  it('uses the page segment grammar, catch-alls included', async () => {
    expect(await (await call('/api/files/a/b/c')).json()).toEqual({ rest: 'a/b/c' });
  });

  it('405s an undeclared method with an Allow header', async () => {
    const response = await call('/api/healthcheck', { method: 'DELETE' });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toContain('GET');
  });

  it('falls back from HEAD to GET', async () => {
    expect((await call('/api/healthcheck', { method: 'HEAD' })).status).toBe(200);
  });

  it('lets a handler own its status and headers (204, no body)', async () => {
    const response = await call('/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify({ type: 'payment_intent.succeeded' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('x-event')).toBe('payment_intent.succeeded');
  });

  it('reads a multipart upload with the platform API', async () => {
    const form = new FormData();

    form.set('file', new File(['hello world'], 'note.txt', { type: 'text/plain' }));
    const response = await call('/api/upload', { method: 'POST', body: form });

    expect(await response.json()).toEqual({ name: 'note.txt', size: 11 });
  });

  it('404s a path with no handler file', async () => {
    expect((await call('/api/nope')).status).toBe(404);
  });
});
