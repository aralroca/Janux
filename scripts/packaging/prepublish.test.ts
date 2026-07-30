/**
 * `bun publish` typed by hand in a package directory skips the release script
 * entirely, and the manifest sitting on disk is the development one: `files`
 * already says `dist`, so the archive would carry compiled output while
 * advertising `./src/index.ts`. It installs and fails on import.
 *
 * Both `bun publish` and `npm publish` run `prepublishOnly` and abort when it
 * exits non-zero, which is what makes this enforceable from the package itself.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = 'node_modules/.janux-prepublish-fixture';
const GUARD = resolve('scripts/prepublish-guard.ts');

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

async function guard(pkg: Record<string, unknown>): Promise<{ code: number | null; output: string }> {
  await Bun.write(`${ROOT}/package.json`, JSON.stringify(pkg));
  const run = Bun.spawnSync(['bun', GUARD], { cwd: ROOT });

  return { code: run.exitCode, output: `${run.stdout.toString()}${run.stderr.toString()}` };
}

describe('prepublish-guard', () => {
  test('refuses the development manifest', async () => {
    const refused = await guard({ name: 'janux', main: './src/index.ts', exports: { '.': './src/index.ts' }, files: ['dist'] });

    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('src/index.ts');
    expect(refused.output).toContain('bun run release');
  });

  test('allows the lifted one', async () => {
    const allowed = await guard({
      name: 'janux',
      main: './dist/src/index.js',
      types: './dist/src/index.d.ts',
      exports: { '.': { types: './dist/src/index.d.ts', default: './dist/src/index.js' } },
      files: ['dist'],
    });

    expect(allowed.code).toBe(0);
  });

  test('allows a bin-only package once compiled', async () => {
    expect((await guard({ name: 'create-janux', bin: { 'create-janux': './dist/bin.js' }, files: ['dist'] })).code).toBe(0);
  });

  test('refuses a bin still pointing at TypeScript', async () => {
    const refused = await guard({ name: 'create-janux', bin: { 'create-janux': './bin.ts' }, files: ['dist'] });

    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('bin.ts');
  });
});
