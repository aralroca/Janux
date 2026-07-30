/**
 * The manifest npm receives, derived from the one the monorepo reads.
 *
 * `publishConfig` is where the compiled shape lives: `main`, `types` and an
 * `exports` map into `dist/`, with `types` first in every entry. It is not a
 * convention npm or Bun implement — both copy the field through untouched
 * (pnpm is the one that lifts it) — so this is where it gets applied, right
 * before packing.
 */
import { PUBLISH_ORDER, readManifest, type Manifest } from './packages';

/** Fields `publishConfig` may override; anything else there is npm's own config. */
const LIFTED = ['main', 'module', 'types', 'exports', 'bin'] as const;

const TYPESCRIPT = /\.tsx?$/;

/** Every string target in an exports subtree, whatever the condition nesting. */
export function exportTargets(entry: unknown): string[] {
  if (typeof entry === 'string') return [entry];
  if (entry === null || typeof entry !== 'object') return [];

  return Object.values(entry).flatMap(exportTargets);
}

/** Every package-relative path a manifest promises a consumer can reach. */
export function publishedPaths(pkg: Manifest): string[] {
  const fields = [pkg.main, pkg.module, pkg.types, ...Object.values(pkg.bin ?? {})] as (string | undefined)[];
  const advertised = [...fields, ...exportTargets(pkg.exports ?? {})];

  return advertised.filter((path): path is string => typeof path === 'string').map((path) => path.replace(/^\.\//, ''));
}

/** A manifest that still points at `.ts` is one Node cannot load: it advertises source. */
export function advertisesSource(pkg: Manifest): string[] {
  return publishedPaths(pkg).filter((path) => TYPESCRIPT.test(path) && !path.endsWith('.d.ts'));
}

/**
 * A subpath added to `exports` and forgotten in `publishConfig` would simply not
 * exist for consumers, so the two key sets are compared here as well as in the
 * suite — a release must not depend on the tests having been run.
 */
function assertCompiled(pkg: Manifest, lifted: Manifest): void {
  const source = advertisesSource(lifted);
  const subpaths = Object.keys(pkg.exports ?? {});
  const missing = subpaths.filter((subpath) => !(subpath in (lifted.exports ?? {})));

  if (pkg.exports && !lifted.exports) throw new Error(`${pkg.name}: publishConfig.exports is missing — the tarball would advertise source`);
  if (missing.length > 0) throw new Error(`${pkg.name}: publishConfig.exports has no entry for ${missing.join(', ')}`);
  if (source.length > 0) throw new Error(`${pkg.name}: publishConfig still points at source: ${source.join(', ')}`);
}

function pinned(dependencies: Manifest, versions: Map<string, string>): Manifest {
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, range]) => [name, range === 'workspace:*' ? (versions.get(name) ?? range) : range]),
  );
}

/** What each package is about to be published as, for pinning the workspace ranges. */
export async function releaseVersions(): Promise<Map<string, string>> {
  const manifests = await Promise.all(PUBLISH_ORDER.map(readManifest));

  return new Map(manifests.map((pkg) => [pkg.name, pkg.version]));
}

/**
 * `workspace:*` is pinned here rather than left to `bun publish`, which resolves
 * it against the registry — mid-release that still advertises the previous
 * version, so 0.2.0 would ship 0.1.0 pins.
 */
export function publishManifest(pkg: Manifest, versions: Map<string, string>): Manifest {
  const { access, tag, registry, provenance, ...overrides } = pkg.publishConfig ?? {};
  const lifted = Object.fromEntries(LIFTED.filter((field) => field in overrides).map((field) => [field, overrides[field]]));
  const config = Object.entries({ access, tag, registry, provenance }).filter(([, value]) => value !== undefined);
  const { publishConfig, ...manifest }: Manifest = {
    ...pkg,
    ...lifted,
    ...(pkg.dependencies ? { dependencies: pinned(pkg.dependencies, versions) } : {}),
  };

  assertCompiled(pkg, lifted);

  return config.length > 0 ? { ...manifest, publishConfig: Object.fromEntries(config) } : manifest;
}

/**
 * Swaps a package's manifest for the published one, for the length of one action:
 * the compiled shape has to be on disk while the archive is written, and the
 * source-pointing one has to be back before anything else in the workspace
 * reads it — including after a failure.
 */
export async function withManifest<T>(root: string, published: Manifest, action: () => Promise<T> | T): Promise<T> {
  const path = `${root}/package.json`;
  const original = await Bun.file(path).text();

  await Bun.write(path, `${JSON.stringify(published, null, 2)}\n`);
  try {
    return await action();
  } finally {
    await Bun.write(path, original);
  }
}
