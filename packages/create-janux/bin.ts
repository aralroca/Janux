#!/usr/bin/env bun
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

// Install artifacts from running the template/examples in place (local dev of this package).
const SKIP = new Set(['node_modules', 'bun.lock', 'dist']);
const VERSION: string = JSON.parse(readFileSync(join(import.meta.dirname, 'package.json'), 'utf-8')).version;

const [name, flag, exampleName] = process.argv.slice(2);

if (!name || !/^[a-z0-9-]+$/.test(name) || (flag && flag !== '--example')) {
  console.error('Usage: create-janux <app-name> [--example <name>]   (kebab-case)');
  process.exit(1);
}
const target = join(process.cwd(), name);

if (existsSync(target)) {
  console.error(`create-janux: "${name}" already exists`);
  process.exit(1);
}

/** Published packages ship the monorepo examples next to bin.ts; in-repo runs read the workspace. */
function examplesRoot(): string {
  const published = join(import.meta.dirname, 'examples');

  return existsSync(published) ? published : join(import.meta.dirname, '../../examples');
}

function exampleDir(example: string | undefined): string {
  const root = examplesRoot();
  const names = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (!example || !names.includes(example)) {
    console.error(`create-janux: pick an example with --example <name>: ${names.join(', ')}`);
    process.exit(1);
  }

  return join(root, example);
}

/** App name + real registry versions instead of the monorepo's workspace:* ranges. */
function writeAppPackage(): void {
  const path = join(target, 'package.json');
  const pkg = JSON.parse(readFileSync(path, 'utf-8').replace(/__APP_NAME__/g, name!));
  const deps = Object.entries(pkg.dependencies ?? {}).map(([dep, range]) => [dep, range === 'workspace:*' ? `^${VERSION}` : range]);

  writeFileSync(path, `${JSON.stringify({ ...pkg, name, dependencies: Object.fromEntries(deps) }, null, 2)}\n`);
}

const source = flag ? exampleDir(exampleName) : join(import.meta.dirname, 'template');

cpSync(source, target, {
  recursive: true,
  filter: (file) => !SKIP.has(basename(file)),
});
writeAppPackage();

const readme = join(target, 'README.md');

if (existsSync(readme)) {
  writeFileSync(readme, readFileSync(readme, 'utf-8').replace(/__APP_NAME__/g, name));
}
console.log(`✔ ${name} created

  cd ${name}
  bun install
  bun run dev

The right panel is the agent surface — same thing as: curl localhost:3000/_janux/manifest`);
