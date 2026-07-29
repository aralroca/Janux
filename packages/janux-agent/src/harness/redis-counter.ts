import type { CounterStore } from './rate-limit';

/**
 * Redis fixed-window counter (assistant parity: shared ElastiCache, stateless
 * app instances). `ioredis` is an optional peer, imported dynamically. The
 * limiter itself fails open, so a Redis outage never downs the agent.
 */

export interface RedisCounterOptions {
  /** ioredis connection string or an existing client instance. */
  redis: string | { incr(key: string): Promise<number>; pexpire(key: string, ms: number): Promise<unknown> };
  keyPrefix?: string;
}

export interface RedisCounterStore extends CounterStore {
  /** Disconnects the client this store created; no-op for a caller-supplied client. */
  close(): Promise<void>;
}

export async function createRedisCounterStore(options: RedisCounterOptions): Promise<RedisCounterStore> {
  const owned = typeof options.redis === 'string';
  const client = owned
    ? new ((await import('ioredis')).default)(options.redis as string, { maxRetriesPerRequest: 1 })
    : (options.redis as Exclude<RedisCounterOptions['redis'], string>);
  const prefix = options.keyPrefix ?? 'janux:';

  return {
    async incr(key, windowMs) {
      const windowKey = `${prefix}${key}:${Math.floor(Date.now() / windowMs)}`;
      const count = await client.incr(windowKey);

      if (count === 1) await client.pexpire(windowKey, windowMs);

      return count;
    },
    async close() {
      if (owned) await (client as { quit(): Promise<unknown> }).quit();
    },
  };
}
