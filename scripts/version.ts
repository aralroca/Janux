#!/usr/bin/env bun
/**
 * `changeset version`, plus the two things it cannot do in this repository.
 *
 * It writes the publishable packages' changelogs and bumps their manifests. It does not
 * know about the root `CHANGELOG.md` — the file a reader actually opens — and
 * it does not know about the root manifest, which is private, is not a
 * workspace member, and still carries the version the tag is cut from.
 *
 *   bun run release:version
 *
 * Publishing is a separate act, and not this machine's: see
 * `.github/workflows/release.yml`.
 */
import { $ } from 'bun';
import { prepend, rootSection, topSection, type PackageNotes } from './packaging/changelog';
import { packageDir, PUBLISH_ORDER, readManifest } from './packaging/packages';

const ROOT_CHANGELOG = 'CHANGELOG.md';
const ROOT_MANIFEST = 'package.json';

/** The publishable packages are a fixed group, so "the version" is a single fact — or a bug. */
async function releaseVersion(): Promise<string> {
  const manifests = await Promise.all(PUBLISH_ORDER.map(readManifest));
  const versions = new Set(manifests.map((pkg) => pkg.version as string));

  if (versions.size !== 1) throw new Error(`the fixed group split across versions: ${[...versions].sort().join(', ')}`);

  return [...versions][0]!;
}

async function notesOf(dir: string, version: string): Promise<PackageNotes> {
  const file = Bun.file(`${packageDir(dir)}/CHANGELOG.md`);
  const section = (await file.exists()) ? topSection(await file.text()) : undefined;

  return { name: (await readManifest(dir)).name, body: section?.version === version ? section.body : '' };
}

async function foldIntoRoot(version: string): Promise<void> {
  const notes = await Promise.all(PUBLISH_ORDER.map((dir) => notesOf(dir, version)));
  const existing = await Bun.file(ROOT_CHANGELOG).text();

  if (new RegExp(`^## ${version.replace(/\./g, '\\.')}$`, 'm').test(existing)) {
    throw new Error(`${ROOT_CHANGELOG} already has a ${version} section — was this run twice?`);
  }
  await Bun.write(ROOT_CHANGELOG, prepend(existing, rootSection(version, notes)));
}

async function syncRootManifest(version: string): Promise<void> {
  const manifest = await Bun.file(ROOT_MANIFEST).json();

  await Bun.write(ROOT_MANIFEST, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
}

const before = await releaseVersion();

await $`bunx changeset version`;
const version = await releaseVersion();

if (version === before) {
  console.log(`↷ nothing to release — still ${version}`);
  process.exit(0);
}
await foldIntoRoot(version);
await syncRootManifest(version);
console.log(`✔ ${before} → ${version}: manifests, package changelogs and ${ROOT_CHANGELOG} updated`);
console.log(`  commit as \`release: ${version}\`, then push the tag \`${version}\` — the workflow publishes.`);
