import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HELP_TEXT, parseArgs, prodServerOptions } from '@janux/cli';
import { apiFiles, apiModuleName, apiStubModule, exportedApiNames, resolveAppConfig, toFetchRequest, sendFetchResponse } from '@janux/vite';

/**
 * reference/cli.md, reference/build-internals.md and
 * getting-started/project-structure.md: the conventions table (each path is
 * resolved from a real temp app), the eval file grammar ($steps refs and subset
 * matching), the api() stub pipeline and the Node⇄Fetch adapters.
 */

function app(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'janux-conventions-'));

  Object.entries(files).forEach(([path, content]) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  });

  return root;
}

describe('getting-started/project-structure.md — every conventional path', () => {
  it('resolves the whole table from a real app tree', async () => {
    const root = app({
      'package.json': '{"name":"x"}',
      'src/routes/index.tsx': 'export default () => null;',
      'src/server/shop.api.ts': 'export const noop = 1;',
      'src/api/upload.ts': 'export function POST() { return new Response(); }',
      'src/client.ts': 'export {};',
      'src/agent.ts': 'export default {};',
      'src/stores.ts': 'export {};',
      'src/ctx.ts': 'export default () => ({});',
      'src/middleware.ts': 'export default () => undefined;',
      'src/matchers.ts': 'export const slug = () => true;',
      'src/i18n.ts': 'export default {};',
      'src/styles.css': 'body{}',
      'public/favicon.svg': '<svg/>',
    });
    const config = await resolveAppConfig(root);

    expect(config.routesDir).toBe(join(root, 'src/routes'));
    expect(config.serverDir).toBe(join(root, 'src/server'));
    expect(config.httpHandlersDir).toBe(join(root, 'src/api'));
    expect(config.clientEntry).toBe(join(root, 'src/client.ts'));
    expect(config.agentModule).toBe(join(root, 'src/agent.ts'));
    expect(config.storesModule).toBe(join(root, 'src/stores.ts'));
    expect(config.ctxModule).toBe(join(root, 'src/ctx.ts'));
    expect(config.middlewareModule).toBe(join(root, 'src/middleware.ts'));
    expect(config.matchersModule).toBe(join(root, 'src/matchers.ts'));
    expect(config.i18nModule).toBe(join(root, 'src/i18n.ts'));
    expect(config.stylesheet).toBe(join(root, 'src/styles.css'));
    expect(config.favicon).toBe('/favicon.svg');
    expect(config.output).toBe('bun'); // documented default
  });

  it('leaves every optional convention undefined in a bare app, and stays 0 KB', async () => {
    const config = await resolveAppConfig(app({ 'package.json': '{"name":"x"}' }));

    expect(config.clientEntry).toBe(''); // no src/client.ts → fully static, 0 KB JS
    expect(config.agentModule).toBeUndefined();
    expect(config.ctxModule).toBeUndefined();
    expect(config.i18nModule).toBeUndefined();
  });

  it('reads janux.config.ts, which wins over the deprecated package.json field', async () => {
    const root = app({
      'package.json': JSON.stringify({ name: 'x', janux: { title: 'From pkg', output: 'static' } }),
      'janux.config.ts': `export default { title: 'From file' };`,
    });
    const config = await resolveAppConfig(root);

    expect(config.title).toBe('From file');
    expect(config.output).toBe('static'); // still honoured from the fallback
  });

  it('collects only *.api.ts files from the server dir, namespaced by filename', () => {
    const root = app({
      'package.json': '{}',
      'src/server/shop.api.ts': 'export const a = 1;',
      'src/server/helpers.ts': 'export const b = 2;',
    });

    expect(apiFiles(join(root, 'src/server')).map((file) => apiModuleName(file))).toEqual(['shop']);
  });
});

describe('reference/cli.md — the command line and eval grammar', () => {
  it('parses commands, ports and files the way the page documents', () => {
    expect(parseArgs(['dev', '--port', '4000'], '/app')).toMatchObject({ command: 'dev', port: 4000, root: '/app' });
    expect(parseArgs(['start'], '/app').port).toBe(3000);
    expect(parseArgs(['eval', 'evals/checkout.eval.json', '--json'], '/app')).toMatchObject({
      command: 'eval',
      files: ['evals/checkout.eval.json'],
      json: true,
    });
    expect(parseArgs(['eval', '--url', 'http://x:3000', '--start', 'janux start'], '/app')).toMatchObject({
      url: 'http://x:3000',
      startCommand: 'janux start',
    });
    expect(parseArgs(['nonsense'], '/app').command).toBe('help');
    expect(HELP_TEXT).toContain('janux verify');
  });

  /**
   * The eval grammar ($steps references, subset matching) is not importable —
   * it is exercised by packages/janux-cli's own eval-runner tests and by the
   * real `janux eval --start` run against examples/shop, whose scenario uses
   * both `$steps[1].result.id` and a partial `result` match.
   */
  it('exposes prodServerOptions for a custom server', () => {
    expect(typeof prodServerOptions).toBe('function');
  });
});

describe('reference/build-internals.md', () => {
  it('rewrites an api module into fetch stubs, dropping the server body', () => {
    const source = `
      import { api } from '@janux/server';
      import { db } from './db';
      export const list = api({ run: () => db.all() });
      export const remove = api({ run: () => db.wipe() });
      const helper = 1;
    `;

    expect(exportedApiNames(source)).toEqual(['list', 'remove']);
    const stub = apiStubModule('/app/src/server/orders.api.ts', source);

    expect(stub).toContain('orders.list');
    expect(stub).toContain('orders.remove');
    expect(stub).not.toContain('./db');
  });

  it('adapts a Node request and response to Fetch and back', async () => {
    const request = await toFetchRequest({ method: 'GET', url: '/x?y=1', headers: { host: 'app.test' } } as any);

    expect(request.url).toBe('http://app.test/x?y=1');
    const written: Record<string, unknown> = {};

    await sendFetchResponse(
      {
        writeHead: (status: number, headers: unknown) => Object.assign(written, { status, headers }),
        once: () => undefined,
        // Streamed responses arrive as chunks; `end` closes with nothing left.
        write: (chunk: Uint8Array) => (written.body = `${written.body ?? ''}${new TextDecoder().decode(chunk)}`),
        end: () => undefined,
      } as any,
      new Response('hello', { status: 201, headers: { 'x-test': '1' } }),
    );

    expect(written).toMatchObject({ status: 201, body: 'hello' });
    expect((written.headers as any)['x-test']).toBe('1');
  });
});
