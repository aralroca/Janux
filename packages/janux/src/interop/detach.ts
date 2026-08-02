import { untrack } from '../signals';
import { isPlainContainer } from '../state/plainify';

/**
 * The props boundary: what a foreign component receives is plain data, never the
 * live state proxy.
 *
 * Two reasons, both met in practice. A library that deep-freezes its props
 * (Immer — and so Redux Toolkit, and so Recharts 3) would otherwise freeze the
 * proxy's TARGET, leaving island state permanently unwritable and every later
 * read throwing a Proxy invariant error. And a foreign component could
 * otherwise mutate island state directly, behind the intents that are supposed
 * to be the only way in.
 */

/**
 * Plain data cached by the proxy that produced it. State proxies are stable per
 * (path, version), so an unchanged subtree hands back the very same plain object
 * — structural sharing across the boundary: React keeps its memoization, and a
 * 10 000-row list is not re-cloned because a filter string changed.
 */
const detached = new WeakMap<object, unknown>();

/**
 * Only plain objects and arrays are state-shaped. A mapper can hand over things
 * that are not state at all — a Date, a class instance, a React element — and
 * those must reach React exactly as they were written. A React element is a
 * plain object, so it needs its own check: `$$typeof` is the marker React itself
 * uses, and cloning one would give React a look-alike whose identity (and whose
 * nested elements' identities) no longer match anything it memoized.
 */
function isPlainData(value: object): boolean {
  if (Array.isArray(value)) return true;
  if ('$$typeof' in value) return false;
  const proto = Object.getPrototypeOf(value);

  return (proto === Object.prototype || proto === null) && Object.getOwnPropertySymbols(value).length === 0;
}

function define(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/**
 * The plain-data test applies at EVERY level, not only to the prop itself.
 * A generic deep clone here would turn a `Date` inside an array into `{}` and
 * hand React a look-alike of every element in a `children` list — the same
 * destruction `isPlainData` already refuses at the top, one level down, where
 * mappers put lists.
 *
 * The clone is registered before its contents are walked, so a value that
 * refers back to itself (a graph a mapper legitimately hands to a foreign
 * component) is rebuilt as the same cycle instead of recursing forever, and two
 * props sharing a subtree keep sharing it.
 *
 * `untrack` because the walk reads through state proxies: subscribing to every
 * leaf would re-render the foreign root on writes its props never mentioned.
 */
function detach(value: unknown): unknown {
  if (!isPlainContainer(value) || !isPlainData(value)) return value;
  const cached = detached.get(value);

  if (cached !== undefined) return cached;
  const plain: any = Array.isArray(value) ? [] : {};

  detached.set(value, plain);
  untrack(() => {
    // Indexed, not `forEach`: a hole in a sparse array is skipped by every
    // iteration helper, and skipping one shifts every later item onto the wrong
    // index — a list silently rendered off by one.
    if (Array.isArray(value)) for (let index = 0; index < value.length; index += 1) plain[index] = detach(value[index]);
    // `defineProperty`, never assignment: a `__proto__` key in the source (any
    // object that came from `JSON.parse`) would otherwise set the copy's
    // prototype from untrusted data instead of copying a field.
    else Object.entries(value).forEach(([key, nested]) => define(plain, key, detach(nested)));
  });

  return plain;
}

/** Every prop a foreign component is about to receive, detached from island state. */
export function detachProps(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).map(([key, value]) => [key, detach(value)]));
}
