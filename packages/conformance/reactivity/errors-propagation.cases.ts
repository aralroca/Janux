import { batch, computed, signal, watch } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Errors are never swallowed: they surface at the write (or read) that caused
 * the work, they abort the remainder of the current flush, and they leave the
 * system consistent enough that the NEXT write behaves normally.
 */
export const ERROR_PROPAGATION_CASES: ScenarioCase[] = [
  {
    id: 'rx-er-an-error-two-cascade-hops-away-reaches-the-original-writer',
    src: 'janux',
    run: (log) => {
      const source = signal(0);
      const relay = signal(0);

      watch(() => {
        if (source.value === 1) relay.value = 1;
      });
      watch(() => {
        if (relay.value === 1) throw new Error('deep-boom');
      });
      attempt(log, 'write', () => (source.value = 1));
    },
    expected: ['write:threw:deep-boom'],
  },
  {
    id: 'rx-er-an-unbatched-throwing-flush-recovers-on-the-next-write',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        if (count.value === 1) throw new Error('boom');
        log.push(`run:${count.value}`);
      });
      attempt(log, 'poison', () => (count.value = 1));
      attempt(log, 'healthy', () => (count.value = 2));
    },
    expected: ['run:0', 'poison:threw:boom', 'run:2', 'healthy:ok'],
  },
  {
    id: 'rx-er-a-throwing-effect-drops-the-rest-of-the-unbatched-queue',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        if (count.value === 1) throw new Error('boom');
      });
      watch(() => { log.push(`later:${count.value}`); });
      attempt(log, 'write', () => (count.value = 1));
      count.value = 2;
    },
    expected: ['later:0', 'write:threw:boom', 'later:2'],
  },
  {
    id: 'rx-er-a-computed-that-throws-at-a-mid-batch-read-surfaces-at-the-read',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const strict = computed(() => {
        if (count.value > 1) throw new Error('boom');

        return count.value * 2;
      });

      batch(() => {
        count.value = 2;
        attempt(log, 'read', () => strict.value);
      });
      log.push(`stale:${strict.peek()}`);
    },
    expected: ['read:threw:boom', 'stale:2'],
  },
  {
    id: 'rx-er-an-inline-created-effect-that-throws-propagates-through-the-outer-run',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        if (count.value === 1) {
          watch(() => {
            throw new Error('inner-boom');
          });
        }
        log.push(`outer:${count.value}`);
      });
      attempt(log, 'write', () => (count.value = 1));
    },
    expected: ['outer:0', 'write:threw:inner-boom'],
  },
  {
    id: 'rx-er-a-throwing-diamond-branch-leaves-the-other-branch-stale',
    src: 'janux',
    run: (log) => {
      const base = signal(1);
      const strict = computed(() => {
        if (base.value === 2) throw new Error('left-boom');

        return base.value + 1;
      });
      const relaxed = computed(() => base.value + 10);

      attempt(log, 'poison', () => (base.value = 2));
      log.push(`right-stale:${relaxed.peek()}`);
      attempt(log, 'recover', () => (base.value = 3));
      log.push(`left:${strict.value}`, `right:${relaxed.value}`);
    },
    expected: [
      'poison:threw:left-boom',
      'right-stale:11',
      'recover:ok',
      'left:4',
      'right:13',
    ],
  },
  {
    id: 'rx-er-sibling-subscriptions-survive-anothers-throw',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        if (count.value === 1) throw new Error('boom');
      });
      const healthy = signal(0);

      watch(() => {
        count.value;
        healthy.value;
        log.push(`healthy:${count.value}:${healthy.value}`);
      });
      attempt(log, 'write', () => (count.value = 1));
      healthy.value = 5;
    },
    expected: ['healthy:0:0', 'write:threw:boom', 'healthy:1:5'],
  },
  {
    id: 'rx-er-repeated-poison-writes-throw-every-time',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const strict = computed(() => {
        if (count.value < 0) throw new Error('negative');

        return count.value;
      });

      watch(() => {
        strict.value;
      });
      attempt(log, 'first', () => (count.value = -1));
      attempt(log, 'second', () => (count.value = -2));
      log.push(`value:${strict.peek()}`);
    },
    expected: ['first:threw:negative', 'second:threw:negative', 'value:0'],
  },
  {
    id: 'rx-er-a-throw-during-flush-does-not-leave-a-stuck-batch-open',
    src: 'janux',
    run: (log) => {
      const poison = signal(0);
      const other = signal(0);

      watch(() => {
        if (poison.value === 1) throw new Error('boom');
      });
      watch(() => { log.push(`other:${other.value}`); });
      attempt(log, 'batch', () =>
        batch(() => {
          poison.value = 1;
        }),
      );
      // If the batch state leaked, this write would queue forever and never run.
      other.value = 1;
    },
    expected: ['other:0', 'batch:threw:boom', 'other:1'],
  },
  {
    id: 'rx-er-error-instances-propagate-by-reference-not-copies',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const original = new Error('identity');

      watch(() => {
        if (count.value === 1) throw original;
      });
      try {
        count.value = 1;
      } catch (caught) {
        log.push(`same:${caught === original}`);
      }
    },
    expected: ['same:true'],
  },
  {
    id: 'rx-er-a-computed-poisoned-at-creation-stays-usable-after-a-good-write',
    src: 'janux',
    run: (log) => {
      const count = signal(-1);
      let strict: { value: number } | undefined;

      attempt(log, 'create', () => {
        strict = computed(() => {
          if (count.value < 0) throw new Error('boom');

          return count.value * 2;
        });
      });
      log.push(`created:${strict !== undefined}`);
    },
    expected: ['create:threw:boom', 'created:false'],
  },
  {
    id: 'rx-er-cleanup-throw-during-an-unbatched-rerun-halts-that-drain-only',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let poisoned = true;

      watch(() => {
        count.value;

        if (poisoned) {
          poisoned = false;

          return () => {
            throw new Error('cleanup-boom');
          };
        }
      });
      watch(() => { log.push(`after:${count.value}`); });
      attempt(log, 'write', () => (count.value = 1));
      count.value = 2;
    },
    expected: ['after:0', 'write:threw:cleanup-boom', 'after:2'],
  },
  {
    id: 'rx-er-a-non-error-thrown-value-propagates-unchanged',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        if (count.value === 1) throw 'plain-string';
      });
      try {
        count.value = 1;
      } catch (caught) {
        log.push(`caught:${typeof caught}:${String(caught)}`);
      }
    },
    expected: ['caught:string:plain-string'],
  },
  {
    id: 'rx-er-a-throwing-computed-read-inside-an-effect-fails-that-effects-run',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const strict = computed(() => {
        if (count.value > 1) throw new Error('boom');

        return count.value;
      });

      watch(() => { log.push(`reader:${strict.value}`); });
      attempt(log, 'write', () => (count.value = 2));
      log.push(`peek:${strict.peek()}`);
    },
    expected: ['reader:1', 'write:threw:boom', 'peek:1'],
  },
  {
    id: 'rx-er-an-error-in-a-nested-batch-body-does-not-lose-the-outer-queue',
    src: 'janux',
    run: (log) => {
      const outer = signal(0);
      const inner = signal(0);

      watch(() => { log.push(`pair:${outer.value}:${inner.value}`); });
      attempt(log, 'outer', () =>
        batch(() => {
          outer.value = 1;
          batch(() => {
            inner.value = 1;
            throw new Error('inner-boom');
          });
        }),
      );
      log.push(`values:${outer.peek()}:${inner.peek()}`);
    },
    expected: ['pair:0:0', 'pair:1:1', 'outer:threw:inner-boom', 'values:1:1'],
  },
];
