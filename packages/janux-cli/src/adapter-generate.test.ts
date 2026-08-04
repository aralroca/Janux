import { describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolveAppConfig, toPosix } from '@janux/vite/config';
import { appModules, generateApp } from './adapter-generate';
import { bundlerPath } from './adapter-build';

const APP = join(import.meta.dirname, '__fixtures__/adapter-app');

describe('appModules', () => {
  it('lists the app modules the server would import on the way up', async () => {
    const app = await resolveAppConfig(APP);

    expect(appModules(app)).toEqual([join(APP, 'src/routes/index.tsx')]);
  });

  /**
   * The router reads the routes directory at boot, but it imports nothing else:
   * an api module, an http handler or a layout the map forgot is a tool or a
   * page that 500s on the first request in production and nowhere else.
   */
  it('includes the api modules, the http handlers and the layout chain', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-adapter-modules-'));
    const write = (file: string, code = 'export default () => null;') => {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), code);
    };

    write('src/routes/_layout.tsx');
    write('src/routes/index.tsx');
    write('src/routes/admin/users.tsx');
    write('src/server/shop.api.ts', 'export const list = 1;');
    write('src/api/webhook.ts', 'export const GET = 1;');
    write('src/ws.ts', 'export default {};');

    // `appModules` answers native paths; these name the app files forward-slash.
    const modules = appModules(await resolveAppConfig(root)).map((file) => toPosix(file.slice(root.length + 1)));

    expect(modules).toContain('src/server/shop.api.ts');
    expect(modules).toContain('src/api/webhook.ts');
    expect(modules).toContain('src/ws.ts');
    expect(modules).toContain('src/routes/_layout.tsx');
    // A layout wrapping two routes is one import, not two: the map is keyed by
    // path, and a duplicate would be a second binding of the same module.
    expect(modules.filter((file) => file === 'src/routes/_layout.tsx')).toHaveLength(1);
  });

  /**
   * The feed's `items()` is behavior, and behavior does not survive a config:
   * the generated module serializes config values as JSON, which drops
   * functions silently — a deployed app would answer `/rss.xml` with a 500 and
   * nothing before production would say so. So the feed lives in a module the
   * bundler inlines, like every other conventional single.
   */
  it('includes the feed module, so its items() survives bundling', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-adapter-feed-'));
    const write = (file: string, code: string) => {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), code);
    };

    write('src/routes/index.tsx', 'export default () => null;');
    write('src/feed.ts', 'export default { items: () => [{ url: "/a", title: "A" }] };');

    const app = await resolveAppConfig(root);

    expect(appModules(app).map((file) => toPosix(file.slice(root.length + 1)))).toContain('src/feed.ts');
    // And its path is rebuilt at runtime rather than frozen to this machine.
    expect(generateApp(root, app)).not.toContain(root);
  });

  /** No URL matches `_404`/`_500`, so the route list never names them — and a bundle without them has no error pages. */
  it('includes the error pages', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-adapter-errors-'));

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
    expect(source).toContain('[path("src/routes/index.tsx")]: m0,');
  });

  /** The build machine's absolute paths are not the runtime's — every path is rebuilt from `root`. */
  it('rebuilds paths from the running location, and never hardcodes the build root', async () => {
    const source = generateApp(APP, await resolveAppConfig(APP));

    expect(source).toContain("const root = join(import.meta.dirname, '..');");
    expect(source).toContain('routesDir: path("src/routes")');
    expect(source).not.toContain(APP);
  });

  /** Adapters share the generator, so the file has to say which one wrote it. */
  it('names the adapter that generated it', async () => {
    expect(generateApp(APP, await resolveAppConfig(APP), '@janux/node')).toContain('Generated by @janux/node');
  });
});

/**
 * `src/ws.ts` was the one conventional module the generator forgot, on both
 * counts: it was not in the module map, and its path was emitted as the build
 * machine's. It went unnoticed because the only adapter that existed could not
 * hold a socket open anyway — `@janux/node` can, and declares that it does.
 */
/**
 * The generator keeps a hand-written list of which config fields are paths, so
 * a new app convention added anywhere else silently freezes the build machine's
 * directory into the deployment — which is exactly how `src/ws.ts` shipped
 * broken. This builds an app with every convention present and asserts the
 * generated module mentions the build root nowhere at all, so the next
 * convention has to be added to the list or this fails.
 */
describe('generateApp — every path field, not just the remembered ones', () => {
  it('never leaks the build machine root, whatever conventions the app uses', async () => {
    const root = mkdtempSync(join(tmpdir(), 'janux-adapter-full-'));
    const files: Record<string, string> = {
      'src/routes/index.tsx': 'export default () => null;',
      'src/routes/_layout.tsx': 'export default ({ children }: any) => children;',
      'src/server/thing.api.ts': 'export const noop = {};',
      'src/api/raw.ts': 'export const GET = () => new Response("ok");',
      'src/ws.ts': "export default { path: '/ws' };",
      'src/agent.ts': 'export default {};',
      'src/stores.ts': 'export const nothing = {};',
      'src/i18n.ts': 'export default {};',
      'src/middleware.ts': 'export default () => undefined;',
      'src/ctx.ts': 'export default () => ({});',
      'src/matchers.ts': 'export const id = (value: string) => value.length > 0;',
      'src/client.ts': 'export {};',
      'src/styles.css': 'body { margin: 0; }',
      'src/schedules/nightly.ts': 'export default { cron: "@daily", run: () => {} };',
    };

    Object.entries(files).forEach(([file, contents]) => {
      mkdirSync(join(root, dirname(file)), { recursive: true });
      writeFileSync(join(root, file), contents);
    });

    const config = await resolveAppConfig(root);
    const source = generateApp(root, config);
    // The fixture is meant to exercise the path fields, not one of them.
    const pathFields = Object.entries(config).filter(([key, value]) => key !== 'root' && typeof value === 'string' && value.startsWith(root));

    expect(pathFields.length).toBeGreaterThan(8);
    pathFields.forEach(([key]) => expect(source).toContain(`${key}: path(`));
    expect(source).not.toContain(root);
  });
});

describe('generateApp — the WebSocket module', () => {
  function appWithWs(): string {
    const root = mkdtempSync(join(tmpdir(), 'janux-adapter-ws-'));

    mkdirSync(join(root, 'src/routes'), { recursive: true });
    writeFileSync(join(root, 'src/routes/index.tsx'), 'export default () => null;');
    writeFileSync(join(root, 'src/ws.ts'), "export default { path: '/ws' };\n");

    return root;
  }

  it('is one of the modules the bundle inlines', async () => {
    const root = appWithWs();

    expect(appModules(await resolveAppConfig(root))).toContain(join(root, 'src/ws.ts'));
  });

  it('has its path rebuilt at runtime, not frozen to the build machine', async () => {
    const root = appWithWs();
    const source = generateApp(root, await resolveAppConfig(root));

    expect(source).toContain('websocketModule: path("src/ws.ts")');
    expect(source).not.toContain(root);
  });
});

describe('generateApp — schedules', () => {
  function appWithSchedules(): string {
    const root = mkdtempSync(join(tmpdir(), 'janux-adapter-schedules-'));

    mkdirSync(join(root, 'src/routes'), { recursive: true });
    mkdirSync(join(root, 'src/schedules/billing'), { recursive: true });
    writeFileSync(join(root, 'src/routes/index.tsx'), 'export default () => null;');
    writeFileSync(join(root, 'src/schedules/nightly.ts'), 'export default { cron: "@daily", run: () => {} };\n');
    writeFileSync(join(root, 'src/schedules/billing/sweep.ts'), 'export default { cron: "@hourly", run: () => {} };\n');
    writeFileSync(join(root, 'src/schedules/_config.ts'), 'export default {};\n');

    return root;
  }

  it('inlines every schedule module, the shared _config included', async () => {
    const root = appWithSchedules();
    const modules = appModules(await resolveAppConfig(root)).map((file) => file.slice(root.length + 1));

    expect(modules).toContain('src/schedules/nightly.ts');
    expect(modules).toContain('src/schedules/billing/sweep.ts');
    expect(modules).toContain('src/schedules/_config.ts');
  });

  it('records how the deployment fires them, and only when it is not the default', async () => {
    const root = appWithSchedules();
    const config = await resolveAppConfig(root);

    expect(generateApp(root, config, '@janux/test', 'http')).toContain("scheduleTrigger: 'http',");
    expect(generateApp(root, config, '@janux/test', 'process')).not.toContain('scheduleTrigger');
    expect(generateApp(root, config)).not.toContain('scheduleTrigger');
  });
});

describe('bundlerPath', () => {
  /**
   * The bundler is spawned as a sibling file, and what that sibling is called
   * depends on where the package is running from: `bundler.ts` in the workspace,
   * `bundler.js` once the package is compiled into `dist/`. Naming one of them
   * outright is a build that works here and breaks the moment it is published.
   */
  it('points at a file that exists next to this module', () => {
    const found = bundlerPath();

    expect(existsSync(found)).toBe(true);
    expect(found).toBe(join(import.meta.dirname, 'bundler.ts'));
  });

  it('accepts the compiled name too', () => {
    expect(bundlerPath((path) => path.endsWith('bundler.js'))).toBe(join(import.meta.dirname, 'bundler.js'));
  });

  it('says so when neither is there', () => {
    expect(() => bundlerPath(() => false)).toThrow(/bundler/);
  });
});
