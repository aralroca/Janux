import { buildDefault, coerceForm, component, createBus, createInstance, int, intent, jsx, list, obj, renderToString, resolveGuard, schema, str, validate } from 'janux';
import { hashKey, QueryClient } from 'janux/query';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Chaos of the second kind: long, RANDOM sequences of operations, checked
 * against invariants rather than against a hand-written expected value.
 *
 * `users.cases.ts` encodes situations a person creates. These encode the ones
 * nobody would think to write down — the 137th interleaving of add, remove,
 * invalidate and unsubscribe — where the bug is never in one operation but in
 * the order two of them landed. What is asserted is a property that must hold
 * for EVERY sequence ("no write is lost", "versions never go backwards", "an
 * entry is collected only when nobody is watching"), and the sequence itself is
 * printed only as a fingerprint, so a failure is reproducible.
 *
 * Seeded, always. `Math.random()` would make a red run unreproducible and a
 * green one meaningless — the whole point is that this exact sequence ran.
 */

/** mulberry32: 32 bits of state, uniform enough, and identical on every machine. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);

    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(random: () => number, values: readonly T[]): T => values[Math.floor(random() * values.length)]!;
const upto = (random: () => number, bound: number): number => Math.floor(random() * bound);

const cart = component({
  name: 'chaos-cart',
  description: 'Cart',
  state: schema({ items: list(obj({ sku: str(), qty: int() })), note: str().default(''), total: int().default(0) }),
  intents: {
    add: intent({
      description: 'Add',
      input: schema({ sku: str(), qty: int().default(1) }),
      run: ({ state, input }) => state.items.push(input as never),
    }),
    removeAt: intent({
      description: 'Remove',
      input: schema({ index: int() }),
      run: ({ state, input }) => state.items.splice((input as { index: number }).index, 1),
    }),
    setNote: intent({
      description: 'Note',
      input: schema({ note: str() }),
      run: ({ state, input }) => (state.note = (input as { note: string }).note),
    }),
    bump: intent({ description: 'Bump', input: schema({ by: int() }), run: ({ state, input }) => (state.total += (input as { by: number }).by) }),
    checkout: intent({ description: 'Pay', guard: 'confirm', run: ({ state }) => `paid ${state.items.length}` }),
  },
  emits: { tick: schema({ at: str() }) },
  view: (bag) => jsx('p', { children: (bag.state as { note: string }).note }),
});

const fresh = () => createInstance(cart, {} as never);

/** A query client on a clock the case owns, so nothing depends on wall time. */
function clocked(start = 1000): { client: QueryClient; advance: (ms: number) => void } {
  let now = start;

  return { client: new QueryClient(() => now), advance: (ms: number) => (now += ms) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

export const CHAOS_SEQUENCE_CASES: ScenarioCase[] = [
  // ── state: no write is ever lost ────────────────────────────────────────────
  {
    id: 'chaos2-two-hundred-seeded-adds-and-removes-leave-exactly-what-was-kept',
    src: 'janux',
    run: async (log) => {
      const random = seeded(1);
      const instance = fresh();
      let model = 0;

      for (let step = 0; step < 200; step += 1) {
        if (model > 0 && random() < 0.4) {
          await instance.intents.removeAt!({ index: upto(random, model) }, { origin: 'human' });
          model -= 1;
        } else {
          await instance.intents.add!({ sku: `s${step}` }, { origin: 'human' });
          model += 1;
        }
      }
      log.push(`items=${instance.state.items.length}`, `model=${model}`);
    },
    expected: ['items=26', 'model=26'],
  },
  {
    id: 'chaos2-a-seeded-sequence-of-list-edits-matches-a-plain-array-model',
    src: 'janux',
    run: async (log) => {
      // Model-based: every operation is applied to island state AND to a plain
      // array, and the two must agree at every single step, not just at the end.
      const random = seeded(7);
      const instance = fresh();
      const model: { sku: string; qty: number }[] = [];
      let diverged = '';

      for (let step = 0; step < 120 && !diverged; step += 1) {
        if (model.length > 0 && random() < 0.35) {
          const index = upto(random, model.length);

          await instance.intents.removeAt!({ index }, { origin: 'human' });
          model.splice(index, 1);
        } else {
          const item = { sku: `s${step}`, qty: 1 + upto(random, 5) };

          await instance.intents.add!(item, { origin: 'human' });
          model.push(item);
        }
        if (JSON.stringify(instance.state.items) !== JSON.stringify(model)) diverged = `step ${step}`;
      }
      log.push(diverged || 'identical', `length=${model.length}`);
    },
    expected: ['identical', 'length=42'],
  },
  {
    id: 'chaos2-a-seeded-burst-of-concurrent-bumps-sums-to-the-same-total',
    src: 'janux',
    run: async (log) => {
      const random = seeded(11);
      const instance = fresh();
      const amounts = Array.from({ length: 150 }, () => 1 + upto(random, 9));

      await Promise.all(amounts.map((by) => instance.intents.bump!({ by }, { origin: 'human' })));
      log.push(`total=${instance.state.total}`, `sum=${amounts.reduce((a, b) => a + b, 0)}`);
    },
    expected: ['total=748', 'sum=748'],
  },
  {
    id: 'chaos2-interleaving-adds-and-bumps-concurrently-loses-neither',
    src: 'janux',
    run: async (log) => {
      const random = seeded(13);
      const instance = fresh();
      const calls = Array.from({ length: 100 }, (_, step) =>
        random() < 0.5
          ? instance.intents.add!({ sku: `s${step}` }, { origin: 'human' }).then(() => 'add')
          : instance.intents.bump!({ by: 1 }, { origin: 'human' }).then(() => 'bump'),
      );
      const kinds = await Promise.all(calls);

      log.push(
        `items=${instance.state.items.length}`,
        `adds=${kinds.filter((kind) => kind === 'add').length}`,
        `total=${instance.state.total}`,
        `bumps=${kinds.filter((kind) => kind === 'bump').length}`,
      );
    },
    expected: ['items=59', 'adds=59', 'total=41', 'bumps=41'],
  },
  {
    id: 'chaos2-the-last-of-many-seeded-writes-to-one-field-is-the-one-that-stands',
    src: 'janux',
    run: async (log) => {
      const random = seeded(17);
      const instance = fresh();
      let last = '';

      for (let step = 0; step < 100; step += 1) {
        last = `note-${upto(random, 1000)}`;
        await instance.intents.setNote!({ note: last }, { origin: 'human' });
      }
      log.push(`state=${instance.state.note === last}`, `snapshot=${instance.snapshot().note === last}`);
    },
    expected: ['state=true', 'snapshot=true'],
  },
  {
    id: 'chaos2-a-snapshot-taken-after-every-seeded-op-always-mirrors-the-state',
    src: 'janux',
    run: async (log) => {
      const random = seeded(19);
      const instance = fresh();
      let drift = '';

      for (let step = 0; step < 80 && !drift; step += 1) {
        const action = pick(random, ['add', 'note', 'bump'] as const);

        if (action === 'add') await instance.intents.add!({ sku: `s${step}` }, { origin: 'human' });
        if (action === 'note') await instance.intents.setNote!({ note: `n${step}` }, { origin: 'human' });
        if (action === 'bump') await instance.intents.bump!({ by: 1 }, { origin: 'human' });
        const snapshot = instance.snapshot();

        if (JSON.stringify(snapshot.items) !== JSON.stringify(instance.state.items)) drift = `items @${step}`;
        if (snapshot.note !== instance.state.note) drift = `note @${step}`;
        if (snapshot.total !== instance.state.total) drift = `total @${step}`;
      }
      log.push(drift || 'mirrored');
    },
    expected: ['mirrored'],
  },
  {
    id: 'chaos2-every-intermediate-state-of-a-seeded-run-round-trips-through-json',
    src: 'janux',
    run: async (log) => {
      const random = seeded(23);
      const instance = fresh();
      const alphabet = ['a', 'ñ', '🎉', '"', '\\', '\n', '<', '&'];
      let broken = '';

      for (let step = 0; step < 60 && !broken; step += 1) {
        const note = Array.from({ length: 1 + upto(random, 6) }, () => pick(random, alphabet)).join('');

        await instance.intents.setNote!({ note }, { origin: 'human' });
        const revived = JSON.parse(JSON.stringify(instance.snapshot()));

        if (revived.note !== note) broken = `step ${step}`;
      }
      log.push(broken || 'round-tripped');
    },
    expected: ['round-tripped'],
  },
  {
    id: 'chaos2-a-seeded-run-never-lets-a-note-reach-the-html-unescaped',
    src: 'janux',
    run: async (log) => {
      const random = seeded(29);
      const instance = fresh();
      const fragments = ['<script>', '"onload="', '</p>', '&amp;', "'", '<img src=x>'];
      let leaked = '';

      for (let step = 0; step < 40 && !leaked; step += 1) {
        const note = Array.from({ length: 1 + upto(random, 3) }, () => pick(random, fragments)).join('');

        await instance.intents.setNote!({ note }, { origin: 'human' });
        const { html } = await renderToString(jsx('p', { title: instance.state.note, children: instance.state.note }));

        if (/<(script|img)/i.test(html)) leaked = `step ${step}`;
      }
      log.push(leaked || 'escaped');
    },
    expected: ['escaped'],
  },
  {
    id: 'chaos2-invalid-inputs-in-a-seeded-stream-are-all-refused-and-never-half-applied',
    src: 'janux',
    run: async (log) => {
      // The property is totality: every input either applies completely or is
      // rejected — there is no third outcome where state moved anyway.
      const random = seeded(31);
      const instance = fresh();
      let applied = 0;
      let refused = 0;

      for (let step = 0; step < 80; step += 1) {
        const valid = random() < 0.5;
        const qty = valid ? 1 + upto(random, 3) : 1.5;
        const before = instance.state.items.length;

        try {
          await instance.intents.add!({ sku: `s${step}`, qty }, { origin: 'human' });
          applied += 1;
        } catch {
          refused += 1;
          if (instance.state.items.length !== before) log.push(`half-applied at ${step}`);
        }
      }
      log.push(`applied=${applied}`, `refused=${refused}`, `items=${instance.state.items.length}`);
    },
    expected: ['applied=36', 'refused=44', 'items=36'],
  },
  {
    id: 'chaos2-a-seeded-run-against-two-instances-never-crosses-between-them',
    src: 'janux',
    run: async (log) => {
      const random = seeded(37);
      const left = fresh();
      const right = fresh();
      let leftCount = 0;

      for (let step = 0; step < 100; step += 1) {
        const target = random() < 0.5 ? left : right;

        if (target === left) leftCount += 1;
        await target.intents.add!({ sku: `s${step}` }, { origin: 'human' });
      }
      log.push(`left=${left.state.items.length}`, `expectedLeft=${leftCount}`, `right=${right.state.items.length}`);
    },
    expected: ['left=55', 'expectedLeft=55', 'right=45'],
  },
  {
    id: 'chaos2-a-disposed-instance-still-accepts-writes-instead-of-sealing-itself',
    src: 'janux',
    run: async (log) => {
      const random = seeded(41);
      const instance = fresh();

      for (let step = 0; step < 30; step += 1) await instance.intents.add!({ sku: `s${step}` }, { origin: 'human' });
      const atDispose = instance.state.items.length;

      await instance.dispose();
      // Dispose stops what the instance RUNS (effects, sources, subscriptions);
      // it does not seal the object. A seeded burst of late calls — the racing
      // click that lands after a navigation — therefore still applies, quietly.
      // Recorded as it is, not as it ought to be.
      for (let step = 0; step < 20; step += 1) {
        await attempt([], 'add', () => instance.intents.add!({ sku: `x${upto(random, 9)}` }, { origin: 'human' }));
      }
      log.push(`before=${atDispose}`, `after=${instance.state.items.length}`);
    },
    expected: ['before=30', 'after=50'],
  },
  {
    id: 'chaos2-a-seeded-mix-of-human-and-agent-calls-only-lets-humans-through-the-guard',
    src: 'janux',
    run: async (log) => {
      const random = seeded(43);
      const proposals: { execute: () => Promise<unknown> }[] = [];
      const instance = createInstance(cart, { onProposal: (proposal: never) => proposals.push(proposal) } as never);
      let agentCalls = 0;
      let humanCalls = 0;

      await instance.intents.add!({ sku: 'a' }, { origin: 'human' });
      for (let step = 0; step < 50; step += 1) {
        const origin = random() < 0.5 ? 'agent' : 'human';

        if (origin === 'agent') agentCalls += 1;
        else humanCalls += 1;
        await instance.intents.checkout!(undefined, { origin });
      }
      log.push(`proposals=${proposals.length}`, `agentCalls=${agentCalls}`, `humanRan=${humanCalls}`);
    },
    expected: ['proposals=22', 'agentCalls=22', 'humanRan=28'],
  },
  {
    id: 'chaos2-approving-a-seeded-subset-of-proposals-runs-exactly-that-subset',
    src: 'janux',
    run: async (log) => {
      const random = seeded(47);
      const proposals: { execute: () => Promise<unknown> }[] = [];
      const instance = createInstance(cart, { onProposal: (proposal: never) => proposals.push(proposal) } as never);

      for (let step = 0; step < 30; step += 1) await instance.intents.checkout!(undefined, { origin: 'agent' });
      const approved = proposals.filter(() => random() < 0.5);
      const results = await Promise.all(approved.map((proposal) => proposal.execute()));

      log.push(`proposed=${proposals.length}`, `approved=${approved.length}`, `ran=${results.length}`);
    },
    expected: ['proposed=30', 'approved=11', 'ran=11'],
  },
  {
    id: 'chaos2-the-same-seed-replays-the-same-run-exactly',
    src: 'janux',
    run: async (log) => {
      // The property that makes every other case here worth anything: a failure
      // is reproducible, and a pass is not luck.
      const run = async () => {
        const random = seeded(53);
        const instance = fresh();
        const trace: string[] = [];

        for (let step = 0; step < 40; step += 1) {
          const action = pick(random, ['add', 'note', 'bump'] as const);

          if (action === 'add') await instance.intents.add!({ sku: `s${step}` }, { origin: 'human' });
          if (action === 'note') await instance.intents.setNote!({ note: `n${upto(random, 99)}` }, { origin: 'human' });
          if (action === 'bump') await instance.intents.bump!({ by: 1 + upto(random, 3) }, { origin: 'human' });
          trace.push(action);
        }

        return `${trace.join('')}|${JSON.stringify(instance.snapshot())}`;
      };

      log.push(String((await run()) === (await run())));
    },
    expected: ['true'],
  },
  {
    id: 'chaos2-different-seeds-really-do-explore-different-orders',
    src: 'janux',
    run: (log) => {
      const trace = (seed: number) => {
        const random = seeded(seed);

        return Array.from({ length: 40 }, () => pick(random, ['a', 'b', 'c'] as const)).join('');
      };

      log.push(String(trace(1) === trace(2)), String(new Set([trace(1), trace(2), trace(3), trace(4)]).size));
    },
    expected: ['false', '4'],
  },

  // ── the cache: versions only move forwards ─────────────────────────────────
  {
    id: 'chaos2-a-seeded-stream-of-writes-never-moves-a-query-version-backwards',
    src: 'janux',
    run: async (log) => {
      const random = seeded(59);
      const { client, advance } = clocked();
      const query = client.getQuery({ queryKey: ['k'], queryFn: async () => 'fetched' });
      let previous = -1;
      let regression = '';

      for (let step = 0; step < 100 && !regression; step += 1) {
        advance(1 + upto(random, 50));
        if (random() < 0.5) await query.fetch();
        else client.setQueryData(['k'], `set-${step}`);
        if (query.state.updatedAt < previous) regression = `step ${step}`;
        previous = query.state.updatedAt;
      }
      log.push(regression || 'monotonic', `status=${query.state.status}`);
    },
    expected: ['monotonic', 'status=success'],
  },
  {
    id: 'chaos2-the-last-write-of-a-seeded-stream-is-what-a-reader-sees',
    src: 'janux',
    run: async (log) => {
      const random = seeded(61);
      const { client, advance } = clocked();

      client.getQuery({ queryKey: ['k'], queryFn: async () => 'fetched' });
      let last = '';

      for (let step = 0; step < 80; step += 1) {
        advance(1 + upto(random, 10));
        last = `v${step}`;
        client.setQueryData(['k'], last);
      }
      log.push(`read=${client.getQueryData(['k'])}`, `last=${last}`);
    },
    expected: ['read=v79', 'last=v79'],
  },
  {
    id: 'chaos2-hydration-never-overwrites-data-the-client-fetched-more-recently',
    src: 'janux',
    run: async (log) => {
      const random = seeded(67);
      const { client, advance } = clocked();
      let clobbered = '';

      for (let step = 0; step < 60 && !clobbered; step += 1) {
        const key = [`k${step % 5}`];

        advance(10);
        client.getQuery({ queryKey: key, queryFn: async () => `client-${step}` });
        client.setQueryData(key, `client-${step}`);
        const stale = { status: 'success' as const, data: `server-${step}`, error: undefined, isFetching: false, updatedAt: 1 };

        // A payload chunk that describes an older read: hydration fills gaps, it
        // never moves data backwards.
        if (random() < 0.7) client.hydrate({ [JSON.stringify(key)]: stale });
        if (String(client.getQueryData(key)).startsWith('server')) clobbered = `step ${step}`;
      }
      log.push(clobbered || 'never-clobbered');
    },
    expected: ['never-clobbered'],
  },
  {
    id: 'chaos2-a-seeded-mix-of-failures-never-lets-an-error-erase-newer-data',
    src: 'janux',
    run: async (log) => {
      const random = seeded(71);
      const { client, advance } = clocked();
      let fails = 0;
      const query = client.getQuery({
        queryKey: ['k'],
        queryFn: async () => {
          if (random() < 0.4) {
            fails += 1;

            throw new Error('offline');
          }

          return 'ok';
        },
      });
      let erased = '';
      let succeeded = false;

      for (let step = 0; step < 60 && !erased; step += 1) {
        advance(5);
        await query.fetch().catch(() => undefined);
        // An error keeps the data that was there: a page showing a list does not
        // blank because one background revalidation failed.
        if (succeeded && query.state.data !== 'ok') erased = `step ${step}`;
        succeeded = succeeded || query.state.status === 'success';
      }
      log.push(erased || 'kept', `failed=${fails > 0}`, `endedWith=${query.state.data}`);
    },
    expected: ['kept', 'failed=true', 'endedWith=ok'],
  },
  {
    id: 'chaos2-concurrent-seeded-fetches-of-one-key-share-a-single-request',
    src: 'janux',
    run: async (log) => {
      const random = seeded(73);
      const { client } = clocked();
      let calls = 0;
      const query = client.getQuery({
        queryKey: ['k'],
        queryFn: async () => {
          calls += 1;
          await new Promise((resolve) => setTimeout(resolve, 1));

          return calls;
        },
      });

      await Promise.all(Array.from({ length: 1 + upto(random, 20) }, () => query.fetch()));
      log.push(`calls=${calls}`);
    },
    expected: ['calls=1'],
  },
  {
    id: 'chaos2-a-seeded-set-of-keys-never-contaminates-a-neighbour',
    src: 'janux',
    run: async (log) => {
      const random = seeded(79);
      const { client } = clocked();
      const keys = Array.from({ length: 12 }, (_, index) => ['user', index] as const);
      let crossed = '';

      keys.forEach((key) => client.getQuery({ queryKey: key, queryFn: async () => `u${key[1]}` }));
      for (let step = 0; step < 60 && !crossed; step += 1) {
        const key = pick(random, keys);

        client.setQueryData(key, `u${key[1]}-${step}`);
        const wrong = keys.filter((other) => other !== key && String(client.getQueryData(other)).endsWith(`-${step}`));

        if (wrong.length > 0) crossed = `step ${step}`;
      }
      log.push(crossed || 'partitioned');
    },
    expected: ['partitioned'],
  },
  {
    id: 'chaos2-a-seeded-prefix-invalidation-refetches-exactly-the-matching-keys',
    src: 'janux',
    run: async (log) => {
      const random = seeded(83);
      const { client } = clocked();
      const calls = new Map<string, number>();
      const keys = [['a', 1], ['a', 2], ['b', 1], ['b', 2], ['a', 1, 'deep']];

      keys.forEach((key) =>
        client
          .getQuery({
            queryKey: key,
            queryFn: async () => {
              calls.set(JSON.stringify(key), (calls.get(JSON.stringify(key)) ?? 0) + 1);

              return 'ok';
            },
          })
          .fetch(),
      );
      await Promise.resolve();
      for (let round = 0; round < 5; round += 1) {
        // Only `a` prefixes: whatever the seed picks, no `b` entry may move.
        await client.invalidateQueries(pick(random, [['a'], ['a', 1]]));
      }
      const touched = [...calls.entries()].filter(([, count]) => count > 1).map(([key]) => key);

      log.push(`touched=${touched.length}`, touched.some((key) => key.startsWith('["b"')) ? 'b-touched' : 'b-untouched');
    },
    expected: ['touched=3', 'b-untouched'],
  },
  {
    id: 'chaos2-a-seeded-tag-invalidation-touches-only-what-carries-the-tag',
    src: 'janux',
    run: async (log) => {
      const random = seeded(89);
      const { client } = clocked();
      const calls = new Map<string, number>();
      const entries = Array.from({ length: 10 }, (_, index) => ({
        key: ['item', index],
        tags: random() < 0.5 ? ['catalog'] : ['profile'],
      }));

      entries.forEach(({ key, tags }) =>
        client.getQuery({
          queryKey: key,
          tags,
          queryFn: async () => {
            calls.set(JSON.stringify(key), (calls.get(JSON.stringify(key)) ?? 0) + 1);

            return 'ok';
          },
        }),
      );
      await client.invalidateTag('catalog');
      const tagged = entries.filter(({ tags }) => tags.includes('catalog')).length;

      log.push(`fetched=${calls.size}`, `tagged=${tagged}`);
    },
    expected: ['fetched=4', 'tagged=4'],
  },

  // ── the cache: collected only when nobody is watching ──────────────────────
  {
    id: 'chaos2-a-seeded-subscribe-unsubscribe-dance-collects-only-unobserved-entries',
    src: 'janux',
    run: async (log) => {
      const random = seeded(97);
      const { client } = clocked();
      const keys = Array.from({ length: 8 }, (_, index) => ['gc', index]);
      const live = new Map<string, () => void>();

      keys.forEach((key) => {
        const query = client.getQuery({ queryKey: key, queryFn: async () => 'ok', gcTime: 0 });

        query.setData('ok');
        live.set(JSON.stringify(key), query.subscribe(() => undefined));
      });
      // Half of them let go, at random; the other half keep watching.
      const dropped = [...live.entries()].filter(() => random() < 0.5);

      dropped.forEach(([key, unsubscribe]) => {
        unsubscribe();
        live.delete(key);
      });
      await flush();
      const gone = keys.filter((key) => client.getQueryData(key) === undefined).length;

      log.push(`dropped=${dropped.length}`, `collected=${gone}`, `stillObserved=${live.size}`);
    },
    expected: ['dropped=4', 'collected=4', 'stillObserved=4'],
  },
  {
    id: 'chaos2-an-entry-observed-again-before-the-timer-fires-is-not-collected',
    src: 'janux',
    run: async (log) => {
      const random = seeded(101);
      const { client } = clocked();
      const query = client.getQuery({ queryKey: ['gc'], queryFn: async () => 'ok', gcTime: 0 });

      query.setData('ok');
      for (let step = 0; step < 20; step += 1) {
        const unsubscribe = query.subscribe(() => undefined);

        if (random() < 0.5) await flush();
        unsubscribe();
        // Re-subscribing before the timer fires must cancel the collection —
        // a component remounting across a navigation does exactly this.
        query.subscribe(() => undefined);
      }
      await flush();
      log.push(`data=${client.getQueryData(['gc'])}`);
    },
    expected: ['data=ok'],
  },
  {
    id: 'chaos2-a-collected-entry-comes-back-cold-rather-than-with-someone-elses-data',
    src: 'janux',
    run: async (log) => {
      const { client } = clocked();
      const first = client.getQuery({ queryKey: ['gc'], queryFn: async () => 'first', gcTime: 0 });

      first.setData('first');
      first.subscribe(() => undefined)();
      await flush();
      const second = client.getQuery({ queryKey: ['gc'], queryFn: async () => 'second', gcTime: 0 });

      log.push(`status=${second.state.status}`, `data=${second.state.data}`, `same=${first === second}`);
    },
    expected: ['status=pending', 'data=undefined', 'same=false'],
  },

  // ── the cache: freshness under a clock that moves ──────────────────────────
  {
    id: 'chaos2-freshness-never-returns-on-its-own-as-a-seeded-clock-advances',
    src: 'janux',
    run: async (log) => {
      const random = seeded(103);
      const { client, advance } = clocked();
      const query = client.getQuery({ queryKey: ['k'], queryFn: async () => 'ok', staleTime: 1000 });

      await query.fetch();
      let resurrected = '';
      let wasStale = false;

      for (let step = 0; step < 60 && !resurrected; step += 1) {
        advance(upto(random, 300));
        const stale = query.isStale();

        if (wasStale && !stale) resurrected = `step ${step}`;
        wasStale = wasStale || stale;
      }
      log.push(resurrected || 'never-resurrected', `endedStale=${query.isStale()}`);
    },
    expected: ['never-resurrected', 'endedStale=true'],
  },
  {
    id: 'chaos2-expired-data-is-withheld-and-comes-back-after-a-refetch',
    src: 'janux',
    run: async (log) => {
      const { client, advance } = clocked();
      const query = client.getQuery({ queryKey: ['k'], queryFn: async () => 'ok', staleTime: 100, swr: 200 });

      await query.fetch();
      advance(150);
      log.push(`inSwr=${query.visible().data}`);
      advance(200);
      log.push(`expired=${query.visible().data}`, `status=${query.visible().status}`);
      await query.fetch();
      log.push(`refetched=${query.visible().data}`);
    },
    expected: ['inSwr=ok', 'expired=undefined', 'status=pending', 'refetched=ok'],
  },
  {
    id: 'chaos2-settle-drains-a-seeded-waterfall-of-queries-started-by-each-other',
    src: 'janux',
    run: async (log) => {
      const random = seeded(107);
      const { client } = clocked();
      const depth = 3 + upto(random, 4);
      let started = 0;

      const chain = (level: number): void => {
        started += 1;
        client
          .getQuery({
            queryKey: ['level', level],
            queryFn: async () => {
              await new Promise((resolve) => setTimeout(resolve, 1));
              if (level < depth) chain(level + 1);

              return level;
            },
          })
          .fetch();
      };

      chain(0);
      await client.settle();
      log.push(`depth=${depth}`, `started=${started}`);
    },
    expected: ['depth=6', 'started=7'],
  },
  {
    id: 'chaos2-dehydrate-ships-only-what-the-client-can-actually-revive',
    src: 'janux',
    run: async (log) => {
      const random = seeded(109);
      const { client } = clocked();
      const values: unknown[] = [{ ok: true }, new Map(), () => undefined, [1, 2], new Date(), 'text'];

      values.forEach((value, index) => {
        const query = client.getQuery({ queryKey: ['v', index], queryFn: async () => value });

        query.setData(value);
      });
      // A shuffle proves the filter is about the VALUE, not about insertion order.
      values.sort(() => random() - 0.5);
      const shipped = Object.keys(client.dehydrate());

      log.push(`shipped=${shipped.length}`, shipped.sort().join(' '));
    },
    expected: ['shipped=3', '["v",0] ["v",3] ["v",5]'],
  },
  {
    id: 'chaos2-a-seeded-run-of-mutations-with-rollback-always-ends-consistent',
    src: 'janux',
    run: async (log) => {
      const random = seeded(113);
      const { client } = clocked();
      let committed = 0;
      let rolledBack = 0;

      for (let step = 0; step < 40; step += 1) {
        const fails = random() < 0.5;

        await client
          .mutate(
            {
              mutationFn: async () => {
                if (fails) throw new Error('rejected');

                return step;
              },
              onMutate: () => committed++,
              onError: () => {
                committed -= 1;
                rolledBack += 1;
              },
            },
            undefined,
          )
          .catch(() => undefined);
      }
      log.push(`committed=${committed}`, `rolledBack=${rolledBack}`, `total=${committed + rolledBack}`);
    },
    expected: ['committed=24', 'rolledBack=16', 'total=40'],
  },
  {
    id: 'chaos2-a-thousand-seeded-cache-operations-leave-no-entry-half-written',
    src: 'janux',
    run: async (log) => {
      const random = seeded(127);
      const { client, advance } = clocked();
      const keys = Array.from({ length: 6 }, (_, index) => ['k', index]);
      let broken = '';

      keys.forEach((key) => client.getQuery({ queryKey: key, queryFn: async () => `v${key[1]}` }));
      for (let step = 0; step < 1000 && !broken; step += 1) {
        const key = pick(random, keys);
        const query = client.getQuery({ queryKey: key, queryFn: async () => `v${key[1]}` });
        const action = pick(random, ['fetch', 'set', 'read', 'tick'] as const);

        if (action === 'fetch') await query.fetch().catch(() => undefined);
        if (action === 'set') query.setData(`s${step}`);
        if (action === 'tick') advance(1 + upto(random, 20));
        const { status, data, error } = query.state;

        // The invariant a partially-applied write would break: a successful
        // entry has data and no error, a pending one has neither.
        if (status === 'success' && (data === undefined || error !== undefined)) broken = `success @${step}`;
        if (status === 'pending' && data !== undefined) broken = `pending @${step}`;
      }
      log.push(broken || 'consistent');
    },
    expected: ['consistent'],
  },

  // ── keys, identity and isolation under a random load ───────────────────────
  {
    id: 'chaos2-a-key-hashes-the-same-however-its-object-fields-were-written',
    src: 'janux',
    run: (log) => {
      // Two islands building the same filter object in different orders must
      // land on ONE cache entry, or the page fetches everything twice.
      const random = seeded(131);
      const fields = ['page', 'sort', 'q', 'limit'] as const;
      let mismatch = '';

      for (let step = 0; step < 50 && !mismatch; step += 1) {
        const values = Object.fromEntries(fields.map((field) => [field, upto(random, 5)]));
        const shuffled = Object.fromEntries([...fields].sort(() => random() - 0.5).map((field) => [field, values[field]]));

        if (hashKey(['list', values]) !== hashKey(['list', shuffled])) mismatch = `step ${step}`;
      }
      log.push(mismatch || 'stable');
    },
    expected: ['stable'],
  },
  {
    id: 'chaos2-seeded-keys-that-differ-in-any-field-never-collide',
    src: 'janux',
    run: (log) => {
      const random = seeded(137);
      const keys = Array.from({ length: 300 }, () => ['q', upto(random, 40), { page: upto(random, 10) }]);
      const hashes = new Set(keys.map((key) => hashKey(key)));
      const distinct = new Set(keys.map((key) => JSON.stringify(key)));

      log.push(`keys=${distinct.size}`, `hashes=${hashes.size}`);
    },
    expected: ['keys=213', 'hashes=213'],
  },
  {
    id: 'chaos2-two-clients-under-the-same-seeded-load-never-see-each-others-entries',
    src: 'janux',
    run: async (log) => {
      const random = seeded(139);
      const left = clocked().client;
      const right = clocked().client;
      let crossed = '';

      for (let step = 0; step < 60 && !crossed; step += 1) {
        const key = ['k', upto(random, 5)];
        const target = random() < 0.5 ? left : right;
        const other = target === left ? right : left;

        target.getQuery({ queryKey: key, queryFn: async () => `v${step}` });
        target.setQueryData(key, `v${step}`);
        if (other.getQueryData(key) === `v${step}`) crossed = `step ${step}`;
      }
      log.push(crossed || 'isolated');
    },
    expected: ['isolated'],
  },
  {
    id: 'chaos2-a-seeded-dehydrate-hydrate-round-trip-lands-the-same-data',
    src: 'janux',
    run: async (log) => {
      const random = seeded(149);
      const source = clocked().client;
      const written = new Map<string, string>();

      for (let step = 0; step < 40; step += 1) {
        const key = ['k', upto(random, 8)];
        const value = `v${step}`;

        source.getQuery({ queryKey: key, queryFn: async () => value }).setData(value);
        written.set(JSON.stringify(key), value);
      }
      const target = clocked().client;

      target.hydrate(source.dehydrate());
      const wrong = [...written].filter(([key, value]) => target.getQueryData(JSON.parse(key)) !== value);

      log.push(`entries=${written.size}`, `wrong=${wrong.length}`);
    },
    expected: ['entries=8', 'wrong=0'],
  },
  {
    id: 'chaos2-a-seeded-stream-of-awaiting-and-release-never-leaves-an-entry-waiting',
    src: 'janux',
    run: async (log) => {
      const random = seeded(151);
      const { client } = clocked();
      const keys = Array.from({ length: 6 }, (_, index) => ['s', index]);
      let stuck = '';

      for (let step = 0; step < 60 && !stuck; step += 1) {
        const key = pick(random, keys);

        // The server says "this one is coming down the stream"; the response
        // then ends. Nothing may stay in the awaiting state afterwards, or an
        // observer waits for a chunk that will never arrive.
        client.expect([JSON.stringify(key)]);
        if (random() < 0.8) client.hydrate({ [JSON.stringify(key)]: { status: 'success', data: step, error: undefined, isFetching: false, updatedAt: step } });
        else client.releaseExpected();
      }
      client.releaseExpected();
      const query = client.getQuery({ queryKey: keys[0]!, queryFn: async () => 0 });

      if (query.awaiting) stuck = 'awaiting';
      log.push(stuck || 'released');
    },
    expected: ['released'],
  },
  {
    id: 'chaos2-settle-gives-up-on-a-seeded-query-that-never-answers',
    src: 'janux',
    run: async (log) => {
      const { client } = clocked();

      client.getQuery({ queryKey: ['never'], queryFn: () => new Promise<number>(() => undefined) }).fetch();
      const started = Date.now();

      // Bounded twice over: an SSR response must not hang on one bad `queryFn`.
      await client.settle({ timeoutMs: 30 });
      log.push(`bounded=${Date.now() - started < 2000}`);
    },
    expected: ['bounded=true'],
  },
  {
    id: 'chaos2-a-seeded-run-of-audited-intents-records-every-one-of-them',
    src: 'janux',
    run: async (log) => {
      const random = seeded(157);
      const audit: string[] = [];
      const instance = createInstance(cart, { onAudit: (entry: { intent: string }) => audit.push(entry.intent) } as never);
      let calls = 0;

      for (let step = 0; step < 60; step += 1) {
        const action = pick(random, ['add', 'bump'] as const);

        calls += 1;
        if (action === 'add') await instance.intents.add!({ sku: `s${step}` }, { origin: 'human' });
        else await instance.intents.bump!({ by: 1 }, { origin: 'human' });
      }
      log.push(`calls=${calls}`, `audited=${audit.length}`);
    },
    expected: ['calls=60', 'audited=60'],
  },
  {
    id: 'chaos2-a-seeded-run-keeps-the-resource-view-in-step-with-the-state',
    src: 'janux',
    run: async (log) => {
      // The agent surface is derived, not stored: whatever a random run does to
      // state, what an agent reads must describe the same instance.
      const random = seeded(163);
      const instance = fresh();
      let drift = '';

      for (let step = 0; step < 50 && !drift; step += 1) {
        if (random() < 0.5) await instance.intents.add!({ sku: `s${step}` }, { origin: 'human' });
        else await instance.intents.setNote!({ note: `n${step}` }, { origin: 'human' });
        const resource = instance.resource() as { state?: Record<string, unknown> };

        if (JSON.stringify(resource.state ?? resource) !== JSON.stringify(instance.snapshot())) drift = `step ${step}`;
      }
      log.push(drift || 'in-step');
    },
    expected: ['in-step'],
  },
  {
    id: 'chaos2-a-seeded-run-of-emits-arrives-in-the-order-it-was-sent',
    src: 'janux',
    run: async (log) => {
      const random = seeded(167);
      const seen: string[] = [];
      const bus = createBus();
      const instance = createInstance(cart, { bus } as never);

      bus.on('tick', (payload: unknown) => seen.push(String((payload as { at: string }).at)));
      const sent = Array.from({ length: 50 }, () => `t${upto(random, 999)}`);

      sent.forEach((at) => instance.emit('tick', { at }));
      await instance.settled();
      log.push(`sent=${sent.length}`, `order=${seen.join(',') === sent.join(',')}`);
    },
    expected: ['sent=50', 'order=true'],
  },
  {
    id: 'chaos2-a-seeded-mix-of-valid-and-invalid-notes-never-corrupts-the-snapshot',
    src: 'janux',
    run: async (log) => {
      const random = seeded(173);
      const instance = fresh();
      let broken = '';

      for (let step = 0; step < 60 && !broken; step += 1) {
        const valid = random() < 0.5;

        await attempt([], 'set', () => instance.intents.setNote!({ note: valid ? `n${step}` : (step as never) }, { origin: 'human' }));
        if (typeof instance.snapshot().note !== 'string') broken = `step ${step}`;
      }
      log.push(broken || 'typed');
    },
    expected: ['typed'],
  },

  // ── the schema layer under a random load ───────────────────────────────────
  {
    id: 'chaos2-seeded-form-strings-coerce-into-the-declared-types-or-are-refused',
    src: 'janux',
    run: (log) => {
      // Everything arriving from a form is a string; the property is that what
      // survives coercion is always the declared type, never a string that
      // looks like one.
      const random = seeded(179);
      const shape = schema({ qty: int(), sku: str() });
      let wrong = '';

      for (let step = 0; step < 80 && !wrong; step += 1) {
        const qty = pick(random, [String(upto(random, 99)), '1.5', 'abc', '', '-3']);
        const coerced = coerceForm({ qty, sku: `s${step}` }, shape);
        const result = validate(shape, coerced);

        if (result.ok && typeof (result.value as { qty: unknown }).qty !== 'number') wrong = `step ${step}`;
      }
      log.push(wrong || 'typed');
    },
    expected: ['typed'],
  },
  {
    id: 'chaos2-a-default-built-from-a-schema-always-validates-against-it',
    src: 'janux',
    run: (log) => {
      const random = seeded(181);
      let invalid = '';

      for (let step = 0; step < 40 && !invalid; step += 1) {
        const shape = schema({
          count: random() < 0.5 ? int().default(upto(random, 10)) : int(),
          label: str().default(`l${step}`),
          rows: list(obj({ sku: str(), qty: int() })),
        });

        if (!validate(shape, buildDefault(shape)).ok) invalid = `step ${step}`;
      }
      log.push(invalid || 'always-valid');
    },
    expected: ['always-valid'],
  },
  {
    id: 'chaos2-a-seeded-stream-of-patches-lands-whole-or-not-at-all',
    src: 'janux',
    run: (log) => {
      // `patch()` is the external-restore door (resume, rehydration): a partial
      // application would leave an island in a state its schema forbids.
      const random = seeded(191);
      const instance = fresh();
      let corrupt = '';

      for (let step = 0; step < 60 && !corrupt; step += 1) {
        const valid = random() < 0.5;

        attempt([], 'patch', () => instance.patch(valid ? { note: `n${step}` } : { note: step as never }));
        if (typeof instance.state.note !== 'string' || typeof instance.state.total !== 'number') corrupt = `step ${step}`;
      }
      log.push(corrupt || 'whole');
    },
    expected: ['whole'],
  },
  {
    id: 'chaos2-bound-inputs-survive-a-seeded-stream-of-partial-overrides',
    src: 'janux',
    run: async (log) => {
      const random = seeded(193);
      const instance = fresh();
      const bound = instance.intents.add!.with({ sku: 'bound' });
      let wrong = '';

      for (let step = 0; step < 40 && !wrong; step += 1) {
        const overrides = random() < 0.5 ? { qty: 1 + upto(random, 4) } : undefined;

        await bound(overrides, { origin: 'human' });
        const last = instance.state.items[instance.state.items.length - 1];

        if (last.sku !== 'bound') wrong = `step ${step}`;
      }
      log.push(wrong || 'bound-kept', `items=${instance.state.items.length}`);
    },
    expected: ['bound-kept', 'items=40'],
  },
  {
    id: 'chaos2-a-seeded-mix-of-origins-resolves-the-same-guard-the-same-way',
    src: 'janux',
    run: (log) => {
      const random = seeded(197);
      const decisions = new Set<string>();
      const guarded = { guard: 'confirm' as const, run: () => undefined };

      for (let step = 0; step < 60; step += 1) {
        const origin = random() < 0.5 ? 'agent' : 'human';

        decisions.add(`${origin}:${resolveGuard(guarded as never, {} as never, origin)}`);
      }
      // A DECLARED guard is a property of the intent, not of the caller: it
      // resolves to `confirm` however many times and for whichever origin it is
      // asked. (Only a guard FUNCTION may look at the origin.) That stability is
      // what makes an audit trail worth reading.
      log.push([...decisions].sort().join(' '));
    },
    expected: ['agent:confirm human:confirm'],
  },

  // ── long mixed runs across the whole runtime ───────────────────────────────
  {
    id: 'chaos2-five-hundred-mixed-operations-leave-state-and-cache-agreeing',
    src: 'janux',
    run: async (log) => {
      const random = seeded(199);
      const instance = fresh();
      const { client, advance } = clocked();
      let broken = '';

      for (let step = 0; step < 500 && !broken; step += 1) {
        const action = pick(random, ['add', 'note', 'fetch', 'set', 'invalidate', 'tick'] as const);
        const query = client.getQuery({ queryKey: ['items'], queryFn: async () => instance.state.items.length });

        if (action === 'add') await instance.intents.add!({ sku: `s${step}` }, { origin: 'human' });
        if (action === 'note') await instance.intents.setNote!({ note: `n${step}` }, { origin: 'human' });
        if (action === 'fetch') await query.fetch();
        if (action === 'set') client.setQueryData(['items'], instance.state.items.length);
        if (action === 'invalidate') await client.invalidateQueries(['items']);
        if (action === 'tick') advance(1 + upto(random, 30));
        const cached = client.getQueryData<number>(['items']);

        if (cached !== undefined && cached > instance.state.items.length) broken = `step ${step}`;
      }
      log.push(broken || 'agreeing', `items=${instance.state.items.length}`);
    },
    expected: ['agreeing', 'items=86'],
  },
  {
    id: 'chaos2-a-seeded-run-of-renders-never-shows-a-state-the-instance-never-had',
    src: 'janux',
    run: async (log) => {
      const random = seeded(211);
      const instance = fresh();
      const seen: string[] = [];
      let ghost = '';

      for (let step = 0; step < 40 && !ghost; step += 1) {
        await instance.intents.setNote!({ note: `n${upto(random, 999)}` }, { origin: 'human' });
        seen.push(instance.state.note);
        const { html } = await renderToString(jsx('p', { children: instance.state.note }));

        if (html !== `<p>${instance.state.note}</p>`) ghost = `step ${step}`;
      }
      log.push(ghost || 'faithful', `renders=${seen.length}`);
    },
    expected: ['faithful', 'renders=40'],
  },
  {
    id: 'chaos2-a-seeded-run-of-instances-disposes-without-leaking-into-the-next',
    src: 'janux',
    run: async (log) => {
      const random = seeded(223);
      let leaked = '';

      for (let round = 0; round < 30 && !leaked; round += 1) {
        const instance = fresh();

        for (let step = 0; step < 1 + upto(random, 5); step += 1) {
          await instance.intents.add!({ sku: `s${step}` }, { origin: 'human' });
        }
        await instance.dispose();
        const next = fresh();

        if (next.state.items.length !== 0 || next.state.note !== '') leaked = `round ${round}`;
      }
      log.push(leaked || 'clean');
    },
    expected: ['clean'],
  },
  {
    id: 'chaos2-a-seeded-run-of-keyed-instances-keeps-one-uri-per-key',
    src: 'janux',
    run: (log) => {
      const random = seeded(227);
      const uris = new Set<string>();
      const keys = new Set<string>();

      for (let step = 0; step < 60; step += 1) {
        const key = `k${upto(random, 12)}`;

        keys.add(key);
        uris.add(createInstance(cart, { key } as never).uri);
      }
      log.push(`keys=${keys.size}`, `uris=${uris.size}`);
    },
    expected: ['keys=12', 'uris=12'],
  },
];
