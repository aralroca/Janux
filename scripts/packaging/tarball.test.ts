/**
 * What the tarball actually contains, asserted against what the manifest
 * advertises.
 *
 * `bun pm pack` ignores `.gitignore` — it goes by `files` alone — so a stray
 * build artifact or a fixture app ships unless something looks. And an exports
 * map is a promise about paths: a subpath whose target is missing is a package
 * that installs fine and fails on import.
 */
import { describe, expect, test } from 'bun:test';
import { verifyTarball } from './tarball';

const MANIFEST = {
  name: 'janux',
  files: ['dist'],
  main: './dist/src/index.js',
  types: './dist/src/index.d.ts',
  bin: { janux: './dist/bin.js' },
  exports: {
    '.': { types: './dist/src/index.d.ts', default: './dist/src/index.js' },
    './client': { types: './dist/src/client/index.d.ts', default: './dist/src/client/index.js' },
  },
};

const COMPLETE = [
  'package/package.json',
  'package/dist/src/index.js',
  'package/dist/src/index.js.map',
  'package/dist/src/index.d.ts',
  'package/dist/src/client/index.js',
  'package/dist/src/client/index.js.map',
  'package/dist/src/client/index.d.ts',
  'package/dist/bin.js',
  'package/dist/bin.js.map',
];

describe('verifyTarball', () => {
  test('accepts a tarball that holds everything it advertises', () => {
    expect(() => verifyTarball(COMPLETE, MANIFEST)).not.toThrow();
  });

  test('rejects a subpath whose target was never built', () => {
    expect(() => verifyTarball(COMPLETE.filter((path) => !path.includes('client')), MANIFEST)).toThrow(
      /dist\/src\/client\/index\.js/,
    );
  });

  test('rejects a tarball with no dist at all', () => {
    expect(() => verifyTarball(['package/package.json'], MANIFEST)).toThrow(/dist/);
  });

  test('rejects shipped source', () => {
    expect(() => verifyTarball([...COMPLETE, 'package/src/index.ts'], MANIFEST)).toThrow(/src\/index\.ts/);
  });

  test('rejects the build artefacts .gitignore would have hidden', () => {
    expect(() => verifyTarball([...COMPLETE, 'package/.tsconfig.build.json'], MANIFEST)).toThrow(/tsconfig\.build/);
    expect(() => verifyTarball([...COMPLETE, 'package/dist/src/__fixtures__/app.js'], MANIFEST)).toThrow(/__fixtures__/);
    expect(() => verifyTarball([...COMPLETE, 'package/node_modules/janux/package.json'], MANIFEST)).toThrow(/node_modules/);
    expect(() => verifyTarball([...COMPLETE, 'package/dist/src/index.test.js'], MANIFEST)).toThrow(/index\.test\.js/);
  });

  test('says which package is wrong', () => {
    expect(() => verifyTarball(['package/package.json'], MANIFEST)).toThrow(/janux/);
  });

  test('ships the sourcemaps', () => {
    expect(() => verifyTarball(COMPLETE.filter((path) => !path.endsWith('.map')), MANIFEST)).toThrow(/sourcemap/i);
  });

  // `create-janux` ships `template/` and `examples/` beside `dist/`: hand-written
  // scaffolding with no build output, which must not be held to a build's rules.
  // A scaffolded app comes with its own tests and configs, and those are product.
  test('holds compiled output to the build rules, and scaffolding to none', () => {
    const scaffolding = [
      ...COMPLETE,
      'package/template/postcss.config.js',
      'package/template/src/components/Counter.test.ts',
      'package/examples/shop/src/routes/index.tsx',
    ];

    expect(() => verifyTarball(scaffolding, MANIFEST)).not.toThrow();
    expect(() => verifyTarball([...COMPLETE, 'package/dist/src/index.test.js'], MANIFEST)).toThrow(/index\.test\.js/);
  });
});
