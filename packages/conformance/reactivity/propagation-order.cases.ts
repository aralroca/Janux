import { computed, signal, watch } from 'janux';
import type { ScenarioCase } from '../support/scenario';

/**
 * WHO runs WHEN on a write: computeds always settle before effects, effects
 * follow subscription order (which is re-subscription order, not creation
 * order, once dependency sets shift), and cascades append to the end of the
 * live queue.
 */
export const PROPAGATION_ORDER_CASES: ScenarioCase[] = [
  {
    id: 'rx-or-three-effects-notify-in-creation-order',
    src: 'vue:effect#registration-order',
    run: (log) => {
      const count = signal(0);

      watch(() => { log.push(`a:${count.value}`); });
      watch(() => { log.push(`b:${count.value}`); });
      watch(() => { log.push(`c:${count.value}`); });
      count.value = 1;
    },
    expected: ['a:0', 'b:0', 'c:0', 'a:1', 'b:1', 'c:1'],
  },
  {
    id: 'rx-or-computeds-settle-before-effects-even-when-created-after-them',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        count.value;
        log.push('effect');
      });
      computed(() => {
        log.push('compute');

        return count.value;
      });
      count.value = 1;
    },
    expected: ['effect', 'compute', 'compute', 'effect'],
  },
  {
    id: 'rx-or-sibling-computeds-recompute-in-creation-order',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      computed(() => {
        log.push(`first:${count.value}`);

        return count.value;
      });
      computed(() => {
        log.push(`second:${count.value}`);

        return count.value;
      });
      count.value = 1;
    },
    expected: ['first:0', 'second:0', 'first:1', 'second:1'],
  },
  {
    id: 'rx-or-notification-order-follows-resubscription-not-creation',
    src: 'janux',
    run: (log) => {
      const shared = signal(0);
      const nudge = signal(0);

      watch(() => {
        log.push(`a:${shared.value}`);
        nudge.value;
      });
      watch(() => { log.push(`b:${shared.value}`); });
      // Re-runs only the first effect, which re-subscribes to `shared` at the
      // END of its subscriber list — subsequent notifications flip the order.
      nudge.value = 1;
      log.push('---');
      shared.value = 1;
    },
    expected: ['a:0', 'b:0', 'a:0', '---', 'b:1', 'a:1'],
  },
  {
    id: 'rx-or-cascaded-effects-append-to-the-end-of-the-running-queue',
    src: 'janux',
    run: (log) => {
      const source = signal(0);
      const relay = signal(0);

      watch(() => {
        log.push(`writer:${source.value}`);
        if (source.value === 1) relay.value = 1;
      });
      watch(() => { log.push(`sibling:${source.value}`); });
      watch(() => { log.push(`relayed:${relay.value}`); });
      source.value = 1;
    },
    expected: [
      'writer:0',
      'sibling:0',
      'relayed:0',
      'writer:1',
      'sibling:1',
      'relayed:1',
    ],
  },
  {
    id: 'rx-or-diamond-branches-recompute-in-creation-order',
    src: 'janux',
    run: (log) => {
      const base = signal(0);
      const left = computed(() => {
        log.push('left');

        return base.value + 1;
      });
      const right = computed(() => {
        log.push('right');

        return base.value + 2;
      });

      watch(() => {
        left.value;
        right.value;
        log.push('tip');
      });
      base.value = 1;
    },
    expected: ['left', 'right', 'tip', 'left', 'right', 'tip'],
  },
  {
    id: 'rx-or-a-computed-queued-by-a-cascade-settles-before-the-next-effect',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const relay = signal(0);
      const derived = computed(() => {
        log.push('compute');

        return relay.value * 2;
      });

      watch(() => {
        if (trigger.value === 1) relay.value = 1;
      });
      watch(() => { log.push(`reader:${derived.value}`); });
      trigger.value = 1;
    },
    expected: ['compute', 'reader:0', 'compute', 'reader:2'],
  },
  {
    id: 'rx-or-first-runs-are-interleaved-with-creation-not-queued',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      log.push('one');
      watch(() => { log.push(`ea:${count.value}`); });
      log.push('two');
      watch(() => { log.push(`eb:${count.value}`); });
      log.push('three');
    },
    expected: ['one', 'ea:0', 'two', 'eb:0', 'three'],
  },
  {
    id: 'rx-or-a-partial-rerun-does-not-reorder-untouched-subscribers',
    src: 'janux',
    run: (log) => {
      const shared = signal(0);
      const only = signal(0);

      watch(() => { log.push(`a:${shared.value}:${only.value}`); });
      watch(() => { log.push(`b:${shared.value}`); });
      // Both re-run on `shared`, both re-subscribe in the same relative order:
      // repeated writes keep a stable a-then-b order.
      shared.value = 1;
      shared.value = 2;
    },
    expected: ['a:0:0', 'b:0', 'a:1:0', 'b:1', 'a:2:0', 'b:2'],
  },
  {
    id: 'rx-or-chain-levels-settle-upstream-first',
    src: 'janux',
    run: (log) => {
      const base = signal(0);
      const l1 = computed(() => {
        log.push('l1');

        return base.value + 1;
      });

      computed(() => {
        log.push('l2');

        return l1.value + 1;
      });
      base.value = 1;
    },
    expected: ['l1', 'l2', 'l1', 'l2'],
  },
  {
    id: 'rx-or-a-computed-created-mid-flush-recomputes-before-the-remaining-effects',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const source = signal(0);

      watch(() => {
        if (trigger.value === 1) {
          computed(() => {
            log.push(`computed:${source.value}`);

            return source.value;
          });
        }
      });
      watch(() => { log.push(`effect:${source.value}`); });
      trigger.value = 1;
      source.value = 2;
    },
    expected: ['effect:0', 'computed:0', 'computed:2', 'effect:2'],
  },
  {
    id: 'rx-or-a-cleanup-runs-inside-its-effects-slot-not-ahead-of-the-queue',
    src: 'janux',
    run: (log) => {
      const count = signal(0);

      watch(() => {
        count.value;

        return () => log.push('cleanup-a');
      });
      watch(() => { log.push(`b:${count.value}`); });
      count.value = 1;
    },
    expected: ['b:0', 'cleanup-a', 'b:1'],
  },
  {
    id: 'rx-or-effects-subscribed-to-different-signals-run-in-write-order-not-creation-order',
    src: 'janux',
    run: (log) => {
      const first = signal(0);
      const second = signal(0);

      watch(() => { log.push(`ea:${first.value}`); });
      watch(() => { log.push(`eb:${second.value}`); });
      second.value = 1;
      first.value = 1;
    },
    expected: ['ea:0', 'eb:0', 'eb:1', 'ea:1'],
  },
  {
    id: 'rx-or-a-computed-and-an-effect-on-the-same-cascade-keep-their-relative-order',
    src: 'janux',
    run: (log) => {
      const trigger = signal(0);
      const relay = signal(0);

      computed(() => {
        log.push(`computed:${relay.value}`);

        return relay.value;
      });
      watch(() => { log.push(`effect:${relay.value}`); });
      watch(() => {
        if (trigger.value === 1) relay.value = 1;
      });
      trigger.value = 1;
    },
    expected: ['computed:0', 'effect:0', 'computed:1', 'effect:1'],
  },
];
