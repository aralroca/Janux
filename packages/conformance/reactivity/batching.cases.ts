import { batch, computed, signal, untrack, watch } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * `batch` beyond the basics the core corpus pins: nesting depth, what reads
 * observe mid-batch (writes land immediately, computeds settle on demand),
 * how disposal interacts with the queue, and that the flush preserves the
 * one-run-per-effect guarantee whatever happens inside the body.
 */
export const BATCHING_CASES: ScenarioCase[] = [
  {
    id: 'rx-bt-batch-with-no-writes-is-a-no-op',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      batch(() => {
        log.push('body');
      });
    },
    expected: ['run:0', 'body'],
  },
  {
    id: 'rx-bt-three-level-nesting-flushes-once-at-the-outermost-exit',
    src: 'preact:signals#deeply-nested-batch',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      batch(() => {
        batch(() => {
          batch(() => {
            count.value = 1;
          });
          log.push('mid');
        });
        count.value = 2;
        log.push('outer');
      });
    },
    expected: ['run:0', 'mid', 'outer', 'run:2'],
  },
  {
    id: 'rx-bt-a-net-unchanged-round-trip-still-reruns-once',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      batch(() => {
        count.value = 1;
        count.value = 0;
      });
    },
    expected: ['run:0', 'run:0'],
  },
  {
    id: 'rx-bt-mid-batch-signal-peek-sees-the-new-value',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      batch(() => {
        count.value = 1;
        log.push(`peek:${count.peek()}`);
      });
    },
    expected: ['peek:1'],
  },
  {
    id: 'rx-bt-mid-batch-computed-value-is-fresh',
    src: 'preact:signals#batch-computed-read',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      batch(() => {
        count.value = 5;
        log.push(`mid:${double.value}`);
      });
    },
    expected: ['mid:10'],
  },
  {
    id: 'rx-bt-mid-batch-computed-peek-is-also-fresh',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      batch(() => {
        count.value = 5;
        log.push(`mid-peek:${double.peek()}`);
      });
    },
    expected: ['mid-peek:10'],
  },
  {
    id: 'rx-bt-a-chained-computed-read-mid-batch-settles-the-whole-chain',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);
      const quad = computed(() => double.value * 2);

      batch(() => {
        count.value = 5;
        log.push(`quad:${quad.value}`);
      });
      log.push(`after:${quad.value}`);
    },
    expected: ['quad:20', 'after:20'],
  },
  {
    id: 'rx-bt-effects-are-not-flushed-by-a-mid-batch-computed-read',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      watch(() => { log.push(`run:${double.value}`); });
      batch(() => {
        count.value = 5;
        log.push(`read:${double.value}`);
        log.push('still-batching');
      });
    },
    expected: ['run:2', 'read:10', 'still-batching', 'run:10'],
  },
  {
    id: 'rx-bt-batch-inside-an-effect-joins-the-current-drain',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const a = signal(0);
      const b = signal(0);

      watch(() => { log.push(`pair:${a.value}:${b.value}`); });
      watch(() => {
        if (trigger.value === 1) {
          batch(() => {
            a.value = 1;
            b.value = 1;
          });
        }
      });
      trigger.value = 1;
    },
    expected: ['pair:0:0', 'pair:1:1'],
  },
  {
    id: 'rx-bt-untrack-inside-a-batch-does-not-stop-the-writes-from-batching',
    src: 'janux',
    run: (log) => {
      const a = signal(0);
      const b = signal(0);

      watch(() => { log.push(`run:${a.value}:${b.value}`); });
      batch(() => {
        untrack(() => {
          a.value = 1;
          b.value = 1;
        });
        log.push('written');
      });
    },
    expected: ['run:0:0', 'written', 'run:1:1'],
  },
  {
    id: 'rx-bt-batch-inside-untrack-flushes-normally',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      untrack(() => {
        batch(() => {
          count.value = 1;
        });
        log.push('after-inner-batch');
      });
    },
    expected: ['run:0', 'run:1', 'after-inner-batch'],
  },
  {
    id: 'rx-bt-an-effect-created-mid-batch-reruns-at-flush-when-its-dep-changed-later',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      batch(() => {
        watch(() => { log.push(`run:${count.value}`); });
        count.value = 1;
      });
    },
    expected: ['run:0', 'run:1'],
  },
  {
    id: 'rx-bt-an-effect-created-after-the-write-sees-the-new-value-without-a-flush-rerun',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      batch(() => {
        count.value = 1;
        watch(() => { log.push(`run:${count.value}`); });
      });
      log.push('flushed');
    },
    expected: ['run:1', 'flushed'],
  },
  {
    id: 'rx-bt-only-effects-whose-dependencies-changed-run-at-flush',
    src: 'preact:signals#batch-selective-flush',
    run: (log) => {
      const a = signal(0);
      const b = signal(0);

      watch(() => { log.push(`ea:${a.value}`); });
      watch(() => { log.push(`eb:${b.value}`); });
      batch(() => {
        a.value = 1;
      });
    },
    expected: ['ea:0', 'eb:0', 'ea:1'],
  },
  {
    id: 'rx-bt-flush-order-follows-write-order-across-disjoint-signals',
    src: 'janux',
    run: (log) => {
      const a = signal(0);
      const b = signal(0);

      watch(() => { log.push(`ea:${a.value}`); });
      watch(() => { log.push(`eb:${b.value}`); });
      batch(() => {
        b.value = 1;
        a.value = 1;
      });
    },
    expected: ['ea:0', 'eb:0', 'eb:1', 'ea:1'],
  },
  {
    id: 'rx-bt-throw-after-some-writes-flushes-what-was-queued',
    src: 'preact:signals#batch-throw-partial',
    run: (log) => {
      const a = signal(0);
      const b = signal(0);

      watch(() => { log.push(`run:${a.value}:${b.value}`); });
      attempt(log, 'batch', () =>
        batch(() => {
          a.value = 1;
          throw new Error('halt');
        }),
      );
      log.push(`b:${b.value}`);
    },
    expected: ['run:0:0', 'run:1:0', 'batch:threw:halt', 'b:0'],
  },
  {
    id: 'rx-bt-inner-batch-throw-caught-by-the-outer-body-still-flushes-once',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      batch(() => {
        count.value = 1;
        try {
          batch(() => {
            throw new Error('inner');
          });
        } catch {
          log.push('caught');
        }
        count.value = 2;
      });
    },
    expected: ['run:0', 'caught', 'run:2'],
  },
  {
    id: 'rx-bt-nested-batch-return-value-passes-through',
    src: 'janux',
    run: (log) => {
      log.push(String(batch(() => batch(() => 'inner-value'))));
    },
    expected: ['inner-value'],
  },
  {
    id: 'rx-bt-an-effect-throwing-at-flush-propagates-and-drops-the-rest-of-the-queue',
    src: 'janux',
    run: (log) => {
      const a = signal(0);
      const b = signal(0);

      watch(() => {
        if (a.value === 1) throw new Error('flush-boom');
        log.push(`ea:${a.value}`);
      });
      watch(() => { log.push(`eb:${b.value}`); });
      attempt(log, 'batch', () =>
        batch(() => {
          a.value = 1;
          b.value = 1;
        }),
      );
      log.push('recovered');
      b.value = 2;
    },
    expected: ['ea:0', 'eb:0', 'batch:threw:flush-boom', 'recovered', 'eb:2'],
  },
  {
    id: 'rx-bt-writes-during-the-flush-join-the-same-flush',
    src: 'janux',
    run: (log) => {
      const first = signal(0);
      const second = signal(0);

      watch(() => {
        if (first.value === 1) second.value = 1;
      });
      watch(() => { log.push(`chained:${second.value}`); });
      batch(() => {
        first.value = 1;
        log.push('body-done');
      });
      log.push('batch-done');
    },
    expected: ['chained:0', 'body-done', 'chained:1', 'batch-done'],
  },
  {
    id: 'rx-bt-two-signals-into-one-effect-and-one-each-flushes-every-affected-effect-once',
    src: 'janux',
    run: (log) => {
      const a = signal(0);
      const b = signal(0);

      watch(() => { log.push(`both:${a.value}:${b.value}`); });
      watch(() => { log.push(`only-a:${a.value}`); });
      watch(() => { log.push(`only-b:${b.value}`); });
      batch(() => {
        a.value = 1;
        b.value = 1;
      });
    },
    expected: [
      'both:0:0',
      'only-a:0',
      'only-b:0',
      'both:1:1',
      'only-a:1',
      'only-b:1',
    ],
  },
  {
    id: 'rx-bt-a-batched-computed-with-two-changed-deps-recomputes-once',
    src: 'preact:signals#batch-computed-coalesce',
    run: (log) => {
      const a = signal(1);
      const b = signal(2);
      let computes = 0;
      const sum = computed(() => {
        computes++;

        return a.value + b.value;
      });

      batch(() => {
        a.value = 10;
        b.value = 20;
      });
      log.push(`sum:${sum.value}`, `computes:${computes}`);
    },
    expected: ['sum:30', 'computes:2'],
  },
  {
    id: 'rx-bt-disposing-a-computed-mid-batch-skips-its-queued-recompute',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      watch(() => { log.push(`run:${double.value}`); });
      batch(() => {
        count.value = 5;
        double.dispose();
      });
      log.push(`frozen:${double.value}`);
    },
    expected: ['run:2', 'frozen:2'],
  },
  {
    id: 'rx-bt-a-mid-batch-read-of-a-just-disposed-computed-returns-the-frozen-value',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      batch(() => {
        count.value = 5;
        double.dispose();
        log.push(`mid:${double.value}`);
      });
    },
    expected: ['mid:2'],
  },
  {
    id: 'rx-bt-batch-returning-undefined-is-fine',
    src: 'janux',
    run: (log) => {
      log.push(String(batch(() => {})));
    },
    expected: ['undefined'],
  },
  {
    id: 'rx-bt-sequential-batches-flush-independently',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      batch(() => {
        count.value = 1;
      });
      batch(() => {
        count.value = 2;
      });
    },
    expected: ['run:0', 'run:1', 'run:2'],
  },
  {
    id: 'rx-bt-a-same-value-write-inside-a-batch-queues-nothing',
    src: 'janux',
    run: (log) => {
      const count = signal(1);

      watch(() => { log.push(`run:${count.value}`); });
      batch(() => {
        count.value = 1;
        log.push('body');
      });
      log.push('done');
    },
    expected: ['run:1', 'body', 'done'],
  },
  {
    id: 'rx-bt-writes-to-a-disposed-effects-dependency-mid-batch-are-harmless',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => { log.push(`run:${count.value}`); });

      dispose();
      batch(() => {
        count.value = 1;
      });
      log.push('done');
    },
    expected: ['run:0', 'done'],
  },
  {
    id: 'rx-bt-batch-preserves-cleanup-before-body-ordering-at-flush',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        log.push(`body:${count.value}`);

        return () => log.push('cleanup');
      });
      batch(() => {
        count.value = 1;
        count.value = 2;
      });
    },
    expected: ['body:0', 'cleanup', 'body:2'],
  },
  {
    id: 'rx-bt-reading-an-unwritten-signal-mid-batch-returns-its-current-value',
    src: 'janux',
    run: (log) => {
      const written = signal(0);
      const untouched = signal('same');

      batch(() => {
        written.value = 1;
        log.push(`untouched:${untouched.value}`);
      });
    },
    expected: ['untouched:same'],
  },
  {
    id: 'rx-bt-a-batch-inside-a-computed-derivation-coalesces-its-writes',
    src: 'janux',
    run: (log) => {
      const a = signal(0);
      const b = signal(0);
      const source = signal(1);

      watch(() => { log.push(`pair:${a.value}:${b.value}`); });
      computed(() => {
        const seen = source.value;

        batch(() => {
          a.value = seen;
          b.value = seen;
        });

        return seen;
      });
      source.value = 2;
    },
    expected: ['pair:0:0', 'pair:1:1', 'pair:2:2'],
  },
  {
    id: 'rx-bt-a-flush-error-wins-over-the-body-return-value',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        if (count.value === 1) throw new Error('flush-boom');
      });
      attempt(log, 'batch', () =>
        batch(() => {
          count.value = 1;

          return 'body-result';
        }),
      );
    },
    expected: ['batch:threw:flush-boom'],
  },
  {
    id: 'rx-bt-dispose-and-recreate-within-one-batch-runs-only-the-new-instance',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => { log.push(`old:${count.value}`); });

      batch(() => {
        count.value = 1;
        dispose();
        watch(() => { log.push(`new:${count.value}`); });
      });
      log.push('flushed');
    },
    expected: ['old:0', 'new:1', 'flushed'],
  },
];
