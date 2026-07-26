import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHandler, vercelConfig } from '@janux/vercel';

/**
 * recipes/vercel.md, checked against the adapter it documents. A deployment
 * recipe rots in a particular way — the JSON in the page keeps working while the
 * command starts writing something else — so every config the page prints is
 * compared to what `vercelConfig()` actually produces, field by field.
 */

const PAGE = readFileSync(join(import.meta.dir, '../../../apps/docs/content/recipes/vercel.md'), 'utf8');

/** The nth ```json fence on the page, parsed. */
function jsonFence(index: number): Record<string, any> {
  const fences = [...PAGE.matchAll(/```json[^\n]*\n([\s\S]*?)```/g)];

  return JSON.parse(fences[index]![1]!);
}

describe('recipes/vercel.md — the config it prints is the config it writes', () => {
  it('the server config matches vercelConfig() for the options the page passes', () => {
    expect(jsonFence(0)).toEqual(vercelConfig({ include: ['content'], maxDuration: 60 }));
  });

  it('the static config matches vercelConfig({ output: "static" })', () => {
    expect(jsonFence(1)).toEqual(vercelConfig({ output: 'static' }));
  });

  /** The two flags the page tells a reader to type. */
  it('documents the flags that produce that config', () => {
    expect(PAGE).toContain('bunx janux-vercel --include content --max-duration 60');
  });
});

describe('recipes/vercel.md — the function entry it prints is the one that runs', () => {
  it('re-exports the bundle, and nothing it would have to resolve', () => {
    const entry = /```ts title="api\/index\.ts"\n([\s\S]*?)```/.exec(PAGE)![1]!;

    expect(entry.trim()).toBe("export { default } from '../.janux/server.js';");
  });

  it('createHandler is a fetch handler, the shape Vercel invokes', () => {
    const handler = createHandler({ root: '/tmp/none', config: {} as any, modules: {} });

    expect(typeof handler.fetch).toBe('function');
  });
});

describe('recipes/vercel.md — the caveats are the real ones', () => {
  /** The env var is a contract between the adapter and app code that reads files. */
  it('names the app-root variable the adapter actually sets', () => {
    expect(PAGE).toContain('process.env.JANUX_APP_ROOT');
    expect(readFileSync(join(import.meta.dir, '../../janux-vercel/src/build.ts'), 'utf8')).toContain(
      'process.env.JANUX_APP_ROOT',
    );
  });

  it('names the client-only specifiers the bundler stubs', () => {
    const bundler = readFileSync(join(import.meta.dir, '../../janux-vercel/src/bundler.ts'), 'utf8');

    for (const suffix of ['worker', 'url', 'raw']) {
      expect(PAGE).toContain(`?${suffix}`);
      expect(bundler).toContain(suffix);
    }
  });
});
