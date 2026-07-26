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

/**
 * A fence picked by the file it says it is, not by its position: the page gained
 * a `.vc-config.json` block between the two `vercel.json` ones, and an index
 * would have quietly started comparing the wrong pair.
 */
function jsonFence(title: string, occurrence = 0): Record<string, any> {
  const fences = [...PAGE.matchAll(new RegExp(`\`\`\`json title="${title}"\\n([\\s\\S]*?)\`\`\``, 'g'))];

  return JSON.parse(fences[occurrence]![1]!);
}

describe('recipes/vercel.md — the config it prints is the config it writes', () => {
  it('the server config matches vercelConfig() for the options the page passes', () => {
    expect(jsonFence('vercel.json')).toEqual(vercelConfig({ include: ['content'], maxDuration: 60 }));
  });

  it('the static config matches vercelConfig({ output: "static" })', () => {
    expect(jsonFence('vercel.json', 1)).toEqual(vercelConfig({ output: 'static' }));
  });

  /** The two flags the page tells a reader to type. */
  it('documents the flags that produce that config', () => {
    expect(PAGE).toContain('bunx janux-vercel --include content --max-duration 60');
  });
});

describe('recipes/vercel.md — the function config it prints is the one it writes', () => {
  /** The line `bunVersion` cannot do for you: a Node launcher has no `Bun.file`. */
  it('asks for the Bun runtime by name, as output.ts does', () => {
    const printed = jsonFence('.vercel/output/functions/index.func/.vc-config.json');
    const source = readFileSync(join(import.meta.dir, '../../janux-vercel/src/output.ts'), 'utf8');

    expect(printed.runtime).toBe('bun1.x');
    expect(source).toContain("const RUNTIME = 'bun1.x';");
    expect(source).toContain(`handler: '${printed.handler}'`);
    expect(source).toContain(`launcherType: '${printed.launcherType}'`);
  });
});

describe('recipes/vercel.md — the handler it describes is the one that runs', () => {
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
