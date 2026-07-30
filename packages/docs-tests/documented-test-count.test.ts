import { describe, expect, it } from 'bun:test';
import { CLAIM_FILES, testCountClaims } from './documented-test-count';

/**
 * The suite size is prose in two documents, so it rots in two directions: a
 * number that no longer matches its neighbour, or a document that quietly
 * stops claiming one — which would leave the census checking nothing.
 *
 * That the number is *true* is asserted where it is measured
 * (`scripts/test-census.ts`); running the whole suite from inside itself to
 * find out here would cost more than the drift it prevents.
 */

describe('the documented suite size', () => {
  it('is the same number in every document that states it', () => {
    const claims = testCountClaims();
    const disagreeing = claims.filter(({ count }) => count !== claims[0]?.count);

    expect(disagreeing).toEqual([]);
  });

  it('is still stated by every document expected to state it', () => {
    const claiming = new Set(testCountClaims().map(({ file }) => file));
    const silent = CLAIM_FILES.filter((file) => !claiming.has(file));

    expect(silent).toEqual([]);
  });
});
