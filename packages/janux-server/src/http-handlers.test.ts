import { describe, expect, it } from 'bun:test';
import { createJanuxServer } from './server';

const API = `${import.meta.dirname}/__fixtures__/api`;

function server() {
  return createJanuxServer({
    httpHandlers: { dir: API, loadModule: (file) => import(file) },
  });
}

describe('src/api/** http handlers', () => {
  it('dispatches GET to the method export', async () => {
    const res = await server().fetch(new Request('http://x/api/health'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('dispatches POST and reads the body', async () => {
    const res = await server().fetch(new Request('http://x/api/health', { method: 'POST', body: 'hi' }));

    expect(res.status).toBe(201);
    expect(await res.text()).toBe('echo:hi');
  });

  it('405s an undeclared method with an Allow header', async () => {
    const res = await server().fetch(new Request('http://x/api/health', { method: 'DELETE' }));

    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toContain('GET');
  });

  it('resolves dynamic params', async () => {
    const res = await server().fetch(new Request('http://x/api/orders/o42'));

    expect(await res.json()).toEqual({ id: 'o42' });
  });

  it('reads multipart form-data uploads', async () => {
    const form = new FormData();

    form.set('file', new File(['hello world'], 'note.txt'));
    const res = await server().fetch(new Request('http://x/api/upload', { method: 'POST', body: form }));

    expect(await res.json()).toEqual({ name: 'note.txt', size: 11 });
  });

  it('404s an unknown handler path', async () => {
    const res = await server().fetch(new Request('http://x/api/nope'));

    expect(res.status).toBe(404);
  });
});
