import { batch, computed, watch } from 'janux';
import { createReactiveState } from '../../janux/src/state/reactive-state';
import { createGate, withGate } from '../../janux/src/state/mutation-gate';
import { type ScenarioCase } from '../support/scenario';

/**
 * Derived values over state, iteration protocols through the proxy, and the
 * value-isolation half of the path-escaping grammar (the notification half
 * lives in reactive-state.cases).
 */

/** A state whose gate is already open, for cases that are not about the gate. */
function open<T extends object>(initial: T) {
  const gate = createGate();
  const state = createReactiveState(initial, gate);

  return { state, mutate: <R>(fn: () => R) => withGate(gate, fn) };
}

export const DERIVED_AND_ITERATION_CASES: ScenarioCase[] = [
  // ── derived state ───────────────────────────────────────────────────────────
  {
    id: 'state-a-computed-over-two-paths-recomputes-on-either-write',
    src: 'solid:store#derived-values',
    run: (log) => {
      const { state, mutate } = open({ price: 10, quantity: 2 });
      const total = computed(() => state.proxy.price * state.proxy.quantity);

      log.push(`initial:${total.value}`);
      mutate(() => (state.proxy.quantity = 3));
      log.push(`quantity:${total.value}`);
      mutate(() => (state.proxy.price = 1));
      log.push(`price:${total.value}`);
    },
    expected: ['initial:20', 'quantity:30', 'price:3'],
  },
  {
    id: 'state-a-computed-does-not-recompute-for-an-unrelated-path',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ used: 1, unused: 1 });
      let runs = 0;
      const doubled = computed(() => ((runs += 1), state.proxy.used * 2));

      doubled.value;
      mutate(() => (state.proxy.unused = 9));
      log.push(`value:${doubled.value}`, `runs:${runs}`);
    },
    expected: ['value:2', 'runs:1'],
  },
  {
    id: 'state-a-computed-read-mid-batch-is-not-stale',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ n: 1 });
      const doubled = computed(() => state.proxy.n * 2);

      mutate(() =>
        batch(() => {
          state.proxy.n = 5;
          log.push(`mid-batch:${doubled.value}`);
        }),
      );
    },
    expected: ['mid-batch:10'],
  },
  {
    id: 'state-a-computed-chain-over-state-settles-to-a-fixed-point',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ n: 1 });
      const doubled = computed(() => state.proxy.n * 2);
      const quadrupled = computed(() => doubled.value * 2);

      log.push(`initial:${quadrupled.value}`);
      mutate(() => (state.proxy.n = 3));
      log.push(`after:${quadrupled.value}`);
    },
    expected: ['initial:4', 'after:12'],
  },
  {
    id: 'state-a-computed-over-an-array-length-follows-its-mutators',
    src: 'zustand:basic#computed-selector',
    run: (log) => {
      const { state, mutate } = open({ items: [1, 2] });
      const count = computed(() => state.proxy.items.length);

      log.push(`initial:${count.value}`);
      mutate(() => state.proxy.items.push(3));
      log.push(`pushed:${count.value}`);
      mutate(() => state.proxy.items.splice(0, 2));
      log.push(`spliced:${count.value}`);
    },
    expected: ['initial:2', 'pushed:3', 'spliced:1'],
  },

  // ── iteration through the proxy ─────────────────────────────────────────────
  {
    id: 'state-iterating-an-array-in-a-watcher-subscribes-to-it',
    src: 'vue:reactiveArray#for-of-tracks',
    run: (log) => {
      const { state, mutate } = open({ items: [1, 2] });

      watch(() => {
        let sum = 0;

        for (const item of state.proxy.items) sum += item;
        log.push(`sum:${sum}`);
      });
      mutate(() => state.proxy.items.push(3));
    },
    expected: ['sum:3', 'sum:6'],
  },
  {
    id: 'state-array-is-array-sees-through-the-proxy',
    src: 'vue:reactive#isArray',
    run: (log) => {
      const { state } = open({ items: [1] });

      log.push(`array:${Array.isArray(state.proxy.items)}`, `plain:${Array.isArray(state.proxy)}`);
    },
    expected: ['array:true', 'plain:false'],
  },
  {
    id: 'state-reduce-through-the-proxy-computes-over-live-values',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ items: [1, 2, 3] });

      mutate(() => (state.proxy.items[1] = 10));
      log.push(`sum:${state.proxy.items.reduce((acc, item) => acc + item, 0)}`);
    },
    expected: ['sum:14'],
  },

  // ── escaping: values stay isolated even where notification is coarse ────────
  {
    id: 'state-a-dotted-key-nested-below-the-root-does-not-corrupt-its-lookalike',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ cfg: { 'a.b': 1, a: { b: 9 } } });

      mutate(() => (state.proxy.cfg['a.b'] = 2));
      log.push(`flat:${state.snapshot().cfg['a.b']}`, `nested:${state.snapshot().cfg.a.b}`);
    },
    expected: ['flat:2', 'nested:9'],
  },
  {
    id: 'state-a-key-with-a-mid-word-backslash-does-not-collide-with-a-nested-path',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, unknown>>({ 'a\\b': 1, a: { b: 9 } });

      mutate(() => (state.proxy['a\\b'] = 2));
      log.push(`escaped:${state.snapshot()['a\\b']}`, `nested:${(state.snapshot().a as { b: number }).b}`);
    },
    expected: ['escaped:2', 'nested:9'],
  },
  {
    id: 'state-a-key-ending-in-a-backslash-keeps-its-own-subtree',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, { n: number }>>({ 'trail\\': { n: 1 }, trail: { n: 9 } });

      mutate(() => (state.proxy['trail\\']!.n = 2));
      log.push(`escaped:${state.snapshot()['trail\\']!.n}`, `plain:${state.snapshot().trail!.n}`);
    },
    expected: ['escaped:2', 'plain:9'],
  },
];
