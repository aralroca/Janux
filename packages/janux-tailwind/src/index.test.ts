import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import janusTailwind from './index';

describe('@janux/tailwind', () => {
  it('returns the official tailwind postcss plugin', () => {
    const plugin: any = janusTailwind();

    expect(String(plugin.postcssPlugin ?? plugin.name ?? '')).toContain('tailwind');
  });

  /**
   * The CLI calls this once per Vite config it builds — dev and build in the
   * same process for a static export — and a PostCSS plugin instance carries
   * per-run state, so handing the same object to two pipelines is a cache from
   * one leaking into the other.
   */
  it('builds a fresh plugin per call rather than sharing one instance', () => {
    expect(janusTailwind()).not.toBe(janusTailwind());
  });

  /** Installing the package IS the configuration: nothing in the app names it. */
  it('is what a Janux app imports, with no config file in between', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf-8'));

    expect(pkg.name).toBe('@janux/tailwind');
    // The CLI detects the package and wires the official plugin, so the plugin
    // has to be this package's own dependency rather than the app's.
    expect(pkg.dependencies['@tailwindcss/postcss']).toBeDefined();
    expect(pkg.dependencies.tailwindcss).toBeDefined();
    expect(pkg.exports['.'].default).toBeDefined();
  });

  it('ships a style entry that resolves tailwindcss from inside the package', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf-8'));
    const css = readFileSync(join(import.meta.dirname, '../tailwind.css'), 'utf-8');

    expect(pkg.style).toBe('./tailwind.css');
    expect(pkg.exports['.'].style).toBe('./tailwind.css');
    expect(css).toContain('@import "tailwindcss"');
  });
});
