#!/usr/bin/env bun
/**
 * Installs the tarballs into a bare Node project and imports them.
 *
 * This is the only check that means anything about the published shape: inside
 * the workspace every specifier resolves through a symlink to source, and Node
 * refuses to strip types under `node_modules` by design, so a package that only
 * ever ran here was never tested for the runtime most consumers use.
 *
 *   bun scripts/pack.ts && bun scripts/smoke-node.ts
 *
 * The project it builds lives outside the repository on purpose — inside it,
 * resolution would walk up and find the workspace.
 */
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Glob } from 'bun';
import { PACKED, PUBLISH_ORDER, readManifest } from './packaging/packages';

/**
 * Imports every subpath so `tsc` reaches every `.d.ts` the packages ship: a
 * consumer file naming three of them leaves the other five packages' types
 * unread, and a broken specifier inside a declaration is invisible to Node.
 */
function consumer(specifiers: string[]): string {
  return `${specifiers.map((specifier, index) => `import * as m${index} from '${specifier}';`).join('\n')}

export const wired = [${specifiers.map((_, index) => `m${index}`).join(', ')}].length;
`;
}

/**
 * Derived from the manifests, never listed by hand: a subpath nobody remembered
 * to add here is a subpath that ships untested.
 */
async function importable(): Promise<string[]> {
  const manifests = await Promise.all(PUBLISH_ORDER.map(readManifest));

  return manifests.flatMap((pkg) =>
    Object.keys(pkg.publishConfig?.exports ?? {}).map((subpath) => (subpath === '.' ? pkg.name : `${pkg.name}${subpath.slice(1)}`)),
  );
}

/**
 * A `bin` is the one thing an import cannot check, and it is where the compiled
 * layout actually bites: `create-janux` reads its template and version relative
 * to itself, which moves when `bin.ts` becomes `dist/bin.js`.
 */
async function brokenBin(root: string): Promise<string[]> {
  const scaffolded = await run(['npx', 'create-janux', 'smoke-app'], root);
  const ok = scaffolded.ok && (await Bun.file(join(root, 'smoke-app/package.json')).exists());

  if (!ok) console.error(`✗ npx create-janux\n${scaffolded.output}`);

  return ok ? [] : ['create-janux bin'];
}

function tsconfig(strict: boolean): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'es2022',
      module: 'nodenext',
      moduleResolution: 'nodenext',
      strict,
      noEmit: true,
      jsx: 'react-jsx',
      jsxImportSource: 'janux',
    },
    include: ['src'],
  });
}

interface Ran {
  ok: boolean;
  output: string;
}

async function run(command: string[], cwd: string): Promise<Ran> {
  const spawned = Bun.spawn(command, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([new Response(spawned.stdout).text(), new Response(spawned.stderr).text()]);

  return { ok: (await spawned.exited) === 0, output: `${stdout}${stderr}` };
}

async function project(tarballs: string[], specifiers: string[]): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'janux-smoke-'));

  mkdirSync(join(root, 'src'), { recursive: true });
  await Bun.write(join(root, 'package.json'), '{ "name": "janux-smoke", "private": true, "type": "module" }\n');
  await Bun.write(join(root, 'src/app.tsx'), consumer(specifiers));
  // The `@types` a real consumer already has, and needs here because nothing is
  // skipped: `@janux/vite`'s declarations name `node:http`, and `@ai-sdk/provider`
  // — reached through `@janux/agent` — names `json-schema` without declaring it.
  const types = ['typescript@5.9.3', '@types/node@24', '@types/json-schema@7'];
  const install = await run(['npm', 'install', '--no-audit', '--no-fund', ...types, ...tarballs], root);

  if (!install.ok) throw new Error(`npm install failed\n${install.output}`);

  return root;
}

/** A process per specifier, so one that poisons the module registry cannot hide another. */
async function brokenImports(root: string, specifiers: string[]): Promise<string[]> {
  const loaded = await Promise.all(
    specifiers.map((specifier) =>
      run(['node', '-e', `import('${specifier}').then(() => process.exit(0), (error) => { console.error(error.message); process.exit(1) })`], root),
    ),
  );

  return specifiers.flatMap((specifier, index) => {
    if (loaded[index]!.ok) return [];
    console.error(`✗ import ${specifier}\n${loaded[index]!.output}`);

    return [specifier];
  });
}

/**
 * A consumer's `strict` must not reach our code. It used to: with `main`
 * pointing at `.ts`, the consumer's own tsconfig type-checked our source and
 * decided the answer, and no user could fix an error inside `node_modules`.
 */
async function typechecked(root: string, strict: boolean): Promise<string | undefined> {
  const config = `tsconfig.${strict ? 'strict' : 'loose'}.json`;

  await Bun.write(join(root, config), tsconfig(strict));
  const checked = await run(['./node_modules/.bin/tsc', '-p', config], root);
  const ours = checked.output.split('\n').filter((line) => line.includes('node_modules'));

  if (checked.ok && ours.length === 0) return undefined;
  console.error(`✗ typecheck with strict: ${strict}\n${checked.output}`);

  return `strict: ${strict}`;
}

const packed = Bun.argv[2] ?? PACKED;
const tarballs = (await Array.fromAsync(new Glob('*/*.tgz').scan({ cwd: packed }))).map((path) => resolve(packed, path));

if (tarballs.length === 0) throw new Error(`no tarballs in ${packed}/ — run bun scripts/pack.ts first`);
const specifiers = await importable();
const root = await project(tarballs, specifiers);

console.log(`→ ${tarballs.length} tarballs installed in ${root} (node ${(await run(['node', '--version'], root)).output.trim()})`);
const broken = [
  ...(await brokenImports(root, specifiers)),
  ...(await brokenBin(root)),
  ...(await Promise.all([typechecked(root, true), typechecked(root, false)])).filter((failure) => failure !== undefined),
];

if (broken.length > 0) {
  console.error(`✗ ${broken.length} failed: ${broken.join(', ')}`);
  process.exit(1);
}
console.log(`✔ ${specifiers.length} subpaths import under Node, the bin runs, and it typechecks strict and loose`);
