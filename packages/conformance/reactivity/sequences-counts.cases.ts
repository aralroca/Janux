import { batch, computed, signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Run-count arithmetic over scripted write sequences. Janux is synchronous
 * with no scheduler dedupe across writes — one distinct unbatched write is
 * exactly one flush — so counts are provable invariants, not races.
 */
export const SEQUENCE_COUNT_CASES: ScenarioCase[] = [
  {
    id: 'rx-sq-ten-unbatched-writes-are-ten-reruns',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let runs = 0;

      watch(() => {
        count.value;
        runs++;
      });
      for (let i = 1; i <= 10; i++) count.value = i;
      log.push(`runs:${runs}`);
    },
    expected: ['runs:11'],
  },
  {
    id: 'rx-sq-ten-writes-in-one-batch-are-one-rerun',
    src: 'preact:signals#batch-many-writes',
    run: (log) => {
      const count = signal(0);
      let runs = 0;

      watch(() => {
        count.value;
        runs++;
      });
      batch(() => {
        for (let i = 1; i <= 10; i++) count.value = i;
      });
      log.push(`runs:${runs}`, `value:${count.peek()}`);
    },
    expected: ['runs:2', 'value:10'],
  },
  {
    id: 'rx-sq-duplicate-values-in-a-sequence-do-not-count',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let runs = 0;

      watch(() => {
        count.value;
        runs++;
      });
      [1, 1, 2, 2, 3, 3].forEach((next) => (count.value = next));
      log.push(`runs:${runs}`);
    },
    expected: ['runs:4'],
  },
  {
    id: 'rx-sq-five-batches-of-two-writes-are-five-reruns',
    src: 'janux',
    run: (log) => {
      const a = signal(0);
      const b = signal(0);
      let runs = 0;

      watch(() => {
        a.value;
        b.value;
        runs++;
      });
      for (let i = 1; i <= 5; i++) {
        batch(() => {
          a.value = i;
          b.value = i;
        });
      }
      log.push(`runs:${runs}`);
    },
    expected: ['runs:6'],
  },
  {
    id: 'rx-sq-a-toggle-round-trip-costs-two-runs-unbatched-and-one-batched',
    src: 'janux',
    run: (log) => {
      const on = signal(false);
      let runs = 0;

      watch(() => {
        on.value;
        runs++;
      });
      on.value = true;
      on.value = false;
      log.push(`unbatched:${runs - 1}`);
      runs = 0;
      batch(() => {
        on.value = true;
        on.value = false;
      });
      log.push(`batched:${runs}`);
    },
    expected: ['unbatched:2', 'batched:1'],
  },
  {
    id: 'rx-sq-computed-recomputes-track-distinct-writes-only',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let computes = 0;

      computed(() => {
        computes++;

        return count.value;
      });
      count.value = 1;
      count.value = 1;
      batch(() => {
        count.value = 2;
        count.value = 3;
      });
      log.push(`computes:${computes}`);
    },
    expected: ['computes:3'],
  },
  {
    id: 'rx-sq-cleanup-count-lags-run-count-by-exactly-one',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let runs = 0;
      let cleanups = 0;

      watch(() => {
        count.value;
        runs++;

        return () => cleanups++;
      });
      count.value = 1;
      count.value = 2;
      count.value = 3;
      log.push(`runs:${runs}`, `cleanups:${cleanups}`);
    },
    expected: ['runs:4', 'cleanups:3'],
  },
  {
    id: 'rx-sq-readers-stay-constant-across-a-long-write-sequence',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        count.value;
      });
      for (let i = 1; i <= 50; i++) count.value = i;
      log.push(`readers:${count.readers()}`);
    },
    expected: ['readers:1'],
  },
  {
    id: 'rx-sq-a-chain-multiplies-nothing-n-writes-are-n-tip-runs',
    src: 'janux',
    run: (log) => {
      const base = signal(0);
      const mid = computed(() => base.value + 1);
      const tip = computed(() => mid.value + 1);
      let runs = 0;

      watch(() => {
        tip.value;
        runs++;
      });
      base.value = 1;
      base.value = 2;
      base.value = 3;
      log.push(`runs:${runs}`);
    },
    expected: ['runs:4'],
  },
  {
    id: 'rx-sq-run-count-is-independent-of-read-count-inside-the-body',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let runs = 0;

      watch(() => {
        for (let i = 0; i < 5; i++) count.value;
        runs++;
      });
      count.value = 1;
      log.push(`runs:${runs}`);
    },
    expected: ['runs:2'],
  },
  {
    id: 'rx-sq-two-effects-double-the-total-runs-not-the-flushes',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let totalRuns = 0;

      watch(() => {
        count.value;
        totalRuns++;
      });
      watch(() => {
        count.value;
        totalRuns++;
      });
      count.value = 1;
      count.value = 2;
      log.push(`total:${totalRuns}`);
    },
    expected: ['total:6'],
  },
  {
    id: 'rx-sq-a-batch-per-iteration-inside-an-outer-batch-still-flushes-once',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let runs = 0;

      watch(() => {
        count.value;
        runs++;
      });
      batch(() => {
        for (let i = 1; i <= 3; i++) {
          batch(() => {
            count.value = i;
          });
        }
      });
      log.push(`runs:${runs}`);
    },
    expected: ['runs:2'],
  },
  {
    id: 'rx-sq-alternating-batched-and-unbatched-writes-add-up-predictably',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let runs = 0;

      watch(() => {
        count.value;
        runs++;
      });
      count.value = 1;
      batch(() => {
        count.value = 2;
        count.value = 3;
      });
      count.value = 4;
      log.push(`runs:${runs}`);
    },
    expected: ['runs:4'],
  },
  {
    id: 'rx-sq-a-cascade-adds-exactly-one-extra-run-per-relay-step',
    src: 'janux',
    run: (log) => {
      const source = signal(0);
      const relay = signal(0);
      let runs = 0;

      watch(() => {
        relay.value = source.value;
      });
      watch(() => {
        relay.value;
        runs++;
      });
      source.value = 1;
      source.value = 2;
      log.push(`runs:${runs}`);
    },
    expected: ['runs:3'],
  },
  {
    id: 'rx-sq-dispose-halfway-through-a-sequence-halves-the-runs',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let runs = 0;
      const dispose = watch(() => {
        count.value;
        runs++;
      });

      for (let i = 1; i <= 3; i++) count.value = i;
      dispose();
      for (let i = 4; i <= 6; i++) count.value = i;
      log.push(`runs:${runs}`);
    },
    expected: ['runs:4'],
  },
  {
    id: 'rx-sq-a-computed-chain-of-three-adds-no-extra-effect-runs',
    src: 'janux',
    run: (log) => {
      const base = signal(0);
      const l1 = computed(() => base.value + 1);
      const l2 = computed(() => l1.value + 1);
      const l3 = computed(() => l2.value + 1);
      let effectRuns = 0;
      let l3Computes = 0;

      computed(() => {
        l3Computes++;

        return l3.value;
      });
      watch(() => {
        l3.value;
        effectRuns++;
      });
      base.value = 1;
      base.value = 2;
      log.push(`effect:${effectRuns}`, `l3:${l3Computes}`);
    },
    expected: ['effect:3', 'l3:3'],
  },
];
