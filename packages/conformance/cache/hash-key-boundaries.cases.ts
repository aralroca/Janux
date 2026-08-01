import type { HashRow } from './hash-key.cases';

/**
 * Query-key hashing at the serialization boundary — the values JSON quietly
 * rewrites on the way through `hashKey`.
 *
 * Two different keys that collapse onto one hash serve one query's data for the
 * other; the classes below (`new Map()` → `{}`, `undefined` → `null`, lost
 * float precision, `toJSON` hijacks) are exactly where that happens silently.
 */

export const HASH_BOUNDARY_CASES: HashRow[] = [
  // ── undefined is not a value JSON can hold ──────────────────────────────────
  { id: 'cache-hash-an-undefined-segment-collapses-with-null', src: 'tanstack:utils#hashKey-undefined', left: [undefined], right: [null], same: true },
  { id: 'cache-hash-undefined-inside-a-nested-array-collapses-with-null', src: 'janux', left: [{ a: [undefined] }], right: [{ a: [null] }], same: true },
  { id: 'cache-hash-an-undefined-property-collapses-with-an-absent-one', src: 'tanstack:utils#hashKey-undefined-props', left: [{ a: 1, b: undefined }], right: [{ a: 1 }], same: true },

  // ── containers JSON silently empties ────────────────────────────────────────
  { id: 'cache-hash-a-map-collapses-with-an-empty-object', src: 'janux', left: [new Map([['a', 1]])], right: [{}], same: true },
  { id: 'cache-hash-two-different-maps-collapse-onto-one-hash', src: 'janux', left: [new Map([['a', 1]])], right: [new Map([['b', 2]])], same: true },
  { id: 'cache-hash-a-set-collapses-with-an-empty-object', src: 'janux', left: [new Set([1, 2])], right: [{}], same: true },
  { id: 'cache-hash-a-regexp-collapses-with-an-empty-object', src: 'janux', left: [/users/i], right: [{}], same: true },
  { id: 'cache-hash-a-nested-map-and-a-nested-set-collapse-together', src: 'janux', left: [{ filter: new Map([['a', 1]]) }], right: [{ filter: new Set([9]) }], same: true },

  // ── functions and symbols vanish ────────────────────────────────────────────
  { id: 'cache-hash-a-function-segment-collapses-with-null', src: 'janux', left: [() => 1], right: [null], same: true },
  { id: 'cache-hash-a-symbol-property-collapses-with-an-empty-object', src: 'janux', left: [{ a: Symbol('a') }], right: [{}], same: true },

  // ── dates ───────────────────────────────────────────────────────────────────
  { id: 'cache-hash-a-date-nested-in-an-object-hashes-as-its-iso-string', src: 'janux', left: [{ since: new Date(0) }], right: [{ since: '1970-01-01T00:00:00.000Z' }], same: true },
  { id: 'cache-hash-an-invalid-date-collapses-with-null', src: 'janux', left: [new Date(Number.NaN)], right: [null], same: true },

  // ── numbers past what a double can say ──────────────────────────────────────
  { id: 'cache-hash-float-arithmetic-changes-the-key', src: 'janux', left: [0.1 + 0.2], right: [0.3], same: false },
  { id: 'cache-hash-integers-past-max-safe-integer-collapse', src: 'janux', left: [9_007_199_254_740_993], right: [9_007_199_254_740_992], same: true },

  // ── type sensitivity across families ────────────────────────────────────────
  { id: 'cache-hash-false-differs-from-zero', src: 'tanstack:utils#type-sensitivity', left: [false], right: [0], same: false },
  { id: 'cache-hash-a-string-that-looks-like-a-serialized-array-differs-from-the-array', src: 'janux', left: ['[1]'], right: [[1]], same: false },
  { id: 'cache-hash-an-array-like-object-differs-from-the-array', src: 'janux', left: [{ 0: 'a' }], right: [['a']], same: false },
  { id: 'cache-hash-two-scalar-segments-differ-from-one-array-segment', src: 'tanstack:utils#key-nesting', left: [1, 2], right: [[1, 2]], same: false },

  // ── strings are compared by code points, not by what they render as ─────────
  { id: 'cache-hash-composed-and-decomposed-unicode-differ', src: 'janux', left: ['café'], right: ['café'], same: false },

  // ── object key order stays irrelevant in every position ────────────────────
  { id: 'cache-hash-key-order-inside-an-array-element-does-not-matter', src: 'tanstack:utils#stable-hash', left: [[{ b: 1, a: 2 }]], right: [[{ a: 2, b: 1 }]], same: true },
  { id: 'cache-hash-array-order-of-equal-objects-still-matters', src: 'janux', left: [[{ a: 1 }, { b: 2 }]], right: [[{ b: 2 }, { a: 1 }]], same: false },

  // ── objects that carry their own serializer ────────────────────────────────
  { id: 'cache-hash-a-to-json-method-hijacks-the-objects-hash', src: 'janux', left: [{ toJSON: () => 'x' }], right: ['x'], same: true },

  // ── sparse arrays ───────────────────────────────────────────────────────────
  // eslint-disable-next-line no-sparse-arrays
  { id: 'cache-hash-an-array-hole-collapses-with-null', src: 'janux', left: [[, 1]], right: [[null, 1]], same: true },
];
