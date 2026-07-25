import { computed, createRoot, getOwner, onCleanup, runWithOwner, signal, watch } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Disposal scopes: `createRoot`, `onCleanup`, `getOwner`, `runWithOwner`.
 *
 * Ownership is what stops an island's effects outliving the island. The cases that
 * matter are the leaks: an effect created inside a scope that has already been
 * disposed, a cleanup registered with no scope to hold it, and a re-run that must
 * restore the owner it was created under rather than whatever is current.
 * Shape follows Solid's ownership suite.
 */
export const OWNERSHIP_CASES: ScenarioCase[] = [
  {
    id: 'root-runs-its-body-immediately',
    src: 'solid:signals#createRoot-runs',
    run: (log) => {
      createRoot(() => log.push('body'));
    },
    expected: ['body'],
  },
  {
    id: 'root-returns-its-body-value',
    src: 'solid:signals#createRoot-returns',
    run: (log) => {
      log.push(String(createRoot(() => 42)));
    },
    expected: ['42'],
  },
  {
    id: 'root-dispose-runs-registered-cleanups',
    src: 'solid:signals#createRoot-dispose',
    run: (log) => {
      createRoot((dispose) => {
        onCleanup(() => log.push('cleaned'));
        dispose();
      });
    },
    expected: ['cleaned'],
  },
  {
    id: 'root-cleanups-run-in-reverse-registration-order',
    src: 'solid:signals#cleanup-order',
    run: (log) => {
      createRoot((dispose) => {
        onCleanup(() => log.push('first'));
        onCleanup(() => log.push('second'));
        dispose();
      });
    },
    expected: ['second', 'first'],
  },
  {
    id: 'root-dispose-is-idempotent',
    src: 'solid:signals#dispose-twice',
    run: (log) => {
      createRoot((dispose) => {
        onCleanup(() => log.push('cleaned'));
        dispose();
        dispose();
      });
    },
    expected: ['cleaned'],
  },
  {
    id: 'root-disposes-an-effect-created-inside-it',
    src: 'solid:signals#root-owns-effects',
    run: (log) => {
      const count = signal(0);

      createRoot((dispose) => {
        watch(() => {
          log.push(`run:${count.value}`);
        });
        dispose();
      });
      count.value = 1;
    },
    expected: ['run:0'],
  },
  {
    id: 'root-disposes-a-computed-created-inside-it',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = createRoot((dispose) => {
        const derived = computed(() => count.value * 2);

        dispose();

        return derived;
      });

      count.value = 5;
      log.push(String(double.value));
    },
    expected: ['2'],
  },
  {
    id: 'root-nested-disposal-cascades-to-children',
    src: 'solid:signals#nested-roots',
    run: (log) => {
      createRoot((disposeOuter) => {
        createRoot(() => {
          onCleanup(() => log.push('inner'));
        });
        onCleanup(() => log.push('outer'));
        disposeOuter();
      });
    },
    expected: ['outer', 'inner'],
  },
  {
    id: 'root-disposing-a-child-does-not-touch-the-parent',
    src: 'solid:signals#child-dispose',
    run: (log) => {
      createRoot(() => {
        onCleanup(() => log.push('outer'));
        createRoot((disposeInner) => {
          onCleanup(() => log.push('inner'));
          disposeInner();
        });
        log.push('after-inner');
      });
    },
    expected: ['inner', 'after-inner'],
  },
  {
    id: 'cleanup-on-an-already-disposed-scope-runs-at-once',
    src: 'janux',
    run: (log) => {
      let escaped: (() => void) | undefined;

      createRoot((dispose) => {
        escaped = () => onCleanup(() => log.push('immediate'));
        dispose();
      });
      runWithOwnerless(escaped!);
      log.push('done');
    },
    expected: ['done'],
  },
  {
    id: 'cleanup-outside-any-scope-is-dropped-silently',
    src: 'janux',
    run: (log) => {
      attempt(log, 'register', () => onCleanup(() => log.push('never')));
      log.push('still-here');
    },
    expected: ['register:ok', 'still-here'],
  },
  {
    id: 'owner-is-null-outside-a-scope',
    src: 'solid:signals#getOwner-null',
    run: (log) => {
      log.push(String(getOwner()));
    },
    expected: ['null'],
  },
  {
    id: 'owner-is-present-inside-a-root',
    src: 'solid:signals#getOwner',
    run: (log) => {
      createRoot(() => log.push(getOwner() === null ? 'null' : 'owner'));
    },
    expected: ['owner'],
  },
  {
    id: 'owner-is-restored-after-the-root-returns',
    src: 'janux',
    run: (log) => {
      createRoot(() => {});
      log.push(String(getOwner()));
    },
    expected: ['null'],
  },
  {
    id: 'run-with-owner-reattaches-a-cleanup-to-that-scope',
    src: 'solid:signals#runWithOwner',
    run: (log) => {
      let captured: ReturnType<typeof getOwner> = null;
      let dispose = () => {};

      createRoot((disposeRoot) => {
        captured = getOwner();
        dispose = disposeRoot;
      });
      runWithOwner(captured, () => onCleanup(() => log.push('reattached')));
      dispose();
    },
    expected: ['reattached'],
  },
  {
    id: 'run-with-owner-returns-the-body-value',
    src: 'janux',
    run: (log) => {
      log.push(String(runWithOwner(null, () => 7)));
    },
    expected: ['7'],
  },
  {
    id: 'run-with-owner-restores-the-previous-owner-even-when-it-throws',
    src: 'janux',
    run: (log) => {
      createRoot(() => {
        const before = getOwner();

        attempt(log, 'inner', () =>
          runWithOwner(null, () => {
            throw new Error('boom');
          }),
        );
        log.push(`restored=${getOwner() === before}`);
      });
    },
    expected: ['inner:threw:boom', 'restored=true'],
  },
  {
    id: 'effect-cleanup-runs-when-its-owning-root-is-disposed',
    src: 'solid:signals#effect-cleanup-on-dispose',
    run: (log) => {
      createRoot((dispose) => {
        watch(() => () => log.push('effect-cleanup'));
        dispose();
      });
    },
    expected: ['effect-cleanup'],
  },
  {
    id: 'effect-created-inside-a-disposed-root-does-not-become-a-zombie',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      let owner: ReturnType<typeof getOwner> = null;

      createRoot((dispose) => {
        owner = getOwner();
        dispose();
      });
      runWithOwner(owner, () => {
        watch(() => {
          log.push(`run:${count.value}`);
        });
      });
      count.value = 1;
      log.push('done');
    },
    expected: ['run:0', 'run:1', 'done'],
  },
];

/** Calls `fn` with no owner installed, to prove a scopeless cleanup is inert. */
function runWithOwnerless(fn: () => void): void {
  runWithOwner(null, fn);
}
