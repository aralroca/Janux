/**
 * Builds a package the way a release does, then hands the result to Node —
 * which is the whole point of compiling: Node refuses to strip types inside
 * `node_modules`, so source is unusable there however valid it is.
 *
 * The fixture is written under `node_modules/` so `bun test` never discovers
 * the files it is meant to prove are left out of `dist`.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPackage } from './build';

const ROOT = 'node_modules/.janux-build-fixture';

const FILES: Record<string, string> = {
  'package.json': `{ "name": "@janux-fixture/sample", "version": "0.0.0", "type": "module" }`,
  'tsconfig.json': `{ "extends": "../../tsconfig.base.json", "include": ["src/**/*", "bin.ts"] }`,
  'src/index.ts': [
    `import { greeting } from './strings';`,
    `import { COUNT } from './nested';`,
    `import type { Shape } from './shapes';`,
    ``,
    `export async function lazy(): Promise<number> {`,
    `  return (await import('./nested')).COUNT;`,
    `}`,
    ``,
    `export function describeShape(shape: Shape): string {`,
    `  return \`\${greeting} \${shape.kind} \${COUNT}\`;`,
    `}`,
    ``,
    `export const CHECK = '✔ hecho';`,
  ].join('\n'),
  'src/strings.ts': `export const greeting = 'hola';`,
  'src/shapes.ts': `export interface Shape {\n  kind: string;\n}`,
  'src/nested/index.ts': `export const COUNT = 7;`,
  'src/index.test.ts': `import { expect, test } from 'bun:test';\n\ntest('never built', () => {\n  expect(1).toBe(1);\n});`,
  'src/__fixtures__/app.ts': `export const fixture = true;`,
  'bin.ts': `#!/usr/bin/env bun\nimport { describeShape } from './src/index';\n\nconsole.log(describeShape({ kind: 'circle' }));`,
};

/*
 * Built once at module scope rather than in a `beforeAll`.
 *
 * A real `tsc` build does not fit bun's 5s default for hooks — it has timed out
 * three times on CI, where the work is genuinely slow rather than stuck. The
 * deadline used to be lifted with `beforeAll(fn, 60_000)`, but that form throws
 * on Bun 1.3.0 ("expects a function as the second argument"; fixed in 1.3.2),
 * and 1.3.0 is the floor `engines` declares and CI now runs. Module evaluation
 * carries no such deadline, so this needs no per-test timeout and no floor bump
 * for a constraint only the suite has.
 */
rmSync(ROOT, { recursive: true, force: true });
await Promise.all(Object.entries(FILES).map(([path, content]) => Bun.write(`${ROOT}/${path}`, content)));
// A leftover from an earlier build, to prove `dist` is replaced and not merged.
await Bun.write(`${ROOT}/dist/src/gone.js`, 'export const gone = true;');
const outputs = await buildPackage(ROOT);

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe('buildPackage', () => {
  test('emits ESM next to declarations, mirroring the source tree', () => {
    expect(existsSync(`${ROOT}/dist/src/index.js`)).toBe(true);
    expect(existsSync(`${ROOT}/dist/src/index.d.ts`)).toBe(true);
    expect(existsSync(`${ROOT}/dist/src/nested/index.js`)).toBe(true);
    expect(existsSync(`${ROOT}/dist/bin.js`)).toBe(true);
  });

  test('reports what it wrote', () => {
    expect(outputs).toContain('dist/src/index.js');
    expect(outputs).toContain('dist/bin.js');
  });

  test('replaces dist instead of merging into it', () => {
    expect(existsSync(`${ROOT}/dist/src/gone.js`)).toBe(false);
  });

  test('leaves tests and fixtures out of the tarball', () => {
    expect(existsSync(`${ROOT}/dist/src/index.test.js`)).toBe(false);
    expect(existsSync(`${ROOT}/dist/src/__fixtures__`)).toBe(false);
  });

  test('every relative specifier carries an extension', async () => {
    const js = await Bun.file(`${ROOT}/dist/src/index.js`).text();

    expect(js).toContain(`from './strings.js'`);
    expect(js).toContain(`from './nested/index.js'`);
    expect(js).toContain(`import('./nested/index.js')`);
  });

  test('declarations carry extensions too, for nodenext consumers', async () => {
    const dts = await Bun.file(`${ROOT}/dist/bin.d.ts`).text();

    expect(await Bun.file(`${ROOT}/dist/src/index.d.ts`).text()).toContain(`from './shapes.js'`);
    expect(dts).toBeString();
  });

  test('strips the types it compiled away', async () => {
    const js = await Bun.file(`${ROOT}/dist/src/index.js`).text();

    expect(js).not.toContain('./shapes');
    expect(js).not.toContain('interface');
  });

  test('ships sourcemaps that carry their own sources', async () => {
    const map = await Bun.file(`${ROOT}/dist/src/index.js.map`).json();

    expect(map.sourcesContent[0]).toContain('describeShape');
    expect(await Bun.file(`${ROOT}/dist/src/index.js`).text()).toContain('//# sourceMappingURL=index.js.map');
  });

  // `sources` is read relative to the map, and the map is nested in `dist`.
  test('names its source relative to where the map sits', async () => {
    const map = await Bun.file(`${ROOT}/dist/src/nested/index.js.map`).json();

    expect(map.sources).toEqual(['../../../src/nested/index.ts']);
    expect(resolve(`${ROOT}/dist/src/nested`, map.sources[0])).toBe(resolve(`${ROOT}/src/nested/index.ts`));
  });

  test('keeps the shebang on a bin', async () => {
    expect(await Bun.file(`${ROOT}/dist/bin.js`).text()).toStartWith('#!/usr/bin/env bun');
  });

  // The claim the whole change exists for.
  test('Node imports the result', async () => {
    const run = Bun.spawnSync(['node', '--input-type=module', '-e', `import('./${ROOT}/dist/src/index.js').then((m) => console.log(m.describeShape({ kind: 'circle' }), m.CHECK))`]);

    expect(run.stderr.toString()).toBe('');
    expect(run.stdout.toString().trim()).toBe('hola circle 7 ✔ hecho');
  });
});
