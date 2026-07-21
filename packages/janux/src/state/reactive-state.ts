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
}

function isPlainContainer(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/** Deep-clones through proxies into plain JSON data (state is JSON-safe by schema). */
function plainify<T>(value: T): T {
  if (Array.isArray(value)) return untrack(() => value.map(plainify)) as T;
  if (isPlainContainer(value)) return untrack(() => plainObject(value)) as T;

  return value;
}

function plainObject(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, plainify(v)]));
}

export function createReactiveState<T extends object>(
  initial: T,
  gate: MutationGate = createGate(),
): ReactiveState<T> {
  const versions = new Map<string, Sig<number>>();
  let data = structuredClone(initial);

  const versionOf = (path: string): Sig<number> => {
    const existing = versions.get(path);

    if (existing) return existing;
    const created = signal(0);

    versions.set(path, created);

    return created;
  };

  const bump = (path: string): void => {
    versionOf(path).value += 1;
  };

  const bumpDescendants = (path: string): void => {
    const prefix = path === '' ? '' : `${path}.`;

    [...versions.keys()].filter((key) => key !== path && key.startsWith(prefix)).forEach(bump);
  };

  const bumpAncestors = (path: string): void => {
    const parts = path.split('.').slice(0, -1);

    parts.forEach((_, index) => bump(parts.slice(0, index + 1).join('.')));
    bump('');
  };

  const touch = (path: string): void => {
    batch(() => {
      bump(path);
      bumpDescendants(path);
      bumpAncestors(path);
    });
  };

  const childPath = (path: string, key: string): string => (path === '' ? key : `${path}.${key}`);

  const wrapArrayMethod = (target: unknown[], path: string, method: string) => {
    return (...args: unknown[]) => {
      assertMutable(gate, path);
      const result = (target as any)[method](...args.map(plainify));

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
    Reflect.set(raw, key, plainify(value));
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
  };
}
