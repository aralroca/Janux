import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { dropzone, type UploadProgress } from './upload';

/**
 * zone.upload(): the multipart XHR transport behind onProgress. XMLHttpRequest
 * is faked so the tests drive upload-progress and load events deterministically.
 */

type Listener = (event: { loaded: number; total: number }) => void;

class FakeXHR {
  static instances: FakeXHR[] = [];
  method = '';
  url = '';
  sent: FormData | null = null;
  status = 0;
  responseText = '';
  upload = {
    listeners: new Map<string, Listener>(),
    addEventListener(name: string, listener: Listener) {
      this.listeners.set(name, listener);
    },
  };
  listeners = new Map<string, () => void>();

  addEventListener(name: string, listener: () => void) {
    this.listeners.set(name, listener);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send(body: FormData) {
    this.sent = body;
    FakeXHR.instances.push(this);
  }

  emitProgress(loaded: number, total: number) {
    this.upload.listeners.get('progress')?.({ loaded, total });
  }

  finish(status: number, responseText: string) {
    this.status = status;
    this.responseText = responseText;
    this.listeners.get('load')?.();
  }

  fail() {
    this.listeners.get('error')?.();
  }
}

const realXHR = globalThis.XMLHttpRequest;

beforeAll(() => {
  GlobalRegistrator.register();
  (globalThis as any).XMLHttpRequest = FakeXHR;
});

afterAll(() => {
  (globalThis as any).XMLHttpRequest = realXHR;
  GlobalRegistrator.unregister();
});

beforeEach(() => {
  FakeXHR.instances = [];
});

const file = (name: string, bytes = 10) => new File([new Uint8Array(bytes)], name, { type: 'image/png' });

describe('zone.upload', () => {
  it('POSTs each file as multipart under the default "file" field', async () => {
    const zone = dropzone({ onFiles: () => {} });
    const pending = zone.upload('/api/uploads', [file('a.png'), file('b.png')]);

    expect(FakeXHR.instances.length).toBe(2);
    expect(FakeXHR.instances[0]!.method).toBe('POST');
    expect(FakeXHR.instances[0]!.url).toBe('/api/uploads');
    expect((FakeXHR.instances[0]!.sent!.get('file') as File).name).toBe('a.png');
    expect((FakeXHR.instances[1]!.sent!.get('file') as File).name).toBe('b.png');
    FakeXHR.instances.forEach((xhr) => xhr.finish(201, '{}'));
    await pending;
  });

  it('honors a custom multipart field name', async () => {
    const zone = dropzone({ onFiles: () => {} });
    const pending = zone.upload('/api/uploads', [file('a.png')], 'attachment');

    expect((FakeXHR.instances[0]!.sent!.get('attachment') as File).name).toBe('a.png');
    FakeXHR.instances[0]!.finish(201, '{}');
    await pending;
  });

  it('reports per-file progress and guarantees a final sent === total tick', async () => {
    const seen: UploadProgress[] = [];
    const zone = dropzone({ onFiles: () => {}, onProgress: (progress) => seen.push(progress) });
    const pending = zone.upload('/api/uploads', [file('a.png', 100)]);

    FakeXHR.instances[0]!.emitProgress(40, 120);
    FakeXHR.instances[0]!.finish(201, '{}');
    await pending;

    expect(seen.map(({ sent, total }) => ({ sent, total }))).toEqual([
      { sent: 40, total: 120 },
      { sent: 100, total: 100 },
    ]);
    expect(seen.every((progress) => progress.file.name === 'a.png')).toBe(true);
  });

  it('resolves outcomes with the parsed JSON body and an ok flag', async () => {
    const zone = dropzone({ onFiles: () => {} });
    const pending = zone.upload('/api/uploads', [file('a.png'), file('b.png')]);

    FakeXHR.instances[0]!.finish(201, '{"id":"up_1"}');
    FakeXHR.instances[1]!.finish(413, '{"error":"too big"}');
    const [first, second] = await pending;

    expect(first).toMatchObject({ ok: true, status: 201, body: { id: 'up_1' } });
    expect(second).toMatchObject({ ok: false, status: 413, body: { error: 'too big' } });
  });

  it('a network error resolves ok:false without sinking the rest of the batch', async () => {
    const zone = dropzone({ onFiles: () => {} });
    const pending = zone.upload('/api/uploads', [file('a.png'), file('b.png')]);

    FakeXHR.instances[0]!.fail();
    FakeXHR.instances[1]!.finish(201, '{}');
    const [first, second] = await pending;

    expect(first).toMatchObject({ ok: false, status: 0 });
    expect(second!.ok).toBe(true);
  });
});
