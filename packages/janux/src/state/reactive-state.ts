import { batch, signal, untrack, type Sig } from '../signals';
import { assertMutable, createGate, type MutationGate } from './mutation-gate';

const MUTATING_ARRAY_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
]);

export interface ReactiveState<T extends object = Record<string, unknown>> {
  proxy: T;
  snapshot(): T;
  /** Introspection for tests/devtools: live tracked-path count. */
  stats(): { paths: number };
}

function isPlainContainer(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/**
 * Deep-clones through proxies into plain JSON data (state is JSON-safe by
 * schema). `seen` holds the current ancestor chain only — it backtracks, so a
 * value shared by two siblings is duplicated rather than mistaken for a cycle.
 */
function plainify<T>(value: T, path = '', seen: Set<object> = new Set()): T {
  if (!isPlainContainer(value)) return value;
  if (seen.has(value)) throw new Error(`Janux: cannot store a cycle in state ("${path}")`);
  seen.add(value);
  const plain = Array.isArray(value)
    ? untrack(() => value.map((item) => plainify(item, path, seen)))
    : untrack(() => plainObject(value, path, seen));

  seen.delete(value);

  return plain as T;
}

function plainObject(value: object, path: string, seen: Set<object>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, plainify(nested, path, seen)]),
  );
}

/**
 * Offsets of the separators a key could not have produced.
 *
 * Paths are dot-joined, so a key that itself contains a dot would otherwise
 * make `a["b.c"]` and `a.b.c` the same tracking key. `escapeSegment` prefixes
 * `\` and `.` inside a key with a backslash; this fold finds the dots that
 * survived as real separators.
 */
function separatorOffsets(path: string): number[] {
  return [...path].reduce<{ offsets: number[]; escaped: boolean }>(
    (acc, char, index) => {
      if (acc.escaped) return { offsets: acc.offsets, escaped: false };
      if (char === '\\') return { offsets: acc.offsets, escaped: true };

      return { offsets: char === '.' ? [...acc.offsets, index] : acc.offsets, escaped: false };
    },
    { offsets: [], escaped: false },
  ).offsets;
}

const escapeSegment = (key: string): string => key.replace(/[\\.]/g, '\\$&');

/** Writes between prune sweeps: keeps the sweep cost amortized O(1) per write. */
const PRUNE_EVERY = 256;

export function createReactiveState<T extends object>(
  initial: T,
  gate: MutationGate = createGate(),
): ReactiveState<T> {
  const versions = new Map<string, Sig<number>>();
  // Direct-children index: descendant notification walks the subtree instead
  // of scanning every tracked path (the documented O(paths)-per-write limit).
  const children = new Map<string, Set<string>>();
  let writesSincePrune = 0;
  let data = structuredClone(initial);

  const parentOf = (path: string): string => {
    const offsets = separatorOffsets(path);

    return offsets.length === 0 ? '' : path.slice(0, offsets[offsets.length - 1]);
  };

  const indexPath = (path: string): void => {
    if (path === '') return;
    const parent = parentOf(path);
    const siblings = children.get(parent) ?? new Set();

    siblings.add(path);
    children.set(parent, siblings);
    indexPath(parent);
  };

  const versionOf = (path: string): Sig<number> => {
    const existing = versions.get(path);

    if (existing) return existing;
    const created = signal(0);

    versions.set(path, created);
    indexPath(path);

    return created;
  };

  const bump = (path: string): void => {
    const sig = versions.get(path);

    if (sig) sig.value += 1;
  };

  const bumpDescendants = (path: string): void => {
    (children.get(path) ?? []).forEach((child) => {
      bump(child);
      bumpDescendants(child);
    });
  };

  const bumpAncestors = (path: string): void => {
    separatorOffsets(path).forEach((offset) => bump(path.slice(0, offset)));
    bump('');
  };

  /**
   * Path pruning: version signals with no live readers and no indexed
   * children are reclaimed (a fresh reader restarts at version 0, which no
   * one can observe). Bottom-up until fixpoint, amortized across writes.
   */
  const prune = (): void => {
    let removed = true;

    while (removed) {
      removed = false;
      [...versions.entries()].forEach(([path, sig]) => {
        const kids = children.get(path);

        if (path === '' || sig.readers() > 0 || (kids && kids.size > 0)) return;
        versions.delete(path);
        children.delete(path);
        children.get(parentOf(path))?.delete(path);
        removed = true;
      });
    }
  };

  const touch = (path: string): void => {
    batch(() => {
      bump(path);
      bumpDescendants(path);
      bumpAncestors(path);
    });
    writesSincePrune += 1;
    if (writesSincePrune >= PRUNE_EVERY) {
      writesSincePrune = 0;
      prune();
    }
  };

  const childPath = (path: string, key: string): string =>
    path === '' ? escapeSegment(key) : `${path}.${escapeSegment(key)}`;

  const wrapArrayMethod = (target: unknown[], path: string, method: string) => {
    return (...args: unknown[]) => {
      assertMutable(gate, path);
      const result = (target as any)[method](...args.map((arg) => plainify(arg, path)));

      touch(path);

      return result;
    };
  };

  const proxyFor = (target: object, path: string): object => {
    return new Proxy(target, {
      get: (raw, key) => readTrap(raw, path, key),
      set: (raw, key, value) => writeTrap(raw, path, key, value),
      deleteProperty: (raw, key) => deleteTrap(raw, path, key),
    });
  };

  const readTrap = (raw: object, path: string, key: string | symbol): unknown => {
    if (typeof key === 'symbol') return Reflect.get(raw, key);
    if (Array.isArray(raw) && MUTATING_ARRAY_METHODS.has(key)) {
      return wrapArrayMethod(raw as unknown[], path, key);
    }
    const value = Reflect.get(raw, key);

    if (typeof value === 'function') return value.bind(proxyFor(raw, path));
    versionOf(childPath(path, key)).value;

    return isPlainContainer(value) ? proxyFor(value, childPath(path, key)) : value;
  };

  const writeTrap = (raw: object, path: string, key: string | symbol, value: unknown): boolean => {
    if (typeof key === 'symbol') return Reflect.set(raw, key, value);
    const target = childPath(path, key);

    assertMutable(gate, target);
    Reflect.set(raw, key, plainify(value, target));
    touch(target);

    return true;
  };

  const deleteTrap = (raw: object, path: string, key: string | symbol): boolean => {
    if (typeof key === 'symbol') return Reflect.deleteProperty(raw, key);
    const target = childPath(path, key);

    assertMutable(gate, target);
    Reflect.deleteProperty(raw, key);
    touch(target);

    return true;
  };

  return {
    get proxy(): T {
      return proxyFor(data, '') as T;
    },
    snapshot: () => structuredClone(data),
    stats: () => ({ paths: versions.size }),
  };
}
