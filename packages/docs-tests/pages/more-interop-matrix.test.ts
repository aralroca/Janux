import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The matrix is a claim about what CI proves, so the claim itself is tested.
 *
 * A published compatibility table is only worth reading if it cannot drift
 * ahead of reality: a ✅ row must name an example that exists AND has a
 * dedicated e2e suite, and the honest rows (⚠️ / ❌ / known limits) must still
 * be there — the failure mode for a matrix is quietly deleting its own
 * caveats, which is exactly what nobody notices in review.
 */

const ROOT = resolve(import.meta.dir, '../../..');
const PAGE = join(ROOT, 'apps/docs/content/more/interop-matrix.md');
const matrix = readFileSync(PAGE, 'utf8');

/** Table rows of the by-category table: `| Category | Library | Status | … |`. */
const rows = matrix
  .split('\n')
  .filter((line) => line.startsWith('| ') && line.includes('|', 3))
  .map((line) => line.split('|').map((cell) => cell.trim()));

const claimed = (marker: string): string[] =>
  rows
    .filter((cells) => cells[3]?.startsWith(marker))
    .flatMap((cells) => [...cells[3]!.matchAll(/examples\/([a-z0-9-]+)/g)].map((match) => match[1]!));

const suites = readdirSync(join(ROOT, 'e2e'))
  .filter((file) => file.endsWith('.e2e.test.ts'))
  .map((file) => readFileSync(join(ROOT, 'e2e', file), 'utf8'))
  .join('\n');

describe('more/interop-matrix.md', () => {
  it('every ✅ row names an example that exists', () => {
    const green = claimed('✅');

    expect(green.length).toBeGreaterThan(0);
    expect(green.filter((name) => !existsSync(join(ROOT, 'examples', name)))).toEqual([]);
  });

  it('every ✅ row is backed by a dedicated e2e suite', () => {
    // Same rule the examples-coverage gate applies: a suite must drive the app
    // by name, so "it builds" can never pass for "it works".
    expect(claimed('✅').filter((name) => !suites.includes(`examples/${name}`))).toEqual([]);
  });

  it('every ⚠️ row that names an example names a real one', () => {
    expect(claimed('⚠️').filter((name) => !existsSync(join(ROOT, 'examples', name)))).toEqual([]);
  });

  it('keeps stating what does not work', () => {
    // The limits are the part of this page with no advocate: nothing else in
    // the repo breaks if they quietly disappear.
    expect(matrix).toContain('## Known limits');
    ['manifest', 'children', 'Reverse interop', 'React Server Components'].forEach((limit) =>
      expect(matrix).toContain(limit),
    );
  });

  it('states the cost of interop in measured numbers', () => {
    expect(matrix).toContain('## What interop costs');
    // A weight table with no kB in it is a table that stopped being measured.
    expect(matrix).toMatch(/\|\s*\d+ kB\s*\|/);
  });
});
