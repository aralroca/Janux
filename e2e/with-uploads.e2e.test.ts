import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type Browser } from 'playwright';
import { createTestApp, isBuilt, launchBrowser, openPage as newPage, startTestServer } from '@janux/testing';
import { TIMEOUT, appRoot } from './support/app';

/**
 * What examples/with-uploads exists to demonstrate: file uploads end to end —
 * dropzone() (drag & drop, paste, click-to-pick) feeding a multipart
 * POST /api/uploads handler that validates type and size server-side, with the
 * gallery server-rendered from the same store agents read via api.uploads.list.
 */

const APP = appRoot('examples/with-uploads');
const BUILT = isBuilt(APP);

/** Mirrors MAX_SIZE_BYTES in src/limits.ts — the contract the handler enforces. */
const MAX_SIZE = 1024 * 1024;

/** A real 1×1 PNG, decoded inline so no binary ever lands in the repo. */
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_1X1 = Uint8Array.from(atob(PNG_BASE64), (char) => char.charCodeAt(0));

let app: Awaited<ReturnType<typeof createTestApp>>;
let BASE = '';
let stop: (() => void) | undefined;
let browser: Browser | undefined;

const upload = (file: File) => {
  const body = new FormData();

  body.set('file', file);

  return app.server.fetch(new Request('http://test/api/uploads', { method: 'POST', body }));
};

const listedNames = async () => {
  const body: any = await (await app.server.fetch(new Request('http://test/api/uploads'))).json();

  return body.uploads.map((entry: any) => entry.name);
};

beforeAll(async () => {
  app = await createTestApp(APP);
  if (!BUILT) return;
  ({ url: BASE, stop } = await startTestServer(APP));
  browser = await launchBrowser();
});

afterAll(async () => {
  stop?.();
});

describe('examples/with-uploads server side', () => {
  it('server-renders the empty gallery with the drop target', async () => {
    const html = await (await app.fetch('/')).text();

    expect(html).toContain('<title>Janux — file uploads</title>');
    expect(html).toContain('Choose files');
    expect(html).toContain('No uploads yet');
    expect(html).toContain('uploads:0');
    expect(html).not.toContain('class="error"');
  });

  it('exposes the upload surface to agents: listing auto, forbidden picker unlisted', async () => {
    const manifest: any = await (await app.fetch('/_janux/manifest')).json();
    const guards = Object.fromEntries(manifest.tools.map((tool: any) => [tool.name, tool.guard]));

    expect(guards['api.uploads.list']).toBe('auto');
    expect(guards['gallery.refresh']).toBe('auto');
    // guard: 'forbidden' means not-a-tool: the picker never reaches the manifest.
    expect(guards['gallery.pick']).toBeUndefined();
  });

  it('accepts a multipart image POST, persists it and lists it', async () => {
    const response = await upload(new File([PNG_1X1], 'pixel.png', { type: 'image/png' }));
    const meta: any = await response.json();

    expect(response.status).toBe(201);
    expect(meta.id).toMatch(/^up_/);
    expect(meta).toMatchObject({ name: 'pixel.png', type: 'image/png', size: PNG_1X1.byteLength });
    expect(await listedNames()).toContain('pixel.png');
    // The bytes round-trip with their MIME type…
    const shot = await app.server.fetch(new Request(`http://test/api/uploads/${meta.id}`));

    expect(shot.status).toBe(200);
    expect(shot.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await shot.arrayBuffer())).toEqual(PNG_1X1);
    // …and the gallery page now server-renders the upload.
    const html = await (await app.fetch('/')).text();

    expect(html).toContain('pixel.png');
    expect(html).toContain('uploads:1');
  });

  it('rejects a non-image with a clear error, persisting nothing', async () => {
    const response = await upload(new File(['plain text'], 'note.txt', { type: 'text/plain' }));
    const body: any = await response.json();

    expect(response.status).toBe(415);
    expect(body.error).toContain('only images are accepted');
    expect(await listedNames()).not.toContain('note.txt');
  });

  it('rejects an image over the size limit, persisting nothing', async () => {
    const oversized = new File([new Uint8Array(MAX_SIZE + 1)], 'huge.png', { type: 'image/png' });
    const response = await upload(oversized);
    const body: any = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toContain('exceeds');
    expect(await listedNames()).not.toContain('huge.png');
  });

  it('unmasks a text file renamed to .png: magic bytes beat the declared type', async () => {
    // The declared type lies (image/png) but the bytes are plain text —
    // matchesType() sniffs the real content and the handler 415s it.
    const renamed = new File(['just text pretending to be a picture'], 'fake.png', { type: 'image/png' });
    const response = await upload(renamed);
    const body: any = await response.json();

    expect(response.status).toBe(415);
    expect(body.error).toContain('only images are accepted');
    expect(await listedNames()).not.toContain('fake.png');
  });

  it('cuts a grossly oversized body early with 413, before buffering it', async () => {
    // formDataWithin() refuses this from content-length (or mid-stream) —
    // the multipart parser never sees the 3 MB body.
    const massive = new File([new Uint8Array(3 * MAX_SIZE)], 'massive.png', { type: 'image/png' });
    const response = await upload(massive);
    const body: any = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toContain('exceeds');
    expect(await listedNames()).not.toContain('massive.png');
  });
});

describe.skipIf(!BUILT)('examples/with-uploads in the browser', () => {
  it('uploads via the picker input: preview appears and the gallery grows without a reload', async () => {
    const { page, errors } = await newPage(browser!);

    await page.goto(`${BASE}/`);
    await page.evaluate(() => ((window as any).__samePage = true));
    await page.setInputFiles('.dropzone input[type="file"]', {
      name: 'browser.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_1X1),
    });
    await page.waitForSelector('.preview img');
    await page.waitForSelector('.gallery img[alt="browser.png"]');
    expect(await page.textContent('.preview figcaption')).toContain('browser.png');
    // zone.upload() guarantees a final sent === total progress tick, so the
    // persistent indicator deterministically lands on 100%.
    await page.waitForFunction(() => document.querySelector('.progress')?.textContent?.includes('100%'));
    // No reload: the sentinel survives, and the server really stored it.
    expect(await page.evaluate(() => (window as any).__samePage)).toBe(true);
    const body: any = await (await fetch(`${BASE}/api/uploads`)).json();

    expect(body.uploads.map((entry: any) => entry.name)).toContain('browser.png');
    expect(errors).toEqual([]);
    await page.close();
  }, TIMEOUT);
});
