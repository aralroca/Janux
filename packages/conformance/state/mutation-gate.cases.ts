import { watch } from 'janux';
import { createReactiveState } from '../../janux/src/state/reactive-state';
import { createGate, withGate } from '../../janux/src/state/mutation-gate';
import { attempt, type ScenarioCase } from '../support/scenario';

/**
 * The mutation gate on its own: how it opens, how long it stays open, and how
 * it is scoped. The existing reactive-state cases prove writes are gated; these
 * prove the gate's lifetime — sync bodies, async bodies, nesting, overlap and
 * per-instance isolation, the places a global write-lock would get wrong.
 */

const ILLEGAL = (path: string): string =>
  `Janux: illegal mutation of "${path}" outside an intent, effect or event handler. ` +
  'State can only change inside declared run() bodies (RFC §4.4).';

export const GATE_CASES: ScenarioCase[] = [
  {
    id: 'state-gate-nested-bodies-keep-the-gate-open',
    src: 'janux',
    run: (log) => {
      const gate = createGate();
      const state = createReactiveState({ n: 0 }, gate);

      withGate(gate, () => {
        withGate(gate, () => (state.proxy.n = 1));
        state.proxy.n = 2;
      });
      log.push(`n:${state.snapshot().n}`);
    },
    expected: ['n:2'],
  },
  {
    id: 'state-gate-stays-open-across-an-await',
    src: 'janux',
    run: async (log) => {
      const gate = createGate();
      const state = createReactiveState({ n: 0 }, gate);

      await withGate(gate, async () => {
        state.proxy.n = 1;
        await Promise.resolve();
        state.proxy.n = 2;
      });
      log.push(`n:${state.snapshot().n}`);
    },
    expected: ['n:2'],
  },
  {
    id: 'state-gate-closes-after-an-async-body-settles',
    src: 'janux',
    run: async (log) => {
      const gate = createGate();
      const state = createReactiveState({ n: 0 }, gate);

      await withGate(gate, async () => (state.proxy.n = 1));
      attempt(log, 'after', () => (state.proxy.n = 2));
    },
    expected: [`after:threw:${ILLEGAL('n')}`],
  },
  {
    id: 'state-gate-closes-after-an-async-body-rejects',
    src: 'janux',
    run: async (log) => {
      const gate = createGate();
      const state = createReactiveState({ n: 0 }, gate);

      await attempt(log, 'body', () =>
        withGate(gate, async () => {
          throw new Error('boom');
        }),
      );
      attempt(log, 'after', () => (state.proxy.n = 1));
    },
    expected: ['body:threw:boom', `after:threw:${ILLEGAL('n')}`],
  },
  {
    id: 'state-two-overlapping-async-bodies-both-write-then-the-gate-closes',
    src: 'janux',
    run: async (log) => {
      const gate = createGate();
      const state = createReactiveState({ a: 0, b: 0 }, gate);
      const first = withGate(gate, async () => {
        await Promise.resolve();
        state.proxy.a = 1;
      });
      const second = withGate(gate, async () => {
        await Promise.resolve();
        state.proxy.b = 2;
      });

      await Promise.all([first, second]);
      attempt(log, 'after', () => (state.proxy.a = 9));
      log.push(`a:${state.snapshot().a}`, `b:${state.snapshot().b}`);
    },
    expected: [`after:threw:${ILLEGAL('a')}`, 'a:1', 'b:2'],
  },
  {
    id: 'state-the-gate-of-one-instance-does-not-open-another',
    src: 'zustand:store#instance-isolation',
    run: (log) => {
      const gate = createGate();
      const mine = createReactiveState({ n: 0 }, gate);
      const other = createReactiveState({ n: 0 });

      withGate(gate, () => {
        mine.proxy.n = 1;
        attempt(log, 'other', () => (other.proxy.n = 1));
      });
      log.push(`mine:${mine.snapshot().n}`, `other:${other.snapshot().n}`);
    },
    expected: [`other:threw:${ILLEGAL('n')}`, 'mine:1', 'other:0'],
  },
  {
    id: 'state-one-gate-shared-by-two-instances-opens-both',
    src: 'janux',
    run: (log) => {
      const gate = createGate();
      const first = createReactiveState({ n: 0 }, gate);
      const second = createReactiveState({ n: 0 }, gate);

      withGate(gate, () => {
        first.proxy.n = 1;
        second.proxy.n = 2;
      });
      log.push(`first:${first.snapshot().n}`, `second:${second.snapshot().n}`);
    },
    expected: ['first:1', 'second:2'],
  },
  {
    id: 'state-withgate-returns-the-body-result',
    src: 'janux',
    run: (log) => {
      const gate = createGate();
      const state = createReactiveState({ n: 0 }, gate);

      log.push(`result:${withGate(gate, () => (state.proxy.n = 41, state.proxy.n + 1))}`);
    },
    expected: ['result:42'],
  },
  {
    id: 'state-withgate-resolves-with-the-async-body-result',
    src: 'janux',
    run: async (log) => {
      const gate = createGate();

      log.push(`result:${await withGate(gate, async () => 'later')}`);
    },
    expected: ['result:later'],
  },
  {
    id: 'state-the-gate-reopens-for-a-second-body',
    src: 'janux',
    run: (log) => {
      const gate = createGate();
      const state = createReactiveState({ n: 0 }, gate);

      withGate(gate, () => (state.proxy.n = 1));
      attempt(log, 'between', () => (state.proxy.n = 9));
      withGate(gate, () => (state.proxy.n = 2));
      log.push(`n:${state.snapshot().n}`);
    },
    expected: [`between:threw:${ILLEGAL('n')}`, 'n:2'],
  },
  {
    id: 'state-a-caught-inner-throw-leaves-the-outer-body-writable',
    src: 'janux',
    run: (log) => {
      const gate = createGate();
      const state = createReactiveState({ n: 0 }, gate);

      withGate(gate, () => {
        attempt(log, 'inner', () =>
          withGate(gate, () => {
            throw new Error('boom');
          }),
        );
        state.proxy.n = 1;
      });
      log.push(`n:${state.snapshot().n}`);
    },
    expected: ['inner:threw:boom', 'n:1'],
  },
  {
    id: 'state-the-illegal-write-error-names-the-full-nested-path',
    src: 'janux',
    run: (log) => {
      const state = createReactiveState({ user: { name: 'a' } });

      attempt(log, 'write', () => (state.proxy.user.name = 'b'));
    },
    expected: [`write:threw:${ILLEGAL('user.name')}`],
  },
  {
    id: 'state-the-illegal-write-error-shows-a-dotted-key-as-written',
    src: 'janux',
    run: (log) => {
      const state = createReactiveState<Record<string, number>>({ 'a.b': 1 });

      attempt(log, 'write', () => (state.proxy['a.b'] = 2));
    },
    expected: [`write:threw:${ILLEGAL('a.b')}`],
  },
  {
    id: 'state-array-sort-outside-the-gate-throws',
    src: 'janux',
    run: (log) => {
      const state = createReactiveState({ items: [2, 1] });

      attempt(log, 'sort', () => state.proxy.items.sort((a, b) => a - b));
      log.push(JSON.stringify(state.snapshot().items));
    },
    expected: [`sort:threw:${ILLEGAL('items')}`, '[2,1]'],
  },
  {
    id: 'state-array-length-write-outside-the-gate-throws',
    src: 'janux',
    run: (log) => {
      const state = createReactiveState({ items: [1, 2, 3] });

      attempt(log, 'truncate', () => (state.proxy.items.length = 1));
      log.push(`length:${state.snapshot().items.length}`);
    },
    expected: [`truncate:threw:${ILLEGAL('items.length')}`, 'length:3'],
  },
  {
    id: 'state-a-rejected-array-mutation-leaves-the-array-untouched',
    src: 'janux',
    run: (log) => {
      const state = createReactiveState({ items: [1] });

      attempt(log, 'push', () => state.proxy.items.push(2));
      log.push(JSON.stringify(state.snapshot().items));
    },
    expected: [`push:threw:${ILLEGAL('items')}`, '[1]'],
  },
  {
    id: 'state-a-rejected-write-does-not-notify-watchers',
    src: 'janux',
    run: (log) => {
      const state = createReactiveState({ n: 1 });

      watch(() => {
        log.push(`run:${state.proxy.n}`);
      });
      attempt(log, 'write', () => (state.proxy.n = 2));
    },
    expected: ['run:1', `write:threw:${ILLEGAL('n')}`],
  },
  {
    id: 'state-a-watcher-body-is-not-a-gate',
    src: 'janux',
    run: (log) => {
      const state = createReactiveState({ n: 1 });

      attempt(log, 'watch', () =>
        watch(() => {
          state.proxy.n = state.proxy.n + 1;
        }),
      );
      log.push(`n:${state.snapshot().n}`);
    },
    expected: [`watch:threw:${ILLEGAL('n')}`, 'n:1'],
  },
  {
    id: 'state-reads-and-snapshots-never-need-the-gate',
    src: 'janux',
    run: (log) => {
      const state = createReactiveState({ user: { name: 'a' }, items: [1] });

      log.push(`name:${state.proxy.user.name}`, `item:${state.proxy.items[0]}`, `snap:${state.snapshot().user.name}`);
    },
    expected: ['name:a', 'item:1', 'snap:a'],
  },
  {
    id: 'state-a-detached-array-mutator-still-asserts-the-gate-when-called',
    src: 'janux',
    run: (log) => {
      const gate = createGate();
      const state = createReactiveState({ items: [1] }, gate);
      const push = state.proxy.items.push;

      attempt(log, 'closed', () => push(2));
      withGate(gate, () => push(3));
      log.push(JSON.stringify(state.snapshot().items));
    },
    expected: [`closed:threw:${ILLEGAL('items')}`, '[1,3]'],
  },
];
