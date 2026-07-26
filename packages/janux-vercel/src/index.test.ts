import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { resolveAppConfig } from '@janux/vite/config';
import { createHandler, vercelConfig } from './index';

const APP = join(import.meta.dirname, '__fixtures__/app');

describe('vercelConfig', () => {
  it('gives a server app a Bun function every unmatched request rewrites to', () => {
    const config: any = vercelConfig();

    expect(config.bunVersion).toBe('1.x');
    expect(config.outputDirectory).toBe('dist/client');
    expect(config.rewrites).toEqual([{ source: '/(.*)', destination: '/api/index' }]);
    expect(config.functions['api/index.ts'].includeFiles).toBe('{src,dist}/**');
  });

  /**
   * The server resolves the app's own modules at runtime, so whatever the app
   * reads from disk has to travel with the function — `content/**` for a docs
   * site is not optional, it is the site.
   */
  it('carries the app data directories into the function, deduped', () => {
    const config: any = vercelConfig({ include: ['content', 'src'], maxDuration: 60 });

    expect(config.functions['api/index.ts'].includeFiles).toBe('{src,dist,content}/**');
    expect(config.functions['api/index.ts'].maxDuration).toBe(60);
  });

  it('leaves a static export without a runtime', () => {
    const config: any = vercelConfig({ output: 'static' });

    expect(config.bunVersion).toBeUndefined();
    expect(config.functions).toBeUndefined();
    expect(config.rewrites).toBeUndefined();
    expect(config.cleanUrls).toBe(true);
    expect(config.outputDirectory).toBe('dist/client');
  });

  it('omits maxDuration rather than guessing one', () => {
    expect((vercelConfig() as any).functions['api/index.ts'].maxDuration).toBeUndefined();
  });
});

describe('createHandler', () => {
  /** What the generated module hands over: the app's modules, already imported. */
  async function prebuilt() {
    const config = await resolveAppConfig(APP);

    return {
      root: APP,
      config,
      modules: {
        [join(APP, 'src/routes/index.tsx')]: await import(join(APP, 'src/routes/index.tsx')),
        [join(APP, 'src/agent.ts')]: await import(join(APP, 'src/agent.ts')),
      },
    };
  }

  it('is the shape Vercel invokes: a default export with fetch', async () => {
    expect(typeof createHandler(await prebuilt()).fetch).toBe('function');
  });

  it('serves the app, and boots it once for every request after the first', async () => {
    const handler = createHandler(await prebuilt());
    const [first, second] = await Promise.all([
      handler.fetch(new Request('https://janux.build/')),
      handler.fetch(new Request('https://janux.build/')),
    ]);

    expect(first.status).toBe(200);
    expect(await first.text()).toContain('Deployed');
    expect(second.status).toBe(200);
  });

  it('answers a missing page with a 404 instead of throwing', async () => {
    const response = await createHandler(await prebuilt()).fetch(new Request('https://janux.build/nope'));

    expect(response.status).toBe(404);
  });
});
