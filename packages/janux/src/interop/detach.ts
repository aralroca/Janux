import { isPlainContainer, plainify } from '../state/plainify';

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

function detach(value: unknown): unknown {
  if (!isPlainContainer(value) || !isPlainData(value)) return value;
  const cached = detached.get(value);

  if (cached !== undefined) return cached;
  const plain = plainify(value);

  detached.set(value, plain);

  return plain;
}

/** Every prop a foreign component is about to receive, detached from island state. */
export function detachProps(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).map(([key, value]) => [key, detach(value)]));
}
