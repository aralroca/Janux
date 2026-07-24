import { describe, expect, it } from 'bun:test';
import {
  acceptAttachments,
  AttachmentError,
  createMemory,
  createMemoryCounterStore,
  createMemoryStorage,
  createRateLimiter,
} from '@janux/agent';

/**
 * reference/agent-memory.md, agent-rate-limit.md and agent-attachments.md —
 * three pages that are almost entirely tables of defaults and failure codes.
 * Every default and every code is asserted, plus the two guarantees a reader
 * would otherwise have to trust: memory fails closed on a foreign thread, and
 * the rate limiter's global limit is a real circuit breaker.
 */

describe('reference/agent-memory.md', () => {
  const memory = (options: Record<string, unknown> = {}) =>
    createMemory({ storage: createMemoryStorage(), ...options } as any);

  it('creates a thread on demand and titles it from the first user message', async () => {
    const store = memory({ generateTitle: (first: string) => `re: ${first}` });
    const thread = await store.ensureThread(undefined, 'user-1');

    expect(thread.resourceId).toBe('user-1');
    expect(thread.title).toBe('New conversation');
    await store.remember(thread, 'user', 'hello there');

    expect((await store.getThread(thread.id))!.title).toBe('re: hello there');
  });

  it('fails closed when a thread belongs to somebody else', async () => {
    const store = memory();
    const mine = await store.ensureThread(undefined, 'user-1');

    expect((await store.ensureThread(mine.id, 'user-1')).id).toBe(mine.id); // the owner is fine
    await expect(store.ensureThread(mine.id, 'user-2')).rejects.toThrow('thread_forbidden');
  });

  it('returns history oldest-first, windowed by lastMessages', async () => {
    const store = memory({ lastMessages: 2 });
    const thread = await store.ensureThread(undefined, 'user-1');

    await store.remember(thread, 'user', 'one');
    await store.remember(thread, 'assistant', 'two');
    await store.remember(thread, 'user', 'three');

    expect((await store.history(thread.id)).map((message: any) => message.content)).toEqual(['two', 'three']);
  });

  it('lists a resource\'s threads and deletes one', async () => {
    const store = memory();
    const first = await store.ensureThread(undefined, 'user-1');

    await store.ensureThread(undefined, 'user-1');

    expect(await store.listThreads('user-1')).toHaveLength(2);
    await store.deleteThread(first.id);

    expect(await store.listThreads('user-1')).toHaveLength(1);
    expect(await store.listThreads('somebody-else')).toEqual([]);
  });
});

describe('reference/agent-rate-limit.md', () => {
  it('allows up to the limit per identity, then refuses', async () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });

    expect(await limiter.allow('ada')).toBe(true);
    expect(await limiter.allow('ada')).toBe(true);
    expect(await limiter.allow('ada')).toBe(false);
    expect(await limiter.allow('grace')).toBe(true); // per identity, not global
  });

  it('globalLimit is a circuit breaker across every identity', async () => {
    const limiter = createRateLimiter({ limit: 10, windowMs: 60_000, globalLimit: 2 });

    expect(await limiter.allow('a')).toBe(true);
    expect(await limiter.allow('b')).toBe(true);
    expect(await limiter.allow('c')).toBe(false); // nobody gets through
  });

  it('counts in a fresh window once the old one expires', async () => {
    let clock = 1_000;
    const limiter = createRateLimiter({ limit: 1, windowMs: 100, store: createMemoryCounterStore(() => clock) });

    expect(await limiter.allow('ada')).toBe(true);
    expect(await limiter.allow('ada')).toBe(false);
    clock += 150;

    expect(await limiter.allow('ada')).toBe(true);
  });

  it('fails OPEN when the counter store throws — cost control degrades, the copilot stays up', async () => {
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      store: {
        incr: async () => {
          throw new Error('redis unreachable');
        },
      } as any,
    });

    expect(await limiter.allow('ada')).toBe(true);
  });
});

describe('reference/agent-attachments.md', () => {
  const png = (kb: number) => ({ mediaType: 'image/png', data: 'A'.repeat(Math.ceil((kb * 1024 * 4) / 3)) });

  it('refs are 1-based and in request order, with decoded byte sizes', () => {
    const accepted = acceptAttachments([png(1), png(2)]);

    expect(accepted.map((file) => file.ref)).toEqual(['att_1', 'att_2']);
    expect(accepted[0]!.bytes).toBeGreaterThan(1000);
    expect(accepted[0]!.bytes).toBeLessThan(1100); // decoded, not base64 length
  });

  it('enforces every documented default, with the documented codes', () => {
    const codeOf = (attachments: unknown[], policy?: unknown) => {
      try {
        acceptAttachments(attachments as any, policy as any);

        return 'accepted';
      } catch (error) {
        return error instanceof AttachmentError ? error.code : `unexpected:${error}`;
      }
    };

    expect(codeOf([png(1), png(1), png(1), png(1), png(1)])).toBe('too_many'); // maxFiles 4
    expect(codeOf([{ mediaType: 'text/html', data: 'AAAA' }])).toBe('bad_type');
    expect(codeOf([png(11 * 1024)])).toBe('too_big'); // maxFileBytes 10 MB
    expect(codeOf([png(8 * 1024), png(8 * 1024)])).toBe('request_too_big'); // maxRequestBytes 15 MB
    expect(codeOf([{ mediaType: 'application/pdf', data: 'AAAA' }])).toBe('accepted');
  });

  it('takes a narrower policy when the app wants one', () => {
    expect(() => acceptAttachments([png(1)], { allowedTypes: ['application/pdf'] } as any)).toThrow(AttachmentError);
    expect(acceptAttachments([png(1)], { maxFiles: 1 } as any)).toHaveLength(1);
  });
});
