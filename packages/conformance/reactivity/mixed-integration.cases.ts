import { batch, computed, createRoot, getOwner, onCleanup, runWithOwner, signal, untrack, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Whole-primitive compositions shaped like real island code: state + derived
 * values + effects under one disposal scope, updated in batches, torn down as
 * a unit, with ownership carried across async gaps the way the docs show.
 */
export const MIXED_INTEGRATION_CASES: ScenarioCase[] = [
  {
    id: 'rx-mx-an-island-scope-updates-as-a-unit-and-tears-down-as-a-unit',
    src: 'janux',
    run: (log) => {
      const items = signal(2);
      const price = signal(10);

      createRoot((dispose) => {
        const total = computed(() => items.value * price.value);

        watch(() => { log.push(`render:${total.value}`); });
        onCleanup(() => log.push('unmount'));
        batch(() => {
          items.value = 3;
          price.value = 20;
        });
        dispose();
      });
      items.value = 100;
      log.push(`readers:${items.readers()}`);
    },
    expected: ['render:20', 'render:60', 'unmount', 'readers:0'],
  },
  {
    id: 'rx-mx-ownership-carries-across-an-await-via-run-with-owner',
    src: 'janux',
    run: async (log) => {
      const data = signal('loading');
      let dispose = () => {};
      let owner: ReturnType<typeof getOwner> = null;

      createRoot((disposeRoot) => {
        dispose = disposeRoot;
        owner = getOwner();
      });
      await Promise.resolve();
      runWithOwner(owner, () => {
        watch(() => { log.push(`render:${data.value}`); });
      });
      data.value = 'ready';
      dispose();
      data.value = 'stale';
      log.push('done');
    },
    expected: ['render:loading', 'render:ready', 'done'],
  },
  {
    id: 'rx-mx-a-computed-shared-across-roots-freezes-for-all-when-its-root-dies',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      let stopProducer = () => {};
      const double = createRoot((dispose) => {
        stopProducer = dispose;

        return computed(() => count.value * 2);
      });

      createRoot(() => {
        watch(() => { log.push(`consumer:${double.value}`); });
      });
      count.value = 2;
      stopProducer();
      count.value = 3;
      log.push('done');
    },
    expected: ['consumer:2', 'consumer:4', 'done'],
  },
  {
    id: 'rx-mx-disposing-one-root-leaves-a-shared-signals-other-subscribers-live',
    src: 'janux',
    run: (log) => {
      const shared = signal(0);

      createRoot((dispose) => {
        watch(() => { log.push(`a:${shared.value}`); });
        dispose();
      });
      createRoot(() => {
        watch(() => { log.push(`b:${shared.value}`); });
      });
      shared.value = 1;
    },
    expected: ['a:0', 'b:0', 'b:1'],
  },
  {
    id: 'rx-mx-form-validity-pipeline-recomputes-and-notifies-only-on-transitions',
    src: 'janux',
    run: (log) => {
      const name = signal('');
      const age = signal(0);
      const valid = computed(() => name.value.length > 0 && age.value >= 18);

      watch(() => { log.push(`valid:${valid.value}`); });
      name.value = 'ada';
      age.value = 21;
      age.value = 30;
      name.value = '';
    },
    expected: ['valid:false', 'valid:true', 'valid:false'],
  },
  {
    id: 'rx-mx-a-batched-multi-field-update-renders-once',
    src: 'janux',
    run: (log) => {
      const first = signal('a');
      const last = signal('b');
      const full = computed(() => `${first.value} ${last.value}`);

      watch(() => { log.push(`render:${full.value}`); });
      batch(() => {
        first.value = 'x';
        last.value = 'y';
      });
    },
    expected: ['render:a b', 'render:x y'],
  },
  {
    id: 'rx-mx-per-generation-roots-tear-down-through-the-effect-cleanup',
    src: 'janux',
    run: (log) => {
      const generation = signal(0);
      const inner = signal(0);

      watch(() => {
        const current = generation.value;

        return createRoot((dispose) => {
          watch(() => { log.push(`g${current}:${inner.value}`); });

          return dispose;
        });
      });
      inner.value = 1;
      generation.value = 1;
      inner.value = 2;
    },
    expected: ['g0:0', 'g0:1', 'g1:1', 'g1:2'],
  },
  {
    id: 'rx-mx-log-once-then-track-selected-fields-only',
    src: 'janux',
    run: (log) => {
      const user = signal('ada');
      const theme = signal('dark');

      watch(() => {
        log.push(`theme:${theme.value}:for:${untrack(() => user.value)}`);
      });
      user.value = 'grace';
      theme.value = 'light';
    },
    expected: ['theme:dark:for:ada', 'theme:light:for:grace'],
  },
  {
    id: 'rx-mx-selector-diamond-and-batch-compose-without-tearing',
    src: 'janux',
    run: (log) => {
      const useMetric = signal(true);
      const meters = signal(1);
      const asMetric = computed(() => `${meters.value}m`);
      const asImperial = computed(() => `${Math.round(meters.value * 3.28)}ft`);
      const label = computed(() => (useMetric.value ? asMetric.value : asImperial.value));

      watch(() => { log.push(`label:${label.value}`); });
      batch(() => {
        useMetric.value = false;
        meters.value = 2;
      });
    },
    expected: ['label:1m', 'label:7ft'],
  },
  {
    id: 'rx-mx-a-derived-class-string-dedupes-render-work',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const parity = computed(() => (count.value % 2 === 0 ? 'even' : 'odd'));

      watch(() => { log.push(`class:${parity.value}`); });
      count.value = 2;
      count.value = 4;
      count.value = 5;
    },
    expected: ['class:even', 'class:odd'],
  },
  {
    id: 'rx-mx-history-accumulation-via-peek-avoids-a-feedback-loop',
    src: 'janux',
    run: (log) => {
      const current = signal('a');
      const history = signal<string[]>([]);

      watch(() => {
        history.value = [...history.peek(), current.value];
      });
      current.value = 'b';
      current.value = 'c';
      log.push(`history:${history.peek().join(',')}`);
    },
    expected: ['history:a,b,c'],
  },
  {
    id: 'rx-mx-nested-islands-parent-teardown-reaches-grandchildren-effects',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      createRoot((dispose) => {
        createRoot(() => {
          createRoot(() => {
            watch(() => { log.push(`leaf:${count.value}`); });
          });
        });
        count.value = 1;
        dispose();
      });
      count.value = 2;
      log.push(`readers:${count.readers()}`);
    },
    expected: ['leaf:0', 'leaf:1', 'readers:0'],
  },
  {
    id: 'rx-mx-a-search-box-pipeline-filters-derived-results-per-keystroke',
    src: 'janux',
    run: (log) => {
      const query = signal('');
      const items = signal(['alpha', 'beta', 'gamma']);
      const matches = computed(() =>
        items.value.filter((item) => item.startsWith(query.value)).join(','),
      );

      watch(() => { log.push(`matches:${matches.value}`); });
      query.value = 'a';
      query.value = 'al';
      query.value = 'z';
    },
    expected: ['matches:alpha,beta,gamma', 'matches:alpha', 'matches:'],
  },
  {
    id: 'rx-mx-an-optimistic-update-rolls-back-through-the-same-signal',
    src: 'janux',
    run: (log) => {
      const saved = signal('a');
      const pending = signal<string | null>(null);
      const shown = computed(() => pending.value ?? saved.value);

      watch(() => { log.push(`shown:${shown.value}`); });
      pending.value = 'b';
      pending.value = null;
      log.push('rolled-back');
    },
    expected: ['shown:a', 'shown:b', 'shown:a', 'rolled-back'],
  },
  {
    id: 'rx-mx-a-scope-that-both-derives-and-writes-tears-down-cleanly',
    src: 'janux',
    run: (log) => {
      const input = signal(1);
      const output = signal(0);

      watch(() => { log.push(`output:${output.value}`); });
      createRoot((dispose) => {
        const doubled = computed(() => input.value * 2);

        watch(() => {
          output.value = doubled.value;
        });
        input.value = 5;
        dispose();
      });
      input.value = 50;
      log.push(`final:${output.peek()}`, `readers:${input.readers()}`);
    },
    expected: ['output:0', 'output:2', 'output:10', 'final:10', 'readers:0'],
  },
  {
    id: 'rx-mx-a-tab-switch-swaps-which-derived-panel-is-live',
    src: 'janux',
    run: (log) => {
      const tab = signal<'list' | 'chart'>('list');
      const rows = signal([1, 2]);
      const listView = computed(() => `rows:${rows.value.length}`);
      const chartView = computed(() => `sum:${rows.value.reduce((a, b) => a + b, 0)}`);

      watch(() => { log.push(tab.value === 'list' ? listView.value : chartView.value); });
      rows.value = [1, 2, 3];
      tab.value = 'chart';
      rows.value = [5];
    },
    expected: ['rows:2', 'rows:3', 'sum:6', 'sum:5'],
  },
];
