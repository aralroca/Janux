import { batch, computed, createRoot, getOwner, onCleanup, runWithOwner, signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Janux's reactivity is synchronous: nothing is deferred to a microtask, so an
 * `await` is a hole in the reactive context. These cases pin what survives it
 * (values, subscriptions made before it) and what does not (tracking, owner,
 * an open batch).
 */
export const ASYNC_TIMING_CASES: ScenarioCase[] = [
  {
    id: 'rx-as-a-write-after-an-await-notifies-synchronously',
    src: 'janux',
    run: async (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      await Promise.resolve();
      count.value = 1;
      log.push('after-write');
    },
    expected: ['run:0', 'run:1', 'after-write'],
  },
  {
    id: 'rx-as-a-write-inside-a-then-callback-lands-before-the-await-resumes',
    src: 'janux',
    run: async (log) => {
      const status = signal('loading');

      watch(() => { log.push(`render:${status.value}`); });
      await Promise.resolve().then(() => {
        status.value = 'done';
      });
      log.push('awaited');
    },
    expected: ['render:loading', 'render:done', 'awaited'],
  },
  {
    id: 'rx-as-a-batch-does-not-survive-an-await-inside-its-body',
    src: 'janux',
    run: async (log) => {
      const count = signal(0);

      watch(() => { log.push(`run:${count.value}`); });
      await batch(async () => {
        count.value = 1;
        await Promise.resolve();
        count.value = 2;
      });
      log.push('done');
    },
    expected: ['run:0', 'run:1', 'run:2', 'done'],
  },
  {
    id: 'rx-as-concurrent-microtask-writes-each-flush-separately',
    src: 'janux',
    run: async (log) => {
      const count = signal(0);
      let runs = 0;

      watch(() => {
        count.value;
        runs++;
      });
      await Promise.all([
        Promise.resolve().then(() => {
          count.value = 1;
        }),
        Promise.resolve().then(() => {
          count.value = 2;
        }),
      ]);
      log.push(`runs:${runs}`, `value:${count.peek()}`);
    },
    expected: ['runs:3', 'value:2'],
  },
  {
    id: 'rx-as-the-owner-is-gone-after-an-await-inside-a-root-body',
    src: 'janux',
    run: async (log) => {
      await createRoot(async (dispose) => {
        log.push(`before:${getOwner() !== null}`);
        await Promise.resolve();
        log.push(`after:${getOwner() !== null}`);
        dispose();
      });
    },
    expected: ['before:true', 'after:false'],
  },
  {
    id: 'rx-as-run-with-owner-restores-a-scope-after-an-await-for-cleanups',
    src: 'janux',
    run: async (log) => {
      let owner: ReturnType<typeof getOwner> = null;
      let dispose = () => {};

      createRoot((disposeRoot) => {
        owner = getOwner();
        dispose = disposeRoot;
      });
      await Promise.resolve();
      runWithOwner(owner, () => onCleanup(() => log.push('late-cleanup')));
      dispose();
    },
    expected: ['late-cleanup'],
  },
  {
    id: 'rx-as-a-cleanup-deferred-to-a-microtask-runs-after-the-flush',
    src: 'janux',
    run: async (log) => {
      const trigger = signal(0);
      const deferred = signal(0);

      watch(() => { log.push(`deferred:${deferred.value}`); });
      watch(() => {
        trigger.value;

        return () => {
          queueMicrotask(() => {
            deferred.value = deferred.peek() + 1;
          });
        };
      });
      trigger.value = 1;
      log.push('flush-done');
      await Promise.resolve();
      await Promise.resolve();
      log.push('end');
    },
    expected: ['deferred:0', 'flush-done', 'deferred:1', 'end'],
  },
  {
    id: 'rx-as-an-async-fetch-pattern-renders-loading-then-data',
    src: 'janux',
    run: async (log) => {
      const data = signal<string | null>(null);
      const view = computed(() => data.value ?? 'loading');

      watch(() => { log.push(`view:${view.value}`); });
      data.value = await Promise.resolve('payload');
    },
    expected: ['view:loading', 'view:payload'],
  },
  {
    id: 'rx-as-a-stale-async-result-is-guarded-by-a-generation-signal',
    src: 'janux',
    run: async (log) => {
      const query = signal('a');
      const result = signal('');
      const load = async (term: string) => {
        const issued = term;

        await Promise.resolve();
        if (query.peek() === issued) result.value = `${issued}-result`;
      };

      watch(() => { log.push(`result:${result.value}`); });
      const first = load('a');

      query.value = 'b';
      const second = load('b');

      await Promise.all([first, second]);
      log.push(`final:${result.peek()}`);
    },
    expected: ['result:', 'result:b-result', 'final:b-result'],
  },
  {
    id: 'rx-as-writes-from-a-timer-callback-notify-like-any-other-write',
    src: 'janux',
    run: async (log) => {
      const tick = signal(0);

      watch(() => { log.push(`tick:${tick.value}`); });
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          tick.value = 1;
          resolve();
        }, 0);
      });
      log.push('timer-done');
    },
    expected: ['tick:0', 'tick:1', 'timer-done'],
  },
  {
    id: 'rx-as-an-effect-disposed-before-its-async-work-lands-must-be-checked-by-the-caller',
    src: 'janux',
    run: async (log) => {
      const data = signal('idle');
      let disposed = false;
      const dispose = watch(() => { log.push(`render:${data.value}`); });
      const load = async () => {
        await Promise.resolve();
        if (!disposed) data.value = 'loaded';
      };
      const pending = load();

      dispose();
      disposed = true;
      await pending;
      log.push(`value:${data.peek()}`);
    },
    expected: ['render:idle', 'value:idle'],
  },
  {
    id: 'rx-as-an-await-between-two-writes-produces-two-flushes-not-one',
    src: 'janux',
    run: async (log) => {
      const a = signal(0);
      const b = signal(0);

      watch(() => { log.push(`run:${a.value}:${b.value}`); });
      a.value = 1;
      await Promise.resolve();
      b.value = 1;
    },
    expected: ['run:0:0', 'run:1:0', 'run:1:1'],
  },
  {
    id: 'rx-as-a-cleanup-that-aborts-in-flight-work-runs-before-the-next-body',
    src: 'janux',
    run: async (log) => {
      const query = signal('a');
      let aborted = 0;

      watch(() => {
        query.value;

        return () => {
          aborted++;
        };
      });
      await Promise.resolve();
      query.value = 'b';
      query.value = 'c';
      log.push(`aborted:${aborted}`);
    },
    expected: ['aborted:2'],
  },
  {
    id: 'rx-as-a-derived-value-read-after-an-await-is-already-settled',
    src: 'janux',
    run: async (log) => {
      const count = signal(1);
      const doubled = computed(() => count.value * 2);

      count.value = 5;
      await Promise.resolve();
      log.push(`value:${doubled.value}`);
    },
    expected: ['value:10'],
  },
  {
    id: 'rx-as-an-effect-created-after-an-await-still-runs-eagerly',
    src: 'janux',
    run: async (log) => {
      const count = signal(3);

      await Promise.resolve();
      watch(() => { log.push(`run:${count.value}`); });
      log.push('created');
    },
    expected: ['run:3', 'created'],
  },
  {
    id: 'rx-as-a-root-disposed-in-a-microtask-stops-effects-created-before-the-await',
    src: 'janux',
    run: async (log) => {
      const count = signal(0);
      let dispose = () => {};

      createRoot((disposeRoot) => {
        dispose = disposeRoot;
        watch(() => { log.push(`run:${count.value}`); });
      });
      await Promise.resolve().then(() => dispose());
      count.value = 1;
      log.push('silent');
    },
    expected: ['run:0', 'silent'],
  },
];
