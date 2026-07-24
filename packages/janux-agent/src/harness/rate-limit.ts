/**
 * Fixed-window rate limiting (RFC 0002 §23, assistant parity): a per-identity
 * counter plus an optional global circuit-breaker. The counter store is
 * pluggable (Redis adapter in production); the in-memory store backs dev and
 * tests. Runtime failures FAIL OPEN — a limiter outage never downs the agent.
 */

export interface CounterStore {
  /** Increments `key` inside the current window and returns the new count. */
  incr(key: string, windowMs: number): Promise<number> | number;
}

export function createMemoryCounterStore(now: () => number = () => Date.now()): CounterStore {
  const counters = new Map<string, { windowStart: number; count: number }>();

  return {
    incr(key, windowMs) {
      const at = now();
      const entry = counters.get(key);

      if (!entry || at - entry.windowStart >= windowMs) {
        counters.set(key, { windowStart: at, count: 1 });

        return 1;
      }
      entry.count += 1;

      return entry.count;
    },
  };
}

export interface RateLimitConfig {
  /** Per-identity requests per window. */
  limit: number;
  windowMs: number;
  /** Global circuit-breaker across all identities (0/undefined → off). */
  globalLimit?: number;
  store?: CounterStore;
}

export interface RateLimiter {
  /** True when the request is allowed. Fails open on store errors. */
  allow(identity: string): Promise<boolean>;
}

export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  const store = config.store ?? createMemoryCounterStore();

  return {
    async allow(identity) {
      try {
        const count = await store.incr(`rl:${identity}`, config.windowMs);

        if (count > config.limit) return false;
        if (config.globalLimit) {
          const global = await store.incr('rl:__global__', config.windowMs);

          if (global > config.globalLimit) return false;
        }

        return true;
      } catch {
        return true;
      }
    },
  };
}
