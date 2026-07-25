import type { Case } from '../support/case';

/**
 * Query-key hashing.
 *
 * The hash is the cache's identity function, so a collision serves one query's
 * data for another key and a spurious difference silently doubles every fetch.
 * Cases follow `tanstack:query-core/utils#hashKey`.
 */
export interface HashCase {
  left: readonly unknown[];
  right: readonly unknown[];
  /** Whether the two keys must hash to the same entry. */
  same: boolean;
}

export type HashRow = Case<HashCase>;

export const HASH_CASES: HashRow[] = [
  // ── identity ────────────────────────────────────────────────────────────────
  { id: 'hash-same-key-is-same', src: 'tanstack:utils#hashKey', left: ['a'], right: ['a'], same: true },
  { id: 'hash-empty-keys-are-same', src: 'janux', left: [], right: [], same: true },
  { id: 'hash-different-strings-differ', src: 'tanstack:utils#hashKey', left: ['a'], right: ['b'], same: false },
  { id: 'hash-segment-count-matters', src: 'janux', left: ['a'], right: ['a', 'b'], same: false },
  { id: 'hash-segment-order-matters', src: 'janux', left: ['a', 'b'], right: ['b', 'a'], same: false },

  // ── object keys are order-insensitive, which is the whole point ──────────────
  { id: 'hash-object-key-order-does-not-matter', src: 'tanstack:utils#stable-hash', left: [{ a: 1, b: 2 }], right: [{ b: 2, a: 1 }], same: true },
  { id: 'hash-nested-object-key-order-does-not-matter', src: 'tanstack:utils#stable-hash-nested', left: [{ o: { a: 1, b: 2 } }], right: [{ o: { b: 2, a: 1 } }], same: true },
  { id: 'hash-object-values-still-matter', src: 'janux', left: [{ a: 1 }], right: [{ a: 2 }], same: false },
  { id: 'hash-extra-object-key-differs', src: 'janux', left: [{ a: 1 }], right: [{ a: 1, b: 2 }], same: false },
  { id: 'hash-empty-object-differs-from-empty-array', src: 'janux', left: [{}], right: [[]], same: false },
  { id: 'hash-array-order-inside-a-segment-matters', src: 'tanstack:utils#array-order', left: [[1, 2]], right: [[2, 1]], same: false },

  // ── primitives that look alike ──────────────────────────────────────────────
  { id: 'hash-number-differs-from-numeric-string', src: 'tanstack:utils#type-sensitivity', left: [1], right: ['1'], same: false },
  { id: 'hash-true-differs-from-the-string-true', src: 'janux', left: [true], right: ['true'], same: false },
  { id: 'hash-null-differs-from-the-string-null', src: 'janux', left: [null], right: ['null'], same: false },
  { id: 'hash-null-differs-from-undefined-in-an-object-value', src: 'janux', left: [{ a: null }], right: [{ a: undefined }], same: false },
  { id: 'hash-zero-differs-from-empty-string', src: 'janux', left: [0], right: [''], same: false },
  { id: 'hash-zero-and-negative-zero-collapse', src: 'janux', left: [0], right: [-0], same: true },
  { id: 'hash-one-differs-from-ten', src: 'janux', left: [1], right: [10], same: false },
  { id: 'hash-a-nested-number-differs-from-its-prefix', src: 'janux', left: ['a', 1], right: ['a', 10], same: false },

  // ── values JSON cannot represent ────────────────────────────────────────────
  { id: 'hash-nan-and-null-collapse', src: 'janux', left: [Number.NaN], right: [null], same: true },
  { id: 'hash-infinity-and-null-collapse', src: 'janux', left: [Number.POSITIVE_INFINITY], right: [null], same: true },
  { id: 'hash-two-dates-differ-by-their-instant', src: 'janux', left: [new Date(0)], right: [new Date(1)], same: false },
  { id: 'hash-equal-dates-are-the-same-key', src: 'janux', left: [new Date(0)], right: [new Date(0)], same: true },
  { id: 'hash-a-date-hashes-as-its-iso-string', src: 'janux', left: [new Date(0)], right: [new Date(0).toISOString()], same: true },
];
