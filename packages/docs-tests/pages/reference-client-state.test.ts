import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { dropzone, persistStore, urlState } from 'janux/client';
import { createInstance, enums, intent, schema, store, str } from 'janux';

/**
 * reference/client-state.md, table row by table row: the versioned persist
 * envelope (and what a stale version does), urlState's validation, replace
 * default and popstate awareness, and dropzone's filters — including the promise
 * that `onFiles` is never called with an empty list.
 */

beforeAll(() => GlobalRegistrator.register({ url: 'http://localhost/list' }));
afterAll(() => GlobalRegistrator.unregister());

const theme = store({
  name: 'theme',
  state: schema({ mode: enums(['dark', 'light']).default('light'), isLoading: str().default('') }),
  intents: {
    setMode: intent({
      description: 'Set the mode',
      input: schema({ mode: enums(['dark', 'light']) }),
      run: ({ state, input }: any) => (state.mode = input.mode),
    }),
  },
});

async function persisted(config: Record<string, unknown> = {}) {
  const instance = createInstance(theme);

  await instance.attach();
  persistStore(instance as any, config as any);

  return instance;
}

describe('reference/client-state.md — persistStore', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to the janux:store:<name> key and restores on boot', async () => {
    const first = await persisted();

    await first.intents.setMode({ mode: 'dark' });
    await Bun.sleep(5);

    expect(localStorage.getItem('janux:store:theme')).toContain('dark');
    const second = await persisted();

    await Bun.sleep(5);

    expect(second.snapshot().mode).toBe('dark');
  });

  it('partialize keeps transient fields out of storage', async () => {
    const instance = await persisted({ name: 'app:theme', partialize: (state: any) => ({ mode: state.mode }) });

    await instance.intents.setMode({ mode: 'dark' });
    await Bun.sleep(5);

    expect(localStorage.getItem('app:theme')).not.toContain('isLoading');
  });

  it('drops an older payload instead of crashing boot when there is no migrate', async () => {
    localStorage.setItem('app:v', JSON.stringify({ v: 0, s: { mode: 'nonsense' } }));
    const instance = await persisted({ name: 'app:v', version: 2 });

    await Bun.sleep(5);

    expect(instance.snapshot().mode).toBe('light'); // the schema default, not the stale value
  });

  it('runs migrate when the stored version is older', async () => {
    localStorage.setItem('app:m', JSON.stringify({ v: 1, s: { dark: true } }));
    const instance = await persisted({
      name: 'app:m',
      version: 2,
      migrate: (stored: any, from: number) => (from < 2 ? { mode: stored.dark ? 'dark' : 'light' } : stored),
    });

    await Bun.sleep(5);

    expect(instance.snapshot().mode).toBe('dark');
  });
});

describe('reference/client-state.md — urlState', () => {
  beforeEach(() => history.replaceState({}, '', '/list'));

  it('validates the raw param and falls back when it cannot', () => {
    history.replaceState({}, '', '/list?tag=display');

    expect(urlState('tag', str(), 'all').value.value).toBe('display');
    history.replaceState({}, '', '/list?tag=%7B%22not%22%3A%22a%20string%22%7D');

    expect(urlState('tag', str(), 'all').value.value).toBe('all'); // hand-edited URL cannot corrupt state
  });

  it('replaces history by default and pushes when told to', () => {
    const length = history.length;

    urlState('tag', str(), 'all').set('display');

    expect(history.length).toBe(length);
    urlState('page', str(), '1', { replace: false }).set('2');

    expect(history.length).toBe(length + 1);
  });

  it('re-reads the param on popstate so the signal matches the address bar', () => {
    const handle = urlState('tag', str(), 'all');

    history.replaceState({}, '', '/list?tag=video');
    window.dispatchEvent(new Event('popstate'));

    expect(handle.value.value).toBe('video');
  });

  it('clears the param when set back to the fallback', () => {
    const handle = urlState('tag', str(), 'all');

    handle.set('display');
    handle.set('all');

    expect(location.search).toBe('');
  });
});

describe('reference/client-state.md — dropzone', () => {
  const file = (name: string, type: string, size = 10) =>
    new File([new Uint8Array(size)], name, { type });

  it('filters by accept (wildcards included), size and multiple, and never fires empty', () => {
    const batches: string[][] = [];
    const zone = dropzone({
      accept: ['image/*', 'application/pdf'],
      multiple: true,
      maxSize: 100,
      onFiles: (files) => batches.push(files.map((entry) => entry.name)),
    });
    const host = document.createElement('div');
    const detach = zone.attach(host);
    const drop = (files: File[]) => {
      const transfer = new DataTransfer();

      files.forEach((entry) => transfer.items.add(entry));
      host.dispatchEvent(Object.assign(new Event('drop', { bubbles: true }), { dataTransfer: transfer }));
    };

    drop([file('a.png', 'image/png'), file('b.pdf', 'application/pdf'), file('c.txt', 'text/plain'), file('big.png', 'image/png', 500)]);

    expect(batches).toEqual([['a.png', 'b.pdf']]); // wrong type and oversized never reach onFiles
    drop([file('only.txt', 'text/plain')]);

    expect(batches).toHaveLength(1); // nothing passed → no empty call
    detach();
  });

  it('exposes isOver as a reactive signal while dragging', () => {
    const zone = dropzone({ onFiles: () => {} });
    const host = document.createElement('div');
    const detach = zone.attach(host);

    expect(zone.isOver.value).toBe(false);
    host.dispatchEvent(new Event('dragover', { bubbles: true }));

    expect(zone.isOver.value).toBe(true);
    host.dispatchEvent(new Event('dragleave', { bubbles: true }));

    expect(zone.isOver.value).toBe(false);
    detach();
  });

  it('zone.upload POSTs multipart per file, feeds onProgress and ends on a sent === total tick', async () => {
    // A stub transport: the page's claims are about what dropzone drives, not the network.
    const real = globalThis.XMLHttpRequest;
    const sent: Array<{ sent: number; total: number }> = [];
    const stub: any = {
      upload: { addEventListener: (_: string, listener: (event: any) => void) => (stub.progress = listener) },
      addEventListener: (name: string, listener: () => void) => (stub[name] = listener),
      open: (method: string, url: string) => Object.assign(stub, { method, url }),
      send: (body: FormData) => (stub.body = body),
      status: 201,
      responseText: '{"id":"up_1"}',
    };

    (globalThis as any).XMLHttpRequest = function XMLHttpRequest() {
      return stub;
    };
    const zone = dropzone({ onFiles: () => {}, onProgress: ({ sent: loaded, total }) => sent.push({ sent: loaded, total }) });
    const pending = zone.upload('/api/upload', [file('a.png', 'image/png', 40)]);

    stub.progress({ loaded: 10, total: 50 });
    stub.load();
    const [outcome] = await pending;

    (globalThis as any).XMLHttpRequest = real;

    expect(stub.method).toBe('POST');
    expect((stub.body.get('file') as File).name).toBe('a.png');
    expect(sent).toEqual([{ sent: 10, total: 50 }, { sent: 40, total: 40 }]); // guaranteed final tick
    expect(outcome).toMatchObject({ ok: true, status: 201, body: { id: 'up_1' } });
  });
});
