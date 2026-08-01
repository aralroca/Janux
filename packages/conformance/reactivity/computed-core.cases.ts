import { batch, computed, signal, untrack, watch } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * `computed` on its own: eager evaluation (documented — recompute on write,
 * not on read), `Object.is` equality on the RESULT deciding whether
 * subscribers hear anything, dynamic dependencies, dispose-freezing, and how
 * errors in the derivation surface.
 */
export const COMPUTED_CORE_CASES: ScenarioCase[] = [
  {
    id: 'rx-cp-computed-runs-eagerly-at-creation',
    src: 'janux',
    run: (log) => {
      computed(() => {
        log.push('compute');

        return 1;
      });
      log.push('created');
    },
    expected: ['compute', 'created'],
  },
  {
    id: 'rx-cp-initial-value-is-available-synchronously',
    src: 'vue:computed#lazy-vs-eager-initial-read',
    run: (log) => {
      const count = signal(3);

      log.push(String(computed(() => count.value * 2).value));
    },
    expected: ['6'],
  },
  {
    id: 'rx-cp-recomputes-on-write-even-with-no-readers',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      let computes = 0;

      computed(() => {
        computes++;

        return count.value;
      });
      count.value = 2;
      log.push(`computes:${computes}`);
    },
    expected: ['computes:2'],
  },
  {
    id: 'rx-cp-peek-is-fresh-after-an-unbatched-write',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      count.value = 3;
      log.push(`peek:${double.peek()}`);
    },
    expected: ['peek:6'],
  },
  {
    id: 'rx-cp-nan-result-is-stable-across-recomputes',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const parsed = computed(() => Number.parseInt(`x${count.value}`, 10));

      watch(() => { log.push(`run:${parsed.value}`); });
      count.value = 2;
    },
    expected: ['run:NaN'],
  },
  {
    id: 'rx-cp-fresh-object-results-notify-every-recompute',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const wrapped = computed(() => ({ n: count.value > 0 }));

      watch(() => { log.push(`run:${wrapped.value.n}`); });
      count.value = 2;
    },
    expected: ['run:true', 'run:true'],
  },
  {
    id: 'rx-cp-zero-to-negative-zero-result-notifies',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const scaled = computed(() => count.value * 0);

      watch(() => { log.push(`run:${Object.is(scaled.value, -0) ? '-0' : '0'}`); });
      count.value = -1;
    },
    expected: ['run:0', 'run:-0'],
  },
  {
    id: 'rx-cp-dispose-is-idempotent',
    src: 'janux',
    run: (log) => {
      const derived = computed(() => 1);

      attempt(log, 'first', derived.dispose);
      attempt(log, 'second', derived.dispose);
    },
    expected: ['first:ok', 'second:ok'],
  },
  {
    id: 'rx-cp-dispose-freezes-value-and-peek-alike',
    src: 'janux',
    run: (log) => {
      const count = signal(2);
      const double = computed(() => count.value * 2);

      double.dispose();
      count.value = 10;
      log.push(`value:${double.value}`, `peek:${double.peek()}`);
    },
    expected: ['value:4', 'peek:4'],
  },
  {
    id: 'rx-cp-dispose-detaches-the-computed-from-its-source',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      log.push(`before:${count.readers()}`);
      double.dispose();
      log.push(`after:${count.readers()}`);
    },
    expected: ['before:1', 'after:0'],
  },
  {
    id: 'rx-cp-dispose-stops-recomputation-not-just-notification',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      let computes = 0;
      const derived = computed(() => {
        computes++;

        return count.value;
      });

      derived.dispose();
      count.value = 2;
      count.value = 3;
      log.push(`computes:${computes}`);
    },
    expected: ['computes:1'],
  },
  {
    id: 'rx-cp-a-watcher-of-a-disposed-computed-never-reruns',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      watch(() => { log.push(`run:${double.value}`); });
      double.dispose();
      count.value = 5;
    },
    expected: ['run:2'],
  },
  {
    id: 'rx-cp-a-watcher-added-after-dispose-sees-the-frozen-value',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      double.dispose();
      count.value = 5;
      watch(() => { log.push(`run:${double.value}`); });
      count.value = 7;
    },
    expected: ['run:2'],
  },
  {
    id: 'rx-cp-two-watchers-share-a-single-recompute',
    src: 'vue:computed#no-redundant-recompute-per-subscriber',
    run: (log) => {
      const count = signal(1);
      let computes = 0;
      const double = computed(() => {
        computes++;

        return count.value * 2;
      });

      watch(() => { log.push(`a:${double.value}`); });
      watch(() => { log.push(`b:${double.value}`); });
      count.value = 3;
      log.push(`computes:${computes}`);
    },
    expected: ['a:2', 'b:2', 'a:6', 'b:6', 'computes:2'],
  },
  {
    id: 'rx-cp-conditional-dependencies-are-dropped-and-acquired',
    src: 'vue:computed#dynamic-deps',
    run: (log) => {
      const gate = signal(true);
      const a = signal('a');
      const b = signal('b');
      let computes = 0;
      const pick = computed(() => {
        computes++;

        return gate.value ? a.value : b.value;
      });

      gate.value = false;
      b.value = 'b2';
      a.value = 'stale';
      log.push(`computes:${computes}`, `value:${pick.value}`, `a-readers:${a.readers()}`);
    },
    expected: ['computes:3', 'value:b2', 'a-readers:0'],
  },
  {
    id: 'rx-cp-a-zero-dependency-computed-is-inert-but-readable',
    src: 'janux',
    run: (log) => {
      const constant = computed(() => 42);

      watch(() => { log.push(`run:${constant.value}`); });
      log.push(`peek:${constant.peek()}`);
    },
    expected: ['run:42', 'peek:42'],
  },
  {
    id: 'rx-cp-peek-inside-the-derivation-does-not-subscribe',
    src: 'preact:signals#computed-peek-source',
    run: (log) => {
      const count = signal(1);
      const stale = computed(() => count.peek() * 2);

      count.value = 5;
      log.push(`value:${stale.value}`, `readers:${count.readers()}`);
    },
    expected: ['value:2', 'readers:0'],
  },
  {
    id: 'rx-cp-untrack-inside-the-derivation-reads-fresh-without-subscribing',
    src: 'solid:signals#untrack-in-memo',
    run: (log) => {
      const tracked = signal(1);
      const hidden = signal(10);
      const sum = computed(() => tracked.value + untrack(() => hidden.value));

      watch(() => { log.push(`run:${sum.value}`); });
      hidden.value = 20;
      tracked.value = 2;
    },
    expected: ['run:11', 'run:22'],
  },
  {
    id: 'rx-cp-a-throw-at-creation-propagates-to-the-creator',
    src: 'janux',
    run: (log) => {
      attempt(log, 'create', () =>
        computed(() => {
          throw new Error('boom');
        }),
      );
    },
    expected: ['create:threw:boom'],
  },
  {
    id: 'rx-cp-a-throw-on-recompute-propagates-to-the-writer-and-keeps-the-value',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const strict = computed(() => {
        if (count.value > 1) throw new Error('boom');

        return count.value * 2;
      });

      attempt(log, 'write', () => (count.value = 2));
      log.push(`value:${strict.value}`);
    },
    expected: ['write:threw:boom', 'value:2'],
  },
  {
    id: 'rx-cp-recovers-after-a-throwing-recompute',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const strict = computed(() => {
        if (count.value > 1) throw new Error('boom');

        return count.value * 2;
      });

      attempt(log, 'poison', () => (count.value = 2));
      attempt(log, 'recover', () => (count.value = 0));
      log.push(`value:${strict.value}`);
    },
    expected: ['poison:threw:boom', 'recover:ok', 'value:0'],
  },
  {
    id: 'rx-cp-an-impure-computed-writing-a-signal-cascades',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const mirror = signal(0);

      computed(() => {
        mirror.value = count.value * 10;

        return count.value;
      });
      watch(() => { log.push(`mirror:${mirror.value}`); });
      count.value = 2;
    },
    expected: ['mirror:10', 'mirror:20'],
  },
  {
    id: 'rx-cp-created-inside-a-batch-it-sees-in-batch-writes',
    src: 'janux',
    run: (log) => {
      const count = signal(1);

      batch(() => {
        count.value = 2;
        log.push(`initial:${computed(() => count.value * 10).value}`);
      });
    },
    expected: ['initial:20'],
  },
  {
    id: 'rx-cp-multiple-dependencies-one-recompute-per-write',
    src: 'janux',
    run: (log) => {
      const a = signal(1);
      const b = signal(2);
      let computes = 0;

      computed(() => {
        computes++;

        return a.value + b.value;
      });
      a.value = 10;
      b.value = 20;
      log.push(`computes:${computes}`);
    },
    expected: ['computes:3'],
  },
  {
    id: 'rx-cp-reading-the-same-dependency-twice-recomputes-once',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      let computes = 0;

      computed(() => {
        computes++;

        return count.value + count.value;
      });
      count.value = 2;
      log.push(`computes:${computes}`, `readers:${count.readers()}`);
    },
    expected: ['computes:2', 'readers:1'],
  },
  {
    id: 'rx-cp-an-always-undefined-result-never-renotifies',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const nothing = computed<undefined>(() => {
        count.value;

        return undefined;
      });

      watch(() => { log.push(`run:${String(nothing.value)}`); });
      count.value = 1;
      log.push('done');
    },
    expected: ['run:undefined', 'done'],
  },
  {
    id: 'rx-cp-same-value-dependency-write-recomputes-nothing',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      let computes = 0;

      computed(() => {
        computes++;

        return count.value;
      });
      count.value = 1;
      log.push(`computes:${computes}`);
    },
    expected: ['computes:1'],
  },
  {
    id: 'rx-cp-dispose-mid-chain-of-writes-freezes-at-the-last-computed-value',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      count.value = 2;
      double.dispose();
      count.value = 3;
      log.push(`value:${double.value}`);
    },
    expected: ['value:4'],
  },
  {
    id: 'rx-cp-unrelated-writes-recompute-nothing',
    src: 'janux',
    run: (log) => {
      const tracked = signal(1);
      const unrelated = signal(1);
      let computes = 0;

      computed(() => {
        computes++;

        return tracked.value;
      });
      unrelated.value = 2;
      unrelated.value = 3;
      log.push(`computes:${computes}`);
    },
    expected: ['computes:1'],
  },
  {
    id: 'rx-cp-a-gate-flip-to-undefined-notifies-the-watcher',
    src: 'janux',
    run: (log) => {
      const gate = signal(true);
      const maybe = computed(() => (gate.value ? 5 : undefined));

      watch(() => { log.push(`run:${String(maybe.value)}`); });
      gate.value = false;
    },
    expected: ['run:5', 'run:undefined'],
  },
  {
    id: 'rx-cp-two-computeds-from-one-derivation-function-are-independent',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const derive = () => count.value * 2;
      const first = computed(derive);
      const second = computed(derive);

      first.dispose();
      count.value = 5;
      log.push(`first:${first.value}`, `second:${second.value}`);
    },
    expected: ['first:2', 'second:10'],
  },
];
