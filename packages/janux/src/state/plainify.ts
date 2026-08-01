import { untrack } from '../signals';
import { childPath, displayPath } from './path';

/** A container the proxy descends into: anything non-null of type object. */
export function isPlainContainer(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/**
 * Deep-clones through proxies into plain JSON data (state is JSON-safe by
 * schema), so a value written into state cannot be mutated from outside it.
 *
 * `seen` holds the current ancestor chain only and backtracks, so a value shared
 * by two siblings is duplicated rather than mistaken for a cycle. Without the
 * check a cyclic value overflows the stack with a `RangeError` that names
 * nothing; `path` grows as the walk descends so the error locates the cycle
 * rather than just the write that carried it.
 */
export function plainify<T>(value: T, path = '', seen?: Set<object>, strict = false): T {
  // A function or symbol cannot live in state: it survives the clone here only
  // to blow up much later as `snapshot()`'s nameless DataCloneError. Strict mode
  // (the state write path) rejects it at the write, where `path` can still name
  // the culprit. Non-strict callers (the `foreign()` props boundary) keep
  // passing callbacks through untouched.
  if (strict && (typeof value === 'function' || typeof value === 'symbol')) {
    throw new Error(`Janux: cannot store a ${typeof value} in state ("${displayPath(path)}")`);
  }
  // Most writes store a scalar. Bail before allocating anything — a default
  // `seen = new Set()` would build one on every write, which is the whole cost.
  if (!isPlainContainer(value)) return value;
  const chain = seen ?? new Set<object>();

  if (chain.has(value)) throw new Error(`Janux: cannot store a cycle in state ("${displayPath(path)}")`);
  chain.add(value);
  const plain = Array.isArray(value) ? cloneArray(value, path, chain, strict) : cloneObject(value, path, chain, strict);

  chain.delete(value);

  return plain as T;
}

function cloneArray(value: unknown[], path: string, seen: Set<object>, strict: boolean): unknown[] {
  return untrack(() => value.map((item, index) => plainify(item, childPath(path, String(index)), seen, strict)));
}

function cloneObject(value: object, path: string, seen: Set<object>, strict: boolean): Record<string, unknown> {
  return untrack(() =>
    Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, plainify(nested, childPath(path, key), seen, strict)]),
    ),
  );
}
