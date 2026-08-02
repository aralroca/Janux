import { computed, createRoot, signal, watch } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * When an effect starts, re-runs, nests and dies. The corner that matters for
 * islands: effects created inside other computations run inline, accumulate
 * per re-run unless torn down, and an effect disposed mid-flight — by itself,
 * a sibling, or its own cleanup — must neither re-run nor leak subscriptions.
 */
export const EFFECT_LIFECYCLE_CASES: ScenarioCase[] = [
  {
    id: 'rx-fx-watch-returns-a-dispose-function',
    src: 'solid:signals#createEffect-returns-disposer',
    run: (log) => {
      log.push(typeof watch(() => {}));
    },
    expected: ['function'],
  },
  {
    id: 'rx-fx-first-run-happens-before-watch-returns',
    src: 'solid:signals#effect-runs-synchronously',
    run: (log) => {
      log.push('before');
      watch(() => { log.push('run'); });
      log.push('after');
    },
    expected: ['before', 'run', 'after'],
  },
  {
    id: 'rx-fx-effect-created-inside-a-run-executes-inline',
    src: 'janux',
    run: (log) => {
      watch(() => {
        log.push('outer-start');
        watch(() => { log.push('inner'); });
        log.push('outer-end');
      });
    },
    expected: ['outer-start', 'inner', 'outer-end'],
  },
  {
    id: 'rx-fx-outer-rerun-spawns-a-second-inner-instance',
    src: 'janux',
    run: (log) => {
      const outer = signal(0);
      const inner = signal(0);

      watch(() => {
        const generation = outer.value;

        watch(() => { log.push(`inner:${generation}:${inner.value}`); });
      });
      outer.value = 1;
      inner.value = 1;
    },
    expected: ['inner:0:0', 'inner:1:0', 'inner:0:1', 'inner:1:1'],
  },
  {
    id: 'rx-fx-disposing-the-inner-effect-in-the-outer-cleanup-prevents-accumulation',
    src: 'solid:signals#nested-effect-cleanup',
    run: (log) => {
      const outer = signal(0);
      const inner = signal(0);

      watch(() => {
        const generation = outer.value;
        const disposeInner = watch(() => { log.push(`inner:${generation}:${inner.value}`); });

        return disposeInner;
      });
      outer.value = 1;
      inner.value = 1;
    },
    expected: ['inner:0:0', 'inner:1:0', 'inner:1:1'],
  },
  {
    id: 'rx-fx-dispose-before-any-write-keeps-only-the-first-run',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => { log.push(`run:${count.value}`); });

      dispose();
      count.value = 1;
      count.value = 2;
    },
    expected: ['run:0'],
  },
  {
    id: 'rx-fx-self-dispose-mid-run-stops-future-runs-and-unsubscribes',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let dispose = () => {};

      dispose = watch(() => {
        log.push(`run:${count.value}`);
        if (count.value > 0) dispose();
      });
      count.value = 1;
      count.value = 2;
      log.push(`readers:${count.readers()}`);
    },
    expected: ['run:0', 'run:1', 'readers:0'],
  },
  {
    id: 'rx-fx-self-dispose-still-runs-the-cleanup-returned-by-the-final-run',
    src: 'preact:signals#dispose-during-run-invokes-fresh-cleanup',
    run: (log) => {
      const count = signal(0);
      let dispose = () => {};

      dispose = watch(() => {
        const seen = count.value;

        log.push(`body:${seen}`);
        if (seen === 1) dispose();

        return () => log.push(`cleanup:${seen}`);
      });
      count.value = 1;
      count.value = 2;
    },
    expected: ['body:0', 'cleanup:0', 'body:1', 'cleanup:1'],
  },
  {
    id: 'rx-fx-disposing-an-effect-that-already-ran-this-drain-only-affects-later-writes',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const disposeFirst = watch(() => { log.push(`first:${count.value}`); });

      watch(() => {
        log.push(`second:${count.value}`);
        if (count.value > 0) disposeFirst();
      });
      count.value = 1;
      count.value = 2;
    },
    expected: ['first:0', 'second:0', 'first:1', 'second:1', 'second:2'],
  },
  {
    id: 'rx-fx-effect-created-during-a-drain-subscribes-for-future-writes',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let spawned = false;

      watch(() => {
        count.value;
        if (!spawned && count.value === 1) {
          spawned = true;
          watch(() => { log.push(`late:${count.value}`); });
        }
      });
      count.value = 1;
      count.value = 2;
    },
    expected: ['late:1', 'late:2'],
  },
  {
    id: 'rx-fx-a-disposed-effect-can-be-recreated-with-the-same-callback',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const body = () => { log.push(`run:${count.value}`); };
      const dispose = watch(body);

      dispose();
      watch(body);
      count.value = 1;
    },
    expected: ['run:0', 'run:0', 'run:1'],
  },
  {
    id: 'rx-fx-an-async-body-returns-a-promise-which-is-not-a-cleanup',
    src: 'janux',
    run: async (log) => {
      const count = signal(0);
      const dispose = watch((async () => {
        count.value;
      }) as unknown as () => void);

      count.value = 1;
      attempt(log, 'dispose', dispose);
    },
    expected: ['dispose:ok'],
  },
  {
    id: 'rx-fx-cleanup-calling-its-own-dispose-still-lets-the-body-finish',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let dispose = () => {};

      dispose = watch(() => {
        log.push(`body:${count.value}`);

        return () => {
          log.push('cleanup');
          dispose();
        };
      });
      count.value = 1;
      count.value = 2;
    },
    expected: ['body:0', 'cleanup', 'body:1', 'cleanup'],
  },
  {
    id: 'rx-fx-an-effect-created-inside-a-cleanup-is-live',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const observed = signal(0);

      watch(() => {
        trigger.value;

        return () => {
          watch(() => { log.push(`spawned:${observed.value}`); });
        };
      });
      trigger.value = 1;
      observed.value = 1;
    },
    expected: ['spawned:0', 'spawned:1'],
  },
  {
    id: 'rx-fx-a-computed-recompute-spawns-watchers-created-in-its-body',
    src: 'janux',
    run: (log) => {
      const source = signal(0);
      const observed = signal('x');

      computed(() => {
        const generation = source.value;

        watch(() => { log.push(`watcher:${generation}:${observed.value}`); });

        return generation;
      });
      source.value = 1;
      observed.value = 'y';
    },
    expected: ['watcher:0:x', 'watcher:1:x', 'watcher:0:y', 'watcher:1:y'],
  },
  {
    id: 'rx-fx-two-independent-effects-have-independent-dispose-functions',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const disposeFirst = watch(() => { log.push(`first:${count.value}`); });
      const disposeSecond = watch(() => { log.push(`second:${count.value}`); });

      log.push(`distinct:${disposeFirst !== disposeSecond}`);
      disposeSecond();
      count.value = 1;
    },
    expected: ['first:0', 'second:0', 'distinct:true', 'first:1'],
  },
  {
    id: 'rx-fx-dispose-after-the-signal-is-gone-from-scope-is-safe',
    src: 'janux',
    run: (log) => {
      const dispose = (() => {
        const local = signal(0);

        return watch(() => {
          local.value;
        });
      })();

      attempt(log, 'dispose', dispose);
    },
    expected: ['dispose:ok'],
  },
  {
    id: 'rx-fx-effect-rerun-count-is-per-instance-not-per-callback',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let runs = 0;
      const body = () => {
        count.value;
        runs++;
      };
      const disposeFirst = watch(body);

      watch(body);
      disposeFirst();
      count.value = 1;
      log.push(`runs:${runs}`);
    },
    expected: ['runs:3'],
  },
  {
    id: 'rx-fx-inner-effect-outlives-the-outer-effects-disposal-without-a-cleanup',
    src: 'janux',
    run: (log) => {
      const inner = signal(0);
      const disposeOuter = watch(() => {
        watch(() => { log.push(`inner:${inner.value}`); });
      });

      disposeOuter();
      inner.value = 1;
    },
    expected: ['inner:0', 'inner:1'],
  },
  {
    id: 'rx-fx-dispose-inside-a-drain-prevents-the-queued-rerun',
    src: 'vue:effect#stop-while-queued',
    run: (log) => {
      const shared = signal(0);
      let disposeSecond = () => {};

      watch(() => {
        if (shared.value > 0) disposeSecond();
        log.push(`first:${shared.value}`);
      });
      disposeSecond = watch(() => { log.push(`second:${shared.value}`); });
      shared.value = 1;
      shared.value = 2;
    },
    expected: ['first:0', 'second:0', 'first:1', 'first:2'],
  },
  {
    // An effect registers with its owner only AFTER its first run, so a scope
    // torn down from inside that run never owned it — same policy as an effect
    // created under an already-disposed owner (see `ownership.cases.ts`): it
    // stays live and independent rather than being retro-disposed.
    id: 'rx-fx-a-root-disposed-during-the-first-run-does-not-retro-dispose-the-effect',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      createRoot((dispose) => {
        watch(() => {
          count.value;
          dispose();
          log.push('first-run');
        });
      });
      log.push(`readers:${count.readers()}`);
      count.value = 1;
      log.push('done');
    },
    expected: ['first-run', 'readers:1', 'first-run', 'done'],
  },
  {
    id: 'rx-fx-a-recursive-watch-creation-guarded-by-depth-terminates',
    src: 'janux',
    run: (log) => {
      const spawn = (depth: number): void => {
        watch(() => {
          log.push(`depth:${depth}`);
          if (depth < 2) spawn(depth + 1);
        });
      };

      spawn(0);
    },
    expected: ['depth:0', 'depth:1', 'depth:2'],
  },
  {
    id: 'rx-fx-dispose-called-from-inside-a-cleanup-of-another-effect-is-safe',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const disposeTarget = watch(() => { log.push(`target:${count.value}`); });

      watch(() => {
        count.value;

        return () => disposeTarget();
      });
      count.value = 1;
      count.value = 2;
    },
    expected: ['target:0', 'target:1'],
  },
];
