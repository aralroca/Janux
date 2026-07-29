import { describe, expect, it } from 'bun:test';
import { createJanuxServer } from './server';

const APP = `${import.meta.dirname}/__fixtures__/error-pages`;
const BARE = `${import.meta.dirname}/__fixtures__/app`;

const server = createJanuxServer({ routesDir: APP });
const bare = createJanuxServer({ routesDir: BARE });

const get = (path: string, target = server) => target.fetch(new Request(`http://localhost${path}`));

describe('_404: the page an unmatched URL answers with', () => {
  it('renders with a 404 status, inside the app shell, with its own meta', async () => {
    const response = await get('/nope/at/all');
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('class="site-shell"');
    expect(html).toContain('No such page');
    expect(html).toContain('<title>Nothing here</title>');
  });

  /** "Renders nothing" and "is not there" are different answers, and only one of them is a 404. */
  it('leaves a page whose render is empty alone: a document, under a 200', async () => {
    const response = await get('/empty');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<html');
  });

  it('an app without the file still answers a bare 404', async () => {
    const response = await get('/nope/at/all', bare);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
  });
});

describe('notFound(): a matched page with nothing to show', () => {
  it('serves the _404 page under a 404 instead of a 200 "not found" page', async () => {
    const response = await get('/posts/missing');

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('No such page');
  });

  it('leaves the pages that do have something alone', async () => {
    const response = await get('/posts/hello');

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Hello world');
  });

  it('is not an error for the manifest or the .md projection', async () => {
    const manifest = await get('/_janux/manifest?path=/posts/missing');
    const markdown = await get('/posts/missing.md');

    expect(manifest.status).toBe(200);
    expect(markdown.status).toBe(404);
  });
});

describe('_500: the page a failed render answers with', () => {
  it('renders with a 500 status and receives the error', async () => {
    const response = await get('/boom');
    const html = await response.text();

    expect(response.status).toBe(500);
    expect(html).toContain('Broke: Error: page exploded');
  });

  it('renders on its own — the layout is code, and code is what failed', async () => {
    const html = await (await get('/boom')).text();

    expect(html).not.toContain('site-shell');
  });

  /** The client asks for the manifest of the page it just landed on — including this one. */
  it('does not take the manifest or the .md projection down with it', async () => {
    const manifest = await get('/_janux/manifest?path=/boom');
    const markdown = await get('/boom.md');

    expect(manifest.status).toBe(200);
    expect(((await manifest.json()) as any).tools).toEqual([]);
    expect(markdown.status).toBe(404);
  });

  /** Only the HTTP surface degrades: `janux verify` reads this one, and a page it cannot render is its finding. */
  it('still reports the failure through the manifestFor API', async () => {
    expect(server.manifestFor('/boom', {})).rejects.toThrow('page exploded');
  });

  it('an app without the file answers a bare 500', async () => {
    const explodes = createJanuxServer({
      routes: {
        '/boom': () => {
          throw new Error('page exploded');
        },
      },
    });
    const response = await get('/boom', explodes);

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Internal Server Error');
  });
});

describe('notFoundPage(): the _404 document for a static host', () => {
  it('is the same page, ready to be written to 404.html', async () => {
    const response = await server.notFoundPage();

    expect(response!.status).toBe(404);
    expect(await response!.text()).toContain('No such page');
  });

  it('is undefined when the app has no _404 page — nothing to write', async () => {
    expect(await bare.notFoundPage()).toBeUndefined();
  });
});
