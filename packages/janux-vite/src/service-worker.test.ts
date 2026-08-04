import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { builtServiceWorker, retireServiceWorker, serviceWorkerAssets, serviceWorkerVersion } from './service-worker';

/**
 * The build's half of the contract: what a worker is handed to precache, and
 * what tells it that this deploy is a different deploy.
 *
 * The exclusions are the interesting part. A precached asset is answered
 * cache-first, so putting a document on the list is how a site pins its
 * visitors to one deploy — which is the exact failure the whole feature exists
 * to avoid. Sourcemaps are excluded because nothing fetches them but a devtools
 * pane, and precaching them would multiply the install cost of a first visit
 * for no offline benefit.
 */

const OUT = '/tmp/janux-sw-assets';

function fixture(files: Record<string, string>): string {
  rmSync(OUT, { recursive: true, force: true });
  Object.entries(files).forEach(([path, body]) => {
    mkdirSync(join(OUT, path, '..'), { recursive: true });
    writeFileSync(join(OUT, path), body);
  });

  return OUT;
}

const BUILD = {
  'client.js': 'boot()',
  'styles.css': 'body{}',
  'assets/app-a1b2c3d4.js': 'chunk',
  'favicon.svg': '<svg/>',
  'index.html': '<!doctype html>',
  'posts/index.html': '<!doctype html>',
  'client.js.map': '{"version":3}',
  'posts.md': '# posts',
  'islands.json': '{}',
  'sw.js': 'old worker',
};

describe('the precache manifest', () => {
  it('lists the hashed build output and static files, as URL paths', () => {
    expect(serviceWorkerAssets(fixture(BUILD))).toEqual([
      '/assets/app-a1b2c3d4.js',
      '/client.js',
      '/favicon.svg',
      '/styles.css',
    ]);
  });

  it('never lists a document: pages are answered network-first so a deploy is seen', () => {
    expect(serviceWorkerAssets(fixture(BUILD)).some((path) => path.endsWith('.html'))).toBe(false);
  });

  it('leaves out sourcemaps, page projections, build metadata and the worker itself', () => {
    const assets = serviceWorkerAssets(fixture(BUILD));

    expect(assets).not.toContain('/client.js.map');
    expect(assets).not.toContain('/posts.md');
    expect(assets).not.toContain('/islands.json');
    expect(assets).not.toContain('/sw.js');
  });

  it('uses forward slashes for nested files whatever the platform separator is', () => {
    expect(serviceWorkerAssets(fixture({ 'a/b/c.js': 'x' }))).toEqual(['/a/b/c.js']);
  });
});

describe('the build version', () => {
  it('is stable for identical output, so a rebuild does not churn caches for nothing', () => {
    const assets = serviceWorkerAssets(fixture(BUILD));
    const first = serviceWorkerVersion(OUT, assets);

    expect(serviceWorkerVersion(OUT, serviceWorkerAssets(fixture(BUILD)))).toBe(first);
  });

  it('changes when a file the visitor downloads changes, even at the same name', () => {
    const before = serviceWorkerVersion(OUT, serviceWorkerAssets(fixture(BUILD)));
    const after = serviceWorkerVersion(OUT, serviceWorkerAssets(fixture({ ...BUILD, 'favicon.svg': '<svg id="new"/>' })));

    expect(after).not.toBe(before);
  });

  it('changes when a file appears or disappears', () => {
    const before = serviceWorkerVersion(OUT, serviceWorkerAssets(fixture(BUILD)));
    const after = serviceWorkerVersion(OUT, serviceWorkerAssets(fixture({ ...BUILD, 'extra.js': 'x' })));

    expect(after).not.toBe(before);
  });
});

/**
 * Deleting `src/sw.ts` has to be enough to be rid of the worker. A stale
 * `sw.js` left in the output would keep being served and registered — and a
 * worker nobody meant to keep is the incident this feature is careful about.
 * A 404 on the script is also how a browser retires one it already installed.
 */
describe('retiring a worker', () => {
  it('removes a worker the app no longer has a source for', () => {
    const out = fixture({ 'sw.js': 'old worker', 'sw.js.map': '{}', 'client.js': 'x' });

    expect(retireServiceWorker(out)).toBe(true);
    expect(builtServiceWorker(out, undefined)).toBeUndefined();
    expect(existsSync(join(out, 'sw.js.map'))).toBe(false);
  });

  it('says nothing for an app that never had one', () => {
    expect(retireServiceWorker(fixture({ 'client.js': 'x' }))).toBe(false);
  });
});

describe('what the server registers', () => {
  it('serves the built worker when the build produced one', () => {
    expect(builtServiceWorker(fixture({ 'sw.js': 'worker' }), undefined)).toBe('/sw.js');
  });

  it('registers nothing before the first build, so `janux start` on a bare tree is quiet', () => {
    expect(builtServiceWorker(fixture({ 'client.js': 'x' }), undefined)).toBeUndefined();
  });

  it('honours `register: false`: the worker is built and served, but nobody is signed up for it', () => {
    expect(builtServiceWorker(fixture({ 'sw.js': 'worker' }), { register: false })).toBeUndefined();
  });
});
