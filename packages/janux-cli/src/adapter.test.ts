import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAppConfig } from '@janux/vite/config';
import { createRequestHandler, unsupportedFeatures, type AdapterCapabilities } from './adapter';
import { createAdapterBuilder, GENERATED_DIR, runAdapter } from './adapter-build';

/**
 * The adapter API is the thing third parties write against, so these tests are
 * written the way a third party would: through the published contract, never
 * through Janux internals.
 */

/**
 * A scratch app for everything that only reads the filesystem. Anything that
 * imports or bundles the app needs `janux` resolvable from it, which a temp
 * directory outside the workspace cannot give — those use FIXTURE.
 */
function scaffold(): string {
  const root = mkdtempSync(join(tmpdir(), 'janux-adapter-'));

  mkdirSync(join(root, 'src/routes'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{"name":"adapter-fixture","type":"module"}');
  writeFileSync(join(root, 'src/routes/index.tsx'), 'export default function Home() { return null; }\n');

  return root;
}

const FIXTURE = join(import.meta.dirname, '__fixtures__/adapter-app');
const FULL: AdapterCapabilities = { websocket: true, streaming: true, filesystem: true, schedules: 'process', redirects: true };

/** What an adapter's generated `.janux/app.ts` hands the handler: modules keyed by absolute path. */
async function prebuiltFixture() {
  const route = join(FIXTURE, 'src/routes/index.tsx');

  return { root: FIXTURE, config: await resolveAppConfig(FIXTURE), modules: { [route]: await import(route) } };
}

describe('createRequestHandler', () => {
  it('serves a prebuilt app: the modules come from the generated map, not from disk', async () => {
    const response = await createRequestHandler(await prebuiltFixture()).fetch(new Request('http://test/'));

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Adapted');
  });

  it('boots once per instance, not once per request — a cold start pays for the whole app', async () => {
    const handler = createRequestHandler(await prebuiltFixture());
    const [first, second] = await Promise.all([handler.fetch(new Request('http://test/')), handler.fetch(new Request('http://test/'))]);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await first.text()).toContain('Adapted');
  });
});

describe('unsupportedFeatures', () => {
  it('says nothing when the target can do everything', async () => {
    const root = scaffold();

    expect(unsupportedFeatures(await resolveAppConfig(root), FULL)).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });

  it('names the app feature a missing capability disables, not the flag', async () => {
    const root = scaffold();

    writeFileSync(join(root, 'src/ws.ts'), 'export default { path: "/ws" };\n');
    const gaps = unsupportedFeatures(await resolveAppConfig(root), { ...FULL, websocket: false });

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('src/ws.ts');
    await rm(root, { recursive: true, force: true });
  });

  it('stays quiet about websockets for an app that has none, even on a target without them', async () => {
    const root = scaffold();

    expect(unsupportedFeatures(await resolveAppConfig(root), { ...FULL, websocket: false })).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });

  it('names src/schedules when the target has no way to trigger them', async () => {
    const root = scaffold();

    mkdirSync(join(root, 'src/schedules'), { recursive: true });
    writeFileSync(join(root, 'src/schedules/nightly.ts'), 'export default { cron: "@daily", run: () => {} };\n');
    const gaps = unsupportedFeatures(await resolveAppConfig(root), { ...FULL, schedules: false });

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('src/schedules');
    // An app without schedules loses nothing on the same target.
    expect(unsupportedFeatures(await resolveAppConfig(scaffold()), { ...FULL, schedules: false })).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });

  it('warns about buffering and uploads from the capabilities alone', async () => {
    const root = scaffold();
    const gaps = unsupportedFeatures(await resolveAppConfig(root), {
      websocket: true,
      streaming: false,
      filesystem: false,
      schedules: 'process',
      redirects: true,
    });

    expect(gaps.join('\n')).toContain('streaming SSR');
    expect(gaps.join('\n')).toContain('spoolMultipart');
    await rm(root, { recursive: true, force: true });
  });

  /**
   * `output: 'static'` leaves no server to apply the app's `redirects`/
   * `rewrites`, so they are only real if the host's own config can express
   * them. A target that cannot say so is the one case where a declared rule
   * silently does nothing — which is exactly what this reports at build time.
   */
  it('names the declared redirects a static target cannot express', async () => {
    const root = scaffold();

    writeFileSync(join(root, 'janux.config.ts'), `export default { output: 'static', redirects: [{ from: '/old', to: '/' }] };\n`);
    const config = await resolveAppConfig(root);

    expect(unsupportedFeatures(config, { ...FULL, redirects: false })).toHaveLength(1);
    expect(unsupportedFeatures(config, { ...FULL, redirects: false })[0]).toContain('redirects');
    // The same target serves them fine for an app that keeps its server.
    expect(unsupportedFeatures({ ...config, output: 'bun' }, { ...FULL, redirects: false })).toEqual([]);
    // And an app declaring none loses nothing either way.
    expect(unsupportedFeatures({ ...config, redirects: [] }, { ...FULL, redirects: false })).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });
});

describe('AdapterBuilder', () => {
  it('generates an app module importing every app module statically', async () => {
    const root = scaffold();
    const builder = createAdapterBuilder(root, await resolveAppConfig(root), '@janux/test');

    await builder.writeEntry({ imports: [], body: 'export default app;' });
    const generated = await readFile(join(root, GENERATED_DIR, 'app.ts'), 'utf8');

    expect(generated).toContain("import * as m0 from '../src/routes/index';");
    expect(generated).toContain('Generated by @janux/test');
    // The build machine's absolute paths are not the runtime's.
    expect(generated).not.toContain(root);
    await rm(root, { recursive: true, force: true });
  });

  it('imports the app *after* JANUX_APP_ROOT is set, so import-time path lookups see it', async () => {
    const root = scaffold();
    const builder = createAdapterBuilder(root, await resolveAppConfig(root), '@janux/test');

    await builder.writeEntry({ imports: ["import { serve } from '@janux/test';"], body: 'serve(app);' });
    const entry = await readFile(join(root, GENERATED_DIR, 'entry.ts'), 'utf8');

    // A static import of './app' would be hoisted above the assignment and read an empty root.
    expect(entry).toContain("await import('./app')");
    expect(entry.indexOf('JANUX_APP_ROOT')).toBeLessThan(entry.indexOf("await import('./app')"));
    expect(entry.indexOf("import { serve } from '@janux/test';")).toBeLessThan(entry.indexOf('JANUX_APP_ROOT'));
    expect(entry).toContain('serve(app);');
    await rm(root, { recursive: true, force: true });
  });

  it('bundles the entry into one file with no bare specifiers left to resolve', async () => {
    const builder = createAdapterBuilder(FIXTURE, await resolveAppConfig(FIXTURE), '@janux/test');

    await builder.writeEntry({ imports: [], body: 'export default app;' });
    const size = await builder.bundle('.janux/test-server.js', 'node');
    const bundle = await readFile(join(FIXTURE, '.janux/test-server.js'), 'utf8');

    expect(size).toBeGreaterThan(0);
    // A deployment has no node_modules beside it: an unresolved bare specifier
    // is a function that dies on its first import.
    expect(bundle).not.toContain("from '@janux/server'");
    expect(bundle).not.toContain("from 'janux'");
    await rm(join(FIXTURE, '.janux'), { recursive: true, force: true });
  }, 30_000);

  it('refuses to copy a client that was never built, instead of shipping an empty directory', async () => {
    const root = scaffold();
    const builder = createAdapterBuilder(root, await resolveAppConfig(root), '@janux/test');

    expect(() => builder.copyClient('build/client')).toThrow('janux build');
    await rm(root, { recursive: true, force: true });
  });

  it('copies the built client where the adapter asks for it', async () => {
    const root = scaffold();
    const builder = createAdapterBuilder(root, await resolveAppConfig(root), '@janux/test');

    mkdirSync(join(root, 'dist/client'), { recursive: true });
    writeFileSync(join(root, 'dist/client/client.js'), 'console.log(1);');
    builder.copyClient('build/client');

    expect(await readFile(join(root, 'build/client/client.js'), 'utf8')).toBe('console.log(1);');
    await rm(root, { recursive: true, force: true });
  });
});

describe('runAdapter', () => {
  it('resolves the app and hands the adapter a builder pointed at it', async () => {
    const root = scaffold();
    const seen: string[] = [];

    await runAdapter(
      {
        name: '@janux/recording',
        capabilities: FULL,
        adapt: (builder) => {
          seen.push(builder.root, builder.clientDir, String(builder.config.routesDir));
        },
      },
      root,
    );

    expect(seen).toEqual([root, join(root, 'dist/client'), join(root, 'src/routes')]);
    await rm(root, { recursive: true, force: true });
  });
});
