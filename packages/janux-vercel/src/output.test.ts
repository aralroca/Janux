import { beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAppConfig } from '@janux/vite/config';
import { ensureFakeNative, FAKE_NATIVE_MARKER } from './__fixtures__/fake-native';
import { routes, writeVercelOutput } from './output';

const PACKAGE = join(import.meta.dirname, '..');
const APP = join(import.meta.dirname, '__fixtures__/app');

/** The fixture is an app, so it has the adapter installed like one. */
beforeAll(() => {
  const scope = join(APP, 'node_modules/@janux');

  mkdirSync(scope, { recursive: true });
  if (!existsSync(join(scope, 'vercel'))) symlinkSync(PACKAGE, join(scope, 'vercel'));
  ensureFakeNative(APP);
});

/* `appModules` and `generateApp` moved to @janux/cli/adapter — see adapter-generate.test.ts there. */

/**
 * The two failures this module exists for, both of which only appear once the
 * app leaves the machine that installed it:
 *
 * - an app resolved at boot dies on its first import, because a function has no
 *   `node_modules` beside it (`Cannot find package 'janux' from janux.config.ts`);
 * - a traced function in a workspace is rejected outright — `node_modules/janux`
 *   is a symlink out of the project ("invalid deployment package").
 *
 * So this builds the deployment for real and serves it from a directory holding
 * the app's source and the bundle, and nothing else. It is the only test that
 * would notice the day either of those comes back.
 */
describe('a bundled function with no node_modules beside it', () => {
  it('serves the app', async () => {
    const app = await resolveAppConfig(APP);

    expect(await writeVercelOutput(APP, app)).toBeGreaterThan(0);

    // The function directory as the platform will unpack it, moved somewhere
    // with no `node_modules` anywhere above it.
    const deployment = mkdtempSync(join(tmpdir(), 'janux-fn-'));

    await cp(join(APP, '.vercel/output/functions/index.func'), deployment, { recursive: true });

    // In its own process, like the function: the bundle publishes the app root
    // it was deployed at, and one process can only be one app.
    const serve = `const handler = (await import('./index.js')).default;
      const response = await handler(new Request('https://janux.build/'));
      // One string, not (number, string): bun colours an inspected number, so
      // the status arrived as \`\\x1b[33m200\\x1b[0m\` and the prefix assertion
      // below failed wherever FORCE_COLOR is set — every local run, never CI.
      console.log(\`\${response.status} \${await response.text()}\`);`;
    const served = Bun.spawnSync(['bun', '-e', serve], { cwd: deployment });

    expect(served.stderr.toString()).toBe('');
    expect(served.stdout.toString()).toStartWith('200 ');
    expect(served.stdout.toString()).toContain('Deployed');
    // Builds and serves a real deployment across three processes — the default
    // 5s is close enough for a loaded machine (parallel agents, cold caches)
    // to flake it.
  }, 30_000);
});

/**
 * The function carries what the server reads back at boot — an allowlist
 * drawn from `prod.ts` and `fonts.ts`, nothing inferred — and none of what
 * the CDN already answers. The distinction only matters at scale: a
 * media-heavy app copies `public/` into `dist/client`, and a function that
 * carries it too blows through the platform's 250MB ceiling for bytes no
 * request would ever read from it. The allowlist is what keeps a root-level
 * `/hero.mp4` or the optimizer's `_janux/image` output on the CDN alone.
 */
describe('the function payload', () => {
  it('carries the files the server reads, not the bytes the CDN answers', async () => {
    const client = join(APP, 'dist/client');

    // dist/client as a built app leaves it: server-read manifests, the
    // framework's assets, and the browser payload beside them — including a
    // root-level media file from public/ and the image optimizer's output.
    await Bun.write(join(client, 'styles.css'), 'body{}');
    await Bun.write(join(client, 'islands.json'), '{}');
    await Bun.write(join(client, 'sw.js'), 'self.skipWaiting();');
    await Bun.write(join(client, '_janux/font/fonts.css'), '@font-face{}');
    await Bun.write(join(client, '_janux/font/preloads.json'), '[]');
    await Bun.write(join(client, '_janux/font/manrope.woff2'), 'x'.repeat(1024));
    await Bun.write(join(client, '_janux/image/hero-1200.avif'), 'x'.repeat(1024));
    await Bun.write(join(client, 'hero.mp4'), 'x'.repeat(1024));
    await Bun.write(join(client, 'assets/chunk-abc.js'), 'export {};');
    await Bun.write(join(client, 'images/big.bin'), 'x'.repeat(1024));

    await writeVercelOutput(APP, await resolveAppConfig(APP));

    const fn = join(APP, '.vercel/output/functions/index.func');

    // The CDN gets all of it.
    expect(existsSync(join(APP, '.vercel/output/static/assets/chunk-abc.js'))).toBe(true);
    expect(existsSync(join(APP, '.vercel/output/static/images/big.bin'))).toBe(true);
    expect(existsSync(join(APP, '.vercel/output/static/hero.mp4'))).toBe(true);
    expect(existsSync(join(APP, '.vercel/output/static/_janux/image/hero-1200.avif'))).toBe(true);

    // The function gets what its server will actually open.
    expect(existsSync(join(fn, 'dist/client/styles.css'))).toBe(true);
    expect(existsSync(join(fn, 'dist/client/islands.json'))).toBe(true);
    expect(existsSync(join(fn, 'dist/client/sw.js'))).toBe(true);
    expect(existsSync(join(fn, 'dist/client/_janux/font/fonts.css'))).toBe(true);
    expect(existsSync(join(fn, 'dist/client/_janux/font/preloads.json'))).toBe(true);
    expect(existsSync(join(fn, 'src/routes/index.tsx'))).toBe(true);

    // And none of what only a browser would fetch — not the payload
    // directories, not root-level media, not the framework's own image and
    // font binaries.
    expect(existsSync(join(fn, 'dist/client/assets'))).toBe(false);
    expect(existsSync(join(fn, 'dist/client/images'))).toBe(false);
    expect(existsSync(join(fn, 'dist/client/hero.mp4'))).toBe(false);
    expect(existsSync(join(fn, 'dist/client/_janux/image'))).toBe(false);
    expect(existsSync(join(fn, 'dist/client/_janux/font/manrope.woff2'))).toBe(false);
  }, 30_000);
});

/**
 * A native package cannot ride the bundle: its platform binary is a file the
 * bundler cannot inline, and the binary the dev machine has is the wrong one
 * anyway (darwin-arm64 on a laptop, linux-x64-gnu in the function). `--native`
 * splits the problem: the specifier stays bare in the bundle, and the package
 * is installed beside it for the platform the function actually runs on,
 * pinned to the version the app already resolved.
 */
describe('a native dependency', () => {
  it('stays a bare specifier and is installed for the function platform', async () => {
    const runs: string[][] = [];

    await writeVercelOutput(APP, await resolveAppConfig(APP), {
      native: ['fake-native'],
      run: (argv) => {
        runs.push(argv);
        return { success: true, stderr: '' };
      },
    });

    const bundle = await Bun.file(join(APP, '.vercel/output/functions/index.func/.janux/server.js')).text();

    // Externalized, not inlined: the specifier survives, the module body does not.
    expect(bundle).toContain('fake-native');
    expect(bundle).not.toContain(FAKE_NATIVE_MARKER);

    // Installed where the bundle resolves it, for the platform it runs on,
    // pinned to the version the app has — not whatever the registry says today.
    expect(runs).toEqual([
      [
        'npm',
        'install',
        'fake-native@1.2.3',
        '--prefix',
        join(APP, '.vercel/output/functions/index.func'),
        '--os',
        'linux',
        '--cpu',
        'x64',
        '--libc',
        'glibc',
        '--no-save',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
      ],
    ]);
  }, 30_000);

  /** A package the app never installed has no version to pin — that is a wrong flag, not a guess to make. */
  it('refuses a native package the app does not have', async () => {
    const app = await resolveAppConfig(APP);

    expect(
      writeVercelOutput(APP, app, { native: ['missing-native'], run: () => ({ success: true, stderr: '' }) }),
    ).rejects.toThrow('missing-native');
  }, 30_000);
});

/**
 * A static export has no function to invoke, so the output directory is the
 * whole deployment: prerendered HTML on the CDN and a routing table that never
 * mentions a server. Writing one anyway would put a cold start in front of
 * files Vercel can already answer.
 */
describe('a static export', () => {
  it('is the CDN and nothing else', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-static-out-'));

    mkdirSync(join(root, 'dist/client'), { recursive: true });
    await Bun.write(join(root, 'dist/client/index.html'), '<!doctype html><title>x</title>');
    await Bun.write(join(root, 'janux.config.ts'), 'export default { output: "static" };\n');

    const bytes = await writeVercelOutput(root, await resolveAppConfig(root));
    const config = await Bun.file(join(root, '.vercel/output/config.json')).json();

    expect(bytes).toBe(0);
    expect(config).toEqual({ version: 3, routes: [{ handle: 'filesystem' }] });
    expect(await Bun.file(join(root, '.vercel/output/static/index.html')).exists()).toBe(true);
    expect(existsSync(join(root, '.vercel/output/functions'))).toBe(false);
  });

  /**
   * The one thing a static export cannot do for itself. With no server left to
   * apply them, the app's declared `redirects`/`rewrites` have to reach the CDN
   * as routing table entries — expressed in Vercel's own vocabulary, compiled
   * from the same patterns the router reads, and placed before `filesystem` so
   * the old URL never resolves to a file.
   */
  it('carries the declared redirects and rewrites into the routing table', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-static-out-'));

    mkdirSync(join(root, 'dist/client'), { recursive: true });
    await Bun.write(
      join(root, 'janux.config.ts'),
      `export default {
        output: 'static',
        redirects: [{ from: '/blog/[slug]', to: '/posts/[slug]' }, { from: '/old', to: '/', status: 301 }],
        rewrites: [{ from: '/help/[...path]', to: '/docs/[...path]' }],
      };\n`,
    );

    await writeVercelOutput(root, await resolveAppConfig(root));
    const { routes } = await Bun.file(join(root, '.vercel/output/config.json')).json();

    expect(routes).toEqual([
      { src: '^/blog/(?<slug>[^/]+)$', headers: { Location: '/posts/$slug' }, status: 308 },
      { src: '^/old$', headers: { Location: '/' }, status: 301 },
      { src: '^/help/(?<path>.+)$', dest: '/docs/$path' },
      { handle: 'filesystem' },
    ]);
  });

  /**
   * A server deployment has a Janux server in front of every request, and that
   * server is the one implementation of these rules. Restating them in the
   * platform's table would be a second one, free to disagree.
   */
  it('leaves them to the server when there is a server', async () => {
    const app = { ...(await resolveAppConfig(APP)), redirects: [{ from: '/old', to: '/' }] };

    expect(routes(true, app)).toEqual([{ handle: 'filesystem' }, { src: '/(.*)', dest: '/index' }]);
  });

  /**
   * The output directory is rewritten, not merged into: a file left behind by
   * the previous build is a file Vercel deploys, and a stale page is worse than
   * a missing one.
   */
  it('replaces whatever the last build left behind', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-static-out-'));

    mkdirSync(join(root, 'dist/client'), { recursive: true });
    await Bun.write(join(root, 'dist/client/index.html'), '<!doctype html><title>x</title>');
    await Bun.write(join(root, 'janux.config.ts'), 'export default { output: "static" };\n');
    await Bun.write(join(root, '.vercel/output/static/gone.html'), 'from the last build');

    await writeVercelOutput(root, await resolveAppConfig(root));

    expect(existsSync(join(root, '.vercel/output/static/gone.html'))).toBe(false);
    expect(await Bun.file(join(root, '.vercel/output/static/index.html')).exists()).toBe(true);
  });

  /** An app that has not been built yet still gets a valid output directory rather than a crash. */
  it('writes an empty CDN directory for an app with no client build', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-static-out-'));

    await Bun.write(join(root, 'janux.config.ts'), 'export default { output: "static" };\n');
    await writeVercelOutput(root, await resolveAppConfig(root));

    expect(existsSync(join(root, '.vercel/output/static'))).toBe(true);
  });
});
