#!/usr/bin/env bun
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

// Install artifacts from running the template/examples in place (local dev of this package).
const SKIP = new Set(['node_modules', 'bun.lock', 'dist', '.janux']);
// Published, this file is `dist/bin.js` and its assets are one level up; in the
// workspace it is `bin.ts` in the package root. Asked once, so that "where are
// the assets" and "are we published" cannot answer differently.
const PUBLISHED = !existsSync(join(import.meta.dirname, 'package.json'));
const ROOT = PUBLISHED ? join(import.meta.dirname, '..') : import.meta.dirname;
const VERSION: string = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')).version;

const FLAGS = new Set(['--example', '--template']);

const [name, flag, pick] = process.argv.slice(2);

if (!name || !/^[a-z0-9-]+$/.test(name) || (flag && !FLAGS.has(flag))) {
  console.error('Usage: create-janux <app-name> [--example <name> | --template [name]]   (kebab-case)');
  process.exit(1);
}
const target = join(process.cwd(), name);

if (existsSync(target)) {
  console.error(`create-janux: "${name}" already exists`);
  process.exit(1);
}

/** Published packages ship the monorepo examples/templates in the package root; in-repo runs read the workspace. */
function assetsRoot(kind: 'examples' | 'templates'): string {
  return PUBLISHED ? join(ROOT, kind) : join(ROOT, '../..', kind);
}

/** Sorted: the listing (and the numbers an interactive pick answers with) must be deterministic. */
function assetNames(kind: 'examples' | 'templates'): string[] {
  return readdirSync(assetsRoot(kind), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function exampleDir(example: string | undefined): string {
  const names = assetNames('examples');

  if (!example || !names.includes(example)) {
    console.error(`create-janux: pick an example with --example <name>: ${names.join(', ')}`);
    process.exit(1);
  }

  return join(assetsRoot('examples'), example);
}

function templateDir(template: string | undefined): string {
  const names = assetNames('templates');

  if (!template || !names.includes(template)) {
    console.error(`create-janux: pick a template with --template <name>: ${names.join(', ')}`);
    process.exit(1);
  }

  return join(assetsRoot('templates'), template);
}

/** The one-line pitch each template carries in its own package.json. */
function pitch(template: string): string {
  return JSON.parse(readFileSync(join(assetsRoot('templates'), template, 'package.json'), 'utf-8')).description ?? '';
}

async function firstLine(): Promise<string> {
  for await (const line of console) return line.trim();

  return '';
}

/** `--template` with no name: list the gallery and read the pick (number or name) from stdin. */
async function chooseTemplate(): Promise<string> {
  const names = assetNames('templates');

  console.log('Pick a template:');
  names.forEach((template, index) => console.log(`  ${index + 1}. ${template} — ${pitch(template)}`));
  const answer = await firstLine();

  return templateDir(names[Number(answer) - 1] ?? answer);
}

async function sourceDir(): Promise<string> {
  if (flag === '--example') return exampleDir(pick);
  if (flag === '--template') return pick ? templateDir(pick) : chooseTemplate();

  return join(ROOT, 'template');
}

/** App name + real registry versions instead of the monorepo's workspace:* ranges. */
function writeAppPackage(): void {
  const path = join(target, 'package.json');
  const pkg = JSON.parse(readFileSync(path, 'utf-8').replace(/__APP_NAME__/g, name!));
  const deps = Object.entries(pkg.dependencies ?? {}).map(([dep, range]) => [dep, range === 'workspace:*' ? `^${VERSION}` : range]);

  writeFileSync(path, `${JSON.stringify({ ...pkg, name, dependencies: Object.fromEntries(deps) }, null, 2)}\n`);
}

/**
 * Same problem as `workspace:*`, one file over: in the monorepo an app's
 * tsconfig `extends` the shared base, and a copy of it points at a path that is
 * not there — which Vite reports as a 500 on every request rather than as a
 * missing file. Inlined here, the scaffolded app compiles on its own.
 */
function writeAppTsconfig(from: string): void {
  const path = join(target, 'tsconfig.json');
  const { extends: base, ...own } = JSON.parse(readFileSync(path, 'utf-8'));

  if (!base) return;
  // The base's own `extends` is dropped with it: its path was relative to the
  // base, and carrying it over would point the app at nothing.
  const { extends: _inheritedBase, ...inherited } = JSON.parse(readFileSync(resolve(from, base), 'utf-8'));

  writeFileSync(path, `${JSON.stringify({ ...inherited, ...own, compilerOptions: { ...inherited.compilerOptions, ...own.compilerOptions } }, null, 2)}\n`);
}

const source = await sourceDir();

cpSync(source, target, {
  recursive: true,
  filter: (file) => !SKIP.has(basename(file)),
});
writeAppPackage();
writeAppTsconfig(source);

// The app is the user's product from the first render: the placeholder is
// stamped in every text file, so no source greets them as __APP_NAME__.
const TEXT_FILE = /\.(?:ts|tsx|md|json|css|html|svg|txt)$/;

readdirSync(target, { recursive: true })
  .map(String)
  .filter((file) => TEXT_FILE.test(file))
  .forEach((file) => {
    const content = readFileSync(join(target, file), 'utf-8');

    if (content.includes('__APP_NAME__')) writeFileSync(join(target, file), content.replaceAll('__APP_NAME__', name));
  });

// The examples pin their own dev port; the hint must match what dev will print.
const devScript: string = JSON.parse(readFileSync(join(target, 'package.json'), 'utf-8')).scripts?.dev ?? '';
const devPort = /--port (\d+)/.exec(devScript)?.[1] ?? '3000';

console.log(`✔ ${name} created

  cd ${name}
  bun install
  bun run dev

The right panel is the agent surface — same thing as: curl localhost:${devPort}/_janux/manifest`);
