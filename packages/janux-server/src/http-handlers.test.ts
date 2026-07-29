import { describe, expect, it } from 'bun:test';
import { createJanuxServer } from './server';
import { formDataWithin, matchesType, readBodyWithin, rejectOversized, sniffContentType } from './http-handlers';

const API = `${import.meta.dirname}/__fixtures__/api`;

/** A real 1×1 PNG — magic bytes and all. */
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG = Uint8Array.from(atob(PNG_BASE64), (char) => char.charCodeAt(0));
const ascii = (text: string) => new TextEncoder().encode(text);

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

const chunked = (chunks: Uint8Array[], onCancel?: () => void) =>
  new Request('http://x/api/upload', {
    method: 'POST',
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      },
      cancel: onCancel,
    }),
  });

describe('rejectOversized', () => {
  it('413s from content-length alone, before any body byte is consumed', async () => {
    const req = new Request('http://x/api/upload', { method: 'POST', headers: { 'content-length': '2048' }, body: 'x' });
    const res = rejectOversized(req, 1024);

    expect(res?.status).toBe(413);
    expect(((await res?.json()) as any).error).toContain('exceeds');
    expect(req.bodyUsed).toBe(false);
  });

  it('passes requests within the limit or without a declared length', () => {
    const declared = new Request('http://x', { method: 'POST', headers: { 'content-length': '10' }, body: 'hi' });

    expect(rejectOversized(declared, 1024)).toBeNull();
    expect(rejectOversized(new Request('http://x'), 1024)).toBeNull();
  });
});

describe('readBodyWithin', () => {
  it('reads a chunked body that stays within the limit', async () => {
    const bytes = await readBodyWithin(chunked([ascii('hello '), ascii('world')]), 64);

    expect(bytes).toEqual(ascii('hello world'));
  });

  it('cuts a chunked body the moment it exceeds the limit, cancelling the stream', async () => {
    // A pull-based source, like a real network body: chunks arrive on demand, endlessly.
    let cancelled = false;
    const endless = new Request('http://x/api/upload', {
      method: 'POST',
      body: new ReadableStream<Uint8Array>({
        pull: (controller) => controller.enqueue(ascii('123456')),
        cancel: () => {
          cancelled = true;
        },
      }),
    });
    const res = await readBodyWithin(endless, 8);

    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(413);
    expect(cancelled).toBe(true);
  });
});

describe('formDataWithin', () => {
  it('parses multipart bodies under the limit', async () => {
    const form = new FormData();

    form.set('file', new File([PNG], 'pixel.png', { type: 'image/png' }));
    const result = await formDataWithin(new Request('http://x/api/upload', { method: 'POST', body: form }), 10_000);

    expect(result).toBeInstanceOf(FormData);
    expect(((result as FormData).get('file') as File).name).toBe('pixel.png');
  });

  it('413s an oversized multipart body without handing it to the parser', async () => {
    const form = new FormData();

    form.set('file', new File([new Uint8Array(4096)], 'big.bin'));
    const result = await formDataWithin(new Request('http://x/api/upload', { method: 'POST', body: form }), 1024);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(413);
  });
});

describe('sniffContentType / matchesType', () => {
  it('identifies the common formats from real magic bytes', () => {
    expect(sniffContentType(PNG)).toBe('image/png');
    expect(sniffContentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffContentType(ascii('GIF89a'))).toBe('image/gif');
    expect(sniffContentType(ascii('RIFF\0\0\0\0WEBP'))).toBe('image/webp');
    expect(sniffContentType(ascii('%PDF-1.7'))).toBe('application/pdf');
    expect(sniffContentType(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('application/zip');
    expect(sniffContentType(ascii('hello world'))).toBeUndefined();
  });

  it('unmasks a text file renamed to .png: the declared type does not matter', async () => {
    const fake = new File([ascii('not an image')], 'fake.png', { type: 'image/png' });
    const real = new File([PNG], 'pixel.png', { type: 'image/png' });

    expect(await matchesType(fake, ['image/*'])).toBe(false);
    expect(await matchesType(real, ['image/*'])).toBe(true);
  });

  it('matches exact patterns as well as wildcards', async () => {
    const pdf = new File([ascii('%PDF-1.4 minimal')], 'doc.pdf', { type: 'application/pdf' });

    expect(await matchesType(pdf, ['application/pdf'])).toBe(true);
    expect(await matchesType(pdf, ['image/*'])).toBe(false);
  });
});
