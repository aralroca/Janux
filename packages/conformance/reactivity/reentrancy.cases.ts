import { batch, computed, signal, untrack, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Writes issued from inside the reactive system itself: effects writing their
 * own or each other's dependencies, convergence instead of livelock, and the
 * guarantee that a cascade drains inside the same flush that started it.
 */
export const REENTRANCY_CASES: ScenarioCase[] = [
  {
    id: 'rx-re-a-guarded-self-write-converges-iteratively',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        log.push(`run:${count.value}`);
        if (count.value < 3) count.value++;
      });
    },
    expected: ['run:0', 'run:1', 'run:2', 'run:3'],
  },
  {
    id: 'rx-re-an-effect-writing-another-signal-cascades-in-the-same-drain',
    src: 'janux',
    run: (log) => {
      const first = signal(0);
      const second = signal(0);

      watch(() => {
        log.push(`writer:${first.value}`);
        if (first.value === 1) second.value = 1;
      });
      watch(() => { log.push(`reader:${second.value}`); });
      first.value = 1;
      log.push('drained');
    },
    expected: ['writer:0', 'reader:0', 'writer:1', 'reader:1', 'drained'],
  },
  {
    id: 'rx-re-an-effect-can-run-twice-in-one-drain-when-a-later-effect-writes-its-dep',
    src: 'janux',
    run: (log) => {
      const source = signal(0);
      const derived = signal(0);

      watch(() => { log.push(`early:${source.value}:${derived.value}`); });
      watch(() => {
        derived.value = source.value;
      });
      source.value = 1;
    },
    expected: ['early:0:0', 'early:1:0', 'early:1:1'],
  },
  {
    id: 'rx-re-a-self-write-of-the-same-value-does-not-loop',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        log.push(`run:${count.value}`);
        count.value = count.peek();
      });
      count.value = 1;
    },
    expected: ['run:0', 'run:1'],
  },
  {
    id: 'rx-re-the-peek-counter-pattern-does-not-self-subscribe',
    src: 'preact:signals#counter-via-peek',
    run: (log) => {
      const trigger = signal(0);
      const runs = signal(0);

      watch(() => {
        trigger.value;
        runs.value = runs.peek() + 1;
      });
      trigger.value = 1;
      trigger.value = 2;
      log.push(`runs:${runs.peek()}`);
    },
    expected: ['runs:3'],
  },
  {
    id: 'rx-re-a-write-during-the-eager-first-run-notifies-existing-subscribers-inline',
    src: 'janux',
    run: (log) => {
      const shared = signal(0);

      watch(() => { log.push(`sub:${shared.value}`); });
      watch(() => {
        shared.value = 1;
      });
      log.push('created');
    },
    expected: ['sub:0', 'sub:1', 'created'],
  },
  {
    id: 'rx-re-a-two-effect-write-cycle-terminates-via-equality',
    src: 'janux',
    run: (log) => {
      const left = signal(1);
      const right = signal(1);

      watch(() => {
        log.push(`sync-right:${left.value}`);
        right.value = left.value;
      });
      watch(() => {
        log.push(`sync-left:${right.value}`);
        left.value = right.value;
      });
      left.value = 2;
      log.push(`settled:${left.peek()}:${right.peek()}`);
    },
    expected: [
      'sync-right:1',
      'sync-left:1',
      'sync-right:2',
      'sync-left:2',
      'settled:2:2',
    ],
  },
  {
    id: 'rx-re-a-three-signal-relay-chain-drains-in-one-flush',
    src: 'janux',
    run: (log) => {
      const a = signal(0);
      const b = signal(0);
      const c = signal(0);

      watch(() => {
        if (a.value === 1) b.value = 1;
      });
      watch(() => {
        if (b.value === 1) c.value = 1;
      });
      watch(() => { log.push(`c:${c.value}`); });
      a.value = 1;
      log.push('drained');
    },
    expected: ['c:0', 'c:1', 'drained'],
  },
  {
    id: 'rx-re-effect-writes-mid-batch-body-are-still-deferred-to-the-flush',
    src: 'janux',
    run: (log) => {
      const relay = signal(0);
      const observed = signal(0);

      watch(() => { log.push(`observed:${observed.value}`); });
      watch(() => {
        if (relay.value === 1) observed.value = 1;
      });
      batch(() => {
        relay.value = 1;
        log.push(`mid:${observed.peek()}`);
      });
    },
    expected: ['observed:0', 'mid:0', 'observed:1'],
  },
  {
    id: 'rx-re-an-untracked-write-from-an-effect-still-cascades',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const mirror = signal(0);

      watch(() => { log.push(`mirror:${mirror.value}`); });
      watch(() => {
        const seen = trigger.value;

        untrack(() => {
          mirror.value = seen;
        });
      });
      trigger.value = 5;
    },
    expected: ['mirror:0', 'mirror:5'],
  },
  {
    id: 'rx-re-a-computed-refreshes-between-cascaded-effects',
    src: 'janux',
    run: (log) => {
      const source = signal(1);
      const relay = signal(1);
      const derived = computed(() => relay.value * 10);

      watch(() => {
        relay.value = source.value;
      });
      watch(() => { log.push(`pair:${relay.value}:${derived.value}`); });
      source.value = 2;
    },
    expected: ['pair:1:10', 'pair:2:20'],
  },
  {
    id: 'rx-re-mutual-increment-with-a-floor-guard-settles',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        if (count.value % 2 === 1) count.value++;
      });
      count.value = 1;
      count.value = 5;
      log.push(`settled:${count.peek()}`);
    },
    expected: ['settled:6'],
  },
  {
    id: 'rx-re-a-writer-effect-disposed-mid-cascade-stops-writing',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const target = signal(0);
      let disposeWriter = () => {};

      disposeWriter = watch(() => {
        if (trigger.value > 0) {
          target.value = trigger.value;
          disposeWriter();
        }
      });
      watch(() => { log.push(`target:${target.value}`); });
      trigger.value = 1;
      trigger.value = 2;
      log.push(`final:${target.peek()}`);
    },
    expected: ['target:0', 'target:1', 'final:1'],
  },
  {
    id: 'rx-re-writes-from-an-impure-computed-defer-to-the-drain-like-effect-writes',
    src: 'janux',
    run: (log) => {
      const source = signal(1);
      const echo = signal(0);

      watch(() => { log.push(`echo:${echo.value}`); });
      computed(() => {
        echo.value = source.value;

        return source.value;
      });
      source.value = 2;
      log.push('done');
    },
    expected: ['echo:0', 'echo:1', 'echo:2', 'done'],
  },
  {
    id: 'rx-re-cascade-depth-is-bounded-by-value-convergence-not-run-counts',
    src: 'janux',
    run: (log) => {
      const count = signal(10);

      watch(() => {
        if (count.value > 0) count.value = Math.floor(count.value / 2);
      });
      log.push(`settled:${count.peek()}`);
    },
    expected: ['settled:0'],
  },
  {
    id: 'rx-re-two-cascading-writers-into-one-reader-coalesce-per-step',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const left = signal(0);
      const right = signal(0);

      watch(() => {
        if (trigger.value === 1) {
          left.value = 1;
          right.value = 1;
        }
      });
      watch(() => { log.push(`pair:${left.value}:${right.value}`); });
      trigger.value = 1;
    },
    expected: ['pair:0:0', 'pair:1:1'],
  },
  {
    id: 'rx-re-an-impure-computed-flushed-by-a-mid-batch-read-defers-its-effects',
    src: 'janux',
    run: (log) => {
      const source = signal(1);
      const echo = signal(0);
      const impure = computed(() => {
        echo.value = source.value;

        return source.value;
      });

      watch(() => { log.push(`echo:${echo.value}`); });
      batch(() => {
        source.value = 2;
        log.push(`read:${impure.value}`);
        log.push('still-batching');
      });
    },
    expected: ['echo:1', 'read:2', 'still-batching', 'echo:2'],
  },
  {
    id: 'rx-re-two-writers-to-one-target-coalesce-the-reader-to-the-last-value',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const target = signal(0);

      watch(() => {
        if (trigger.value === 1) target.value = 10;
      });
      watch(() => {
        if (trigger.value === 1) target.value = 20;
      });
      watch(() => { log.push(`target:${target.value}`); });
      trigger.value = 1;
      log.push(`final:${target.peek()}`);
    },
    expected: ['target:0', 'target:20', 'final:20'],
  },
];
