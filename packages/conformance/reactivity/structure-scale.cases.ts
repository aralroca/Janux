import { batch, computed, createRoot, signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Wide and deep graph shapes: fan-in, fan-out, long relay cascades and bulk
 * teardown. The invariants (one run per flush, drain-to-completion, full
 * detach on dispose) must hold at structural scale, not just for pairs.
 */
export const STRUCTURE_SCALE_CASES: ScenarioCase[] = [
  {
    id: 'rx-sc-one-effect-over-ten-signals-reruns-once-per-single-write',
    src: 'janux',
    run: (log) => {
      const cells = Array.from({ length: 10 }, () => signal(0));
      let runs = 0;

      watch(() => {
        cells.forEach((cell) => cell.value);
        runs++;
      });
      cells[7]!.value = 1;
      log.push(`runs:${runs}`);
    },
    expected: ['runs:2'],
  },
  {
    id: 'rx-sc-ten-effects-on-one-signal-run-in-creation-order',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const seen: number[] = [];

      for (let i = 0; i < 10; i++) {
        const index = i;

        watch(() => {
          count.value;
          seen.push(index);
        });
      }
      seen.length = 0;
      count.value = 1;
      log.push(`order:${seen.join(',')}`);
    },
    expected: ['order:0,1,2,3,4,5,6,7,8,9'],
  },
  {
    id: 'rx-sc-a-five-branch-fan-out-lands-in-one-consistent-effect-run',
    src: 'janux',
    run: (log) => {
      const base = signal(0);
      const branches = Array.from({ length: 5 }, (_, i) => computed(() => base.value + i));
      let runs = 0;
      let lastSnapshot = '';

      watch(() => {
        lastSnapshot = branches.map((branch) => branch.value).join(',');
        runs++;
      });
      base.value = 10;
      log.push(`runs:${runs}`, `snapshot:${lastSnapshot}`);
    },
    expected: ['runs:2', 'snapshot:10,11,12,13,14'],
  },
  {
    id: 'rx-sc-a-ten-relay-effect-cascade-drains-in-one-flush',
    src: 'janux',
    run: (log) => {
      const stages = Array.from({ length: 11 }, () => signal(0));

      for (let i = 0; i < 10; i++) {
        const from = stages[i]!;
        const to = stages[i + 1]!;

        watch(() => {
          if (from.value > 0) to.value = from.value + 1;
        });
      }
      stages[0]!.value = 1;
      log.push(`end:${stages[10]!.peek()}`);
    },
    expected: ['end:11'],
  },
  {
    id: 'rx-sc-a-ten-level-computed-tower-updates-through-every-floor',
    src: 'janux',
    run: (log) => {
      const base = signal(0);
      let top = computed(() => base.value);

      for (let level = 0; level < 10; level++) {
        const below = top;

        top = computed(() => below.value + 1);
      }
      base.value = 5;
      log.push(`top:${top.value}`);
    },
    expected: ['top:15'],
  },
  {
    id: 'rx-sc-one-root-dispose-detaches-ten-effects-at-once',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      createRoot((dispose) => {
        for (let i = 0; i < 10; i++) {
          watch(() => {
            count.value;
          });
        }
        log.push(`live:${count.readers()}`);
        dispose();
      });
      log.push(`after:${count.readers()}`);
    },
    expected: ['live:10', 'after:0'],
  },
  {
    id: 'rx-sc-disposing-the-middle-root-of-three-leaves-the-others-live',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const disposers: (() => void)[] = [];

      ['a', 'b', 'c'].forEach((label) => {
        createRoot((dispose) => {
          disposers.push(dispose);
          watch(() => { log.push(`${label}:${count.value}`); });
        });
      });
      disposers[1]!();
      count.value = 1;
    },
    expected: ['a:0', 'b:0', 'c:0', 'a:1', 'c:1'],
  },
  {
    id: 'rx-sc-a-two-by-two-product-grid-stays-consistent-under-batch',
    src: 'janux',
    run: (log) => {
      const x = signal(2);
      const y = signal(3);
      const sum = computed(() => x.value + y.value);
      const product = computed(() => x.value * y.value);

      watch(() => { log.push(`grid:${sum.value}:${product.value}`); });
      batch(() => {
        x.value = 4;
        y.value = 5;
      });
    },
    expected: ['grid:5:6', 'grid:9:20'],
  },
  {
    id: 'rx-sc-overlapping-dependency-matrices-rerun-exactly-the-affected-effects',
    src: 'janux',
    run: (log) => {
      const a = signal(0);
      const b = signal(0);
      const c = signal(0);

      watch(() => { log.push(`ab:${a.value}${b.value}`); });
      watch(() => { log.push(`bc:${b.value}${c.value}`); });
      watch(() => { log.push(`ca:${c.value}${a.value}`); });
      b.value = 1;
    },
    expected: ['ab:00', 'bc:00', 'ca:00', 'ab:01', 'bc:10'],
  },
  {
    id: 'rx-sc-batching-a-write-to-every-cell-still-runs-the-aggregate-once',
    src: 'janux',
    run: (log) => {
      const cells = Array.from({ length: 10 }, () => signal(1));
      let runs = 0;
      const total = computed(() => cells.reduce((sum, cell) => sum + cell.value, 0));

      watch(() => {
        total.value;
        runs++;
      });
      batch(() => {
        cells.forEach((cell) => {
          cell.value = 2;
        });
      });
      log.push(`runs:${runs}`, `total:${total.value}`);
    },
    expected: ['runs:2', 'total:20'],
  },
  {
    id: 'rx-sc-a-fan-in-of-ten-computeds-into-one-effect-runs-once-per-source-write',
    src: 'janux',
    run: (log) => {
      const base = signal(0);
      const derived = Array.from({ length: 10 }, (_, i) => computed(() => base.value + i));
      let runs = 0;

      watch(() => {
        derived.forEach((cell) => cell.value);
        runs++;
      });
      base.value = 1;
      base.value = 2;
      log.push(`runs:${runs}`);
    },
    expected: ['runs:3'],
  },
  {
    id: 'rx-sc-a-hundred-signals-with-one-reader-each-detach-together-on-root-dispose',
    src: 'janux',
    run: (log) => {
      const cells = Array.from({ length: 100 }, () => signal(0));

      createRoot((dispose) => {
        cells.forEach((cell) => {
          watch(() => {
            cell.value;
          });
        });
        log.push(`live:${cells.filter((cell) => cell.readers() === 1).length}`);
        dispose();
      });
      log.push(`detached:${cells.filter((cell) => cell.readers() === 0).length}`);
    },
    expected: ['live:100', 'detached:100'],
  },
  {
    id: 'rx-sc-a-deep-cascade-of-twenty-relays-settles-in-one-write',
    src: 'janux',
    run: (log) => {
      const stages = Array.from({ length: 21 }, () => signal(0));

      for (let i = 0; i < 20; i++) {
        const from = stages[i]!;
        const to = stages[i + 1]!;

        watch(() => {
          to.value = from.value;
        });
      }
      stages[0]!.value = 7;
      log.push(`end:${stages[20]!.peek()}`);
    },
    expected: ['end:7'],
  },
  {
    id: 'rx-sc-a-wide-batch-across-many-effects-flushes-each-exactly-once',
    src: 'janux',
    run: (log) => {
      const shared = signal(0);
      let totalRuns = 0;

      for (let i = 0; i < 20; i++) {
        watch(() => {
          shared.value;
          totalRuns++;
        });
      }
      totalRuns = 0;
      batch(() => {
        shared.value = 1;
        shared.value = 2;
      });
      log.push(`runs:${totalRuns}`);
    },
    expected: ['runs:20'],
  },
];
