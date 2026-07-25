import { signal, watch } from 'janux';
import { createReactiveState } from '../../janux/src/state/reactive-state';
import { createGate, withGate } from '../../janux/src/state/mutation-gate';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * The reactive state proxy: read tracking, write notification, path bookkeeping
 * and the mutation gate.
 *
 * Cases follow the shape of Vue's `reactive`/`reactiveArray` suites — the same
 * places every proxy-based state layer has bled: exotic keys, array method
 * interception, structural clones of non-JSON values, cycles, and identity of
 * the proxy itself.
 */

/** A state whose gate is already open, for cases that are not about the gate. */
function open<T extends object>(initial: T) {
  const gate = createGate();
  const state = createReactiveState(initial, gate);

  return { state, mutate: <R>(fn: () => R) => withGate(gate, fn) };
}

export const REACTIVE_STATE_CASES: ScenarioCase[] = [
  {
    id: 'state-reads-a-scalar',
    src: 'vue:reactive#should-return-the-value',
    run: (log) => {
      const { state } = open({ n: 1 });

      log.push(String(state.proxy.n));
    },
    expected: ['1'],
  },
  {
    id: 'state-write-outside-the-gate-throws',
    src: 'janux',
    run: (log) => {
      const state = createReactiveState({ n: 1 });

      attempt(log, 'write', () => (state.proxy.n = 2));
    },
    expected: [
      'write:threw:Janux: illegal mutation of "n" outside an intent, effect or event handler. State can only change inside declared run() bodies (RFC §4.4).',
    ],
  },
  {
    id: 'state-write-inside-the-gate-succeeds',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ n: 1 });

      mutate(() => (state.proxy.n = 2));
      log.push(String(state.proxy.n));
    },
    expected: ['2'],
  },
  {
    id: 'state-delete-outside-the-gate-throws',
    src: 'janux',
    run: (log) => {
      const state = createReactiveState<{ n?: number }>({ n: 1 });

      attempt(log, 'delete', () => delete state.proxy.n);
    },
    expected: [
      'delete:threw:Janux: illegal mutation of "n" outside an intent, effect or event handler. State can only change inside declared run() bodies (RFC §4.4).',
    ],
  },
  {
    id: 'state-array-push-outside-the-gate-throws',
    src: 'janux',
    run: (log) => {
      const state = createReactiveState({ items: [1] });

      attempt(log, 'push', () => state.proxy.items.push(2));
    },
    expected: [
      'push:threw:Janux: illegal mutation of "items" outside an intent, effect or event handler. State can only change inside declared run() bodies (RFC §4.4).',
    ],
  },
  {
    id: 'state-gate-closes-again-after-the-body-throws',
    src: 'janux',
    run: (log) => {
      const gate = createGate();
      const state = createReactiveState({ n: 1 }, gate);

      attempt(log, 'inside', () =>
        withGate(gate, () => {
          throw new Error('boom');
        }),
      );
      attempt(log, 'after', () => (state.proxy.n = 3));
    },
    expected: ['inside:threw:boom', 'after:threw:Janux: illegal mutation of "n" outside an intent, effect or event handler. State can only change inside declared run() bodies (RFC §4.4).'],
  },
  {
    id: 'state-write-notifies-a-watcher-of-that-path',
    src: 'vue:reactive#should-trigger-on-set',
    run: (log) => {
      const { state, mutate } = open({ n: 1 });

      watch(() => { log.push(`run:${state.proxy.n}`); });
      mutate(() => (state.proxy.n = 2));
    },
    expected: ['run:1', 'run:2'],
  },
  {
    id: 'state-write-to-a-sibling-does-not-notify',
    src: 'vue:reactive#should-not-trigger-unrelated',
    run: (log) => {
      const { state, mutate } = open({ a: 1, b: 1 });

      watch(() => { log.push(`run:${state.proxy.a}`); });
      mutate(() => (state.proxy.b = 2));
    },
    expected: ['run:1'],
  },
  {
    id: 'state-write-to-a-child-notifies-a-watcher-of-the-parent',
    src: 'vue:reactive#deep-mutation-triggers-parent',
    run: (log) => {
      const { state, mutate } = open({ user: { name: 'a' } });

      watch(() => { log.push(`run:${JSON.stringify(state.proxy.user)}`); });
      mutate(() => (state.proxy.user.name = 'b'));
    },
    expected: ['run:{"name":"a"}', 'run:{"name":"b"}'],
  },
  {
    id: 'state-replacing-a-parent-notifies-a-watcher-of-the-child',
    src: 'vue:reactive#replacing-a-branch-triggers-descendants',
    run: (log) => {
      const { state, mutate } = open({ user: { name: 'a' } });

      watch(() => { log.push(`run:${state.proxy.user.name}`); });
      mutate(() => (state.proxy.user = { name: 'b' }));
    },
    expected: ['run:a', 'run:b'],
  },
  {
    id: 'state-array-push-notifies-a-length-watcher',
    src: 'vue:reactiveArray#push-should-trigger-length',
    run: (log) => {
      const { state, mutate } = open({ items: [1] });

      watch(() => { log.push(`run:${state.proxy.items.length}`); });
      mutate(() => state.proxy.items.push(2));
    },
    expected: ['run:1', 'run:2'],
  },
  {
    id: 'state-array-methods-return-what-the-raw-method-returns',
    src: 'vue:reactiveArray#mutating-methods-return-values',
    run: (log) => {
      const { state, mutate } = open({ items: [1, 2, 3] });

      log.push(
        `pop:${mutate(() => state.proxy.items.pop())}`,
        `push:${mutate(() => state.proxy.items.push(9))}`,
        `shift:${mutate(() => state.proxy.items.shift())}`,
        `splice:${JSON.stringify(mutate(() => state.proxy.items.splice(0, 1)))}`,
      );
    },
    expected: ['pop:3', 'push:3', 'shift:1', 'splice:[2]'],
  },
  {
    id: 'state-array-sort-accepts-a-comparator',
    src: 'vue:reactiveArray#sort-with-comparator',
    run: (log) => {
      const { state, mutate } = open({ items: [3, 1, 2] });

      mutate(() => state.proxy.items.sort((a, b) => a - b));
      log.push(JSON.stringify(state.snapshot().items));
    },
    expected: ['[1,2,3]'],
  },
  {
    id: 'state-array-reverse-mutates-in-place',
    src: 'vue:reactiveArray#reverse',
    run: (log) => {
      const { state, mutate } = open({ items: [1, 2, 3] });

      mutate(() => state.proxy.items.reverse());
      log.push(JSON.stringify(state.snapshot().items));
    },
    expected: ['[3,2,1]'],
  },
  {
    id: 'state-array-length-truncation-notifies',
    src: 'vue:reactiveArray#setting-length',
    run: (log) => {
      const { state, mutate } = open({ items: [1, 2, 3] });

      watch(() => { log.push(`run:${state.proxy.items.length}`); });
      mutate(() => (state.proxy.items.length = 1));
    },
    expected: ['run:3', 'run:1'],
  },
  {
    id: 'state-non-mutating-array-methods-are-not-gated',
    src: 'vue:reactiveArray#read-only-methods',
    run: (log) => {
      const state = createReactiveState({ items: [1, 2, 3] });

      log.push(`map:${JSON.stringify(state.proxy.items.map((n) => n * 2))}`);
      log.push(`filter:${JSON.stringify(state.proxy.items.filter((n) => n > 1))}`);
      log.push(`join:${state.proxy.items.join('-')}`);
    },
    expected: ['map:[2,4,6]', 'filter:[2,3]', 'join:1-2-3'],
  },
  {
    id: 'state-snapshot-is-plain-data-detached-from-the-proxy',
    src: 'vue:reactive#toRaw-returns-the-plain-object',
    run: (log) => {
      const { state, mutate } = open({ user: { name: 'a' } });
      const before = state.snapshot();

      mutate(() => (state.proxy.user.name = 'b'));
      log.push(`snapshot:${before.user.name}`, `live:${state.proxy.user.name}`);
    },
    expected: ['snapshot:a', 'live:b'],
  },
  {
    id: 'state-writing-a-proxy-into-state-stores-plain-data',
    src: 'vue:reactive#nested-reactive-is-unwrapped-on-write',
    run: (log) => {
      const { state, mutate } = open({ a: { n: 1 }, b: {} as { n?: number } });

      mutate(() => (state.proxy.b = state.proxy.a));
      log.push(JSON.stringify(state.snapshot().b));
    },
    expected: ['{"n":1}'],
  },
  {
    id: 'state-symbol-keys-bypass-tracking-without-throwing',
    src: 'vue:reactive#should-not-track-symbol-keys',
    run: (log) => {
      const marker = Symbol('marker');
      const state = createReactiveState<Record<symbol, unknown>>({});

      attempt(log, 'write', () => ((state.proxy as Record<symbol, unknown>)[marker] = 1));
      log.push(`read:${String((state.proxy as Record<symbol, unknown>)[marker])}`);
    },
    expected: ['write:ok', 'read:1'],
  },
  {
    id: 'state-tracked-paths-grow-only-for-paths-actually-read',
    src: 'janux',
    run: (log) => {
      const { state } = open({ a: 1, b: 2, c: { d: 3 } });

      log.push(`initial:${state.stats().paths}`);
      state.proxy.a;
      log.push(`after-a:${state.stats().paths}`);
      state.proxy.c.d;
      log.push(`after-cd:${state.stats().paths}`);
    },
    expected: ['initial:0', 'after-a:1', 'after-cd:3'],
  },
  {
    id: 'state-a-dotted-key-does-not-leak-into-a-sibling-path',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ 'a.b': 1, a: { b: 99 } });

      watch(() => { log.push(`nested:${state.proxy.a.b}`); });
      mutate(() => (state.proxy['a.b'] = 2));
      log.push(`flat:${state.proxy['a.b']}`, `still:${state.proxy.a.b}`);
    },
    expected: ['nested:99', 'flat:2', 'still:99'],
  },
  {
    id: 'state-proto-key-does-not-poison-the-prototype-chain',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});

      attempt(log, 'write', () => mutate(() => (state.proxy['__proto__'] = { polluted: true })));
      log.push(`victim:${String(({} as Record<string, unknown>).polluted)}`);
    },
    expected: ['write:ok', 'victim:undefined'],
  },
  {
    id: 'state-constructor-key-does-not-replace-the-constructor',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});

      attempt(log, 'write', () => mutate(() => (state.proxy['constructor'] = 'hijacked')));
      log.push(`victim:${({}).constructor.name}`);
    },
    expected: ['write:ok', 'victim:Object'],
  },
  {
    id: 'state-writing-the-proxy-into-itself-stores-a-snapshot-not-a-cycle',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({ n: 1, nested: {} });

      mutate(() => (state.proxy.nested = state.proxy));
      log.push(JSON.stringify(state.snapshot().nested));
    },
    expected: ['{"n":1,"nested":{}}'],
  },
  {
    id: 'state-a-cyclic-object-is-rejected-not-a-stack-overflow',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});
      const cyclic: Record<string, unknown> = { name: 'loop' };

      cyclic.self = cyclic;
      attempt(log, 'write', () => mutate(() => (state.proxy.x = cyclic)));
      log.push('survived');
    },
    expected: ['write:threw:Janux: cannot store a cycle in state ("x")', 'survived'],
  },
  {
    id: 'state-a-value-shared-by-two-siblings-is-not-mistaken-for-a-cycle',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});
      const shared = { n: 1 };

      attempt(log, 'write', () => mutate(() => (state.proxy.pair = { a: shared, b: shared })));
      log.push(JSON.stringify(state.snapshot().pair));
    },
    expected: ['write:ok', '{"a":{"n":1},"b":{"n":1}}'],
  },
  {
    id: 'state-a-cycle-nested-deep-inside-the-written-value-is-rejected',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});
      const inner: Record<string, unknown> = {};

      inner.back = { up: inner };
      attempt(log, 'write', () => mutate(() => (state.proxy.deep = { wrap: inner })));
      log.push('survived');
    },
    expected: ['write:threw:Janux: cannot store a cycle in state ("deep")', 'survived'],
  },
  {
    id: 'state-a-cyclic-array-is-rejected',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({});
      const items: unknown[] = [1];

      items.push(items);
      attempt(log, 'write', () => mutate(() => (state.proxy.items = items)));
      log.push('survived');
    },
    expected: ['write:threw:Janux: cannot store a cycle in state ("items")', 'survived'],
  },
  {
    id: 'state-pushing-a-cyclic-value-into-an-array-is-rejected',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ items: [] as unknown[] });
      const cyclic: Record<string, unknown> = {};

      cyclic.self = cyclic;
      attempt(log, 'push', () => mutate(() => state.proxy.items.push(cyclic)));
      log.push(`length:${state.snapshot().items.length}`);
    },
    expected: ['push:threw:Janux: cannot store a cycle in state ("items")', 'length:0'],
  },
  {
    id: 'state-a-dotted-key-keeps-its-own-tracking-identity',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ 'a.b': 1, a: { b: 99 } });

      watch(() => { log.push(`flat:${state.proxy['a.b']}`); });
      mutate(() => (state.proxy.a.b = 100));
      log.push(`nested:${state.proxy.a.b}`);
    },
    expected: ['flat:1', 'nested:100'],
  },
  {
    id: 'state-a-key-containing-a-backslash-does-not-collide-with-an-escaped-dot',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({ 'a\\': { b: 1 }, 'a\\.b': 2 });

      watch(() => { log.push(`escaped:${(state.proxy['a\\.b'] as number)}`); });
      mutate(() => ((state.proxy['a\\'] as Record<string, number>).b = 5));
      log.push('done');
    },
    expected: ['escaped:2', 'done'],
  },
];
