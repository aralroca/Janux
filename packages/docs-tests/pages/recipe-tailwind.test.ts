import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInstance, jsx, renderToString } from 'janux';
import { docExample } from '../doc-example';

/**
 * recipes/tailwind.md carries the corpus' only ` ```tsx live ` fence — readers
 * can press Run on it in the playground, so it had better work. It also makes a
 * package-shape claim (`@import "@janux/tailwind"`) that the install step
 * depends on. Compiling the real stylesheet needs a build, which the commit
 * verified against a scaffolded app; what runs here is everything else.
 */

const ROOT = resolve(import.meta.dir, '../../..');

describe('recipes/tailwind.md', () => {
  it('the playground snippet runs: the counter increments through its intent', async () => {
    const { Counter } = await docExample('apps/docs/content/recipes/tailwind.md', 0);
    const instance = createInstance(Counter);

    await instance.attach();
    await instance.intents.inc();

    expect(instance.snapshot().count).toBe(1);
  });

  it('utility classes survive SSR exactly as written', async () => {
    const { Counter } = await docExample('apps/docs/content/recipes/tailwind.md', 0);
    const { html } = await renderToString(jsx(Counter, {}), {});

    expect(html).toContain('class="flex flex-col items-center gap-4 pt-16 font-sans"');
    expect(html).toContain('rounded-xl bg-gradient-to-r');
  });

  it('@import "@janux/tailwind" resolves to a stylesheet that pulls in Tailwind', () => {
    const dir = join(ROOT, 'packages/janux-tailwind');
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const entry = manifest.exports['.'].style;

    expect(entry).toBe('./tailwind.css');
    expect(readFileSync(join(dir, entry), 'utf8')).toContain('@import "tailwindcss"');
  });

  it('installing the package IS the config: its default export is the postcss plugin', async () => {
    const plugin = (await import('@janux/tailwind')).default;

    expect(typeof plugin).toBe('function');
    expect(plugin()).toBeDefined();
  });
});
