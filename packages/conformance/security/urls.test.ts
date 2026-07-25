import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { renderAttrs } from '../../janux/src/render/html';
import { URL_SCHEME_CASES } from './urls.cases';

/**
 * Asserted as an invariant, not against a literal: what matters is that no
 * executable scheme survives into the markup however it was spelled, and that a
 * safe URL is still emitted. A per-row literal would also pass if the sanitizer
 * merely reformatted the payload.
 *
 * `console.warn` is captured rather than left to spew — 189 blocked rows would
 * otherwise bury every other line of the run — and the capture doubles as the
 * assertion that blocking is reported at all.
 */
const warnings: string[] = [];
const original = console.warn;

beforeAll(() => {
  console.warn = (...args: unknown[]) => warnings.push(args.join(' '));
});
afterAll(() => {
  console.warn = original;
});

describe('executable URL schemes', () => {
  it.each(URL_SCHEME_CASES.map((row) => [row.id, row] as const))('%s', (_id, row) => {
    warnings.length = 0;
    const rendered = renderAttrs({ [row.attr]: row.value });

    if (!row.allowed) {
      expect(rendered).toBe('');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(`blocked an executable URL in "${row.attr}"`);

      return;
    }
    expect(rendered.startsWith(` ${row.attr}="`)).toBe(true);
    expect(warnings).toHaveLength(0);
  });
});
