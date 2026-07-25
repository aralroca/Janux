import { createMemory, createMemoryCounterStore, createMemoryStorage, createRateLimiter } from '@janux/agent';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Rate limiting and conversational memory.
 *
 * The limiter fails *open* on purpose — an outage must not take the agent down —
 * so the rows below pin both halves of that trade: it counts correctly when the
 * store works, and it lets traffic through when the store does not. Memory's
 * interesting case is ownership: a thread id from one caller must not open another
 * caller's history.
 */

/** A limiter over a clock the scenario advances by hand. */
function limiter(config: { limit: number; windowMs: number; globalLimit?: number }) {
  let now = 0;
  const store = createMemoryCounterStore(() => now);

  return {
    limiter: createRateLimiter({ ...config, store }),
    tick: (ms: number) => {
      now += ms;
    },
  };
}

async function verdicts(allow: (id: string) => Promise<boolean>, identity: string, times: number): Promise<string> {
  const results: boolean[] = [];

  for (let index = 0; index < times; index += 1) results.push(await allow(identity));

  return results.map((ok) => (ok ? 'y' : 'n')).join('');
}

function memory(lastMessages?: number) {
  let now = 1_000;

  return createMemory({
    storage: createMemoryStorage(),
    lastMessages,
    now: () => (now += 1),
  });
}

export const LIMIT_CASES: ScenarioCase[] = [
  // ── rate limiting ───────────────────────────────────────────────────────────
  {
    id: 'limit-allows-up-to-the-limit-then-refuses',
    src: 'mastra:rate-limit#window',
    run: async (log) => {
      const { limiter: rl } = limiter({ limit: 3, windowMs: 1000 });

      log.push(await verdicts((id) => rl.allow(id), 'a', 5));
    },
    expected: ['yyynn'],
  },
  {
    id: 'limit-a-new-window-resets-the-count',
    src: 'mastra:rate-limit#window-reset',
    run: async (log) => {
      const { limiter: rl, tick } = limiter({ limit: 2, windowMs: 1000 });

      log.push(await verdicts((id) => rl.allow(id), 'a', 3));
      tick(1000);
      log.push(await verdicts((id) => rl.allow(id), 'a', 2));
    },
    expected: ['yyn', 'yy'],
  },
  {
    id: 'limit-the-window-does-not-reset-one-tick-early',
    src: 'janux',
    run: async (log) => {
      const { limiter: rl, tick } = limiter({ limit: 1, windowMs: 1000 });

      log.push(await verdicts((id) => rl.allow(id), 'a', 1));
      tick(999);
      log.push(await verdicts((id) => rl.allow(id), 'a', 1));
    },
    expected: ['y', 'n'],
  },
  {
    id: 'limit-identities-are-counted-separately',
    src: 'mastra:rate-limit#per-identity',
    run: async (log) => {
      const { limiter: rl } = limiter({ limit: 1, windowMs: 1000 });

      log.push(await verdicts((id) => rl.allow(id), 'a', 2));
      log.push(await verdicts((id) => rl.allow(id), 'b', 2));
    },
    expected: ['yn', 'yn'],
  },
  {
    id: 'limit-a-global-breaker-trips-across-identities',
    src: 'mastra:rate-limit#global',
    run: async (log) => {
      const { limiter: rl } = limiter({ limit: 10, windowMs: 1000, globalLimit: 2 });

      log.push(`${await rl.allow('a')}`, `${await rl.allow('b')}`, `${await rl.allow('c')}`);
    },
    expected: ['true', 'true', 'false'],
  },
  {
    id: 'limit-without-a-global-breaker-only-the-per-identity-limit-applies',
    src: 'janux',
    run: async (log) => {
      const { limiter: rl } = limiter({ limit: 1, windowMs: 1000 });

      log.push(`${await rl.allow('a')}`, `${await rl.allow('b')}`, `${await rl.allow('c')}`);
    },
    expected: ['true', 'true', 'true'],
  },
  {
    id: 'limit-a-limit-of-zero-refuses-everything',
    src: 'janux',
    run: async (log) => {
      const { limiter: rl } = limiter({ limit: 0, windowMs: 1000 });

      log.push(await verdicts((id) => rl.allow(id), 'a', 2));
    },
    expected: ['nn'],
  },
  {
    id: 'limit-fails-open-when-the-store-throws',
    src: 'janux',
    run: async (log) => {
      const rl = createRateLimiter({
        limit: 1,
        windowMs: 1000,
        store: {
          incr() {
            throw new Error('redis down');
          },
        },
      });

      log.push(await verdicts((id) => rl.allow(id), 'a', 3));
    },
    expected: ['yyy'],
  },
  {
    id: 'limit-fails-open-when-the-store-rejects',
    src: 'janux',
    run: async (log) => {
      const rl = createRateLimiter({
        limit: 1,
        windowMs: 1000,
        store: { incr: async () => Promise.reject(new Error('timeout')) },
      });

      log.push(await verdicts((id) => rl.allow(id), 'a', 2));
    },
    expected: ['yy'],
  },
  {
    id: 'limit-the-counter-store-scopes-windows-per-key',
    src: 'janux',
    run: (log) => {
      let now = 0;
      const store = createMemoryCounterStore(() => now);

      log.push(`${store.incr('a', 100)}${store.incr('a', 100)}${store.incr('b', 100)}`);
      now += 100;
      log.push(`${store.incr('a', 100)}`);
    },
    expected: ['121', '1'],
  },

  // ── memory: threads and history ─────────────────────────────────────────────
  {
    id: 'memory-creates-a-thread-with-a-placeholder-title',
    src: 'mastra:memory#thread',
    run: async (log) => {
      const thread = await memory().ensureThread(undefined, 'user-1');

      log.push(`${thread.resourceId} ${thread.title}`);
    },
    expected: ['user-1 New conversation'],
  },
  {
    id: 'memory-reuses-an-existing-thread',
    src: 'mastra:memory#thread-reuse',
    run: async (log) => {
      const mem = memory();
      const first = await mem.ensureThread(undefined, 'user-1');
      const again = await mem.ensureThread(first.id, 'user-1');

      log.push(`same=${first.id === again.id}`);
    },
    expected: ['same=true'],
  },
  {
    id: 'memory-refuses-a-thread-belonging-to-someone-else',
    src: 'janux',
    run: async (log) => {
      const mem = memory();
      const mine = await mem.ensureThread(undefined, 'user-1');

      await attempt(log, 'steal', () => mem.ensureThread(mine.id, 'user-2'));
    },
    expected: ['steal:threw:thread_forbidden'],
  },
  {
    id: 'memory-an-unknown-thread-id-becomes-the-callers-own-thread',
    src: 'janux',
    run: async (log) => {
      const thread = await memory().ensureThread('chosen-id', 'user-1');

      log.push(`${thread.id} ${thread.resourceId}`);
    },
    expected: ['chosen-id user-1'],
  },
  {
    id: 'memory-history-is-oldest-first',
    src: 'mastra:memory#history-order',
    run: async (log) => {
      const mem = memory();
      const thread = await mem.ensureThread(undefined, 'user-1');

      await mem.remember(thread, 'user', 'one');
      await mem.remember(thread, 'assistant', 'two');
      await mem.remember(thread, 'user', 'three');
      log.push((await mem.history(thread.id)).map((message) => String(message.content)).join(','));
    },
    expected: ['one,two,three'],
  },
  {
    id: 'memory-history-is-bounded-to-the-newest-messages',
    src: 'mastra:memory#history-window',
    run: async (log) => {
      const mem = memory(2);
      const thread = await mem.ensureThread(undefined, 'user-1');

      for (const text of ['a', 'b', 'c', 'd']) await mem.remember(thread, 'user', text);
      log.push((await mem.history(thread.id)).map((message) => String(message.content)).join(','));
    },
    expected: ['c,d'],
  },
  {
    id: 'memory-history-of-an-unknown-thread-is-empty',
    src: 'janux',
    run: async (log) => {
      log.push(String((await memory().history('nope')).length));
    },
    expected: ['0'],
  },
  {
    id: 'memory-history-does-not-leak-across-threads',
    src: 'janux',
    run: async (log) => {
      const mem = memory();
      const one = await mem.ensureThread(undefined, 'user-1');
      const two = await mem.ensureThread(undefined, 'user-2');

      await mem.remember(one, 'user', 'private');
      log.push(String((await mem.history(two.id)).length));
    },
    expected: ['0'],
  },
  {
    id: 'memory-the-first-user-message-titles-the-thread',
    src: 'mastra:memory#title',
    run: async (log) => {
      const mem = createMemory({
        storage: createMemoryStorage(),
        generateTitle: (first) => `Re: ${first}`,
      });
      const thread = await mem.ensureThread(undefined, 'user-1');

      await mem.remember(thread, 'user', 'hello there');
      log.push(thread.title);
    },
    expected: ['Re: hello there'],
  },
  {
    id: 'memory-a-later-message-does-not-retitle-the-thread',
    src: 'janux',
    run: async (log) => {
      const mem = createMemory({ storage: createMemoryStorage(), generateTitle: (first) => `Re: ${first}` });
      const thread = await mem.ensureThread(undefined, 'user-1');

      await mem.remember(thread, 'user', 'first');
      await mem.remember(thread, 'user', 'second');
      log.push(thread.title);
    },
    expected: ['Re: first'],
  },
  {
    id: 'memory-an-assistant-message-never-titles-the-thread',
    src: 'janux',
    run: async (log) => {
      const mem = createMemory({ storage: createMemoryStorage(), generateTitle: (first) => `Re: ${first}` });
      const thread = await mem.ensureThread(undefined, 'user-1');

      await mem.remember(thread, 'assistant', 'unsolicited');
      log.push(thread.title);
    },
    expected: ['New conversation'],
  },
  {
    id: 'memory-without-a-title-generator-the-placeholder-stays',
    src: 'janux',
    run: async (log) => {
      const mem = memory();
      const thread = await mem.ensureThread(undefined, 'user-1');

      await mem.remember(thread, 'user', 'hello');
      log.push(thread.title);
    },
    expected: ['New conversation'],
  },
  {
    id: 'memory-lists-only-the-owners-threads',
    src: 'janux',
    run: async (log) => {
      const mem = memory();

      await mem.ensureThread(undefined, 'user-1');
      await mem.ensureThread(undefined, 'user-1');
      await mem.ensureThread(undefined, 'user-2');
      log.push(`one=${(await mem.listThreads('user-1')).length}`, `two=${(await mem.listThreads('user-2')).length}`);
    },
    expected: ['one=2', 'two=1'],
  },
  {
    id: 'memory-deleting-a-thread-removes-it',
    src: 'janux',
    run: async (log) => {
      const mem = memory();
      const thread = await mem.ensureThread(undefined, 'user-1');

      await mem.deleteThread(thread.id);
      log.push(`thread=${String(await mem.getThread(thread.id))}`, `history=${(await mem.history(thread.id)).length}`);
    },
    expected: ['thread=undefined', 'history=0'],
  },
];
