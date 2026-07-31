/**
 * Framework-agnostic client data cache (RFC 0002 §6.1). A small QueryClient
 * with staleTime/gcTime, background revalidation, observers, and mutations
 * with optimistic rollback. The signal adapter (query.ts) binds it to islands;
 * the core itself has no runtime dependency.
 */

import { isPlainData } from './hydration';

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
  /** How long the data counts as fresh. The client's `max-age`. */
  staleTime?: number;
  /**
   * How long stale data may still be shown while it revalidates — the client's
   * `stale-while-revalidate`, and the same arithmetic: past
   * `staleTime + swr` the data is too old to show and the query goes back to
   * pending. Absent means stale data is shown indefinitely (the default).
   */
  swr?: number;
  gcTime?: number;
  /** Named tags `invalidateTag()` purges — the same word a route's `cachePolicy` uses. */
  tags?: string[];
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
/** How long SSR waits for the queries a render started, before giving up on them. */
const SETTLE_TIMEOUT_MS = 5_000;
const SETTLE_ROUNDS = 10;

export interface SettleOptions {
  /** Deadline for the whole wait. Default 5s. */
  timeoutMs?: number;
  /** Waterfall depth to follow. Default 10. */
  rounds?: number;
}

/** A timer that never keeps a process alive on its own account. */
function after(ms: number): Promise<void> {
  return new Promise((resolve) => {
    (setTimeout(resolve, ms) as any)?.unref?.();
  });
}

/** Whether an arriving state describes a more recent read than the one held. */
function isNewerThan(incoming: QueryState<unknown>, held: QueryState<unknown>): boolean {
  return held.status !== 'success' || incoming.updatedAt >= held.updatedAt;
}
const DEFAULT_GC = 5 * 60 * 1000;

class Query<T> {
  state: QueryState<T> = { status: 'pending', data: undefined, error: undefined, isFetching: false, updatedAt: 0 };
  /**
   * The server said this entry is coming down the same stream. Until it lands
   * (or the response ends without it) the client must not start the request
   * itself — restarting is the double fetch this whole mechanism removes.
   */
  awaiting = false;
  private listeners = new Set<Listener>();
  private promise: Promise<T> | undefined;
  private gcTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    readonly hash: string,
    public options: QueryOptions<T>,
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
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  /** The fetch in flight, for `settle()` to await before dehydrating. */
  inFlight(): Promise<T> | undefined {
    return this.promise;
  }

  /**
   * Attaches the options an observer actually declared. An entry can exist
   * before anyone observes it — hydrated from the payload, or expected from the
   * stream — and those carry a placeholder `queryFn`. Without this, the first
   * real observer would inherit the placeholder and a later `refetch()` would
   * replay the payload instead of going to the server.
   */
  setOptions(options: QueryOptions<T>): void {
    this.options = options;
  }

  /** Takes a state that arrived from the server, and tells observers about it. */
  adopt(state: QueryState<T>): void {
    this.state = state;
    this.notify();
  }

  /** Stops awaiting the stream and lets observers notice they must fetch after all. */
  release(): void {
    if (!this.awaiting) return;
    this.awaiting = false;
    if (this.listeners.size > 0 && this.isStale()) this.fetch().catch(() => undefined);
  }

  isStale(): boolean {
    const staleTime = this.options.staleTime ?? DEFAULT_STALE;

    return this.state.status !== 'success' || this.now() - this.state.updatedAt >= staleTime;
  }

  /**
   * Past `staleTime + swr` the data is no longer worth showing. Without a `swr`
   * window there is no expiry at all, which is what every existing query
   * expects — stale data shown indefinitely while it revalidates.
   */
  isExpired(): boolean {
    if (this.options.swr === undefined || this.state.status !== 'success') return false;
    const staleTime = this.options.staleTime ?? DEFAULT_STALE;

    return this.now() - this.state.updatedAt >= staleTime + this.options.swr;
  }

  /**
   * What an observer should render. Expired data is withheld rather than
   * deleted: the entry keeps its `updatedAt`, so the refetch it triggers is an
   * ordinary revalidation and not a cold start.
   */
  visible(): QueryState<T> {
    if (!this.isExpired()) return this.state;

    return { ...this.state, status: 'pending', data: undefined };
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

    if (existing) {
      existing.setOptions(options);

      return existing;
    }
    const query = new Query<T>(hash, options, (key) => this.queries.delete(key), this.now);

    this.queries.set(hash, query);

    return query;
  }

  getQueryData<T>(key: QueryKey): T | undefined {
    return this.queries.get(hashKey(key))?.visible().data as T | undefined;
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

  /**
   * Refetch every entry carrying this tag. The server side of the same word:
   * a mutation that calls `revalidateTag('catalog')` on the server can call
   * this with the identical string here, and both halves of the cache drop the
   * same thing.
   */
  async invalidateTag(tag: string): Promise<void> {
    const matches = [...this.queries.values()].filter((query) => query.options.tags?.includes(tag));

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

  /**
   * Resolves once nothing is in flight — including fetches that only started
   * because an earlier one finished, which is what a render querying in a
   * waterfall produces.
   *
   * Bounded twice over, because SSR awaits this before closing a response: by
   * rounds, so a query that retriggers itself cannot loop, and by a deadline,
   * so a `queryFn` that never settles costs a few seconds rather than a
   * response that never ends. Whatever is still running is simply left out of
   * the payload, and the client fetches it.
   */
  async settle(options: SettleOptions = {}): Promise<void> {
    await Promise.race([this.drain(options.rounds ?? SETTLE_ROUNDS), after(options.timeoutMs ?? SETTLE_TIMEOUT_MS)]);
  }

  private async drain(rounds: number): Promise<void> {
    const pending = [...this.queries.values()].map((query) => query.inFlight()).filter(Boolean);

    if (pending.length === 0 || rounds === 0) return;
    await Promise.allSettled(pending);

    return this.drain(rounds - 1);
  }

  /**
   * The entries worth sending to the client: settled successes whose data is
   * plain JSON. Anything else (a Map, a class instance, a function on the
   * object) is left out rather than shipped broken — the state invariant is
   * schema-typed plain data, and the client simply refetches what it did not
   * receive.
   */
  dehydrate(): Record<string, QueryState<unknown>> {
    return Object.fromEntries(
      [...this.queries.entries()]
        .filter(([, query]) => query.state.status === 'success' && isPlainData(query.state.data))
        .map(([hash, query]) => [hash, query.state]),
    );
  }

  hydrate(entries: Record<string, QueryState<unknown>>): void {
    Object.entries(entries).forEach(([hash, state]) => {
      // The hash *is* the serialized key, so parsing it back keeps a hydrated
      // entry matchable by `invalidateQueries` now that matching is segment-wise.
      const queryKey = parseHash(hash);
      const existing = this.queries.get(hash);
      const query = existing ?? new Query(hash, { queryKey, queryFn: async () => state.data } as any, (key) => this.queries.delete(key), this.now);

      query.awaiting = false;
      // A payload chunk describes a read the server made. If the client has
      // since fetched something newer, that wins: hydration fills gaps, it
      // never moves data backwards.
      if (isNewerThan(state, query.state)) query.adopt(state as QueryState<any>);
      this.queries.set(hash, query);
    });
  }

  /**
   * Declares the entries the server is still streaming. An observer of one of
   * these renders pending and waits, instead of firing the request the server
   * is already running.
   */
  expect(hashes: string[]): void {
    hashes.forEach((hash) => {
      const existing = this.queries.get(hash);
      const query = existing ?? new Query(hash, { queryKey: parseHash(hash), queryFn: async () => undefined } as any, (key) => this.queries.delete(key), this.now);

      query.awaiting = true;
      this.queries.set(hash, query);
    });
  }

  /** Hashes of the queries fetching right now — what a streamed chunk announces as coming. */
  inFlightHashes(): string[] {
    return [...this.queries.values()].filter((query) => query.inFlight()).map((query) => query.hash);
  }

  /** The response ended: anything still expected is not coming, so let it fetch. */
  releaseExpected(): void {
    this.queries.forEach((query) => query.release());
  }
}


export { Query };
