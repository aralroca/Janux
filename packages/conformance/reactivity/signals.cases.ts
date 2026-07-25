import { batch, computed, signal, untrack, watch } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * Signal, effect, computed, batch and untrack.
 *
 * Cases derive from the classes of bug the reactivity suites of Vue, Solid and
 * Preact accumulated: dependency detachment on conditional reads, cleanup
 * ordering, glitches across diamonds, re-entrancy, and equality semantics that
 * decide whether a write propagates at all.
 */
export const SIGNAL_CASES: ScenarioCase[] = [
  {
    id: 'signal-reads-initial-value',
    src: 'vue:ref#should-hold-a-value',
    run: (log) => log.push(String(signal(1).value)),
    expected: ['1'],
  },
  {
    id: 'signal-peek-does-not-subscribe',
    src: 'preact:signals#peek-should-not-subscribe',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.peek()}`); });
      count.value = 1;
      log.push(`readers:${count.readers()}`);
    },
    expected: ['run:0', 'readers:0'],
  },
  {
    id: 'signal-write-notifies-effect',
    src: 'vue:effect#should-observe-basic-properties',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      count.value = 1;
    },
    expected: ['run:0', 'run:1'],
  },
  {
    id: 'signal-write-of-same-value-is-silent',
    src: 'vue:effect#should-not-trigger-when-value-unchanged',
    run: (log) => {
      const count = signal(1);

      watch(() => { log.push(`run:${count.value}`); });
      count.value = 1;
    },
    expected: ['run:1'],
  },
  {
    id: 'effect-runs-once-eagerly-on-creation',
    src: 'solid:signals#createEffect-runs-immediately',
    run: (log) => {
      watch(() => { log.push('run'); });
    },
    expected: ['run'],
  },
  {
    id: 'effect-dispose-stops-further-runs',
    src: 'vue:effect#should-stop-the-effect',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => { log.push(`run:${count.value}`); });

      dispose();
      count.value = 1;
    },
    expected: ['run:0'],
  },
  {
    id: 'effect-dispose-is-idempotent',
    src: 'vue:effect#stop-twice-should-not-throw',
    run: (log) => {
      const dispose = watch(() => { log.push('run'); });

      dispose();
      attempt(log, 'second-dispose', dispose);
    },
    expected: ['run', 'second-dispose:ok'],
  },
  {
    id: 'effect-dispose-releases-the-subscription',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => {
        count.value;
      });

      log.push(`before:${count.readers()}`);
      dispose();
      log.push(`after:${count.readers()}`);
    },
    expected: ['before:1', 'after:0'],
  },
  {
    id: 'effect-cleanup-runs-before-each-rerun',
    src: 'solid:signals#onCleanup-runs-before-rerun',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        const seen = count.value;

        log.push(`run:${seen}`);

        return () => log.push(`cleanup:${seen}`);
      });
      count.value = 1;
      count.value = 2;
    },
    expected: ['run:0', 'cleanup:0', 'run:1', 'cleanup:1', 'run:2'],
  },
  {
    id: 'effect-cleanup-runs-on-dispose',
    src: 'vue:effect#should-call-onStop',
    run: (log) => {
      const dispose = watch(() => () => log.push('cleanup'));

      dispose();
    },
    expected: ['cleanup'],
  },
  {
    id: 'effect-cleanup-runs-only-once-on-double-dispose',
    src: 'janux',
    run: (log) => {
      const dispose = watch(() => () => log.push('cleanup'));

      dispose();
      dispose();
    },
    expected: ['cleanup'],
  },
  {
    id: 'effect-implicit-non-function-return-is-not-a-cleanup',
    src: 'janux',
    run: (log) => {
      const title = signal('a');
      const mirror = signal('');

      // TS rejects a non-void return; JS callers write this by accident all the
      // time (an arrow with an implicit return), which is the case being pinned.
      watch((() => (mirror.value = title.value)) as unknown as () => void);
      title.value = 'b';
      log.push(mirror.value);
    },
    expected: ['b'],
  },
  {
    id: 'effect-drops-dependency-no-longer-read',
    src: 'vue:effect#should-not-be-triggered-by-inactive-branch',
    run: (log) => {
      const useA = signal(true);
      const a = signal('a');
      const b = signal('b');

      watch(() => { log.push(`run:${useA.value ? a.value : b.value}`); });
      useA.value = false;
      a.value = 'a2';
      b.value = 'b2';
    },
    expected: ['run:a', 'run:b', 'run:b2'],
  },
  {
    id: 'effect-picks-up-newly-read-dependency',
    src: 'vue:effect#should-discover-new-branches',
    run: (log) => {
      const gate = signal(false);
      const value = signal(0);

      watch(() => { log.push(`run:${gate.value ? value.value : 'off'}`); });
      value.value = 1;
      gate.value = true;
      value.value = 2;
    },
    expected: ['run:off', 'run:1', 'run:2'],
  },
  {
    id: 'effect-reading-the-same-signal-twice-subscribes-once',
    src: 'vue:effect#should-avoid-duplicate-subscriptions',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        count.value;
        count.value;
      });
      log.push(`readers:${count.readers()}`);
    },
    expected: ['readers:1'],
  },
  {
    id: 'effect-untrack-hides-reads-from-the-dependency-set',
    src: 'solid:signals#untrack-does-not-subscribe',
    run: (log) => {
      const tracked = signal(0);
      const hidden = signal(0);

      watch(() => { log.push(`run:${tracked.value}:${untrack(() => hidden.value)}`); });
      hidden.value = 1;
      tracked.value = 1;
    },
    expected: ['run:0:0', 'run:1:1'],
  },
  {
    id: 'untrack-returns-the-callback-value',
    src: 'solid:signals#untrack-returns-value',
    run: (log) => log.push(String(untrack(() => 42))),
    expected: ['42'],
  },
  {
    id: 'untrack-restores-tracking-after-it-returns',
    src: 'janux',
    run: (log) => {
      const before = signal(0);
      const after = signal(0);

      watch(() => {
        untrack(() => before.value);
        after.value;
      });
      log.push(`before:${before.readers()}`, `after:${after.readers()}`);
    },
    expected: ['before:0', 'after:1'],
  },
  {
    id: 'untrack-restores-tracking-even-when-it-throws',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        attempt(log, 'inner', () =>
          untrack(() => {
            throw new Error('boom');
          }),
        );
        count.value;
      });
      log.push(`readers:${count.readers()}`);
    },
    expected: ['inner:threw:boom', 'readers:1'],
  },
  {
    id: 'computed-derives-eagerly',
    src: 'vue:computed#should-return-updated-value',
    run: (log) => {
      const count = signal(2);
      const double = computed(() => count.value * 2);

      log.push(String(double.value));
      count.value = 3;
      log.push(String(double.value));
    },
    expected: ['4', '6'],
  },
  {
    id: 'computed-peek-reads-without-subscribing',
    src: 'preact:signals#computed-peek',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      watch(() => { log.push(`run:${double.peek()}`); });
      count.value = 2;
    },
    expected: ['run:2'],
  },
  {
    id: 'computed-notifies-its-own-subscribers',
    src: 'vue:computed#should-trigger-effect',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      watch(() => { log.push(`run:${double.value}`); });
      count.value = 2;
    },
    expected: ['run:2', 'run:4'],
  },
  {
    id: 'computed-does-not-notify-when-the-derived-value-is-unchanged',
    src: 'vue:computed#should-not-trigger-when-result-unchanged',
    run: (log) => {
      const count = signal(1);
      const isPositive = computed(() => count.value > 0);

      watch(() => { log.push(`run:${isPositive.value}`); });
      count.value = 2;
      count.value = 3;
    },
    expected: ['run:true'],
  },
  {
    id: 'computed-dispose-freezes-the-derived-value',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      double.dispose();
      count.value = 5;
      log.push(String(double.value));
    },
    expected: ['2'],
  },
  {
    id: 'computed-chains-propagate-through-two-levels',
    src: 'vue:computed#should-work-when-chained',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);
      const quad = computed(() => double.value * 2);

      watch(() => { log.push(`run:${quad.value}`); });
      count.value = 2;
    },
    expected: ['run:4', 'run:8'],
  },
  {
    id: 'batch-defers-notifications-to-a-single-run',
    src: 'preact:signals#batch-should-coalesce',
    run: (log) => {
      const a = signal(0);
      const b = signal(0);

      watch(() => { log.push(`run:${a.value}:${b.value}`); });
      batch(() => {
        a.value = 1;
        b.value = 1;
      });
    },
    expected: ['run:0:0', 'run:1:1'],
  },
  {
    id: 'batch-runs-a-twice-written-effect-once',
    src: 'preact:signals#batch-dedupes-the-same-effect',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      batch(() => {
        count.value = 1;
        count.value = 2;
      });
    },
    expected: ['run:0', 'run:2'],
  },
  {
    id: 'batch-returns-the-callback-value',
    src: 'preact:signals#batch-returns-value',
    run: (log) => log.push(String(batch(() => 7))),
    expected: ['7'],
  },
  {
    id: 'batch-reads-inside-see-the-new-value-immediately',
    src: 'preact:signals#batch-reads-are-not-deferred',
    run: (log) => {
      const count = signal(0);

      batch(() => {
        count.value = 1;
        log.push(`inside:${count.value}`);
      });
    },
    expected: ['inside:1'],
  },
  {
    id: 'batch-nested-flushes-once-at-the-outer-boundary',
    src: 'preact:signals#nested-batch',
    run: (log) => {
      const a = signal(0);
      const b = signal(0);

      watch(() => { log.push(`run:${a.value}:${b.value}`); });
      batch(() => {
        a.value = 1;
        batch(() => {
          b.value = 1;
        });
        log.push('inner-done');
      });
    },
    expected: ['run:0:0', 'inner-done', 'run:1:1'],
  },
  {
    id: 'batch-flushes-queued-effects-even-when-the-body-throws',
    src: 'preact:signals#batch-should-flush-on-throw',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      attempt(log, 'batch', () =>
        batch(() => {
          count.value = 1;
          throw new Error('boom');
        }),
      );
    },
    expected: ['run:0', 'run:1', 'batch:threw:boom'],
  },
  {
    id: 'effect-created-inside-a-batch-still-runs-immediately',
    src: 'janux',
    run: (log) => {
      batch(() => {
        watch(() => { log.push('run'); });
        log.push('after-create');
      });
    },
    expected: ['run', 'after-create'],
  },
  {
    id: 'signal-nan-to-nan-does-not-notify',
    src: 'vue:ref#should-use-Object.is',
    run: (log) => {
      const count = signal(Number.NaN);

      watch(() => { log.push(`run:${count.value}`); });
      count.value = Number.NaN;
    },
    expected: ['run:NaN'],
  },
  {
    id: 'signal-zero-to-negative-zero-notifies',
    src: 'vue:ref#Object.is-distinguishes-signed-zero',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${Object.is(count.value, -0) ? '-0' : '0'}`); });
      count.value = -0;
    },
    expected: ['run:0', 'run:-0'],
  },
  {
    id: 'signal-null-to-undefined-notifies',
    src: 'janux',
    run: (log) => {
      const value = signal<null | undefined>(null);

      watch(() => { log.push(`run:${String(value.value)}`); });
      value.value = undefined;
    },
    expected: ['run:null', 'run:undefined'],
  },
  {
    id: 'signal-structurally-equal-objects-notify',
    src: 'vue:ref#should-not-deep-compare',
    run: (log) => {
      const value = signal({ a: 1 });

      watch(() => { log.push(`run:${JSON.stringify(value.value)}`); });
      value.value = { a: 1 };
    },
    expected: ['run:{"a":1}', 'run:{"a":1}'],
  },
  {
    id: 'signal-same-object-reference-does-not-notify',
    src: 'vue:ref#same-reference-is-not-a-change',
    run: (log) => {
      const shared = { a: 1 };
      const value = signal(shared);

      watch(() => { log.push(`run:${value.value.a}`); });
      value.value = shared;
    },
    expected: ['run:1'],
  },
  {
    id: 'effect-that-throws-on-creation-propagates',
    src: 'vue:effect#should-propagate-errors',
    run: (log) => {
      attempt(log, 'create', () =>
        watch(() => {
          throw new Error('boom');
        }),
      );
    },
    expected: ['create:threw:boom'],
  },
  {
    id: 'effect-that-throws-on-rerun-propagates-to-the-writer',
    src: 'vue:effect#error-in-rerun-surfaces-at-the-write',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        if (count.value > 0) throw new Error('boom');
        log.push('run:0');
      });
      attempt(log, 'write', () => (count.value = 1));
    },
    expected: ['run:0', 'write:threw:boom'],
  },
  {
    id: 'two-effects-on-one-signal-run-in-creation-order',
    src: 'vue:effect#should-run-in-registration-order',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`first:${count.value}`); });
      watch(() => { log.push(`second:${count.value}`); });
      count.value = 1;
    },
    expected: ['first:0', 'second:0', 'first:1', 'second:1'],
  },
  {
    id: 'effect-disposing-a-sibling-mid-notification-skips-it',
    src: 'vue:effect#stopping-an-effect-during-a-flush',
    run: (log) => {
      const count = signal(0);
      let disposeSecond = () => {};

      watch(() => {
        count.value;
        disposeSecond();
        log.push('first');
      });
      disposeSecond = watch(() => { log.push(`second:${count.value}`); });
      count.value = 1;
    },
    expected: ['first', 'second:0', 'first'],
  },
];
