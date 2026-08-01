import { computed, signal, untrack, watch } from 'janux';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * How an effect's dependency set is built, rebuilt and torn down: tracking is
 * dynamic-scoped (whatever `.value` executes during the run, however deep the
 * call stack), rebuilt from scratch on every run, and never extended by reads
 * that happen outside the run — cleanups, `peek`, or code after an `await`.
 */
export const EFFECT_TRACKING_CASES: ScenarioCase[] = [
  {
    id: 'rx-tr-effect-with-no-dependencies-never-reruns',
    src: 'solid:signals#effect-without-reads',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push('run'); });
      count.value = 1;
    },
    expected: ['run'],
  },
  {
    id: 'rx-tr-two-dependencies-either-write-reruns-with-fresh-pair',
    src: 'vue:effect#observe-multiple-properties',
    run: (log) => {
      const a = signal(0);
      const b = signal(0);

      watch(() => { log.push(`run:${a.value}:${b.value}`); });
      a.value = 1;
      b.value = 1;
    },
    expected: ['run:0:0', 'run:1:0', 'run:1:1'],
  },
  {
    id: 'rx-tr-three-branch-conditional-follows-the-active-branch',
    src: 'janux',
    run: (log) => {
      const mode = signal<'a' | 'b' | 'c'>('a');
      const values = { a: signal('a1'), b: signal('b1'), c: signal('c1') };

      watch(() => { log.push(`run:${values[mode.value].value}`); });
      mode.value = 'c';
      values.a.value = 'a2';
      values.b.value = 'b2';
      values.c.value = 'c2';
    },
    expected: ['run:a1', 'run:c1', 'run:c2'],
  },
  {
    id: 'rx-tr-dependency-dropped-then-reacquired-on-a-gate-round-trip',
    src: 'vue:effect#branch-restored',
    run: (log) => {
      const gate = signal(true);
      const inner = signal(0);

      watch(() => { log.push(`run:${gate.value ? inner.value : 'off'}`); });
      gate.value = false;
      inner.value = 1;
      gate.value = true;
      inner.value = 2;
    },
    expected: ['run:0', 'run:off', 'run:1', 'run:2'],
  },
  {
    id: 'rx-tr-the-condition-signal-is-itself-a-dependency',
    src: 'janux',
    run: (log) => {
      const gate = signal(true);
      const a = signal('x');
      const b = signal('x');

      watch(() => { log.push(`run:${gate.value ? a.value : b.value}`); });
      gate.value = false;
    },
    expected: ['run:x', 'run:x'],
  },
  {
    id: 'rx-tr-reads-through-helper-functions-are-tracked',
    src: 'solid:signals#indirect-read',
    run: (log) => {
      const count = signal(0);
      const current = () => count.value;

      watch(() => { log.push(`run:${current()}`); });
      count.value = 1;
    },
    expected: ['run:0', 'run:1'],
  },
  {
    id: 'rx-tr-reads-inside-try-catch-are-tracked',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        try {
          log.push(`run:${count.value}`);
        } catch {
          log.push('caught');
        }
      });
      count.value = 1;
    },
    expected: ['run:0', 'run:1'],
  },
  {
    id: 'rx-tr-reads-inside-an-array-map-callback-are-tracked',
    src: 'janux',
    run: (log) => {
      const items = [signal(1), signal(2)];

      watch(() => { log.push(`run:${items.map((item) => item.value).join(',')}`); });
      items[1]!.value = 3;
    },
    expected: ['run:1,2', 'run:1,3'],
  },
  {
    id: 'rx-tr-reads-after-an-await-are-not-tracked',
    src: 'janux',
    run: async (log) => {
      const before = signal(0);
      const after = signal(0);

      watch((() => {
        before.value;
        (async () => {
          await Promise.resolve();
          after.value;
        })();
      }) as () => void);
      await Promise.resolve();
      await Promise.resolve();
      log.push(`before:${before.readers()}`, `after:${after.readers()}`);
    },
    expected: ['before:1', 'after:0'],
  },
  {
    id: 'rx-tr-destructured-value-read-is-tracked',
    src: 'janux',
    run: (log) => {
      const count = signal(1);

      watch(() => {
        const { value } = count;

        log.push(`run:${value}`);
      });
      count.value = 2;
    },
    expected: ['run:1', 'run:2'],
  },
  {
    id: 'rx-tr-peek-of-a-second-signal-mixes-with-tracked-reads',
    src: 'preact:signals#peek-in-effect-with-deps',
    run: (log) => {
      const tracked = signal(0);
      const peeked = signal(0);

      watch(() => { log.push(`run:${tracked.value}:${peeked.peek()}`); });
      peeked.value = 5;
      tracked.value = 1;
    },
    expected: ['run:0:0', 'run:1:5'],
  },
  {
    id: 'rx-tr-peek-plus-tracked-read-of-the-same-signal-still-subscribes',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        count.value;
        count.peek();
      });
      log.push(`readers:${count.readers()}`);
      count.value = 1;
      log.push(`readers-after:${count.readers()}`);
    },
    expected: ['readers:1', 'readers-after:1'],
  },
  {
    id: 'rx-tr-a-write-only-signal-is-not-a-dependency',
    src: 'janux',
    run: (log) => {
      const target = signal(0);
      const trigger = signal(0);

      watch(() => {
        trigger.value;
        target.value = target.peek() + 1;
        log.push('writer-ran');
      });
      log.push(`target-readers:${target.readers()}`);
    },
    expected: ['writer-ran', 'target-readers:0'],
  },
  {
    id: 'rx-tr-cleanup-reads-do-not-subscribe-the-triggering-effect',
    src: 'preact:signals#cleanup-runs-untracked',
    run: (log) => {
      const relay = signal(0);
      const leaky = signal(0);

      watch(() => {
        relay.value;

        return () => { leaky.value; };
      });
      watch(() => {
        relay.value = 1;
        log.push('trigger-ran');
      });
      log.push(`leaky-readers:${leaky.readers()}`);
      leaky.value = 9;
      log.push('done');
    },
    expected: ['trigger-ran', 'leaky-readers:0', 'done'],
  },
  {
    id: 'rx-tr-cleanup-reads-do-not-subscribe-their-own-effect',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const observed = signal(0);

      watch(() => {
        log.push(`run:${trigger.value}`);

        return () => { observed.value; };
      });
      trigger.value = 1;
      log.push(`observed-readers:${observed.readers()}`);
      observed.value = 5;
      log.push('done');
    },
    expected: ['run:0', 'run:1', 'observed-readers:0', 'done'],
  },
  {
    id: 'rx-tr-a-throw-keeps-dependencies-read-before-it',
    src: 'janux',
    run: (log) => {
      const first = signal(0);
      const second = signal(0);

      watch(() => {
        first.value;
        if (first.value > 0) throw new Error('boom');
        second.value;
      });
      attempt(log, 'write', () => (first.value = 1));
      log.push(`first:${first.readers()}`, `second:${second.readers()}`);
      attempt(log, 'silent', () => (second.value = 1));
    },
    expected: ['write:threw:boom', 'first:1', 'second:0', 'silent:ok'],
  },
  {
    id: 'rx-tr-dependency-count-is-stable-across-reruns',
    src: 'vue:effect#no-duplicate-subscription-growth',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        count.value;
      });
      count.value = 1;
      count.value = 2;
      count.value = 3;
      log.push(`readers:${count.readers()}`);
    },
    expected: ['readers:1'],
  },
  {
    id: 'rx-tr-overlapping-dependency-sets-rerun-only-affected-effects',
    src: 'solid:signals#independent-subscriptions',
    run: (log) => {
      const shared = signal(0);
      const only = signal(0);

      watch(() => { log.push(`narrow:${shared.value}`); });
      watch(() => { log.push(`wide:${shared.value}:${only.value}`); });
      only.value = 1;
      shared.value = 1;
    },
    expected: ['narrow:0', 'wide:0:0', 'wide:0:1', 'narrow:1', 'wide:1:1'],
  },
  {
    id: 'rx-tr-disposing-one-effect-keeps-sibling-subscriptions',
    src: 'vue:effect#stop-one-of-two',
    run: (log) => {
      const count = signal(0);
      const stopFirst = watch(() => { log.push(`first:${count.value}`); });

      watch(() => { log.push(`second:${count.value}`); });
      stopFirst();
      count.value = 1;
    },
    expected: ['first:0', 'second:0', 'second:1'],
  },
  {
    id: 'rx-tr-the-same-callback-in-two-watches-makes-two-subscriptions',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const body = () => { log.push(`run:${count.value}`); };

      watch(body);
      watch(body);
      log.push(`readers:${count.readers()}`);
      count.value = 1;
    },
    expected: ['run:0', 'run:0', 'readers:2', 'run:1', 'run:1'],
  },
  {
    id: 'rx-tr-a-signal-holding-a-signal-tracks-both-levels',
    src: 'janux',
    run: (log) => {
      const inner = signal('a');
      const outer = signal(inner);

      watch(() => { log.push(`run:${outer.value.value}`); });
      inner.value = 'b';
      outer.value = signal('c');
      inner.value = 'stale';
      log.push('done');
    },
    expected: ['run:a', 'run:b', 'run:c', 'done'],
  },
  {
    id: 'rx-tr-an-index-signal-repoints-the-subscription',
    src: 'solid:signals#dynamic-dependency-selection',
    run: (log) => {
      const index = signal(0);
      const slots = [signal('first'), signal('second')];

      watch(() => { log.push(`run:${slots[index.value]!.value}`); });
      index.value = 1;
      slots[0]!.value = 'stale';
      slots[1]!.value = 'fresh';
    },
    expected: ['run:first', 'run:second', 'run:fresh'],
  },
  {
    id: 'rx-tr-an-effect-can-collapse-to-zero-dependencies-and-stays-inert',
    src: 'janux',
    run: (log) => {
      const gate = signal(true);
      const inner = signal(0);

      const dispose = watch(() => { log.push(`run:${gate.value ? inner.value : 'idle'}`); });

      gate.value = false;
      gate.value = false;
      inner.value = 1;
      attempt(log, 'dispose', dispose);
    },
    expected: ['run:0', 'run:idle', 'dispose:ok'],
  },
  {
    id: 'rx-tr-plain-variable-flips-are-invisible-until-the-next-rerun',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const a = signal('a');
      const b = signal('b');
      let which = a;

      watch(() => { log.push(`run:${trigger.value}:${which.value}`); });
      which = b;
      log.push('flipped');
      trigger.value = 1;
      a.value = 'stale-a';
      log.push('done');
    },
    expected: ['run:0:a', 'flipped', 'run:1:b', 'done'],
  },
  {
    id: 'rx-tr-branch-collapse-detaches-every-dropped-dependency',
    src: 'janux',
    run: (log) => {
      const gate = signal(true);
      const deps = [signal(1), signal(2), signal(3)];

      watch(() => {
        if (gate.value) deps.forEach((dep) => dep.value);
      });
      log.push(`on:${deps.map((dep) => dep.readers()).join(',')}`);
      gate.value = false;
      log.push(`off:${deps.map((dep) => dep.readers()).join(',')}`);
    },
    expected: ['on:1,1,1', 'off:0,0,0'],
  },
  {
    id: 'rx-tr-resubscription-does-not-accumulate-readers-over-a-round-trip',
    src: 'janux',
    run: (log) => {
      const gate = signal(true);
      const inner = signal(0);

      watch(() => {
        if (gate.value) inner.value;
      });
      gate.value = false;
      gate.value = true;
      log.push(`readers:${inner.readers()}`);
    },
    expected: ['readers:1'],
  },
  {
    id: 'rx-tr-reading-a-computed-subscribes-to-it-not-to-its-source',
    src: 'preact:signals#computed-shields-source',
    run: (log) => {
      const source = signal(1);
      const double = computed(() => source.value * 2);

      watch(() => { log.push(`run:${double.value}`); });
      log.push(`source-readers:${source.readers()}`);
      source.value = 2;
    },
    expected: ['run:2', 'source-readers:1', 'run:4'],
  },
  {
    id: 'rx-tr-watch-created-inside-untrack-tracks-normally',
    src: 'solid:signals#untrack-does-not-neuter-inner-computations',
    run: (log) => {
      const count = signal(0);

      untrack(() => {
        watch(() => { log.push(`run:${count.value}`); });
      });
      count.value = 1;
    },
    expected: ['run:0', 'run:1'],
  },
  {
    id: 'rx-tr-a-throwing-effect-stays-alive-for-the-next-write',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        if (count.value === 1) throw new Error('boom');
        log.push(`run:${count.value}`);
      });
      attempt(log, 'poison', () => (count.value = 1));
      count.value = 2;
    },
    expected: ['run:0', 'poison:threw:boom', 'run:2'],
  },
  {
    id: 'rx-tr-a-late-created-effect-sees-the-current-value-not-history',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      count.value = 5;
      watch(() => { log.push(`run:${count.value}`); });
    },
    expected: ['run:5'],
  },
  {
    id: 'rx-tr-inner-watch-dependencies-are-not-attributed-to-the-outer',
    src: 'solid:signals#nested-computation-isolation',
    run: (log) => {
      const outerDep = signal(0);
      const innerDep = signal(0);

      watch(() => {
        const seen = outerDep.value;

        log.push(`outer:${seen}`);
        watch(() => { log.push(`inner:${seen}:${innerDep.value}`); });
      });
      innerDep.value = 1;
    },
    expected: ['outer:0', 'inner:0:0', 'inner:0:1'],
  },
  {
    id: 'rx-tr-reads-inside-a-switch-discriminant-are-tracked',
    src: 'janux',
    run: (log) => {
      const step = signal(0);

      watch(() => {
        switch (step.value) {
          case 0:
            log.push('zero');
            break;
          default:
            log.push('other');
        }
      });
      step.value = 2;
    },
    expected: ['zero', 'other'],
  },
  {
    id: 'rx-tr-a-tracked-read-in-a-loop-subscribes-once',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        let total = 0;

        for (let i = 0; i < 3; i++) total += count.value;
        log.push(`run:${total}`);
      });
      log.push(`readers:${count.readers()}`);
      count.value = 1;
    },
    expected: ['run:0', 'readers:1', 'run:3'],
  },
  {
    id: 'rx-tr-logical-short-circuit-hides-the-right-operand',
    src: 'vue:effect#short-circuit-branch',
    run: (log) => {
      const left = signal(false);
      const right = signal(false);

      watch(() => { log.push(`run:${left.value && right.value}`); });
      right.value = true;
      left.value = true;
      right.value = false;
    },
    expected: ['run:false', 'run:true', 'run:false'],
  },
  {
    id: 'rx-tr-nullish-coalescing-tracks-only-the-left-side-when-present',
    src: 'janux',
    run: (log) => {
      const primary = signal<string | null>('main');
      const fallback = signal('backup');

      watch(() => { log.push(`run:${primary.value ?? fallback.value}`); });
      fallback.value = 'backup-2';
      primary.value = null;
      fallback.value = 'backup-3';
    },
    expected: ['run:main', 'run:backup-2', 'run:backup-3'],
  },
  {
    id: 'rx-tr-optional-chaining-on-the-value-still-tracks-the-signal',
    src: 'janux',
    run: (log) => {
      const user = signal<{ name: string } | null>(null);

      watch(() => { log.push(`run:${user.value?.name ?? 'anon'}`); });
      user.value = { name: 'ada' };
    },
    expected: ['run:anon', 'run:ada'],
  },
  {
    id: 'rx-tr-the-in-operator-on-a-signal-value-tracks-the-signal',
    src: 'janux',
    run: (log) => {
      const flags = signal<Record<string, boolean>>({});

      watch(() => { log.push(`run:${'beta' in flags.value}`); });
      flags.value = { beta: true };
    },
    expected: ['run:false', 'run:true'],
  },
  {
    id: 'rx-tr-a-property-getter-delegating-to-a-signal-tracks-when-invoked',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const store = {
        get current(): number {
          return count.value;
        },
      };

      watch(() => { log.push(`run:${store.current}`); });
      count.value = 1;
    },
    expected: ['run:0', 'run:1'],
  },
  {
    id: 'rx-tr-array-destructuring-of-a-tuple-signal-tracks',
    src: 'janux',
    run: (log) => {
      const pair = signal<[number, number]>([1, 2]);

      watch(() => {
        const [x, y] = pair.value;

        log.push(`run:${x},${y}`);
      });
      pair.value = [3, 4];
    },
    expected: ['run:1,2', 'run:3,4'],
  },
  {
    id: 'rx-tr-spreading-a-signal-array-tracks-the-signal',
    src: 'janux',
    run: (log) => {
      const items = signal([1]);

      watch(() => { log.push(`run:${[...items.value, 99].join(',')}`); });
      items.value = [1, 2];
    },
    expected: ['run:1,99', 'run:1,2,99'],
  },
];
