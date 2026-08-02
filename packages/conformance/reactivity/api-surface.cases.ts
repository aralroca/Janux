import { batch, computed, createRoot, getOwner, signal, untrack, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * The shape of the public objects themselves: which members exist, that they
 * are detachable where island code passes them around as callbacks, and that
 * read-only surfaces really are read-only at runtime.
 */
export const API_SURFACE_CASES: ScenarioCase[] = [
  {
    id: 'rx-api-a-signal-exposes-value-peek-and-readers',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      log.push(
        `value:${typeof count.value}`,
        `peek:${typeof count.peek}`,
        `readers:${typeof count.readers}`,
      );
    },
    expected: ['value:number', 'peek:function', 'readers:function'],
  },
  {
    id: 'rx-api-a-computed-exposes-value-peek-and-dispose-but-not-readers',
    src: 'janux',
    run: (log) => {
      const derived = computed(() => 1);

      log.push(
        `peek:${typeof derived.peek}`,
        `dispose:${typeof derived.dispose}`,
        `readers:${typeof (derived as unknown as Record<string, unknown>).readers}`,
      );
    },
    expected: ['peek:function', 'dispose:function', 'readers:undefined'],
  },
  {
    id: 'rx-api-peek-is-detachable-from-its-signal',
    src: 'janux',
    run: (log) => {
      const count = signal(5);
      const { peek } = count;

      count.value = 6;
      log.push(`detached:${peek()}`);
    },
    expected: ['detached:6'],
  },
  {
    id: 'rx-api-readers-is-detachable-from-its-signal',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const { readers } = count;

      watch(() => {
        count.value;
      });
      log.push(`detached:${readers()}`);
    },
    expected: ['detached:1'],
  },
  {
    id: 'rx-api-assigning-to-a-computed-value-throws-at-runtime',
    src: 'janux',
    run: (log) => {
      const derived = computed(() => 1);

      try {
        (derived as unknown as { value: number }).value = 2;
        log.push('assigned');
      } catch {
        log.push('threw');
      }
      log.push(`still:${derived.value}`);
    },
    expected: ['threw', 'still:1'],
  },
  {
    id: 'rx-api-the-signal-object-identity-is-stable-across-writes',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const alias = count;

      count.value = 1;
      log.push(`same:${alias === count}`, `aliased:${alias.value}`);
    },
    expected: ['same:true', 'aliased:1'],
  },
  {
    id: 'rx-api-dispose-of-a-computed-is-detachable',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const derived = computed(() => count.value * 2);
      const { dispose } = derived;

      dispose();
      count.value = 5;
      log.push(`frozen:${derived.value}`);
    },
    expected: ['frozen:2'],
  },
  {
    id: 'rx-api-get-owner-returns-null-not-undefined-outside-scopes',
    src: 'janux',
    run: (log) => {
      log.push(`is-null:${getOwner() === null}`);
    },
    expected: ['is-null:true'],
  },
  {
    id: 'rx-api-untrack-and-batch-are-transparent-to-this-binding-free-callbacks',
    src: 'janux',
    run: (log) => {
      const double = (n: number) => n * 2;

      log.push(String(untrack(() => double(2))), String(batch(() => double(3))));
    },
    expected: ['4', '6'],
  },
  {
    id: 'rx-api-signals-created-in-any-context-are-plain-detached-values',
    src: 'janux',
    run: (log) => {
      const fromRoot = createRoot(() => signal('rooted'));
      const fromUntrack = untrack(() => signal('untracked'));

      fromRoot.value = 'updated';
      log.push(fromRoot.value, fromUntrack.value);
    },
    expected: ['updated', 'untracked'],
  },
  {
    id: 'rx-api-a-signal-created-inside-a-root-outlives-its-root',
    src: 'janux',
    run: (log) => {
      const count = createRoot((dispose) => {
        const inner = signal(1);

        dispose();

        return inner;
      });

      count.value = 2;
      log.push(`value:${count.value}`);
    },
    expected: ['value:2'],
  },
  {
    id: 'rx-api-watch-accepts-a-named-function-declaration',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      function render(): void {
        log.push(`render:${count.value}`);
      }
      watch(render);
      count.value = 1;
    },
    expected: ['render:0', 'render:1'],
  },
  {
    id: 'rx-api-batch-and-untrack-propagate-the-callback-return-type-unchanged',
    src: 'janux',
    run: (log) => {
      const fromBatch = batch(() => [1, 2]);
      const fromUntrack = untrack(() => ({ ok: true }));

      log.push(`batch:${Array.isArray(fromBatch)}`, `untrack:${fromUntrack.ok}`);
    },
    expected: ['batch:true', 'untrack:true'],
  },
  {
    id: 'rx-api-create-root-passes-exactly-one-argument-the-dispose-function',
    src: 'janux',
    run: (log) => {
      createRoot((...args) => {
        log.push(`args:${args.length}`, `first:${typeof args[0]}`);
      });
    },
    expected: ['args:1', 'first:function'],
  },
  {
    id: 'rx-api-the-dispose-returned-by-watch-takes-no-arguments-and-returns-undefined',
    src: 'janux',
    run: (log) => {
      const dispose = watch(() => {});

      log.push(`arity:${dispose.length}`, `returns:${String(dispose())}`);
    },
    expected: ['arity:0', 'returns:undefined'],
  },
  {
    id: 'rx-api-signal-accepts-an-explicit-undefined-initial-value',
    src: 'janux',
    run: (log) => {
      const cell = signal<number | undefined>(undefined);

      log.push(`initial:${String(cell.value)}`);
      cell.value = 1;
      log.push(`after:${cell.value}`);
    },
    expected: ['initial:undefined', 'after:1'],
  },
];
