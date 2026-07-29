import { beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAppConfig } from '@janux/vite/config';
import { writeVercelOutput } from './output';
import { appModules, generateApp } from './generate';

const PACKAGE = join(import.meta.dirname, '..');
const APP = join(import.meta.dirname, '__fixtures__/app');

/** The fixture is an app, so it has the adapter installed like one. */
beforeAll(() => {
  const scope = join(APP, 'node_modules/@janux');

  mkdirSync(scope, { recursive: true });
  if (!existsSync(join(scope, 'vercel'))) symlinkSync(PACKAGE, join(scope, 'vercel'));
});

describe('appModules', () => {
  it('lists the app modules the server would import on the way up', async () => {
    const app = await resolveAppConfig(APP);

    expect(appModules(app)).toEqual([join(APP, 'src/routes/index.tsx'), join(APP, 'src/agent.ts')]);
  });

  /** No URL matches `_404`/`_500`, so the route list never names them — and a bundle without them has no error pages. */
  it('includes the error pages', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-vercel-errors-'));

    mkdirSync(join(root, 'src/routes'), { recursive: true });
    ['index.tsx', '_404.tsx', '_500.tsx'].forEach((file) =>
      writeFileSync(join(root, 'src/routes', file), 'export default () => null;'),
    );

    expect(appModules(await resolveAppConfig(root))).toEqual([
      join(root, 'src/routes/index.tsx'),
      join(root, 'src/routes/_404.tsx'),
      join(root, 'src/routes/_500.tsx'),
    ]);
  });
});

describe('generateApp', () => {
  it('imports every module statically, so a bundler can see through it', async () => {
    const source = generateApp(APP, await resolveAppConfig(APP));

    expect(source).toContain("import * as m0 from '../src/routes/index';");
    expect(source).toContain("import * as m1 from '../src/agent';");
    expect(source).toContain('[path("src/routes/index.tsx")]: m0,');
  });

  /** The build machine's absolute paths are not the runtime's — every path is rebuilt from `root`. */
  it('rebuilds paths from the running location, and never hardcodes the build root', async () => {
    const source = generateApp(APP, await resolveAppConfig(APP));

    expect(source).toContain("const root = join(import.meta.dirname, '..');");
    expect(source).toContain('routesDir: path("src/routes")');
    expect(source).not.toContain(APP);
  });
});

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
      console.log(response.status, await response.text());`;
    const served = Bun.spawnSync(['bun', '-e', serve], { cwd: deployment });

    expect(served.stderr.toString()).toBe('');
    expect(served.stdout.toString()).toStartWith('200 ');
    expect(served.stdout.toString()).toContain('Deployed');
    // Builds and serves a real deployment across three processes — the default
    // 5s is close enough for a loaded machine (parallel agents, cold caches)
    // to flake it.
  }, 30_000);
});
