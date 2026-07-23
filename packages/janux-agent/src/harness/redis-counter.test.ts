import { describe, expect, it } from 'bun:test';
import { createRateLimiter } from './rate-limit';
import { createRedisCounterStore } from './redis-counter';

const URL = process.env.JANUX_TEST_REDIS ?? 'redis://:localdev@localhost:6379/15';
const probe = await import('ioredis')
  .then(async ({ default: Redis }) => {
    const client = new Redis(URL, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 500 });

    await client.connect();

    return client;
  })
  .catch(() => undefined);

const suite = probe ? describe : describe.skip;

suite('redis counter store (real Redis)', () => {
  it('enforces the per-identity window across "instances" (stateless parity)', async () => {
    const key = `test_${Date.now()}`;
    const limiterA = createRateLimiter({
      limit: 2,
      windowMs: 60_000,
      store: await createRedisCounterStore({ redis: probe as any, keyPrefix: 'janux-test:' }),
    });
    const limiterB = createRateLimiter({
      limit: 2,
      windowMs: 60_000,
      store: await createRedisCounterStore({ redis: probe as any, keyPrefix: 'janux-test:' }),
    });

    expect(await limiterA.allow(key)).toBe(true);
    expect(await limiterB.allow(key)).toBe(true);
    // A THIRD hit from another instance must see the shared counter.
    expect(await limiterA.allow(key)).toBe(false);
    probe!.disconnect();
  });
});
