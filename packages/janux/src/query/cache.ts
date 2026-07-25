/**
 * Framework-agnostic client data cache (RFC 0002 §6.1). A small QueryClient
 * with staleTime/gcTime, background revalidation, observers, and mutations
 * with optimistic rollback. The signal adapter (query.ts) binds it to islands;
 * the core itself has no runtime dependency.
 */

export type QueryKey = readonly unknown[];
export type QueryStatus = 'pending' | 'success' | 'error';

export interface QueryState<T> {
  status: QueryStatus;
  data: T | undefined;
  error: unknown;
  isFetching: boolean;
  updatedAt: number;
}

export interface QueryOptions<T> {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  staleTime?: number;
  gcTime?: number;
}

type Listener = () => void;

export function hashKey(key: QueryKey): string {
  return JSON.stringify(key, (_field, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.keys(value)
          .sort()
          .reduce((sorted: Record<string, unknown>, k) => ((sorted[k] = (value as any)[k]), sorted), {})
      : value,
  );
}

/**
 * Prefix match on key *segments*, not on the hash string.
 *
 * A string segment happens to be delimited by its closing quote, so comparing
 * hash prefixes worked for `['todos']` vs `['todosArchive']`. A number is not:
 * `hashKey([1])` is `"[1]"`, which is a string prefix of `"[10]"`, so
 * `invalidateQueries(['user', 1])` also refetched `['user', 10]`.
 */
/** Recovers a key from its hash; a hash Janux did not write falls back to one opaque segment. */
function parseHash(hash: string): QueryKey {
  try {
    const parsed = JSON.parse(hash);

    return Array.isArray(parsed) ? parsed : [hash];
  } catch {
    return [hash];
  }
}

function startsWithSegments(key: QueryKey, prefix: QueryKey): boolean {
  if (key.length < prefix.length) return false;

  return prefix.every((segment, index) => hashKey([segment]) === hashKey([key[index]]));
}

const DEFAULT_STALE = 0;
const DEFAULT_GC = 5 * 60 * 1000;

class Query<T> {
  state: QueryState<T> = { status: 'pending', data: undefined, error: undefined, isFetching: false, updatedAt: 0 };
  private listeners = new Set<Listener>();
  private promise: Promise<T> | undefined;
  private gcTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    readonly hash: string,
    readonly options: QueryOptions<T>,
    private readonly onGarbage: (hash: string) => void,
    private readonly now: () => number,
  ) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.gcTimer) clearTimeout(this.gcTimer);

    return () => {
      this.listeners.delete(listener);
      this.scheduleGc();
    };
  }

  private scheduleGc(): void {
    if (this.listeners.size > 0) return;
    const gcTime = this.options.gcTime ?? DEFAULT_GC;

    this.gcTimer = setTimeout(() => this.onGarbage(this.hash), gcTime);
  }

  private set(patch: Partial<QueryState<T>>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  isStale(): boolean {
    const staleTime = this.options.staleTime ?? DEFAULT_STALE;

    return this.state.status !== 'success' || this.now() - this.state.updatedAt >= staleTime;
  }

  setData(data: T): void {
    this.set({ status: 'success', data, error: undefined, updatedAt: this.now() });
  }

  async fetch(): Promise<T> {
    if (this.promise) return this.promise;
    this.set({ isFetching: true });
    this.promise = this.options
      .queryFn()
      .then((data) => {
        this.set({ status: 'success', data, error: undefined, isFetching: false, updatedAt: this.now() });

        return data;
      })
      .catch((error) => {
        this.set({ status: 'error', error, isFetching: false });
        throw error;
      })
      .finally(() => {
        this.promise = undefined;
      });

    return this.promise;
  }
}

export interface MutationOptions<TData, TVars, TCtx> {
  mutationFn: (vars: TVars) => Promise<TData>;
  onMutate?: (vars: TVars) => TCtx | Promise<TCtx>;
  onError?: (error: unknown, vars: TVars, ctx: TCtx | undefined) => void;
  onSuccess?: (data: TData, vars: TVars, ctx: TCtx | undefined) => void;
  onSettled?: () => void;
}

export class QueryClient {
  private queries = new Map<string, Query<any>>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  getQuery<T>(options: QueryOptions<T>): Query<T> {
    const hash = hashKey(options.queryKey);
    const existing = this.queries.get(hash);

    if (existing) return existing;
    const query = new Query<T>(hash, options, (key) => this.queries.delete(key), this.now);

    this.queries.set(hash, query);

    return query;
  }

  getQueryData<T>(key: QueryKey): T | undefined {
    return this.queries.get(hashKey(key))?.state.data;
  }

  setQueryData<T>(key: QueryKey, data: T): void {
    this.queries.get(hashKey(key))?.setData(data);
  }

  /** Refetch every entry whose key starts with this prefix (observed or not); failures are swallowed. */
  async invalidateQueries(key?: QueryKey): Promise<void> {
    const matches = [...this.queries.values()].filter(
      (query) => !key || startsWithSegments(query.options.queryKey, key),
    );

    await Promise.all(matches.map((query) => query.fetch().catch(() => undefined)));
  }

  async mutate<TData, TVars, TCtx>(options: MutationOptions<TData, TVars, TCtx>, vars: TVars): Promise<TData> {
    const ctx = await options.onMutate?.(vars);

    try {
      const data = await options.mutationFn(vars);

      options.onSuccess?.(data, vars, ctx);

      return data;
    } catch (error) {
      options.onError?.(error, vars, ctx);
      throw error;
    } finally {
      options.onSettled?.();
    }
  }

  /** Test/SSR seam: dehydrate cache entries and rebuild them on the client. */
  dehydrate(): Record<string, QueryState<unknown>> {
    return Object.fromEntries(
      [...this.queries.entries()]
        .filter(([, query]) => query.state.status === 'success')
        .map(([hash, query]) => [hash, query.state]),
    );
  }

  hydrate(entries: Record<string, QueryState<unknown>>): void {
    Object.entries(entries).forEach(([hash, state]) => {
      // The hash *is* the serialized key, so parsing it back keeps a hydrated
      // entry matchable by `invalidateQueries` now that matching is segment-wise.
      const queryKey = parseHash(hash);
      const query = new Query(hash, { queryKey, queryFn: async () => state.data } as any, (key) => this.queries.delete(key), this.now);

      query.state = state;
      this.queries.set(hash, query);
    });
  }
}

export { Query };
