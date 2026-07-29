import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { build } from 'vite';
import { islandNamesIn } from './islands';
import { janux } from './plugin';

describe('islandNamesIn', () => {
  it('extracts component() and foreign() names from top-level declarations', () => {
    const code = `
      export const A = component({ name: 'alpha', view: () => null });
      const B = foreign({ name: 'beta' });
      export const other = somethingElse({ name: 'nope' });
    `;

    expect(islandNamesIn(code)).toEqual(['alpha', 'beta']);
  });

  it('looks through as/satisfies wrappers and default exports', () => {
    const code = `
      export const A = component({ name: 'alpha' }) as any;
      export default component({ name: 'omega' });
    `;

    expect(islandNamesIn(code)).toEqual(['alpha', 'omega']);
  });

  it('retries the other JSX mode before declaring a module island-free', () => {
    const jsxInTs = `export const A = component({ name: 'alpha', view: () => <p>hi</p> });`;

    expect(islandNamesIn(jsxInTs, false)).toEqual(['alpha']);
  });

  it('ignores dynamic names and unparseable modules', () => {
    expect(islandNamesIn(`export const A = component({ name: dynamic });`)).toEqual([]);
    expect(islandNamesIn('const = broken (')).toEqual([]);
  });
});

/**
 * The client build catalogs every island def it bundles into
 * `dist/client/islands.json`. Production wiring reads it back as
 * `islandModules`: a page whose only islands sit behind suspense boundaries
 * has an empty SSR registry when the interlude flushes, and the catalog is
 * what still ships the runtime there (see @janux/cli prod.test.ts).
 */
describe('janux build island catalog', () => {
  it('emits islands.json mapping every island in the client graph', async () => {
    const root = join(import.meta.dirname, '__fixtures__/island-app');
    const outDir = mkdtempSync(join(tmpdir(), 'janux-islands-'));

    await build({
      root,
      logLevel: 'error',
      plugins: [janux()],
      build: { outDir, emptyOutDir: true, rollupOptions: { input: { client: join(root, 'src/client.ts') } } },
    });

    expect(JSON.parse(readFileSync(join(outDir, 'islands.json'), 'utf8'))).toEqual({ counter: '' });
  });
});
