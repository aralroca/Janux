#!/usr/bin/env bun
/** Publishes all packages in dependency order, skipping versions already on npm. */
import { $ } from 'bun';

const ORDER = ['janux', 'janux-server', 'janux-agent', 'janux-vite', 'janux-cli', 'create-janux'];

async function alreadyPublished(name: string, version: string): Promise<boolean> {
  const encoded = name.replace('/', '%2f');
  const response = await fetch(`https://registry.npmjs.org/${encoded}/${version}`);

  return response.status === 200;
}

for (const dir of ORDER) {
  const pkg = await Bun.file(`packages/${dir}/package.json`).json();

  if (await alreadyPublished(pkg.name, pkg.version)) {
    console.log(`↷ ${pkg.name}@${pkg.version} already on npm — skipping`);
    continue;
  }
  console.log(`→ publishing ${pkg.name}@${pkg.version}`);
  await $`bun publish --access public`.cwd(`packages/${dir}`);
}
console.log('✔ release complete');
