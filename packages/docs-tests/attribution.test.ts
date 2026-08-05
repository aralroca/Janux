import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Legal hygiene, kept honest by CI rather than by memory.
 *
 * Three things in this repo are other people's work: `benchmarks/` is largely a
 * direct derivation of Octane's harness, `packages/janux/src/i18n` is a port of
 * Brisa's `transCore`, and `diff-dom-streaming` is a sibling runtime dependency.
 * This suite fails if the upstream licence text, a per-file provenance header or
 * a CREDITS.md row ever goes missing — including on harness files added later,
 * because the derived-file list is globbed, not hardcoded.
 */

const ROOT = resolve(import.meta.dir, '../..');
const BENCH = join(ROOT, 'benchmarks');
const NOTICE = 'LICENSE-OCTANE';
const SKIP_DIRS = /^(node_modules|dist|results|baselines)$/;

// Written from scratch for Janux: no upstream counterpart exists, so claiming
// Octane provenance on these would be a false attribution, not a safe one.
const JANUX_ORIGINAL = ['report.mjs', 'report.test.mjs', 'lib/janux-compiler.mjs'];

const read = (file: string): string => readFileSync(file, 'utf8');

function walk(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) return SKIP_DIRS.test(entry.name) ? [] : walk(full);

    return [full];
  });
}

const benchFiles = walk(BENCH).map((file) => relative(BENCH, file));
const harnessFiles = benchFiles.filter(
  (file) => /(\.mjs|shared\.js)$/.test(file) && !JANUX_ORIGINAL.includes(file),
);
const suiteReadmes = benchFiles.filter((file) => file.endsWith('README.md'));
const attributes = (file: string): boolean => read(join(BENCH, file)).includes(NOTICE);

describe('Octane licence (benchmarks/)', () => {
  it('reproduces the upstream MIT notice verbatim, copyright intact', () => {
    const licence = read(join(BENCH, NOTICE));

    expect(licence).toContain('MIT License');
    expect(licence).toContain('Copyright (c) 2026 Dominic Gannaway');
    expect(licence).toContain(
      'The above copyright notice and this permission notice shall be included in all',
    );
    expect(licence).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
  });

  it('covers every derived harness file with a provenance header', () => {
    // Guards the glob itself: a typo that empties this list must not pass.
    expect(harnessFiles.length).toBeGreaterThan(20);

    expect(harnessFiles.filter((file) => !attributes(file))).toEqual([]);
  });

  it('points every suite README at the licence', () => {
    expect(suiteReadmes.length).toBeGreaterThan(15);

    expect(suiteReadmes.filter((file) => !attributes(file))).toEqual([]);
  });

  it('does not claim Octane provenance on files Janux wrote itself', () => {
    const misattributed = JANUX_ORIGINAL.filter((file) => attributes(file));

    expect(misattributed).toEqual([]);
  });
});

describe('CREDITS.md', () => {
  const credits = read(join(ROOT, 'CREDITS.md'));

  it.each([
    ['Octane', 'github.com/octanejs/octane', 'Copyright (c) 2026 Dominic Gannaway'],
    ['krausest', 'github.com/krausest/js-framework-benchmark', 'Apache-2.0'],
    ['Brisa i18n', 'github.com/brisa-build/brisa', 'Copyright (c) 2024 Brisa'],
    ['diff-dom-streaming', 'github.com/aralroca/diff-dom-streaming', 'Copyright (c) 2024 Aral Roca'],
  ])('credits %s with an origin link and a licence', (_name, link, licence) => {
    expect(credits).toContain(link);
    expect(credits).toContain(licence);
  });

  it('sends readers to the reproduced Octane licence text', () => {
    expect(credits).toContain('benchmarks/LICENSE-OCTANE');
  });
});

describe('Brisa-derived i18n', () => {
  it.each(['translate-core.ts', 'format-elements.ts'])('names Brisa as the origin of %s', (file) => {
    const source = read(join(ROOT, 'packages/janux/src/i18n', file));

    expect(source).toContain('Brisa');
    expect(source).toContain('CREDITS.md');
  });
});
