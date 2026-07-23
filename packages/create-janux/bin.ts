#!/usr/bin/env bun
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

// Install artifacts from running the template in place (local dev of the template itself).
const SKIP = new Set(['node_modules', 'bun.lock']);

const name = process.argv[2];

if (!name || !/^[a-z0-9-]+$/.test(name)) {
  console.error('Usage: create-janux <app-name>   (kebab-case)');
  process.exit(1);
}
const target = join(process.cwd(), name);

if (existsSync(target)) {
  console.error(`create-janux: "${name}" already exists`);
  process.exit(1);
}
cpSync(join(import.meta.dirname, 'template'), target, {
  recursive: true,
  filter: (source) => !SKIP.has(basename(source)),
});

for (const file of ['package.json', 'README.md']) {
  const path = join(target, file);

  writeFileSync(path, readFileSync(path, 'utf-8').replace(/__APP_NAME__/g, name));
}
console.log(`✔ ${name} created

  cd ${name}
  bun install
  bun run dev

The right panel is the agent surface — same thing as: curl localhost:3000/_janux/manifest`);
