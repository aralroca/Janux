import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { JanuxAppConfig } from '@janux/vite/config';
import { BUNDLE_PATH, buildFunction } from './build';
import { hostRoutes } from './host-routing';

/**
 * The deployment, written as a Build Output API directory.
 *
 * The alternative — letting the platform build `api/**` — means letting it
 * *trace* what the function needs, and a traced function cannot leave a
 * workspace: `node_modules/janux` is a symlink to `packages/janux`, outside the
 * project, and packaging one is fatal. Writing the output ourselves means
 * nothing is traced and nothing is guessed: these bytes, that config.
 *
 * @see https://vercel.com/docs/build-output-api
 */

const OUTPUT_DIR = '.vercel/output';
const FUNCTION_DIR = `${OUTPUT_DIR}/functions/index.func`;
const STATIC_DIR = `${OUTPUT_DIR}/static`;
/**
 * The launcher may hand the module a `Request` or look for `{ fetch }`
 * depending on which runtime picks it up, so the export answers to both.
 */
const HANDLER = `import server from './${BUNDLE_PATH}';

const handler = (request) => server.fetch(request);

handler.fetch = handler;

export default handler;
`;
/**
 * A Build Output API function names its own runtime: `bunVersion` in
 * vercel.json only reaches the functions Vercel builds itself, and a Node
 * launcher would run this bundle without `Bun.file` existing.
 */
const RUNTIME = 'bun1.x';

export interface OutputOptions {
  /** Extra top-level directories the app reads at runtime (`content` for a docs site). */
  include?: string[];
  /** Packages with platform binaries: kept out of the bundle, installed beside the function. */
  native?: string[];
  maxDuration?: number;
  /** Runs the install command — a seam so tests assert the argv instead of hitting the registry. */
  run?: (argv: string[]) => { success: boolean; stderr: string };
}

/** The platform a Vercel Bun function runs on — what the native install targets, whatever machine builds. */
const FUNCTION_PLATFORM = ['--os', 'linux', '--cpu', 'x64', '--libc', 'glibc'];

const runInstall = (argv: string[]): { success: boolean; stderr: string } => {
  const proc = Bun.spawnSync(argv, { stdout: 'inherit' });

  return { success: proc.success, stderr: proc.stderr.toString() };
};

/**
 * Installs each `--native` package into the function's own `node_modules`,
 * where the externalized specifier resolves at runtime. npm does the install
 * because it can be aimed at another platform: the build machine holds a
 * darwin binary, the function needs linux-x64-gnu, and `--os`/`--cpu`/`--libc`
 * pick the right optional dependency without either being run. The version is
 * pinned to what the app resolved — a package the app never installed has no
 * version to pin, and that is a wrong flag to report, not a guess to make.
 */
export async function installNativePackages(
  root: string,
  target: string,
  packages: string[],
  run: (argv: string[]) => { success: boolean; stderr: string } = runInstall,
): Promise<void> {
  for (const pkg of packages) {
    const manifest = join(root, 'node_modules', pkg, 'package.json');

    if (!existsSync(manifest)) {
      throw new Error(`janux-vercel: --native ${pkg} is not installed — the function cannot carry what the app does not have`);
    }
    const { version } = await Bun.file(manifest).json();
    const install = run([
      'npm',
      'install',
      `${pkg}@${version}`,
      '--prefix',
      target,
      ...FUNCTION_PLATFORM,
      '--no-save',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ]);

    if (!install.success) throw new Error(`janux-vercel: could not install ${pkg}@${version} for the function\n${install.stderr}`);
  }
}

/** Config the app reads from disk at runtime, so it travels with the function. */
async function copyRuntimeFiles(root: string, target: string, include: string[]): Promise<void> {
  const dirs = ['src', ...include];

  for (const dir of dirs) {
    if (existsSync(join(root, dir))) await cp(join(root, dir), join(target, dir), { recursive: true });
  }
  await copyServerDist(root, target);
}

/**
 * Exactly what the prod server opens under `dist/client` at boot — the list
 * `prod.ts` and `fonts.ts` read, not a directory heuristic. Everything else
 * there is the browser's payload: the CDN serves it from `static/`, and a
 * copy inside the function only counts against the platform's size ceiling,
 * which a media-heavy `public/` (copied into `dist/client` by the build) or
 * the image optimizer's `_janux/image` output is enough to blow through.
 */
const SERVER_READ_CLIENT_PATHS = [
  'styles.css', // prod.ts: inlined or served as the app stylesheet
  'islands.json', // prod.ts: the island catalog
  'client.js', // prod.ts: probed for runtimeUrl
  'sw.js', // service-worker.ts: probed for serviceWorkerUrl
  '_janux/font/fonts.css', // fonts.ts: font faces for the shell
  '_janux/font/preloads.json', // fonts.ts: preload hrefs for the shell
];

async function copyServerDist(root: string, target: string): Promise<void> {
  const client = join(root, 'dist/client');

  for (const path of SERVER_READ_CLIENT_PATHS) {
    if (existsSync(join(client, path))) {
      await cp(join(client, path), join(target, 'dist/client', path));
    }
  }
}

async function writeFunction(root: string, app: JanuxAppConfig, { include = [], native = [], maxDuration, run }: OutputOptions): Promise<number> {
  const target = join(root, FUNCTION_DIR);
  const bytes = await buildFunction(root, app, native);

  await mkdir(join(target, '.janux'), { recursive: true });
  await cp(join(root, BUNDLE_PATH), join(target, BUNDLE_PATH));
  await Bun.write(join(target, 'index.js'), HANDLER);
  await Bun.write(join(target, 'package.json'), '{"type":"module"}\n');
  await Bun.write(
    join(target, '.vc-config.json'),
    `${JSON.stringify({ runtime: RUNTIME, handler: 'index.js', launcherType: 'Nodejs', supportsResponseStreaming: true, ...(maxDuration ? { maxDuration } : {}) }, null, 2)}\n`,
  );
  await copyRuntimeFiles(root, target, include);
  await installNativePackages(root, target, native, run);

  return bytes;
}

/**
 * Static assets first (the CDN answers those), then the app.
 *
 * A static export has no server left to apply the declared `redirects`/
 * `rewrites`, so they are compiled into the table ahead of `filesystem`. A
 * server deployment gets none of them here on purpose: the function applies
 * them itself, and a copy in the platform's table could only ever disagree.
 */
export function routes(server: boolean, app: JanuxAppConfig): unknown[] {
  if (!server) return [...hostRoutes(app.redirects, app.rewrites), { handle: 'filesystem' }];

  return [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/index' }];
}

/**
 * Writes `.vercel/output`. Vercel picks it up after the build command and skips
 * its own build entirely — which is the point.
 */
export async function writeVercelOutput(root: string, app: JanuxAppConfig, options: OutputOptions = {}): Promise<number> {
  const server = app.output !== 'static';

  await rm(join(root, OUTPUT_DIR), { recursive: true, force: true });
  await mkdir(join(root, STATIC_DIR), { recursive: true });
  if (existsSync(join(root, 'dist/client'))) {
    await cp(join(root, 'dist/client'), join(root, STATIC_DIR), { recursive: true });
  }
  await Bun.write(join(root, OUTPUT_DIR, 'config.json'), `${JSON.stringify({ version: 3, routes: routes(server, app) }, null, 2)}\n`);

  return server ? writeFunction(root, app, options) : 0;
}
