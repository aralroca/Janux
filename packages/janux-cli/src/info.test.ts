import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { collectInfo, renderInfo, type JanuxInfo } from './info';

/**
 * `janux info` exists to be pasted into an issue unedited. So it must be
 * complete enough to answer "what were you running?" without a follow-up
 * question, and contain nothing the person pasting it would have to redact —
 * no absolute paths out of their home directory, no environment values.
 */

const SHOP = join(import.meta.dir, '../../../examples/shop');

const INFO: JanuxInfo = {
  versions: { janux: '0.5.0', cli: '0.5.0', bun: '1.3.14', os: 'darwin 25.5.0 (arm64)' },
  app: { name: 'janux-example-shop', version: '0.2.1' },
  config: { output: 'bun', routesDir: 'src/routes', clientEntry: 'src/client.ts', stylesheet: 'src/styles.css' },
  adapters: [{ name: '@janux/vercel', version: '0.5.0' }],
  integrations: [{ name: '@janux/tailwind', version: undefined }],
  routes: [
    { pattern: '/', file: 'src/routes/index.tsx', layouts: [] },
    { pattern: '/orders/[id]', file: 'src/routes/orders/[id].tsx', layouts: ['src/routes/_layout.tsx'] },
  ],
};

describe('collectInfo', () => {
  it('reports the versions a bug report is triaged on', async () => {
    const info = await collectInfo(SHOP);

    expect(info.versions.janux).toMatch(/^\d+\.\d+\.\d+/);
    expect(info.versions.bun).toBe(Bun.version);
    expect(info.versions.os).toContain(process.platform);
    expect(info.app).toEqual({ name: 'janux-example-shop', version: '0.2.1' });
  });

  it('reports the resolved config as paths relative to the app root', async () => {
    const info = await collectInfo(SHOP);

    expect(info.config).toMatchObject({ output: 'bun', routesDir: 'src/routes', clientEntry: 'src/client.ts' });
  });

  /** Zero-config integrations are invisible in the app's own source: installing them IS the config. */
  it('reports which integrations and adapters are actually installed', async () => {
    const info = await collectInfo(SHOP);

    expect(info.integrations.map((entry) => entry.name)).toEqual(['@janux/tailwind']);
    // The shop installs neither, so both are listed as absent rather than dropped.
    expect(info.integrations[0]!.version).toBeUndefined();
    expect(info.adapters.map((entry) => entry.name)).toEqual(['@janux/vercel']);
  });

  it('lists every route the file-system router resolved, with its layout chain', async () => {
    const info = await collectInfo(SHOP);
    const patterns = info.routes.map((route) => route.pattern);

    expect(patterns).toContain('/shop');
    expect(patterns).toContain('/orders/[id]');
    expect(info.routes.find((route) => route.pattern === '/shop')!.file).toBe('src/routes/shop.tsx');
  });

  /** An app that has not been set up yet is exactly when people ask for help. */
  it('survives a directory that is not a Janux app', async () => {
    const info = await collectInfo(join(import.meta.dir, '__fixtures__'));

    expect(info.routes).toEqual([]);
    expect(info.versions.bun).toBe(Bun.version);
  });
});

describe('renderInfo', () => {
  const report = renderInfo(INFO);

  it('is markdown that renders as tables in an issue', () => {
    expect(report).toContain('### janux info');
    expect(report).toContain('| janux | 0.5.0 |');
    expect(report).toContain('| bun | 1.3.14 |');
    expect(report).toContain('| os | darwin 25.5.0 (arm64) |');
  });

  it('shows an uninstalled integration as absent, not as missing information', () => {
    expect(report).toContain('| @janux/vercel | 0.5.0 |');
    expect(report).toContain('| @janux/tailwind | not installed |');
  });

  it('lists the routes with their layout chains', () => {
    expect(report).toContain('| `/orders/[id]` | src/routes/orders/[id].tsx | src/routes/_layout.tsx |');
    expect(report).toContain('| `/` | src/routes/index.tsx | — |');
  });

  /** Nothing here should force the reporter to redact anything before posting. */
  it('leaks no absolute path from the machine it ran on', () => {
    expect(report).not.toContain(process.cwd());
    expect(report).not.toMatch(/\/(Users|home)\//);
  });
});
