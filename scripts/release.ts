#!/usr/bin/env bun
/** Publishes all packages in dependency order, skipping versions already on npm. */
import { $ } from 'bun';
import { cpSync, rmSync } from 'node:fs';
import { basename } from 'node:path';

const ORDER = ['janux', 'janux-server', 'janux-agent', 'janux-vite', 'janux-tailwind', 'janux-cli', 'janux-vercel', 'create-janux'];

async function alreadyPublished(name: string, version: string): Promise<boolean> {
  const encoded = name.replace('/', '%2f');
  const response = await fetch(`https://registry.npmjs.org/${encoded}/${version}`);

  return response.status === 200;
}

// Pin workspace:* deps to the local versions ourselves: bun publish resolves them against the
// registry, which mid-release still advertises the PREVIOUS version (0.2.0 shipped 0.1.0 pins).
const versions = new Map<string, string>();

for (const dir of ORDER) {
  const pkg = await Bun.file(`packages/${dir}/package.json`).json();

  versions.set(pkg.name, pkg.version);
}

function pinWorkspaceDeps(pkg: Record<string, any>): Record<string, any> {
  const deps = Object.fromEntries(
    Object.entries(pkg.dependencies ?? {}).map(([name, range]) =>
      range === 'workspace:*' ? [name, versions.get(name) ?? range] : [name, range],
    ),
  );

  return { ...pkg, dependencies: deps };
}

// create-janux ships the monorepo examples as scaffolding sources (`--example`).
const EXAMPLES_SKIP = new Set(['node_modules', 'dist', 'bun.lock', '.env']);

function embedExamples(): void {
  rmSync('packages/create-janux/examples', { recursive: true, force: true });
  cpSync('examples', 'packages/create-janux/examples', {
    recursive: true,
    filter: (source) => !EXAMPLES_SKIP.has(basename(source)),
  });
}

for (const dir of ORDER) {
  const path = `packages/${dir}/package.json`;
  const original = await Bun.file(path).text();
  const pkg = JSON.parse(original);

  if (await alreadyPublished(pkg.name, pkg.version)) {
    console.log(`↷ ${pkg.name}@${pkg.version} already on npm — skipping`);
    continue;
  }
  console.log(`→ publishing ${pkg.name}@${pkg.version}`);
  if (dir === 'create-janux') embedExamples();
  await Bun.write(path, `${JSON.stringify(pinWorkspaceDeps(pkg), null, 2)}\n`);
  try {
    await $`bun publish --access public`.cwd(`packages/${dir}`);
  } finally {
    await Bun.write(path, original);
    if (dir === 'create-janux') rmSync('packages/create-janux/examples', { recursive: true, force: true });
  }
}
console.log('✔ release complete');
