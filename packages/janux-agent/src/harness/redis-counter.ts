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

export async function createRedisCounterStore(options: RedisCounterOptions): Promise<CounterStore> {
  const client =
    typeof options.redis === 'string'
      ? new ((await import('ioredis')).default)(options.redis, { maxRetriesPerRequest: 1 })
      : options.redis;
  const prefix = options.keyPrefix ?? 'janux:';

  return {
    async incr(key, windowMs) {
      const windowKey = `${prefix}${key}:${Math.floor(Date.now() / windowMs)}`;
      const count = await client.incr(windowKey);

      if (count === 1) await client.pexpire(windowKey, windowMs);

      return count;
    },
  };
}
