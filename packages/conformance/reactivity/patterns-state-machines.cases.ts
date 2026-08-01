import { batch, computed, signal, untrack, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * Patterns island code keeps re-inventing, each pinned as a behavior: derived
 * state machines, dirty tracking, undo stacks, counters, guards and toggles.
 * The lesson in each is which write is observable and which is bookkeeping.
 */
export const STATE_MACHINE_PATTERN_CASES: ScenarioCase[] = [
  {
    id: 'rx-sm-a-derived-status-machine-notifies-once-per-transition',
    src: 'janux',
    run: (log) => {
      const loading = signal(true);
      const error = signal<string | null>(null);
      const status = computed(() => {
        if (loading.value) return 'loading';

        return error.value === null ? 'ready' : 'error';
      });

      watch(() => { log.push(`status:${status.value}`); });
      error.value = 'ignored-while-loading';
      loading.value = false;
      error.value = 'boom';
    },
    expected: ['status:loading', 'status:error'],
  },
  {
    id: 'rx-sm-a-guarded-transition-refuses-invalid-moves',
    src: 'janux',
    run: (log) => {
      const state = signal<'idle' | 'running' | 'done'>('idle');
      const allowed: Record<string, string[]> = {
        idle: ['running'],
        running: ['done'],
        done: [],
      };
      const go = (next: 'idle' | 'running' | 'done') => {
        if (allowed[state.peek()]!.includes(next)) state.value = next;
      };

      watch(() => { log.push(`state:${state.value}`); });
      go('done');
      go('running');
      go('done');
      go('idle');
    },
    expected: ['state:idle', 'state:running', 'state:done'],
  },
  {
    id: 'rx-sm-dirty-tracking-compares-current-against-a-pristine-snapshot',
    src: 'janux',
    run: (log) => {
      const pristine = signal('ada');
      const current = signal('ada');
      const dirty = computed(() => current.value !== pristine.value);

      watch(() => { log.push(`dirty:${dirty.value}`); });
      current.value = 'grace';
      current.value = 'ada';
      pristine.value = 'grace';
    },
    expected: ['dirty:false', 'dirty:true', 'dirty:false', 'dirty:true'],
  },
  {
    id: 'rx-sm-an-undo-stack-grows-without-subscribing-to-itself',
    src: 'janux',
    run: (log) => {
      const value = signal('a');
      const history = signal<string[]>([]);

      watch(() => {
        const current = value.value;

        untrack(() => {
          history.value = [...history.peek(), current];
        });
      });
      value.value = 'b';
      value.value = 'c';
      log.push(`history:${history.peek().join(',')}`);
    },
    expected: ['history:a,b,c'],
  },
  {
    id: 'rx-sm-an-undo-step-restores-the-previous-value-and-renotifies',
    src: 'janux',
    run: (log) => {
      const value = signal('a');
      const stack: string[] = [];
      const set = (next: string) => {
        stack.push(value.peek());
        value.value = next;
      };
      const undo = () => {
        const previous = stack.pop();

        if (previous !== undefined) value.value = previous;
      };

      watch(() => { log.push(`value:${value.value}`); });
      set('b');
      set('c');
      undo();
      undo();
    },
    expected: ['value:a', 'value:b', 'value:c', 'value:b', 'value:a'],
  },
  {
    id: 'rx-sm-a-toggle-derived-from-a-counter-parity-halves-the-renders',
    src: 'janux',
    run: (log) => {
      const clicks = signal(0);
      const open = computed(() => clicks.value % 2 === 1);

      watch(() => { log.push(`open:${open.value}`); });
      for (let i = 1; i <= 4; i++) clicks.value = i;
    },
    expected: ['open:false', 'open:true', 'open:false', 'open:true', 'open:false'],
  },
  {
    id: 'rx-sm-a-request-counter-tracks-only-the-latest-generation',
    src: 'janux',
    run: (log) => {
      const generation = signal(0);
      const results = signal<string[]>([]);
      const respond = (issued: number, payload: string) => {
        if (generation.peek() === issued) results.value = [...results.peek(), payload];
      };

      watch(() => { log.push(`results:${results.value.join(',')}`); });
      generation.value = 1;
      respond(0, 'stale');
      respond(1, 'fresh');
    },
    expected: ['results:', 'results:fresh'],
  },
  {
    id: 'rx-sm-a-derived-progress-percentage-clamps-and-dedupes',
    src: 'janux',
    run: (log) => {
      const done = signal(0);
      const total = signal(4);
      const percent = computed(() => Math.round((Math.min(done.value, total.value) / total.value) * 100));

      watch(() => { log.push(`percent:${percent.value}`); });
      done.value = 2;
      done.value = 4;
      done.value = 8;
    },
    expected: ['percent:0', 'percent:50', 'percent:100'],
  },
  {
    id: 'rx-sm-a-two-field-validation-summary-batches-into-one-render',
    src: 'janux',
    run: (log) => {
      const email = signal('');
      const password = signal('');
      const errors = computed(() => {
        const found: string[] = [];

        if (!email.value.includes('@')) found.push('email');
        if (password.value.length < 8) found.push('password');

        return found.join(',');
      });

      watch(() => { log.push(`errors:[${errors.value}]`); });
      batch(() => {
        email.value = 'ada@example.com';
        password.value = 'supersecret';
      });
    },
    expected: ['errors:[email,password]', 'errors:[]'],
  },
  {
    id: 'rx-sm-a-derived-disabled-flag-combines-three-inputs-with-one-notification',
    src: 'janux',
    run: (log) => {
      const submitting = signal(false);
      const valid = signal(false);
      const online = signal(true);
      const disabled = computed(() => submitting.value || !valid.value || !online.value);

      watch(() => { log.push(`disabled:${disabled.value}`); });
      batch(() => {
        valid.value = true;
        online.value = true;
      });
      submitting.value = true;
    },
    expected: ['disabled:true', 'disabled:false', 'disabled:true'],
  },
  {
    id: 'rx-sm-a-manual-subscription-cache-invalidates-on-key-change',
    src: 'janux',
    run: (log) => {
      const key = signal('a');
      const cache = new Map<string, number>();
      const value = computed(() => {
        const current = key.value;

        if (!cache.has(current)) cache.set(current, cache.size + 1);

        return cache.get(current)!;
      });

      watch(() => { log.push(`value:${value.value}`); });
      key.value = 'b';
      key.value = 'a';
    },
    expected: ['value:1', 'value:2', 'value:1'],
  },
  {
    id: 'rx-sm-a-derived-diff-against-the-previous-run-uses-a-closure-not-a-signal',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      let previous: number | undefined;

      watch(() => {
        const current = count.value;

        log.push(`delta:${previous === undefined ? 'first' : current - previous}`);
        previous = current;
      });
      count.value = 4;
      count.value = 2;
    },
    expected: ['delta:first', 'delta:3', 'delta:-2'],
  },
];
