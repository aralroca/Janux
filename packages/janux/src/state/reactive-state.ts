import { batch, signal, untrack, type Sig } from '../signals';
import { assertMutable, createGate, type MutationGate } from './mutation-gate';
import { ancestorsOf, childPath, parentOf } from './path';
import { isPlainContainer, plainify } from './plainify';
import { RAW } from './raw';

export { RAW, toRaw } from './raw';

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

/**
 * The paths the thunk currently evaluating under `withLeafTracking` read.
 * Module-global on purpose — a binding can read several islands' states in
 * one thunk — which is exactly why entries are keyed PER INSTANCE (by the
 * state's own `versions` map): two states sharing a path string must both
 * subscribe, and neither may suppress the other's maximality. Within an
 * instance, `null` marks a path a deeper read traversed — `readTrap` fires
 * for every step of a member chain, so marking the parent at read time IS
 * the maximality predicate, with no scan afterwards.
 */
let leafFrame: Map<object, Map<string, Sig<number> | null>> | null = null;

/**
 * Runs a binding thunk so only the MAXIMAL paths it read subscribe (the
 * structural fix for regression #22: a read of `values[3]` traverses
 * `values`, and subscribing the container re-runs every sibling binding on
 * any write). Dropping the prefixes loses nothing — `touch` bumps a written
 * path's descendants, so a container write always reaches the leaf signal.
 * Frames nest by restoration, and the subscribing reads happen HERE, inside
 * whatever effect is currently tracking.
 */
export function withLeafTracking<T>(read: () => T): T {
  const previous = leafFrame;
  const frame: NonNullable<typeof leafFrame> = (leafFrame = new Map());

  try {
    return read();
  } finally {
    leafFrame = previous;
    frame.forEach((paths) =>
      paths.forEach((sig) => {
        if (sig) void sig.value;
      }),
    );
  }
}

export function createReactiveState<T extends object>(
  initial: T,
  gate: MutationGate = createGate(),
): ReactiveState<T> {
  const versions = new Map<string, Sig<number>>();
  // Direct-children index: descendant notification walks the subtree instead
  // of scanning every tracked path (the documented O(paths)-per-write limit).
  const children = new Map<string, Set<string>>();
  const proxies = new Map<string, { version: number; raw: object; proxy: object }>();
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
        proxies.delete(path);
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
      // `sort`'s argument is a comparator, not data to store — every other
      // mutator's arguments become array contents and go through the strict clone.
      const stored = method === 'sort' ? args : args.map((arg) => plainify(arg, path, undefined, true));
      const result = (target as any)[method](...stored);

      touch(path);

      return result;
    };
  };

  /**
   * One proxy per (path, version) — referential identity is part of the
   * contract, not an implementation detail. `foreign()` hands this proxy
   * straight to React, whose ecosystem memoizes on identity (`useMemo` deps,
   * `React.memo`, and every data library's internal memo cache). A fresh object
   * per read makes "the data changed" true on every single render, which is an
   * infinite render loop in anything that recomputes on new data — TanStack
   * Table wedged the main thread on the first sort. Keying the cache on the
   * version signal gives structural sharing instead: `touch` bumps the written
   * path AND its ancestors, so a changed subtree gets a new identity all the way
   * up, while untouched siblings keep theirs.
   */
  const proxyFor = (target: object, path: string): object => {
    // Read, never create: `versionOf` here would register a tracked path for
    // every path merely proxied, and paths must grow only for paths actually
    // read. Untracked too — `readTrap` already subscribed the caller, and the
    // root accessor must not subscribe anyone to every write in the tree.
    const version = untrack(() => versions.get(path)?.value) ?? 0;
    const cached = proxies.get(path);

    if (cached && cached.version === version && cached.raw === target) return cached.proxy;

    const proxy = new Proxy(target, {
      get: (raw, key) => readTrap(raw, path, key),
      set: (raw, key, value) => writeTrap(raw, path, key, value),
      deleteProperty: (raw, key) => deleteTrap(raw, path, key),
    });

    proxies.set(path, { version, raw: target, proxy });

    return proxy;
  };

  const readTrap = (raw: object, path: string, key: string | symbol): unknown => {
    if (key === RAW) return raw;
    if (typeof key === 'symbol') return Reflect.get(raw, key);
    if (Array.isArray(raw) && MUTATING_ARRAY_METHODS.has(key)) {
      return wrapArrayMethod(raw as unknown[], path, key);
    }
    const value = Reflect.get(raw, key);

    if (typeof value === 'function') return value.bind(proxyFor(raw, path));
    // The hottest line in the state system: one `childPath` for both uses.
    const target = childPath(path, key);

    // Unconditional, even with nothing tracking: proxy identity is keyed on the
    // version signal, so skipping it for untracked reads would stop a write from
    // minting a new identity for the changed subtree — the contract `foreign()`
    // hands React. (Measured as a ~15% win on list writes, and reverted for it.)
    const version = versionOf(target);

    // A leaf frame defers the subscription: the signal must still exist (bump
    // only bumps existing signals), but only the maximal paths get read. The
    // `has` guard keeps a re-read from resurrecting a parent a deeper read
    // already marked.
    if (leafFrame) {
      let paths = leafFrame.get(versions);

      if (!paths) leafFrame.set(versions, (paths = new Map()));
      paths.set(path, null);
      if (!paths.has(target)) paths.set(target, version);
    } else void version.value;

    return isPlainContainer(value) ? proxyFor(value, target) : value;
  };

  const writeTrap = (raw: object, path: string, key: string | symbol, value: unknown): boolean => {
    if (typeof key === 'symbol') return Reflect.set(raw, key, value);
    const target = childPath(path, key);

    assertMutable(gate, target);
    Reflect.set(raw, key, plainify(value, target, undefined, true));
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
