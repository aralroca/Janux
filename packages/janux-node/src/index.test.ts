import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { runAdapter } from '@janux/cli/adapter/build';
import { capabilities, node, BUILD_DIR } from './index';

/**
 * The adapter, run for real against a fixture app and then served by an actual
 * `node` process. Nothing here mocks the boundary: the failure this package
 * exists to prevent — "it builds, but Node cannot run it" — only shows up when
 * Node runs it.
 */

const APP = join(import.meta.dirname, '__fixtures__/node-app');
const BUILD = join(APP, BUILD_DIR);
const PORT = 31847;
const BASE = `http://localhost:${PORT}`;

let child: ReturnType<typeof Bun.spawn> | undefined;
let output = '';

/** Drains stdout as it arrives: reading it once at the end would race the assertions that need it. */
async function pump(stream: ReadableStream<Uint8Array>): Promise<void> {
  const decoder = new TextDecoder();

  for await (const chunk of stream) output += decoder.decode(chunk, { stream: true });
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      await fetch(BASE);

      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`the node server never came up. Its output was:\n${output}`);
}

beforeAll(async () => {
  // `adapt()` runs after `janux build`, so the client it copies has to exist.
  const built = Bun.spawnSync(['bun', join(import.meta.dirname, '../../janux-cli/bin.ts'), 'build'], { cwd: APP });

  if (!built.success) throw new Error(`janux build failed:\n${built.stderr.toString()}`);
  await runAdapter(node(), APP);

  child = Bun.spawn(['node', join(BUILD, 'index.js')], { env: { ...process.env, PORT: String(PORT) }, stdout: 'pipe', stderr: 'pipe' });
  void pump(child.stdout as ReadableStream<Uint8Array>);
  void pump(child.stderr as ReadableStream<Uint8Array>);
  await waitForServer();
}, 120_000);

afterAll(async () => {
  child?.kill();
  await rm(BUILD, { recursive: true, force: true });
  await rm(join(APP, 'dist'), { recursive: true, force: true });
  await rm(join(APP, '.janux'), { recursive: true, force: true });
});

describe('capabilities', () => {
  it('declares everything Node can actually do', () => {
    expect(capabilities).toEqual({ websocket: true, streaming: true, filesystem: true });
  });
});

describe('node().adapt', () => {
  it('writes a self-contained build: launcher, bundle, client and an ESM marker', async () => {
    expect(existsSync(join(BUILD, 'index.js'))).toBe(true);
    expect(existsSync(join(BUILD, '.janux/index.js'))).toBe(true);
    expect(existsSync(join(BUILD, 'client/client.js'))).toBe(true);
    expect(JSON.parse(await readFile(join(BUILD, 'package.json'), 'utf8'))).toEqual({ type: 'module' });
  });

  it('leaves no bare specifier for a box with no node_modules to resolve', async () => {
    const bundle = await readFile(join(BUILD, '.janux/index.js'), 'utf8');

    expect(bundle).not.toContain("from '@janux/server'");
    expect(bundle).not.toContain("from 'janux'");
    expect(bundle).not.toContain("from '@janux/cli'");
  });
});

/** The acceptance criterion, asserted rather than assumed: SSR served by node, with no Bun involved. */
describe('the built app under node', () => {
  it('server-renders the page', async () => {
    const response = await fetch(`${BASE}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('Served by Node');
  });

  it('reports the node version it is running on, so nobody has to guess', () => {
    expect(output).toContain('janux-node: serving on');
    expect(output).toMatch(/\(node \d+\.\d+\.\d+\)/);
  });

  it('serves the built client with the cache headers the static handler assigns', async () => {
    const response = await fetch(`${BASE}/client.js`, { headers: { 'accept-encoding': 'br' } });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(response.headers.get('content-encoding')).toBe('br');
  });

  it('answers the agent manifest, so the agent surface survives the deployment', async () => {
    const response = await fetch(`${BASE}/_janux/manifest?path=%2F`);

    expect(response.status).toBe(200);
    // The route list is the part that proves the deployment kept its shape: it
    // comes from the routes directory the adapter copied, not from the bundle.
    expect(await response.json()).toMatchObject({ janux: '0.1', routes: ['/'] });
  });

  it('404s a path no route matches, rather than falling through to the static handler', async () => {
    expect((await fetch(`${BASE}/nothing-here`)).status).toBe(404);
  });
});
