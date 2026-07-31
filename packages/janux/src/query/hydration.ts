/**
 * What may cross the wire between the server's cache and the client's.
 *
 * The state invariant is schema-typed plain data, and the SSR payload holds to
 * it: an entry whose data cannot be expressed that way is not serialized at
 * all, and the client fetches it normally. Nothing is quietly mangled on the
 * way over.
 */

const PLAIN_PRIMITIVES = new Set(['string', 'number', 'boolean']);

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
  if (PLAIN_PRIMITIVES.has(typeof value)) return true;
  if (typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every((item) => isPlainData(item, seen));

  return isPlainObject(value) && Object.values(value).every((item) => isPlainData(item, seen));
}
