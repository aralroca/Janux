#!/usr/bin/env bun
/**
 * Scaffolds every template from the packed `create-janux` and runs its evals —
 * outside the repository, which is the whole point.
 *
 *   bun scripts/pack.ts && bun scripts/smoke-templates.ts
 *
 * A template promises to work on a clean machine, and inside the workspace that
 * promise cannot be tested: `janux` is a symlink to source and Bun hoists every
 * dependency any sibling declares, so a template missing one of its own installs
 * fine here and dies for the first user who runs it. (That is not hypothetical —
 * `content-site` shipped without `@mdx-js/mdx` and served a 500 until this ran.)
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Glob } from 'bun';
import { PACKED, PUBLISH_ORDER, readManifest } from './packaging/packages';

const START_TIMEOUT_MS = 10 * 60_000;

interface Ran {
  ok: boolean;
  output: string;
}

async function run(command: string[], cwd: string): Promise<Ran> {
  const spawned = Bun.spawn(command, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([new Response(spawned.stdout).text(), new Response(spawned.stderr).text()]);
  const exited = await Promise.race([spawned.exited, Bun.sleep(START_TIMEOUT_MS).then(() => 'timeout' as const)]);

  if (exited === 'timeout') spawned.kill();

  return { ok: exited === 0, output: `${stdout}${stderr}` };
}

/** Derived from the directory, never listed here: a template nobody added stays untested. */
function templates(): string[] {
  return readdirSync('templates', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Published package name → its tarball, read from the manifests rather than guessed from filenames. */
async function tarballsByName(packed: string): Promise<Map<string, string>> {
  const paths = await Array.fromAsync(new Glob('*/*.tgz').scan({ cwd: packed }));
  const named = await Promise.all(
    PUBLISH_ORDER.map(async (dir) => {
      const path = paths.find((entry) => entry.startsWith(`${dir}/`));

      return [(await readManifest(dir)).name as string, path && resolve(packed, path)] as const;
    }),
  );

  return new Map(named.filter((entry): entry is [string, string] => entry[1] !== undefined));
}

/**
 * Every framework resolution — the transitive exact pins included — must come
 * from this commit's tarballs. The packages pin each other exactly at publish
 * time, so during a release PR the pinned version does not exist on npm yet:
 * asking the registry for it is exactly backwards — the smoke gates the
 * release, it cannot follow it. Rewriting the declared specs and adding the
 * same paths as `overrides` keeps npm away from the registry for every
 * `@janux/*` edge. Only specs of names the template already declares are
 * touched, so a template that forgot one of its own dependencies still fails
 * here — that omission is the single thing this script exists to catch.
 */
function resolveFromTarballs(app: string, byName: Map<string, string>): void {
  const manifestPath = join(app, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const specs = new Map([...byName].map(([name, path]) => [name, `file:${path}`]));

  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (specs.has(name)) manifest.dependencies[name] = specs.get(name);
  }
  manifest.overrides = Object.fromEntries(specs);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * The scaffolded app asks the registry for `^<version>`; reinstalling from the
 * tarballs pins it to the code in this commit instead, so a template is tested
 * against the PR rather than against the last release.
 */
async function scaffold(root: string, template: string, byName: Map<string, string>): Promise<string | undefined> {
  const app = join(root, `smoke-${template}`);
  const created = await run(['npx', 'create-janux', `smoke-${template}`, '--template', template], root);

  if (!created.ok) return `${template}: scaffold failed\n${created.output}`;
  resolveFromTarballs(app, byName);
  const installed = await run(['npm', 'install', '--no-audit', '--no-fund'], app);

  return installed.ok ? undefined : `${template}: install failed\n${installed.output}`;
}

/**
 * Every template's `eval` script pins the same dev port, and `janux eval
 * --start` only waits for *something* to answer it — so a previous app whose
 * SIGTERM has not landed yet would be the one under test. Waited out here.
 */
async function portFree(port: number): Promise<void> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const taken = await fetch(`http://localhost:${port}/`).then(() => true, () => false);

    if (!taken) return;
    await Bun.sleep(500);
  }
  throw new Error(`port ${port} is still bound — something else is serving it`);
}

/** The port the template's own dev/start scripts pin, so the wait matches what `eval` will spawn. */
function evalPort(template: string): number {
  const scripts = JSON.parse(readFileSync(`templates/${template}/package.json`, 'utf8')).scripts ?? {};

  return Number(/--port (\d+)/.exec(scripts.start ?? '')?.[1] ?? 3000);
}

/** The template's own command, the one its README tells a user to run. */
async function evaluated(root: string, template: string): Promise<string | undefined> {
  await portFree(evalPort(template));
  const ran = await run(['npm', 'run', 'eval'], join(root, `smoke-${template}`));

  return ran.ok ? undefined : `${template}: evals failed\n${ran.output}`;
}

const packed = Bun.argv[2] ?? PACKED;
const byName = await tarballsByName(packed);

if (byName.size === 0) throw new Error(`no tarballs in ${packed}/ — run bun scripts/pack.ts first`);
const creator = byName.get('create-janux');

if (!creator) throw new Error('no create-janux tarball — the gallery ships inside it');

const root = mkdtempSync(join(tmpdir(), 'janux-templates-'));
const ready = await run(['npm', 'install', '--no-audit', '--no-fund', creator], root);

if (!ready.ok) throw new Error(`npm install create-janux failed\n${ready.output}`);
console.log(`→ scaffolding ${templates().length} templates in ${root}`);

// Sequential: each app installs its own tree and serves on its own pinned port.
const failures: string[] = [];

for (const template of templates()) {
  const failure = (await scaffold(root, template, byName)) ?? (await evaluated(root, template));

  console.log(`${failure ? '✗' : '✔'} ${template}`);
  if (failure) failures.push(failure);
}

if (failures.length === 0) rmSync(root, { recursive: true, force: true });
if (failures.length > 0) {
  console.error(failures.join('\n\n'));
  console.error(`the scaffolded apps are left in ${root}`);
  process.exit(1);
}
console.log('✔ every template scaffolds from the tarball, installs clean and passes its evals');
