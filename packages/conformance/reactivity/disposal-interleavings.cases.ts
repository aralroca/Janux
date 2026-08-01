import { batch, computed, createRoot, onCleanup, signal, watch } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Who tears down whom, and when. Every combination here has bitten a framework
 * at some point: disposing the thing currently running, disposing from a
 * cleanup, disposing a scope from inside its own child, and disposing while a
 * notification is mid-flight.
 */
export const DISPOSAL_INTERLEAVING_CASES: ScenarioCase[] = [
  {
    id: 'rx-di-a-cleanup-disposing-its-owning-root-is-safe',
    src: 'janux',
    run: (log) => {
      let dispose = () => {};

      createRoot((disposeRoot) => {
        dispose = disposeRoot;
        onCleanup(() => {
          log.push('cleanup');
          dispose();
        });
      });
      attempt(log, 'dispose', dispose);
    },
    expected: ['cleanup', 'dispose:ok'],
  },
  {
    id: 'rx-di-a-child-root-disposing-its-parent-cascades-once',
    src: 'janux',
    run: (log) => {
      createRoot((disposeParent) => {
        onCleanup(() => log.push('parent-cleanup'));
        createRoot(() => {
          onCleanup(() => log.push('child-cleanup'));
          disposeParent();
        });
        log.push('parent-body-continues');
      });
    },
    expected: ['child-cleanup', 'parent-cleanup', 'parent-body-continues'],
  },
  {
    id: 'rx-di-an-effect-disposing-the-root-that-owns-it-stops-later-runs',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      createRoot((dispose) => {
        watch(() => {
          log.push(`run:${count.value}`);
          if (count.value === 1) dispose();
        });
        count.value = 1;
      });
      count.value = 2;
      log.push('silent');
    },
    expected: ['run:0', 'run:1', 'silent'],
  },
  {
    id: 'rx-di-a-computed-disposed-inside-its-own-derivation-freezes-at-that-value',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      let derived: { value: number; dispose: () => void } | undefined;

      derived = computed(() => {
        const seen = count.value;

        if (seen > 1) derived?.dispose();

        return seen * 2;
      });
      count.value = 2;
      count.value = 3;
      log.push(`value:${derived.value}`);
    },
    expected: ['value:4'],
  },
  {
    id: 'rx-di-a-root-disposed-from-inside-a-computed-stops-its-sibling-effects',
    src: 'janux',
    run: (log) => {
      const count = signal(1);

      createRoot((dispose) => {
        computed(() => {
          if (count.value > 1) dispose();

          return count.value;
        });
        watch(() => { log.push(`watcher:${count.value}`); });
      });
      count.value = 2;
      count.value = 3;
      log.push('end');
    },
    expected: ['watcher:1', 'end'],
  },
  {
    id: 'rx-di-disposing-inside-a-nested-batch-takes-effect-before-the-outer-flush',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => { log.push(`run:${count.value}`); });

      batch(() => {
        count.value = 1;
        batch(() => dispose());
        count.value = 2;
      });
      log.push('end');
    },
    expected: ['run:0', 'end'],
  },
  {
    id: 'rx-di-an-effect-disposing-a-computed-it-does-not-read-is-invisible-to-it',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const other = computed(() => count.value * 10);

      watch(() => {
        log.push(`run:${count.value}`);
        if (count.value === 2) other.dispose();
      });
      count.value = 2;
      count.value = 3;
      log.push(`frozen:${other.value}`);
    },
    expected: ['run:1', 'run:2', 'run:3', 'frozen:20'],
  },
  {
    id: 'rx-di-disposing-both-effects-of-a-pair-mid-flush-drops-the-remaining-run',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let disposeSecond = () => {};
      const disposeFirst = watch(() => {
        log.push(`first:${count.value}`);
        if (count.value === 1) {
          disposeFirst();
          disposeSecond();
        }
      });

      disposeSecond = watch(() => { log.push(`second:${count.value}`); });
      count.value = 1;
      count.value = 2;
      log.push('silent');
    },
    expected: ['first:0', 'second:0', 'first:1', 'silent'],
  },
  {
    id: 'rx-di-a-root-disposed-twice-from-different-places-cleans-once',
    src: 'janux',
    run: (log) => {
      let dispose = () => {};

      createRoot((disposeRoot) => {
        dispose = disposeRoot;
        onCleanup(() => log.push('cleanup'));
        watch(() => {
          dispose();
        });
      });
      dispose();
      log.push('end');
    },
    expected: ['cleanup', 'end'],
  },
  {
    id: 'rx-di-disposing-an-effect-from-its-own-cleanup-during-a-root-teardown-is-safe',
    src: 'janux',
    run: (log) => {
      createRoot((dispose) => {
        let disposeEffect = () => {};

        disposeEffect = watch(() => () => {
          log.push('effect-cleanup');
          disposeEffect();
        });
        attempt(log, 'root-dispose', dispose);
      });
    },
    expected: ['effect-cleanup', 'root-dispose:ok'],
  },
  {
    id: 'rx-di-a-late-write-after-full-teardown-touches-nothing',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      createRoot((dispose) => {
        computed(() => count.value * 2);
        watch(() => {
          count.value;
        });
        dispose();
      });
      count.value = 1;
      log.push(`readers:${count.readers()}`);
    },
    expected: ['readers:0'],
  },
  {
    id: 'rx-di-disposing-the-outer-effect-from-the-inner-one-leaves-the-inner-live',
    src: 'janux',
    run: (log) => {
      const outer = signal(0);
      const inner = signal(0);
      let disposeOuter = () => {};

      disposeOuter = watch(() => {
        outer.value;
        watch(() => {
          log.push(`inner:${inner.value}`);
          disposeOuter();
        });
      });
      outer.value = 1;
      inner.value = 1;
      log.push('end');
    },
    expected: ['inner:0', 'inner:0', 'inner:1', 'inner:1', 'end'],
  },
  {
    id: 'rx-di-disposing-a-computed-from-a-cleanup-freezes-it-at-teardown-time',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const derived = computed(() => count.value * 2);
      const dispose = watch(() => {
        count.value;

        return () => derived.dispose();
      });

      count.value = 3;
      log.push(`after-cleanup:${derived.value}`);
      count.value = 5;
      log.push(`frozen:${derived.value}`);
      dispose();
    },
    expected: ['after-cleanup:6', 'frozen:6'],
  },
  {
    id: 'rx-di-a-root-disposed-from-a-sibling-roots-effect-stops-mid-flush',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      let disposeTarget = () => {};

      createRoot((dispose) => {
        disposeTarget = dispose;
        watch(() => { log.push(`target:${trigger.value}`); });
      });
      createRoot(() => {
        watch(() => {
          if (trigger.value === 1) disposeTarget();
        });
      });
      trigger.value = 1;
      trigger.value = 2;
      log.push('end');
    },
    expected: ['target:0', 'target:1', 'end'],
  },
  {
    id: 'rx-di-disposing-every-reader-mid-batch-leaves-the-flush-with-nothing-to-do',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const disposers = [0, 1].map((index) =>
        watch(() => { log.push(`e${index}:${count.value}`); }),
      );

      batch(() => {
        count.value = 1;
        disposers.forEach((dispose) => dispose());
      });
      log.push(`readers:${count.readers()}`);
    },
    expected: ['e0:0', 'e1:0', 'readers:0'],
  },
  {
    id: 'rx-di-an-effect-recreated-inside-the-cleanup-of-its-own-disposal-is-live',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => {
        count.value;

        return () => {
          watch(() => { log.push(`replacement:${count.value}`); });
        };
      });

      dispose();
      count.value = 1;
    },
    expected: ['replacement:0', 'replacement:1'],
  },
];
