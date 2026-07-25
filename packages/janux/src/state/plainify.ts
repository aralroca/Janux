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
export function plainify<T>(value: T, path = '', seen?: Set<object>): T {
  // Most writes store a scalar. Bail before allocating anything — a default
  // `seen = new Set()` would build one on every write, which is the whole cost.
  if (!isPlainContainer(value)) return value;
  const chain = seen ?? new Set<object>();

  if (chain.has(value)) throw new Error(`Janux: cannot store a cycle in state ("${displayPath(path)}")`);
  chain.add(value);
  const plain = Array.isArray(value) ? cloneArray(value, path, chain) : cloneObject(value, path, chain);

  chain.delete(value);

  return plain as T;
}

function cloneArray(value: unknown[], path: string, seen: Set<object>): unknown[] {
  return untrack(() => value.map((item, index) => plainify(item, childPath(path, String(index)), seen)));
}

function cloneObject(value: object, path: string, seen: Set<object>): Record<string, unknown> {
  return untrack(() =>
    Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, plainify(nested, childPath(path, key), seen)]),
    ),
  );
}
