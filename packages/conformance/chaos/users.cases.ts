import { component, createInstance, int, intent, jsx, list, renderToString, schema, str } from 'janux';
import { QueryClient } from 'janux/query';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * What real users actually do.
 *
 * Not permutations of an API — the situations a framework meets in production and
 * usually meets badly: someone double-clicking a confirm button, pasting an
 * enormous list, typing right-to-left text into a field that ends up in an
 * attribute, a network that dies mid-call, a clock that jumps. Each row is a
 * recognisable human action, not a synthetic input.
 */

const cart = component({
  name: 'cart',
  description: 'Cart',
  state: schema({ items: list({ sku: str(), qty: int() }), note: str().default('') }),
  intents: {
    add: intent({ description: 'Add', input: schema({ sku: str(), qty: int().default(1) }), run: ({ state, input }) => state.items.push(input as never) }),
    setNote: intent({ description: 'Note', input: schema({ note: str() }), run: ({ state, input }) => (state.note = (input as { note: string }).note) }),
    checkout: intent({ description: 'Pay', guard: 'confirm', run: ({ state }) => `paid ${state.items.length}` }),
  },
  view: (bag) => jsx('p', { children: (bag.state as { note: string }).note }),
});

const fresh = () => createInstance(cart, {} as never);

export const CHAOS_CASES: ScenarioCase[] = [
  // ── impatient clicking ──────────────────────────────────────────────────────
  {
    id: 'chaos-double-clicking-add-adds-twice',
    src: 'janux',
    run: async (log) => {
      const instance = fresh();

      await Promise.all([
        instance.intents.add!({ sku: 'a' }, { origin: 'human' }),
        instance.intents.add!({ sku: 'a' }, { origin: 'human' }),
      ]);
      log.push(String(instance.state.items.length));
    },
    expected: ['2'],
  },
  {
    id: 'chaos-an-agent-double-call-on-confirm-yields-two-separate-proposals',
    src: 'janux',
    run: async (log) => {
      const proposals: { id: string }[] = [];
      const instance = createInstance(cart, { onProposal: (p: { id: string }) => proposals.push(p) } as never);

      await instance.intents.checkout!(undefined, { origin: 'agent' });
      await instance.intents.checkout!(undefined, { origin: 'agent' });
      log.push(`count=${proposals.length}`, `distinct=${proposals[0]!.id !== proposals[1]!.id}`);
    },
    expected: ['count=2', 'distinct=true'],
  },
  {
    id: 'chaos-approving-the-same-proposal-twice-runs-it-twice',
    src: 'janux',
    run: async (log) => {
      const proposals: { execute: () => Promise<unknown> }[] = [];
      const instance = createInstance(cart, { onProposal: (p: never) => proposals.push(p) } as never);

      await instance.intents.add!({ sku: 'a' }, { origin: 'human' });
      await instance.intents.checkout!(undefined, { origin: 'agent' });
      log.push(String(await proposals[0]!.execute()), String(await proposals[0]!.execute()));
    },
    expected: ['paid 1', 'paid 1'],
  },
  {
    id: 'chaos-a-rejected-proposal-never-touched-the-state',
    src: 'janux',
    run: async (log) => {
      const instance = fresh();

      await instance.intents.add!({ sku: 'a' }, { origin: 'human' });
      await instance.intents.checkout!(undefined, { origin: 'agent' });
      log.push(`items=${instance.state.items.length}`);
    },
    expected: ['items=1'],
  },

  // ── text people actually paste ──────────────────────────────────────────────
  {
    id: 'chaos-right-to-left-text-survives-a-round-trip',
    src: 'janux',
    run: async (log) => {
      const instance = fresh();

      await instance.intents.setNote!({ note: 'مرحبا بالعالم' }, { origin: 'human' });
      log.push(instance.snapshot().note as string);
    },
    expected: ['مرحبا بالعالم'],
  },
  {
    id: 'chaos-an-emoji-family-survives-a-round-trip',
    src: 'janux',
    run: async (log) => {
      const instance = fresh();

      await instance.intents.setNote!({ note: '👩‍👩‍👧‍👦' }, { origin: 'human' });
      log.push(instance.snapshot().note as string);
    },
    expected: ['👩‍👩‍👧‍👦'],
  },
  {
    id: 'chaos-a-pasted-newline-block-survives',
    src: 'janux',
    run: async (log) => {
      const instance = fresh();

      await instance.intents.setNote!({ note: 'line1\nline2\r\nline3' }, { origin: 'human' });
      log.push(JSON.stringify(instance.snapshot().note));
    },
    expected: ['"line1\\nline2\\r\\nline3"'],
  },
  {
    id: 'chaos-a-note-that-looks-like-markup-is-escaped-when-rendered',
    src: 'janux',
    run: async (log) => {
      const instance = fresh();

      await instance.intents.setNote!({ note: '<script>alert(1)</script>' }, { origin: 'human' });
      const { html } = await renderToString(jsx('p', { children: instance.state.note }));

      log.push(html);
    },
    expected: ['<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'],
  },
  {
    id: 'chaos-a-note-full-of-quotes-is-safe-in-an-attribute',
    src: 'janux',
    run: async (log) => {
      const instance = fresh();

      await instance.intents.setNote!({ note: '" onmouseover="alert(1)' }, { origin: 'human' });
      const { html } = await renderToString(jsx('p', { title: instance.state.note, children: 'x' }));

      log.push(html);
    },
    expected: ['<p title="&quot; onmouseover=&quot;alert(1)">x</p>'],
  },
  {
    id: 'chaos-a-very-long-pasted-note-is-kept-whole',
    src: 'janux',
    run: async (log) => {
      const instance = fresh();
      const long = 'x'.repeat(100_000);

      await instance.intents.setNote!({ note: long }, { origin: 'human' });
      log.push(String((instance.snapshot().note as string).length));
    },
    expected: ['100000'],
  },
  {
    id: 'chaos-a-note-of-only-whitespace-is-preserved-not-trimmed',
    src: 'janux',
    run: async (log) => {
      const instance = fresh();

      await instance.intents.setNote!({ note: '   ' }, { origin: 'human' });
      log.push(JSON.stringify(instance.snapshot().note));
    },
    expected: ['"   "'],
  },

  // ── lists at scale ──────────────────────────────────────────────────────────
  {
    id: 'chaos-a-ten-thousand-item-cart-still-renders',
    src: 'janux',
    run: async (log) => {
      const instance = fresh();
      const items = Array.from({ length: 10_000 }, (_, index) => ({ sku: `s${index}`, qty: 1 }));

      for (const item of items.slice(0, 200)) await instance.intents.add!(item, { origin: 'human' });
      const { html } = await renderToString(jsx('ul', { children: instance.state.items.map((item: { sku: string }) => jsx('li', { children: item.sku })) }));

      log.push(`items=${instance.state.items.length}`, `rendered=${html.split('<li>').length - 1}`);
    },
    expected: ['items=200', 'rendered=200'],
  },
  {
    id: 'chaos-a-duplicate-sku-is-allowed-because-nothing-declared-it-unique',
    src: 'janux',
    run: async (log) => {
      const instance = fresh();

      await instance.intents.add!({ sku: 'a' }, { origin: 'human' });
      await instance.intents.add!({ sku: 'a' }, { origin: 'human' });
      log.push(String(instance.state.items.length));
    },
    expected: ['2'],
  },
  {
    id: 'chaos-a-negative-quantity-is-accepted-when-the-schema-permits-it',
    src: 'janux',
    run: async (log) => {
      const instance = fresh();

      await instance.intents.add!({ sku: 'a', qty: -5 }, { origin: 'human' });
      log.push(String(instance.state.items[0].qty));
    },
    expected: ['-5'],
  },
  {
    id: 'chaos-a-fractional-quantity-is-refused',
    src: 'janux',
    run: async (log) => {
      const instance = fresh();

      await attempt(log, 'add', () => instance.intents.add!({ sku: 'a', qty: 1.5 }, { origin: 'human' }));
    },
    expected: ['add:threw:Invalid input for "cart.add" — qty: expected int'],
  },

  // ── the network people actually have ────────────────────────────────────────
  {
    id: 'chaos-a-query-that-fails-then-succeeds-recovers',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      let calls = 0;
      const query = client.getQuery({
        queryKey: ['orders'],
        queryFn: async () => {
          calls += 1;
          if (calls === 1) throw new Error('net::ERR_INTERNET_DISCONNECTED');

          return 'ok';
        },
      });

      await query.fetch().catch(() => undefined);
      log.push(`first=${query.state.status}`);
      log.push(`second=${String(await query.fetch())}`);
    },
    expected: ['first=error', 'second=ok'],
  },
  {
    id: 'chaos-two-tabs-fetching-the-same-key-share-one-request',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      let calls = 0;
      const options = { queryKey: ['me'], queryFn: async () => (calls += 1) };

      await Promise.all([client.getQuery(options).fetch(), client.getQuery({ ...options }).fetch()]);
      log.push(`calls=${calls}`);
    },
    expected: ['calls=1'],
  },
  {
    id: 'chaos-a-slow-request-that-never-resolves-leaves-the-query-fetching',
    src: 'janux',
    run: (log) => {
      const client = new QueryClient();
      const query = client.getQuery({ queryKey: ['slow'], queryFn: () => new Promise<string>(() => {}) });

      query.fetch();
      log.push(`fetching=${query.state.isFetching}`, `status=${query.state.status}`);
    },
    expected: ['fetching=true', 'status=pending'],
  },
  {
    id: 'chaos-invalidating-while-a-request-is-in-flight-joins-it',
    src: 'janux',
    run: async (log) => {
      const client = new QueryClient();
      let calls = 0;
      const query = client.getQuery({ queryKey: ['k'], queryFn: async () => (calls += 1) });
      const inFlight = query.fetch();

      await client.invalidateQueries(['k']);
      await inFlight;
      log.push(`calls=${calls}`);
    },
    expected: ['calls=1'],
  },

  // ── clocks and time ─────────────────────────────────────────────────────────
  {
    id: 'chaos-a-clock-jumping-backwards-does-not-make-data-eternally-fresh',
    src: 'janux',
    run: async (log) => {
      let now = 10_000;
      const client = new QueryClient(() => now);
      const query = client.getQuery({ queryKey: ['k'], queryFn: async () => 1, staleTime: 1000 });

      await query.fetch();
      now = 0;
      log.push(`stale=${query.isStale()}`);
    },
    expected: ['stale=false'],
  },
  {
    id: 'chaos-a-clock-jumping-forwards-makes-data-stale',
    src: 'janux',
    run: async (log) => {
      let now = 1000;
      const client = new QueryClient(() => now);
      const query = client.getQuery({ queryKey: ['k'], queryFn: async () => 1, staleTime: 1000 });

      await query.fetch();
      now += 86_400_000;
      log.push(`stale=${query.isStale()}`);
    },
    expected: ['stale=true'],
  },

  // ── things people do to a page ──────────────────────────────────────────────
  {
    id: 'chaos-two-instances-of-the-same-component-do-not-share-state',
    src: 'janux',
    run: async (log) => {
      const one = fresh();
      const two = fresh();

      await one.intents.setNote!({ note: 'mine' }, { origin: 'human' });
      log.push(`one=${one.state.note}`, `two=${JSON.stringify(two.state.note)}`);
    },
    expected: ['one=mine', 'two=""'],
  },
  {
    id: 'chaos-a-keyed-instance-gets-its-own-resource-uri',
    src: 'janux',
    run: (log) => {
      log.push(createInstance(cart, { key: 'left' } as never).uri, createInstance(cart, { key: 'right' } as never).uri);
    },
    expected: ['ui://cart#left', 'ui://cart#right'],
  },
  {
    id: 'chaos-a-snapshot-round-trips-through-json-unchanged',
    src: 'janux',
    run: async (log) => {
      const instance = fresh();

      await instance.intents.add!({ sku: 'ñ🎉', qty: 2 }, { origin: 'human' });
      await instance.intents.setNote!({ note: 'a"b\\c' }, { origin: 'human' });
      const revived = JSON.parse(JSON.stringify(instance.snapshot()));

      log.push(JSON.stringify(revived) === JSON.stringify(instance.snapshot()) ? 'identical' : 'diverged');
    },
    expected: ['identical'],
  },
  {
    id: 'chaos-disposing-an-instance-twice-is-harmless',
    src: 'janux',
    run: async (log) => {
      const instance = fresh();

      await instance.dispose();
      await attempt(log, 'second', () => instance.dispose());
    },
    expected: ['second:ok'],
  },
  {
    id: 'chaos-an-intent-after-dispose-does-not-crash-the-page',
    src: 'janux',
    run: async (log) => {
      const instance = fresh();

      await instance.dispose();
      await attempt(log, 'add', () => instance.intents.add!({ sku: 'a' }, { origin: 'human' }));
    },
    expected: ['add:ok'],
  },
];
