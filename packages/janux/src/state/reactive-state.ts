import { batch, signal, type Sig } from '../signals';
import { assertMutable, createGate, type MutationGate } from './mutation-gate';
import { ancestorsOf, childPath, parentOf } from './path';
import { isPlainContainer, plainify } from './plainify';

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
    ancestorsOf(path).forEach(bump);
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
    // The hottest line in the state system: one `childPath` for both uses.
    const target = childPath(path, key);

    versionOf(target).value;

    return isPlainContainer(value) ? proxyFor(value, target) : value;
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
