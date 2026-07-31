import { describe, expect, it } from 'bun:test';
import { ENTRIES } from './public-api';
import { isDocumented } from './reference-pages';
import { UNDOCUMENTED } from './undocumented-exports';

/**
 * Reverse coverage: every runtime export of every public entry must be
 * mentioned by a `reference/` page or listed in the backlog
 * (undocumented-exports.ts). Type-only exports are outside this contract —
 * they are documented alongside the values that carry them.
 *
 * The entry map and the "what counts as a mention" rule live in
 * `public-api.ts` and `reference-pages.ts` because STABILITY.md is generated
 * from the same two — the stability contract is a view over this test's
 * notion of the public API, not a second, hand-written one.
 */

describe('reference docs cover the public runtime API', () => {
  it('the backlog tracks exactly the known entries', () => {
    expect(Object.keys(UNDOCUMENTED).sort()).toEqual(Object.keys(ENTRIES).sort());
  });

  for (const [entry, mod] of Object.entries(ENTRIES)) {
    const backlog = new Set(UNDOCUMENTED[entry]);

    it(`${entry}: every export is documented or in the backlog`, () => {
      const missing = Object.keys(mod).filter((name) => !isDocumented(name) && !backlog.has(name));

      expect(missing).toEqual([]);
    });

    it(`${entry}: backlog entries are real, still-undocumented exports`, () => {
      const stale = [...backlog].filter((name) => !(name in mod) || isDocumented(name));

      expect(stale).toEqual([]);
    });
  }
});
