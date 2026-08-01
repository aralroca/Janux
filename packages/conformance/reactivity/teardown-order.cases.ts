import { computed, createRoot, onCleanup, signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Teardown is a single reverse-ordered list per scope, shared by `onCleanup`,
 * effect disposals, child roots and computed disposals. These cases pin the
 * resulting order for every mixture, because "unwind" order is what makes
 * paired setup/teardown (open/close, subscribe/unsubscribe) safe.
 */
export const TEARDOWN_ORDER_CASES: ScenarioCase[] = [
  {
    id: 'rx-td-cleanups-and-effects-unwind-in-one-reverse-sequence',
    src: 'janux',
    run: (log) => {
      createRoot((dispose) => {
        onCleanup(() => log.push('cleanup-1'));
        watch(() => () => log.push('effect-1'));
        onCleanup(() => log.push('cleanup-2'));
        watch(() => () => log.push('effect-2'));
        dispose();
      });
    },
    expected: ['effect-2', 'cleanup-2', 'effect-1', 'cleanup-1'],
  },
  {
    id: 'rx-td-a-child-root-tears-down-at-its-registration-position',
    src: 'janux',
    run: (log) => {
      createRoot((dispose) => {
        onCleanup(() => log.push('before-child'));
        createRoot(() => onCleanup(() => log.push('child')));
        onCleanup(() => log.push('after-child'));
        dispose();
      });
    },
    expected: ['after-child', 'child', 'before-child'],
  },
  {
    id: 'rx-td-a-computed-disposal-takes-its-place-in-the-same-list',
    src: 'janux',
    run: (log) => {
      const count = signal(1);

      createRoot((dispose) => {
        onCleanup(() => log.push('first'));
        computed(() => count.value);
        onCleanup(() => log.push(`last-with-readers:${count.readers()}`));
        dispose();
      });
      log.push(`after:${count.readers()}`);
    },
    expected: ['last-with-readers:1', 'first', 'after:0'],
  },
  {
    id: 'rx-td-three-nested-roots-unwind-leaf-first',
    src: 'janux',
    run: (log) => {
      createRoot((dispose) => {
        onCleanup(() => log.push('root'));
        createRoot(() => {
          onCleanup(() => log.push('mid'));
          createRoot(() => onCleanup(() => log.push('leaf')));
        });
        dispose();
      });
    },
    expected: ['leaf', 'mid', 'root'],
  },
  {
    id: 'rx-td-an-effects-cleanup-runs-before-cleanups-registered-earlier-in-the-scope',
    src: 'janux',
    run: (log) => {
      createRoot((dispose) => {
        onCleanup(() => log.push('scope-first'));
        watch(() => () => log.push('effect'));
        dispose();
      });
    },
    expected: ['effect', 'scope-first'],
  },
  {
    id: 'rx-td-cleanups-registered-during-teardown-run-immediately-in-place',
    src: 'janux',
    run: (log) => {
      createRoot((dispose) => {
        onCleanup(() => log.push('a'));
        onCleanup(() => {
          log.push('b-start');
          onCleanup(() => log.push('b-nested'));
          log.push('b-end');
        });
        dispose();
      });
    },
    expected: ['b-start', 'b-nested', 'b-end', 'a'],
  },
  {
    id: 'rx-td-an-effects-per-run-cleanup-and-its-scope-cleanup-both-fire-on-dispose',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      createRoot((dispose) => {
        watch(() => {
          count.value;
          onCleanup(() => log.push('scope-registered'));

          return () => log.push('returned-cleanup');
        });
        dispose();
      });
    },
    expected: ['returned-cleanup', 'scope-registered'],
  },
  {
    id: 'rx-td-two-sibling-roots-are-independent-teardown-lists',
    src: 'janux',
    run: (log) => {
      const disposers: (() => void)[] = [];

      ['first', 'second'].forEach((label) => {
        createRoot((dispose) => {
          disposers.push(dispose);
          onCleanup(() => log.push(`${label}-a`));
          onCleanup(() => log.push(`${label}-b`));
        });
      });
      disposers[1]!();
      disposers[0]!();
    },
    expected: ['second-b', 'second-a', 'first-b', 'first-a'],
  },
  {
    id: 'rx-td-manual-effect-disposal-removes-it-from-the-scopes-later-unwind',
    src: 'janux',
    run: (log) => {
      createRoot((dispose) => {
        const disposeEffect = watch(() => () => log.push('effect'));

        onCleanup(() => log.push('scope'));
        disposeEffect();
        log.push('manual-done');
        dispose();
      });
    },
    expected: ['effect', 'manual-done', 'scope'],
  },
  {
    id: 'rx-td-a-nested-root-created-inside-an-effect-unwinds-with-the-outer-scope',
    src: 'janux',
    run: (log) => {
      createRoot((dispose) => {
        watch(() => {
          createRoot(() => onCleanup(() => log.push('inner-root')));

          return () => log.push('effect-cleanup');
        });
        onCleanup(() => log.push('outer'));
        dispose();
      });
    },
    expected: ['outer', 'effect-cleanup', 'inner-root'],
  },
  {
    id: 'rx-td-a-second-dispose-after-a-full-unwind-adds-nothing',
    src: 'janux',
    run: (log) => {
      let dispose = () => {};

      createRoot((disposeRoot) => {
        dispose = disposeRoot;
        onCleanup(() => log.push('once'));
        watch(() => () => log.push('effect-once'));
      });
      dispose();
      dispose();
      log.push('end');
    },
    expected: ['effect-once', 'once', 'end'],
  },
  {
    id: 'rx-td-teardown-order-is-registration-order-not-creation-order-of-signals',
    src: 'janux',
    run: (log) => {
      const early = signal(0);
      const late = signal(0);

      createRoot((dispose) => {
        watch(() => {
          late.value;

          return () => log.push('late-effect');
        });
        watch(() => {
          early.value;

          return () => log.push('early-effect');
        });
        dispose();
      });
    },
    expected: ['early-effect', 'late-effect'],
  },
];
