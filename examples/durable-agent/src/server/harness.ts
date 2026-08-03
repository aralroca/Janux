import {
  createMemory,
  createMemoryCounterStore,
  createMemoryStorage,
  createPgStorage,
  createRateLimiter,
  createRedisCounterStore,
  type CounterStore,
  type HarnessStorage,
  type ScheduleStore,
} from '@janux/agent';
import { RATE_LIMIT } from './config';
import { SAFE_REFUSAL, guardrails } from './guardrails';

export type DurableStorage = HarnessStorage & ScheduleStore & { close?: () => Promise<void> };

/** Redis stores expose `close()` (they own a connection); the in-memory one has nothing to close. */
export type DurableCounterStore = CounterStore & { close?: () => Promise<void> };

interface RedisClient {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<unknown>;
}

/** Postgres when DATABASE_URL is set (durable); in-memory otherwise (dev fallback). */
export function durableStorage(connectionString = process.env.DATABASE_URL): Promise<DurableStorage> {
  if (!connectionString) return Promise.resolve(createMemoryStorage());

  return createPgStorage({ connectionString });
}

/** Redis when REDIS_URL (or a client) is given — one shared budget across instances. */
export function counterStore(redis: string | RedisClient | undefined = process.env.REDIS_URL): Promise<DurableCounterStore> {
  if (!redis) return Promise.resolve(createMemoryCounterStore());

  return createRedisCounterStore({ redis, keyPrefix: 'durable-agent:' });
}

/** The conversation memory every instance shares through the storage adapter. */
export function conversationMemory(storage: HarnessStorage) {
  return createMemory({ storage, lastMessages: 20 });
}

/** One limiter per instance over a shared counter store — the limit stays the limit. */
export function requestLimiter(store: CounterStore) {
  return createRateLimiter({ ...RATE_LIMIT, store });
}

/** Stable per-caller identity: the rate-limit key and the thread-ownership scope. */
export function identityFor(request: Request): string {
  return request.headers.get('x-user-id') ?? 'anonymous';
}

/** The full HarnessConfig for defineAgent, wired from the environment. */
export async function buildHarness() {
  const storage = await durableStorage();
  const store = await counterStore();

  return {
    memory: conversationMemory(storage),
    processors: guardrails(),
    refusalMessage: SAFE_REFUSAL,
    rateLimit: { ...RATE_LIMIT, store },
    identityFor,
  };
}
