#!/usr/bin/env bun
/**
 * Publishes all packages in dependency order, skipping versions already on npm.
 *
 * Nothing is uploaded before it has been built and the tarball read back: the
 * manifests in the repository point at `src/` so the workspace needs no build
 * step, which means the compiled shape only exists if this script put it there.
 *
 * This runs from `.github/workflows/release.yml`, on a tag, and it refuses to
 * do the real thing anywhere else: without an OIDC token there is no
 * provenance, and an unsigned tarball is the exact thing publishing from CI is
 * supposed to make impossible. `--allow-unattested` exists for the day npm's
 * signing is down, and is meant to be typed deliberately.
 *
 *   bun run release -- --dry-run
 */
import { existsSync, rmSync } from 'node:fs';
import { buildPackage } from './packaging/build';
import { withExamples } from './packaging/examples';
import { publishManifest, releaseVersions, withManifest } from './packaging/manifest';
import { PACKED, packageDir, PUBLISH_ORDER, readManifest } from './packaging/packages';
import { alreadyPublished, canAttestProvenance, publish } from './packaging/registry';
import { packAndVerify } from './packaging/tarball';

const dryRun = Bun.argv.includes('--dry-run');
const provenance = canAttestProvenance();

/** The tag is the release: a run triggered by `0.6.0` must not upload 0.5.0. */
function assertTagMatches(versions: Map<string, string>): void {
  const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined;
  const wrong = tag ? [...versions].filter(([, version]) => version !== tag) : [];

  if (wrong.length > 0) {
    throw new Error(`tag ${tag} does not match the manifests: ${wrong.map(([name, version]) => `${name}@${version}`).join(', ')}`);
  }
}

function assertAllowedToUpload(): void {
  if (dryRun || provenance || Bun.argv.includes('--allow-unattested')) return;
  console.error('Refusing to publish without provenance: no OIDC token, so this is not a workflow run.');
  console.error('Push the tag and let .github/workflows/release.yml do it, or pass --allow-unattested.');
  process.exit(1);
}

/** Builds, packs and verifies one package; returns the archive npm will receive. */
async function pack(dir: string, versions: Map<string, string>): Promise<string> {
  const root = packageDir(dir);
  const outputs = await buildPackage(root);

  if (!existsSync(`${root}/dist`)) throw new Error(`${dir}: nothing was built into ${root}/dist`);
  console.log(`  built ${outputs.length} files`);
  const published = publishManifest(await readManifest(dir), versions);

  // Packed with the compiled manifest on disk, uploaded after it is restored:
  // npm reads the tarball, which already carries it, not the workspace.
  return withExamples(dir, () => withManifest(root, published, () => packAndVerify(root, published, `${PACKED}/${dir}`)));
}

const versions = await releaseVersions();

assertTagMatches(versions);
assertAllowedToUpload();
if (dryRun && !provenance) console.log('… dry run without an OIDC token: packing only, npm would not sign this.');
rmSync(PACKED, { recursive: true, force: true });
for (const dir of PUBLISH_ORDER) {
  const pkg = await readManifest(dir);
  const onNpm = await alreadyPublished(pkg.name, pkg.version);

  // A dry run packs even what is already on npm: the tarballs are the thing
  // being rehearsed, and skipping them would leave nothing to inspect.
  if (onNpm && !dryRun) {
    console.log(`↷ ${pkg.name}@${pkg.version} already on npm — skipping`);
    continue;
  }
  console.log(`→ ${dryRun ? 'rehearsing' : 'publishing'} ${pkg.name}@${pkg.version}`);
  const tarball = await pack(dir, versions);

  // `npm publish --dry-run` still asks the registry, and the registry still
  // refuses a version that exists — so rehearsing one stops at the tarball,
  // which is the part of the upload worth inspecting anyway.
  if (onNpm) console.log(`  packed and verified ${tarball} — ${pkg.version} is already on npm, upload not rehearsed`);
  else publish(tarball, { dryRun, provenance });
}
console.log(dryRun ? '✔ dry run complete' : '✔ release complete');
