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
  // The tree lives in a temp dir, so the fixture reaches @janux/server by its resolved path.
  write('spool.ts', `import { rmSync, statSync } from 'node:fs';
     import { tmpdir } from 'node:os';
     import { join } from 'node:path';
     import { acceptsType, spoolMultipart } from ${JSON.stringify(Bun.resolveSync('@janux/server', import.meta.dir))};

     export async function POST({ req }) {
       const form = await spoolMultipart(req, { maxBytes: 4 * 1024 ** 3 });

       if (form instanceof Response) return form;
       try {
         const file = form.file('file');
         const destination = join(tmpdir(), 'janux-doc-upload.png');

         if (!acceptsType(file.sniffed, ['image/*'])) return Response.json({ error: 'images only' }, { status: 415 });
         await file.moveTo(destination);
         const moved = statSync(destination).size;

         rmSync(destination);

         return Response.json({ name: file.name, size: file.size, title: form.fields.title, moved });
       } finally {
         await form.cleanup();
       }
     }`);

  return createJanuxServer({
    httpHandlers: { dir: root, loadModule: (file) => import(file) },
    ctxFor: (req) => ({ role: req.headers.get('x-role') ?? undefined }),
  });
}

/** A real 1×1 PNG — the magic bytes `sniffed` reads. */
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG = Uint8Array.from(atob(PNG_BASE64), (char) => char.charCodeAt(0));
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

  it('spools a multipart upload to disk, validates the real bytes and moves it out', async () => {
    const form = new FormData();

    form.set('title', 'holiday');
    form.set('file', new File([PNG], 'pixel.png', { type: 'image/png' }));
    const response = await call('/api/spool', { method: 'POST', body: form });

    // `moved` is the size at the destination: the bytes survived spool → moveTo → cleanup.
    expect(await response.json()).toEqual({
      name: 'pixel.png',
      size: PNG.byteLength,
      title: 'holiday',
      moved: PNG.byteLength,
    });
  });

  it('415s an upload whose real bytes are not what it claims', async () => {
    const form = new FormData();

    form.set('file', new File(['plain text'], 'fake.png', { type: 'image/png' }));
    const response = await call('/api/spool', { method: 'POST', body: form });

    expect(response.status).toBe(415);
  });

  it('404s a path with no handler file', async () => {
    expect((await call('/api/nope')).status).toBe(404);
  });
});
