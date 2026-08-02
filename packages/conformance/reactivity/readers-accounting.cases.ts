import { batch, computed, createRoot, signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * `readers()` is the reclamation signal owners rely on (documented), so its
 * count must move in lockstep with every subscribe/unsubscribe path — and
 * calling it must never itself create a subscription.
 */
export const READERS_ACCOUNTING_CASES: ScenarioCase[] = [
  {
    id: 'rx-rd-calling-readers-is-not-a-tracked-read',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`seen:${count.readers()}`); });
      count.value = 1;
      log.push('done');
    },
    expected: ['seen:0', 'done'],
  },
  {
    id: 'rx-rd-an-effect-sees-itself-subscribed-during-its-own-run',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        count.value;
        log.push(`readers:${count.readers()}`);
      });
      count.value = 1;
    },
    expected: ['readers:1', 'readers:1'],
  },
  {
    id: 'rx-rd-three-watchers-count-three',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        count.value;
      });
      watch(() => {
        count.value;
      });
      watch(() => {
        count.value;
      });
      log.push(`readers:${count.readers()}`);
    },
    expected: ['readers:3'],
  },
  {
    id: 'rx-rd-disposals-decrement-one-at-a-time',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const first = watch(() => {
        count.value;
      });
      const second = watch(() => {
        count.value;
      });

      log.push(String(count.readers()));
      first();
      log.push(String(count.readers()));
      second();
      log.push(String(count.readers()));
    },
    expected: ['2', '1', '0'],
  },
  {
    id: 'rx-rd-computeds-and-effects-count-together',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      computed(() => count.value);
      computed(() => count.value * 2);
      watch(() => {
        count.value;
      });
      log.push(`readers:${count.readers()}`);
    },
    expected: ['readers:3'],
  },
  {
    id: 'rx-rd-root-dispose-releases-every-owned-subscription',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      createRoot((dispose) => {
        watch(() => {
          count.value;
        });
        computed(() => count.value);
        log.push(`live:${count.readers()}`);
        dispose();
      });
      log.push(`after:${count.readers()}`);
    },
    expected: ['live:2', 'after:0'],
  },
  {
    id: 'rx-rd-a-queued-effect-stays-subscribed-mid-batch',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        count.value;
      });
      batch(() => {
        count.value = 1;
        log.push(`mid:${count.readers()}`);
      });
    },
    expected: ['mid:1'],
  },
  {
    id: 'rx-rd-disposing-mid-batch-releases-before-the-flush',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => {
        count.value;
      });

      batch(() => {
        count.value = 1;
        dispose();
        log.push(`mid:${count.readers()}`);
      });
    },
    expected: ['mid:0'],
  },
  {
    id: 'rx-rd-reading-a-disposed-computed-does-not-resubscribe-its-source',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);

      double.dispose();
      double.value;
      double.peek();
      log.push(`readers:${count.readers()}`);
    },
    expected: ['readers:0'],
  },
  {
    id: 'rx-rd-watcher-count-on-a-computed-does-not-inflate-source-readers',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const double = computed(() => count.value * 2);
      const first = watch(() => {
        double.value;
      });
      const second = watch(() => {
        double.value;
      });

      log.push(`with-watchers:${count.readers()}`);
      first();
      second();
      log.push(`without-watchers:${count.readers()}`);
      double.dispose();
      log.push(`disposed:${count.readers()}`);
    },
    expected: ['with-watchers:1', 'without-watchers:1', 'disposed:0'],
  },
  {
    id: 'rx-rd-a-never-read-signal-stays-at-zero-through-writes',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      count.value = 1;
      count.value = 2;
      log.push(`readers:${count.readers()}`);
    },
    expected: ['readers:0'],
  },
  {
    id: 'rx-rd-recreating-a-watcher-restores-the-count',
    src: 'janux',
    run: (log) => {
      const count = signal(0);
      const dispose = watch(() => {
        count.value;
      });

      dispose();
      log.push(`gone:${count.readers()}`);
      watch(() => {
        count.value;
      });
      log.push(`back:${count.readers()}`);
    },
    expected: ['gone:0', 'back:1'],
  },
  {
    id: 'rx-rd-two-computeds-dispose-one-leaves-the-other-counted',
    src: 'janux',
    run: (log) => {
      const count = signal(1);
      const first = computed(() => count.value + 1);

      computed(() => count.value + 2);
      first.dispose();
      log.push(`readers:${count.readers()}`);
    },
    expected: ['readers:1'],
  },
  {
    id: 'rx-rd-a-conditional-computed-source-swap-moves-the-count',
    src: 'janux',
    run: (log) => {
      const gate = signal(true);
      const a = signal(1);
      const b = signal(2);

      computed(() => (gate.value ? a.value : b.value));
      log.push(`a:${a.readers()},b:${b.readers()}`);
      gate.value = false;
      log.push(`a:${a.readers()},b:${b.readers()}`);
    },
    expected: ['a:1,b:0', 'a:0,b:1'],
  },
  {
    id: 'rx-rd-a-throwing-first-run-still-counts-the-deps-it-reached',
    src: 'janux',
    run: (log) => {
      const before = signal(0);
      const after = signal(0);

      try {
        watch(() => {
          before.value;
          throw new Error('boom');
        });
      } catch {
        log.push('caught');
      }
      log.push(`before:${before.readers()}`, `after:${after.readers()}`);
    },
    expected: ['caught', 'before:1', 'after:0'],
  },
  {
    id: 'rx-rd-an-effect-reading-a-signal-only-through-a-computed-adds-no-direct-reader',
    src: 'janux',
    run: (log) => {
      const source = signal(1);
      const derived = computed(() => source.value * 2);

      watch(() => {
        derived.value;
      });
      watch(() => {
        derived.value;
      });
      log.push(`source-readers:${source.readers()}`);
    },
    expected: ['source-readers:1'],
  },
  {
    id: 'rx-rd-the-count-drops-mid-run-while-the-effect-is-rebuilding-its-deps',
    src: 'janux',
    run: (log) => {
      const gate = signal(true);
      const inner = signal(0);

      watch(() => {
        if (gate.value) {
          inner.value;
          log.push(`during-on:${inner.readers()}`);
        } else log.push(`during-off:${inner.readers()}`);
      });
      gate.value = false;
    },
    expected: ['during-on:1', 'during-off:0'],
  },
  {
    id: 'rx-rd-nested-effects-each-add-their-own-reader-to-a-shared-signal',
    src: 'janux',
    run: (log) => {
      const shared = signal(0);

      watch(() => {
        shared.value;
        watch(() => {
          shared.value;
        });
      });
      log.push(`readers:${shared.readers()}`);
    },
    expected: ['readers:2'],
  },
];
