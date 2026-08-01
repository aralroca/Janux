import { computed, signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Signals embedded in ordinary JavaScript shapes: class fields, accessors,
 * proxies, iterators, JSON. Tracking follows the actual `.value` read at run
 * time, so wrapping a signal in any of these neither adds nor removes
 * dependencies — the read site does.
 */
export const JS_INTEROP_CASES: ScenarioCase[] = [
  {
    id: 'rx-js-a-class-field-signal-tracks-through-a-method-call',
    src: 'janux',
    run: (log) => {
      class Counter {
        readonly count = signal(0);

        increment(): void {
          this.count.value = this.count.peek() + 1;
        }
      }
      const counter = new Counter();

      watch(() => { log.push(`run:${counter.count.value}`); });
      counter.increment();
    },
    expected: ['run:0', 'run:1'],
  },
  {
    id: 'rx-js-a-class-accessor-backed-by-a-signal-tracks-on-get',
    src: 'janux',
    run: (log) => {
      class Store {
        private readonly cell = signal('a');

        get value(): string {
          return this.cell.value;
        }

        set value(next: string) {
          this.cell.value = next;
        }
      }
      const store = new Store();

      watch(() => { log.push(`run:${store.value}`); });
      store.value = 'b';
    },
    expected: ['run:a', 'run:b'],
  },
  {
    id: 'rx-js-a-proxy-forwarding-to-a-signal-preserves-tracking',
    src: 'janux',
    run: (log) => {
      const cell = signal(1);
      const proxied = new Proxy(cell, {});

      watch(() => { log.push(`run:${proxied.value}`); });
      cell.value = 2;
    },
    expected: ['run:1', 'run:2'],
  },
  {
    id: 'rx-js-a-generator-consuming-signals-tracks-only-what-it-yields-through',
    src: 'janux',
    run: (log) => {
      const first = signal(1);
      const second = signal(2);

      function* pairs(): Generator<number> {
        yield first.value;
        yield second.value;
      }

      watch(() => {
        const iterator = pairs();

        log.push(`run:${iterator.next().value}`);
      });
      second.value = 20;
      first.value = 10;
    },
    expected: ['run:1', 'run:10'],
  },
  {
    // `value` is an enumerable accessor, so stringifying the cell reads it —
    // which means an untracked serialization inside an effect WOULD subscribe.
    id: 'rx-js-json-stringify-of-a-signal-serializes-through-its-value-accessor',
    src: 'janux',
    run: (log) => {
      const cell = signal(1);

      log.push(`json:${JSON.stringify(cell)}`);
      watch(() => {
        JSON.stringify(cell);
      });
      log.push(`readers:${cell.readers()}`);
    },
    expected: ['json:{"value":1}', 'readers:1'],
  },
  {
    id: 'rx-js-a-signal-inside-an-object-literal-tracks-when-the-property-is-read',
    src: 'janux',
    run: (log) => {
      const state = { count: signal(0) };

      watch(() => { log.push(`run:${state.count.value}`); });
      state.count.value = 1;
    },
    expected: ['run:0', 'run:1'],
  },
  {
    id: 'rx-js-a-signal-passed-through-a-callback-parameter-tracks-at-the-call-site',
    src: 'janux',
    run: (log) => {
      const cell = signal(1);
      const render = (read: () => number) => {
        log.push(`run:${read()}`);
      };

      watch(() => render(() => cell.value));
      cell.value = 2;
    },
    expected: ['run:1', 'run:2'],
  },
  {
    id: 'rx-js-a-signal-stored-in-a-weakmap-behaves-like-any-reference',
    src: 'janux',
    run: (log) => {
      const key = {};
      const registry = new WeakMap<object, ReturnType<typeof signal<number>>>();

      registry.set(key, signal(1));
      watch(() => { log.push(`run:${registry.get(key)!.value}`); });
      registry.get(key)!.value = 2;
    },
    expected: ['run:1', 'run:2'],
  },
  {
    id: 'rx-js-a-computed-used-in-a-template-literal-tracks-through-coercion',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const label = computed(() => `n=${count.value}`);

      watch(() => { log.push(`${label.value}`); });
      count.value = 2;
    },
    expected: ['n=1', 'n=2'],
  },
  {
    id: 'rx-js-spreading-a-signal-object-copies-the-current-value-not-the-cell',
    src: 'janux',
    run: (log) => {
      const cell = signal(1);
      const snapshot = { ...cell };

      cell.value = 2;
      log.push(`snapshot:${snapshot.value}`, `live:${cell.value}`);
    },
    expected: ['snapshot:1', 'live:2'],
  },
  {
    id: 'rx-js-optional-call-of-a-signal-held-callback-tracks-the-holder',
    src: 'janux',
    run: (log) => {
      const handler = signal<(() => string) | undefined>(undefined);

      watch(() => { log.push(`run:${handler.value?.() ?? 'none'}`); });
      handler.value = () => 'called';
    },
    expected: ['run:none', 'run:called'],
  },
  {
    id: 'rx-js-a-getter-that-throws-propagates-out-of-the-effect',
    src: 'janux',
    run: (log) => {
      const cell = signal(0);
      const view = {
        get value(): number {
          if (cell.value > 0) throw new Error('boom');

          return cell.value;
        },
      };

      watch(() => { log.push(`run:${view.value}`); });
      try {
        cell.value = 1;
      } catch (error) {
        log.push(`threw:${(error as Error).message}`);
      }
    },
    expected: ['run:0', 'threw:boom'],
  },
];
