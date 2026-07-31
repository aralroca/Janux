import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { createJanuxServer } from '@janux/server';
import { prodServerOptions } from './prod';

const FIXTURE = join(import.meta.dirname, '__fixtures__/suspense-app');

/**
 * Stands in for `janux build`'s output. The sources are committed, but its
 * `dist/` is not — .gitignore excludes every `dist/`, so an on-disk copy would
 * pass locally and vanish in CI. The fixture must live inside the workspace
 * (a tmpdir cannot resolve `janux`), so the build artifacts are written here.
 */
function builtApp(): string {
  mkdirSync(join(FIXTURE, 'dist/client'), { recursive: true });
  writeFileSync(join(FIXTURE, 'dist/client/islands.json'), JSON.stringify({ 'lazy-panel': '' }));
  writeFileSync(join(FIXTURE, 'dist/client/client.js'), '// stub: prodServerOptions only checks it exists\n');

  return FIXTURE;
}

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
    const options = await prodServerOptions(builtApp());

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
    const server = createJanuxServer(await prodServerOptions(builtApp()));
    const response = await server.fetch(new Request('http://test/'));
    const html = await response.text();

    expect(html).toContain('rows:2');
    expect(html).toContain('key="jx-runtime"');
    expect(html).toContain('src="/client.js"');
  });
});

/** First-class WebSockets + config-level MCP auth reach production through the same wiring dev uses. */
describe('prodServerOptions websocket and mcpAuth', () => {
  const app = (files: Record<string, string>): string => {
    const root = mkdtempSync(join(tmpdir(), 'janux-prod-ws-'));

    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
    mkdirSync(join(root, 'src/routes'), { recursive: true });
    Object.entries(files).forEach(([name, content]) => writeFileSync(join(root, name), content));

    return root;
  };

  it('loads the src/ws.ts default export as ServerOptions.websocket', async () => {
    const root = app({ 'src/ws.ts': `export default { path: '/ws', message: () => undefined };` });
    const options = await prodServerOptions(root);

    expect(options.websocket?.path).toBe('/ws');
    expect(typeof options.websocket?.message).toBe('function');
  });

  it('leaves websocket undefined without the module', async () => {
    expect((await prodServerOptions(app({}))).websocket).toBeUndefined();
  });

  it('maps mcpAuth from janux.config.ts onto the bearer verifier the endpoint enforces', async () => {
    const root = app({ 'janux.config.ts': `export default { mcpAuth: { token: 'demo-token' } };` });
    const server = createJanuxServer(await prodServerOptions(root));
    const rpc = (headers: Record<string, string> = {}) =>
      server.fetch(
        new Request('http://test/_janux/mcp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        }),
      );
    const denied = await rpc();

    expect(denied.status).toBe(401);
    expect(denied.headers.get('www-authenticate')).toContain('Bearer');
    expect((await rpc({ authorization: 'Bearer demo-token' })).status).toBe(200);
  });
});

describe('prodServerOptions and the app root', () => {
  const previous = process.env.JANUX_APP_ROOT;

  afterEach(() => {
    if (previous === undefined) delete process.env.JANUX_APP_ROOT;
    else process.env.JANUX_APP_ROOT = previous;
  });

  /**
   * Building options is not serving: tooling builds them for apps it will never
   * run, and a root left behind by one of those points the *next* app's modules
   * at someone else's files. `start`, the static prerender and a deployment
   * adapter publish it; this does not.
   */
  it('does not publish an app root of its own', async () => {
    process.env.JANUX_APP_ROOT = '/srv/other';
    await prodServerOptions(builtApp());

    expect(process.env.JANUX_APP_ROOT).toBe('/srv/other');
  });
});
