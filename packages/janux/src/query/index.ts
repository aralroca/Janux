import { signal, effect as watch, type Sig } from '../signals';
import { QueryClient, hashKey, type QueryKey, type QueryOptions, type QueryState } from './cache';

export { QueryClient, hashKey } from './cache';
export type { QueryKey, QueryOptions, QueryState, QueryStatus, MutationOptions } from './cache';

let ambient: QueryClient | undefined;

/** The process/app-wide client. Apps may pass their own to `query()`/`mutation()`. */
export function getQueryClient(): QueryClient {
  ambient ??= new QueryClient();

  return ambient;
}

export interface QueryHandle<T> {
  data: Sig<T | undefined>;
  error: Sig<unknown>;
  isPending: Sig<boolean>;
  isFetching: Sig<boolean>;
  refetch(): Promise<T>;
}

/**
 * Reactive read bound to the ownership scope. Accepts fixed options or a getter
 * that reads signals — when the getter's key changes, the observed cache entry
 * switches (old subscription disposed, new one fetched if stale) inside one
 * stable effect. State mirrors into signals; everything disposes with the scope.
 */
export function query<T>(
  options: QueryOptions<T> | (() => QueryOptions<T>),
  client: QueryClient = getQueryClient(),
): QueryHandle<T> {
  const getOptions = typeof options === 'function' ? options : () => options;
  const data = signal<T | undefined>(undefined);
  const error = signal<unknown>(undefined);
  const isPending = signal(true);
  const isFetching = signal(false);
  let current: import('./cache').Query<T> | undefined;

  // One effect owns the subscription: the key getter is read ONLY here, so a
  // `derived` wrapping this call has no dependencies and stays stable. The
  // effect re-runs when the key's signals change; its returned cleanup
  // unsubscribes the previous entry (onCleanup would accumulate across re-runs).
  watch(() => {
    const entry = client.getQuery(getOptions());

    current = entry;
    // `visible()`, not `state`: data past its swr window is withheld from the
    // view, so an island shows its pending UI rather than something too old to
    // be true while the refetch below runs.
    const sync = () => {
      const shown = entry.visible();

      data.value = shown.data;
      error.value = shown.error;
      isPending.value = shown.status === 'pending';
      isFetching.value = shown.isFetching;
    };
    const unsubscribe = entry.subscribe(sync);

    sync();
    if (entry.isStale()) entry.fetch().catch(() => undefined);

    return unsubscribe;
  });

  return { data, error, isPending, isFetching, refetch: () => current!.fetch() };
}

const scopedQueries = new WeakMap<object, Map<string, QueryHandle<any>>>();

/**
 * Stable query bound to a component `bag`: created once per (bag, id) and
 * reused across re-renders, so it can be called directly in a view without
 * re-instantiating its effect. The getter reads state for the reactive key.
 */
export function useQuery<T>(
  bag: { ctx?: { queryClient?: QueryClient } },
  id: string,
  getOptions: () => QueryOptions<T>,
  client: QueryClient = bag.ctx?.queryClient ?? getQueryClient(),
): QueryHandle<T> {
  const perBag = scopedQueries.get(bag) ?? new Map();

  scopedQueries.set(bag, perBag);
  const existing = perBag.get(id);

  if (existing) return existing;
  const handle = query(getOptions, client);

  perBag.set(id, handle);

  return handle;
}

export interface MutationHandle<TData, TVars> {
  mutate(vars: TVars): Promise<TData>;
  isPending: Sig<boolean>;
}

export function mutation<TData, TVars, TCtx = unknown>(
  options: import('./cache').MutationOptions<TData, TVars, TCtx>,
  client: QueryClient = getQueryClient(),
): MutationHandle<TData, TVars> {
  const isPending = signal(false);

  return {
    isPending,
    async mutate(vars: TVars) {
      isPending.value = true;
      try {
        return await client.mutate(options, vars);
      } finally {
        isPending.value = false;
      }
    },
  };
}
