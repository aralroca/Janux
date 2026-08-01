import { batch, watch } from 'janux';
import { createReactiveState } from '../../janux/src/state/reactive-state';
import { createGate, withGate } from '../../janux/src/state/mutation-gate';
import { type ScenarioCase } from '../support/scenario';

/**
 * What a write notifies — the subscription-granularity contract.
 *
 * Janux tracks dot-paths, not selectors: a read subscribes to the path AND
 * every ancestor it walked through, a write bumps its path, its descendants and
 * its ancestors. These cases pin the visible consequences — root-level siblings
 * are isolated, nested cousins are not, arrays are coarse, versions (not
 * values) drive notification — the places Solid's store and Zustand's selector
 * suites bled first.
 */

/** A state whose gate is already open, for cases that are not about the gate. */
function open<T extends object>(initial: T) {
  const gate = createGate();
  const state = createReactiveState(initial, gate);

  return { state, mutate: <R>(fn: () => R) => withGate(gate, fn) };
}

export const NOTIFICATION_CASES: ScenarioCase[] = [
  // ── versions, not values ─────────────────────────────────────────────────────
  {
    id: 'state-writing-the-same-scalar-value-still-notifies',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ n: 1 });

      watch(() => {
        log.push(`run:${state.proxy.n}`);
      });
      mutate(() => (state.proxy.n = 1));
    },
    expected: ['run:1', 'run:1'],
  },
  {
    id: 'state-writing-a-structurally-equal-object-still-notifies',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ user: { name: 'a' } });

      watch(() => {
        log.push(`run:${JSON.stringify(state.proxy.user)}`);
      });
      mutate(() => (state.proxy.user = { name: 'a' }));
    },
    expected: ['run:{"name":"a"}', 'run:{"name":"a"}'],
  },
  {
    id: 'state-each-write-in-one-body-notifies-separately',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ a: 1, b: 1 });

      watch(() => {
        log.push(`run:${state.proxy.a}:${state.proxy.b}`);
      });
      mutate(() => {
        state.proxy.a = 2;
        state.proxy.b = 2;
      });
    },
    expected: ['run:1:1', 'run:2:1', 'run:2:2'],
  },
  {
    id: 'state-writes-wrapped-in-batch-notify-once',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ a: 1, b: 1 });

      watch(() => {
        log.push(`run:${state.proxy.a}:${state.proxy.b}`);
      });
      mutate(() =>
        batch(() => {
          state.proxy.a = 2;
          state.proxy.b = 2;
        }),
      );
    },
    expected: ['run:1:1', 'run:2:2'],
  },

  // ── appearing, disappearing and reappearing keys ─────────────────────────────
  {
    id: 'state-a-watcher-of-a-missing-key-fires-when-it-appears',
    src: 'solid:store#tracking-undefined-properties',
    run: (log) => {
      const { state, mutate } = open<{ later?: string }>({});

      watch(() => {
        log.push(`run:${String(state.proxy.later)}`);
      });
      mutate(() => (state.proxy.later = 'here'));
    },
    expected: ['run:undefined', 'run:here'],
  },
  {
    id: 'state-deleting-a-key-notifies-its-watcher-with-undefined',
    src: 'vue:reactive#should-trigger-on-delete',
    run: (log) => {
      const { state, mutate } = open<{ n?: number }>({ n: 1 });

      watch(() => {
        log.push(`run:${String(state.proxy.n)}`);
      });
      mutate(() => delete state.proxy.n);
    },
    expected: ['run:1', 'run:undefined'],
  },
  {
    id: 'state-a-key-deleted-and-rewritten-notifies-both-times',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<{ n?: number }>({ n: 1 });

      watch(() => {
        log.push(`run:${String(state.proxy.n)}`);
      });
      mutate(() => delete state.proxy.n);
      mutate(() => (state.proxy.n = 2));
    },
    expected: ['run:1', 'run:undefined', 'run:2'],
  },
  {
    id: 'state-adding-a-key-notifies-a-reader-of-the-parent-object',
    src: 'solid:store#nested-update',
    run: (log) => {
      const { state, mutate } = open<{ user: { name: string; age?: number } }>({ user: { name: 'a' } });

      watch(() => {
        log.push(`run:${JSON.stringify(state.proxy.user)}`);
      });
      mutate(() => (state.proxy.user.age = 1));
    },
    expected: ['run:{"name":"a"}', 'run:{"name":"a","age":1}'],
  },

  // ── granularity: what is NOT tracked ────────────────────────────────────────
  {
    id: 'state-object-keys-does-not-subscribe',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, number>>({ a: 1 });

      watch(() => {
        log.push(`keys:${Object.keys(state.proxy).join(',')}`);
      });
      mutate(() => (state.proxy.z = 1));
      log.push(`now:${Object.keys(state.proxy).join(',')}`);
    },
    expected: ['keys:a', 'now:a,z'],
  },
  {
    id: 'state-the-in-operator-does-not-subscribe',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<{ a?: number }>({});

      watch(() => {
        log.push(`has:${'a' in state.proxy}`);
      });
      mutate(() => (state.proxy.a = 1));
      log.push(`now:${'a' in state.proxy}`);
    },
    expected: ['has:false', 'now:true'],
  },
  {
    id: 'state-a-new-key-does-not-re-run-a-json-stringify-watcher',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<Record<string, number>>({ a: 1 });

      watch(() => {
        log.push(`json:${JSON.stringify(state.proxy)}`);
      });
      mutate(() => (state.proxy.z = 1));
      log.push(`now:${JSON.stringify(state.snapshot())}`);
    },
    expected: ['json:{"a":1}', 'now:{"a":1,"z":1}'],
  },
  {
    id: 'state-a-deep-write-re-runs-a-json-stringify-watcher',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ user: { name: 'a' } });

      watch(() => {
        log.push(`json:${JSON.stringify(state.proxy)}`);
      });
      mutate(() => (state.proxy.user.name = 'b'));
    },
    expected: ['json:{"user":{"name":"a"}}', 'json:{"user":{"name":"b"}}'],
  },
  {
    id: 'state-snapshot-reads-are-transient-and-never-subscribe',
    src: 'zustand:basic#transient-updates',
    run: (log) => {
      const { state, mutate } = open({ n: 1 });

      watch(() => {
        log.push(`snap:${state.snapshot().n}`);
      });
      mutate(() => (state.proxy.n = 2));
      log.push(`live:${state.snapshot().n}`);
    },
    expected: ['snap:1', 'live:2'],
  },

  // ── nested cousins share their ancestors ────────────────────────────────────
  {
    id: 'state-a-deep-read-subscribes-to-every-ancestor-it-walked',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ list: [{ n: 1 }, { n: 2 }] });

      watch(() => {
        log.push(`second:${state.proxy.list[1]!.n}`);
      });
      mutate(() => (state.proxy.list[0]!.n = 9));
    },
    expected: ['second:2', 'second:2'],
  },
  {
    id: 'state-root-level-siblings-stay-isolated-even-when-nested-cousins-are-not',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ left: { n: 1 }, right: { n: 2 } });

      watch(() => {
        log.push(`right:${state.proxy.right.n}`);
      });
      mutate(() => (state.proxy.left.n = 9));
      log.push('done');
    },
    expected: ['right:2', 'done'],
  },
  {
    id: 'state-replacing-an-array-element-notifies-a-reader-inside-it',
    src: 'solid:store#array-element-replacement',
    run: (log) => {
      const { state, mutate } = open({ list: [{ n: 1 }] });

      watch(() => {
        log.push(`n:${state.proxy.list[0]!.n}`);
      });
      mutate(() => (state.proxy.list[0] = { n: 5 }));
    },
    expected: ['n:1', 'n:5'],
  },

  // ── arrays are coarse: a mutator bumps the whole array subtree ──────────────
  {
    id: 'state-push-notifies-a-watcher-of-an-existing-element',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ items: [1] });

      watch(() => {
        log.push(`first:${state.proxy.items[0]}`);
      });
      mutate(() => state.proxy.items.push(2));
    },
    expected: ['first:1', 'first:1'],
  },
  {
    id: 'state-a-direct-index-write-notifies-a-sibling-element-reader',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ items: [1, 2] });

      watch(() => {
        log.push(`first:${state.proxy.items[0]}`);
      });
      mutate(() => (state.proxy.items[1] = 9));
    },
    expected: ['first:1', 'first:1'],
  },
  {
    id: 'state-shift-reindexes-what-an-element-watcher-sees',
    src: 'vue:reactiveArray#shift',
    run: (log) => {
      const { state, mutate } = open({ items: ['a', 'b'] });

      watch(() => {
        log.push(`first:${state.proxy.items[0]}`);
      });
      mutate(() => state.proxy.items.shift());
    },
    expected: ['first:a', 'first:b'],
  },
  {
    id: 'state-pop-notifies-a-length-watcher',
    src: 'vue:reactiveArray#pop-should-trigger-length',
    run: (log) => {
      const { state, mutate } = open({ items: [1, 2] });

      watch(() => {
        log.push(`length:${state.proxy.items.length}`);
      });
      mutate(() => state.proxy.items.pop());
    },
    expected: ['length:2', 'length:1'],
  },
  {
    id: 'state-splice-notifies-a-watcher-of-an-element-past-the-cut',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ items: ['a', 'b', 'c'] });

      watch(() => {
        log.push(`third:${String(state.proxy.items[2])}`);
      });
      mutate(() => state.proxy.items.splice(0, 1));
    },
    expected: ['third:c', 'third:undefined'],
  },
  {
    id: 'state-length-truncation-shows-a-removed-element-as-undefined',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ items: [1, 2, 3] });

      watch(() => {
        log.push(`last:${String(state.proxy.items[2])}`);
      });
      mutate(() => (state.proxy.items.length = 1));
    },
    expected: ['last:3', 'last:undefined'],
  },
  {
    id: 'state-sort-notifies-an-element-watcher-with-the-reordered-value',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ items: [3, 1, 2] });

      watch(() => {
        log.push(`first:${state.proxy.items[0]}`);
      });
      mutate(() => state.proxy.items.sort((a, b) => a - b));
    },
    expected: ['first:3', 'first:1'],
  },
  {
    id: 'state-an-element-write-notifies-a-length-watcher-even-though-length-kept-its-value',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ items: [1] });

      watch(() => {
        log.push(`length:${state.proxy.items.length}`);
      });
      mutate(() => (state.proxy.items[0] = 9));
    },
    expected: ['length:1', 'length:1'],
  },
  {
    id: 'state-writes-inside-a-nested-array-notify-through-both-levels',
    src: 'solid:store#nested-arrays',
    run: (log) => {
      const { state, mutate } = open({ grid: [[1, 2], [3, 4]] });

      watch(() => {
        log.push(`cell:${state.proxy.grid[0]![0]}`);
      });
      mutate(() => (state.proxy.grid[0]![0] = 9));
      log.push(JSON.stringify(state.snapshot().grid));
    },
    expected: ['cell:1', 'cell:9', '[[9,2],[3,4]]'],
  },

  // ── overwriting across shapes ───────────────────────────────────────────────
  {
    id: 'state-an-object-written-over-a-scalar-notifies-the-scalar-watcher',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<{ n: unknown }>({ n: 1 });

      watch(() => {
        log.push(`n:${JSON.stringify(state.proxy.n)}`);
      });
      mutate(() => (state.proxy.n = { deep: 2 }));
    },
    expected: ['n:1', 'n:{"deep":2}'],
  },
  {
    id: 'state-a-scalar-written-over-an-object-shows-its-old-children-as-gone',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open<{ user: { name: string } | null }>({ user: { name: 'a' } });

      watch(() => {
        log.push(`name:${String(state.proxy.user?.name)}`);
      });
      mutate(() => (state.proxy.user = null));
    },
    expected: ['name:a', 'name:undefined'],
  },

  // ── watcher lifecycle and instance isolation ────────────────────────────────
  {
    id: 'state-a-disposed-watcher-is-not-notified',
    src: 'janux',
    run: (log) => {
      const { state, mutate } = open({ n: 1 });
      const stop = watch(() => {
        log.push(`run:${state.proxy.n}`);
      });

      mutate(() => (state.proxy.n = 2));
      stop();
      mutate(() => (state.proxy.n = 3));
      log.push(`final:${state.snapshot().n}`);
    },
    expected: ['run:1', 'run:2', 'final:3'],
  },
  {
    id: 'state-disposing-one-watcher-keeps-its-twin-subscribed',
    src: 'zustand:basic#unsubscribe-one-of-many',
    run: (log) => {
      const { state, mutate } = open({ n: 1 });
      const stop = watch(() => {
        log.push(`one:${state.proxy.n}`);
      });

      watch(() => {
        log.push(`two:${state.proxy.n}`);
      });
      stop();
      mutate(() => (state.proxy.n = 2));
    },
    expected: ['one:1', 'two:1', 'two:2'],
  },
  {
    id: 'state-two-instances-with-the-same-shape-do-not-share-notifications',
    src: 'zustand:store#two-stores',
    run: (log) => {
      const first = open({ n: 1 });
      const second = open({ n: 1 });

      watch(() => {
        log.push(`second:${second.state.proxy.n}`);
      });
      first.mutate(() => (first.state.proxy.n = 9));
      log.push(`first:${first.state.snapshot().n}`);
    },
    expected: ['second:1', 'first:9'],
  },
  {
    id: 'state-the-initial-object-is-detached-at-creation',
    src: 'janux',
    run: (log) => {
      const initial = { n: 1 };
      const { state } = open(initial);

      watch(() => {
        log.push(`run:${state.proxy.n}`);
      });
      initial.n = 99;
      log.push(`state:${state.snapshot().n}`, `source:${initial.n}`);
    },
    expected: ['run:1', 'state:1', 'source:99'],
  },
  {
    id: 'state-a-conditional-read-re-tracks-its-dependencies-every-run',
    src: 'vue:effect#conditional-branches',
    run: (log) => {
      const { state, mutate } = open({ flag: true, a: 1, b: 1 });

      watch(() => {
        log.push(`run:${state.proxy.flag ? `a${state.proxy.a}` : `b${state.proxy.b}`}`);
      });
      mutate(() => (state.proxy.flag = false));
      mutate(() => (state.proxy.a = 5));
      mutate(() => (state.proxy.b = 6));
    },
    expected: ['run:a1', 'run:b1', 'run:b6'],
  },
];
