import { batch, computed, createRoot, onCleanup, signal, untrack, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Bug classes other reactive libraries shipped and then regression-tested, run
 * against Janux. Where Janux deliberately differs (a computed read inside
 * `untrack` really is untracked; an inner effect is not auto-disposed) the row
 * encodes Janux's semantics and is credited to `janux`.
 */
export const PORTED_REGRESSION_CASES: ScenarioCase[] = [
  {
    id: 'rx-rg-a-computed-read-before-it-has-subscribers-is-still-correct',
    src: 'vue:computed#chained-computed-accessed-before-having-subs',
    run: (log) => {
      const base = signal(1);
      const mid = computed(() => base.value + 1);
      const tip = computed(() => mid.value + 1);

      base.value = 10;
      log.push(`tip:${tip.value}`);
      watch(() => { log.push(`run:${tip.value}`); });
      base.value = 20;
    },
    expected: ['tip:12', 'run:12', 'run:22'],
  },
  {
    id: 'rx-rg-a-computed-read-inside-untrack-is-not-force-tracked',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const doubled = computed(() => base.value * 2);
      let runs = 0;

      watch(() => {
        runs++;
        untrack(() => doubled.value);
      });
      base.value = 5;
      log.push(`runs:${runs}`, `value:${doubled.value}`);
    },
    expected: ['runs:1', 'value:10'],
  },
  {
    id: 'rx-rg-a-dependency-is-released-only-when-its-last-reader-goes',
    src: 'vue:effect#only-remove-dep-when-last-effect-stopped',
    run: (log) => {
      const count = signal(0);
      const first = watch(() => {
        count.value;
      });
      const second = watch(() => {
        count.value;
      });

      first();
      log.push(`after-first:${count.readers()}`);
      second();
      log.push(`after-second:${count.readers()}`);
    },
    expected: ['after-first:1', 'after-second:0'],
  },
  {
    id: 'rx-rg-an-effect-stopping-a-sibling-mid-flush-does-not-resurrect-it',
    src: 'vue:effect#should-resume-effects-when-a-watcher-stops-a-sibling',
    run: (log) => {
      const count = signal(0);
      let disposeSibling = () => {};

      watch(() => {
        if (count.value > 0) disposeSibling();
      });
      disposeSibling = watch(() => { log.push(`sibling:${count.value}`); });
      count.value = 1;
      count.value = 2;
      count.value = 3;
    },
    expected: ['sibling:0'],
  },
  {
    id: 'rx-rg-a-side-effect-inside-a-computed-does-not-corrupt-its-value',
    src: 'vue:computed#should-be-recomputed-without-being-affected-by-side-effects',
    run: (log) => {
      const base = signal(1);
      const audit = signal(0);
      const derived = computed(() => {
        audit.value = audit.peek() + 1;

        return base.value * 2;
      });

      base.value = 5;
      log.push(`value:${derived.value}`, `audits:${audit.peek()}`);
    },
    expected: ['value:10', 'audits:2'],
  },
  {
    id: 'rx-rg-repeated-reads-of-one-signal-clean-up-conditional-dependencies',
    src: 'solid:signals#repeated-signal-reads-clean-up-conditional-dependencies',
    run: (log) => {
      const gate = signal(true);
      const inner = signal(0);

      watch(() => {
        if (gate.value) {
          inner.value;
          inner.value;
          inner.value;
        }
      });
      log.push(`on:${inner.readers()}`);
      gate.value = false;
      log.push(`off:${inner.readers()}`);
    },
    expected: ['on:1', 'off:0'],
  },
  {
    id: 'rx-rg-repeated-signal-reads-update-once-per-write',
    src: 'solid:signals#repeated-signal-reads-update-once-per-write',
    run: (log) => {
      const count = signal(0);
      let runs = 0;

      watch(() => {
        count.value;
        count.value;
        runs++;
      });
      count.value = 1;
      log.push(`runs:${runs}`);
    },
    expected: ['runs:2'],
  },
  {
    id: 'rx-rg-an-equivalent-value-write-does-not-retrigger-a-memo',
    src: 'solid:signals#create-signal-and-set-equivalent-value-not-trigger-memo',
    run: (log) => {
      const count = signal(1);
      let computes = 0;
      const memo = computed(() => {
        computes++;

        return count.value * 10;
      });

      count.value = 1;
      log.push(`after-equivalent:${computes}`, `value:${memo.value}`);
      count.value = 2;
      log.push(`after-change:${computes}`, `value:${memo.value}`);
    },
    expected: ['after-equivalent:1', 'value:10', 'after-change:2', 'value:20'],
  },
  {
    id: 'rx-rg-a-signal-holding-a-function-value-is-not-invoked-by-the-store',
    src: 'solid:signals#create-and-read-a-signal-with-function-value',
    run: (log) => {
      const held = signal(() => 'called');

      log.push(`type:${typeof held.value}`, `result:${held.value()}`);
    },
    expected: ['type:function', 'result:called'],
  },
  {
    id: 'rx-rg-grouped-updates-with-repeated-sets-run-the-effect-once',
    src: 'solid:signals#groups-updates-with-repeated-sets',
    run: (log) => {
      const count = signal(0);
      let runs = 0;

      watch(() => {
        count.value;
        runs++;
      });
      batch(() => {
        count.value = 1;
        count.value = 2;
        count.value = 3;
      });
      log.push(`runs:${runs}`, `value:${count.peek()}`);
    },
    expected: ['runs:2', 'value:3'],
  },
  {
    id: 'rx-rg-cross-setting-inside-an-effect-update-settles',
    src: 'solid:signals#test-cross-setting-in-an-effect-update',
    run: (log) => {
      const source = signal(0);
      const mirror = signal(0);

      watch(() => {
        mirror.value = source.value + 1;
      });
      watch(() => { log.push(`mirror:${mirror.value}`); });
      source.value = 4;
      log.push(`final:${mirror.peek()}`);
    },
    expected: ['mirror:1', 'mirror:5', 'final:5'],
  },
  {
    id: 'rx-rg-an-explicit-root-disposal-releases-nested-computations',
    src: 'solid:signals#explicit-root-disposal',
    run: (log) => {
      const count = signal(0);
      let dispose = () => {};

      createRoot((disposeRoot) => {
        dispose = disposeRoot;
        watch(() => {
          count.value;
          onCleanup(() => log.push('inner-cleanup'));
        });
      });
      dispose();
      count.value = 1;
      log.push(`readers:${count.readers()}`);
    },
    expected: ['inner-cleanup', 'readers:0'],
  },
  {
    id: 'rx-rg-a-deeply-recursive-effect-terminates-through-its-own-guard',
    src: 'vue:effect#should-handle-deep-effect-recursion-using-cleanup-fallback',
    run: (log) => {
      const depth = signal(0);

      watch(() => {
        if (depth.value < 25) depth.value = depth.value + 1;
      });
      log.push(`settled:${depth.peek()}`);
    },
    expected: ['settled:25'],
  },
  {
    id: 'rx-rg-array-style-push-through-replacement-does-not-loop',
    src: 'vue:effect#should-avoid-infinite-recursive-loops-with-array-mutations',
    run: (log) => {
      const items = signal<number[]>([]);
      let runs = 0;

      watch(() => {
        items.value;
        runs++;
      });
      items.value = [...items.peek(), 1];
      items.value = [...items.peek(), 2];
      log.push(`runs:${runs}`, `items:${items.peek().join(',')}`);
    },
    expected: ['runs:3', 'items:1,2'],
  },
  {
    id: 'rx-rg-a-computed-whose-value-is-unchanged-does-not-invalidate-its-readers',
    src: 'vue:computed#should-not-trigger-when-computed-result-is-stable',
    run: (log) => {
      const raw = signal(1);
      const bucket = computed(() => raw.value > 0);
      let runs = 0;

      watch(() => {
        bucket.value;
        runs++;
      });
      for (let i = 2; i <= 5; i++) raw.value = i;
      log.push(`runs:${runs}`);
    },
    expected: ['runs:1'],
  },
  {
    id: 'rx-rg-an-effect-created-inside-another-effect-is-allowed-and-independent',
    src: 'vue:effect#should-allow-nested-effects',
    run: (log) => {
      const outer = signal(0);
      const inner = signal(0);
      let innerRuns = 0;

      watch(() => {
        outer.value;
        watch(() => {
          inner.value;
          innerRuns++;
        });
      });
      inner.value = 1;
      log.push(`inner-runs:${innerRuns}`);
    },
    expected: ['inner-runs:2'],
  },
];
