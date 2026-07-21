#!/usr/bin/env bun
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
cpSync(join(import.meta.dirname, 'template'), target, { recursive: true });

const pkgPath = join(target, 'package.json');

writeFileSync(pkgPath, readFileSync(pkgPath, 'utf-8').replace(/__APP_NAME__/g, name));
console.log(`✔ ${name} created

  cd ${name}
  bun install
  bun run dev

Configure the copilot with JANUX_MODEL or a provider API key (optional).`);
