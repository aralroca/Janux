import { createRoot, signal, untrack, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Deep nesting: effects created inside effects have their own subscriptions
 * and lifetimes — nothing is implicit. Janux does NOT auto-dispose an inner
 * effect on the outer re-run (unlike Solid); the returned-dispose chain is the
 * tool, and these cases pin both the leak shape and the discipline.
 */
export const EFFECT_NESTING_CASES: ScenarioCase[] = [
  {
    id: 'rx-ne-three-levels-run-inline-depth-first-at-creation',
    src: 'janux',
    run: (log) => {
      watch(() => {
        log.push('level-1');
        watch(() => {
          log.push('level-2');
          watch(() => { log.push('level-3'); });
          log.push('level-2-end');
        });
        log.push('level-1-end');
      });
    },
    expected: ['level-1', 'level-2', 'level-3', 'level-2-end', 'level-1-end'],
  },
  {
    id: 'rx-ne-sibling-inner-effects-track-independently',
    src: 'janux',
    run: (log) => {
      const left = signal(0);
      const right = signal(0);

      watch(() => {
        watch(() => { log.push(`left:${left.value}`); });
        watch(() => { log.push(`right:${right.value}`); });
      });
      left.value = 1;
      right.value = 1;
    },
    expected: ['left:0', 'right:0', 'left:1', 'right:1'],
  },
  {
    id: 'rx-ne-an-inner-effect-reading-the-outer-dep-subscribes-independently',
    src: 'janux',
    run: (log) => {
      const shared = signal(0);
      const disposeOuter = watch(() => {
        shared.value;
        watch(() => { log.push(`inner:${shared.value}`); });

        return undefined;
      });

      log.push(`readers:${shared.readers()}`);
      disposeOuter();
      // The inner instances remain subscribed: outer dispose is not cascading.
      shared.value = 1;
    },
    expected: ['inner:0', 'readers:2', 'inner:1'],
  },
  {
    id: 'rx-ne-two-outer-reruns-leave-three-inner-instances',
    src: 'janux',
    run: (log) => {
      const generation = signal(0);
      const inner = signal(0);
      let instances = 0;

      watch(() => {
        generation.value;
        instances++;
        watch(() => {
          inner.value;
        });
      });
      generation.value = 1;
      generation.value = 2;
      log.push(`outer-runs:${instances}`, `inner-readers:${inner.readers()}`);
    },
    expected: ['outer-runs:3', 'inner-readers:3'],
  },
  {
    id: 'rx-ne-the-dispose-chain-keeps-exactly-one-live-instance-per-level',
    src: 'janux',
    run: (log) => {
      const generation = signal(0);
      const leafDep = signal(0);

      watch(() => {
        const current = generation.value;
        const disposeMid = watch(() => {
          const disposeLeaf = watch(() => { log.push(`leaf:${current}:${leafDep.value}`); });

          return disposeLeaf;
        });

        return disposeMid;
      });
      generation.value = 1;
      leafDep.value = 1;
    },
    expected: ['leaf:0:0', 'leaf:1:0', 'leaf:1:1'],
  },
  {
    id: 'rx-ne-an-inner-effect-writing-the-outer-dep-converges-with-a-guard',
    src: 'janux',
    run: (log) => {
      const outer = signal(0);

      watch(() => {
        const seen = outer.value;

        log.push(`outer:${seen}`);
        watch(() => {
          if (outer.peek() < 1) outer.value = 1;
        });
      });
      log.push('settled');
    },
    expected: ['outer:0', 'outer:1', 'settled'],
  },
  {
    id: 'rx-ne-disposing-the-middle-level-does-not-touch-the-leaf',
    src: 'janux',
    run: (log) => {
      const midDep = signal(0);
      const leafDep = signal(0);
      let disposeMid = () => {};

      watch(() => {
        disposeMid = watch(() => {
          midDep.value;
          watch(() => { log.push(`leaf:${leafDep.value}`); });
        });
      });
      disposeMid();
      midDep.value = 1;
      leafDep.value = 1;
    },
    expected: ['leaf:0', 'leaf:1'],
  },
  {
    id: 'rx-ne-inner-cleanups-fire-on-inner-reruns-not-outer-ones',
    src: 'janux',
    run: (log) => {
      const outerDep = signal(0);
      const innerDep = signal(0);

      watch(() => {
        outerDep.value;
        watch(() => {
          innerDep.value;

          return () => log.push('inner-cleanup');
        });

        return undefined;
      });
      outerDep.value = 1;
      log.push('outer-reran');
      innerDep.value = 1;
    },
    expected: ['outer-reran', 'inner-cleanup', 'inner-cleanup'],
  },
  {
    id: 'rx-ne-a-generation-captured-by-the-inner-effect-stays-fixed',
    src: 'janux',
    run: (log) => {
      const generation = signal('g0');
      const tick = signal(0);

      watch(() => {
        const current = generation.value;
        const dispose = watch(() => { log.push(`${current}:${tick.value}`); });

        return dispose;
      });
      tick.value = 1;
      generation.value = 'g1';
      tick.value = 2;
    },
    expected: ['g0:0', 'g0:1', 'g1:1', 'g1:2'],
  },
  {
    id: 'rx-ne-inner-effects-of-a-queued-outer-run-see-mid-drain-values',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const observed = signal('initial');

      watch(() => {
        if (trigger.value === 1) {
          observed.value = 'written';
          watch(() => { log.push(`inner:${observed.value}`); });
        }
      });
      trigger.value = 1;
    },
    expected: ['inner:written'],
  },
  {
    id: 'rx-ne-an-inner-effect-can-read-a-dependency-the-outer-deliberately-untracks',
    src: 'janux',
    run: (log) => {
      const shared = signal(0);

      watch(() => {
        untrack(() => shared.value);
        watch(() => { log.push(`inner:${shared.value}`); });
      });
      shared.value = 1;
      log.push(`readers:${shared.readers()}`);
    },
    expected: ['inner:0', 'inner:1', 'readers:1'],
  },
  {
    id: 'rx-ne-a-root-inside-an-effect-scopes-the-inner-effects-lifetime-to-that-run',
    src: 'janux',
    run: (log) => {
      const generation = signal(0);
      const inner = signal(0);

      watch(() => {
        const current = generation.value;

        return createRoot((dispose) => {
          watch(() => { log.push(`g${current}:${inner.value}`); });

          return dispose;
        });
      });
      generation.value = 1;
      inner.value = 1;
      log.push(`readers:${inner.readers()}`);
    },
    expected: ['g0:0', 'g1:0', 'g1:1', 'readers:1'],
  },
  {
    id: 'rx-ne-the-outer-effects-cleanup-runs-before-the-new-inner-instance-is-created',
    src: 'janux',
    run: (log) => {
      const generation = signal(0);

      watch(() => {
        const current = generation.value;

        watch(() => { log.push(`inner:${current}`); });

        return () => log.push(`cleanup:${current}`);
      });
      generation.value = 1;
    },
    expected: ['inner:0', 'cleanup:0', 'inner:1'],
  },
  {
    id: 'rx-ne-a-four-level-nest-created-in-one-run-subscribes-at-every-level',
    src: 'janux',
    run: (log) => {
      const cells = [signal(0), signal(0), signal(0), signal(0)];

      watch(() => {
        cells[0]!.value;
        watch(() => {
          cells[1]!.value;
          watch(() => {
            cells[2]!.value;
            watch(() => {
              cells[3]!.value;
            });
          });
        });
      });
      log.push(`readers:${cells.map((cell) => cell.readers()).join(',')}`);
    },
    expected: ['readers:1,1,1,1'],
  },
];
