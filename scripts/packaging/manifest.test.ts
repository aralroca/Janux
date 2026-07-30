/**
 * Lifting `publishConfig` onto the manifest, and putting the manifest back.
 *
 * The per-package assertions on the real files live in `published-shape.test.ts`;
 * this is the transform itself.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { advertisesSource, publishManifest, publishedPaths, withManifest } from './manifest';

const versions = new Map([
  ['janux', '9.9.9'],
  ['@janux/server', '9.9.9'],
]);

describe('publishManifest', () => {
  test('lifts publishConfig fields over the development ones', () => {
    const merged = publishManifest(
      {
        name: 'janux',
        main: './src/index.ts',
        exports: { '.': './src/index.ts' },
        publishConfig: {
          access: 'public',
          main: './dist/src/index.js',
          types: './dist/src/index.d.ts',
          exports: { '.': { types: './dist/src/index.d.ts', default: './dist/src/index.js' } },
        },
      },
      versions,
    );

    expect(merged.main).toBe('./dist/src/index.js');
    expect(merged.types).toBe('./dist/src/index.d.ts');
    expect(merged.exports).toEqual({ '.': { types: './dist/src/index.d.ts', default: './dist/src/index.js' } });
    expect(merged.publishConfig).toEqual({ access: 'public' });
  });

  test('drops publishConfig entirely when it held nothing but overrides', () => {
    const merged = publishManifest(
      { name: 'janux', exports: { '.': './src/index.ts' }, publishConfig: { exports: { '.': './dist/src/index.js' } } },
      versions,
    );

    expect('publishConfig' in merged).toBe(false);
  });

  test('pins workspace ranges to the versions being released', () => {
    const merged = publishManifest(
      {
        name: '@janux/agent',
        dependencies: { janux: 'workspace:*', '@janux/server': 'workspace:*', ai: '^6.0.0' },
        publishConfig: { main: './dist/src/index.js', types: './dist/src/index.d.ts', exports: { '.': './dist/src/index.js' } },
      },
      versions,
    );

    expect(merged.dependencies).toEqual({ janux: '9.9.9', '@janux/server': '9.9.9', ai: '^6.0.0' });
  });

  test('refuses a manifest that would publish source', () => {
    expect(() =>
      publishManifest({ name: 'janux', exports: { '.': './src/index.ts' }, publishConfig: { exports: { '.': './src/index.ts' } } }, versions),
    ).toThrow(/points at source/);
  });

  // `types` and `module` were once outside the check, so a compiled `exports`
  // was enough to pass while the declarations still pointed at `.ts`.
  test('refuses source behind any advertised field, not just exports', () => {
    const publishConfig = { main: './dist/src/index.js', types: './src/index.ts', exports: { '.': './dist/src/index.js' } };

    expect(() => publishManifest({ name: 'janux', exports: { '.': './src/index.ts' }, publishConfig }, versions)).toThrow(/src\/index\.ts/);
  });

  test('refuses a manifest with no publishConfig to lift', () => {
    expect(() => publishManifest({ name: 'janux', exports: { '.': './src/index.ts' } }, versions)).toThrow(/publishConfig/);
  });

  // The failure the release path must catch on its own: a subpath added to
  // `exports` and forgotten in `publishConfig` simply would not exist.
  test('refuses a subpath the published exports forgot', () => {
    const pkg = {
      name: 'janux',
      exports: { '.': './src/index.ts', './query': './src/query/index.ts' },
      publishConfig: { exports: { '.': { types: './dist/src/index.d.ts', default: './dist/src/index.js' } } },
    };

    expect(() => publishManifest(pkg, versions)).toThrow(/\.\/query/);
  });

  test('a bin with nothing to import needs no exports', () => {
    const merged = publishManifest(
      { name: 'create-janux', bin: { 'create-janux': './bin.ts' }, publishConfig: { bin: { 'create-janux': './dist/bin.js' } } },
      versions,
    );

    expect(merged.bin).toEqual({ 'create-janux': './dist/bin.js' });
    expect(merged.exports).toBeUndefined();
  });
});

describe('publishedPaths', () => {
  test('collects every path the manifest advertises', () => {
    const paths = publishedPaths({
      main: './dist/src/index.js',
      types: './dist/src/index.d.ts',
      bin: { janux: './dist/bin.js' },
      exports: { './client': { types: './dist/src/client/index.d.ts', default: './dist/src/client/index.js' } },
    });

    expect(paths).toEqual(['dist/src/index.js', 'dist/src/index.d.ts', 'dist/bin.js', 'dist/src/client/index.d.ts', 'dist/src/client/index.js']);
  });
});

describe('advertisesSource', () => {
  test('finds TypeScript behind any advertised field', () => {
    expect(advertisesSource({ main: './src/index.ts', bin: { janux: './bin.ts' } })).toEqual(['src/index.ts', 'bin.ts']);
  });

  test('a declaration is not source', () => {
    expect(advertisesSource({ types: './dist/src/index.d.ts', main: './dist/src/index.js' })).toEqual([]);
  });
});

/**
 * The manifest npm receives is not the one the repository keeps, so it exists on
 * disk for exactly as long as packing takes — and has to come back afterwards
 * even when packing throws, or a failed release leaves the workspace pointing
 * at `dist/` and every example broken until someone notices.
 */
describe('withManifest', () => {
  const ROOT = 'node_modules/.janux-manifest-fixture';
  const ORIGINAL = `{\n  "name": "sample",\n  "main": "./src/index.ts"\n}\n`;
  const PUBLISHED = { name: 'sample', main: './dist/src/index.js' };

  afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

  async function fixture(): Promise<string> {
    await Bun.write(`${ROOT}/package.json`, ORIGINAL);

    return `${ROOT}/package.json`;
  }

  test('the action sees the published manifest', async () => {
    const path = await fixture();

    expect((await withManifest(ROOT, PUBLISHED, () => Bun.file(path).json())).main).toBe('./dist/src/index.js');
  });

  test('restores the original, byte for byte', async () => {
    const path = await fixture();

    await withManifest(ROOT, PUBLISHED, async () => undefined);

    expect(await Bun.file(path).text()).toBe(ORIGINAL);
  });

  test('restores it after a failure too', async () => {
    const path = await fixture();

    await expect(
      withManifest(ROOT, PUBLISHED, () => {
        throw new Error('pack exploded');
      }),
    ).rejects.toThrow('pack exploded');
    expect(await Bun.file(path).text()).toBe(ORIGINAL);
  });

  test('returns whatever the action returned', async () => {
    await fixture();

    expect(await withManifest(ROOT, PUBLISHED, async () => 'sample-1.0.0.tgz')).toBe('sample-1.0.0.tgz');
  });
});
