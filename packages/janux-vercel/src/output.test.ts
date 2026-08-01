import { beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAppConfig } from '@janux/vite/config';
import { writeVercelOutput } from './output';

const PACKAGE = join(import.meta.dirname, '..');
const APP = join(import.meta.dirname, '__fixtures__/app');

/** The fixture is an app, so it has the adapter installed like one. */
beforeAll(() => {
  const scope = join(APP, 'node_modules/@janux');

  mkdirSync(scope, { recursive: true });
  if (!existsSync(join(scope, 'vercel'))) symlinkSync(PACKAGE, join(scope, 'vercel'));
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
