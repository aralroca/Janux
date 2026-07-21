import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import janusTailwind from './index';

describe('@janux/tailwind', () => {
  it('returns the official tailwind postcss plugin', () => {
    const plugin: any = janusTailwind();

    expect(String(plugin.postcssPlugin ?? plugin.name ?? '')).toContain('tailwind');
  });

  it('ships a style entry that resolves tailwindcss from inside the package', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf-8'));
    const css = readFileSync(join(import.meta.dirname, '../tailwind.css'), 'utf-8');

    expect(pkg.style).toBe('./tailwind.css');
    expect(pkg.exports['.'].style).toBe('./tailwind.css');
    expect(css).toContain('@import "tailwindcss"');
  });
});
