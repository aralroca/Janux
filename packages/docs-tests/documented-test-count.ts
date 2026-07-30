import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Where the size of the suite is claimed in prose, and how to read it back.
 *
 * `scripts/test-census.ts` is the only thing that measures the number; these
 * are the documents that repeat it. Parsing them here is what lets the census
 * hold them to the count it just measured, instead of hand-written numbers
 * drifting apart on their own — they did: the guide said "300+ tests" long
 * after the badge said 3641.
 *
 * Claims are discovered, not registered: any `N tests` in these documents is
 * held to the total, so a new sentence cannot introduce an unguarded number.
 */

const ROOT = resolve(import.meta.dir, '../..');

/** Every document that states the size of the suite. */
export const CLAIM_FILES = ['README.md', 'apps/docs/content/guide/architecture-and-roadmap.md'];

/** The shields badge (`tests-<n>%20passing`) and prose (`<n> tests`, `<n>+ tests`). */
const CLAIM = /tests-(\d[\d,]*)%20passing|\b(\d[\d,]*)\+?\s+tests\b/g;

export interface TestCountClaim {
  file: string;
  count: number;
}

/** Every suite-size number these documents state, in reading order. */
export function testCountClaims(): TestCountClaim[] {
  return CLAIM_FILES.flatMap((file) => {
    const text = readFileSync(resolve(ROOT, file), 'utf8');

    return [...text.matchAll(CLAIM)].map((match) => ({ file, count: Number((match[1] ?? match[2]).replaceAll(',', '')) }));
  });
}
