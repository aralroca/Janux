import { beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAppConfig } from '@janux/vite/config';
import { BUNDLE_PATH, buildFunction } from './build';
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

    expect(source).toContain("const root = join(import.meta.dir, '..');");
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
    const bytes = await buildFunction(APP, app);

    expect(bytes).toBeGreaterThan(0);

    const deployment = mkdtempSync(join(tmpdir(), 'janux-fn-'));

    await cp(join(APP, 'src'), join(deployment, 'src'), { recursive: true });
    await cp(join(APP, 'janux.config.ts'), join(deployment, 'janux.config.ts'));
    await cp(join(APP, BUNDLE_PATH), join(deployment, BUNDLE_PATH));

    // In its own process, like the function: the bundle publishes the app root
    // it was deployed at, and one process can only be one app.
    const serve = `const handler = (await import('./${BUNDLE_PATH}')).default;
      const response = await handler.fetch(new Request('https://janux.build/'));
      console.log(response.status, await response.text());`;
    const served = Bun.spawnSync(['bun', '-e', serve], { cwd: deployment });

    expect(served.stderr.toString()).toBe('');
    expect(served.stdout.toString()).toStartWith('200 ');
    expect(served.stdout.toString()).toContain('Deployed');
  });
});
