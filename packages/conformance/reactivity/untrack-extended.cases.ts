import { batch, computed, createRoot, getOwner, onCleanup, signal, untrack, watch } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * `untrack` in every context the core corpus does not pin: it switches off
 * dependency COLLECTION and nothing else — writes still notify, owners are
 * untouched, and computations created inside it track normally.
 */
export const UNTRACK_EXTENDED_CASES: ScenarioCase[] = [
  {
    id: 'rx-ut-an-entire-effect-body-in-untrack-makes-it-inert',
    src: 'solid:signals#fully-untracked-effect',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        untrack(() => { log.push(`run:${count.value}`); });
      });
      count.value = 1;
      log.push('done');
    },
    expected: ['run:0', 'done'],
  },
  {
    id: 'rx-ut-nested-untrack-stays-untracked-after-the-inner-returns',
    src: 'janux',
    run: (log) => {
      const outer = signal(0);
      const inner = signal(0);

      watch(() => {
        untrack(() => {
          untrack(() => inner.value);
          outer.value;
        });
      });
      log.push(`outer:${outer.readers()}`, `inner:${inner.readers()}`);
    },
    expected: ['outer:0', 'inner:0'],
  },
  {
    id: 'rx-ut-writes-made-inside-untrack-notify-normally',
    src: 'solid:signals#untrack-does-not-suppress-writes',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      untrack(() => {
        count.value = 1;
      });
    },
    expected: ['run:0', 'run:1'],
  },
  {
    id: 'rx-ut-a-computed-created-inside-untrack-tracks-its-own-deps',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = untrack(() => computed(() => count.value * 2));

      count.value = 3;
      log.push(`value:${double.value}`);
    },
    expected: ['value:6'],
  },
  {
    id: 'rx-ut-untrack-around-a-tracked-read-then-a-tracked-read-after-it',
    src: 'janux',
    run: (log) => {
      const hidden = signal(0);
      const seen = signal(0);
      const alsoSeen = signal(0);

      watch(() => {
        seen.value;
        untrack(() => hidden.value);
        alsoSeen.value;
      });
      log.push(`${seen.readers()},${hidden.readers()},${alsoSeen.readers()}`);
    },
    expected: ['1,0,1'],
  },
  {
    id: 'rx-ut-untrack-returns-undefined-from-an-empty-callback',
    src: 'janux',
    run: (log) => {
      log.push(String(untrack(() => {})));
    },
    expected: ['undefined'],
  },
  {
    id: 'rx-ut-untracked-read-of-a-computed-does-not-subscribe-but-is-fresh',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      watch(() => { log.push(`run:${untrack(() => double.value)}`); });
      count.value = 5;
      log.push(`manual:${double.value}`);
    },
    expected: ['run:2', 'manual:10'],
  },
  {
    id: 'rx-ut-owner-context-is-preserved-inside-untrack',
    src: 'solid:signals#untrack-keeps-owner',
    run: (log) => {
      createRoot(() => {
        const before = getOwner();

        untrack(() => {
          log.push(`same:${getOwner() === before}`);
        });
      });
    },
    expected: ['same:true'],
  },
  {
    id: 'rx-ut-oncleanup-registered-inside-untrack-still-lands-in-the-scope',
    src: 'janux',
    run: (log) => {
      createRoot((dispose) => {
        untrack(() => {
          onCleanup(() => log.push('cleaned'));
        });
        dispose();
      });
    },
    expected: ['cleaned'],
  },
  {
    id: 'rx-ut-untrack-nested-inside-batch-keeps-both-behaviors',
    src: 'janux',
    run: (log) => {
      const tracked = signal(0);
      const hidden = signal(0);

      watch(() => { log.push(`run:${tracked.value}:${untrack(() => hidden.value)}`); });
      batch(() => {
        hidden.value = 5;
        tracked.value = 1;
      });
    },
    expected: ['run:0:0', 'run:1:5'],
  },
  {
    id: 'rx-ut-untrack-value-is-typed-through-not-stringified',
    src: 'janux',
    run: (log) => {
      const result = untrack(() => ({ nested: [1, 2] }));

      log.push(`kind:${typeof result}:${result.nested.length}`);
    },
    expected: ['kind:object:2'],
  },
  {
    id: 'rx-ut-a-watch-disposed-inside-untrack-is-really-disposed',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => { log.push(`run:${count.value}`); });

      untrack(() => {
        dispose();
      });
      count.value = 1;
    },
    expected: ['run:0'],
  },
  {
    id: 'rx-ut-sibling-untrack-blocks-are-independent',
    src: 'janux',
    run: (log) => {
      const first = signal(0);
      const middle = signal(0);
      const last = signal(0);

      watch(() => {
        untrack(() => first.value);
        middle.value;
        untrack(() => last.value);
      });
      first.value = 1;
      last.value = 1;
      log.push('silent-so-far');
      middle.value = 1;
      log.push(`readers:${first.readers()},${middle.readers()},${last.readers()}`);
    },
    expected: ['silent-so-far', 'readers:0,1,0'],
  },
  {
    id: 'rx-ut-untrack-inside-a-computed-throw-still-restores-tracking',
    src: 'janux',
    run: (log) => {
      const tracked = signal(0);
      const boom = computed(() => {
        attempt(log, 'inner', () =>
          untrack(() => {
            throw new Error('boom');
          }),
        );

        return tracked.value;
      });

      watch(() => { log.push(`run:${boom.value}`); });
      tracked.value = 1;
    },
    expected: ['inner:threw:boom', 'run:0', 'inner:threw:boom', 'run:1'],
  },
  {
    id: 'rx-ut-untracked-write-then-tracked-read-of-the-same-signal-in-one-run',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const trigger = signal(0);

      watch(() => {
        trigger.value;
        untrack(() => {
          if (count.peek() === 0) count.value = 100;
        });
        log.push(`run:${untrack(() => count.value)}`);
      });
      log.push('done');
    },
    expected: ['run:100', 'done'],
  },
  {
    id: 'rx-ut-peek-and-untrack-read-give-the-same-answer',
    src: 'solid:signals#untrack-vs-peek-equivalence',
    run: (log) => {
      const count = signal(7);

      watch(() => {
        log.push(`equal:${count.peek() === untrack(() => count.value)}`);
      });
      count.value = 8;
      log.push(`readers:${count.readers()}`);
    },
    expected: ['equal:true', 'readers:0'],
  },
  {
    id: 'rx-ut-untrack-does-not-flush-a-pending-batch',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      batch(() => {
        count.value = 1;
        untrack(() => {
          log.push('inside-untrack');
        });
        log.push('still-pending');
      });
    },
    expected: ['run:0', 'inside-untrack', 'still-pending', 'run:1'],
  },
  {
    id: 'rx-ut-an-effect-created-inside-untrack-inside-an-effect-still-nests',
    src: 'janux',
    run: (log) => {
      const inner = signal(0);

      watch(() => {
        untrack(() => {
          watch(() => { log.push(`inner:${inner.value}`); });
        });
      });
      inner.value = 1;
    },
    expected: ['inner:0', 'inner:1'],
  },
  {
    id: 'rx-ut-untrack-around-a-whole-computed-derivation-freezes-it',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const frozen = computed(() => untrack(() => count.value * 2));

      count.value = 5;
      log.push(`value:${frozen.value}`, `readers:${count.readers()}`);
    },
    expected: ['value:2', 'readers:0'],
  },
  {
    id: 'rx-ut-a-root-created-inside-untrack-still-owns-its-effects',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      untrack(() => {
        createRoot((dispose) => {
          watch(() => { log.push(`run:${count.value}`); });
          dispose();
        });
      });
      count.value = 1;
      log.push('silent');
    },
    expected: ['run:0', 'silent'],
  },
  {
    id: 'rx-ut-untrack-returns-a-promise-untouched',
    src: 'janux',
    run: async (log) => {
      const result = untrack(() => Promise.resolve('resolved'));

      log.push(`is-promise:${result instanceof Promise}`, await result);
    },
    expected: ['is-promise:true', 'resolved'],
  },
];
