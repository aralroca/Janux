/**
 * The published shape, asserted on the real manifests.
 *
 * Two claims live here, and they pull in opposite directions on purpose:
 * what npm receives must resolve to `dist/`, and what the monorepo reads must
 * still resolve to `src/` — otherwise every change would need a build before
 * `bun test`, `tsc` or a Vite example could see it.
 *
 * Whatever a package exposes in development, it exposes compiled — so the
 * assertions are driven by the development manifest, not by a hardcoded list
 * (`create-janux` is a bin with no importable entry, and that is not a gap).
 */
import { describe, expect, test } from 'bun:test';
import { exportTargets } from './manifest';
import { PUBLISH_ORDER, readManifest, type Manifest } from './packages';

const manifests = new Map<string, Manifest>(
  await Promise.all(PUBLISH_ORDER.map(async (dir) => [dir, await readManifest(dir)] as const)),
);

describe.each([...PUBLISH_ORDER])('%s: published shape', (dir) => {
  const pkg = manifests.get(dir)!;
  const published = pkg.publishConfig ?? {};

  test('ships dist and never src', () => {
    expect(pkg.files).toContain('dist');
    expect(pkg.files.filter((entry: string) => entry.replace(/^!/, '').startsWith('src'))).toEqual([]);
  });

  // Registered conditionally rather than via `test.if`: a package without the
  // field has nothing to assert, and a permanent skip in every summary reads
  // as unfinished work instead of by-design absence.
  if (pkg.main) test('main and types resolve into dist', () => {
    expect(published.main).toStartWith('./dist/');
    expect(published.types).toStartWith('./dist/');
  });

  // `@janux/tailwind` resolves its `style` condition to a stylesheet at the
  // package root, so the rule is "a file the tarball ships", not "under dist".
  if (pkg.exports) test('every export target is a file the tarball ships', () => {
    const compiled = exportTargets(published.exports);
    const shipped = (target: string) => target.startsWith('./dist/') || pkg.files.includes(target.replace('./', ''));

    expect(compiled.length).toBeGreaterThan(0);
    compiled.forEach((target) => expect(shipped(target), `${dir} → ${target}`).toBe(true));
  });

  if (pkg.exports) test('types is the first condition of every export entry', () => {
    Object.entries(published.exports as Record<string, unknown>).forEach(([subpath, entry]) => {
      expect(Object.keys(entry as object)[0], `${dir} ${subpath}`).toBe('types');
    });
  });

  if (pkg.exports) test('keeps every subpath the monorepo already exposes', () => {
    expect(Object.keys(published.exports).sort()).toEqual(Object.keys(pkg.exports).sort());
  });

  if (pkg.bin) test('bin points into dist', () => {
    expect(Object.keys(published.bin ?? {})).toEqual(Object.keys(pkg.bin));
    Object.values(published.bin as Record<string, string>).forEach((target) => expect(target).toStartWith('./dist/'));
  });

  // A hand-run `bun publish` skips the release script, so each package refuses
  // one itself rather than trusting whoever typed the command.
  test('refuses a publish that would ship source', () => {
    expect(pkg.scripts?.prepublishOnly).toBe('bun ../../scripts/prepublish-guard.ts');
  });

  // The development half of the contract: what the workspace reads is source,
  // so no build stands between an edit and a test run.
  test('the workspace still reads source', () => {
    exportTargets(pkg.exports ?? {}).forEach((target) => expect(target).toMatch(/^\.\/(src\/|tailwind\.css$)/));
    Object.values(pkg.bin ?? {}).forEach((target) => expect(target).toEndWith('.ts'));
  });
});

/**
 * A package that publishes but sits outside the `fixed` group breaks the
 * release the first time it is the only one a changeset names: `version.ts`
 * demands one version across `PUBLISH_ORDER`, changesets only moves the group,
 * and the bump aborts halfway through with the manifests already rewritten.
 * That is a bad moment to learn a package was never added.
 */
describe('the release train', () => {
  test('every published package is in the changeset fixed group', async () => {
    const config = await Bun.file('.changeset/config.json').json();
    const names = await Promise.all(PUBLISH_ORDER.map(async (dir) => (await readManifest(dir)).name));

    expect([...config.fixed[0]].sort()).toEqual([...names].sort());
  });
});
