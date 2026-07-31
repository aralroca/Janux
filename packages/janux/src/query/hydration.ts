/**
 * What may cross the wire between the server's cache and the client's.
 *
 * The state invariant is schema-typed plain data, and the SSR payload holds to
 * it: an entry whose data cannot be expressed that way is not serialized at
 * all, and the client fetches it normally. Nothing is quietly mangled on the
 * way over.
 */

/**
 * Why only these two, when `null`, `number`, `undefined`, `symbol` and `bigint`
 * are primitives too:
 *
 * - `number` is plain only when finite, checked a line below.
 *
 * - `null` is plain, and is accepted a line above this set.
 * - `bigint` makes `JSON.stringify` **throw** — it cannot travel at all.
 * - `symbol` vanishes: dropped from an object, `null` inside an array.
 * - `undefined` is accepted as an object *property* (JSON drops the key, and a
 *   schema reads an absent key and an undefined one the same way) but not as an
 *   array element, where it silently becomes `null` — a different value.
 *
 * A `number` must also be finite: `NaN` and `Infinity` stringify to `null`,
 * which is the same silent-corruption class as `new Map()` becoming `{}`.
 */
const PLAIN_PRIMITIVES = new Set(['string', 'boolean']);

/** A plain object literal — not a Map, a Set, a Date or a class instance. */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
}

/**
 * Whether a value is the plain, schema-shaped data the payload carries.
 *
 * A round-trip through `JSON.stringify` would not do the job: `new Map()`
 * stringifies to `{}` and would sail through, arriving on the client as an
 * empty object — data silently replaced by nothing is worse than data absent.
 *
 * `seen` makes a cycle a rejection rather than a stack overflow.
 */
export function isPlainData(value: unknown, seen = new Set<object>()): boolean {
  if (value === null) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (PLAIN_PRIMITIVES.has(typeof value)) return true;
  if (typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every((item) => isPlainData(item, seen));

  return isPlainObject(value) && Object.values(value).every((item) => item === undefined || isPlainData(item, seen));
}
