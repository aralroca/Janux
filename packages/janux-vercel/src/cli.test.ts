import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseVercelArgs, runVercelInit, vercelFiles } from './cli';

describe('parseVercelArgs', () => {
  it('collects every --include and reads --max-duration', () => {
    expect(parseVercelArgs(['--include', 'content', '--include', 'data', '--max-duration', '60'])).toEqual({
      include: ['content', 'data'],
      maxDuration: 60,
    });
  });

  it('ignores a --max-duration that is not a number', () => {
    expect(parseVercelArgs(['--max-duration', 'soon']).maxDuration).toBeUndefined();
    expect(parseVercelArgs([])).toEqual({ include: [], maxDuration: undefined });
  });
});

describe('vercelFiles', () => {
  it('is the one file an app commits', () => {
    expect(Object.keys(vercelFiles({ output: 'bun' }))).toEqual(['vercel.json']);
    expect(Object.keys(vercelFiles({ output: 'static' }))).toEqual(['vercel.json']);
  });

  it('emits vercel.json as formatted JSON ending in a newline', () => {
    const json = vercelFiles({ output: 'static' })['vercel.json']!;

    expect(json.endsWith('\n')).toBe(true);
    expect(JSON.parse(json).$schema).toBe('https://openapi.vercel.sh/vercel.json');
  });
});

describe('runVercelInit', () => {
  it('reads the app\'s output mode and writes what that mode needs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-vercel-'));

    await Bun.write(join(root, 'janux.config.ts'), 'export default { output: "static" };\n');
    await runVercelInit([], root);

    expect(JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf-8')).cleanUrls).toBe(true);
    // Static: assets on the CDN, and no function to route anything to.
    expect(JSON.parse(readFileSync(join(root, '.vercel/output/config.json'), 'utf-8')).routes).toEqual([
      { handle: 'filesystem' },
    ]);
    expect(await Bun.file(join(root, '.vercel/output/functions/index.func/index.js')).exists()).toBe(false);
  });

  /** A server app gets the whole deployment: static assets, function, routes. */
  it('writes a Build Output API deployment for a server app', async () => {
    const app = join(import.meta.dirname, '__fixtures__/app');
    const output = join(app, '.vercel/output');

    await runVercelInit(['--include', 'content', '--max-duration', '60'], app);

    expect(JSON.parse(readFileSync(join(output, 'config.json'), 'utf-8')).routes).toEqual([
      { handle: 'filesystem' },
      { src: '/(.*)', dest: '/index' },
    ]);
    expect(JSON.parse(readFileSync(join(output, 'functions/index.func/.vc-config.json'), 'utf-8'))).toEqual({
      runtime: 'nodejs22.x',
      handler: 'index.js',
      launcherType: 'Nodejs',
      supportsResponseStreaming: true,
      maxDuration: 60,
    });
    expect(await Bun.file(join(output, 'functions/index.func/.janux/server.js')).exists()).toBe(true);
    // The routes tree travels with it: the router reads the directory at boot.
    expect(await Bun.file(join(output, 'functions/index.func/src/routes/index.tsx')).exists()).toBe(true);
  });
});
