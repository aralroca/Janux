#!/usr/bin/env bun
/**
 * Publishes all packages in dependency order, skipping versions already on npm.
 *
 * Nothing is uploaded before it has been built and the tarball read back: the
 * manifests in the repository point at `src/` so the workspace needs no build
 * step, which means the compiled shape only exists if this script put it there.
 */
import { $ } from 'bun';
import { existsSync, rmSync } from 'node:fs';
import { buildPackage } from './packaging/build';
import { withExamples } from './packaging/examples';
import { publishManifest, releaseVersions, withManifest } from './packaging/manifest';
import { PACKED, packageDir, PUBLISH_ORDER, readManifest } from './packaging/packages';
import { packAndVerify } from './packaging/tarball';

async function alreadyPublished(name: string, version: string): Promise<boolean> {
  const encoded = name.replace('/', '%2f');
  const response = await fetch(`https://registry.npmjs.org/${encoded}/${version}`);

  return response.status === 200;
}

async function release(dir: string, versions: Map<string, string>): Promise<void> {
  const root = packageDir(dir);
  const outputs = await buildPackage(root);

  if (!existsSync(`${root}/dist`)) throw new Error(`${dir}: nothing was built into ${root}/dist`);
  console.log(`  built ${outputs.length} files`);
  const published = publishManifest(await readManifest(dir), versions);

  await withExamples(dir, () =>
    withManifest(root, published, async () => {
      await packAndVerify(root, published, `${PACKED}/${dir}`);
      await $`bun publish --access public`.cwd(root);
    }),
  );
}

const versions = await releaseVersions();

rmSync(PACKED, { recursive: true, force: true });
for (const dir of PUBLISH_ORDER) {
  const pkg = await readManifest(dir);

  if (await alreadyPublished(pkg.name, pkg.version)) {
    console.log(`↷ ${pkg.name}@${pkg.version} already on npm — skipping`);
    continue;
  }
  console.log(`→ publishing ${pkg.name}@${pkg.version}`);
  await release(dir, versions);
}
console.log('✔ release complete');
