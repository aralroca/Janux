import { batch, computed, signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * `peek` is the escape hatch that reads without joining the dependency set.
 * These cases pin the matrix: peek on signals vs computeds, before/after
 * writes, inside batches, inside derivations, and the loop-avoidance patterns
 * that only work because peek does not subscribe.
 */
export const PEEK_SEMANTICS_CASES: ScenarioCase[] = [
  {
    id: 'rx-pk-peek-outside-any-effect-is-just-a-read',
    src: 'janux',
    run: (log) => {
      const count = signal(1);

      log.push(`peek:${count.peek()}`, `readers:${count.readers()}`);
    },
    expected: ['peek:1', 'readers:0'],
  },
  {
    id: 'rx-pk-a-peek-only-effect-never-reruns',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.peek()}`); });
      count.value = 1;
      count.value = 2;
      log.push('done');
    },
    expected: ['run:0', 'done'],
  },
  {
    id: 'rx-pk-peek-lets-an-effect-write-its-own-signal-without-looping',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const total = signal(0);

      watch(() => {
        total.value = total.peek() + trigger.value;
      });
      trigger.value = 2;
      trigger.value = 3;
      log.push(`total:${total.peek()}`);
    },
    expected: ['total:5'],
  },
  {
    id: 'rx-pk-peek-inside-a-computed-freezes-that-input',
    src: 'janux',
    run: (log) => {
      const tracked = signal(1);
      const frozen = signal(10);
      const mixed = computed(() => tracked.value + frozen.peek());

      watch(() => { log.push(`run:${mixed.value}`); });
      frozen.value = 100;
      tracked.value = 2;
    },
    expected: ['run:11', 'run:102'],
  },
  {
    id: 'rx-pk-peek-of-a-computed-inside-an-effect-blocks-the-subscription',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      watch(() => { log.push(`run:${double.peek()}`); });
      count.value = 5;
      log.push(`fresh:${double.peek()}`);
    },
    expected: ['run:2', 'fresh:10'],
  },
  {
    id: 'rx-pk-peek-mid-batch-sees-writes-already-made-in-that-batch',
    src: 'janux',
    run: (log) => {
      const a = signal(0);
      const b = signal(0);

      batch(() => {
        a.value = 1;
        log.push(`a:${a.peek()}`, `b:${b.peek()}`);
        b.value = 2;
        log.push(`b-after:${b.peek()}`);
      });
    },
    expected: ['a:1', 'b:0', 'b-after:2'],
  },
  {
    id: 'rx-pk-peek-of-a-computed-mid-batch-forces-it-fresh',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      batch(() => {
        log.push(`before:${double.peek()}`);
        count.value = 5;
        log.push(`after:${double.peek()}`);
      });
    },
    expected: ['before:2', 'after:10'],
  },
  {
    id: 'rx-pk-mixing-peek-and-value-of-two-signals-tracks-only-the-value-read',
    src: 'janux',
    run: (log) => {
      const tracked = signal(0);
      const peeked = signal(0);

      watch(() => {
        tracked.value;
        peeked.peek();
      });
      log.push(`tracked:${tracked.readers()}`, `peeked:${peeked.readers()}`);
    },
    expected: ['tracked:1', 'peeked:0'],
  },
  {
    id: 'rx-pk-peek-in-a-cleanup-reads-the-value-at-teardown-time',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => {
        count.value;

        return () => log.push(`cleanup-sees:${count.peek()}`);
      });

      count.value = 1;
      count.value = 2;
      dispose();
    },
    expected: ['cleanup-sees:1', 'cleanup-sees:2', 'cleanup-sees:2'],
  },
  {
    id: 'rx-pk-peek-of-a-disposed-computed-returns-the-frozen-value',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      double.dispose();
      count.value = 9;
      log.push(`peek:${double.peek()}`);
    },
    expected: ['peek:2'],
  },
  {
    id: 'rx-pk-a-guard-comparing-peek-to-the-incoming-value-avoids-redundant-writes',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      let runs = 0;

      watch(() => {
        count.value;
        runs++;
      });
      const set = (next: number) => {
        if (count.peek() !== next) count.value = next;
      };

      set(1);
      set(2);
      set(2);
      log.push(`runs:${runs}`);
    },
    expected: ['runs:2'],
  },
  {
    id: 'rx-pk-peek-after-a-conditional-branch-drop-still-reads-the-live-value',
    src: 'janux',
    run: (log) => {
      const gate = signal(true);
      const payload = signal('a');

      watch(() => {
        if (gate.value) payload.value;
      });
      gate.value = false;
      payload.value = 'b';
      log.push(`peek:${payload.peek()}`, `readers:${payload.readers()}`);
    },
    expected: ['peek:b', 'readers:0'],
  },
  {
    id: 'rx-pk-peek-inside-a-batch-callback-of-a-computed-does-not-force-a-flush-of-effects',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const doubled = computed(() => count.value * 2);

      watch(() => { log.push(`effect:${doubled.value}`); });
      batch(() => {
        count.value = 4;
        log.push(`peek:${doubled.peek()}`);
      });
    },
    expected: ['effect:2', 'peek:8', 'effect:8'],
  },
  {
    id: 'rx-pk-a-swap-implemented-with-two-peeks-reruns-readers-once-per-write',
    src: 'janux',
    run: (log) => {
      const left = signal('a');
      const right = signal('b');

      watch(() => { log.push(`pair:${left.value}${right.value}`); });
      const leftValue = left.peek();
      const rightValue = right.peek();

      batch(() => {
        left.value = rightValue;
        right.value = leftValue;
      });
    },
    expected: ['pair:ab', 'pair:ba'],
  },
  {
    id: 'rx-pk-peek-of-a-signal-written-during-the-same-effect-run-reads-back-the-write',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const scratch = signal(0);

      watch(() => {
        trigger.value;
        scratch.value = scratch.peek() + 1;
        log.push(`scratch:${scratch.peek()}`);
      });
      trigger.value = 1;
    },
    expected: ['scratch:1', 'scratch:2'],
  },
];
