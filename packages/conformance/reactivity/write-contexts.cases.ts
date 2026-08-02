import { batch, computed, createRoot, onCleanup, runWithOwner, getOwner, signal, untrack, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * A write is a write, wherever it comes from — but WHEN its subscribers run
 * depends on the context it was issued from. One case per origin: effect body,
 * cleanup, computed derivation, root body, root cleanup, batch, untrack,
 * a disposed scope, and plain top-level code.
 */
export const WRITE_CONTEXT_CASES: ScenarioCase[] = [
  {
    id: 'rx-wc-a-write-from-a-root-body-flushes-immediately',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      createRoot((dispose) => {
        count.value = 1;
        log.push('body-continues');
        dispose();
      });
    },
    expected: ['run:0', 'run:1', 'body-continues'],
  },
  {
    id: 'rx-wc-a-write-from-a-root-cleanup-flushes-during-dispose',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      createRoot((dispose) => {
        onCleanup(() => {
          count.value = 1;
        });
        dispose();
        log.push('disposed');
      });
    },
    expected: ['run:0', 'run:1', 'disposed'],
  },
  {
    id: 'rx-wc-a-write-from-a-computed-derivation-reaches-effects-after-it-settles',
    src: 'janux',
    run: (log) => {
      const source = signal(1);
      const mirror = signal(0);

      watch(() => { log.push(`mirror:${mirror.value}`); });
      computed(() => {
        mirror.value = source.value;

        return source.value;
      });
      source.value = 2;
    },
    expected: ['mirror:0', 'mirror:1', 'mirror:2'],
  },
  {
    id: 'rx-wc-a-write-from-inside-run-with-owner-behaves-like-any-other',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let owner: ReturnType<typeof getOwner> = null;

      createRoot(() => {
        owner = getOwner();
      });
      watch(() => { log.push(`run:${count.value}`); });
      runWithOwner(owner, () => {
        count.value = 1;
      });
    },
    expected: ['run:0', 'run:1'],
  },
  {
    id: 'rx-wc-a-write-from-a-disposed-effects-closure-still-notifies-others',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let writeFromDeadEffect = () => {};
      const dispose = watch(() => {
        writeFromDeadEffect = () => {
          count.value = count.peek() + 1;
        };
      });

      watch(() => { log.push(`observer:${count.value}`); });
      dispose();
      writeFromDeadEffect();
    },
    expected: ['observer:0', 'observer:1'],
  },
  {
    id: 'rx-wc-a-write-from-an-effect-cleanup-during-dispose-notifies-live-effects',
    src: 'janux',
    run: (log) => {
      const status = signal('open');

      watch(() => { log.push(`status:${status.value}`); });
      const dispose = watch(() => () => {
        status.value = 'closed';
      });

      dispose();
    },
    expected: ['status:open', 'status:closed'],
  },
  {
    id: 'rx-wc-a-write-inside-untrack-inside-a-batch-is-still-deferred',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      batch(() => {
        untrack(() => {
          count.value = 1;
        });
        log.push('inside-batch');
      });
    },
    expected: ['run:0', 'inside-batch', 'run:1'],
  },
  {
    id: 'rx-wc-a-write-from-a-getter-invoked-by-an-effect-cascades-normally',
    src: 'janux',
    run: (log) => {
      const source = signal(1);
      const audit = signal(0);
      const store = {
        get current(): number {
          audit.value = audit.peek() + 1;

          return source.value;
        },
      };

      watch(() => { log.push(`audit:${audit.value}`); });
      watch(() => {
        store.current;
      });
      source.value = 2;
      log.push(`reads:${audit.peek()}`);
    },
    expected: ['audit:0', 'audit:1', 'audit:2', 'reads:2'],
  },
  {
    id: 'rx-wc-a-write-from-a-computed-created-and-discarded-inside-an-effect-still-lands',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const target = signal(0);

      watch(() => { log.push(`target:${target.value}`); });
      watch(() => {
        const seen = trigger.value;
        const scratch = computed(() => {
          target.value = seen + 1;

          return seen;
        });

        scratch.dispose();
      });
      trigger.value = 5;
    },
    expected: ['target:0', 'target:1', 'target:6'],
  },
  {
    id: 'rx-wc-writes-from-two-different-contexts-in-one-flush-keep-source-order',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const order = signal<string[]>([]);
      const record = (label: string) => {
        order.value = [...order.peek(), label];
      };

      watch(() => {
        if (trigger.value === 1) record('effect');
      });
      computed(() => {
        if (trigger.value === 1) record('computed');

        return trigger.value;
      });
      trigger.value = 1;
      log.push(`order:${order.peek().join(',')}`);
    },
    expected: ['order:computed,effect'],
  },
  {
    id: 'rx-wc-a-write-in-a-cleanup-of-an-effect-being-replaced-precedes-the-new-body',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const phase = signal('idle');

      watch(() => {
        trigger.value;
        log.push(`body-sees:${phase.peek()}`);

        return () => {
          phase.value = 'cleaning';
        };
      });
      trigger.value = 1;
    },
    expected: ['body-sees:idle', 'body-sees:cleaning'],
  },
  {
    id: 'rx-wc-a-top-level-write-between-two-batches-flushes-on-its-own',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      batch(() => {
        count.value = 1;
      });
      count.value = 2;
      batch(() => {
        count.value = 3;
      });
    },
    expected: ['run:0', 'run:1', 'run:2', 'run:3'],
  },
  {
    id: 'rx-wc-a-write-from-a-child-roots-body-reaches-effects-in-the-parent',
    src: 'janux',
    run: (log) => {
      const shared = signal(0);

      createRoot((dispose) => {
        watch(() => { log.push(`parent:${shared.value}`); });
        createRoot(() => {
          shared.value = 1;
        });
        dispose();
      });
    },
    expected: ['parent:0', 'parent:1'],
  },
  {
    id: 'rx-wc-a-write-issued-while-an-error-is-unwinding-still-lands',
    src: 'janux',
    run: (log) => {
      const observed = signal(0);

      watch(() => { log.push(`observed:${observed.value}`); });
      try {
        try {
          throw new Error('boom');
        } finally {
          observed.value = 1;
        }
      } catch {
        log.push('caught');
      }
    },
    expected: ['observed:0', 'observed:1', 'caught'],
  },
  {
    id: 'rx-wc-a-write-from-a-nested-effects-body-notifies-the-outer-one',
    src: 'janux',
    run: (log) => {
      const outerDep = signal(0);
      const trigger = signal(0);

      watch(() => { log.push(`outer:${outerDep.value}`); });
      watch(() => {
        trigger.value;
        watch(() => {
          outerDep.value = 1;
        });
      });
      log.push('done');
    },
    expected: ['outer:0', 'outer:1', 'done'],
  },
];
