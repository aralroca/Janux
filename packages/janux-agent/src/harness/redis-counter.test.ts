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

describe('redis counter store close()', () => {
  it('never disconnects a caller-supplied client — it does not own it', async () => {
    let quits = 0;
    const client = {
      incr: async () => 1,
      pexpire: async () => 'OK',
      quit: async () => {
        quits += 1;
      },
    };
    const store = await createRedisCounterStore({ redis: client });

    await store.close();

    expect(quits).toBe(0);
  });
});

suite('redis counter store (real Redis)', () => {
  it('close() disconnects a store created from a connection string', async () => {
    const store = await createRedisCounterStore({ redis: URL, keyPrefix: 'janux-test:' });

    expect(await store.incr(`close_probe_${Date.now()}`, 60_000)).toBe(1);
    await store.close();
  });

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
