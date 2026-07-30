/**
 * Packs a package and checks the tarball rather than the intention.
 *
 * `bun pm pack` reads `files` and ignores `.gitignore`, so `dist/` being
 * ignored by git says nothing about what ships — this is the step that looks
 * inside the archive npm would receive.
 */
import { $ } from 'bun';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { publishedPaths } from './manifest';
import type { Manifest } from './packages';
import { NOT_PRODUCT } from './sources';

/** Private details of building, never a published file wherever it turns up. */
const FORBIDDEN = [
  /(^|\/)node_modules\//,
  // Uncompiled source: the tree under `dist/src/` is the compiled mirror of it.
  /^src\//,
  /tsconfig\.build\.json$/,
];

/**
 * `NOT_PRODUCT` is a rule about what the build emits, so it is applied to `dist/`
 * and nowhere else: `create-janux` ships a `template/` whose scaffolded app comes
 * with its own `Counter.test.ts`, and that file is the product.
 */
function shipsPrivate(paths: string[]): string[] {
  return paths.filter((path) => FORBIDDEN.some((pattern) => pattern.test(path)) || (path.startsWith('dist/') && NOT_PRODUCT.test(path)));
}

function missing(entries: Set<string>, pkg: Manifest): string[] {
  return [...new Set(publishedPaths(pkg))].filter((path) => !entries.has(path));
}

/**
 * Every emitted `.js` has a map beside it. Scoped to `dist/`: `create-janux`
 * also ships `template/` and `examples/`, hand-written scaffolding that has no
 * build output and wants no sourcemaps.
 */
function unmapped(paths: string[]): string[] {
  const compiled = paths.filter((path) => path.startsWith('dist/'));
  const maps = new Set(compiled.filter((path) => path.endsWith('.js.map')));

  return compiled.filter((path) => path.endsWith('.js') && !maps.has(`${path}.map`));
}

/** `entries` are tar paths, so every one of them starts with the `package/` prefix npm adds. */
export function verifyTarball(entries: string[], pkg: Manifest): void {
  const paths = entries.map((entry) => entry.replace(/^package\//, '')).filter((path) => path !== '');
  const forbidden = shipsPrivate(paths);
  const absent = missing(new Set(paths), pkg);
  const mapless = unmapped(paths);

  if (forbidden.length > 0) throw new Error(`${pkg.name}: the tarball ships what it should not: ${forbidden.join(', ')}`);
  if (absent.length > 0) throw new Error(`${pkg.name}: the tarball advertises paths it does not contain: ${absent.join(', ')}`);
  if (mapless.length > 0) throw new Error(`${pkg.name}: no sourcemap beside ${mapless.join(', ')}`);
}

/** Packs into `into` and returns the tarball path. */
export async function pack(dir: string, into: string): Promise<string> {
  rmSync(into, { recursive: true, force: true });
  await $`bun pm pack --destination ${join(process.cwd(), into)}`.cwd(dir).quiet();
  const packed = await Array.fromAsync(new Bun.Glob('*.tgz').scan({ cwd: into }));

  if (packed.length !== 1) throw new Error(`pack produced ${packed.length} tarballs in ${into}`);

  return join(into, packed[0]!);
}

export function entriesOf(tarball: string): string[] {
  const run = Bun.spawnSync(['tar', '-tzf', tarball]);

  if (!run.success) throw new Error(`could not read ${tarball}\n${run.stderr.toString()}`);

  return run.stdout.toString().split('\n').filter(Boolean);
}

/** Packs with the published manifest on disk, then reads the archive back. */
export async function packAndVerify(dir: string, published: Manifest, into: string): Promise<string> {
  const tarball = await pack(dir, into);

  verifyTarball(entriesOf(tarball), published);

  return tarball;
}
