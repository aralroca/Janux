import { batch, computed, createRoot, signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Properties rather than examples: the same script run twice produces the same
 * log, graph shape does not depend on construction order, disposal is total,
 * and no path leaves hidden state behind for the next scenario.
 */
export const DETERMINISM_CASES: ScenarioCase[] = [
  {
    id: 'rx-dt-the-same-script-run-twice-produces-identical-logs',
    src: 'janux',
    run: (log) => {
      const script = (): string[] => {
        const trace: string[] = [];
        const count = signal(0);
        const doubled = computed(() => count.value * 2);

        watch(() => {
          trace.push(`run:${doubled.value}`);
        });
        count.value = 1;
        batch(() => {
          count.value = 2;
          count.value = 3;
        });

        return trace;
      };

      log.push(`identical:${script().join('|') === script().join('|')}`);
    },
    expected: ['identical:true'],
  },
  {
    id: 'rx-dt-effect-before-computed-and-computed-before-effect-agree-on-values',
    src: 'janux',
    run: (log) => {
      const effectFirst = (): string => {
        const base = signal(1);
        let seen = '';

        watch(() => {
          seen = `${base.value}`;
        });
        const doubled = computed(() => base.value * 2);

        base.value = 5;

        return `${seen}:${doubled.value}`;
      };
      const computedFirst = (): string => {
        const base = signal(1);
        const doubled = computed(() => base.value * 2);
        let seen = '';

        watch(() => {
          seen = `${base.value}`;
        });
        base.value = 5;

        return `${seen}:${doubled.value}`;
      };

      log.push(`same:${effectFirst() === computedFirst()}`);
    },
    expected: ['same:true'],
  },
  {
    id: 'rx-dt-a-batched-and-an-unbatched-sequence-reach-the-same-final-state',
    src: 'janux',
    run: (log) => {
      const finalState = (useBatch: boolean): string => {
        const a = signal(0);
        const b = signal(0);
        const total = computed(() => a.value + b.value);
        const apply = () => {
          a.value = 3;
          b.value = 4;
        };

        if (useBatch) batch(apply);
        else apply();

        return `${total.value}`;
      };

      log.push(`batched:${finalState(true)}`, `unbatched:${finalState(false)}`);
    },
    expected: ['batched:7', 'unbatched:7'],
  },
  {
    id: 'rx-dt-disposal-returns-a-signal-to-its-pristine-reader-count',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      log.push(`start:${count.readers()}`);
      createRoot((dispose) => {
        watch(() => {
          count.value;
        });
        computed(() => count.value);
        dispose();
      });
      log.push(`end:${count.readers()}`);
    },
    expected: ['start:0', 'end:0'],
  },
  {
    id: 'rx-dt-two-independent-graphs-do-not-share-state',
    src: 'janux',
    run: (log) => {
      const build = (label: string) => {
        const count = signal(0);

        watch(() => { log.push(`${label}:${count.value}`); });

        return count;
      };
      const first = build('first');

      build('second');
      first.value = 1;
    },
    expected: ['first:0', 'second:0', 'first:1'],
  },
  {
    id: 'rx-dt-repeating-a-write-sequence-after-a-teardown-reproduces-the-log',
    src: 'janux',
    run: (log) => {
      const run = (label: string) => {
        const count = signal(0);

        createRoot((dispose) => {
          watch(() => { log.push(`${label}:${count.value}`); });
          count.value = 1;
          dispose();
        });
        count.value = 2;
      };

      run('a');
      run('b');
    },
    expected: ['a:0', 'a:1', 'b:0', 'b:1'],
  },
  {
    id: 'rx-dt-a-computed-recompute-count-does-not-depend-on-how-many-readers-exist',
    src: 'janux',
    run: (log) => {
      const measure = (readers: number): number => {
        const count = signal(0);
        let computes = 0;
        const doubled = computed(() => {
          computes++;

          return count.value * 2;
        });

        for (let i = 0; i < readers; i++) {
          watch(() => {
            doubled.value;
          });
        }
        count.value = 1;

        return computes;
      };

      log.push(`one:${measure(1)}`, `five:${measure(5)}`);
    },
    expected: ['one:2', 'five:2'],
  },
  {
    id: 'rx-dt-the-order-of-two-independent-writes-does-not-change-final-values',
    src: 'janux',
    run: (log) => {
      const settle = (aFirst: boolean): string => {
        const a = signal(0);
        const b = signal(0);
        const label = computed(() => `${a.value}${b.value}`);

        if (aFirst) {
          a.value = 1;
          b.value = 2;
        } else {
          b.value = 2;
          a.value = 1;
        }

        return label.value;
      };

      log.push(`a-first:${settle(true)}`, `b-first:${settle(false)}`);
    },
    expected: ['a-first:12', 'b-first:12'],
  },
  {
    id: 'rx-dt-nesting-a-batch-does-not-change-the-observable-outcome',
    src: 'janux',
    run: (log) => {
      const runs = (nested: boolean): number => {
        const count = signal(0);
        let seen = 0;

        watch(() => {
          count.value;
          seen++;
        });
        batch(() => {
          count.value = 1;
          if (nested) {
            batch(() => {
              count.value = 2;
            });
          } else count.value = 2;
        });

        return seen;
      };

      log.push(`nested:${runs(true)}`, `flat:${runs(false)}`);
    },
    expected: ['nested:2', 'flat:2'],
  },
  {
    id: 'rx-dt-an-effect-and-its-clone-observe-the-same-sequence',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const first: number[] = [];
      const second: number[] = [];

      watch(() => {
        first.push(count.value);
      });
      watch(() => {
        second.push(count.value);
      });
      count.value = 1;
      batch(() => {
        count.value = 2;
        count.value = 3;
      });
      log.push(`identical:${first.join(',') === second.join(',')}`, `seq:${first.join(',')}`);
    },
    expected: ['identical:true', 'seq:0,1,3'],
  },
];
