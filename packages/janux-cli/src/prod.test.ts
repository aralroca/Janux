import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { createJanuxServer } from '@janux/server';
import { prodServerOptions } from './prod';

const FIXTURE = join(import.meta.dirname, '__fixtures__/suspense-app');

/**
 * A page whose ONLY island sits behind a suspense boundary has an empty SSR
 * registry when the interlude flushes (the island registers once its sources
 * resolve), so the runtime only ships if `islandModules` says the app has
 * islands. The build emits that catalog (`dist/client/islands.json`, see
 * @janux/vite) and production wiring must read it back — without it these
 * pages ship no boot(): no SPA nav, dead islands (found in examples/hacker-news).
 */
describe('prodServerOptions island catalog', () => {
  it('reads islandModules from the islands.json the build emitted', async () => {
    const options = await prodServerOptions(FIXTURE);

    expect(options.islandModules).toEqual({ 'lazy-panel': '' });
    expect(options.runtimeUrl).toBe('/client.js');
  });

  it('leaves islandModules undefined when the build emitted no catalog', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-prod-islands-'));

    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
    const options = await prodServerOptions(root);

    expect(options.islandModules).toBeUndefined();
  });

  it('ships the runtime on a page whose only island is suspended', async () => {
    const server = createJanuxServer(await prodServerOptions(FIXTURE));
    const response = await server.fetch(new Request('http://test/'));
    const html = await response.text();

    expect(html).toContain('rows:2');
    expect(html).toContain('key="jx-runtime"');
    expect(html).toContain('src="/client.js"');
  });
});
