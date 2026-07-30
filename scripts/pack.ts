#!/usr/bin/env bun
/**
 * Builds, packs and inspects every publishable package — the same steps a
 * release takes, stopping before it uploads anything.
 *
 *   bun scripts/pack.ts [destination]
 *
 * The tarballs it leaves behind are what CI installs into a bare Node project:
 * a package that resolves here and nowhere else has not been tested at all.
 */
import { mkdirSync } from 'node:fs';
import { buildPackages } from './packaging/build';
import { withExamples } from './packaging/examples';
import { publishManifest, releaseVersions, withManifest } from './packaging/manifest';
import { PACKED, packageDir, PUBLISH_ORDER, readManifest } from './packaging/packages';
import { packAndVerify } from './packaging/tarball';

const destination = Bun.argv[2] ?? PACKED;
const versions = await releaseVersions();

mkdirSync(destination, { recursive: true });
// Built up front and in parallel; packing stays serial because it swaps each
// package.json on disk for the length of one archive.
const built = await buildPackages(PUBLISH_ORDER.map(packageDir));

for (const dir of PUBLISH_ORDER) {
  const root = packageDir(dir);
  const published = publishManifest(await readManifest(dir), versions);
  const tarball = await withExamples(dir, () =>
    withManifest(root, published, () => packAndVerify(root, published, `${destination}/${dir}`)),
  );

  console.log(`✔ ${dir} — ${built.get(root)!.length} built, ${tarball}`);
}
