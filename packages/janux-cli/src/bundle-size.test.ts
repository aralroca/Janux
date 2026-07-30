import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { resolveAppConfig } from '@janux/vite';
import { bundleInputs, pinProductionEnv, viteOptions } from './commands';

/**
 * The dev error overlay must cost a production bundle nothing — measured, not
 * assumed.
 *
 * The same app is built twice from the same source: once as `janux build`
 * builds it, and once with every `import.meta.env?.DEV` guard forced true. The
 * forced build proves the overlay is real code a bundler would happily include,
 * and how much of it there is; the shipped build proves not one byte survives.
 * A recorded baseline number would rot the first time the framework
 * legitimately grew — this comparison cannot.
 */

const SHOP = join(import.meta.dir, '../../../examples/shop');

/** Strings the overlay cannot exist without, and that minification preserves verbatim. */
const OVERLAY_FINGERPRINTS = [
  'janux-dev-overlay',
  'The Janux chain',
  'did not come through an intent, effect or source',
  'backdrop-filter',
  '/_janux/dev/route',
];

/**
 * Turns every dev guard on. Vite owns `import.meta.env.*` replacement, so
 * neither `define` nor `mode` can override it — rewriting the expression ahead
 * of Vite's own plugin is what actually forces the branch.
 */
const DEV_GUARD = 'import.meta.env?.DEV';

const forceDevGuards = {
  name: 'janux-test-force-dev',
  enforce: 'pre' as const,
  transform: (code: string) => (code.includes(DEV_GUARD) ? code.replaceAll(DEV_GUARD, 'true') : undefined),
};

async function bundle(forced = false): Promise<{ bytes: number; chunks: number; code: string }> {
  const { build } = await import('vite');
  const app = await resolveAppConfig(SHOP);
  const options = (await viteOptions(SHOP, 'build')) as any;

  // What `janux build` does before it calls Vite — and the whole point here:
  // under `bun test` NODE_ENV is `test`, exactly the shell that used to turn
  // every dev branch back on. Restored so it cannot leak into sibling suites.
  const restore = process.env.NODE_ENV;

  pinProductionEnv(process.env);
  const result: any = await build({
    ...options,
    plugins: [...(forced ? [forceDevGuards] : []), ...options.plugins],
    logLevel: 'silent',
    build: { write: false, sourcemap: false, rollupOptions: { input: bundleInputs(app) } },
  }).finally(() => {
    process.env.NODE_ENV = restore;
  });
  const chunks = (Array.isArray(result) ? result[0].output : result.output).filter((out: any) => out.type === 'chunk');
  const code = chunks.map((chunk: any) => chunk.code).join('\n');

  return { bytes: code.length, chunks: chunks.length, code };
}

describe('the dev overlay in a production bundle', () => {
  it('is real code, and ships zero bytes of it', async () => {
    const shipped = await bundle();
    const forced = await bundle(true);

    // It exists, weighs something, and even earns its own chunk...
    expect(forced.bytes).toBeGreaterThan(shipped.bytes);
    expect(forced.chunks).toBeGreaterThan(shipped.chunks);
    OVERLAY_FINGERPRINTS.forEach((fingerprint) => expect(forced.code).toContain(fingerprint));
    // ...and `janux build` emits none of it, in no chunk.
    OVERLAY_FINGERPRINTS.forEach((fingerprint) => expect(shipped.code).not.toContain(fingerprint));
  }, 120_000);

  /** `hidden` maps exist for an error tracker; the bundle must not point the browser at them. */
  it('leaves no sourceMappingURL in the shipped bundle', async () => {
    expect((await bundle()).code).not.toContain('sourceMappingURL');
  }, 120_000);
});
